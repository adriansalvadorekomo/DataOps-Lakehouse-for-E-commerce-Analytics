import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Disclosure } from "@/components/Disclosure";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/utils";

export function PageHeader({
  title,
  question,
  eyebrow,
  caption,
  meta,
  action,
}: {
  title: string;
  question: React.ReactNode;
  eyebrow?: React.ReactNode;
  caption?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="section-kicker section-kicker--ember mb-1.5">{eyebrow}</p>
        )}
        <h1
          id="page-title"
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight text-foreground outline-none"
        >
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{question}</p>
        {caption && <div className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{caption}</div>}
        {meta && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground tabular-nums">{meta}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2 pb-0.5">{action}</div>}
    </header>
  );
}

export function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="section-kicker">{label}</p>
      <p className="mt-1.5 break-words text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  to,
  cta,
}: {
  title: string;
  body: string;
  to?: string;
  cta?: string;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 text-[15px] text-muted-foreground">{body}</p>
      {to && cta && (
        <Link to={to} className="text-link mt-3 inline-block text-[15px] hover:underline">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-9">
      <span className="sr-only">Loading page…</span>
      <div className="space-y-3" aria-hidden="true">
        <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
        <div className="h-7 w-64 max-w-[75%] animate-pulse rounded-md bg-secondary" />
        <div className="h-4 w-[34rem] max-w-full animate-pulse rounded bg-secondary" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="panel space-y-3 p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
            <div className="h-8 w-32 max-w-full animate-pulse rounded bg-secondary" />
            <div className="h-3 w-28 max-w-full animate-pulse rounded bg-secondary" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]" aria-hidden="true">
        <div className="panel h-52 animate-pulse" />
        <div className="panel space-y-4 p-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 animate-pulse rounded bg-secondary" />)}
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading table">
      <span className="sr-only">Loading table…</span>
      <div className="space-y-2 p-4" aria-hidden>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3">
            {Array.from({ length: cols }).map((__, j) => (
              <div key={j} className="h-4 flex-1 animate-pulse rounded bg-secondary" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div role="status" aria-label="Loading chart" className="h-full min-h-48">
      <span className="sr-only">Loading chart…</span>
      <div className="h-full min-h-48 animate-pulse rounded bg-secondary" aria-hidden />
    </div>
  );
}

export function KpiSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div role="status" aria-label="Loading marketplace measures">
      <span className="sr-only">Loading marketplace measures…</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
            <div className="h-8 w-36 animate-pulse rounded bg-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StackError({
  message,
  retry,
  developerHint,
}: {
  message?: string;
  retry?: () => void;
  developerHint?: React.ReactNode;
}) {
  return (
    <div role="alert" className="panel border-l-2 border-l-destructive p-4 text-sm">
      <p className="font-semibold text-foreground">{message ?? "This view couldn't be loaded."}</p>
      <p className="mt-1 max-w-2xl text-muted-foreground">The available data has not changed. Try again, or return later if the service is still recovering.</p>
      {developerHint && <div className="mt-2 font-mono text-xs text-muted-foreground">{developerHint}</div>}
      {retry && (
        <button type="button" onClick={retry} className="mt-2.5 min-h-9 font-medium text-link underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1.5">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Sortable table header: reorders the returned rows for review. */
export function SortTh({
  label,
  column,
  activeColumn,
  direction,
  onToggle,
  align = "left",
}: {
  label: string;
  column: string;
  activeColumn: string;
  direction: SortDirection;
  onToggle: (column: string) => void;
  align?: "left" | "right";
}) {
  const active = column === activeColumn;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
      className={align === "right" ? "text-right" : undefined}
    >
      <button
        type="button"
        onClick={() => onToggle(column)}
        aria-label={`Sort by ${label}`}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-sm font-semibold hover:text-foreground",
          align === "right" && "w-full justify-end text-right",
        )}
      >
        {label}
        <Icon size={13} strokeWidth={2.25} aria-hidden="true" className={active ? undefined : "text-muted-foreground"} />
      </button>
    </TableHead>
  );
}

/**
 * Enterprise entity header: identity line, display name, live status, and a
 * fact grid (commercial / operational / record facts). Shared by order,
 * seller, product and customer detail experiences.
 */
export function EntityHeader({
  title,
  sub,
  status,
  facts,
  action,
}: {
  title: string;
  sub: React.ReactNode;
  status?: React.ReactNode;
  facts?: { label: string; value: React.ReactNode }[];
  action?: React.ReactNode;
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="evidence text-xs text-muted-foreground">{sub}</p>
          <h1
            id="page-title"
            tabIndex={-1}
            className="mt-1 text-xl font-semibold tracking-tight text-foreground outline-none"
          >
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-0.5">
          {action}
          {status}
        </div>
      </div>
      {facts && facts.length > 0 && (
        <dl className="panel grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="section-kicker">{fact.label}</dt>
              <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/**
 * Insight block: number + context + plain-language interpretation + the
 * investigation action. Every important metric should degrade to this.
 */
export function Insight({
  value,
  context,
  interpretation,
  to,
  actionLabel,
}: {
  value: React.ReactNode;
  context: string;
  interpretation: string;
  to: string;
  actionLabel: string;
}) {
  return (
    <div className="panel min-w-0 p-4">
      <p className="break-words text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <p className="section-kicker mt-2.5">{context}</p>
      <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">{interpretation}</p>
      <Link to={to} className="text-link mt-2.5 inline-flex min-h-9 items-center text-sm font-medium hover:underline">
        {actionLabel}
      </Link>
    </div>
  );
}

/**
 * Source note: where a number comes from, in stakeholder words first. The
 * exact technical reference stays attached in small print for operators.
 */
export function Lineage({
  metric,
  endpoint,
  gold,
}: {
  metric: string;
  endpoint: string;
  gold: string;
}) {
  return (
    <Disclosure summary={`Where does ${metric} come from?`}>
      <ol className="ml-5 list-decimal space-y-1.5">
        <li>
          These numbers come from recorded marketplace activity — orders and order lines as booked, plus the stored outlook where shown.
        </li>
        <li>
          Published reports are built from checked data: quality checks run before anything is published.
        </li>
        <li>Recorded orders are the source every page shares — no page computes its own totals.</li>
      </ol>
      <p className="evidence mt-3 text-xs text-muted-foreground">Technical reference: {endpoint} · {gold}</p>
      <p className="mt-3">
        <Link to="/pipeline" className="text-link font-medium hover:underline">
          Open the trust center
        </Link>
      </p>
    </Disclosure>
  );
}
