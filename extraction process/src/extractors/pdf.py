import fitz

def extract(path):
    pages = []
    with fitz.open(path) as doc:
        metadata = doc.metadata or {}
        for n, page in enumerate(doc, 1):
            content = page.get_text("text") or ""
            pages.append({"page_number": n, "content": content,
                          "needs_ocr": len(content.strip()) < 30})
    return {"method": "pymupdf", "metadata": metadata, "pages": pages}
