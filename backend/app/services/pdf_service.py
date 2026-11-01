import re
import uuid
from dataclasses import dataclass
from pathlib import Path

import fitz
from PIL import Image

try:
    import pytesseract
except ImportError:  # pragma: no cover - optional operating-system OCR binary
    pytesseract = None


@dataclass(frozen=True)
class ExtractedChunk:
    id: str
    document_id: str
    doc_name: str
    page_number: int
    chunk_index: int
    text_content: str

    @property
    def metadata(self) -> dict[str, str | int]:
        return {
            "document_id": self.document_id,
            "doc_name": self.doc_name,
            "page": self.page_number,
            "chunk_id": self.id,
        }


def _word_chunks(text: str, chunk_size: int = 400, overlap: int = 50) -> list[str]:
    """Make word-aware overlapping chunks, preserving readable text."""
    words = re.findall(r"\S+", text)
    if not words:
        return []
    step = chunk_size - overlap
    return [" ".join(words[start : start + chunk_size]) for start in range(0, len(words), step)]


def extract_pdf_chunks(file_path: Path, document_id: str, filename: str) -> tuple[int, list[ExtractedChunk]]:
    """Extract selectable PDF text page-by-page and chunk it for retrieval."""
    chunks: list[ExtractedChunk] = []
    with fitz.open(file_path) as pdf:
        total_pages = pdf.page_count
        for page_index, page in enumerate(pdf):
            page_text = page.get_text("text").strip()
            for chunk_index, text in enumerate(_word_chunks(page_text)):
                chunks.append(
                    ExtractedChunk(
                        id=str(uuid.uuid4()),
                        document_id=document_id,
                        doc_name=filename,
                        page_number=page_index + 1,
                        chunk_index=chunk_index,
                        text_content=text,
                    )
                )
    return total_pages, chunks


def extract_image_chunks(file_path: Path, document_id: str, filename: str) -> tuple[int, list[ExtractedChunk]]:
    """Index visible image text through OCR while retaining a useful fallback description."""
    with Image.open(file_path) as image:
        width, height = image.size
        description = f"Image source '{filename}' ({width} × {height} pixels)."
        extracted_text = ""
        if pytesseract:
            try:
                extracted_text = pytesseract.image_to_string(image).strip()
            except Exception:
                # Tesseract may not be installed even when pytesseract is available.
                extracted_text = ""
    text = f"{description} {extracted_text or 'No readable text was detected in this image.'}"
    return 1, [ExtractedChunk(
        id=str(uuid.uuid4()),
        document_id=document_id,
        doc_name=filename,
        page_number=1,
        chunk_index=0,
        text_content=text,
    )]
