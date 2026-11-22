import { useEffect, useRef, useState } from "react";
import { ArrowUp, BarChart3, FileText, Loader2, Paperclip, Square, X } from "lucide-react";
import type { AskMode, DocumentRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface Attachment {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "uploaded" | "ready" | "failed";
  documentId?: number;
}

const ACCEPT = ".pdf,.md,.txt,.csv";

function prettySize(n: number) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** The prompt box, in the spirit of Claude's: attachments live inside it,
 * Enter sends, Shift+Enter adds a line, files can be dropped on it. */
export function Composer({
  mode,
  onModeChange,
  onSend,
  onStop,
  busy,
  attachments,
  onAttach,
  onRemove,
  library,
  autoFocus,
}: {
  mode: AskMode;
  onModeChange: (m: AskMode) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  attachments: Attachment[];
  onAttach: (files: File[]) => void;
  onRemove: (key: string) => void;
  library: DocumentRecord[];
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const send = () => {
    const q = text.trim();
    if (!q || busy) return;
    onSend(q);
    setText("");
  };
  const readyDocs = library.filter((d) => d.status === "ready").length;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const files = [...(e.dataTransfer.files ?? [])];
        if (files.length) onAttach(files);
      }}
      className={cn(
        "rounded-[22px] border bg-panel p-2.5 shadow-panel transition-colors",
        drag ? "border-signal bg-signal-wash" : "border-line focus-within:border-line-strong",
      )}
    >
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-1.5 pb-2 pt-1">
          {attachments.map((a) => (
            <li key={a.key} className="group flex items-center gap-2.5 rounded-xl border border-line bg-panel-2 py-2 pl-2.5 pr-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-sunken text-ink-3">
                {a.status === "uploading" || a.status === "uploaded" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[180px] truncate text-[13px] font-medium">{a.name}</span>
                <span className={cn("block text-[11.5px]", a.status === "failed" ? "text-signal-ink" : "text-ink-3")}>
                  {a.status === "uploading" ? "Uploading…" : a.status === "uploaded" ? "Reading…" : a.status === "failed" ? "Could not be read" : `Ready · ${prettySize(a.size)}`}
                </span>
              </span>
              <button onClick={() => onRemove(a.key)} className="rounded-md p-1 text-ink-3 opacity-60 hover:bg-sunken hover:text-ink group-hover:opacity-100" aria-label={`Remove ${a.name}`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={area}
        value={text}
        autoFocus={autoFocus}
        rows={1}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={mode === "data" ? "Ask about revenue, sellers, deliveries, stock, customers…" : "Ask about your attached documents…"}
        aria-label="Your question"
        className="block w-full resize-none bg-transparent px-3 pb-2 pt-2.5 text-[15.5px] leading-relaxed outline-none placeholder:text-ink-3"
      />
      <div className="flex items-center gap-1.5 px-1">
        <input ref={file} type="file" accept={ACCEPT} multiple className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) onAttach(f); e.target.value = ""; }} />
        <button
          onClick={() => file.current?.click()}
          className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          aria-label="Attach documents (PDF, text, markdown or CSV, up to 20 MB)"
          title="Attach documents"
        >
          <Paperclip className="size-[18px]" />
        </button>
        <div role="radiogroup" aria-label="Answer from" className="flex items-center rounded-lg bg-panel-2 p-0.5 text-[12.5px]">
          {([
            { id: "data", label: "Business data", Icon: BarChart3 },
            { id: "docs", label: readyDocs ? `Our documents · ${readyDocs}` : "Our documents", Icon: FileText },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              role="radio"
              aria-checked={mode === id}
              onClick={() => onModeChange(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors",
                mode === id ? "bg-panel text-ink shadow-sm" : "text-ink-3 hover:text-ink",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {busy ? (
          <button onClick={onStop} className="flex size-9 items-center justify-center rounded-full bg-ink text-canvas transition-transform hover:scale-105" aria-label="Stop">
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!text.trim()}
            className="flex size-9 items-center justify-center rounded-full bg-signal text-white transition-all hover:scale-105 disabled:scale-100 disabled:bg-line-strong disabled:text-ink-3"
            aria-label="Send"
          >
            <ArrowUp className="size-[18px]" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
