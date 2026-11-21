import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowUp, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, type AskMode, type AskResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/data/PageHeader";
import { Dots, ErrorState } from "@/components/data/States";
import { Tag } from "@/components/data/Badges";

const MODES: { id: AskMode; label: string; note: string; examples: string[] }[] = [
  {
    id: "data", label: "The books",
    note: "Deterministic answers from live PostgreSQL. No language model: if a question is not understood, it says so instead of guessing.",
    examples: ["What is revenue?", "Which sellers need attention?", "What is the return rate?", "Which products need reorder?", "Top 5 sellers", "How concentrated are customers (pareto)?"],
  },
  {
    id: "docs", label: "Our documents",
    note: "Answers only from the documents you attached, citing the passages used (Databricks Foundation Model API).",
    examples: ["What is our return policy?", "What does the seller SLA say about late deliveries?"],
  },
  {
    id: "genie", label: "Gold tables (Genie)",
    note: "Databricks Genie writes SQL over the four Gold marts and returns the query with the rows, so every answer can be checked.",
    examples: ["Revenue by city last quarter", "Which category grew fastest in 2026?"],
  },
];

interface Turn { q: string; mode: AskMode; a?: AskResult; error?: string }

export function Ask() {
  const [mode, setMode] = useState<AskMode>("data");
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ["documents"], queryFn: api.documents, refetchInterval: (q) => (q.state.data?.some((d) => d.status === "uploaded") ? 3000 : false) });
  const ask = useMutation({
    mutationFn: ({ q, m }: { q: string; m: AskMode }) => api.ask(m, q),
    onMutate: ({ q, m }) => setTurns((t) => [...t, { q, mode: m }]),
    onSuccess: (a) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x))),
    onError: (e: Error) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: e.message } : x))),
  });
  const upload = useMutation({
    mutationFn: api.uploadDocument,
    onSuccess: (d) => { toast.success(`${d.filename} uploaded`, { description: "Parsing and embedding in the background." }); qc.invalidateQueries({ queryKey: ["documents"] }); },
    onError: (e: Error) => toast.error("Upload failed", { description: e.message }),
  });
  const remove = useMutation({ mutationFn: api.deleteDocument, onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }) });
  const current = MODES.find((m) => m.id === mode)!;
  const submit = (q: string) => {
    if (!q.trim()) return;
    ask.mutate({ q: q.trim(), m: mode });
    setText("");
  };

  return (
    <div>
      <PageHeader
        kicker="Planning · ask"
        title="Ask in plain language"
        question="Three answer engines, each grounded in a different source. None of them invents numbers: every answer shows where it came from."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div role="tablist" className="mb-3 flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)}
                className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  mode === m.id ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:text-ink")}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mb-5 text-[13.5px] text-ink-3">{current.note}</p>

          <div className="space-y-4">
            {turns.length === 0 && (
              <div className="dot-grid rounded-xl border border-dashed border-line-strong p-6">
                <div className="label mb-3">Try</div>
                <div className="flex flex-wrap gap-2">
                  {current.examples.map((e) => (
                    <button key={e} onClick={() => submit(e)} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] transition-colors hover:border-ink">{e}</button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="space-y-2">
                <div className="ml-auto w-fit max-w-[80%] rounded-xl rounded-br-sm bg-ink px-4 py-2.5 text-[14px] text-canvas">{t.q}</div>
                <div className="panel max-w-[92%] p-4">
                  {!t.a && !t.error && <Dots />}
                  {t.error && <ErrorState error={new Error(t.error)} title="No answer" />}
                  {t.a && (
                    <>
                      <p className="whitespace-pre-line text-[14.5px] leading-relaxed">{t.a.answer}</p>
                      {t.a.sql && <pre className="code mt-3 overflow-x-auto rounded-lg bg-sunken p-3 text-[12px] text-ink-2">{t.a.sql}</pre>}
                      {t.a.sources.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                          <span className="label mr-1">Sources</span>
                          {t.a.sources.map((s, j) => (
                            <Tag key={j} tone={t.mode === "data" ? "neutral" : "violet"}>
                              {s.document ? `${s.document} §${s.chunk_index}` : s.endpoint}
                            </Tag>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submit(text); }} className="sticky bottom-4 mt-6 flex items-center gap-2 rounded-xl border border-line bg-panel p-2 shadow-panel">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask ${current.label.toLowerCase()}…`} maxLength={500}
              className="flex-1 bg-transparent px-3 py-2 text-[14.5px] outline-none placeholder:text-ink-3" />
            <button disabled={!text.trim() || ask.isPending} className="rounded-lg bg-ink p-2.5 text-canvas disabled:opacity-40" aria-label="Ask">
              <ArrowUp className="size-4" />
            </button>
          </form>
        </div>

        <aside className="panel h-fit p-5">
          <div className="label mb-1">Attached documents</div>
          <p className="mb-4 text-[12.5px] text-ink-3">Policies, SLAs and contracts that "Our documents" answers from (pdf, md, txt, csv · 20 MB).</p>
          <input ref={fileRef} type="file" accept=".pdf,.md,.txt,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={upload.isPending}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong py-3 text-[13px] text-ink-2 transition-colors hover:border-ink hover:text-ink">
            <Upload className="size-4" /> {upload.isPending ? "Uploading…" : "Attach a document"}
          </button>
          <ul className="space-y-2">
            {docs.data?.length === 0 && <li className="text-[13px] text-ink-3">Nothing attached yet.</li>}
            {docs.data?.map((d) => (
              <li key={d.document_id} className="flex items-center gap-2 text-[13px]">
                <FileText className="size-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate">{d.filename}</span>
                <Tag tone={d.status === "ready" ? "good" : d.status === "failed" ? "signal" : "neutral"}>{d.status}</Tag>
                <button onClick={() => remove.mutate(d.document_id)} className="text-ink-3 hover:text-signal-ink" aria-label={`Delete ${d.filename}`}><Trash2 className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
