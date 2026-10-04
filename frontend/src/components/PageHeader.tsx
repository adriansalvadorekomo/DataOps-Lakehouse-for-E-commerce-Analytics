import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Disclosure } from "@/components/Disclosure";
import { Metric } from "@/components/Metric";
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
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="section-kicker section-kicker--ember mb-2">{eyebrow}</p>
        )}
        <h1
          id="page-title"
          tabIndex={-1}
          className="font-serif text-[2rem] font-normal leading-tight tracking-tight text-foreground outline-none"
        >
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{question}</p>
        {caption && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{caption}</div>}
        {meta && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground tabular-nums">{meta}</div>}
      </div>
      {action}
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
  return <Metric label={label} value={value} interpretation={sub} className="border-t-0 bg-transparent py-0" />;
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
        <div className="h-3 w-24 animate-pulse bg-secondary" />
        <div className="h-9 w-64 max-w-[75%] animate-pulse bg-secondary" />
        <div className="h-4 w-[34rem] max-w-full animate-pulse bg-secondary" />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 border-t border-border py-4">
            <div className="h-3 w-20 animate-pulse bg-secondary" />
            <div className="h-8 w-32 max-w-full animate-pulse bg-secondary" />
            <div className="h-3 w-28 max-w-full animate-pulse bg-secondary" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]" aria-hidden="true">
        <div className="h-52 animate-pulse bg-secondary" />
        <div className="space-y-4 border-y border-border py-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 animate-pulse bg-secondary" />)}
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
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3" aria-hidden>
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
    <div role="alert" className="border-l-2 border-destructive pl-4 text-[15px]">
      <p className="font-medium text-foreground">{message ?? "This view couldn't be loaded."}</p>
      <p className="mt-1 max-w-2xl text-muted-foreground">The available data has not changed. Try again, or return later if the service is still recovering.</p>
      {developerHint && <div className="mt-2 font-mono text-[13px] text-muted-foreground">{developerHint}</div>}
      {retry && (
        <button type="button" onClick={retry} className="mt-3 min-h-11 font-medium text-link underline underline-offset-4">
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
          "inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium hover:text-foreground",
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="evidence text-[13px] text-muted-foreground">{sub}</p>
          <h1
            id="page-title"
            tabIndex={-1}
            className="mt-1 font-serif text-[2rem] font-normal leading-tight tracking-tight text-foreground outline-none"
          >
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {action}
          {status}
        </div>
      </div>
      {facts && facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[13px] text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 break-words text-[15px] font-medium tabular-nums">{fact.value}</dd>
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
    <div className="min-w-0 border-t border-border py-4">
      <p className="break-words text-[clamp(1.6rem,3vw,2rem)] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-[13px] font-medium text-muted-foreground">{context}</p>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed">{interpretation}</p>
      <Link to={to} className="text-link mt-3 inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
        {actionLabel}
      </Link>
    </div>
  );
}

/**
 * Progressive lineage disclosure: where a governed number comes from, from
 * the reading endpoint down to the book of record. Content is static and
 * sourced from docs/architecture.md + docs/lakehouse.md.
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
          This page reads <span className="evidence">{endpoint}</span>, which aggregates committed marketplace records.
        </li>
        <li>
          Published reporting contract <span className="evidence">{gold}</span> is built from Silver entities on a green
          data-quality gate.
        </li>
        <li>Bronze lands source records immutably; Silver prepares entities; DQ applies integrity rules R1–R9.</li>
        <li>PostgreSQL is the book of record — the application never reads the lakehouse directly.</li>
      </ol>
      <p className="mt-3">
        <Link to="/pipeline" className="text-link font-medium hover:underline">
          Open the trust center
        </Link>
      </p>
    </Disclosure>
  );
}
