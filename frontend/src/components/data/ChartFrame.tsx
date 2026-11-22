import { useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiInfo } from "./KpiInfo";

/** A chart panel with its question, a KPI reference, and an accessible
 * "view as table" alternative for every chart. */
export function ChartFrame({
  title,
  question,
  kpiId,
  table,
  children,
  className,
  footer,
  right,
}: {
  title: string;
  question?: string;
  kpiId?: string;
  table?: { columns: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn("panel reveal flex flex-col p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-sans text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
            {kpiId && <KpiInfo id={kpiId} />}
          </div>
          {question && <p className="mt-1 text-[13px] text-ink-3">{question}</p>}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {table && (
            <button
              onClick={() => setAsTable((v) => !v)}
              className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
              aria-label={asTable ? "Show as chart" : "Show as table"}
              title={asTable ? "Show as chart" : "Show as table"}
            >
              {asTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {asTable && table ? (
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>{table.columns.map((c) => <th key={c} className="label sticky top-0 bg-panel py-2 text-left">{c}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {r.map((v, j) => <td key={j} className={cn("py-1.5", j > 0 && "num")}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
      {footer && <div className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-3">{footer}</div>}
    </section>
  );
}

/** Shared recharts tooltip, in the panel style. */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string | number;
  format: (n: number) => string;
  labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1 text-ink-3">{labelFormat ? labelFormat(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="num ml-auto pl-4 font-semibold">{p.value === undefined ? "—" : format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** What each colour in a chart means. `dashed` draws a dashed line swatch. */
export function ChartLegend({ items }: { items: { label: string; color: string; shape?: "box" | "line" | "dashed" | "dot" }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          {it.shape === "line" || it.shape === "dashed" ? (
            <svg width="18" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="18" y2="4" stroke={it.color} strokeWidth="2.2" strokeDasharray={it.shape === "dashed" ? "4 3" : undefined} />
            </svg>
          ) : (
            <span className={it.shape === "dot" ? "size-2.5 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: it.color }} />
          )}
          {it.label}
        </li>
      ))}
    </ul>
  );
}
