from pathlib import Path
from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from agent import ask

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

app.mount("/", StaticFiles(directory="public", html=True), name="site")