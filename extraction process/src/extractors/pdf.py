
from pathlib import Path
import subprocess
import fitz

from config.settings import (
    TESSERACT_CMD,
    TESSDATA_PREFIX,
    OCR_LANGUAGES,
)


def run_ocr(image_data):
    if not TESSERACT_CMD:
        raise RuntimeError("TESSERACT_CMD is not configured in .env")

    if not TESSDATA_PREFIX:
        raise RuntimeError("TESSDATA_PREFIX is not configured in .env")

    command = [
        TESSERACT_CMD,
        "stdin",
        "stdout",
        "-l", OCR_LANGUAGES,
        "--tessdata-dir", TESSDATA_PREFIX,
    ]

    result = subprocess.run(
        command,
        input=image_data,
        capture_output=True,
        check=True,
        timeout=180,
    )

    return result.stdout.decode("utf-8", errors="replace").strip()


def extract(path):
    path = Path(path)
    file_data = path.read_bytes()

    pages = []

    with fitz.open(stream=file_data, filetype="pdf") as doc:
        metadata = doc.metadata or {}

        for n, page in enumerate(doc, 1):
            content = page.get_text("text") or ""
            needs_ocr = len(content.strip()) < 30

            if needs_ocr:
                # Render the PDF page as an image at 200 DPI.
                pix = page.get_pixmap(
                    matrix=fitz.Matrix(200 / 72, 200 / 72),
                    alpha=False
                )

                image_data = pix.tobytes("png")
                content = run_ocr(image_data)

            pages.append({
                "page_number": n,
                "content": content,
                "needs_ocr": needs_ocr,
            })

    return {
        "method": "pymupdf+tesseract",
        "metadata": metadata,
        "pages": pages
    }
