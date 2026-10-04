import { cn } from "@/lib/utils";

export function MeterRow({
  label,
  value,
  max,
  valueLabel,
  secondary,
  className,
}: {
  label: React.ReactNode;
  value: number;
  max?: number;
  valueLabel?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  const semanticProgress = Number.isFinite(value) && Number.isFinite(max) && (max ?? 0) > 0 && value >= 0 && value <= (max ?? 0);
  const width = semanticProgress ? Math.min(100, Math.max(0, (value / (max as number)) * 100)) : Math.min(100, Math.max(0, value));
  const bar = <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />;

  return (
    <div className={cn("py-3", className)}>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="min-w-0 font-medium text-foreground">{label}</span>
        <span className="shrink-0 font-semibold text-foreground tabular-nums">{valueLabel ?? value}</span>
      </div>
      {secondary && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{secondary}</div>}
      {semanticProgress ? (
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-label={typeof label === "string" ? label : undefined}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={typeof valueLabel === "string" ? valueLabel : undefined}
        >
          {bar}
        </div>
      ) : (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">{bar}</div>
      )}
    </div>
  );
}
