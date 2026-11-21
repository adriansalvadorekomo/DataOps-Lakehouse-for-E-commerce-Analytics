import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/format";
import type { Severity } from "@/lib/api";

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  act: { label: "Act now", cls: "bg-signal text-white" },
  watch: { label: "Watch", cls: "bg-warn-wash text-warn border border-warn/30" },
  info: { label: "For information", cls: "bg-panel-2 text-ink-3 border border-line" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", s.cls)}>{s.label}</span>;
}

const STATUS: Record<string, string> = {
  "IN TRANSIT": "text-violet bg-violet-wash",
  DELIVERED: "text-good bg-good-wash",
  DELAYED: "text-warn bg-warn-wash",
  RETURNED: "text-signal-ink bg-signal-wash",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium", STATUS[status] ?? "bg-panel-2 text-ink-3")}>
      <span className="size-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "signal" | "warn" | "good" | "violet" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium",
        tone === "neutral" && "bg-panel-2 text-ink-2",
        tone === "signal" && "bg-signal-wash text-signal-ink",
        tone === "warn" && "bg-warn-wash text-warn",
        tone === "good" && "bg-good-wash text-good",
        tone === "violet" && "bg-violet-wash text-violet",
      )}
    >
      {children}
    </span>
  );
}
