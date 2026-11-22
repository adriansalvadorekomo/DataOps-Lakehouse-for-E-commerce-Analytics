import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Loading: a dot-matrix row shimmering, like the display warming up. */
export function Dots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex gap-1", className)} role="status" aria-label="Loading">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="size-1.5 animate-shimmer rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("dot-grid animate-shimmer rounded-lg border border-line", className)} />;
}

export function PageLoading() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <Dots />
    </div>
  );
}

export function ErrorState({ error, title = "This view could not load" }: { error: unknown; title?: string }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const offline = error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-signal/40 bg-signal-wash p-4 text-[13.5px]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal" />
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-ink-2">
          {offline ? "The data service can't be reached right now. Please try again in a moment." : message}
        </p>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="dot-grid flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="font-serif text-[18px] font-semibold">{title}</div>
      {children && <p className="max-w-md text-[13.5px] text-ink-2">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function NotFound() {
  return (
    <EmptyState title="Nothing here" action={<Link to="/" className="font-medium text-signal-ink link-underline">Back to Today →</Link>}>
      This page does not exist. Use ⌘K to jump to a seller, product, customer or order.
    </EmptyState>
  );
}
