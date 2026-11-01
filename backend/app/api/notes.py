import re
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from ..core.ai_router import ai_router
from ..core.database import ensure_notebook, get_connection
from ..services.vector_store import vector_store
from .chat import context_from_results

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NoteResponse(BaseModel):
    id: str
    notebook_id: str
    title: str
    content_html: str
    created_at: str
    updated_at: str


class SaveNoteRequest(BaseModel):
    id: str | None = None
    notebook_id: str
    title: str = Field(default="Untitled note", max_length=160)
    content_html: str = Field(default="")


class GenerateNoteRequest(BaseModel):
    notebook_id: str
    instruction: str = Field(min_length=1, max_length=4000)
    document_ids: list[str] | None = None


def _serialize_note(row: object) -> NoteResponse:
    return NoteResponse(**dict(row))


def _document_ids_for_notebook(notebook_id: str) -> list[str]:
    with get_connection() as connection:
        rows = connection.execute("SELECT id FROM documents WHERE notebook_id = ?", (notebook_id,)).fetchall()
    return [row["id"] for row in rows]


def _save_note(payload: SaveNoteRequest) -> NoteResponse:
    ensure_notebook(payload.notebook_id)
    note_id = payload.id or str(uuid.uuid4())
    title = " ".join(payload.title.split())[:160] or "Untitled note"
    with get_connection() as connection:
        existing = connection.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if existing:
            connection.execute(
                "UPDATE notes SET title = ?, content_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND notebook_id = ?",
                (title, payload.content_html, note_id, payload.notebook_id),
            )
        else:
            connection.execute(
                "INSERT INTO notes (id, notebook_id, title, content_html) VALUES (?, ?, ?, ?)",
                (note_id, payload.notebook_id, title, payload.content_html),
            )
        row = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Note does not belong to this notebook.")
    return _serialize_note(row)


@router.get("", response_model=list[NoteResponse])
def list_notes(notebook_id: str) -> list[NoteResponse]:
    ensure_notebook(notebook_id)
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM notes WHERE notebook_id = ? ORDER BY updated_at DESC, created_at DESC", (notebook_id,)
        ).fetchall()
    return [_serialize_note(row) for row in rows]


@router.post("/save", response_model=NoteResponse)
def save_note(payload: SaveNoteRequest) -> NoteResponse:
    return _save_note(payload)


@router.post("/generate", response_model=NoteResponse)
async def generate_note(payload: GenerateNoteRequest) -> NoteResponse:
    ensure_notebook(payload.notebook_id)
    document_ids = payload.document_ids or _document_ids_for_notebook(payload.notebook_id)
    if not document_ids:
        raise HTTPException(status_code=400, detail="Upload at least one PDF before generating a note.")
    results = vector_store.search(payload.instruction, document_ids, limit=10)
    if not results:
        results = vector_store.for_documents(document_ids, limit=10)
    context = context_from_results(results)
    generated = await run_in_threadpool(ai_router.generate_styled_notes, context, payload.instruction)
    sample = re.sub(r"<[^>]+>", " ", generated["html"])
    title = await run_in_threadpool(ai_router.generate_title, sample)
    return _save_note(SaveNoteRequest(
        notebook_id=payload.notebook_id,
        title=title,
        content_html=generated["html"],
    ))


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str) -> None:
    with get_connection() as connection:
        deleted = connection.execute("DELETE FROM notes WHERE id = ?", (note_id,)).rowcount
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found.")
