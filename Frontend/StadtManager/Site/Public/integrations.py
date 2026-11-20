"""Routes that connect StadtManager to the team's other parts:

* /api/search-app/...  -> the search service in search/ (Node, default port 3000)
* /api/documents/...   -> the extraction pipeline in "extraction process/" (Postgres)

Both are optional: if a part isn't running or set up, only its section shows a
message, the rest of StadtManager keeps working.
"""

import os
import urllib.error
import urllib.request

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import pipeline_bridge

router = APIRouter()


# ------------------------------------------------ Search service (search/, Node)

SEARCH_URL = os.environ.get("SEARCH_URL", "http://localhost:3000").rstrip("/")
SEARCH_ALLOWED = ("health", "knowledge", "search", "ask", "ingest", "assets/", "documents/")


def _search_request(method: str, url: str, body: bytes, content_type: str | None):
    req = urllib.request.Request(url, data=body or None, method=method,
                                 headers={"Content-Type": content_type} if content_type else {})
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, res.headers.get("Content-Type", "application/json"), res.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("Content-Type", "application/json"), error.read()


@router.api_route("/api/search-app/{path:path}", methods=["GET", "POST", "PATCH"])
async def search_proxy(path: str, request: Request) -> Response:
    if ".." in path or not path.startswith(SEARCH_ALLOWED):
        raise HTTPException(status_code=404, detail="Not available.")
    url = f"{SEARCH_URL}/api/{path}"
    if request.url.query:
        url += "?" + request.url.query
    body = await request.body()
    try:
        status, content_type, data = await run_in_threadpool(
            _search_request, request.method, url, body, request.headers.get("content-type"))
    except urllib.error.URLError as error:
        raise HTTPException(status_code=503, detail="The search service is not running. "
                            "Start it with 'npm run dev' in the search folder.") from error
    return Response(content=data, status_code=status, media_type=content_type)


# ------------------------------------------------ Extraction pipeline

class DocumentMetadata(BaseModel):
    title: str = Field(default="", max_length=500)
    document_type: str


def _pipeline(function, *args):
    try:
        return function(*args)
    except pipeline_bridge.NotConfigured as error:
        raise HTTPException(status_code=503, detail=f"Extraction pipeline is not set up: {error}") from error


def _found(value):
    if not value:
        raise HTTPException(status_code=404, detail="Document not found.")
    return value


@router.post("/api/documents/upload")
def document_upload(file: UploadFile = File(...)) -> dict[str, object]:
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The file is empty.")
    try:
        return _pipeline(pipeline_bridge.upload, file.filename or "upload", data)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/documents")
def document_list() -> list[dict]:
    return _pipeline(pipeline_bridge.list_documents)


@router.get("/api/documents/{file_id}")
def document_get(file_id: int) -> dict:
    return _found(_pipeline(pipeline_bridge.get_document, file_id))


@router.post("/api/documents/{file_id}/metadata")
def document_metadata(file_id: int, body: DocumentMetadata) -> dict[str, bool]:
    try:
        _pipeline(pipeline_bridge.save_metadata, file_id, body.title, body.document_type)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"ok": True}


@router.post("/api/documents/{file_id}/approve")
def document_approve(file_id: int) -> dict[str, bool]:
    _pipeline(pipeline_bridge.approve, file_id)
    return {"ok": True}


@router.get("/api/documents/{file_id}/file")
def document_file(file_id: int) -> FileResponse:
    path, name = _found(_pipeline(pipeline_bridge.file_path, file_id))
    return FileResponse(path, filename=name, content_disposition_type="inline")
