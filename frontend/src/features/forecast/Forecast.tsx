import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { date, delta, inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountUp, DeltaBadge } from "@/components/data/KpiTile";
import { PageHeader } from "@/components/data/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

/** How far off the main forecast usually is, day to day (checked on the last 90 days). */
const TYPICAL_MISS = 0.0338;
/** The shaded "likely range": twice the typical miss either side of the forecast. */
const RANGE = TYPICAL_MISS * 2;

const RANGES = [
  { id: 30, label: "1M" },
  { id: 90, label: "3M" },
  { id: 120, label: "All" },
] as const;

interface Point {
  date: string;
  actual?: number;
  avg?: number;
  expected?: number;
  second?: number;
  band?: [number, number];
}

function shortDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** The live dot at "today": solid core + a soft pulsing halo (the brand's record in transit). */
function LiveDot(props: { cx?: number; cy?: number }) {
  const { cx = 0, cy = 0 } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill="var(--signal)" opacity={0.18} className="animate-pulse-dot" style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <circle cx={cx} cy={cy} r={5} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2} />
    </g>
  );
}

function EndLabel(props: { cx?: number; cy?: number; value: string }) {
  const { cx = 0, cy = 0, value } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill="var(--violet)" stroke="var(--panel)" strokeWidth={2} />
      <foreignObject x={cx - 118} y={cy - 38} width={112} height={26}>
        <div className="num w-fit rounded-md bg-violet px-2 py-0.5 text-[11.5px] font-semibold text-white">{value}/day</div>
      </foreignObject>
    </g>
  );
}

export function Forecast() {
  const scope = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<number>(90);
  const [showSecond, setShowSecond] = useState(false);
  const [hover, setHover] = useState<Point | null>(null);
  const q = useQuery({ queryKey: ["forecast"], queryFn: () => api.forecast(120) });
  const fresh = useQuery({ queryKey: ["freshness"], queryFn: api.freshness });
  useReveal(scope, [q.isSuccess]);

  const { points, asof, next30, last30, second30, lastActual, endPoint } = useMemo(() => {
    const d = q.data;
    if (!d) return { points: [] as Point[], asof: null, next30: 0, last30: 0, second30: 0, lastActual: null as Point | null, endPoint: null as Point | null };
    const actuals = d.actuals.slice(-range);
    const allActuals = d.actuals;
    const avgAt = (i: number) => {
      const win = allActuals.slice(Math.max(0, i - 6), i + 1);
      return win.reduce((s, a) => s + a.revenue, 0) / win.length;
    };
    const offset = allActuals.length - actuals.length;
    const pts: Point[] = actuals.map((a, i) => ({ date: a.date, actual: a.revenue, avg: avgAt(offset + i) }));
    const second = new Map(d.forecasts.prophet.map((f) => [f.date, f.yhat]));
    const last = pts.at(-1);
    if (last) {
      // Join the forecast to the last actual so the lines meet at "today".
      last.expected = last.avg;
      last.band = [last.avg!, last.avg!];
      last.second = last.avg;
    }
    for (const f of d.forecasts.rf) {
      pts.push({ date: f.date, expected: f.yhat, second: second.get(f.date), band: [f.yhat * (1 - RANGE), f.yhat * (1 + RANGE)] });
    }
    const n = d.forecasts.rf.length;
    return {
      points: pts,
      asof: d.asof,
      next30: d.forecasts.rf.reduce((s, f) => s + f.yhat, 0),
      second30: d.forecasts.prophet.reduce((s, f) => s + f.yhat, 0),
      last30: allActuals.slice(-n).reduce((s, a) => s + a.revenue, 0),
      lastActual: last ?? null,
      endPoint: pts.at(-1) ?? null,
    };
  }, [q.data, range]);

  const hasForecast = (q.data?.forecasts.rf.length ?? 0) > 0;
  const change = last30 ? (next30 - last30) / last30 : null;
  const values = points.flatMap((p) => [p.actual, p.avg, p.expected, ...(p.band ?? []), showSecond ? p.second : undefined]).filter((v): v is number => typeof v === "number");
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = (hi - lo) * 0.08 || hi * 0.05;
  const hovered = hover && (hover.actual !== undefined || hover.expected !== undefined) ? hover : null;
  const hoverIsForecast = hovered?.actual === undefined;

  return (
    <div ref={scope}>
      <PageHeader
        kicker="Planning · forecast"
        title="What revenue should we expect next?"
        question="A day-by-day revenue outlook for the next 30 days, with a second, independent forecast to compare against."
        decision="Stock and staffing plans — and whether today's pace is normal."
        asOf={asof}
      />
      {q.isError && <ErrorState error={q.error} />}
      {fresh.data?.forecast === "stale" && (
        <div className="mb-6 rounded-xl border border-warn/40 bg-warn-wash p-4 text-[13.5px]">
          <span className="font-semibold text-warn">The forecast is {fresh.data.forecast_lag_days} days behind the latest sales.</span>{" "}
          <span className="text-ink-2">New days have arrived since it was last refreshed; ask your data team to refresh it.</span>
        </div>
      )}
      {q.data && !hasForecast ? (
        <EmptyState title="No forecast published yet">The outlook appears here as soon as the forecast is refreshed. It needs at least two months of sales.</EmptyState>
      ) : (
        <>
          <section className="panel reveal overflow-hidden p-6 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-h-[104px]">
                <div className="text-[13.5px] font-medium text-ink-2">
                  {hovered ? (
                    <>{shortDate(hovered.date)} · {hoverIsForecast ? <span className="text-violet">expected</span> : "actual"}</>
                  ) : (
                    <>Expected revenue · next 30 days</>
                  )}
                </div>
                <div className={cn("num mt-1 text-[46px] font-semibold leading-none tracking-[-0.03em]", (hovered ? hoverIsForecast : true) && "text-violet")}>
                  {hovered ? inr((hoverIsForecast ? hovered.expected : hovered.actual) ?? 0)
                    : q.data ? <CountUp value={next30} format={(n) => inr(n)} /> : "—"}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                  {hovered ? (
                    hoverIsForecast
                      ? <span>Likely between {inr(hovered.band?.[0] ?? 0)} and {inr(hovered.band?.[1] ?? 0)}</span>
                      : <span>7-day average {inr(hovered.avg ?? 0)}</span>
                  ) : change !== null && (
                    <>
                      <DeltaBadge text={delta(change)} direction={change > 0.0005 ? "up" : change < -0.0005 ? "down" : "flat"} trend={change >= 0 ? "good" : "bad"} />
                      <span>vs the last 30 days ({inr(last30)})</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div role="radiogroup" aria-label="Time range" className="flex rounded-lg bg-panel-2 p-0.5">
                  {RANGES.map((r) => (
                    <button key={r.id} role="radio" aria-checked={range === r.id} onClick={() => setRange(r.id)}
                      className={cn("num rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors",
                        range === r.id ? "bg-panel text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowSecond((v) => !v)} aria-pressed={showSecond}
                  className={cn("rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                    showSecond ? "border-violet bg-violet-wash text-violet" : "border-line text-ink-3 hover:text-ink")}>
                  {showSecond ? "Hide" : "Show"} second opinion
                </button>
              </div>
            </div>

            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2" aria-label="Legend">
              <li className="flex items-center gap-2"><span className="h-[3px] w-4 rounded-full bg-ink" />Actual (7-day average)</li>
              <li className="flex items-center gap-2"><span className="h-[2px] w-4 rounded-full bg-ink-3 opacity-60" />Actual, each day</li>
              <li className="flex items-center gap-2"><span className="h-[3px] w-4 rounded-full bg-violet" />Expected</li>
              <li className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-violet opacity-20" />Likely range</li>
              {showSecond && <li className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-violet" />Second opinion</li>}
            </ul>

            {q.isLoading ? <Skeleton className="mt-4 h-[380px]" /> : (
              <div className="-mx-2 mt-2 h-[380px]" onMouseLeave={() => setHover(null)}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={points}
                    margin={{ top: 28, right: 8, bottom: 0, left: 8 }}
                    onMouseMove={(s) => {
                      const i = Number(s?.activeTooltipIndex);
                      setHover(Number.isInteger(i) && points[i] ? points[i] : null);
                    }}
                  >
                    <defs>
                      <linearGradient id="fc-actual" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--ink)" stopOpacity={0.14} />
                        <stop offset="100%" stopColor="var(--ink)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="fc-expected" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--violet)" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="var(--violet)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="2 6" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={48} tickMargin={10} />
                    <YAxis orientation="right" domain={[Math.max(0, lo - pad), hi + pad]} tickFormatter={(n) => inr(n, { digits: 1 })}
                      tickLine={false} axisLine={false} width={64} tickCount={4} />
                    <Tooltip cursor={{ stroke: "var(--ink-3)", strokeWidth: 1, strokeDasharray: "3 3" }} content={() => null} />
                    {asof && (
                      <ReferenceLine x={asof} stroke="var(--line-strong)" strokeDasharray="4 4"
                        label={{ value: `Today · ${shortDate(asof)}`, position: "top", fill: "var(--ink-3)", fontSize: 11 }} />
                    )}
                    <Area type="monotone" dataKey="band" stroke="none" fill="var(--violet)" fillOpacity={0.13} isAnimationActive={false} />
                    <Line type="monotone" dataKey="actual" stroke="var(--ink-3)" strokeOpacity={0.3} strokeWidth={1} dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="avg" stroke="var(--ink)" strokeWidth={2.6} fill="url(#fc-actual)" dot={false} animationDuration={900} />
                    <Area type="monotone" dataKey="expected" stroke="var(--violet)" strokeWidth={2.6} fill="url(#fc-expected)" dot={false} animationDuration={900} animationBegin={500} />
                    {showSecond && <Line type="monotone" dataKey="second" stroke="var(--violet)" strokeOpacity={0.6} strokeWidth={1.6} strokeDasharray="5 4" dot={false} />}
                    {lastActual?.avg !== undefined && <ReferenceDot x={lastActual.date} y={lastActual.avg} shape={<LiveDot />} ifOverflow="visible" />}
                    {endPoint?.expected !== undefined && (
                      <ReferenceDot x={endPoint.date} y={endPoint.expected} ifOverflow="visible"
                        shape={<EndLabel value={inr(endPoint.expected, { digits: 2 })} />} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="panel reveal p-5">
              <div className="text-[13px] font-medium text-ink-2">How reliable is it?</div>
              <div className="num mt-2 text-[24px] font-semibold">Within {(TYPICAL_MISS * 100).toFixed(1)}%</div>
              <p className="mt-1 text-[12.5px] text-ink-3">of actual daily revenue, on a typical day, when checked against the last 90 days.</p>
            </div>
            <div className="panel reveal p-5">
              <div className="text-[13px] font-medium text-ink-2">Second opinion</div>
              <div className="num mt-2 text-[24px] font-semibold">{hasForecast ? inr(second30) : "—"}</div>
              <p className="mt-1 text-[12.5px] text-ink-3">
                {hasForecast && next30 ? `An independent forecast, ${Math.abs((second30 - next30) / next30 * 100).toFixed(1)}% ${second30 < next30 ? "lower" : "higher"}. When both agree, plan with more confidence.` : "An independent forecast for comparison."}
              </p>
            </div>
            <div className="panel reveal p-5">
              <div className="text-[13px] font-medium text-ink-2">Last 30 days, actual</div>
              <div className="num mt-2 text-[24px] font-semibold">{last30 ? inr(last30) : "—"}</div>
              <p className="mt-1 text-[12.5px] text-ink-3">Up to {date(asof)}: the base the outlook is compared with.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
