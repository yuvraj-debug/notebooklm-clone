import html
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from groq import Groq
from openai import OpenAI

from .config import get_settings

FAST_MODEL = "llama-3.1-8b-instant"
NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b"
BACKUP_MODEL = "openai/gpt-oss-120b"


@dataclass(frozen=True)
class AIResult:
    content: str
    model: str


class AIRouter:
    """Routes work to the best available provider with offline-safe fallbacks."""

    def __init__(self) -> None:
        settings = get_settings()
        self.groq = Groq(api_key=settings.groq_api_key) if settings.groq_api_key else None
        self.nim = (
            OpenAI(api_key=settings.nvidia_nim_api_key, base_url="https://integrate.api.nvidia.com/v1")
            if settings.nvidia_nim_api_key
            else None
        )

    @staticmethod
    def requires_deep_reasoning(query: str) -> bool:
        lowered = query.lower()
        reasoning_signals = (
            "prove", "proof", "derive", "calculate", "calculation", "solve", "equation",
            "step by step", "multi-step", "compare all", "synthesize", "logical",
        )
        return len(query.split()) > 45 or any(signal in lowered for signal in reasoning_signals)

    @staticmethod
    def _fallback_title(content_sample: str) -> str:
        words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]*", content_sample)
        ignored = {"the", "and", "with", "from", "that", "this", "into", "about", "your", "for"}
        significant = [word.capitalize() for word in words if word.lower() not in ignored]
        return " ".join(significant[:5]) or "Untitled Research Note"

    def generate_title(self, content_sample: str) -> str:
        if not self.groq:
            return self._fallback_title(content_sample)
        try:
            response = self.groq.chat.completions.create(
                model=FAST_MODEL,
                temperature=0.25,
                max_tokens=18,
                messages=[{
                    "role": "user",
                    "content": "Generate a strictly 3 to 5 word title summarizing this note. Output ONLY the plain text title.\n\n"
                    + content_sample[:4000],
                }],
            )
            title = (response.choices[0].message.content or "").strip().strip('"')
            cleaned = " ".join(title.split())
            return cleaned[:90] or self._fallback_title(content_sample)
        except Exception:
            return self._fallback_title(content_sample)

    def answer(self, query: str, context: str, history: list[dict[str, str]] | None = None) -> AIResult:
        """Use Nemotron for every response; enable thinking only for genuinely hard work."""
        use_reasoner = self.requires_deep_reasoning(query)
        system = """You are a thoughtful study assistant and Python tutor.
Write in very clear, easy English every time. Give a polished, directly useful answer.
Use the uploaded material when it is relevant, but you may answer from general knowledge when the material does not cover the question. Never claim that a general-knowledge answer came from the uploaded material. For programming, provide complete runnable code, explain it briefly, and use sensible names. Do not mention models, retrieval, citations, or internal tools.
If source excerpts are supplied, treat them as helpful context, not as a restriction."""
        messages: list[dict[str, str]] = [{"role": "system", "content": system}]
        messages.extend((history or [])[-10:])
        prompt = f"UPLOADED MATERIAL (optional):\n{context or 'No matching material was found.'}\n\nUSER REQUEST:\n{query}"
        messages.append({"role": "user", "content": prompt})
        if self.nim:
            try:
                response = self.nim.chat.completions.create(
                    model=NEMOTRON_MODEL,
                    messages=messages,
                    temperature=1.0 if use_reasoner else 0.3,
                    max_tokens=2200,
                    extra_body={
                        "chat_template_kwargs": {"enable_thinking": use_reasoner},
                        **({"reasoning_budget": 8192} if use_reasoner else {}),
                    },
                )
                content = (response.choices[0].message.content or "").strip()
                if content:
                    return AIResult(content, NEMOTRON_MODEL)
            except Exception:
                # A provider limit should be invisible to the learner whenever a backup is configured.
                pass
        if self.groq:
            try:
                response = self.groq.chat.completions.create(
                    model=BACKUP_MODEL,
                    temperature=0.3,
                    max_tokens=2200,
                    messages=messages,
                )
                content = (response.choices[0].message.content or "").strip()
                if content:
                    return AIResult(content, BACKUP_MODEL)
            except Exception:
                pass
        return AIResult(self._local_answer(query, context), "local-study-helper")

    @staticmethod
    def _nvidia_fast_notes_system() -> str:
        return """You are an expert visual note designer. 
Generate richly formatted, colorful, and highly structured notes in pure HTML format.

CRITICAL FORMATTING RULES:
1. DO NOT use any Markdown symbols (NEVER use ###, **, -, or ```).
2. Return ONLY valid, raw HTML elements.
3. Hierarchy & Headings:
   - Use <h2 style="color: #60a5fa; border-bottom: 1px solid #3f3f46; padding-bottom: 4px; margin-top: 18px;">Section Title</h2>
   - Use <h3 style="color: #93c5fd; margin-top: 12px;">Subsection Title</h3>
4. Highlighting & Color Accents:
   - Wrap important keywords and terms in <mark style="background-color: #854d0e; color: #fef08a; padding: 2px 5px; border-radius: 4px; font-weight: 600;">Key Concept</mark>.
   - Wrap rules, libraries, and functions in <span style="color: #38bdf8; font-weight: 600;">Code/Library</span>.
   - Wrap warnings or critical points in <span style="color: #f87171; font-weight: 600;">Important Note</span>.
5. Bullet Points:
   - Always wrap lists inside <ul> and <li> tags with descriptive bold headers:
     <ul>
       <li><strong>Topic:</strong> Description text.</li>
     </ul>
6. Code Blocks:
   - Never use ``` fences. Use styled code containers:
     <pre style="background: #18181b; border: 1px solid #27272a; border-radius: 6px; padding: 12px; color: #a1a1aa; font-family: monospace; overflow-x: auto;"><code># Your code here</code></pre>
7. Key Takeaways / Callout Box:
   - Place summary callouts in:
     <div style="background-color: #1e1b4b; border-left: 4px solid #6366f1; padding: 10px 14px; border-radius: 4px; margin: 12px 0;"><strong>Takeaway:</strong> Summary text here.</div>"""

    def generate_styled_notes(self, context: str, instruction: str) -> dict[str, str]:
        messages: list[dict[str, str]] = [
            {"role": "system", "content": self._nvidia_fast_notes_system()},
            {"role": "user", "content": f"UPLOADED MATERIAL (optional):\n{context or 'No matching material was found.'}\n\nCREATE NOTES FOR:\n{instruction}"},
        ]
        if self.nim:
            try:
                response = self.nim.chat.completions.create(
                    model=NEMOTRON_MODEL,
                    messages=messages,
                    temperature=0.3,
                    max_tokens=2800,
                    extra_body={"chat_template_kwargs": {"enable_thinking": False}},
                )
                content = self._clean_html(response.choices[0].message.content or "")
                if content:
                    return {"html": content, "model": NEMOTRON_MODEL}
            except Exception:
                pass
        if self.groq:
            try:
                response = self.groq.chat.completions.create(
                    model=BACKUP_MODEL,
                    temperature=0.3,
                    max_tokens=2800,
                    messages=messages,
                )
                content = self._clean_html(response.choices[0].message.content or "")
                if content:
                    return {"html": content, "model": BACKUP_MODEL}
            except Exception:
                pass
        return {"html": self._local_styled_notes(context, instruction), "model": "local-study-helper"}

    @staticmethod
    def _clean_html(content: str) -> str:
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:html)?\s*|\s*```$", "", content, flags=re.IGNORECASE)
        return content.strip()

    def transcribe_audio(self, file_path: Path, filename: str) -> str:
        """Turn audio into searchable text with Groq Whisper when credentials are present."""
        if not self.groq:
            return f"Audio source '{filename}'. A transcript is unavailable until GROQ_API_KEY is configured."
        try:
            with file_path.open("rb") as audio_file:
                transcription = self.groq.audio.transcriptions.create(
                    file=(filename, audio_file.read()),
                    model="whisper-large-v3-turbo",
                    response_format="json",
                    temperature=0.0,
                )
            text = getattr(transcription, "text", "").strip()
            return text or f"Audio source '{filename}' did not contain a readable transcript."
        except Exception:
            return f"Audio source '{filename}'. The transcription could not be completed."

    @staticmethod
    def _local_answer(query: str, context: str) -> str:
        if not context:
            return "I can help with that. Add NVIDIA or Groq credentials for a full independent answer, or upload material to get a local source-based summary."
        sentences = re.split(r"(?<=[.!?])\s+", context)
        query_terms = {word.lower() for word in re.findall(r"\w+", query) if len(word) > 2}
        best = sorted(
            sentences,
            key=lambda sentence: sum(term in sentence.lower() for term in query_terms),
            reverse=True,
        )[:3]
        evidence = " ".join(sentence for sentence in best if sentence).strip()
        return f"Here is the clearest information found in your material:\n\n{evidence}" if evidence else "The uploaded material does not contain a clear answer."

    @staticmethod
    def _local_styled_notes(context: str, instruction: str) -> str:
        excerpt = re.sub(r"\[[^\]]+ p\.\d+\]\s*", "", context).strip()[:1200]
        title = html.escape(instruction[:90] or "Source notes")
        return (
            f'<h2 style="font-size: 1.4rem; font-weight: 700; color: #f4f4f5; margin-top: 1rem;">{title}</h2>'
            f'<p><mark style="background-color: #854d0e; color: #fef08a; padding: 2px 4px; border-radius: 3px;">Clear summary</mark> {html.escape(excerpt)}</p>'
            '<h3 style="font-size: 1.15rem; font-weight: 600; color: #e4e4e7;">Study prompts</h3>'
            '<ul><li>Explain this idea in your own words.</li><li><span style="color: #60a5fa; font-weight: 600;">Connect this concept</span> to the broader topic.</li></ul>'
        )


ai_router = AIRouter()
