import { Link } from "react-router-dom";

export function PageHeader({
  title,
  question,
  action,
}: {
  title: string;
  question: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif text-[2rem] font-normal leading-tight tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">{question}</p>
      </div>
      {action}
    </div>
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
    <div>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-[1.65rem] font-medium tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">{sub}</p>}
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
        <Link to={to} className="mt-3 inline-block text-[15px] hover:underline">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className="h-4 flex-1 animate-pulse rounded bg-secondary" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <div className="h-full min-h-48 animate-pulse rounded bg-secondary" aria-hidden />;
}

export function KpiSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          <div className="h-8 w-36 animate-pulse rounded bg-secondary" />
        </div>
      ))}
    </div>
  );
}

export function StackError({ message }: { message?: string }) {
  return (
    <p className="text-[15px] text-destructive">
      {message ?? "Couldn't load this view."} Start the stack with{" "}
      <code className="font-mono text-[13px]">mise run dev</code>.
    </p>
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
