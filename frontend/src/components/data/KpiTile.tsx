import { useRef } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { gsap, useGSAP, withMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { KpiInfo } from "./KpiInfo";

/** Counts a number up from zero on mount/change (final text is always correct). */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      el.textContent = format(value);
      withMotion(() => {
        const o = { v: 0 };
        gsap.to(o, {
          v: value,
          duration: 1.1,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = format(o.v);
          },
          onComplete: () => {
            el.textContent = format(value);
          },
        });
      });
    },
    { dependencies: [value] },
  );
  return <span ref={ref}>{format(value)}</span>;
}

export type Trend = "good" | "bad" | "neutral";

export function DeltaBadge({ text, trend, direction }: { text: string; trend: Trend; direction: "up" | "down" | "flat" }) {
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold",
        trend === "good" && "bg-good-wash text-good",
        trend === "bad" && "bg-signal-wash text-signal-ink",
        trend === "neutral" && "bg-panel-2 text-ink-3",
      )}
    >
      <Icon className="size-3.5" />
      {text}
    </span>
  );
}

export function KpiTile({
  label,
  value,
  format,
  kpiId,
  delta,
  note,
  className,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  format: (n: number) => string;
  kpiId?: string;
  delta?: { text: string; trend: Trend; direction: "up" | "down" | "flat"; vs?: string };
  note?: string;
  className?: string;
  tone?: "signal" | "violet";
}) {
  return (
    <div className={cn("panel reveal flex flex-col gap-3 p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        {kpiId && <KpiInfo id={kpiId} />}
      </div>
      <div className={cn("num text-[30px] font-semibold leading-none", tone === "signal" && "text-signal", tone === "violet" && "text-violet")}>
        {value === null || value === undefined ? "—" : <CountUp value={value} format={format} />}
      </div>
      {(delta || note) && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
          {delta && <DeltaBadge {...delta} />}
          {delta?.vs && <span>{delta.vs}</span>}
          {note && <span>{note}</span>}
        </div>
      )}
    </div>
  );
}
