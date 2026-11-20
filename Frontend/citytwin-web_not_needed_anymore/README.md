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
| **OpenAI API key** (recommended) | chat assistant and reading the reports | platform.openai.com → API keys (needs a little credit on the account) |
| *or* Ollama + `qwen2.5:7b` | same, but local and free – used when no API key is set | ollama.com, then `ollama pull qwen2.5:7b` |
| Tesseract OCR with German | only for **scanned** PDFs | see below |

Tesseract:

- **macOS:** `brew install tesseract tesseract-lang`
- **Ubuntu/Debian:** `sudo apt install tesseract-ocr tesseract-ocr-deu`
- **Windows:** installer from https://github.com/UB-Mannheim/tesseract/wiki (tick *German* during setup), then set
  `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` (step 4).

Check it: `tesseract --list-langs` must show `deu`.
PDFs that already contain text work without Tesseract.

### Other cloud providers

`llm.py` speaks the OpenAI-compatible API, so other keys work by also setting `LLM_BASE_URL` and `LLM_MODEL`:

| Provider | `LLM_BASE_URL` |
|---|---|
| OpenAI (default) | `https://api.openai.com/v1` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Mistral | `https://api.mistral.ai/v1` |
| Groq | `https://api.groq.com/openai/v1` |

> **Data:** with a cloud key, the text of every uploaded report is sent to that provider.
> Free tiers (Gemini, Mistral) may use it for training. Check with the city before uploading
> real documents.

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
export LLM_API_KEY="sk-..."                    # your OpenAI key; leave unset to use local Ollama
# optional: export LLM_MODEL="gpt-4.1-mini"    # any model your account offers
# optional: export OCR_LANGUAGES="deu+eng"
```

Windows PowerShell:

```powershell
$env:DB_PASSWORD="CHANGE_ME_reader"
$env:DB_EDITOR_USER="city_writer"
$env:DB_EDITOR_PASSWORD="CHANGE_ME_writer"
$env:GEOCODER_USER_AGENT="citytwin-coburg (your@email.de)"
$env:LLM_API_KEY="sk-..."
$env:TESSERACT_CMD="C:\Program Files\Tesseract-OCR\tesseract.exe"
```

---

## 5. Start

Make sure Docker (`citydb`) is running (and Ollama, if you don't use an API key), then inside `citytwin-web`:

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
5. Ask the chat things like *"Wann ist die nächste Brandschutzprüfung fällig?"* or
   *"Welche Mängel wurden bei den Feuerlöschern gefunden?"* – it searches the accepted
   reports, including the free details and the PDF text.

Uploaded PDFs are stored in `citytwin-web/uploads/inspections/` (not committed to git).

### How the data is read

- **PyMuPDF** reads PDFs that contain text (fast, exact). Pages with almost no text are
  treated as scans and read with **Tesseract** (300 dpi, `deu+eng`).
- The LLM fills the fields: the cloud API if `LLM_API_KEY` is set, otherwise local Ollama
  (see `llm.py`). Only the **extracted text** is sent, not the PDF file. The review panel
  shows which model was used. It is told to take the address next to
  *Objekt / Anlagenstandort / Standort / Liegenschaft* and to ignore the letterhead/footer
  company address (phone, USt-IdNr., HRB, IBAN …).
- Every report is different, so only a few **core fields** are fixed (site, address, type,
  dates, result, company …) – they drive the pin colour and the "overdue" warning.
  **Everything else** goes into a free JSON object `details` that the AI structures however
  fits that PDF (checked devices, measured values, norms, defects with room and deadline …).
  You can edit it in the review panel; the pin popup shows it under *More details*.
- The chat assistant reads all of it: `search_inspections` searches the fields, `details`
  and the full PDF text; `get_inspection` gives it one complete report.
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
| Red "AI could not read the fields" with *401* | `LLM_API_KEY` is wrong |
| … with *429* | Rate limit, or no credit left on the OpenAI account (Billing page) |
| … with *404* | `LLM_MODEL` name doesn't exist for your account |
| All fields empty, no API key set | Ollama is not running, or `ollama pull qwen2.5:7b` missing |
| Scanned PDF gives no text | Tesseract or the `deu` language is missing (`tesseract --list-langs`) |
| *Address not found* | Fix the spelling, or drag the orange pin by hand – it still works |
| Port 5432 already in use | Another Postgres is running; stop it or use `-p 5433:5432` and change `port=` in `agent.py` / `inspections.py` |
