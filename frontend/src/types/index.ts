export type ViewMode = "chat" | "source";

export interface SourceDocument {
  id: string;
  notebook_id: string;
  filename: string;
  total_pages: number;
  source_type: "pdf" | "image" | "audio";
  content_type?: string | null;
  created_at: string;
  file_url: string;
}

export interface Note {
  id: string;
  notebook_id: string;
  title: string;
  content_html: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  isStreaming?: boolean;
}

export interface ChatThread {
  id: string;
  notebook_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}
