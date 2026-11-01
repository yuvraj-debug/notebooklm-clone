import { useState } from 'react';
import { FileUploader } from './FileUploader';
import { NoteList } from './NoteList';
import { SourceList } from './SourceList';
import type { SourceDocument } from '@/types';
import type { Note } from '@/types';

const CollapsibleSidebar = ({
  sidebarOpen,
  setSidebarOpen,
  notebookId,
  onUploaded,
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  documents,
  activeDocumentId,
  onSelectDocument,
  onRemoveDocument,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  notebookId: string;
  onUploaded: (document: SourceDocument) => void;
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (note: Note) => void;
  documents: SourceDocument[];
  activeDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onRemoveDocument: (document: SourceDocument) => void;
}) => {
  return (
    <div className="fixed left-0 top-0 bottom-0 w-[68px] pointer-events-none">
      <div
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        className="absolute left-0 top-0 bottom-0 w-4 pointer-events-all"
      ></div>
      <div
        className={`absolute left-0 top-0 bottom-0 w-64 bg-white shadow-lg transition-transform duration-300 ${sidebarOpen ? 'translate-x-4' : '-translate-x-64'}`}
        pointer-events-all
      >
        <div className="p-4 space-y-4">
          <FileUploader notebookId={notebookId} onUploaded={onUploaded} />
          <NoteList 
            notes={notes} 
            selectedNoteId={selectedNoteId} 
            onSelect={onSelectNote} 
            onCreate={onCreateNote} 
            onDelete={onDeleteNote} 
          />
          <SourceList 
            documents={documents} 
            activeDocumentId={activeDocumentId} 
            onSelect={onSelectDocument} 
            onDelete={onRemoveDocument} 
          />
        </div>
      </div>
    </div>
  );
};

export default CollapsibleSidebar;