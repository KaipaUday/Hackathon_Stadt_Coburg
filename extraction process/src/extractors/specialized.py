from pathlib import Path

SPECIAL_EXTENSIONS = {".p81", ".p83", ".x81", ".x82", ".x83", ".x84", ".pln", ".lwi"}

def inspect_specialized(path):
    p = Path(path)
    sample = p.read_bytes()[:4096]
    printable = sum(32 <= b < 127 or b in (9, 10, 13) for b in sample)
    return {"method": "format_inspection_only", "extension": p.suffix.lower(),
            "size_bytes": p.stat().st_size, "header_hex": sample[:64].hex(" "),
            "printable_ratio": round(printable / max(len(sample), 1), 3),
            "status": "requires_review",
            "note": "Identify the originating application before implementing a parser."}
