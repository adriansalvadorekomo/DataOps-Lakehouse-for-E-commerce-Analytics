/** A brief signal, drawn as a one-page briefing: the headline, the one number to
 * remember, the chart that explains it, the supporting figures and the next step.
 * The look borrows from the brand mark: values light up on a dot-matrix display. */
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { Signal, SignalFigure, SignalVisual } from "@/lib/api";
import { delta, inr, int, pct } from "@/lib/format";
import { gsap, useGSAP, withMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { DotMatrix } from "@/components/data/DotMatrix";
import { KpiInfo } from "@/components/data/KpiInfo";

type Tone = "signal" | "warn" | "ink";

const SEVERITY = {
  act: { label: "Act now", tone: "signal" as Tone },
  watch: { label: "Watch", tone: "warn" as Tone },
  info: { label: "For information", tone: "ink" as Tone },
};

const COLOR: Record<Tone, string> = { signal: "var(--signal)", warn: "var(--warn)", ink: "var(--ink-2)" };

const DOMAIN: Record<string, string> = {
  revenue: "Revenue", category: "Category mix", pricing: "Pricing", sellers: "Sellers",
  fulfillment: "Fulfillment", inventory: "Inventory", returns: "Returns", customers: "Customers", data: "Data trust",
};

function linkLabel(link: string) {
  const page = link.split(/[?#]/)[0];
  return {
    "/revenue": "Open Revenue", "/customers": "Open Customers", "/sellers": "Review sellers",
    "/fulfillment": "Open Fulfillment", "/inventory": "Open Inventory", "/forecast": "Open Forecast",
    "/data": "Open Data & governance",
  }[page] ?? (page.startsWith("/data") ? "Open the import" : "Open");
}

function fmt(value: number, unit: SignalVisual["unit"] | SignalFigure["kind"]): string {
  switch (unit) {
    case "inr": return inr(value);
    case "pct": return pct(value);
    case "signed_pct": return delta(value);
    case "days": return `${int(value)} d`;
    default: return int(value);
  }
}

/* ── headline figure ─────────────────────────────────────────────────────── */

/** A 10 × 10 grid of dots, one per percent; at least one lights for any share above zero. */
function Waffle({ share, tone }: { share: number; tone: Tone }) {
  const lit = share > 0 ? Math.max(1, Math.round(Math.min(1, share) * 100)) : 0;
  return (
    <div className="grid w-fit grid-cols-10 gap-[3px]" role="img" aria-label={`${pct(share)} of the whole`}>
      {Array.from({ length: 100 }, (_, i) => (
        <span
          key={i}
          className={cn("size-[7px] rounded-full", i < lit && "waffle-lit")}
          style={{ background: i < lit ? COLOR[tone] : "var(--dot-off)" }}
        />
      ))}
    </div>
  );
}

function Figure({ f, tone }: { f: SignalFigure; tone: Tone }) {
  const full = fmt(f.value, f.kind);
  // The rupee sign reads better as type than as a 5 × 7 glyph.
  const rupee = full.replace("−", "").startsWith("₹");
  const text = (rupee ? full.replace("−", "") : full).replace("₹", "").replace(" d", "");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        {rupee && <span aria-hidden="true" className={cn("-mb-1 font-serif text-[44px] leading-none", tone === "signal" ? "text-signal" : "text-ink")}>{full.startsWith("−") ? "−₹" : "₹"}</span>}
        <DotMatrix value={text} dot={6} gap={2.5} tone={tone === "signal" ? "signal" : "ink"} label={fmt(f.value, f.kind)} />
        {f.kind === "days" && <span className="label pb-0.5">days</span>}
      </div>
      <p className="max-w-[30ch] text-[13px] leading-snug text-ink-2">{f.caption}</p>
      {f.of && <Waffle share={f.value} tone={tone} />}
    </div>
  );
}

/* ── charts ──────────────────────────────────────────────────────────────── */

/** Ordered buckets as columns of lit dots (a dot-matrix bar chart). */
function Steps({ v, tone }: { v: SignalVisual; tone: Tone }) {
  const max = Math.max(...v.items.map((i) => i.value), 1);
  const ROWS = 10;
  return (
    <div className="grid h-full items-end gap-3" style={{ gridTemplateColumns: `repeat(${v.items.length}, minmax(0, 1fr))` }}>
      {v.items.map((it, col) => {
        const lit = it.value > 0 ? Math.max(1, Math.round((it.value / max) * ROWS)) : 0;
        const last = col === v.items.length - 1;
        return (
          <div key={it.label} className="flex flex-col items-center gap-2">
            <span className={cn("num text-[13px] font-semibold", last ? "text-ink" : "text-ink-2")}>{int(it.value)}</span>
            <div className="grid grid-cols-4 gap-[3px]" aria-hidden="true">
              {Array.from({ length: ROWS * 4 }, (_, i) => {
                const row = ROWS - 1 - Math.floor(i / 4);
                const on = row < lit;
                return (
                  <span
                    key={i}
                    className={cn("size-[6px] rounded-full", on && "step-lit")}
                    data-row={row}
                    style={{ background: on ? (last || tone === "ink" ? COLOR[tone] : `color-mix(in srgb, ${COLOR[tone]} 55%, transparent)`) : "var(--dot-off)" }}
                  />
                );
              })}
            </div>
            <span className="code text-[11.5px] text-ink-3">{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Two or three values side by side, the current one in the signal colour. */
function Compare({ v, tone }: { v: SignalVisual; tone: Tone }) {
  const max = Math.max(...v.items.map((i) => Math.abs(i.value)), 1);
  return (
    <div className="flex flex-col gap-4">
      {v.items.map((it) => (
        <div key={it.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className={cn("text-[13px]", it.current ? "font-medium text-ink" : "text-ink-3")}>{it.label}</span>
            <span className={cn("num text-[15px]", it.current ? "font-semibold" : "text-ink-2")}>{fmt(it.value, v.unit)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
            <div
              className="bar h-full origin-left rounded-full"
              style={{ width: `${(Math.abs(it.value) / max) * 100}%`, background: it.current ? COLOR[tone] : "var(--ink-3)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The named items behind the signal, with an optional reference line (e.g. "typical seller"). */
function Ranking({ v, tone }: { v: SignalVisual; tone: Tone }) {
  const values = v.items.map((i) => i.value);
  const signed = v.unit === "signed_pct";
  const lo = signed ? Math.min(0, ...values) : 0;
  const hi = Math.max(0, ...values, v.reference?.value ?? 0) || 1;
  const span = hi - lo || 1;
  const zero = ((0 - lo) / span) * 100;
  const at = (x: number) => ((x - lo) / span) * 100;
  return (
    <div className="flex flex-col">
      {v.reference && (
        <div className="mb-2 flex items-center justify-end gap-1.5 text-[11.5px] text-ink-3">
          <span className="inline-block h-3 border-l border-dashed border-ink-3" />
          {v.reference.label} · <span className="num">{fmt(v.reference.value, v.unit)}</span>
        </div>
      )}
      <ul className="flex flex-col gap-2.5">
        {v.items.map((it) => {
          const neg = it.value < 0;
          const left = signed ? Math.min(zero, at(it.value)) : 0;
          const width = signed ? Math.abs(at(it.value) - zero) : at(it.value);
          const color = signed ? (neg ? "var(--signal)" : "var(--good)") : it.current ? COLOR[tone] : "var(--ink-3)";
          return (
            <li key={it.label} className="grid grid-cols-[minmax(84px,128px)_1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <div className={cn("truncate text-[13px]", it.current ? "font-medium text-ink" : "text-ink-2")}>{it.label}</div>
                {it.hint && <div className="truncate text-[11.5px] text-ink-3">{it.hint}</div>}
              </div>
              <div className="relative h-2 rounded-full bg-sunken">
                <div
                  className={cn("bar absolute inset-y-0 rounded-full", signed && neg ? "origin-right" : "origin-left")}
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%`, background: color, opacity: signed && !it.current ? 0.45 : 1 }}
                />
                {signed && <span className="absolute -inset-y-1 w-px bg-line-strong" style={{ left: `${zero}%` }} />}
                {v.reference && (
                  <span className="absolute -inset-y-1.5 border-l border-dashed border-ink-3" style={{ left: `${at(v.reference.value)}%` }} />
                )}
              </div>
              <span className={cn("num w-[64px] text-right text-[13px]", it.current ? "font-semibold" : "text-ink-2")}>{fmt(it.value, v.unit)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Visual({ v, tone }: { v: SignalVisual; tone: Tone }) {
  return (
    <figure className="flex h-full flex-col">
      <figcaption className="label mb-4">{v.title}</figcaption>
      <div className="flex-1">
        {v.kind === "steps" && <Steps v={v} tone={tone} />}
        {v.kind === "compare" && <Compare v={v} tone={tone} />}
        {v.kind === "ranking" && <Ranking v={v} tone={tone} />}
      </div>
    </figure>
  );
}

/** Labelled figures, set like a specification sheet. */
function Facts({ facts, large = false }: { facts: { label: string; value: string }[]; large?: boolean }) {
  return (
    <dl
      className={cn("grid", large && "gap-5")}
      style={large ? undefined : { gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}
    >
      {facts.map((f, i) => (
        <div key={f.label} className={cn(!large && "px-6 py-3.5", !large && i > 0 && "border-l border-line")}>
          <dt className="label">{f.label}</dt>
          <dd className={cn("num mt-1 font-semibold text-ink", large ? "text-[22px]" : "text-[16px]")}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── the card ────────────────────────────────────────────────────────────── */

export function SignalCard({ s, rank }: { s: Signal; rank: number }) {
  const ref = useRef<HTMLElement>(null);
  const sev = SEVERITY[s.severity];
  const facts = s.facts ?? [];
  const hasBody = Boolean(s.figure || s.visual);
  const sideFacts = !s.visual && facts.length > 0;

  useGSAP(
    () => {
      withMotion(() => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: ref.current, start: "top 88%", once: true } });
        tl.from(ref.current!.querySelectorAll(".bar"), { scaleX: 0, duration: 0.9, ease: "expo.out", stagger: 0.06 })
          .from(ref.current!.querySelectorAll(".step-lit"), {
            opacity: 0, scale: 0.3, duration: 0.35, ease: "back.out(2.4)",
            stagger: { each: 0.008, from: "end" },
          }, 0)
          .from(ref.current!.querySelectorAll(".waffle-lit"), {
            opacity: 0, scale: 0.2, duration: 0.3, ease: "back.out(2)", stagger: { each: 0.006, from: "start" },
          }, 0.1);
      });
    },
    { scope: ref, dependencies: [s.id] },
  );

  return (
    <article
      ref={ref}
      data-flip-id={s.id}
      className={cn(
        "signal reveal group overflow-hidden rounded-[var(--radius-panel)] border bg-panel shadow-[var(--shadow-panel)] transition-colors",
        s.severity === "act" ? "border-signal/30" : "border-line hover:border-line-strong",
      )}
    >
      {/* Meta strip: severity light, rank, domain, measure */}
      <header className="flex items-center gap-3 px-6 pt-5">
        <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
          {s.severity === "act" && <span className="absolute inset-0 animate-ping rounded-full bg-signal opacity-60 motion-reduce:animate-none" />}
          <span className="relative size-2.5 rounded-full" style={{ background: COLOR[sev.tone] }} />
        </span>
        <span className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]",
          sev.tone === "signal" ? "text-signal-ink" : sev.tone === "warn" ? "text-warn" : "text-ink-3")}>
          {sev.label}
        </span>
        <span className="h-3 w-px bg-line-strong" />
        <span className="label">{DOMAIN[s.domain] ?? s.domain}</span>
        <span className="ml-auto flex items-center gap-2">
          {s.kpi?.startsWith("K") && <KpiInfo id={s.kpi} />}
          <span className="code text-[12px] text-ink-3">{String(rank).padStart(2, "0")}</span>
        </span>
      </header>

      <h3 className="px-6 pt-3 text-[22px] leading-[1.25] text-balance">{s.title}</h3>

      {hasBody ? (
        <div className={cn("mt-5 grid border-t border-line", (s.visual || sideFacts) && s.figure && "md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
          {s.figure && (
            <div className="px-6 py-6">
              <Figure f={s.figure} tone={sev.tone} />
            </div>
          )}
          {s.visual && (
            <div className={cn("px-6 py-6", s.figure && "border-t border-line md:border-t-0 md:border-l")}>
              <Visual v={s.visual} tone={sev.tone} />
            </div>
          )}
          {sideFacts && (
            <div className={cn("flex items-center px-6 py-6", s.figure && "border-t border-line md:border-t-0 md:border-l")}>
              <Facts facts={facts} large />
            </div>
          )}
        </div>
      ) : (
        s.evidence.length > 0 && (
          <ul className="mt-3 space-y-1 px-6 text-[13.5px] text-ink-2">
            {s.evidence.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )
      )}

      {s.visual && facts.length > 0 && (
        <div className="border-t border-line">
          <Facts facts={facts} />
        </div>
      )}

      {s.note && (
        <p className="border-t border-line px-6 py-3 text-[12.5px] text-ink-3">
          <span className="mr-1.5 text-ink-2">*</span>{s.note}
        </p>
      )}

      {/* The action strip */}
      <footer
        className={cn(
          "flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between",
          s.severity === "act" ? "border-signal/20 bg-signal-wash" : s.severity === "watch" ? "border-warn/20 bg-warn-wash" : "border-line bg-sunken",
        )}
      >
        <div className="flex items-baseline gap-3">
          <span className="label shrink-0 text-ink-2">Next step</span>
          <p className="text-[14px] leading-snug text-ink">{s.next_step}</p>
        </div>
        <Link
          to={s.link}
          className={cn(
            "group/cta inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-4 py-2 text-[13px] font-semibold transition-all sm:self-auto",
            s.severity === "act"
              ? "bg-signal text-white hover:brightness-110"
              : "border border-line-strong bg-panel text-ink hover:border-ink hover:bg-ink hover:text-canvas",
          )}
        >
          {linkLabel(s.link)}
          <ArrowRight className="size-3.5 transition-transform group-hover/cta:translate-x-0.5" />
        </Link>
      </footer>
    </article>
  );
}
