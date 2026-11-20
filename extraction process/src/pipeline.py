
from pathlib import Path
import json

from sqlalchemy import text

from src.database import SessionLocal
from config.settings import STORAGE_DIR

from src.extractors.pdf import extract as pdf_extract
from src.extractors.image import extract as image_extract
from src.extractors.excel import extract as excel_extract
from src.extractors.email import extract as email_extract
from src.extractors.text import extract as text_extract
from src.extractors.specialized import (
    inspect_specialized,
    SPECIAL_EXTENSIONS,
)

IMAGE = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
EXCEL = {".xls", ".xlsx", ".xlsm"}
TEXT = {".txt", ".rtf", ".pptx", ".xml", ".md", ".py"}



def dispatch(path, original_name=None):
    path = Path(path)

    if original_name:
        ext = Path(original_name).suffix.lower()
    else:
        ext = path.suffix.lower()

    if ext == ".pdf":
        return pdf_extract(path)
    if ext in IMAGE:
        return image_extract(path)
    if ext in EXCEL:
        return excel_extract(path)
    if ext == ".msg":
        return email_extract(path)
    if ext in TEXT:
        return text_extract(path)
    if ext in SPECIAL_EXTENSIONS:
        return inspect_specialized(path)
    if ext == ".zip":
        return {
            "method": "archive_not_expanded",
            "status": "requires_review"
        }

    return {
        "method": "unsupported",
        "status": "requires_review",
        "extension": ext
    }


def pages_for(result):
    if "pages" in result:
        return result["pages"]

    if "content" in result:
        return [{
            "page_number": None,
            "content": result["content"]
        }]

    if "body" in result:
        return [{
            "page_number": None,
            "content": result["body"]
        }]

    if "sheets" in result:
        return [
            {
                "page_number": None,
                "content": "Sheet: " + name + "\n" +
                "\n".join(
                    "\t".join(
                        "" if v is None else str(v)
                        for v in row
                    )
                    for row in rows
                )
            }
            for name, rows in result["sheets"].items()
        ]

    return []


def process_file(file_id):
    with SessionLocal.begin() as db:
        job = db.execute(text("""
            SELECT j.job_id, f.storage_key, f.original_name
            FROM extraction_jobs j
            JOIN files f ON f.file_id = j.file_id
            WHERE j.file_id = :fid
              AND j.status IN ('pending', 'failed')
            ORDER BY j.job_id DESC
            LIMIT 1
            FOR UPDATE OF j SKIP LOCKED
        """), {"fid": file_id}).mappings().first()

        if not job:
            return {
                "file_id": file_id,
                "status": "no_pending_job"
            }

        jid = job["job_id"]
        key = job["storage_key"]
        original_name = job["original_name"]

        db.execute(text("""
            UPDATE extraction_jobs
            SET status = 'processing',
                started_at = now(),
                error_message = NULL
            WHERE job_id = :id
        """), {"id": jid})

    try:
        path = STORAGE_DIR / Path(key)
        result = dispatch(path, original_name)
        # OCR is not yet implemented, so flag scanned PDFs.

        needs_review = (
            result.get("status") == "requires_review"
            or any(
                page.get("needs_ocr", False)
                for page in result.get("pages", [])
            )
        )

        with SessionLocal.begin() as db:
            db.execute(text("""
                DELETE FROM extracted_text
                WHERE file_id = :fid
            """), {"fid": file_id})

            for page in pages_for(result):
                content = str(page.get("content") or "")

                if content.strip():
                    db.execute(text("""
                        INSERT INTO extracted_text
                            (file_id, page_number, content)
                        VALUES
                            (:fid, :page, :content)
                    """), {
                        "fid": file_id,
                        "page": page.get("page_number"),
                        "content": content
                    })
                   
            db.execute(text("""
                DELETE FROM extracted_data
                    WHERE file_id = :fid
                    AND data_category = 'document_extraction'
            """), {"fid": file_id})
	  
            db.execute(text("""
                INSERT INTO extracted_data
                    (file_id, data_category, data_key, data_value)
                VALUES
                    (:fid, 'document_extraction', 'result',
                     CAST(:payload AS jsonb))
            """), {
                "fid": file_id,
                "payload": json.dumps(result, default=str)
            })

            status = (
                "review_required"
                if needs_review
                else "completed"
            )

            db.execute(text("""
                UPDATE extraction_jobs
                SET status = :status,
                    completed_at = now(),
                    extractor = :method
                WHERE job_id = :jid
            """), {
                "status": status,
                "method": result.get("method", "unknown"),
                "jid": jid
            })

            # Metadata review status has its own allowed values.
            db.execute(text("""
                UPDATE document_metadata
                SET extracted_at = now(),
                    review_status = 'pending'
                WHERE file_id = :fid
            """), {"fid": file_id})

        return {
            "file_id": file_id,
            "status": status,
            "method": result.get("method")
        }

    except Exception as exc:
        with SessionLocal.begin() as db:
            db.execute(text("""
                UPDATE extraction_jobs
                SET status = 'failed',
                    completed_at = now(),
                    error_message = :err
                WHERE job_id = :jid
            """), {
                "err": str(exc)[:4000],
                "jid": jid
            })

        return {
            "file_id": file_id,
            "status": "failed",
            "error": str(exc)
        }
