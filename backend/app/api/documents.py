import shutil
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ..core.config import get_settings
from ..core.database import ensure_notebook, get_connection
from ..core.ai_router import ai_router
from ..services.pdf_service import ExtractedChunk, extract_image_chunks, extract_pdf_chunks
from ..services.vector_store import vector_store

router = APIRouter(prefix="/api/documents", tags=["documents"])


class DocumentResponse(BaseModel):
    id: str
    notebook_id: str
    filename: str
    total_pages: int
    source_type: str
    content_type: str | None = None
    created_at: str
    file_url: str


def _serialize_document(row: object) -> DocumentResponse:
    values = dict(row)  # sqlite Row
    return DocumentResponse(
        id=values["id"],
        notebook_id=values["notebook_id"],
        filename=values["filename"],
        total_pages=values["total_pages"],
        created_at=values["created_at"],
        source_type=values["source_type"],
        content_type=values.get("content_type"),
        file_url=f"/uploads/{quote(Path(values['file_path']).name)}",
    )


@router.get("", response_model=list[DocumentResponse])
def list_documents(notebook_id: str) -> list[DocumentResponse]:
    ensure_notebook(notebook_id)
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, notebook_id, filename, file_path, total_pages, source_type, content_type, created_at FROM documents WHERE notebook_id = ? ORDER BY created_at DESC",
            (notebook_id,),
        ).fetchall()
    return [_serialize_document(row) for row in rows]


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    notebook_id: str = Form(...),
    file: UploadFile = File(...),
) -> DocumentResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Choose a PDF, image, or audio file.")
    suffix = Path(file.filename).suffix.lower()
    source_type = _source_type_for_suffix(suffix)
    if not source_type:
        raise HTTPException(status_code=400, detail="Supported materials: PDF, PNG, JPG, WEBP, MP3, WAV, M4A, OGG, FLAC, and WEBM.")
    ensure_notebook(notebook_id)
    document_id = str(uuid.uuid4())
    upload_dir = get_settings().upload_dir
    upload_dir = upload_dir if upload_dir.is_absolute() else Path.cwd() / upload_dir
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_file = upload_dir / f"{document_id}{suffix}"
    safe_filename = Path(file.filename).name
    try:
        with stored_file.open("wb") as output:
            shutil.copyfileobj(file.file, output)
        if source_type == "pdf":
            total_pages, chunks = extract_pdf_chunks(stored_file, document_id, safe_filename)
        elif source_type == "image":
            total_pages, chunks = extract_image_chunks(stored_file, document_id, safe_filename)
        else:
            transcript = await run_in_threadpool(ai_router.transcribe_audio, stored_file, safe_filename)
            total_pages = 1
            chunks = [ExtractedChunk(
                id=str(uuid.uuid4()), document_id=document_id, doc_name=safe_filename,
                page_number=1, chunk_index=0, text_content=transcript,
            )]
        if total_pages == 0:
            raise ValueError("The PDF has no pages.")
        with get_connection() as connection:
            connection.execute(
                "INSERT INTO documents (id, notebook_id, filename, file_path, total_pages, source_type, content_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (document_id, notebook_id, safe_filename, str(stored_file), total_pages, source_type, file.content_type),
            )
            connection.executemany(
                "INSERT INTO document_chunks (id, document_id, page_number, chunk_index, text_content) VALUES (?, ?, ?, ?, ?)",
                [(chunk.id, chunk.document_id, chunk.page_number, chunk.chunk_index, chunk.text_content) for chunk in chunks],
            )
        vector_store.add(chunks)
    except Exception as exc:
        stored_file.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not process this PDF: {exc}") from exc
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, notebook_id, filename, file_path, total_pages, source_type, content_type, created_at FROM documents WHERE id = ?", (document_id,)
        ).fetchone()
    return _serialize_document(row)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str) -> None:
    with get_connection() as connection:
        row = connection.execute("SELECT file_path FROM documents WHERE id = ?", (document_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found.")
        connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    vector_store.remove_document(document_id)
    file_path = Path(row["file_path"])
    upload_dir = get_settings().upload_dir
    upload_dir = upload_dir if upload_dir.is_absolute() else Path.cwd() / upload_dir
    try:
        file_path.resolve().relative_to(upload_dir.resolve())
        file_path.unlink(missing_ok=True)
    except (OSError, ValueError):
        pass


def _source_type_for_suffix(suffix: str) -> str | None:
    if suffix == ".pdf":
        return "pdf"
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}:
        return "image"
    if suffix in {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".aac", ".mp4", ".mpeg", ".mpga"}:
        return "audio"
    return None
