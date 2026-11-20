"""Bridge to the team's extraction pipeline ("extraction process/" in the repo root).

Lets StadtManager run the pipeline from the website instead of the command line /
Streamlit: upload -> ingest_one() -> process_file() in the background -> list, read
the extracted text (incl. OCR for scans, Excel sheets), set title and category,
approve. It uses the pipeline's own code and its own .env (DATABASE_URL,
TESSERACT_CMD ...), so both stay in sync. Uploaded files are also sent to the
search service (search/), so they can be found there.
"""

import json
import logging
import os
import sys
import tempfile
import threading
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

# Site/ -> StadtManager/ -> Frontend/ -> repository root
PIPELINE_DIR = Path(os.environ.get(
    "EXTRACTION_DIR", Path(__file__).resolve().parents[3] / "extraction process"))
SEARCH_URL = os.environ.get("SEARCH_URL", "http://localhost:3000").rstrip("/")
CATEGORIES = ["unknown", "architectural", "technical", "administrative", "maintenance",
              "energy", "safety", "building_information", "sensor", "general"]
log = logging.getLogger("pipeline_bridge")

_mods = None
_load_lock = threading.Lock()


class NotConfigured(RuntimeError):
    pass


def _pipeline():
    """Import the pipeline lazily, so the map still works if it isn't set up."""
    global _mods
    with _load_lock:
        if _mods is None:
            if not (PIPELINE_DIR / "src" / "pipeline.py").is_file():
                raise NotConfigured(f"Extraction pipeline not found in {PIPELINE_DIR}")
            if str(PIPELINE_DIR) not in sys.path:
                sys.path.insert(0, str(PIPELINE_DIR))
            try:
                from sqlalchemy import text
                from config.settings import STORAGE_DIR, MAX_FILE_MB
                from src.database import SessionLocal
                from src.ingestion import ingest_one
                from src.pipeline import process_file
            except ModuleNotFoundError as e:  # pipeline packages not installed
                raise NotConfigured(
                    f"Python package '{e.name}' is missing. Install the pipeline packages: "
                    'pip install -r "extraction process/requirements.txt"') from None
            except RuntimeError as e:  # e.g. DATABASE_URL missing in its .env
                raise NotConfigured(str(e)) from None
            _mods = dict(text=text, STORAGE_DIR=STORAGE_DIR, MAX_FILE_MB=MAX_FILE_MB,
                         SessionLocal=SessionLocal, ingest_one=ingest_one,
                         process_file=process_file)
    return _mods


# ---------------------------------------------------------------- upload

def _send_to_search(name: str, data: bytes):
    """Best effort: also index the file in the search service."""
    boundary = uuid.uuid4().hex
    ascii_name = name.encode("ascii", "replace").decode().replace('"', "").replace("?", "_")
    utf8_name = urllib.parse.quote(name)  # RFC 5987, keeps umlauts (Prüfbericht.pdf)
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
            f"filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode() + data + \
        f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(f"{SEARCH_URL}/api/ingest", data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            res.read()
    except Exception as e:
        log.warning("search ingest failed for %s: %s", name, e)


def _process(file_id: int, name: str, data: bytes):
    try:
        result = _pipeline()["process_file"](file_id)
        log.info("processed %s: %s", name, result)
    except Exception:
        log.exception("processing failed for %s", name)
    _send_to_search(name, data)


def upload(original_name: str, data: bytes) -> dict:
    m = _pipeline()
    if len(data) > m["MAX_FILE_MB"] * 1024 * 1024:
        raise ValueError(f"File is larger than {m['MAX_FILE_MB']} MB.")
    name = Path(original_name).name or "upload"
    # ingest_one() stores the file's own name, so keep it in a private temp folder.
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / name
        path.write_bytes(data)
        info = m["ingest_one"](path)
    # Slow part (OCR) runs in the background; the UI polls the status.
    threading.Thread(target=_process, args=(info["file_id"], name, data), daemon=True).start()
    return {"file_id": info["file_id"], "duplicate": info.get("duplicate", False)}


# ---------------------------------------------------------------- read / review

def list_documents() -> list[dict]:
    m = _pipeline()
    with m["SessionLocal"]() as db:
        rows = db.execute(m["text"]("""
            SELECT f.file_id, f.original_name, f.mime_type, f.size_bytes, f.uploaded_at,
                   dm.document_type, dm.title, dm.review_status,
                   ej.status AS extraction_status, ej.error_message
            FROM files f
            LEFT JOIN document_metadata dm ON dm.file_id = f.file_id
            LEFT JOIN LATERAL (
                SELECT status, error_message FROM extraction_jobs
                WHERE file_id = f.file_id ORDER BY job_id DESC LIMIT 1
            ) ej ON TRUE
            ORDER BY f.file_id DESC LIMIT 300
        """)).mappings().all()
    return [dict(r) for r in rows]


def get_document(file_id: int) -> dict | None:
    m = _pipeline()
    with m["SessionLocal"]() as db:
        item = db.execute(m["text"]("""
            SELECT f.file_id, f.original_name, f.mime_type, f.size_bytes, f.sha256, f.uploaded_at,
                   dm.document_type, dm.title, dm.review_status,
                   ej.status AS extraction_status, ej.error_message
            FROM files f
            LEFT JOIN document_metadata dm ON dm.file_id = f.file_id
            LEFT JOIN LATERAL (
                SELECT status, error_message FROM extraction_jobs
                WHERE file_id = f.file_id ORDER BY job_id DESC LIMIT 1
            ) ej ON TRUE
            WHERE f.file_id = :fid
        """), {"fid": file_id}).mappings().first()
        if not item:
            return None
        pages = db.execute(m["text"]("""
            SELECT page_number, content FROM extracted_text
            WHERE file_id = :fid ORDER BY page_number NULLS FIRST, extraction_id
        """), {"fid": file_id}).mappings().all()
    out = dict(item)
    out["pages"] = [dict(p) for p in pages]
    out["categories"] = CATEGORIES
    return out


def save_metadata(file_id: int, title: str, document_type: str):
    m = _pipeline()
    if document_type not in CATEGORIES:
        raise ValueError("Unknown category.")
    with m["SessionLocal"].begin() as db:
        db.execute(m["text"]("""
            UPDATE document_metadata SET title = :title, document_type = :dtype
            WHERE file_id = :fid
        """), {"title": title[:500], "dtype": document_type, "fid": file_id})
        db.execute(m["text"]("""
            INSERT INTO document_audit(file_id, action, details)
            VALUES (:fid, 'metadata_edited', CAST(:details AS jsonb))
        """), {"fid": file_id,
               "details": json.dumps({"title": title[:500], "document_type": document_type})})


def approve(file_id: int, reviewer: str = "stadtmanager"):
    m = _pipeline()
    with m["SessionLocal"].begin() as db:
        db.execute(m["text"]("""
            UPDATE document_metadata SET review_status = 'approved',
                reviewed_at = now(), reviewed_by = :who
            WHERE file_id = :fid
        """), {"fid": file_id, "who": reviewer})
        db.execute(m["text"]("""
            INSERT INTO document_audit(file_id, action, performed_by)
            VALUES (:fid, 'metadata_approved', :who)
        """), {"fid": file_id, "who": reviewer})


def file_path(file_id: int) -> tuple[Path, str] | None:
    m = _pipeline()
    with m["SessionLocal"]() as db:
        row = db.execute(m["text"](
            "SELECT storage_key, original_name, mime_type FROM files WHERE file_id = :fid"
        ), {"fid": file_id}).mappings().first()
    if not row:
        return None
    path = (Path(m["STORAGE_DIR"]) / row["storage_key"]).resolve()
    if not path.is_relative_to(Path(m["STORAGE_DIR"]).resolve()) or not path.is_file():
        return None
    return path, row["original_name"]
