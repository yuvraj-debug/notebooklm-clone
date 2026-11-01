"use client";

import type { Editor } from "@tiptap/react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Eraser, Highlighter, Italic, List, ListOrdered,
  Maximize2, Minimize2, Paintbrush, Printer, Redo2, Strikethrough, Underline as UnderlineIcon, Undo2,
} from "lucide-react";

interface EditorToolbarProps { editor: Editor; focusMode: boolean; onFocusMode: () => void; }

const HIGHLIGHT = "#854d0e";
const colors = ["#f4f4f5", "#f87171", "#fbbf24", "#4ade80", "#60a5fa", "#c084fc"];

function ToolButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={`rounded p-1.5 transition ${active ? "bg-zinc-700 text-amber-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}>{children}</button>;
}

export function EditorToolbar({ editor, focusMode, onFocusMode }: EditorToolbarProps) {
  const setTextColor = (color: string) => editor.chain().focus().setColor(color).run();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-y border-zinc-800 bg-zinc-900/90 px-2 py-1.5">
      <select aria-label="Font family" defaultValue="Inter" onChange={(event) => editor.chain().focus().setMark("textStyle", { fontFamily: event.target.value }).run()} className="mr-1 rounded bg-transparent px-1 py-1 text-xs text-zinc-300 outline-none hover:bg-zinc-800">
        <option className="bg-zinc-900">Inter</option><option className="bg-zinc-900">Roboto</option><option className="bg-zinc-900">JetBrains Mono</option><option className="bg-zinc-900">Georgia, serif</option>
      </select>
      <select aria-label="Font size" defaultValue="15px" onChange={(event) => editor.chain().focus().setMark("textStyle", { fontSize: event.target.value }).run()} className="mr-1 rounded bg-transparent px-1 py-1 text-xs text-zinc-300 outline-none hover:bg-zinc-800">
        {["11px", "13px", "15px", "18px", "24px"].map((size) => <option key={size} className="bg-zinc-900">{size}</option>)}
      </select>
      <span className="mx-1 h-5 w-px bg-zinc-700" />
      <ToolButton label="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolButton>
      <ToolButton label="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolButton>
      <ToolButton label="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></ToolButton>
      <ToolButton label="Strikethrough (Ctrl+Shift+X)" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolButton>
      <span className="mx-1 h-5 w-px bg-zinc-700" />
      <ToolButton label="Amber highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: HIGHLIGHT }).run()}><Highlighter className="h-4 w-4" /></ToolButton>
      <label title="Highlight color" className="relative grid h-7 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-800"><Highlighter className="h-3.5 w-3.5" /><input aria-label="Highlight color" type="color" value={HIGHLIGHT} onChange={(event) => editor.chain().focus().toggleHighlight({ color: event.target.value }).run()} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label>
      <div className="group relative"><ToolButton label="Text color" onClick={() => undefined}><Paintbrush className="h-4 w-4" /></ToolButton><div className="invisible absolute left-0 top-full z-20 mt-1 flex gap-1 rounded border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl group-hover:visible group-focus-within:visible">{colors.map((color) => <button key={color} type="button" aria-label={`Set text color ${color}`} onClick={() => setTextColor(color)} className="h-4 w-4 rounded-full border border-zinc-600" style={{ backgroundColor: color }} />)}</div></div>
      <span className="mx-1 h-5 w-px bg-zinc-700" />
      <ToolButton label="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></ToolButton>
      <ToolButton label="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></ToolButton>
      <ToolButton label="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></ToolButton>
      <ToolButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolButton>
      <ToolButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolButton>
      <span className="mx-1 h-5 w-px bg-zinc-700" />
      <ToolButton label="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolButton>
      <ToolButton label="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolButton>
      <ToolButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="h-4 w-4" /></ToolButton>
      <span className="ml-auto" />
      <ToolButton label="Print note" onClick={() => window.print()}><Printer className="h-4 w-4" /></ToolButton>
      <ToolButton label={focusMode ? "Exit focus mode" : "Focus mode"} onClick={onFocusMode}>{focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</ToolButton>
    </div>
  );
}
