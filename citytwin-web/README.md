# CityTwin Coburg – Web app

A 3D map of Coburg with a chat assistant and **Wartung / inspection reports as pins**:
upload a PDF → the site address and report data are read automatically → you check and
correct them → after "Accept" a pin appears on the building. Clicking the pin shows the
data and opens the PDF.

All commands below are run from the **repository root** unless it says otherwise.

---

## 1. What you need

| Tool | Why | Install |
|---|---|---|
| Python **3.10 or newer** | the server | python.org |
| Docker | the database | docker.com |
| Ollama + `qwen2.5:7b` | chat assistant and reading the reports | ollama.com, then `ollama pull qwen2.5:7b` |
| Tesseract OCR with German | only for **scanned** PDFs | see below |

Tesseract:

- **macOS:** `brew install tesseract tesseract-lang`
- **Ubuntu/Debian:** `sudo apt install tesseract-ocr tesseract-ocr-deu`
- **Windows:** installer from https://github.com/UB-Mannheim/tesseract/wiki (tick *German* during setup), then set
  `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` (step 4).

Check it: `tesseract --list-langs` must show `deu`.
PDFs that already contain text work without Tesseract.

---

## 2. Database (first time only)

The schema needs PostGIS and TimescaleDB, so use this image, which has both:

```bash
docker run -d --name citydb -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  timescale/timescaledb-ha:pg16
```

> Already have a `citydb` container? Just run `docker start citydb` and skip to **2c**
> (only migration `006` is new).

**2a. Database, extensions and roles** – replace both `CHANGE_ME` passwords:

```bash
docker exec -i citydb psql -U postgres <<'SQL'
CREATE DATABASE citytwin;
\c citytwin
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE ROLE city_readonly NOLOGIN;
CREATE ROLE city_editor   NOLOGIN;
CREATE ROLE city_admin    NOLOGIN;

-- used by the chat assistant (read only)
CREATE ROLE agent_reader LOGIN PASSWORD 'CHANGE_ME_reader' IN ROLE city_readonly;
-- used for saving uploaded reports (read + write)
CREATE ROLE city_writer  LOGIN PASSWORD 'CHANGE_ME_writer' IN ROLE city_editor;
SQL
```

**2b. Tables and sample data** (in this order):

```bash
for f in migrations/001_init.sql migrations/002_grants.sql migrations/003_services.sql seed/sample_data.sql; do
  docker exec -i citydb psql -U postgres -d citytwin -v ON_ERROR_STOP=1 < "$f"
done
```

**2c. Inspection reports table** (new):

```bash
docker exec -i citydb psql -U postgres -d citytwin -v ON_ERROR_STOP=1 < migrations/006_inspections.sql
```

Windows PowerShell: use `Get-Content migrations\006_inspections.sql | docker exec -i citydb psql -U postgres -d citytwin`
for each file instead of `<`.

---

## 3. Python packages

```bash
cd citytwin-web
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

---

## 4. Settings (every new terminal)

macOS / Linux:

```bash
export DB_PASSWORD="CHANGE_ME_reader"          # agent_reader password from 2a
export DB_EDITOR_USER="city_writer"
export DB_EDITOR_PASSWORD="CHANGE_ME_writer"   # city_writer password from 2a
export GEOCODER_USER_AGENT="citytwin-coburg (your@email.de)"   # OpenStreetMap asks for a contact
# optional: export OCR_LANGUAGES="deu+eng"   export LLM_MODEL="qwen2.5:7b"
```

Windows PowerShell:

```powershell
$env:DB_PASSWORD="CHANGE_ME_reader"
$env:DB_EDITOR_USER="city_writer"
$env:DB_EDITOR_PASSWORD="CHANGE_ME_writer"
$env:GEOCODER_USER_AGENT="citytwin-coburg (your@email.de)"
$env:TESSERACT_CMD="C:\Program Files\Tesseract-OCR\tesseract.exe"
```

---

## 5. Start

Make sure Docker (`citydb`) and Ollama are running, then inside `citytwin-web`:

```bash
uvicorn server:app --reload --port 8000
```

Open http://localhost:8000

---

## 6. Using the inspection reports

1. Click **Upload Wartung PDF** (top left) and pick a PDF. Reading takes ~5–30 s (longer for scans).
2. The review panel opens:
   - Check every field against the PDF (**Open the PDF ↗**). Fields you change turn yellow.
   - **Site address** is the place that was inspected, *not* the inspection company.
     If it's wrong, click one of the *other addresses in the PDF* or type it, then
     **Find this address on the map**.
   - Drag the **orange pin** onto the right building if needed.
3. **Accept & show on map** → pin appears (green = no defects, red = defects, grey = unknown).
   **Reject** → it is never shown. **×** → it stays in *Waiting for review* for later.
4. Click a pin to see the data and open the attached PDF.
5. Ask the chat things like *"Wann ist die nächste Brandschutzprüfung fällig?"* – it
   searches the accepted reports.

Uploaded PDFs are stored in `citytwin-web/uploads/inspections/` (not committed to git).

### How the data is read

- **PyMuPDF** reads PDFs that contain text (fast, exact). Pages with almost no text are
  treated as scans and read with **Tesseract** (300 dpi, `deu+eng`).
- The local LLM (Ollama) fills the fields. It is told to take the address next to
  *Objekt / Anlagenstandort / Standort / Liegenschaft* and to ignore the letterhead/footer
  company address (phone, USt-IdNr., HRB, IBAN …).
- All addresses found in the text are offered as one-click alternatives.
- The address is looked up with **OpenStreetMap Nominatim**, preferring results inside Coburg.
- The original machine reading is kept in `extracted`, the corrected values in `data`
  (table `inspection_reports`), so you can see what was changed.

### API

| Method | Path | |
|---|---|---|
| POST | `/api/inspections/upload` | form field `file` (PDF ≤ 20 MB) → draft for review |
| GET | `/api/inspections` | accepted reports as GeoJSON |
| GET | `/api/inspections/pending` | reports waiting for review |
| GET | `/api/inspections/{id}` | one report |
| POST | `/api/inspections/geocode` | `{"address": "..."}` → `{lat, lon, label}` |
| POST | `/api/inspections/{id}/approve` | `{"fields": {...}, "lat": .., "lon": ..}` |
| POST | `/api/inspections/{id}/reject` | |
| GET | `/api/inspections/{id}/file` | the PDF |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `KeyError: 'DB_PASSWORD'` on start | Step 4 was not done in this terminal |
| Upload: *password authentication failed for user "city_writer"* | `DB_EDITOR_USER` / `DB_EDITOR_PASSWORD` wrong, or step 2a skipped |
| Upload: *relation "inspection_reports" does not exist* | Run step 2c |
| *permission denied for table inspection_reports* | Run step 2c again **after** creating the roles in 2a |
| All fields empty | Ollama is not running, or `ollama pull qwen2.5:7b` missing |
| Scanned PDF gives no text | Tesseract or the `deu` language is missing (`tesseract --list-langs`) |
| *Address not found* | Fix the spelling, or drag the orange pin by hand – it still works |
| Port 5432 already in use | Another Postgres is running; stop it or use `-p 5433:5432` and change `port=` in `agent.py` / `inspections.py` |
