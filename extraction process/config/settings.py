from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

def path_setting(name, default):
    p = Path(os.getenv(name, default))
    return p if p.is_absolute() else (ROOT / p).resolve()

DATABASE_URL = os.getenv("DATABASE_URL", "")
INPUT_DIR = path_setting("INPUT_DIR", "./input")
STORAGE_DIR = path_setting("STORAGE_DIR", "./storage")
LOG_DIR = path_setting("LOG_DIR", "./logs")
REPORT_DIR = path_setting("REPORT_DIR", "./reports")
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")
TESSDATA_PREFIX = os.getenv("TESSDATA_PREFIX", "")
OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "eng+deu")
MAX_FILE_MB = int(os.getenv("MAX_FILE_MB", "500"))

for p in [INPUT_DIR, STORAGE_DIR / "originals", STORAGE_DIR / "processed",
          STORAGE_DIR / "quarantine", LOG_DIR, REPORT_DIR]:
    p.mkdir(parents=True, exist_ok=True)

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL missing: copy .env.example to .env and configure it.")
