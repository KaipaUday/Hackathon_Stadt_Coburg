from pathlib import Path

def extract(path):
    ext = Path(path).suffix.lower()
    if ext == ".rtf":
        from striprtf.striprtf import rtf_to_text
        raw = Path(path).read_text(encoding="utf-8", errors="replace")
        return {"method": "striprtf", "content": rtf_to_text(raw)}
    if ext == ".pptx":
        from pptx import Presentation
        prs = Presentation(path)
        pages = []
        for n, slide in enumerate(prs.slides, 1):
            parts = [s.text for s in slide.shapes if hasattr(s, "text") and s.text]
            pages.append({"page_number": n, "content": "\\n".join(parts)})
        return {"method": "python-pptx", "pages": pages}
    if ext == ".xml":
        from lxml import etree
        parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
        tree = etree.parse(str(path), parser)
        content = " ".join(tree.getroot().itertext())
        return {"method": "lxml", "content": content}
    return {"method": "plain_text",
            "content": Path(path).read_text(encoding="utf-8", errors="replace")}
