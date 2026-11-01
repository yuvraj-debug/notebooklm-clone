"use client";

import { ArrowUp, BookOpenCheck, Code2, LoaderCircle, MessageCirclePlus, NotebookPen, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatThread } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ChatInterfaceProps {
  notebookId: string;
  documentIds: string[];
  hasSources: boolean;
  onSendToNote: (message: ChatMessage) => void;
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

const PYTHON_KEYWORDS = new Set(["and", "as", "assert", "break", "class", "continue", "def", "del", "elif", "else", "except", "False", "finally", "for", "from", "if", "import", "in", "is", "lambda", "None", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield", "print", "open"]);

function CodeBlock({ language, code }: { language: string; code: string }) {
  const tokens = code.split(/(#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b[A-Za-z_][A-Za-z0-9_]*\b)/g);
  return <pre className="my-3 overflow-x-auto rounded-xl border border-zinc-700 bg-[#101014] p-3 text-[13px] leading-6 shadow-inner"><div className="mb-2 flex items-center gap-1.5 border-b border-zinc-800 pb-2 text-[10px] uppercase tracking-wider text-zinc-500"><Code2 className="h-3.5 w-3.5 text-sky-400" />{language || "code"}</div><code className="font-mono text-zinc-200">{tokens.map((token, index) => <span key={index} className={token.startsWith("#") ? "text-zinc-500" : token.startsWith("\"") || token.startsWith("'") ? "text-emerald-300" : PYTHON_KEYWORDS.has(token) ? "font-semibold text-violet-300" : token === "print" || token === "open" ? "text-sky-300" : ""}>{token}</span>)}</code></pre>;
}

function AssistantText({ content }: { content: string }) {
  const pieces = content.split(/```([\w+-]*)\n([\s\S]*?)```/g);
  return <>{pieces.map((piece, index) => index % 3 === 2 ? <CodeBlock key={index} language={pieces[index - 1]} code={piece} /> : index % 3 === 1 ? null : <p key={index} className="whitespace-pre-wrap leading-6">{piece}</p>)}</>;
}

export function ChatInterface({ notebookId, documentIds, hasSources, onSendToNote }: ChatInterfaceProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `notebook-ai-active-chat-${notebookId}`;

  async function loadMessages(chatId: string) {
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/chat/messages?notebook_id=${encodeURIComponent(notebookId)}&chat_id=${encodeURIComponent(chatId)}`);
      if (!response.ok) throw new Error("Could not restore this conversation.");
      const stored = await response.json() as ChatMessage[];
      setMessages(stored.map((message) => ({ ...message, role: message.role === "assistant" ? "assistant" : "user" })));
    } catch (cause) {
      setMessages([]);
      setError(cause instanceof Error ? cause.message : "Could not restore this conversation.");
    } finally { setHistoryLoading(false); }
  }

  async function createThread(): Promise<ChatThread | null> {
    try {
      const response = await fetch(`${API_URL}/api/chat/threads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notebook_id: notebookId }) });
      if (!response.ok) throw new Error("Could not create a new chat.");
      const thread = await response.json() as ChatThread;
      setThreads((current) => [thread, ...current]);
      setActiveChatId(thread.id); localStorage.setItem(storageKey, thread.id); setMessages([]);
      return thread;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a new chat."); return null; }
  }

  useEffect(() => {
    let active = true;
    async function restoreThreads() {
      try {
        const response = await fetch(`${API_URL}/api/chat/threads?notebook_id=${encodeURIComponent(notebookId)}`);
        if (!response.ok) throw new Error("Could not restore your conversations.");
        const restored = await response.json() as ChatThread[];
        if (!active) return;
        setThreads(restored);
        const savedId = localStorage.getItem(storageKey);
        const initial = restored.find((thread) => thread.id === savedId) ?? restored[0];
        if (initial) { setActiveChatId(initial.id); void loadMessages(initial.id); }
        else { setHistoryLoading(false); void createThread(); }
      } catch (cause) { if (active) { setHistoryLoading(false); setError(cause instanceof Error ? cause.message : "Could not restore your conversations."); } }
    }
    void restoreThreads();
    return () => { active = false; };
  // This component stays mounted when the Source tab is active; load only when notebook changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  function chooseThread(chatId: string) {
    if (chatId === activeChatId) return;
    setActiveChatId(chatId); localStorage.setItem(storageKey, chatId); void loadMessages(chatId);
  }

  async function removeActiveThread() {
    if (!activeChatId || !window.confirm("Delete this conversation?")) return;
    try {
      const response = await fetch(`${API_URL}/api/chat/threads/${activeChatId}?notebook_id=${encodeURIComponent(notebookId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete this chat.");
      const remaining = threads.filter((thread) => thread.id !== activeChatId);
      setThreads(remaining); setMessages([]); setActiveChatId(null); localStorage.removeItem(storageKey);
      if (remaining[0]) chooseThread(remaining[0].id); else await createThread();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this chat."); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || sending) return;
    let chatId = activeChatId;
    if (!chatId) chatId = (await createThread())?.id ?? null;
    if (!chatId) return;
    const userMessage: ChatMessage = { id: createId(), role: "user", content: question };
    const assistantId = createId();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "", isStreaming: true }]);
    setThreads((current) => current.map((thread) => thread.id === chatId && thread.title === "New chat" ? { ...thread, title: question.slice(0, 58), updated_at: new Date().toISOString() } : thread));
    setPrompt(""); setSending(true); setError(null);
    try {
      const response = await fetch(`${API_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notebook_id: notebookId, chat_id: chatId, message: question, document_ids: documentIds }) });
      if (!response.ok || !response.body) throw new Error("The assistant could not respond.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      const update = (patch: Partial<ChatMessage>) => setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, ...patch } : message));
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let separator: number;
        while ((separator = buffer.indexOf("\n\n")) >= 0) {
          const packet = buffer.slice(0, separator); buffer = buffer.slice(separator + 2);
          const eventName = packet.match(/^event:\s*(.+)$/m)?.[1]; const data = packet.match(/^data:\s*(.+)$/m)?.[1];
          if (!eventName || !data) continue;
          const parsed = JSON.parse(data) as { text?: string; model?: string; message?: string };
          if (eventName === "token") setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + (parsed.text ?? "") } : message));
          if (eventName === "meta") update({ model: parsed.model });
          if (eventName === "error") throw new Error(parsed.message ?? "Assistant request failed.");
        }
        if (done) break;
      }
      update({ isStreaming: false });
    } catch (cause) {
      setMessages((current) => current.filter((message) => message.id !== assistantId));
      setError(cause instanceof Error ? cause.message : "Assistant request failed.");
    } finally { setSending(false); window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 0); }
  }

  return <div className="flex h-full min-h-0 flex-col bg-zinc-950">
    <header className="shrink-0 border-b border-zinc-800 bg-zinc-900/85 px-4 py-3">
      <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-md bg-sky-400/15 text-sky-300"><MessageCirclePlus className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold">Study chat</h2><p className="text-[11px] text-zinc-500">Conversations are saved automatically</p></div></div><button type="button" onClick={() => void createThread()} className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"><Plus className="h-3.5 w-3.5" />New chat</button></div>
      <div className="flex gap-2"><select aria-label="Choose conversation" value={activeChatId ?? ""} onChange={(event) => chooseThread(event.target.value)} className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-sky-400">{threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}</select><button type="button" onClick={() => void removeActiveThread()} disabled={!activeChatId || threads.length < 2} aria-label="Delete current conversation" className="rounded-md border border-zinc-700 px-2 text-zinc-500 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button></div>
    </header>
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {historyLoading ? <div className="flex justify-center py-16 text-zinc-500"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : !messages.length && <div className="mx-auto mt-12 max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center"><BookOpenCheck className="mx-auto mb-3 h-8 w-8 text-amber-400" /><h3 className="font-medium text-zinc-200">Start with a clear question</h3><p className="mt-2 text-sm leading-6 text-zinc-500">Ask about your material or ask an independent question. You can always return to this chat later.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{["Explain this in simple English", "Make a study plan", "Write a Python program"].map((suggestion) => <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)} className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:border-sky-400/50 hover:text-sky-200">{suggestion}</button>)}</div></div>}
      {messages.map((message) => <article key={message.id} className={message.role === "user" ? "ml-8 rounded-2xl rounded-tr-md bg-sky-400/15 px-3 py-2 text-sm text-sky-50" : "mr-3 rounded-2xl rounded-tl-md border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-300 shadow-sm"}>{message.role === "assistant" ? <AssistantText content={message.content} /> : <p className="whitespace-pre-wrap leading-6">{message.content}</p>}{message.isStreaming && !message.content && <LoaderCircle className="mt-1 h-4 w-4 animate-spin text-zinc-500" />}{message.role === "assistant" && !message.isStreaming && message.content && <div className="mt-3 flex items-center justify-end border-t border-zinc-800 pt-2"><button type="button" onClick={() => onSendToNote(message)} className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200"><NotebookPen className="h-3.5 w-3.5" />Save as note</button></div>}</article>)}
    </div>
    <form onSubmit={submit} className="shrink-0 border-t border-zinc-800 bg-zinc-900/85 p-3">{error && <p role="alert" className="mb-2 text-xs text-red-400">{error}</p>}<p className="mb-2 text-[11px] text-zinc-500">{hasSources ? "Your uploaded material is available when relevant." : "You can ask independent questions without uploading material."}</p><div className="flex items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-950 p-2 focus-within:border-sky-400/70"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask in your own words…" rows={2} className="min-h-[40px] flex-1 resize-none bg-transparent px-1 text-sm outline-none placeholder:text-zinc-600" /><button type="submit" disabled={sending || !prompt.trim()} aria-label="Send question" className="rounded-lg bg-sky-400 p-2 text-zinc-950 transition hover:bg-sky-300 disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button></div></form>
  </div>;
}
