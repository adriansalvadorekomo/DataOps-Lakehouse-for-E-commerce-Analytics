import { formatINR, formatINRCompact } from "@/lib/api";

export type TapeItem = { symbol: string; value: number };

/**
 * Wall-Street-style levels tape: a scrolling strip of tracked revenue
 * levels (categories, metros, top sellers). Levels only — never moves or
 * percentages the backend did not compute. The data behind the tape is
 * repeated in the page boards, so the duplicate loop half is hidden from
 * assistive technology and motion halts under prefers-reduced-motion.
 */
export function TickerTape({ items, label }: { items: TapeItem[]; label: string }) {
  if (items.length === 0) return null;
  const half = (hidden: boolean) => (
    <span aria-hidden={hidden || undefined} className="inline-flex shrink-0 items-center">
      {items.map((item) => (
        <span key={item.symbol} className="inline-flex items-center font-mono text-xs tabular-nums" title={`${item.symbol}: ${formatINR(item.value)}`}>
          <span className="px-3 font-semibold tracking-wide text-background">{item.symbol}</span>
          <span className="text-background/70">{formatINRCompact(item.value)}</span>
          <span className="pl-3 text-background/30" aria-hidden="true">
            /
          </span>
        </span>
      ))}
    </span>
  );
  return (
    <div className="tape -mx-4 border-y border-foreground/30 bg-foreground sm:-mx-6 lg:-mx-8" role="marquee" aria-label={label}>
      <div className="tape-track py-2">
        {half(false)}
        {half(true)}
      </div>
    </div>
  );
}
