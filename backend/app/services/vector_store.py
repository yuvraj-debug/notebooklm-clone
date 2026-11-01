"""A dependency-light, deterministic in-memory cosine index.

The index intentionally avoids another service for a smooth local setup. It can be
replaced with Chroma without changing the API routes because retrieval exposes
plain chunks and metadata.
"""

import hashlib
import math
import re
from collections import Counter
from dataclasses import dataclass
from threading import RLock

from .pdf_service import ExtractedChunk

TOKEN_RE = re.compile(r"[\w'-]+", re.UNICODE)
VECTOR_SIZE = 512


@dataclass(frozen=True)
class SearchResult:
    id: str
    document_id: str
    doc_name: str
    page_number: int
    text_content: str
    score: float


def _embed(text: str) -> dict[int, float]:
    tokens = TOKEN_RE.findall(text.lower())
    counts = Counter(tokens)
    if not counts:
        return {}
    vector: dict[int, float] = {}
    for token, count in counts.items():
        index = int(hashlib.blake2b(token.encode(), digest_size=4).hexdigest(), 16) % VECTOR_SIZE
        vector[index] = vector.get(index, 0.0) + (1.0 + math.log(count))
    magnitude = math.sqrt(sum(value * value for value in vector.values()))
    return {key: value / magnitude for key, value in vector.items()} if magnitude else {}


class InMemoryVectorStore:
    def __init__(self) -> None:
        self._records: dict[str, tuple[ExtractedChunk, dict[int, float]]] = {}
        self._lock = RLock()

    def add(self, chunks: list[ExtractedChunk]) -> None:
        with self._lock:
            for chunk in chunks:
                self._records[chunk.id] = (chunk, _embed(chunk.text_content))

    def remove_document(self, document_id: str) -> None:
        with self._lock:
            stale_ids = [key for key, (chunk, _) in self._records.items() if chunk.document_id == document_id]
            for key in stale_ids:
                self._records.pop(key, None)

    def search(self, query: str, document_ids: list[str] | None = None, limit: int = 7) -> list[SearchResult]:
        query_vector = _embed(query)
        if not query_vector:
            return []
        allowed = set(document_ids or [])
        with self._lock:
            scored = []
            for chunk, vector in self._records.values():
                if allowed and chunk.document_id not in allowed:
                    continue
                score = sum(value * vector.get(index, 0.0) for index, value in query_vector.items())
                if score > 0:
                    scored.append((score, chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [
            SearchResult(
                id=chunk.id,
                document_id=chunk.document_id,
                doc_name=chunk.doc_name,
                page_number=chunk.page_number,
                text_content=chunk.text_content,
                score=round(score, 4),
            )
            for score, chunk in scored[:limit]
        ]

    def for_documents(self, document_ids: list[str], limit: int = 10) -> list[SearchResult]:
        """Return source-order excerpts when semantic search has no useful match."""
        allowed = set(document_ids)
        with self._lock:
            chunks = [chunk for chunk, _ in self._records.values() if chunk.document_id in allowed]
        chunks.sort(key=lambda chunk: (chunk.doc_name.lower(), chunk.page_number, chunk.chunk_index))
        return [
            SearchResult(chunk.id, chunk.document_id, chunk.doc_name, chunk.page_number, chunk.text_content, 0.0)
            for chunk in chunks[:limit]
        ]


vector_store = InMemoryVectorStore()
