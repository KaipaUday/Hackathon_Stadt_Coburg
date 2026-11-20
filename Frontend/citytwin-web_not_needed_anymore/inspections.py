"""Wartungs-/Prüfberichte: PDF -> text -> fields -> address -> map pin.

Steps:
1. Read the PDF text with PyMuPDF. Pages with (almost) no text are scans
   and are read with Tesseract OCR instead.
2. Ask the LLM (cloud API key or local Ollama, see llm.py) to fill in the fields as JSON. It is told to
   take the address of the inspected SITE, not the letterhead/company address.
3. All street addresses found in the text are also returned as "candidates",
   so the reviewer can pick another one with one click.
4. The address is turned into coordinates with OpenStreetMap Nominatim.
5. Nothing is shown on the map until a person accepts it (status 'approved').
"""

import hashlib
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import fitz  # PyMuPDF
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

import llm
STORE = Path("uploads/inspections")
STORE.mkdir(parents=True, exist_ok=True)

# This module writes to the database, so it needs a user with INSERT/UPDATE
# (a login user that is a member of city_editor). agent.py keeps its read-only user.
WRITE_DB = (
    "host=localhost port=5432 dbname=citytwin "
    f"user={os.environ.get('DB_EDITOR_USER', 'city_writer')} "
    f"password={os.environ.get('DB_EDITOR_PASSWORD', '')}"
)

# Around Coburg (left, top, right, bottom) - used to prefer local results.
COBURG_VIEWBOX = "10.85,50.33,11.10,50.20"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = os.environ.get("GEOCODER_USER_AGENT", "citytwin-coburg-hackathon/0.1")

# Field key -> label shown in the review form.
FIELDS = {
    "site_name": "Site / building (Objekt)",
    "site_address": "Site address (Anlagenstandort)",
    "inspection_type": "Type of inspection (e.g. Brandschutz, Aufzug, Heizung)",
    "equipment": "Inspected equipment (Anlage)",
    "inspection_date": "Inspection date (YYYY-MM-DD)",
    "next_inspection_date": "Next inspection due (YYYY-MM-DD)",
    "result": "Result",
    "defects": "Defects found (Mängel)",
    "company_name": "Inspection company",
    "company_address": "Company address",
    "inspector": "Inspector (Prüfer)",
    "report_number": "Report number",
}
RESULTS = ["ohne Mängel", "mit Mängeln", "unbekannt"]
MAX_FIELD_LEN = 2000
MAX_DETAILS_CHARS = 20000  # size limit for the free "details" object (as JSON text)


# ---------------------------------------------------------------- text

def _ocr_page(page) -> str:
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return ""
    if os.environ.get("TESSERACT_CMD"):
        pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]
    pix = page.get_pixmap(dpi=300)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    return pytesseract.image_to_string(img, lang=os.environ.get("OCR_LANGUAGES", "deu+eng"))


def pdf_text(path: Path, max_pages: int = 10) -> tuple[str, str]:
    """Return (text, method). Uses OCR only for pages without a text layer."""
    pages, used_ocr = [], False
    with fitz.open(path) as doc:
        for i in range(min(len(doc), max_pages)):
            page = doc[i]
            text = page.get_text("text", sort=True).strip()
            if len(text) < 50:  # probably a scanned page
                ocr = _ocr_page(page).strip()
                if len(ocr) > len(text):
                    text, used_ocr = ocr, True
            pages.append(f"--- Seite {i + 1} ---\n{text}")
    return "\n\n".join(pages), ("tesseract" if used_ocr else "pymupdf")


# ---------------------------------------------------------------- addresses

_STREET = (r"[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\- ]{1,40}?"
           r"(?:straße|strasse|str\.|weg|platz|gasse|allee|ring|damm|ufer|berg|steig|"
           r"anger|markt|hof|äcker|graben|leite|Straße|Weg|Platz|Gasse|Allee|Ring)")
ADDRESS_RE = re.compile(
    rf"({_STREET}\s*\d{{1,4}}\s?[a-zA-Z]?)\s*[,·|\n ]\s*(?:D-)?(\d{{5}})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\- ]{{1,30}})")


def address_candidates(text: str) -> list[str]:
    """Every 'Street 12, 96450 Town' in the text, in order, without duplicates."""
    seen, out = set(), []
    for street, plz, town in ADDRESS_RE.findall(text):
        addr = f"{' '.join(street.split())}, {plz} {town.strip().splitlines()[0]}"
        if addr.lower() not in seen:
            seen.add(addr.lower())
            out.append(addr)
    return out[:15]


# ---------------------------------------------------------------- LLM

PROMPT = """You read German maintenance and inspection reports (Wartungsprotokoll,
Prüfbericht, Prüfbescheinigung) and return ONLY a JSON object with these keys:
{keys}, details

Rules:
- site_address is the address of the place WHERE the inspection happened
  (look for: Objekt, Anlagenstandort, Standort, Liegenschaft, Prüfort, Betreiber,
  Auftraggeber/Kunde + Objektanschrift). It is NOT the address of the inspection
  company. The company address is usually in the letterhead, the footer, next to
  phone/fax/e-mail, USt-IdNr., HRB, Bankverbindung or IBAN - put that in company_address.
- Write addresses as "Street Number, PLZ Town".
- Dates as YYYY-MM-DD.
- result must be one of: {results}.
- defects: short summary of the Mängel, or "" if none.
- If a value is not in the text, use "". Never guess or invent values.
- details is a free JSON object with EVERYTHING else that matters in this report,
  in whatever structure fits it best: checked items/devices and their status,
  measured values with units, norms (DIN/VDE/DGUV), rooms/floors, list of defects
  with location and deadline, recommendations, contract or order numbers, signatures.
  Use short German or English keys. Keep the values exactly as written in the report.

Report text:
\"\"\"
{text}
\"\"\"
"""


def llm_fields(text: str) -> tuple[dict, str | None]:
    """Returns (fields, error). On error the fields are empty and the reviewer
    sees the error message, so they can fill the form by hand."""
    limit = 60000 if llm.PROVIDER == "cloud" else 12000  # cloud models take long texts
    prompt = PROMPT.format(keys=", ".join(FIELDS), results=", ".join(RESULTS), text=text[:limit])
    try:
        _, answer, _ = llm.chat([{"role": "user", "content": prompt}], json_mode=True)
        return clean_fields(json.loads(answer)), None
    except json.JSONDecodeError:
        return clean_fields({}), "The AI answer was not valid JSON. Please fill in the fields."
    except llm.LLMError as e:
        return clean_fields({}), str(e)


def clean_details(details) -> dict:
    """The free object from the AI: any JSON structure, only checked for type and size."""
    if not isinstance(details, dict):
        return {}
    if len(json.dumps(details, ensure_ascii=False)) > MAX_DETAILS_CHARS:
        return {"_note": "details were too large and were dropped"}
    return details


def clean_fields(raw: dict) -> dict:
    out = {}
    for key in FIELDS:
        val = raw.get(key, "") if isinstance(raw, dict) else ""
        out[key] = ("" if val is None else str(val)).strip()[:MAX_FIELD_LEN]
    if out["result"] not in RESULTS:
        out["result"] = "unbekannt"
    out["details"] = clean_details(raw.get("details") if isinstance(raw, dict) else None)
    return out


# ---------------------------------------------------------------- geocoding

_geo_lock = threading.Lock()
_last_call = 0.0


def geocode(address: str) -> dict | None:
    """Address -> {lat, lon, label}. Prefers results inside Coburg.
    Nominatim allows at most 1 request per second, so calls are spaced out."""
    global _last_call
    address = address.strip()
    if not address:
        return None
    for bounded in (1, 0):
        params = {"q": address, "format": "jsonv2", "limit": 1, "countrycodes": "de",
                  "viewbox": COBURG_VIEWBOX, "bounded": bounded}
        req = urllib.request.Request(f"{NOMINATIM}?{urllib.parse.urlencode(params)}",
                                     headers={"User-Agent": USER_AGENT})
        with _geo_lock:
            wait = 1.1 - (time.time() - _last_call)
            if wait > 0:
                time.sleep(wait)
            try:
                with urllib.request.urlopen(req, timeout=10) as res:
                    hits = json.load(res)
            except Exception:
                hits = []
            _last_call = time.time()
        if hits:
            h = hits[0]
            return {"lat": float(h["lat"]), "lon": float(h["lon"]), "label": h.get("display_name", "")}
    return None


# ---------------------------------------------------------------- database

def _db():
    return psycopg.connect(WRITE_DB, row_factory=dict_row)


def create_draft(original_name: str, data: bytes) -> dict:
    """Save the PDF, read it, store a 'pending' row and return it for review."""
    sha = hashlib.sha256(data).hexdigest()
    with _db() as conn:
        old = conn.execute("SELECT report_id FROM inspection_reports WHERE sha256=%s "
                           "AND status <> 'rejected' LIMIT 1", (sha,)).fetchone()
    if old:
        report = get(old["report_id"])
        report["duplicate"] = True
        return report

    storage_name = f"{uuid.uuid4().hex}.pdf"
    path = STORE / storage_name
    path.write_bytes(data)

    text, method = pdf_text(path)
    fields, llm_error = llm_fields(text)
    candidates = address_candidates(text)
    if not fields["site_address"] and candidates:
        fields["site_address"] = candidates[0]
    point = geocode(fields["site_address"]) if fields["site_address"] else None

    extracted = {**fields, "_candidates": candidates,
                 "_model": f"{llm.PROVIDER}:{llm.MODEL}", "_error": llm_error}
    with _db() as conn:
        row = conn.execute(
            """INSERT INTO inspection_reports
               (storage_name, original_name, sha256, extraction_method, raw_text,
                extracted, data, site_address, location)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,
                       ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326))
               RETURNING report_id""",
            (storage_name, original_name, sha, method, text, Jsonb(extracted), Jsonb(fields),
             fields["site_address"] or None,
             point["lon"] if point else None, point["lat"] if point else None),
        ).fetchone()
    return get(row["report_id"])


def get(report_id: int) -> dict | None:
    with _db() as conn:
        r = conn.execute(
            """SELECT report_id, original_name, status, extraction_method, extracted, data,
                      site_address, building_id, created_at, reviewed_at,
                      ST_Y(location) AS lat, ST_X(location) AS lon
               FROM inspection_reports WHERE report_id=%s""", (report_id,)).fetchone()
    if r:
        r["candidates"] = r["extracted"].get("_candidates", [])
        r["model"] = r["extracted"].get("_model")
        r["llm_error"] = r["extracted"].get("_error")
        r["fields"] = FIELDS
        r["results"] = RESULTS
    return r


def file_info(report_id: int) -> dict | None:
    with _db() as conn:
        return conn.execute("SELECT storage_name, original_name FROM inspection_reports "
                            "WHERE report_id=%s AND status <> 'rejected'", (report_id,)).fetchone()


def approve(report_id: int, fields: dict, lat: float, lon: float) -> dict | None:
    """Save the reviewed fields, link the nearest known building (< 60 m) and publish."""
    fields = clean_fields(fields)
    with _db() as conn:
        building = conn.execute(
            """SELECT building_id FROM buildings
               WHERE location IS NOT NULL AND ST_DWithin(location::geography,
                     ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography, 60)
               ORDER BY location::geography <-> ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography
               LIMIT 1""", (lon, lat, lon, lat)).fetchone()
        updated = conn.execute(
            """UPDATE inspection_reports
               SET data=%s, site_address=%s, location=ST_SetSRID(ST_MakePoint(%s,%s),4326),
                   building_id=%s, status='approved', reviewed_at=now()
               WHERE report_id=%s AND status <> 'rejected' RETURNING report_id""",
            (Jsonb(fields), fields["site_address"] or None, lon, lat,
             building and building["building_id"], report_id)).fetchone()
    return get(report_id) if updated else None


def reject(report_id: int) -> bool:
    with _db() as conn:
        r = conn.execute("UPDATE inspection_reports SET status='rejected', reviewed_at=now() "
                         "WHERE report_id=%s AND status='pending' RETURNING report_id",
                         (report_id,)).fetchone()
    return r is not None


def list_pending() -> list[dict]:
    with _db() as conn:
        return conn.execute("SELECT report_id, original_name, created_at FROM inspection_reports "
                            "WHERE status='pending' ORDER BY created_at DESC LIMIT 50").fetchall()


def approved_geojson() -> dict:
    with _db() as conn:
        rows = conn.execute(
            """SELECT report_id, original_name, data, ST_X(location) AS lon, ST_Y(location) AS lat
               FROM inspection_reports
               WHERE status='approved' AND location IS NOT NULL""").fetchall()
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature",
         "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
         "properties": {"report_id": r["report_id"], "original_name": r["original_name"],
                        **r["data"]}}
        for r in rows]}
