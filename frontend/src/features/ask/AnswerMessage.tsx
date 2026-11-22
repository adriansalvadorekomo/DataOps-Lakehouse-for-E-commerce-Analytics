import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, Copy, Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type AskResult, type AskTable, type Rating, type ValueKind } from "@/lib/api";
import { date, inr, int, pct } from "@/lib/format";
import { DotBar } from "@/components/data/DotMatrix";
import { ReportChart } from "./ReportChart";
import { gsap, useGSAP, withMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/BrandMark";

export function AssistantAvatar() {
  return (
    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#121212] ring-1 ring-line">
      <BrandMark size={18} className="text-[#ebe9e4]" />
    </span>
  );
}

function Feedback({ result, rating, onRated }: { result: AskResult; rating: Rating; onRated: (r: Rating) => void }) {
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);
  const m = useMutation({
    mutationFn: ({ r, c }: { r: Rating; c?: string }) => api.rate(result.interaction_id!, r, c),
    onError: () => toast.error("Your feedback could not be saved"),
  });
  const rate = (r: Rating) => {
    const next: Rating = rating === r ? 0 : r;
    onRated(next);
    setAsking(next === -1);
    if (result.interaction_id) m.mutate({ r: next });
    if (next === 1) toast.success("Thanks — marked as helpful", { description: "Ratings are kept to improve future answers." });
  };
  const btn = "rounded-md p-1.5 text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink";

  return (
    <div className="mt-2">
      <div className="flex items-center gap-0.5">
        <button
          className={btn}
          aria-label="Copy answer"
          onClick={async () => {
            await navigator.clipboard?.writeText(result.answer);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4" />}
        </button>
        <button className={cn(btn, rating === 1 && "bg-good-wash text-good hover:text-good")} aria-pressed={rating === 1} aria-label="Helpful" title="Helpful" onClick={() => rate(1)}>
          <ThumbsUp className={cn("size-4", rating === 1 && "fill-current")} />
        </button>
        <button className={cn(btn, rating === -1 && "bg-signal-wash text-signal-ink hover:text-signal-ink")} aria-pressed={rating === -1} aria-label="Not helpful" title="Not helpful" onClick={() => rate(-1)}>
          <ThumbsDown className={cn("size-4", rating === -1 && "fill-current")} />
        </button>
      </div>
      {asking && (
        <form
          className="mt-2 flex max-w-xl items-center gap-2 rounded-xl border border-line bg-panel p-1.5 pl-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (result.interaction_id) m.mutate({ r: -1, c: comment });
            setAsking(false);
            toast.success("Thanks — feedback saved", { description: "It will be used to improve the answers." });
          }}
        >
          <input
            autoFocus
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What would have been more useful? (optional)"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
          />
          <button className="rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-canvas">Send</button>
        </form>
      )}
    </div>
  );
}

function fmt(v: number | string, kind: ValueKind, compact = true): string {
  if (typeof v === "string") return kind === "date" ? date(v) : v;
  switch (kind) {
    case "inr": return inr(v, { compact });
    case "pct": case "share": return pct(v);
    case "count": return int(v);
    case "rating": return `${v.toFixed(1)} / 5`;
    default: return String(v);
  }
}

const NUMERIC: ValueKind[] = ["inr", "pct", "count", "rating"];

function AnswerTable({ table }: { table: AskTable }) {
  return (
    <div className="blk mt-4 overflow-hidden rounded-xl border border-line bg-panel">
      {table.title && <div className="border-b border-line px-4 py-2.5 text-[12.5px] font-semibold text-ink-2">{table.title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-panel-2/60">
              {table.columns.map((c) => (
                <th key={c.key} className={cn("label whitespace-nowrap px-4 py-2 font-semibold", NUMERIC.includes(c.kind) ? "text-right" : "text-left")}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60 last:border-0">
                {table.columns.map((c) => {
                  const v = r[c.key];
                  if (c.kind === "share" && typeof v === "number") {
                    return (
                      <td key={c.key} className="px-4 py-2.5">
                        <div className="flex min-w-[150px] items-center gap-3">
                          <span className="min-w-0 flex-1"><DotBar value={v} dots={14} fluid tone={i === 0 ? "signal" : "ink"} /></span>
                          <span className="num w-12 text-right text-ink-2">{pct(v)}</span>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className={cn("px-4 py-2.5",
                      NUMERIC.includes(c.kind) && "num whitespace-nowrap text-right",
                      c.kind === "id" && "code font-medium",
                      i === 0 && c === table.columns[0] && "font-semibold")}>
                      {v === undefined || v === null ? "—" : fmt(v, c.kind)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** An answer, presented like a briefing from an executive assistant: a titled report
 * card with the finding, key figures, the chart that answers the question, the
 * numbers on request, what it means and where to act — then follow-up questions,
 * what it is based on, and copy / 👍 / 👎 (ratings are stored for later learning).
 * Document answers stay as prose. */
export function AnswerMessage({
  result,
  animate,
  rating,
  onRated,
  onAsk,
}: {
  result: AskResult;
  animate: boolean;
  rating: Rating;
  onRated: (r: Rating) => void;
  onAsk?: (q: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const structured = !!(result.metrics?.length || result.table || result.chart || result.suggestions?.length);
  const isReport = structured && !!result.report;
  const lead = structured ? result.headline ?? result.answer : result.answer;
  const words = lead.split(/(\s+)/);
  const labels = [...new Set(result.sources.map((s) => s.label).filter(Boolean))];
  const tableOpen = !result.chart || showNumbers;

  useGSAP(
    () => {
      if (!animate) return;
      withMotion(() => {
        const tl = gsap.timeline();
        tl.from(".card", { opacity: 0, y: 12, duration: 0.4 })
          .from(".w", { opacity: 0, y: 4, filter: "blur(4px)", duration: 0.32, stagger: 0.014, ease: "power2.out" }, "-=0.2")
          .from(".blk", { opacity: 0, y: 10, duration: 0.4, stagger: 0.08 }, "-=0.15")
          .from(".tile-v", { opacity: 0, y: 6, duration: 0.35, stagger: 0.05 }, "<")
          .from(".after", { opacity: 0, y: 6, duration: 0.3, stagger: 0.06 }, "-=0.1");
      });
    },
    { scope: ref },
  );

  const body = (
    <>
      {isReport && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="label flex items-center gap-2"><span className="size-1.5 rounded-full bg-signal" />{result.report}</span>
          {result.as_of && <span className="text-[12px] text-ink-3">Figures to {date(result.as_of)}</span>}
        </div>
      )}
      <p className={cn(
        isReport ? "font-serif text-[22px] font-semibold leading-snug" : structured ? "text-[17px] font-semibold leading-snug" : "text-[15.5px] leading-[1.7]",
        "text-ink")}>
        {words.map((w, i) => (/\s+/.test(w) ? w : <span key={i} className="w inline-block">{w}</span>))}
      </p>

      {result.metrics && result.metrics.length > 0 && (
        <div className={cn("blk mt-4 grid gap-2.5", result.metrics.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : result.metrics.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2")}>
          {result.metrics.map((m, i) => (
            <div key={m.label} className={cn("rounded-xl border px-3.5 py-3", i === 0 && isReport ? "border-ink/15 bg-panel-2" : "border-line bg-panel")}>
              <div className="text-[12px] text-ink-3">{m.label}</div>
              <div className={cn("tile-v mt-1 text-[20px] font-semibold leading-tight", m.kind === "id" ? "code" : "num")}>{fmt(m.value, m.kind)}</div>
              {m.note && <div className="mt-0.5 text-[11.5px] text-ink-3">{m.note}</div>}
            </div>
          ))}
        </div>
      )}

      {result.chart && <ReportChart spec={result.chart} />}

      {result.table && (
        result.chart ? (
          <div className="blk mt-4">
            <button onClick={() => setShowNumbers((v) => !v)} className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 hover:text-ink" aria-expanded={showNumbers}>
              <ChevronRight className={cn("size-3.5 transition-transform", showNumbers && "rotate-90")} />
              {showNumbers ? "Hide the numbers" : "See the numbers"}
            </button>
            {tableOpen && <AnswerTable table={result.table} />}
          </div>
        ) : <AnswerTable table={result.table} />
      )}

      {result.takeaway && (
        <div className="blk mt-5 flex gap-3 rounded-xl bg-warn-wash/60 px-4 py-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            {isReport && <div className="mb-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-warn">What this means</div>}
            <p className="text-[14px] leading-relaxed text-ink-2">{result.takeaway}</p>
          </div>
        </div>
      )}

      {result.suggestions && result.suggestions.length > 0 && (
        <div className="blk mt-3 flex flex-wrap gap-2">
          {result.suggestions.map((q) => (
            <button key={q} onClick={() => onAsk?.(q)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-ink hover:text-ink">
              {q} <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}

      {result.next_step && (
        <div className="blk mt-5 border-t border-line pt-4">
          <Link to={result.next_step.link}
            className="group inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90">
            {result.next_step.label}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </>
  );

  return (
    <div ref={ref} className="flex gap-3.5">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {isReport ? <div className="card panel p-5 sm:p-6">{body}</div> : body}

        {result.follow_ups && result.follow_ups.length > 0 && (
          <div className="after mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-ink-3">Ask next</span>
            {result.follow_ups.map((q) => (
              <button key={q} onClick={() => onAsk?.(q)}
                className="rounded-full border border-line bg-panel px-3 py-1 text-[12.5px] text-ink-2 transition-colors hover:border-ink hover:text-ink">
                {q}
              </button>
            ))}
          </div>
        )}

        {labels.length > 0 && (
          <div className="after mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="text-ink-3">Based on</span>
            {labels.map((label) => (
              <span key={label} className="rounded-md border border-line bg-panel px-2 py-0.5 text-ink-2">{label}</span>
            ))}
          </div>
        )}
        <div className="after">
          <Feedback result={result} rating={rating} onRated={onRated} />
        </div>
      </div>
    </div>
  );
}
