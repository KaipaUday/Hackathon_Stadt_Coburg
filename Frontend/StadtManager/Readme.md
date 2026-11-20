# StadtManager

## Run locally

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m uvicorn app:app --app-dir Site --reload
```

Open <http://127.0.0.1:8000>. Press `Ctrl+C` to stop the server. The site
supports individual files or whole folders containing CSV, JSON, PDF,
Markdown, and text files up to 5 MB each. Supported files are processed one
at a time. Review extracted building details, add categories such as heating
system, and accept each record before it is saved.

Accepted building records and their original files are stored locally in
`data/stadtmanager.sqlite3` (the files are stored as database BLOBs). Unaccepted
or skipped files aren't saved. The city map is centered on Coburg and uses
OpenFreeMap/OpenStreetMap map tiles, so an internet connection is required.

To use the AI assistant, set either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
in the server's environment. Select the matching provider in the website.
Optional `ANTHROPIC_MODEL` and `OPENAI_MODEL` variables override the default
model names. The UI checks the key and loads available chat models before
showing the model selector. Keys are never sent to or displayed by the browser.

With the server running, check a provider key and list models without printing
the key itself:

```bash
curl --fail-with-body --silent --show-error --get http://127.0.0.1:8000/api/models \
  --data-urlencode provider=anthropic
```

Use `provider=openai` to check the OpenAI key instead. A successful response
includes the available model IDs; an invalid or missing key returns an error.

## Environment variables

Replace placeholders with your own credentials. Never commit real secrets to
the repository or paste them into source code.

### For the current terminal only

```bash
export OPENAI_API_KEY="your-openai-api-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"

# Optional database settings for future database-backed features
export DB_HOST="localhost"
export DB_PORT="5432"
export DB_NAME="your-database-name"
export DB_USER="your-database-user"
export DB_PASSWORD="your-database-password"
```

### Persist on macOS (zsh)

Add the same `export` lines to `~/.zshrc` using a text editor:

```bash
nano ~/.zshrc
```

Save and close the editor, then load the settings into the current terminal:

```bash
source ~/.zshrc
```

New terminal windows will load these settings automatically. The current app
uses local SQLite, so the `DB_*` examples aren't used. Set
`STADTMANAGER_DB_PATH` if you want to store the SQLite database at a different
local path.

## Document search and document pipeline

Two extra sections (sidebar: **Document search**, **Document pipeline**) connect
StadtManager to the team's other parts in this repository. They are optional:
if a part isn't running, only its section shows a message.

| Section | Uses | Needs |
|---|---|---|
| Document search | `search/` (Node service, port 3000) | `npm run dev` in `search/` |
| Document pipeline | `extraction process/` (Postgres, OCR, Excel) | `extraction process/.env` |

The code is in `Site/integrations.py` (routes), `Site/pipeline_bridge.py`
(calls the pipeline) and `Site/Public/integrations.js` (UI).

### 1. Install

From the repository root (Node.js 22+ and Python 3.12):

```bash
cd search && npm install && cd ..
python -m pip install -r Frontend/StadtManager/requirements.txt
python -m pip install -r "extraction process/requirements.txt"
```

Windows PowerShell: if `npm` is blocked, use `npm.cmd`.

### 2. Settings

`search/.env` (Claude writes the search answers; without it search uses its
local engine):

```
ANTHROPIC_API_KEY="sk-ant-..."
```

`extraction process/.env` (database of the pipeline; Tesseract only for scans):

```
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/citytwin
TESSERACT_CMD=C:\\Program Files\\Tesseract-OCR\\tesseract.exe
TESSDATA_PREFIX=C:\\Program Files\\Tesseract-OCR\\tessdata
OCR_LANGUAGES=deu+eng
```

Optional for StadtManager: `SEARCH_URL` (default `http://localhost:3000`) and
`EXTRACTION_DIR` (default: `extraction process/` in the repository root).

### 3. Start (two terminals)

```bash
# Terminal 1 – search service
cd search
npm run dev

# Terminal 2 – StadtManager (from Frontend/StadtManager)
python -m uvicorn app:app --app-dir Site --reload
```

### What you can do

- **Document search → Ask:** question across all documents → answer with
  findings, sources (file, page, quote), missing data and uncertainties.
  **Find passages:** keyword search with snippets.
- **Document search → Assets:** equipment with inspection status (OK, due soon,
  overdue, proof missing, defect), filter by building, status or *Needs review*.
- **Document pipeline:** upload any file (also scans, Excel, Word, e-mails,
  files over 5 MB) → read in the background → check the extracted text, set
  title and category → **Save & approve**. Each upload is also added to the
  document search.

### Troubleshooting

| Message | Fix |
|---|---|
| "The search service is not running" | Start terminal 1, or set `SEARCH_URL` |
| Search answers start with "Lokale Auswertung …" | No/invalid `ANTHROPIC_API_KEY` in `search/.env` (see terminal 1) |
| "Extraction pipeline is not set up: DATABASE_URL missing" | Create `extraction process/.env` |
| Document status *Failed*: "TESSERACT_CMD … is not configured" | Scanned file: set both Tesseract lines in `extraction process/.env` |
| "column … does not exist" | The pipeline tables in the database are older than the pipeline code |
