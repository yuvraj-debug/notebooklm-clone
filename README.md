# NotebookAI

A NotebookLM-style research workspace with PDF grounding, page-level citations, streamed AI chat, and a dark Tiptap rich-text editor.

## Run locally

1. In one terminal, start the API:

   ```powershell
   cd backend
   python -m pip install -r requirements.txt
   python -m uvicorn app.main:app --reload --port 8000
   ```

2. In another terminal, start the web app:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

Open `http://localhost:3000`.

## AI configuration

Add provider credentials to [`backend/.env`](backend/.env):

- `GROQ_API_KEY` powers fast titles (`llama-3.1-8b-instant`) and chat / generated notes (`llama-3.3-70b-versatile`).
- `NVIDIA_NIM_API_KEY` powers complex reasoning via `nvidia/nemotron-3-super-120b-a12b`.

Without keys, the app remains usable: it answers from locally retrieved PDF excerpts and generates a source-cited local note template.
