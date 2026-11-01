"use client";

import { ChevronLeft, ChevronRight, FileWarning, LoaderCircle } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import { useEffect, useRef, useState } from "react";
import type { SourceDocument } from "@/types";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// A CDN worker avoids Next.js attempting to minify PDF.js's already-built ESM worker.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PDFViewerProps {
  document: SourceDocument | null;
  page: number;
  highlighted: boolean;
  onPageChange: (page: number) => void;
  onHighlightComplete: () => void;
}

export function PDFViewer({ document, page, highlighted, onPageChange, onHighlightComplete }: PDFViewerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [width, setWidth] = useState(620);

  useEffect(() => {
    if (!panelRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(250, Math.floor(entry.contentRect.width - 48))));
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!highlighted) return;
    const timeout = window.setTimeout(onHighlightComplete, 1500);
    return () => window.clearTimeout(timeout);
  }, [highlighted, onHighlightComplete]);

  useEffect(() => { if (document) setPageCount(document.total_pages); }, [document]);

  if (!document) return <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500"><FileWarning className="h-9 w-9" /><p className="max-w-xs text-sm">Select a PDF from the materials panel to read it here.</p></div>;
  const clampedPage = Math.min(Math.max(1, page), pageCount || document.total_pages);
  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col bg-zinc-950">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3 py-2">
        <p className="max-w-[55%] truncate text-sm font-medium text-zinc-200">{document.filename}</p>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <button type="button" className="rounded p-1 hover:bg-zinc-800 disabled:opacity-30" disabled={clampedPage <= 1} onClick={() => onPageChange(clampedPage - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          <label className="flex items-center gap-1">Page <input aria-label="Page number" value={clampedPage} min={1} max={pageCount || document.total_pages} type="number" onChange={(event) => onPageChange(Math.max(1, Number(event.target.value) || 1))} className="w-10 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-center text-zinc-200" /> / {pageCount || document.total_pages}</label>
          <button type="button" className="rounded p-1 hover:bg-zinc-800 disabled:opacity-30" disabled={clampedPage >= (pageCount || document.total_pages)} onClick={() => onPageChange(clampedPage + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <Document
          file={`${API_URL}${document.file_url}`}
          loading={<div className="flex justify-center py-16 text-zinc-500"><LoaderCircle className="animate-spin" /></div>}
          error={<p className="mx-auto max-w-md rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-300">The PDF could not be displayed. Check that the API server is running and the file is available.</p>}
          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
        >
          <div className={`mx-auto w-fit bg-white shadow-2xl ${highlighted ? "pdf-page-highlight" : ""}`}>
            <Page pageNumber={clampedPage} width={width} renderTextLayer renderAnnotationLayer />
          </div>
        </Document>
      </div>
    </div>
  );
}
