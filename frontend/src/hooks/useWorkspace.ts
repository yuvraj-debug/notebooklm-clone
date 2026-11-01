"use client";

import { create } from "zustand";
import type { Note, SourceDocument, ViewMode } from "@/types";

interface WorkspaceState {
  notebookId: string;
  documents: SourceDocument[];
  notes: Note[];
  selectedNoteId: string | null;
  activeDocumentId: string | null;
  activePdfPage: number;
  viewMode: ViewMode;
  highlightedPage: boolean;
  setDocuments: (documents: SourceDocument[]) => void;
  setNotes: (notes: Note[]) => void;
  upsertNote: (note: Note) => void;
  removeNote: (noteId: string) => void;
  selectNote: (noteId: string | null) => void;
  selectDocument: (documentId: string | null) => void;
  setPdfPage: (page: number) => void;
  setViewMode: (view: ViewMode) => void;
  clearPageHighlight: () => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  notebookId: "default-notebook",
  documents: [],
  notes: [],
  selectedNoteId: null,
  activeDocumentId: null,
  activePdfPage: 1,
  viewMode: "chat",
  highlightedPage: false,
  setDocuments: (documents) => set((state) => ({
    documents,
    activeDocumentId: documents.some((document) => document.id === state.activeDocumentId)
      ? state.activeDocumentId
      : documents[0]?.id ?? null,
  })),
  setNotes: (notes) => set((state) => ({
    notes,
    selectedNoteId: state.selectedNoteId ?? notes[0]?.id ?? null,
  })),
  upsertNote: (note) => set((state) => {
    const exists = state.notes.some((entry) => entry.id === note.id);
    const notes = exists ? state.notes.map((entry) => entry.id === note.id ? note : entry) : [note, ...state.notes];
    return { notes, selectedNoteId: note.id };
  }),
  removeNote: (noteId) => set((state) => ({
    notes: state.notes.filter((note) => note.id !== noteId),
    selectedNoteId: state.selectedNoteId === noteId ? null : state.selectedNoteId,
  })),
  selectNote: (selectedNoteId) => set({ selectedNoteId }),
  selectDocument: (activeDocumentId) => set({ activeDocumentId, viewMode: "source" }),
  setPdfPage: (page) => set({ activePdfPage: Math.max(1, page) }),
  setViewMode: (viewMode) => set({ viewMode }),
  clearPageHighlight: () => set({ highlightedPage: false }),
}));
