import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { date, inr } from "@/lib/format";
import { ChartFrame, ChartTooltip } from "@/components/data/ChartFrame";
import { KpiTile } from "@/components/data/KpiTile";
import { PageHeader } from "@/components/data/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

export function Forecast() {
  const scope = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["forecast"], queryFn: () => api.forecast(120) });
  const fresh = useQuery({ queryKey: ["freshness"], queryFn: api.freshness });
  useReveal(scope, [q.isSuccess]);

  const rows = useMemo(() => {
    const map = new Map<string, { date: string; actual?: number; rf?: number; prophet?: number }>();
    const at = (d: string) => map.get(d) ?? map.set(d, { date: d }).get(d)!;
    q.data?.actuals.forEach((a) => (at(a.date).actual = a.revenue));
    q.data?.forecasts.rf.forEach((f) => (at(f.date).rf = f.yhat));
    q.data?.forecasts.prophet.forEach((f) => (at(f.date).prophet = f.yhat));
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [q.data]);
  const next30 = (q.data?.forecasts.rf ?? []).reduce((s, f) => s + f.yhat, 0);
  const hasForecast = (q.data?.forecasts.rf.length ?? 0) > 0;

  return (
    <div ref={scope}>
      <PageHeader
        kicker="Planning · forecast"
        title="What revenue should we expect next?"
        question="A 30-day daily revenue outlook. Random Forest ships (3.4% MAPE on a rolling one-day-ahead test); Prophet is shown as a second opinion."
        decision="Stock and staffing plans; and whether today's pace is normal."
        asOf={q.data?.asof}
      />
      {q.isError && <ErrorState error={q.error} />}
      {fresh.data?.forecast === "stale" && (
        <div className="mb-6 rounded-xl border border-warn/40 bg-warn-wash p-4 text-[13.5px]">
          <span className="font-semibold text-warn">The forecast is {fresh.data.forecast_lag_days} days behind the books.</span>{" "}
          <span className="text-ink-2">New days arrived (an import or new orders). Retrain with <span className="code">mise run forecast</span>.</span>
        </div>
      )}
      {q.data && !hasForecast ? (
        <EmptyState title="No forecast published yet">
          Train and publish the 30-day outlook with <span className="code">mise run forecast</span>; it needs at least 60 days of history.
        </EmptyState>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <KpiTile label="Expected revenue, next 30 days" value={hasForecast ? next30 : null} format={(n) => inr(n)} tone="violet" note="Random Forest" />
            <KpiTile label="Model error (MAPE)" value={0.0338} format={(n) => `${(n * 100).toFixed(1)}%`} note="rolling one-day-ahead, 90 days" />
            <KpiTile label="Second opinion error" value={0.0396} format={(n) => `${(n * 100).toFixed(1)}%`} note="Prophet, same protocol" />
          </div>
          <ChartFrame title="Actuals and outlook" question="Last 120 days of actuals, then the 30-day forecast."
            table={{ columns: ["Date", "Actual", "Random Forest", "Prophet"], rows: rows.map((r) => [date(r.date), inr(r.actual), inr(r.rf), inr(r.prophet)]) }}>
            {q.isLoading ? <Skeleton className="h-[360px]" /> : (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={rows} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => date(d).slice(0, 6)} tickLine={false} axisLine={false} minTickGap={36} />
                  <YAxis tickFormatter={(n) => inr(n, { digits: 0 })} tickLine={false} axisLine={false} width={72} />
                  {q.data?.asof && <ReferenceLine x={q.data.asof} stroke="var(--line-strong)" label={{ value: "as of", fill: "var(--ink-3)", fontSize: 11, position: "top" }} />}
                  <Tooltip content={<ChartTooltip format={(n) => inr(n)} labelFormat={(l) => date(l)} />} />
                  <Line dataKey="actual" name="Actual" stroke="var(--ink)" strokeWidth={1.8} dot={false} />
                  <Line dataKey="rf" name="Random Forest" stroke="var(--violet)" strokeWidth={2.2} dot={false} />
                  <Line dataKey="prophet" name="Prophet" stroke="var(--violet)" strokeOpacity={0.5} strokeDasharray="5 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartFrame>
        </>
      )}
    </div>
  );
}
