from pathlib import Path
from datetime import datetime, timezone
import hashlib
import shutil
from sqlalchemy import text
from src.database import SessionLocal
from src.detection import detect_mime
from config.settings import STORAGE_DIR, MAX_FILE_MB

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def ingest_one(source: Path):
    if not source.is_file():
        raise ValueError(f"Not a file: {source}")
    size = source.stat().st_size
    if size > MAX_FILE_MB * 1024 * 1024:
        raise ValueError(f"File exceeds MAX_FILE_MB={MAX_FILE_MB}")
    digest = sha256_file(source)
    mime = detect_mime(source)

    with SessionLocal.begin() as db:
        old = db.execute(text(
            "SELECT file_id, storage_key FROM files WHERE sha256=:sha ORDER BY file_id LIMIT 1"
        ), {"sha": digest}).mappings().first()
        if old:
            return {"file_id": old["file_id"], "duplicate": True,
                    "storage_key": old["storage_key"], "sha256": digest}

        now = datetime.now(timezone.utc)
        rel = Path("originals") / now.strftime("%Y/%m") / digest[:2] / digest[2:4] / digest
        dest = STORAGE_DIR / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            shutil.copy2(source, dest)

        fid = db.execute(text("""
            INSERT INTO files(storage_key, original_name, mime_type, size_bytes, sha256)
            VALUES (:key, :name, :mime, :size, :sha) RETURNING file_id
        """), {"key": rel.as_posix(), "name": source.name, "mime": mime,
               "size": size, "sha": digest}).scalar_one()

        db.execute(text("""
            INSERT INTO document_metadata(file_id) VALUES (:fid)
            ON CONFLICT (file_id) DO NOTHING
        """), {"fid": fid})
        db.execute(text("INSERT INTO extraction_jobs(file_id) VALUES (:fid)"), {"fid": fid})

    return {"file_id": fid, "duplicate": False, "storage_key": rel.as_posix(), "sha256": digest}

def scan_and_ingest(folder):
    for p in Path(folder).rglob("*"):
        if p.is_file():
            try:
                yield {"source": str(p), **ingest_one(p)}
            except Exception as e:
                yield {"source": str(p), "error": str(e)}
