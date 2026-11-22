import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Library, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, type AskMode, type AskResult, type Rating } from "@/lib/api";
import { gsap, useGSAP, withMotion } from "@/lib/motion";
import { BrandMark } from "@/components/brand/BrandMark";
import { Tag } from "@/components/data/Badges";
import { AnswerMessage, AssistantAvatar } from "./AnswerMessage";
import { type Attachment, Composer } from "./Composer";
import { Working } from "./Working";

interface Turn {
  id: string;
  question: string;
  mode: AskMode;
  status: "pending" | "done" | "error" | "stopped";
  result?: AskResult;
  error?: string;
  rating: Rating;
  fresh?: boolean;
}

const SUGGESTIONS: Record<AskMode, string[]> = {
  data: [
    "What is our revenue?",
    "Which sellers need attention?",
    "Which products need reordering?",
    "How many orders arrive late?",
    "What will revenue be next month?",
    "How concentrated are our customers?",
  ],
  docs: [
    "What does our return policy say?",
    "What do seller agreements say about late deliveries?",
    "Summarise the attached document in three points",
  ],
};

const STORE = "smart-erp-ask";
const MIN_WORKING_MS = 600;

function friendly(e: unknown, mode: AskMode): string {
  if (e instanceof DOMException && e.name === "AbortError") return "Stopped.";
  if (e instanceof ApiError && e.status === 502 && mode === "docs")
    return "Answers from documents need the AI service to be connected, and it isn't right now. You can still ask about business data.";
  if (e instanceof ApiError && e.status < 500) return "I couldn't read that question. Try rephrasing it in a sentence.";
  return "The assistant can't be reached right now. Please try again in a moment.";
}

export function Ask() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<AskMode>("data");
  const [turns, setTurns] = useState<Turn[]>(() => {
    try {
      return (JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as Turn[]).filter((t) => t.status !== "pending");
    } catch {
      return [];
    }
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => t.status === "pending");

  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: api.documents,
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "uploaded") ? 2000 : false),
  });

  useEffect(() => {
    sessionStorage.setItem(STORE, JSON.stringify(turns.map(({ fresh: _f, ...t }) => t)));
  }, [turns]);

  // Attachment status follows the document's processing state (derived, not copied).
  const shown: Attachment[] = attachments.map((a) => {
    const d = docs.data?.find((x) => x.document_id === a.documentId);
    return d ? { ...a, status: d.status } : a;
  });

  const lastStatus = turns.at(-1)?.status;
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, lastStatus]);

  const stop = useCallback(() => abort.current?.abort(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && busy) stop(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, stop]);

  const upload = useMutation({
    mutationFn: async ({ file, key }: { file: File; key: string }) => ({ key, doc: await api.uploadDocument(file) }),
    onSuccess: ({ key, doc }) => {
      setAttachments((as) => as.map((a) => (a.key === key ? { ...a, status: doc.status, documentId: doc.document_id } : a)));
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error, { key }) => {
      setAttachments((as) => as.map((a) => (a.key === key ? { ...a, status: "failed" } : a)));
      toast.error("The document could not be attached", { description: e.message });
    },
  });
  const remove = useMutation({
    mutationFn: api.deleteDocument,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });

  const attach = (files: File[]) => {
    for (const file of files) {
      if (file.size > 20 * 1048576) {
        toast.error(`${file.name} is larger than 20 MB`);
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}`;
      setAttachments((as) => [...as, { key, name: file.name, size: file.size, status: "uploading" }]);
      upload.mutate({ file, key });
    }
    setMode("docs");
  };

  const send = async (question: string) => {
    const id = crypto.randomUUID();
    const m = mode;
    setTurns((t) => [...t, { id, question, mode: m, status: "pending", rating: 0 }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const started = Date.now();
    try {
      const result = await api.ask(m, question, ctrl.signal);
      const wait = MIN_WORKING_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: "done", result, fresh: true } : x)));
    } catch (e) {
      const stopped = e instanceof DOMException && e.name === "AbortError";
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: stopped ? "stopped" : "error", error: friendly(e, m) } : x)));
    } finally {
      abort.current = null;
    }
  };

  // Each new question slides in from the composer.
  useGSAP(
    () => {
      withMotion(() => {
        gsap.from(".turn:last-child .user-bubble", { y: 14, opacity: 0, duration: 0.35, ease: "power3.out" });
      });
    },
    { scope: page, dependencies: [turns.length] },
  );
  useGSAP(
    () => {
      withMotion(() => {
        gsap.from(".hello > *", { y: 12, opacity: 0, duration: 0.5, stagger: 0.07 });
      });
    },
    { scope: page, dependencies: [turns.length === 0] },
  );

  const library = docs.data ?? [];
  const composer = (
    <Composer
      mode={mode}
      onModeChange={setMode}
      onSend={send}
      onStop={stop}
      busy={busy}
      attachments={shown}
      onAttach={attach}
      onRemove={(key) => setAttachments((as) => as.filter((a) => a.key !== key))}
      library={library}
      autoFocus
    />
  );

  const footer = (
    <div className="mt-2.5 flex items-center justify-between gap-3 px-2 text-[12px] text-ink-3">
      <span>
        {mode === "data"
          ? "Answers come from the marketplace's own records. If a question can't be answered from them, the assistant says so."
          : "Answers use only your attached documents, and show which ones they used."}
      </span>
      <Popover.Root>
        <Popover.Trigger className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-panel-2 hover:text-ink">
          <Library className="size-3.5" /> Documents · {library.length}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="top" align="end" sideOffset={8} className="panel z-50 w-[320px] p-3 text-[13px] shadow-xl">
            <div className="label mb-2 px-1">Your documents</div>
            {library.length === 0 && <p className="px-1 py-2 text-ink-3">Nothing yet. Use the paperclip to attach policies, contracts or notes.</p>}
            <ul className="max-h-[260px] space-y-1 overflow-y-auto">
              {library.map((d) => (
                <li key={d.document_id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-panel-2">
                  <FileText className="size-4 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate">{d.filename}</span>
                  <Tag tone={d.status === "ready" ? "good" : d.status === "failed" ? "signal" : "neutral"}>
                    {d.status === "ready" ? "ready" : d.status === "failed" ? "failed" : "reading"}
                  </Tag>
                  <button onClick={() => remove.mutate(d.document_id)} className="rounded p-1 text-ink-3 hover:text-signal-ink" aria-label={`Delete ${d.filename}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );

  if (turns.length === 0) {
    return (
      <div ref={page} className="mx-auto flex min-h-[calc(100dvh-170px)] max-w-[760px] flex-col justify-center pb-10">
        <div className="hello text-center">
          <div className="mx-auto mb-5 w-fit"><BrandMark tile size={52} /></div>
          <h1 className="text-[34px] leading-tight sm:text-[40px]">What would you like to know?</h1>
          <p className="mx-auto mt-3 max-w-lg text-[15.5px] text-ink-2">
            Ask about sales, sellers, deliveries, stock or customers in your own words — or attach a document and ask about it.
          </p>
        </div>
        <div className="hello mt-8">
          <div>{composer}</div>
          <div>{footer}</div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS[mode].map((s) => (
              <button key={s} onClick={() => send(s)}
                className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-ink hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={page} className="mx-auto max-w-[760px]">
      <div className="mb-6 flex items-center justify-between">
        <div className="label">Ask · {turns.length} question{turns.length === 1 ? "" : "s"}</div>
        <button
          onClick={() => { stop(); setTurns([]); }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-ink-3 hover:bg-panel-2 hover:text-ink"
        >
          <RotateCcw className="size-3.5" /> New conversation
        </button>
      </div>
      <div className="space-y-8 pb-6">
        {turns.map((t) => (
          <div key={t.id} className="turn space-y-5">
            <div className="user-bubble ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-panel-2 px-4 py-2.5 text-[15px] ring-1 ring-line">
              {t.question}
              {t.mode === "docs" && <span className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-3"><FileText className="size-3" /> from your documents</span>}
            </div>
            {t.status === "pending" && (
              <div className="flex gap-3.5"><AssistantAvatar /><Working mode={t.mode} /></div>
            )}
            {(t.status === "error" || t.status === "stopped") && (
              <div className="flex gap-3.5">
                <AssistantAvatar />
                <p className="pt-1.5 text-[14.5px] text-ink-2">
                  {t.error}{" "}
                  <button className="font-medium text-signal-ink link-underline" onClick={() => send(t.question)}>Try again</button>
                </p>
              </div>
            )}
            {t.status === "done" && t.result && (
              <AnswerMessage
                result={t.result}
                animate={!!t.fresh}
                rating={t.rating}
                onRated={(r) => setTurns((all) => all.map((x) => (x.id === t.id ? { ...x, rating: r } : x)))}
                onAsk={busy ? undefined : send}
              />
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="sticky bottom-0 -mx-2 bg-gradient-to-t from-canvas via-canvas to-transparent px-2 pb-5 pt-6">
        {composer}
        {footer}
      </div>
    </div>
  );
}
