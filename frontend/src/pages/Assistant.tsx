import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/Disclosure";
import { PageHeader, StackError } from "@/components/PageHeader";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TrustStatus } from "@/components/TrustStatus";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api, type AskMode, type AskResult, type AskSource, type TrustStatus as TrustStatusResult } from "@/lib/api";

const MODE_IDS: AskMode[] = ["data", "docs", "genie"];

const MODES: Record<AskMode, {
  label: string;
  purpose: string;
  bestFor: string;
  promise: string;
  placeholder: string;
  progress: string;
}> = {
  data: {
    label: "Live books",
    purpose: "Compute an answer from committed marketplace records and the latest stored outlook.",
    bestFor: "Revenue, sellers, orders, inventory, fulfillment, quality checks and forecasts.",
    promise: "Every supported answer names the governed business source used. Unsupported questions are not guessed.",
    placeholder: "For example, which sellers need attention?",
    progress: "Checking committed marketplace records",
  },
  docs: {
    label: "Documents",
    purpose: "Find relevant passages in uploaded documents and prepare an answer grounded in those passages.",
    bestFor: "Business reviews, narrative drivers, policy detail and summaries of attached reports.",
    promise: "Matched filenames and passage numbers accompany the answer. No match means no grounded claim.",
    placeholder: "For example, what drove growth in Q1?",
    progress: "Finding relevant passages, then preparing a grounded answer",
  },
  genie: {
    label: "Databricks",
    purpose: "Ask a governed Genie Space to prepare and run a query over published marketplace datasets.",
    bestFor: "Flexible breakdowns by month, category, seller or another published business dimension.",
    promise: "The answer identifies the published marketplace query. SQL stays available as technical evidence.",
    placeholder: "For example, show total revenue by month",
    progress: "Waiting for Databricks to prepare and run a governed query",
  },
};

const EXAMPLES: Record<AskMode, string[]> = {
  data: ["What is total revenue?", "Which sellers need attention?", "Which products need restocking?", "Are the books clean?"],
  docs: ["What drove growth in Q1?", "Summarize the attached reports", "What risks are named in the latest review?"],
  genie: ["Total revenue by month", "Return rate by category", "Compare seller revenue by quarter"],
};

const ENDPOINT_LABELS: Record<string, string> = {
  "GET /stats/overview": "Marketplace summary",
  "GET /stats/performance-summary": "Marketplace performance comparison",
  "GET /stats/top-sellers": "Top seller performance",
  "GET /stats/seller-performance": "Seller performance",
  "GET /stats/stock-critical": "Low-stock products",
  "GET /stats/discount-bands": "Discount performance",
  "GET /stats/revenue-by-category": "Category revenue",
  "GET /stats/city-performance": "Metro performance",
  "GET /stats/forecast": "Stored marketplace outlook",
  "GET /stats/dq-checks": "Marketplace quality checks",
  "GET /stats/pareto": "Customer revenue concentration",
};

function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Answer";
}

function formatValue(column: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return "Structured value";
  const key = column.toLowerCase();
  if (typeof value === "string" && (key.includes("date") || key.includes("month"))) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-IN", {
        day: key.includes("date") ? "numeric" : undefined,
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
    }
  }
  const numeric = typeof value === "number" ? value : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
  if (numeric == null || !Number.isFinite(numeric)) return String(value);
  if (key.endsWith("_rate")) {
    return new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 }).format(numeric);
  }
  if (["revenue", "price", "amount", "aov"].some((term) => key.includes(term))) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(numeric);
  }
  if (key.includes("margin")) {
    return Math.abs(numeric) <= 1
      ? new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 }).format(numeric)
      : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(numeric);
  }
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
  }).format(numeric);
}

function businessSourceLabel(source: AskSource, mode: AskMode): string {
  if (mode === "docs") return source.document || "Uploaded document";
  if (mode === "genie") return "Published marketplace query";
  if (ENDPOINT_LABELS[source.endpoint]) return ENDPOINT_LABELS[source.endpoint];
  if (/^GET \/orders\/\d+$/.test(source.endpoint)) return "Committed order record";
  return "Governed marketplace source";
}

/** Deep link from an answer source back into the operating app. */
function sourceRoute(source: AskSource, mode: AskMode): { to: string; label: string } | null {
  if (mode === "docs") return { to: "/documents", label: "Open Documents" };
  if (mode === "genie") return { to: "/performance", label: "Open Performance" };
  const orderMatch = /^GET \/orders\/(\d+)$/.exec(source.endpoint);
  if (orderMatch) return { to: `/orders/${orderMatch[1]}`, label: `Open order #${orderMatch[1]}` };
  switch (source.endpoint) {
    case "GET /stats/overview":
    case "GET /stats/performance-summary":
    case "GET /stats/pareto":
      return { to: "/performance", label: "Open Performance" };
    case "GET /stats/top-sellers":
    case "GET /stats/seller-performance":
      return { to: "/sellers", label: "Open Sellers" };
    case "GET /stats/stock-critical":
      return { to: "/inventory", label: "Open Inventory" };
    case "GET /stats/discount-bands":
    case "GET /stats/revenue-by-category":
    case "GET /stats/category-trend":
      return { to: "/sales", label: "Open Revenue" };
    case "GET /stats/city-performance":
      return { to: "/operations", label: "Open Needs action" };
    case "GET /stats/forecast":
      return { to: "/forecast", label: "Open Forecast" };
    case "GET /stats/dq-checks":
      return { to: "/operations", label: "Open checks" };
    default:
      return null;
  }
}

const DOC_STATUS_LABEL: Record<string, string> = {
  uploaded: "Processing",
  ready: "Ready",
  failed: "Failed",
};

const GENIE_STEPS: React.ReactNode[] = [
  "Create a Smart-ERP Gold Genie Space.",
  <>Add the published marketplace datasets described in <span className="evidence">docs/bi.md</span>.</>,
  "Copy the Genie Space ID.",
  <>Set <span className="evidence">GENIE_SPACE_ID</span> on the backend.</>,
  "Restart the backend service.",
];

function GenieSetup() {
  return (
    <div role="alert" className="space-y-4 rounded-lg border border-warning/60 bg-warning/5 px-4 py-4">
      <TrustStatus
        status="setup_required"
        label="Databricks needs setup before it can answer"
        summary="Complete these backend setup steps, then return here to ask the published marketplace data."
        variant="full"
      />
      <ol className="ml-5 list-decimal space-y-2 text-sm leading-relaxed text-muted-foreground">
        {GENIE_STEPS.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function TermGenieSetup() {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-[var(--term-warn)]/60 p-4">
      <p className="text-[15px] font-medium text-[var(--term-ink)]">Databricks needs setup before it can answer</p>
      <p className="text-sm leading-relaxed text-[var(--term-mist)]">
        Complete these backend setup steps, then retry the question from this log.
      </p>
      <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed text-[var(--term-mist)]">
        {GENIE_STEPS.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function TurnEvidence({ result, mode }: { result: AskResult; mode: AskMode }) {
  const sourceCount = result.sources.length;
  return (
    <div className="space-y-3">
      <p className="term-statusbar" aria-label={`${MODES[mode].label}, ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}, read-only answer`}>
        <span className="seg"><b>{MODES[mode].label}</b></span>
        <span className="seg"><b>{sourceCount.toLocaleString("en-IN")}</b> {sourceCount === 1 ? "source" : "sources"}</span>
        <span className="seg">
          <LockKeyhole size={11} aria-hidden="true" className="mr-1 inline-block align-[-1px]" />read-only
        </span>
      </p>

      {sourceCount === 0 ? (
        <p className="text-sm leading-relaxed text-[var(--term-warn)]">
          No supporting source returned. Try a supported question about revenue, sellers, inventory, fulfillment or
          marketplace quality, or choose Documents for an uploaded report.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {result.sources.map((source, index) => (
            <li key={`${source.endpoint}-${source.document ?? "source"}-${index}`} className="flex gap-2.5">
              <span
                className="mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full border border-[var(--term-ok)]/70 text-[var(--term-ok)]"
                aria-hidden="true"
              >
                <Check size={12} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--term-ink)]">{businessSourceLabel(source, mode)}</p>
                {(() => {
                  const route = sourceRoute(source, mode);
                  return route ? (
                    <Link to={route.to} className="mt-0.5 inline-flex min-h-8 items-center font-mono text-xs text-[var(--term-ink)] underline decoration-[var(--term-line)] underline-offset-4 hover:decoration-[var(--term-accent)]">
                      {route.label} →
                    </Link>
                  ) : null;
                })()}
                {mode === "docs" && (
                  <p className="mt-0.5 text-[13px] text-[var(--term-mist)]">
                    Matched passage {source.chunk_index == null ? "returned" : source.chunk_index + 1}
                  </p>
                )}
                {mode === "data" && (
                  <p className="mt-0.5 text-[13px] text-[var(--term-mist)]">Read from governed marketplace records</p>
                )}
                {mode === "genie" && (
                  <p className="mt-0.5 text-[13px] text-[var(--term-mist)]">Prepared against published marketplace datasets</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Disclosure summary="Technical details" className="bg-transparent">
        <div className="space-y-3">
          {result.sources.map((source, index) => (
            <div key={`${source.endpoint}-technical-${index}`} className="evidence space-y-1 text-xs">
              <p className="text-[var(--term-ink)]">{mode === "docs" ? source.document || "Uploaded document" : source.endpoint}</p>
              {mode === "docs" && source.score != null && (
                <p>Match score: {source.score.toLocaleString("en-IN", { maximumFractionDigits: 4 })}</p>
              )}
              {mode === "data" && Object.keys(source.params).length > 0 && (
                <p>Parameters: {Object.entries(source.params).map(([key, value]) => `${key}=${formatValue(key, value)}`).join(", ")}</p>
              )}
            </div>
          ))}
          {mode === "genie" && result.sql && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-xs">{result.sql}</pre>
          )}
        </div>
      </Disclosure>
    </div>
  );
}

function rowKeysFor(result: AskResult): string[] {
  return result.rows ? Array.from(new Set(result.rows.flatMap((row) => Object.keys(row ?? {})))) : [];
}

function TurnBlock({
  turn,
  busy,
  onRetry,
}: {
  turn: Turn;
  busy: boolean;
  onRetry: () => void;
}) {
  const keys = turn.result ? rowKeysFor(turn.result) : [];
  return (
    <li className="term-turn-enter space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span aria-hidden="true" className="term-prompt-glyph font-mono text-lg leading-none">›</span>
        <p className="min-w-0 flex-1 basis-48 font-mono text-[15px] font-medium text-[var(--term-ink)]">{turn.question}</p>
        <span className="shrink-0 font-mono text-xs text-[var(--term-mist)]">[{MODES[turn.mode].label}]</span>
      </div>

      {turn.status === "pending" && (
        <div role="status" className="space-y-3">
          <p className="text-sm text-[var(--term-mist)]">{MODES[turn.mode].progress}… results land together when the service responds.</p>
          <div className="space-y-2" aria-hidden="true">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-[var(--term-ground-soft)]" />
            <div className="h-3.5 w-full animate-pulse rounded bg-[var(--term-ground-soft)]" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-[var(--term-ground-soft)]" />
          </div>
        </div>
      )}

      {turn.status === "setup" && <TermGenieSetup />}

      {turn.status === "error" && (
        <div role="alert" className="space-y-3 rounded-xl border border-[var(--term-bad)]/60 p-4">
          <div className="flex gap-2.5">
            <AlertTriangle className="mt-0.5 shrink-0 text-[var(--term-bad)]" size={17} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-[var(--term-ink)]">
                {turn.docs ? "Document answering is unavailable" : "The answer could not be prepared"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--term-mist)]">{turn.message}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--term-mist)]">
                {turn.docs
                  ? "Your uploaded files have not been changed."
                  : "Check the source capability in the rail, then retry the same question."}
              </p>
            </div>
          </div>
          <Button className="min-h-11" disabled={busy} onClick={onRetry}>
            Retry this question
          </Button>
        </div>
      )}

      {turn.status === "done" && turn.result && (
        <div className="space-y-4">
          <TurnEvidence result={turn.result} mode={turn.mode} />
          <p className="term-answer max-w-[70ch] whitespace-pre-wrap text-[17px] leading-8">{turn.result.answer}</p>
          {turn.result.rows && turn.result.rows.length > 0 && (
            <div className="overflow-x-auto">
              <p className="py-2 text-xs text-[var(--term-mist)] sm:hidden">Scroll horizontally to review all returned fields.</p>
              <Table className="text-sm tabular-nums">
                <caption className="sr-only">Rows returned with the governed answer.</caption>
                <TableHeader className="bg-transparent">
                  <TableRow className="hover:bg-transparent">
                    {keys.map((column) => (
                      <TableHead key={column} className="text-[var(--term-mist)]">{humanize(column)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {turn.result.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {keys.map((column) => (
                        <TableCell key={column} className="max-w-72 whitespace-normal break-words">
                          {formatValue(column, row?.[column])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

interface Turn {
  id: number;
  mode: AskMode;
  question: string;
  status: "pending" | "done" | "error" | "setup";
  result?: AskResult;
  message?: string;
  docs?: boolean;
}

export default function Assistant() {
  const [mode, setMode] = useState<AskMode>("data");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [trust, setTrust] = useState<TrustStatusResult | null>(null);
  const [trustUnavailable, setTrustUnavailable] = useState(false);
  const idRef = useRef(0);
  const activeMode = MODES[mode];
  const docsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: api.listDocuments,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const documents = docsQuery.data ?? [];
  const readyDocs = documents.filter((document) => document.status === "ready");

  useEffect(() => {
    let active = true;
    api.trustStatus()
      .then((status) => {
        if (active) setTrust(status);
      })
      .catch(() => {
        if (active) setTrustUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(submittedMode: AskMode, submittedQuestion: string) {
    const text = submittedQuestion.trim();
    if (!text) {
      setValidation("Enter a question before requesting an answer.");
      return;
    }
    if (busy) return;
    setValidation(null);
    setBusy(true);
    idRef.current += 1;
    const id = idRef.current;
    setTurns((current) => [...current, { id, mode: submittedMode, question: text, status: "pending" }]);
    setQuestion("");
    try {
      const answer = await api.ask(submittedMode, text);
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, status: "done", result: answer } : turn)),
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The answer service did not respond.";
      const setup = caught instanceof ApiError && message.includes("GENIE_SPACE_ID");
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { ...turn, status: setup ? "setup" : "error", message, docs: submittedMode === "docs" } : turn,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function retryTurn(id: number) {
    const turn = turns.find((candidate) => candidate.id === id);
    if (!turn || busy) return;
    setBusy(true);
    setTurns((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, status: "pending", message: undefined } : candidate,
      ),
    );
    try {
      const answer = await api.ask(turn.mode, turn.question);
      setTurns((current) =>
        current.map((candidate) => (candidate.id === id ? { ...candidate, status: "done", result: answer } : candidate)),
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The answer service did not respond.";
      const setup = caught instanceof ApiError && message.includes("GENIE_SPACE_ID");
      setTurns((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, status: setup ? "setup" : "error", message, docs: candidate.mode === "docs" }
            : candidate,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Decision support"
        title="Ask the marketplace"
        question="Ask one business question. Answers come from governed marketplace data, uploaded knowledge or published Databricks datasets, with the supporting evidence kept beside the result."
      />

      <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{activeMode.purpose}</span> {activeMode.bestFor}
      </p>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
        <section aria-label="Marketplace terminal" className="term min-w-0 lg:col-span-8">
          <div className="border-b border-[var(--term-line)] px-4 py-4 sm:px-5">
            <p className="term-statusbar" role="status">
              <span className="seg">source: <b>{activeMode.label}</b></span>
              <span className="seg">
                docs: <b>{docsQuery.data ? `${readyDocs.length} ready of ${documents.length}` : "…"}</b>
              </span>
              <span className="seg">read-only</span>
              {trust && mode !== "docs" && (
                <span className="seg">books: <b>{trust.live_books.status}</b></span>
              )}
            </p>
            <SegmentedControl
              dark
              label="Answer source"
              value={mode}
              onChange={setMode}
              options={MODE_IDS}
              getOptionLabel={(option) => MODES[option].label}
              className="mt-3 w-full"
            />
          </div>

          <ol
            className="term-log max-h-[62vh] space-y-8 overflow-y-auto px-4 py-6 sm:px-5"
            aria-live="polite"
            aria-busy={busy}
            aria-label="Session log"
          >
            {turns.length === 0 && (
              <li>
                <p className="font-mono text-sm text-[var(--term-mist)]">~ log empty — type a question below to open the session.</p>
              </li>
            )}
            {turns.map((turn) => (
              <TurnBlock key={turn.id} turn={turn} busy={busy} onRetry={() => void retryTurn(turn.id)} />
            ))}
          </ol>

          <div className="border-t border-[var(--term-line)] px-4 py-4 sm:px-5">
            <p className="mb-2 font-mono text-xs text-[var(--term-mist)]">
              try:{" "}
              {EXAMPLES[mode].map((example, index) => (
                <span key={example}>
                  {index > 0 && <span aria-hidden="true"> · </span>}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setQuestion(example);
                      setValidation(null);
                    }}
                    className="font-mono text-xs text-[var(--term-ink)] underline decoration-[var(--term-line)] underline-offset-4 hover:decoration-[var(--term-accent)] disabled:opacity-50"
                  >
                    {example}
                  </button>
                </span>
              ))}
            </p>
            <form
              className="flex items-center gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit(mode, question);
              }}
            >
              <span aria-hidden="true" className="term-prompt-glyph shrink-0 font-mono text-xl leading-none">›</span>
              <label htmlFor="marketplace-question" className="sr-only">Type a marketplace question</label>
              <input
                id="marketplace-question"
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  if (validation) setValidation(null);
                }}
                placeholder={activeMode.placeholder}
                aria-invalid={validation ? true : undefined}
                aria-describedby={validation ? "question-error" : "question-guidance"}
                autoComplete="off"
                disabled={busy}
                className="term-input min-h-11 w-full min-w-0 flex-1 rounded-lg px-3 py-2.5 font-mono text-[15px] placeholder:text-[var(--term-faint)] disabled:opacity-60"
              />
              <Button type="submit" disabled={busy} className="min-h-11 shrink-0 px-5">
                {busy ? "Working…" : "Ask"}
              </Button>
            </form>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p id="question-guidance" className="font-mono text-xs text-[var(--term-mist)]">
                {busy ? "Working — the turn lands in the log above." : "Enter asks. Suggestions fill the prompt only."}
              </p>
              {turns.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setTurns([])}
                  className="min-h-11 px-2 font-mono text-xs text-[var(--term-mist)] underline decoration-[var(--term-line)] underline-offset-4 hover:text-[var(--term-ink)] disabled:opacity-50"
                >
                  Clear session
                </button>
              )}
            </div>
            {validation && <p id="question-error" role="alert" className="mt-2 text-sm font-medium text-[var(--term-bad)]">{validation}</p>}
          </div>
        </section>

        <aside aria-label="Knowledge and capability" className="min-w-0 space-y-8 lg:col-span-4">
          <section aria-labelledby="rail-docs-heading" className="space-y-3">
            <h2 id="rail-docs-heading" className="font-serif text-xl">Attached documents</h2>
            {docsQuery.isError ? (
              <StackError message="Couldn't load attached documents." retry={() => void docsQuery.refetch()} />
            ) : docsQuery.isLoading ? (
              <p role="status" className="text-sm text-muted-foreground">Reading attached documents…</p>
            ) : documents.length === 0 ? (
              <p className="text-[15px] text-muted-foreground">No files attached yet. Document answers wait for indexed files.</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {documents.slice(0, 5).map((document) => (
                  <li key={document.document_id} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm font-medium">{document.filename}</span>
                    <Badge variant={document.status === "ready" ? "default" : document.status === "failed" ? "destructive" : "secondary"}>
                      {DOC_STATUS_LABEL[document.status] ?? document.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {documents.length > 5 && (
              <p className="text-[13px] text-muted-foreground">+{(documents.length - 5).toLocaleString("en-IN")} more in the library.</p>
            )}
            <Link to="/documents" className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
              Open Documents
            </Link>
          </section>

          <section aria-labelledby="rail-capability-heading" className="space-y-3">
            <h2 id="rail-capability-heading" className="font-serif text-xl">Source capability</h2>
            {mode === "data" && trust && <TrustStatus status={trust.live_books.status} label={trust.live_books.label} summary={trust.live_books.summary} variant="full" />}
            {mode === "docs" && <TrustStatus status="limited" label="Ready uploaded documents required" summary="Document answers depend on indexed files. The answer will say when no supporting passage can be found." variant="full" />}
            {mode === "genie" && trust?.genie.status === "setup_required" && <GenieSetup />}
            {mode === "genie" && trust?.genie.status !== "setup_required" && trust && <TrustStatus status={trust.genie.status} label={trust.genie.label} summary={trust.genie.summary} variant="full" />}
            {trustUnavailable && mode !== "docs" && <TrustStatus status="unavailable" label="Capability status could not be confirmed" summary="You can still try a question. Any service problem will appear here with a recovery path." variant="full" />}
          </section>

          {mode === "docs" && !docsQuery.isLoading && readyDocs.length === 0 && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Document answers need indexed files. <Link to="/documents" className="text-link font-medium hover:underline">Attach a file in Documents</Link>, then ask here.
            </p>
          )}
        </aside>
      </div>

      <footer className="border-t border-border pt-4 text-[13px] text-muted-foreground">
        Session log lives in this browser tab only — the service keeps nothing, and no actions are taken.
      </footer>
    </div>
  );
}
