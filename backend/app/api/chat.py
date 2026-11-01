import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..core.ai_router import ai_router
from ..core.database import ensure_notebook, get_connection
from ..services.vector_store import SearchResult, vector_store

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    notebook_id: str
    chat_id: str
    message: str = Field(min_length=1, max_length=8000)
    document_ids: list[str] | None = None


class CreateChatRequest(BaseModel):
    notebook_id: str
    title: str = Field(default="New chat", max_length=100)


class ChatThreadResponse(BaseModel):
    id: str
    notebook_id: str
    title: str
    created_at: str
    updated_at: str


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    model: str | None = None
    created_at: str


def context_from_results(results: list[SearchResult]) -> str:
    return "\n\n".join(f"[{result.doc_name} p.{result.page_number}]\n{result.text_content}" for result in results)


def _serialize_thread(row: object) -> ChatThreadResponse:
    return ChatThreadResponse(**dict(row))


def _ensure_chat(notebook_id: str, chat_id: str) -> None:
    ensure_notebook(notebook_id)
    with get_connection() as connection:
        row = connection.execute("SELECT id FROM chat_threads WHERE id = ? AND notebook_id = ?", (chat_id, notebook_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Chat not found. Create a new chat and try again.")


def _history_for_chat(chat_id: str) -> list[dict[str, str]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT role, content FROM chat_messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 10", (chat_id,)
        ).fetchall()
    return [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]


def _title_from_message(message: str) -> str:
    compact = " ".join(message.split())
    return f"{compact[:57].rstrip()}…" if len(compact) > 58 else compact or "New chat"


def _save_message(notebook_id: str, chat_id: str, role: str, content: str, model: str | None = None) -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO chat_messages (id, notebook_id, chat_id, role, content, citations_json, model) VALUES (?, ?, ?, ?, ?, NULL, ?)",
            (str(uuid.uuid4()), notebook_id, chat_id, role, content, model),
        )
        if role == "user":
            connection.execute(
                "UPDATE chat_threads SET title = CASE WHEN title = 'New chat' THEN ? ELSE title END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (_title_from_message(content), chat_id),
            )
        else:
            connection.execute("UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (chat_id,))


@router.get("/threads", response_model=list[ChatThreadResponse])
def list_threads(notebook_id: str) -> list[ChatThreadResponse]:
    ensure_notebook(notebook_id)
    with get_connection() as connection:
        rows = connection.execute("SELECT * FROM chat_threads WHERE notebook_id = ? ORDER BY updated_at DESC, created_at DESC", (notebook_id,)).fetchall()
    return [_serialize_thread(row) for row in rows]


@router.post("/threads", response_model=ChatThreadResponse, status_code=status.HTTP_201_CREATED)
def create_thread(request: CreateChatRequest) -> ChatThreadResponse:
    ensure_notebook(request.notebook_id)
    chat_id = str(uuid.uuid4())
    title = " ".join(request.title.split())[:100] or "New chat"
    with get_connection() as connection:
        connection.execute("INSERT INTO chat_threads (id, notebook_id, title) VALUES (?, ?, ?)", (chat_id, request.notebook_id, title))
        row = connection.execute("SELECT * FROM chat_threads WHERE id = ?", (chat_id,)).fetchone()
    return _serialize_thread(row)


@router.get("/messages", response_model=list[ChatMessageResponse])
def list_messages(notebook_id: str, chat_id: str) -> list[ChatMessageResponse]:
    _ensure_chat(notebook_id, chat_id)
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, role, content, model, created_at FROM chat_messages WHERE notebook_id = ? AND chat_id = ? ORDER BY created_at, rowid",
            (notebook_id, chat_id),
        ).fetchall()
    return [ChatMessageResponse(**dict(row)) for row in rows]


@router.delete("/threads/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(chat_id: str, notebook_id: str) -> None:
    with get_connection() as connection:
        thread = connection.execute("SELECT id FROM chat_threads WHERE id = ? AND notebook_id = ?", (chat_id, notebook_id)).fetchone()
        if not thread:
            raise HTTPException(status_code=404, detail="Chat not found.")
        connection.execute("DELETE FROM chat_messages WHERE chat_id = ?", (chat_id,))
        connection.execute("DELETE FROM chat_threads WHERE id = ?", (chat_id,))


@router.post("")
async def chat(request: ChatRequest) -> StreamingResponse:
    _ensure_chat(request.notebook_id, request.chat_id)
    history = _history_for_chat(request.chat_id)
    _save_message(request.notebook_id, request.chat_id, "user", request.message)
    results = vector_store.search(request.message, request.document_ids)
    context = context_from_results(results)

    async def event_stream() -> AsyncIterator[str]:
        try:
            result = await run_in_threadpool(ai_router.answer, request.message, context, history)
            for offset in range(0, len(result.content), 28):
                yield f"event: token\ndata: {json.dumps({'text': result.content[offset : offset + 28]})}\n\n"
                await asyncio.sleep(0)
            yield f"event: meta\ndata: {json.dumps({'model': result.model})}\n\n"
            _save_message(request.notebook_id, request.chat_id, "assistant", result.content, result.model)
            yield "event: done\ndata: {}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
