"use client";

import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FilePlus2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Note } from "@/types";
import { EditorToolbar } from "./EditorToolbar";
import { RichTextStyle } from "./TiptapExtensions";
import { marked } from 'marked';

interface RichEditorProps {
  note: Note | null;
  saveStatus: "saved" | "saving" | "error";
  onChange: (changes: Pick<Note, "title" | "content_html">) => void;
  onCreate: () => void;
}

export function RichEditor({ note, saveStatus, onChange, onCreate }: RichEditorProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const noteRef = useRef<Note | null>(note);
  onChangeRef.current = onChange;
  noteRef.current = note;
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      RichTextStyle,
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: note?.content_html || "<p></p>",
    editorProps: { attributes: { class: "editor-content printable-note prose prose-invert max-w-none p-6 focus:outline-none min-h-[500px] text-zinc-100 [&_h2]:text-blue-400 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h3]:text-blue-300 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_mark]:bg-amber-600/40 [&_mark]:text-amber-200 [&_mark]:px-1 [&_mark]:rounded", "data-placeholder": "Start writing, or ask AI to create grounded notes…" } },
    onUpdate: ({ editor: current }) => {
      const currentNote = noteRef.current;
      if (currentNote) onChangeRef.current({ title: currentNote.title, content_html: current.getHTML() });
    },
  });

  // Configure marked to output clean, raw HTML
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  useEffect(() => {
    if (!editor) return;
    // Remove any accidental markdown backticks before setting content
    let cleanText = (note?.content_html || "<p></p>")
      .replace(/```html/g, '')
      .replace(/```/g, '')
      .trim();

    // Check if the string is already rich HTML or raw Markdown
    const isHtml = /<[a-z][\s\S]*>/i.test(cleanText);
    const formattedContent = isHtml ? cleanText : (marked.parse(cleanText) as string);

    // Only update if content has changed to avoid cursor jumps
    if (editor.getHTML() !== formattedContent) {
      editor.commands.setContent(formattedContent);
    }
  }, [note?.content_html, editor]); // Switching notes should never leak the former document's content.

  useEffect(() => { if (editingTitle) titleInputRef.current?.focus(); }, [editingTitle]);

  if (!note || !editor) return <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 p-8 text-center"><FilePlus2 className="h-10 w-10 text-zinc-600" /><h2 className="font-medium text-zinc-300">A clear place to think</h2><p className="max-w-sm text-sm leading-6 text-zinc-500">Create a blank note, or generate source-grounded notes from the chat and your PDFs.</p><button type="button" onClick={onCreate} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-zinc-950">New note</button></div>;
  return (
    <div className={`flex h-full min-h-0 flex-col bg-zinc-950 ${focusMode ? "fixed inset-0 z-50" : ""}`}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 px-4">
        {editingTitle ? <input ref={titleInputRef} value={note.title} onChange={(event) => onChange({ title: event.target.value, content_html: note.content_html })} onBlur={() => setEditingTitle(false)} onKeyDown={(event) => { if (event.key === "Enter") setEditingTitle(false); if (event.key === "Escape") setEditingTitle(false); }} className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none ring-1 ring-amber-400/60" /> : <button type="button" onDoubleClick={() => setEditingTitle(true)} className="group flex min-w-0 flex-1 items-center gap-2 text-left"><span className="truncate text-base font-semibold text-zinc-100">{note.title}</span><Pencil className="h-3.5 w-3.5 shrink-0 text-zinc-600 opacity-0 group-hover:opacity-100" /></button>}
        <span className={`text-xs ${saveStatus === "error" ? "text-red-400" : "text-zinc-500"}`}>{saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved"}</span>
        {focusMode && <button type="button" onClick={() => setFocusMode(false)} className="rounded p-1 text-zinc-400 hover:bg-zinc-800" aria-label="Exit focus mode"><X className="h-4 w-4" /></button>}
      </header>
      <EditorToolbar editor={editor} focusMode={focusMode} onFocusMode={() => setFocusMode((current) => !current)} />
      <div className="min-h-0 flex-1 overflow-y-auto"><EditorContent editor={editor} /></div>
    </div>
  );
}
