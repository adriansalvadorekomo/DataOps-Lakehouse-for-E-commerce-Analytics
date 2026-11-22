import { useLocation } from "react-router-dom";
import { PERIODS, usePeriod } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const LABEL: Record<number, string> = { 7: "7D", 30: "30D", 90: "90D", 365: "1Y" };
const PERIOD_PAGES = ["/", "/revenue", "/sellers", "/fulfillment", "/inventory"];

/** The analysis window. Every window ends on the latest day with data (as-of). */
export function PeriodSwitch() {
  const [period, setPeriod] = usePeriod();
  const { pathname } = useLocation();
  if (!PERIOD_PAGES.includes(pathname)) return null;
  return (
    <div role="radiogroup" aria-label="Analysis window" className="flex items-center rounded-lg border border-line bg-panel p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p}
          role="radio"
          aria-checked={p === period}
          onClick={() => setPeriod(p)}
          className={cn(
            "num rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
            p === period ? "bg-ink text-canvas" : "text-ink-3 hover:text-ink",
          )}
        >
          {LABEL[p]}
        </button>
      ))}
    </div>
  );
}
