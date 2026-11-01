from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import chat, documents, notes
from .core.config import get_settings
from .core.database import get_connection, initialize_database
from .services.pdf_service import ExtractedChunk
from .services.vector_store import vector_store


def _restore_vector_index() -> None:
    with get_connection() as connection:
        rows = connection.execute(
            """SELECT c.id, c.document_id, c.page_number, c.chunk_index, c.text_content, d.filename
               FROM document_chunks AS c JOIN documents AS d ON d.id = c.document_id"""
        ).fetchall()
    vector_store.add([
        ExtractedChunk(
            id=row["id"], document_id=row["document_id"], doc_name=row["filename"],
            page_number=row["page_number"], chunk_index=row["chunk_index"], text_content=row["text_content"],
        )
        for row in rows
    ])


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    _restore_vector_index()
    settings = get_settings()
    upload_dir = settings.upload_dir if settings.upload_dir.is_absolute() else Path.cwd() / settings.upload_dir
    upload_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="NotebookLM Clone API", version="1.0.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(notes.router)

uploads_dir = settings.upload_dir if settings.upload_dir.is_absolute() else Path.cwd() / settings.upload_dir
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
