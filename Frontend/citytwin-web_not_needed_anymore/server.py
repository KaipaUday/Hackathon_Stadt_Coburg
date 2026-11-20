from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from agent import ask
import llm
import inspections

app = FastAPI()

INBOX = Path("inbox")
INBOX.mkdir(exist_ok=True)
ALLOWED = {".pdf", ".docx", ".xlsx", ".txt", ".csv", ".md"}
MAX_BYTES = 20 * 1024 * 1024

class Chat(BaseModel):
    message: str

@app.post("/api/chat")
def chat(body: Chat):
    text = body.message.strip()
    if not text or len(text) > 1000:
        return {"error": "Send a question under 1000 characters."}
    try:
        return {"reply": ask(text)}
    except llm.LLMError as e:
        return {"error": str(e)}
    except Exception:
        return {"error": "The assistant is unavailable right now."}

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    name = Path(file.filename).name
    if Path(name).suffix.lower() not in ALLOWED:
        return {"error": "This file type isn't supported yet."}
    data = await file.read()
    if len(data) > MAX_BYTES:
        return {"error": "File is larger than 20 MB."}
    (INBOX / name).write_bytes(data)
    return {"message": f"{name} received. It needs review before it appears."}


# ------------------------------------------------ Wartung / inspection reports

class Review(BaseModel):
    fields: dict  # core fields (strings) + "details" (free JSON object)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)

class Address(BaseModel):
    address: str = Field(min_length=3, max_length=300)

def _found(report):
    if not report:
        raise HTTPException(404, "Report not found.")
    return report

# Plain "def" (not async): reading the PDF, OCR and the LLM are slow and blocking,
# so FastAPI runs these in a worker thread and the map stays responsive.
@app.post("/api/inspections/upload")
def inspection_upload(file: UploadFile = File(...)):
    name = Path(file.filename or "report.pdf").name
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 20 MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Please upload a PDF file.")
    try:
        return inspections.create_draft(name, data)
    except Exception as e:
        raise HTTPException(500, f"Could not read the report: {e}")

@app.get("/api/inspections")
def inspection_pins():
    return inspections.approved_geojson()

@app.get("/api/inspections/pending")
def inspection_pending():
    return inspections.list_pending()

@app.post("/api/inspections/geocode")
def inspection_geocode(body: Address):
    hit = inspections.geocode(body.address)
    if not hit:
        raise HTTPException(404, "Address not found. Check the spelling or place the pin by hand.")
    return hit

@app.get("/api/inspections/{report_id}")
def inspection_get(report_id: int):
    return _found(inspections.get(report_id))

@app.post("/api/inspections/{report_id}/approve")
def inspection_approve(report_id: int, body: Review):
    return _found(inspections.approve(report_id, body.fields, body.lat, body.lon))

@app.post("/api/inspections/{report_id}/reject")
def inspection_reject(report_id: int):
    if not inspections.reject(report_id):
        raise HTTPException(404, "Report not found or already reviewed.")
    return {"ok": True}

@app.get("/api/inspections/{report_id}/file")
def inspection_file(report_id: int):
    info = _found(inspections.file_info(report_id))
    path = inspections.STORE / info["storage_name"]
    if not path.is_file():
        raise HTTPException(404, "File is missing on the server.")
    return FileResponse(path, media_type="application/pdf",
                        filename=info["original_name"], content_disposition_type="inline")


app.mount("/", StaticFiles(directory="public", html=True), name="site")
