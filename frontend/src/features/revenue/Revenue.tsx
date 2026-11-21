import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { date, delta, inr, int, month, pct, pts } from "@/lib/format";
import { usePeriod } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ChartFrame, ChartTooltip } from "@/components/data/ChartFrame";
import { DotBar } from "@/components/data/DotMatrix";
import { KpiTile, type Trend } from "@/components/data/KpiTile";
import { PageHeader, SectionTitle } from "@/components/data/PageHeader";
import { ErrorState, Skeleton } from "@/components/data/States";
import { Tag } from "@/components/data/Badges";
import { useReveal } from "@/components/data/useReveal";

const axisInr = (n: number) => inr(n, { digits: 0 });

export function Revenue() {
  const [days] = usePeriod();
  const scope = useRef<HTMLDivElement>(null);
  const perf = useQuery({ queryKey: ["performance", days], queryFn: () => api.performance(days) });
  const daily = useQuery({ queryKey: ["daily", days], queryFn: () => api.dailyRevenue(days) });
  const monthly = useQuery({ queryKey: ["monthly"], queryFn: () => api.monthlyRevenue(24) });
  const cats = useQuery({ queryKey: ["category-comparison", days], queryFn: () => api.categoryComparison(days) });
  const margin = useQuery({ queryKey: ["margin", days], queryFn: () => api.margin(days) });
  const cities = useQuery({ queryKey: ["cities", days], queryFn: () => api.cities(days) });
  useReveal(scope, [perf.isSuccess, daily.isSuccess]);

  const m = perf.data?.metrics;
  const trend = (higherIsGood: boolean, dir?: string): Trend =>
    !dir || dir === "flat" ? "neutral" : (dir === "up") === higherIsGood ? "good" : "bad";

  // Overlay the previous window on the current one, day by day.
  const overlay = useMemo(() => {
    const rows = daily.data?.days ?? [];
    const cur = rows.filter((r) => r.period === "current");
    const prev = rows.filter((r) => r.period === "previous");
    return cur.map((r, i) => ({ date: r.date, current: r.revenue, previous: prev[i]?.revenue ?? null }));
  }, [daily.data]);

  return (
    <div ref={scope}>
      <PageHeader
        kicker="Commercial · revenue"
        title="Are we on pace, and what drives it?"
        question={`Revenue in the last ${days} days against the ${days} days before, the mix behind it, and what discounts cost.`}
        decision="Where to push (categories, cities) and which discount levels to cap."
        asOf={perf.data?.as_of}
      />

      {perf.isError && <ErrorState error={perf.error} />}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Revenue" kpiId="K1" value={m?.revenue.current} format={(n) => inr(n)}
          delta={m && { text: delta(m.revenue.relative_change), direction: m.revenue.direction, trend: trend(true, m.revenue.direction), vs: `vs ${inr(m.revenue.previous)}` }} />
        <KpiTile label="Orders" value={m?.orders.current} format={int}
          delta={m && { text: delta(m.orders.relative_change), direction: m.orders.direction, trend: trend(true, m.orders.direction) }} />
        <KpiTile label="Average order value" kpiId="K2" value={m?.aov.current} format={(n) => inr(n, { compact: false })}
          delta={m && { text: delta(m.aov.relative_change), direction: m.aov.direction, trend: trend(true, m.aov.direction) }} />
        <KpiTile label="Estimated margin" kpiId="K10" value={margin.data?.est_margin_pct} format={(n) => pct(n)}
          note={margin.data ? `${inr(margin.data.est_margin)} on ${inr(margin.data.revenue)}` : undefined} />
      </div>

      <div className="mb-8 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartFrame
          title={`Daily revenue · last ${days} days`}
          question="Each day against the same day of the previous window."
          kpiId="K1"
          table={{ columns: ["Date", "This window", "Previous window"], rows: overlay.map((r) => [date(r.date), inr(r.current), inr(r.previous)]) }}
        >
          {daily.isLoading ? <Skeleton className="h-[280px]" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={overlay} margin={{ left: 8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="cur" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--ink)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--ink)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => date(d).slice(0, 6)} tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis tickFormatter={axisInr} tickLine={false} axisLine={false} width={72} />
                <Tooltip content={<ChartTooltip format={(n) => inr(n)} labelFormat={(l) => date(l)} />} />
                <Area type="monotone" dataKey="current" name="This window" stroke="var(--ink)" strokeWidth={2} fill="url(#cur)" />
                <Area type="monotone" dataKey="previous" name="Previous window" stroke="var(--ink-3)" strokeDasharray="4 4" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <ChartFrame
          title="Monthly revenue · 24 months"
          question="The long trend the window sits in."
          kpiId="K5"
          table={{ columns: ["Month", "Revenue", "Orders", "AOV"], rows: (monthly.data ?? []).map((r) => [month(r.month), inr(r.revenue), int(r.orders), inr(r.aov, { compact: false })]) }}
        >
          {monthly.isLoading ? <Skeleton className="h-[280px]" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly.data} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickFormatter={month} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={axisInr} tickLine={false} axisLine={false} width={72} />
                <Tooltip content={<ChartTooltip format={(n) => inr(n)} labelFormat={month} />} />
                <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]}>
                  {(monthly.data ?? []).map((_, i, all) => (
                    <Cell key={i} fill={i === all.length - 1 ? "var(--signal)" : "var(--ink-2)"} fillOpacity={i === all.length - 1 ? 1 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>

      <SectionTitle title="What drives the window" note="Category and city mix, current window against the previous one." />
      <div className="mb-8 grid gap-4 xl:grid-cols-2">
        <section className="panel reveal p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-sans text-[15px] font-semibold">Category momentum</h3>
            <Tag>K5</Tag>
          </div>
          {cats.isLoading ? <Skeleton className="h-[220px]" /> : (
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-line">
                <th className="label py-2 text-left">Category</th><th className="label py-2 text-left">Share</th>
                <th className="label py-2 text-right">Revenue</th><th className="label py-2 text-right">Change</th>
              </tr></thead>
              <tbody>
                {cats.data?.categories.map((c) => (
                  <tr key={c.category} className="border-b border-line/70 last:border-0">
                    <td className="py-3 font-medium">{c.category}</td>
                    <td className="py-3"><div className="flex items-center gap-3"><DotBar value={c.share} dots={20} /><span className="num text-ink-3">{pct(c.share)}</span></div></td>
                    <td className="num py-3 text-right">{inr(c.current)}</td>
                    <td className={cn("num py-3 text-right font-semibold", (c.change ?? 0) < -0.05 ? "text-signal-ink" : (c.change ?? 0) > 0.05 ? "text-good" : "text-ink-3")}>{delta(c.change)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel reveal p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-sans text-[15px] font-semibold">Cities</h3>
            <Tag>K5 · K4 · K3</Tag>
          </div>
          {cities.isLoading ? <Skeleton className="h-[220px]" /> : (
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-line">
                <th className="label py-2 text-left">City</th><th className="label py-2 text-right">Revenue</th>
                <th className="label py-2 text-right">Orders</th><th className="label py-2 text-right">Late</th><th className="label py-2 text-right">Returns</th>
              </tr></thead>
              <tbody>
                {cities.data?.map((c) => (
                  <tr key={c.city} className="border-b border-line/70 last:border-0">
                    <td className="py-3 font-medium">{c.city}</td>
                    <td className="num py-3 text-right">{inr(c.revenue)}</td>
                    <td className="num py-3 text-right">{int(c.orders)}</td>
                    <td className="num py-3 text-right">{pct(c.delayed_rate)}</td>
                    <td className="num py-3 text-right">{pct(c.return_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[12.5px] text-ink-3">Cities are near-identical: the source dataset is synthetic and spreads orders evenly. The view still works on real data.</p>
        </section>
      </div>

      <SectionTitle
        id="margin"
        title="What discounts cost"
        note={margin.data ? `Estimated: ${margin.data.assumption}. Above a ${margin.data.break_even_discount_pct}% discount, a sale is below estimated cost.` : undefined}
        right={<Tag tone="warn">ESTIMATED · K10</Tag>}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Estimated margin by discount band"
          question="Which discount levels buy volume at a loss?"
          kpiId="K6"
          table={{ columns: ["Band", "Revenue", "Est. margin", "Margin %"], rows: (margin.data?.by_discount_band ?? []).map((b) => [`${b.band}%`, inr(b.revenue), inr(b.est_margin), pct(b.est_margin_pct)]) }}
        >
          {margin.isLoading ? <Skeleton className="h-[260px]" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={margin.data?.by_discount_band} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="band" tickFormatter={(b) => `${b}%`} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={axisInr} tickLine={false} axisLine={false} width={72} />
                <ReferenceLine y={0} stroke="var(--line-strong)" />
                <Tooltip content={<ChartTooltip format={(n) => inr(n)} labelFormat={(l) => `${l}% discount`} />} />
                <Bar dataKey="est_margin" name="Estimated margin" radius={[3, 3, 3, 3]}>
                  {(margin.data?.by_discount_band ?? []).map((b) => (
                    <Cell key={b.band} fill={b.est_margin < 0 ? "var(--signal)" : "var(--ink-2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
        <section className="panel reveal p-5">
          <h3 className="mb-4 font-sans text-[15px] font-semibold">Estimated margin by category</h3>
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line">
              <th className="label py-2 text-left">Category</th><th className="label py-2 text-right">Revenue</th>
              <th className="label py-2 text-right">Est. margin</th><th className="label py-2 text-right">Margin %</th>
            </tr></thead>
            <tbody>
              {margin.data?.by_category.map((c) => (
                <tr key={c.category} className="border-b border-line/70 last:border-0">
                  <td className="py-3 font-medium">{c.category}</td>
                  <td className="num py-3 text-right">{inr(c.revenue)}</td>
                  <td className={cn("num py-3 text-right", c.est_margin < 0 && "text-signal-ink")}>{inr(c.est_margin)}</td>
                  <td className="num py-3 text-right">{pct(c.est_margin_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {m && (
            <p className="mt-4 text-[12.5px] text-ink-3">
              Late deliveries moved {pts(m.delayed_rate.current, m.delayed_rate.previous)} and returns {pts(m.return_rate.current, m.return_rate.previous)} over the same window; returns refund the full price, so they cut margin directly.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
