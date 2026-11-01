"use client";

import { FileImage, FileMusic } from "lucide-react";
import type { SourceDocument } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function MaterialViewer({ document }: { document: SourceDocument | null }) {
  if (!document) return <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500"><FileImage className="h-9 w-9" /><p className="max-w-xs text-sm">Choose a material from the left panel to preview it here.</p></div>;
  const url = `${API_URL}${document.file_url}`;
  if (document.source_type === "image") return <div className="flex h-full min-h-0 flex-col bg-zinc-950"><header className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/90 px-3 py-2"><FileImage className="h-4 w-4 text-violet-400" /><p className="truncate text-sm font-medium text-zinc-200">{document.filename}</p></header><div className="min-h-0 flex flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,#27272a,transparent_65%)] p-6"><img src={url} alt={document.filename} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" /></div></div>;
  return <div className="flex h-full flex-col bg-zinc-950"><header className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/90 px-3 py-2"><FileMusic className="h-4 w-4 text-emerald-400" /><p className="truncate text-sm font-medium text-zinc-200">{document.filename}</p></header><div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300"><FileMusic className="h-8 w-8" /></div><h2 className="text-base font-semibold text-zinc-100">Audio material</h2><p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">Play the recording here. When a Groq key is configured, its transcript is added to your searchable material automatically.</p><audio controls src={url} className="mt-6 w-full max-w-md" /></div></div>;
}
