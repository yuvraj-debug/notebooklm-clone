"use client";

import { FilePenLine, Plus, Trash2 } from "lucide-react";
import type { Note } from "@/types";

interface NoteListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (note: Note) => void;
}

function relativeDate(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "Just now";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes}m ago` : date.toLocaleDateString();
}

export function NoteList({ notes, selectedNoteId, onSelect, onCreate, onDelete }: NoteListProps) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-800 pt-3">
      <div className="mb-2 flex items-center justify-between px-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Notes</p>
        <button type="button" onClick={onCreate} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="New note"><Plus className="h-4 w-4" /></button>
      </div>
      {!notes.length && <p className="px-3 py-5 text-center text-xs text-zinc-500">Create a note or send an answer to one.</p>}
      <ul className="space-y-1 px-2">
        {notes.map((note) => (
          <li key={note.id}>
            <div className={`group flex items-center gap-2 rounded-md px-2 py-2 ${selectedNoteId === note.id ? "bg-amber-400/10" : "hover:bg-zinc-900"}`}>
              <button type="button" onClick={() => onSelect(note.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <FilePenLine className="h-4 w-4 shrink-0 text-amber-400" />
                <span className="min-w-0"><span className="block truncate text-sm text-zinc-200">{note.title}</span><span className="block text-[11px] text-zinc-600">{relativeDate(note.updated_at)}</span></span>
              </button>
              <button type="button" onClick={() => onDelete(note)} aria-label={`Delete ${note.title}`} className="invisible rounded p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-400 group-hover:visible"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
