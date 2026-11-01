"use client";

import { BookOpenText, FileText, MessageSquareText, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RichEditor } from "@/components/editor/RichEditor";
import { FileUploader } from "@/components/sidebar/FileUploader";
import { NoteList } from "@/components/sidebar/NoteList";
import { SourceList } from "@/components/sidebar/SourceList";
import { ChatInterface } from "@/components/viewer/ChatInterface";
import { MaterialViewer } from "@/components/viewer/MaterialViewer";
import { PDFViewer } from "@/components/viewer/PDFViewer";
import { useEditorSync } from "@/hooks/useEditorSync";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { ChatMessage, Note, SourceDocument } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export default function WorkspacePage() {
  const workspace = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const selectedNote = useMemo(() => workspace.notes.find((note) => note.id === workspace.selectedNoteId) ?? null, [workspace.notes, workspace.selectedNoteId]);
  const selectedDocument = useMemo(() => workspace.documents.find((document) => document.id === workspace.activeDocumentId) ?? null, [workspace.documents, workspace.activeDocumentId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`${API_URL}/api/documents?notebook_id=${encodeURIComponent(workspace.notebookId)}`),
      fetch(`${API_URL}/api/notes?notebook_id=${encodeURIComponent(workspace.notebookId)}`),
    ]).then(async ([documentsResponse, notesResponse]) => {
      if (!documentsResponse.ok || !notesResponse.ok) throw new Error("Could not load your notebook.");
      return [await documentsResponse.json() as SourceDocument[], await notesResponse.json() as Note[]] as const;
    }).then(([documents, notes]) => { if (active) { workspace.setDocuments(documents); workspace.setNotes(notes); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your notebook."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // The workspace identifier is deliberately stable for this single-notebook demo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.notebookId]);

  const onSaved = useCallback((saved: Note) => workspace.upsertNote(saved), [workspace]);
  const { status: saveStatus } = useEditorSync(selectedNote, onSaved);

  const createBlankNote = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/notes/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notebook_id: workspace.notebookId, title: "Untitled note", content_html: "<p></p>" }) });
      if (!response.ok) throw new Error("Could not create a note.");
      workspace.upsertNote(await response.json() as Note);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a note."); }
  }, [workspace]);

  const updateActiveNote = useCallback((changes: Pick<Note, "title" | "content_html">) => {
    if (!selectedNote) return;
    workspace.upsertNote({ ...selectedNote, ...changes, updated_at: new Date().toISOString() });
  }, [selectedNote, workspace]);

  async function deleteDocument(document: SourceDocument) {
    if (!window.confirm(`Delete “${document.filename}”? Its extracted source text will also be removed.`)) return;
    try {
      const response = await fetch(`${API_URL}/api/documents/${document.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete document.");
      workspace.setDocuments(workspace.documents.filter((entry) => entry.id !== document.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete document."); }
  }

  async function deleteNote(note: Note) {
    if (!window.confirm(`Delete “${note.title}”?`)) return;
    try {
      const response = await fetch(`${API_URL}/api/notes/${note.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete note.");
      workspace.removeNote(note.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete note."); }
  }

  async function generateNotes() {
    const instruction = window.prompt("What notes should I create from your sources?", "Create a concise study guide with key concepts and warnings.");
    if (!instruction?.trim()) return;
    setGenerating(true); setError(null);
    try {
      const response = await fetch(`${API_URL}/api/notes/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notebook_id: workspace.notebookId, instruction, document_ids: workspace.documents.map((document) => document.id) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Could not generate notes.");
      workspace.upsertNote(result as Note);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate notes."); } finally { setGenerating(false); }
  }

  async function sendToNote(message: ChatMessage) {
    const html = `<h2 style="font-size: 1.4rem; font-weight: 700; color: #f4f4f5; margin-top: 1rem;">Assistant answer</h2><p>${escapeHtml(message.content).replace(/\n/g, "<br />")}</p>`;
    try {
      const response = await fetch(`${API_URL}/api/notes/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notebook_id: workspace.notebookId, title: "Grounded assistant answer", content_html: html }) });
      if (!response.ok) throw new Error("Could not save answer as a note.");
      workspace.upsertNote(await response.json() as Note);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save answer as a note."); }
  }

  return (
    <main className="min-h-screen bg-zinc-950 lg:grid lg:h-screen lg:grid-cols-[260px_minmax(360px,0.9fr)_minmax(420px,1.1fr)] lg:overflow-hidden">
      <aside className="flex min-h-[360px] flex-col border-b border-zinc-800 bg-zinc-950 lg:min-h-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-4"><div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-zinc-950"><BookOpenText className="h-4 w-4" /></div><div><h1 className="text-sm font-semibold">NotebookAI</h1><p className="text-[11px] text-zinc-500">Grounded workspace</p></div></div>
        <FileUploader notebookId={workspace.notebookId} onUploaded={(document) => { workspace.setDocuments([document, ...workspace.documents]); workspace.selectDocument(document.id); }} />
        <section className="max-h-64 overflow-y-auto"><div className="mb-2 flex items-center justify-between px-3"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Materials</p><button type="button" title="Generate rich notes" disabled={!workspace.documents.length || generating} onClick={() => void generateNotes()} className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" />{generating ? "Writing…" : "Make notes"}</button></div><SourceList documents={workspace.documents} activeDocumentId={workspace.activeDocumentId} onSelect={workspace.selectDocument} onDelete={(document) => void deleteDocument(document)} /></section>
        <NoteList notes={workspace.notes} selectedNoteId={workspace.selectedNoteId} onSelect={workspace.selectNote} onCreate={() => void createBlankNote()} onDelete={(note) => void deleteNote(note)} />
      </aside>

      <section className="flex min-h-[560px] min-w-0 flex-col border-b border-zinc-800 bg-zinc-950 lg:min-h-0 lg:border-b-0 lg:border-r">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-zinc-800 bg-zinc-900/70 px-3"><button type="button" onClick={() => workspace.setViewMode("chat")} className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs ${workspace.viewMode === "chat" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}><MessageSquareText className="h-3.5 w-3.5" />Chat</button><button type="button" onClick={() => workspace.setViewMode("source")} className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs ${workspace.viewMode === "source" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}><FileText className="h-3.5 w-3.5" />Material</button><span className="ml-auto text-[11px] text-zinc-600">{workspace.documents.length} item{workspace.documents.length === 1 ? "" : "s"}</span></div>
        <div className="min-h-0 flex-1"><div className={`h-full ${workspace.viewMode === "chat" ? "" : "hidden"}`}><ChatInterface notebookId={workspace.notebookId} documentIds={workspace.documents.map((document) => document.id)} hasSources={workspace.documents.length > 0} onSendToNote={(message) => void sendToNote(message)} /></div><div className={`h-full ${workspace.viewMode === "source" ? "" : "hidden"}`}>{selectedDocument?.source_type === "pdf" ? <PDFViewer document={selectedDocument} page={workspace.activePdfPage} highlighted={workspace.highlightedPage} onPageChange={workspace.setPdfPage} onHighlightComplete={workspace.clearPageHighlight} /> : <MaterialViewer document={selectedDocument} />}</div></div>
      </section>

      <section className="min-h-[560px] min-w-0 lg:min-h-0"><RichEditor note={selectedNote} saveStatus={saveStatus} onChange={updateActiveNote} onCreate={() => void createBlankNote()} /></section>
      {(error || loading) && <div role={error ? "alert" : "status"} className={`fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg border px-3 py-2 text-sm shadow-xl ${error ? "border-red-500/40 bg-red-950 text-red-200" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>{error ?? "Loading notebook…"}{error && <button type="button" onClick={() => setError(null)} className="ml-3 text-zinc-400 hover:text-white">Dismiss</button>}</div>}
    </main>
  );
}
