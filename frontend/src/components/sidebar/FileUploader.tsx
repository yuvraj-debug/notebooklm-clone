"use client";

import { FileUp, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import type { SourceDocument } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface FileUploaderProps {
  notebookId: string;
  onUploaded: (document: SourceDocument) => void;
}

export function FileUploader({ notebookId, onUploaded }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/\.(pdf|png|jpe?g|webp|gif|bmp|mp3|wav|m4a|ogg|flac|webm|aac|mp4|mpeg|mpga)$/i.test(file.name)) {
      setError("Choose a PDF, image, or audio file.");
      return;
    }
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("notebook_id", notebookId);
    formData.append("file", file);
    try {
      const response = await fetch(`${API_URL}/api/documents/upload`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Upload failed.");
      onUploaded(result as SourceDocument);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="px-3 pb-3">
      <input ref={inputRef} type="file" accept="application/pdf,image/*,audio/*,.m4a,.flac,.webm" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }}
        disabled={uploading}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm transition ${dragging ? "border-amber-400 bg-amber-400/10" : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"} disabled:cursor-wait disabled:opacity-60`}
      >
        {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4 text-amber-400" />}
        {uploading ? "Preparing material…" : "Add material"}
      </button>
      <p className="mt-2 text-center text-[10px] leading-4 text-zinc-600">PDF, image, or audio · Images are OCR indexed · Audio is transcribed when Groq is connected</p>
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
