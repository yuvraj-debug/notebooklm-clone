import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from .config import get_settings

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    total_pages INTEGER NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'pdf',
    content_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content_html TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    citations_json TEXT,
    chat_id TEXT,
    model TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
);
"""


def _database_path() -> Path:
    path = get_settings().database_path
    return path if path.is_absolute() else Path.cwd() / path


def initialize_database() -> None:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.executescript(SCHEMA)
        _migrate_schema(connection)


def _migrate_schema(connection: sqlite3.Connection) -> None:
    """Add fields needed by newer workspaces without discarding existing notebooks."""
    document_columns = {row[1] for row in connection.execute("PRAGMA table_info(documents)")}
    if "source_type" not in document_columns:
        connection.execute("ALTER TABLE documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'pdf'")
    if "content_type" not in document_columns:
        connection.execute("ALTER TABLE documents ADD COLUMN content_type TEXT")

    message_columns = {row[1] for row in connection.execute("PRAGMA table_info(chat_messages)")}
    if "chat_id" not in message_columns:
        connection.execute("ALTER TABLE chat_messages ADD COLUMN chat_id TEXT")
    if "model" not in message_columns:
        connection.execute("ALTER TABLE chat_messages ADD COLUMN model TEXT")
    connection.execute(
        "INSERT OR IGNORE INTO chat_threads (id, notebook_id, title) "
        "SELECT DISTINCT 'legacy-' || notebook_id, notebook_id, 'Previous chat' FROM chat_messages"
    )
    connection.execute("UPDATE chat_messages SET chat_id = 'legacy-' || notebook_id WHERE chat_id IS NULL")


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def ensure_notebook(notebook_id: str, name: str = "My notebook") -> None:
    with get_connection() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO notebooks (id, name) VALUES (?, ?)",
            (notebook_id, name),
        )
