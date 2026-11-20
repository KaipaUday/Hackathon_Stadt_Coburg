from pathlib import Path
import mimetypes

def detect_mime(path: Path) -> str:
    try:
        import magic
        return magic.from_file(str(path), mime=True) or "application/octet-stream"
    except Exception:
        return mimetypes.guess_type(path.name)[0] or "application/octet-stream"
