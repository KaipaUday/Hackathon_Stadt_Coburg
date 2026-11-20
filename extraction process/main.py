import argparse, csv, logging
from config.settings import INPUT_DIR, REPORT_DIR, LOG_DIR
from src.database import SessionLocal, test_connection
from src.ingestion import scan_and_ingest
from src.pipeline import process_file
from sqlalchemy import text

logging.basicConfig(filename=LOG_DIR / "document_extractor.log",
                    level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")

def ingest():
    report = REPORT_DIR / "ingestion_report.csv"
    fields = ["source", "file_id", "duplicate", "storage_key", "sha256", "error"]
    with report.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in scan_and_ingest(INPUT_DIR):
            writer.writerow(row)
            print(row)
    print("Report:", report)

def process_pending():
    with SessionLocal() as db:
        ids = db.execute(text("""
            SELECT DISTINCT file_id FROM extraction_jobs
            WHERE status IN ('pending','failed') ORDER BY file_id
        """)).scalars().all()
    for fid in ids:
        result = process_file(fid)
        print(result)
        logging.info("%s", result)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["test-db", "ingest", "process", "run"])
    cmd = parser.parse_args().command
    if cmd == "test-db": print(test_connection())
    elif cmd == "ingest": ingest()
    elif cmd == "process": process_pending()
    else:
        ingest()
        process_pending()
