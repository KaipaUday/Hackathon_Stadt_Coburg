
import fitz
from pathlib import Path


def extract(path):
    path = Path(path)

    # Read the file as binary data instead of passing
    # a Windows path directly to PyMuPDF.
    file_data = path.read_bytes()

    pages = []

    with fitz.open(stream=file_data, filetype="pdf") as doc:
        metadata = doc.metadata or {}

        for n, page in enumerate(doc, 1):
            content = page.get_text("text") or ""

            pages.append({
                "page_number": n,
                "content": content,
                "needs_ocr": len(content.strip()) < 30
            })

    return {
        "method": "pymupdf",
        "metadata": metadata,
        "pages": pages
    }
