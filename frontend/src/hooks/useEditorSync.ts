"use client";

import { useEffect, useRef, useState } from "react";
import type { Note } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Debounced persistence for title and Tiptap HTML changes. */
export function useEditorSync(note: Note | null, onSaved: (note: Note) => void) {
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const latestSavedId = useRef<string | null>(null);
  const lastPersistedSignature = useRef<string | null>(null);
  const observedNoteId = useRef<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const snapshot = note;
    const signature = `${snapshot.id}\u0000${snapshot.title}\u0000${snapshot.content_html}`;
    if (observedNoteId.current !== snapshot.id) {
      // A note loaded from the API is already persisted; only subsequent edits should save.
      observedNoteId.current = snapshot.id;
      lastPersistedSignature.current = signature;
      setStatus("saved");
      return;
    }
    if (lastPersistedSignature.current === signature) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}/api/notes/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        });
        if (!response.ok) throw new Error("Could not save note");
        const saved = (await response.json()) as Note;
        latestSavedId.current = saved.id;
        lastPersistedSignature.current = signature;
        onSaved(saved);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [note?.id, note?.title, note?.content_html, onSaved]);

  return { status, latestSavedId };
}
