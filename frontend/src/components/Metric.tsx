import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export type MetricDirection = "up" | "down" | "flat" | "neutral";

const directionDetails = {
  up: { icon: ArrowUp, text: "Up" },
  down: { icon: ArrowDown, text: "Down" },
  flat: { icon: ArrowRight, text: "Unchanged" },
  neutral: { icon: ArrowRight, text: "No direction" },
};

export function Metric({
  label,
  value,
  scope,
  comparison,
  direction = "neutral",
  polarity,
  interpretation,
  tone = "normal",
  className,
  spark,
  to,
}: {
  label: string;
  value: React.ReactNode;
  scope?: React.ReactNode;
  comparison?: string | null;
  direction?: MetricDirection;
  /** Finance polarity: which move direction is good. Colors the delta chip
      green/red; flat or unset polarity stays neutral. Icon + words remain so
      color is never the sole signal. */
  polarity?: "good-up" | "good-down";
  interpretation?: React.ReactNode;
  tone?: "normal" | "attention";
  className?: string;
  /** Daily backend series (e.g. revenue, orders) drawn as a silent miniature. */
  spark?: number[];
  /** Investigation route: the value becomes a link into entity detail. */
  to?: string;
}) {
  const detail = directionDetails[direction];
  const DirectionIcon = detail.icon;
  const moved = direction === "up" || direction === "down";
  const good = !moved || !polarity ? null : (polarity === "good-up") === (direction === "up");

  return (
    <section
      className={cn(
        "panel min-w-0 p-4",
        tone === "attention" && "border-warning/60",
        className,
      )}
      aria-label={label}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <p className="section-kicker">{label}</p>
        {scope && <p className="shrink-0 text-right text-xs text-muted-foreground">{scope}</p>}
      </div>
      <p className="mt-2 break-words text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {to ? (
          <Link to={to} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none">
            {value}
          </Link>
        ) : (
          value
        )}
      </p>
      {comparison != null && comparison !== "" && (
        <p
          className={cn(
            "mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
            good === true && "bg-success/10 text-success",
            good === false && "bg-destructive/10 text-destructive",
            good == null && "bg-secondary text-foreground",
          )}
        >
          <DirectionIcon size={13} strokeWidth={2.25} aria-hidden="true" />
          <span className="sr-only">{detail.text}:</span>
          <span className={cn(good == null && "text-muted-foreground")}>{comparison}</span>
        </p>
      )}
      {interpretation && (
        <p className={cn("mt-2 max-w-[48ch] text-[13px] leading-relaxed text-muted-foreground", tone === "attention" && "text-warning")}>
          {interpretation}
        </p>
      )}
      {spark && spark.length > 1 && (
        <div className="mt-3 h-9" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((point) => ({ point }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone"
                dataKey="point"
                stroke={tone === "attention" ? "var(--warning)" : "var(--chart-1)"}
                strokeWidth={1.5}
                fill={tone === "attention" ? "var(--warning)" : "var(--chart-1)"}
                fillOpacity={0.12}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
