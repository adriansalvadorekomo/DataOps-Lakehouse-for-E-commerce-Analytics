import { AlertTriangle, Check, CircleMinus } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrustStatusValue =
  | "trusted"
  | "passing"
  | "succeeded"
  | "current"
  | "ready"
  | "validated_snapshot"
  | "attention"
  | "failing"
  | "failed"
  | "stale"
  | "setup_required"
  | "limited"
  | "running"
  | "not_found"
  | "not_run"
  | "unavailable";

const positive = new Set<TrustStatusValue>(["trusted", "passing", "succeeded", "current", "ready", "validated_snapshot"]);
const attention = new Set<TrustStatusValue>(["attention", "failing", "failed", "stale", "setup_required"]);

export function TrustStatus({
  status,
  label,
  summary,
  variant = "compact",
  className,
}: {
  status: TrustStatusValue;
  label: string;
  summary?: string;
  variant?: "compact" | "full";
  className?: string;
}) {
  const tone = positive.has(status) ? "positive" : attention.has(status) ? "attention" : "neutral";
  const Icon = tone === "positive" ? Check : tone === "attention" ? AlertTriangle : CircleMinus;
  const stateText = tone === "positive" ? "Verified" : tone === "attention" ? "Needs attention" : "Limited evidence";

  return (
    <div className={cn("min-w-0", variant === "full" && "border-l-2 border-border pl-4", className)}>
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full border",
            tone === "positive" && "border-success/40 bg-success/10 text-success",
            tone === "attention" && "border-warning/40 bg-warning/10 text-warning",
            tone === "neutral" && "border-border bg-secondary text-muted-foreground",
          )}
          aria-hidden="true"
        >
          <Icon size={12} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-foreground">{label}</p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{stateText}</p>
        </div>
      </div>
      {variant === "full" && summary && <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{summary}</p>}
    </div>
  );
}
