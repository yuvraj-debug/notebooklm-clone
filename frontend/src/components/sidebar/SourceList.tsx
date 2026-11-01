"use client";

import { FileImage, FileMusic, FileText, Trash2 } from "lucide-react";
import type { SourceDocument } from "@/types";

interface SourceListProps {
  documents: SourceDocument[];
  activeDocumentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (document: SourceDocument) => void;
}

export function SourceList({ documents, activeDocumentId, onSelect, onDelete }: SourceListProps) {
  if (!documents.length) return <p className="px-3 py-5 text-center text-xs text-zinc-500">Your uploaded PDFs will appear here.</p>;
  return (
    <ul className="space-y-1 px-2">
      {documents.map((document) => (
        <li key={document.id}>
          <div className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm ${activeDocumentId === document.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}>
            <button type="button" onClick={() => onSelect(document.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={`View ${document.filename}`}>
              {document.source_type === "image" ? <FileImage className="h-4 w-4 shrink-0 text-violet-400" /> : document.source_type === "audio" ? <FileMusic className="h-4 w-4 shrink-0 text-emerald-400" /> : <FileText className="h-4 w-4 shrink-0 text-sky-400" />}
              <span className="truncate">{document.filename}</span>
            </button>
            <button type="button" onClick={() => onDelete(document)} aria-label={`Delete ${document.filename}`} className="invisible rounded p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-400 group-hover:visible">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="ml-8 -mt-1 pb-1 text-[11px] capitalize text-zinc-600">{document.source_type === "pdf" ? `${document.total_pages} pages` : document.source_type}</p>
        </li>
      ))}
    </ul>
  );
}
