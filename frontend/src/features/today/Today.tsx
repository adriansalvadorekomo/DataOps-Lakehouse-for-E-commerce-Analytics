import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { api, type Role, type Signal } from "@/lib/api";
import { date, delta, inr, int, pct, pts } from "@/lib/format";
import { usePeriod, useParam } from "@/lib/hooks";
import { gsap, useGSAP, withMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { DotMatrix } from "@/components/data/DotMatrix";
import { KpiInfo } from "@/components/data/KpiInfo";
import { DeltaBadge, type Trend } from "@/components/data/KpiTile";
import { SeverityBadge } from "@/components/data/Badges";
import { EmptyState, ErrorState, Skeleton } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

const ROLES: { id: "" | Role; label: string }[] = [
  { id: "", label: "Everyone" },
  { id: "commercial", label: "Commercial" },
  { id: "fulfillment", label: "Fulfillment" },
  { id: "inventory", label: "Inventory" },
  { id: "customers", label: "Customers" },
  { id: "data", label: "Data" },
];

const DOMAIN: Record<string, string> = {
  revenue: "Revenue", category: "Category mix", pricing: "Pricing", sellers: "Sellers",
  fulfillment: "Fulfillment", inventory: "Inventory", returns: "Returns", customers: "Customers", data: "Data trust",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function linkLabel(link: string) {
  const page = link.split(/[?#]/)[0];
  return {
    "/revenue": "Open Revenue", "/customers": "Open Customers", "/sellers": "Review sellers",
    "/fulfillment": "Open Fulfillment", "/inventory": "Open Inventory", "/forecast": "Open Forecast",
    "/data": "Open Data & governance",
  }[page] ?? "Open";
}

function SignalCard({ s, rank }: { s: Signal; rank: number }) {
  return (
    <article
      className={cn(
        "signal panel reveal relative overflow-hidden p-5 pl-6",
        s.severity === "act" && "border-signal/35",
      )}
      data-flip-id={s.id}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          s.severity === "act" ? "bg-signal" : s.severity === "watch" ? "bg-warn" : "bg-line-strong",
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[12px] text-ink-3">{String(rank).padStart(2, "0")}</span>
        <SeverityBadge severity={s.severity} />
        <span className="label">{DOMAIN[s.domain] ?? s.domain}</span>
        {s.kpi && s.kpi.startsWith("K") ? <KpiInfo id={s.kpi} /> : <span className="label">· {s.kpi}</span>}
      </div>
      <h3 className="mt-3 text-[20px] leading-snug">{s.title}</h3>
      {s.evidence.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[13.5px] text-ink-2">
          {s.evidence.map((e) => (
            <li key={e} className="flex gap-2.5">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" />
              <span className="num">{e}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px]">
          <span className="font-semibold">Next step · </span>
          <span className="text-ink-2">{s.next_step}</span>
        </p>
        <Link
          to={s.link}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-canvas"
        >
          {linkLabel(s.link)}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
}

function PaceRow({ label, value, d, kpiId }: { label: string; value: string; d?: { text: string; dir: "up" | "down" | "flat"; trend: Trend }; kpiId?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
      <div className="flex items-center gap-2 text-[13.5px] text-ink-2">
        {label}
        {kpiId && <KpiInfo id={kpiId} />}
      </div>
      <div className="flex items-center gap-2">
        <span className="num text-[15px] font-semibold">{value}</span>
        {d && <DeltaBadge text={d.text} direction={d.dir} trend={d.trend} />}
      </div>
    </div>
  );
}

export function Today() {
  const [days] = usePeriod();
  const [role, setRole] = useParam("role");
  const scope = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);

  const brief = useQuery({ queryKey: ["brief", days, role], queryFn: () => api.brief(days, (role || null) as Role | null) });
  const perf = useQuery({ queryKey: ["performance", days], queryFn: () => api.performance(days) });
  const fresh = useQuery({ queryKey: ["freshness"], queryFn: api.freshness });
  const gov = useQuery({ queryKey: ["governance-latest"], queryFn: api.governanceLatest, retry: false });

  useReveal(scope, [brief.data?.generated_at, role, days]);

  // The record in transit: the orange dot leaves the brand mark and lands in the brief.
  useGSAP(
    () => {
      if (!brief.data || sessionStorage.getItem("record-landed")) return;
      const from = document.getElementById("brand-record")?.getBoundingClientRect();
      const to = hero.current?.querySelector(".landing")?.getBoundingClientRect();
      if (!from || !to || from.width === 0) return;
      withMotion(() => {
        const dot = document.createElement("div");
        dot.className = "pointer-events-none fixed z-[60] size-3 rounded-full bg-signal shadow-[0_0_24px_var(--signal)]";
        Object.assign(dot.style, { left: `${from.left + from.width / 2 - 6}px`, top: `${from.top + from.height / 2 - 6}px` });
        document.body.appendChild(dot);
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const tl = gsap.timeline({ onComplete: () => dot.remove() });
        tl.to(dot, { x: dx, duration: 1.1, ease: "power2.inOut" }, 0)
          .to(dot, { y: dy, duration: 1.1, ease: "back.in(1.2)" }, 0)
          .to(dot, { scale: 2.4, opacity: 0, duration: 0.35, ease: "power1.out" });
        sessionStorage.setItem("record-landed", "1");
      });
    },
    { dependencies: [brief.data ? 1 : 0] },
  );

  const b = brief.data;
  const m = perf.data?.metrics;
  const act = b?.counts.act ?? 0;
  const watch = b?.counts.watch ?? 0;

  const d = (key: keyof NonNullable<typeof m>, higherIsGood: boolean, rate = false) => {
    const c = m?.[key];
    if (!c) return undefined;
    const good = c.direction === "flat" ? "neutral" : (c.direction === "up") === higherIsGood ? "good" : "bad";
    return { text: rate ? pts(c.current, c.previous) : delta(c.relative_change), dir: c.direction, trend: good as Trend };
  };

  return (
    <div ref={scope}>
      {/* Hero */}
      <section ref={hero} className="dot-grid relative mb-8 overflow-hidden rounded-[var(--radius-panel)] border border-line px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-canvas via-canvas/90 to-canvas/40" />
        <div className="relative grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="landing flex items-end gap-5">
            {b ? (
              <DotMatrix value={String(act)} dot={11} gap={4} tone={act ? "signal" : "ink"} label={`${act} signals to act on`} />
            ) : (
              <Skeleton className="h-[101px] w-[90px]" />
            )}
          </div>
          <div>
            <div className="label mb-3 flex items-center gap-2">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-signal" />
              Today&apos;s brief · last {days} days to {date(b?.window?.as_of)}
            </div>
            <h1 className="text-[34px] leading-[1.08] sm:text-[44px]">
              {greeting()}. {b ? (act === 0 ? "Nothing needs you urgently." : `${act === 1 ? "One thing needs" : `${act} things need`} you today.`) : "Reading the books…"}
            </h1>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-2">
              {b
                ? `${act} to act on, ${watch} to watch, ranked by impact. Every signal is computed live from the books with its evidence and a next step, and thresholds come from the data itself, so the brief stays meaningful as new orders arrive.`
                : "Computing signals from the live books."}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {/* Role filter */}
          <div role="tablist" aria-label="Filter by role" className="mb-5 flex flex-wrap gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r.id || "all"}
                role="tab"
                aria-selected={role === r.id}
                onClick={() => setRole(r.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  role === r.id ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {b?.partial && (
            <div className="mb-5 rounded-xl border border-warn/40 bg-warn-wash p-4 text-[13.5px]">
              <span className="font-semibold text-warn">The latest {days} days look incomplete</span>{" "}
              <span className="text-ink-2">
                ({pct(b.completeness ?? 0, 0)} of the previous period&apos;s orders). Revenue, category and customer signals are marked partial until the period is fully loaded.
              </span>
            </div>
          )}
          {brief.isError && <ErrorState error={brief.error} />}
          {brief.isLoading && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[190px]" />)}
            </div>
          )}
          {b?.empty && (
            <EmptyState title="The books are empty" action={<Link to="/data" className="font-medium text-signal-ink link-underline">Import a CSV →</Link>}>
              Load the 1M-row seed (<span className="code">mise run seed</span>) or import a marketplace export, and the brief will compute itself.
            </EmptyState>
          )}
          {b && !b.empty && b.signals.length === 0 && (
            <EmptyState title="Nothing to report for this role">Every signal for this role is within its normal range in the last {days} days.</EmptyState>
          )}
          <div className="space-y-4">
            {b?.signals.map((s, i) => <SignalCard key={s.id} s={s} rank={i + 1} />)}
          </div>
        </div>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-20 xl:self-start">
          <section className="panel reveal p-5">
            <div className="label mb-1">Pace · last {days} days vs previous</div>
            {m ? (
              <div>
                <PaceRow label="Revenue" value={inr(m.revenue.current)} d={d("revenue", true)} kpiId="K1" />
                <PaceRow label="Orders" value={int(m.orders.current)} d={d("orders", true)} />
                <PaceRow label="Average order value" value={inr(m.aov.current, { compact: false })} d={d("aov", true)} kpiId="K2" />
                <PaceRow label="Late deliveries" value={pct(m.delayed_rate.current)} d={d("delayed_rate", false, true)} kpiId="K4" />
                <PaceRow label="Return rate" value={pct(m.return_rate.current)} d={d("return_rate", false, true)} kpiId="K3" />
              </div>
            ) : (
              <Skeleton className="mt-3 h-[220px]" />
            )}
            <Link to="/revenue" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-signal-ink link-underline">
              Explain the numbers <ArrowRight className="size-3.5" />
            </Link>
          </section>

          <section className="panel reveal p-5">
            <div className="label mb-3 flex items-center gap-2">
              <ShieldCheck className="size-3.5" /> Can I trust these numbers?
            </div>
            <dl className="space-y-2.5 text-[13.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Data contract</dt>
                <dd className={cn("font-medium",
                  gov.data?.status === "passed" && "text-good",
                  gov.data?.status === "warning" && "text-warn",
                  (gov.data?.status === "failed" || gov.data?.status === "error") && "text-signal-ink")}>
                  {gov.data ? `${gov.data.successful}/${gov.data.evaluated} expectations met` : "not validated yet"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Books up to</dt>
                <dd className="num font-medium">{date(fresh.data?.as_of)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Forecast</dt>
                <dd className={cn("font-medium", fresh.data?.forecast !== "current" && "text-warn")}>
                  {fresh.data?.forecast === "current" ? "current" : fresh.data?.forecast === "stale" ? `${fresh.data.forecast_lag_days} days behind` : "not published"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-3">
              A Great Expectations contract checks the books (rules R1–R8) on demand and after every import.
            </p>
            <Link to="/data" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-signal-ink link-underline">
              See the evidence <ArrowRight className="size-3.5" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
