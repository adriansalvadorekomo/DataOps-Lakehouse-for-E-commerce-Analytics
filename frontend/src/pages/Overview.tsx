import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight } from "lucide-react";
import { api, formatINR, formatPercent, type DeliveryStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { ChartSkeleton, Kpi, KpiSkeleton, PageHeader, StackError } from "@/components/PageHeader";

const STALE = 60_000;

function monthTick(date: string): string {
  return new Date(date + "T00:00:00").toLocaleString("en-IN", { month: "short" });
}

export default function Overview() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.overview, staleTime: STALE });
  const trend = useQuery({ queryKey: ["trend"], queryFn: () => api.trend(90), staleTime: STALE });
  const forecast = useQuery({ queryKey: ["forecast"], queryFn: () => api.forecast(90), staleTime: STALE });
  const pareto = useQuery({ queryKey: ["pareto"], queryFn: api.pareto, staleTime: STALE });
  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities, staleTime: STALE });
  const sellers = useQuery({ queryKey: ["sellers-att"], queryFn: () => api.sellers(20), staleTime: STALE });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: STALE });

  const o = overview.data;
  const worstCity = [...(cities.data ?? [])].sort((a, b) => b.delayed_rate - a.delayed_rate)[0];
  const worstSeller = [...(sellers.data ?? [])].sort((a, b) => b.return_rate - a.return_rate)[0];
  const electronics = (categories.data ?? []).find((c) => c.category === "Electronics");
  const catTotal = (categories.data ?? []).reduce((s, c) => s + c.revenue, 0);
  const attention = [
    o && o.stock_critical > 0
      ? { text: `${o.stock_critical.toLocaleString("en-IN")} products need restocking`, to: "/operations" }
      : null,
    worstCity
      ? { text: `${worstCity.city} delayed ${formatPercent(worstCity.delayed_rate, 0)} of completed orders`, to: "/operations" }
      : null,
    worstSeller && worstSeller.return_rate > 0
      ? { text: `${worstSeller.seller_id} returned ${formatPercent(worstSeller.return_rate, 0)} of lines`, to: "/sellers" }
      : null,
  ].filter((a): a is { text: string; to: string } => a !== null);

  const rfByDate = new Map((forecast.data?.forecasts.rf ?? []).map((f) => [f.date, f.yhat]));
  const phByDate = new Map((forecast.data?.forecasts.prophet ?? []).map((f) => [f.date, f.yhat]));
  const futureDates = [...new Set([...rfByDate.keys(), ...phByDate.keys()])].sort();
  const chartRows = [
    ...(trend.data ?? []).map((t) => ({ date: t.date, revenue: t.revenue })),
    ...futureDates.map((d) => ({
      date: d,
      revenue: null as number | null,
      statistical: rfByDate.get(d) ?? null,
      trendOutlook: phByDate.get(d) ?? null,
    })),
  ];

  if (overview.isError) {
    return (
      <div className="space-y-8">
        <PageHeader title="Today" question="How is the marketplace doing right now?" />
        <StackError />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader title="Today" question="How is the marketplace doing right now?" />

      {overview.isLoading ? (
        <KpiSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3">
          <Kpi label="Revenue" value={o ? formatINR(o.revenue, 0) : "—"} sub={o ? `${o.total_orders.toLocaleString("en-IN")} orders` : undefined} />
          <Kpi label="Average order" value={o ? formatINR(o.aov, 0) : "—"} sub={o ? `${o.avg_discount_pct.toFixed(1)}% average discount` : undefined} />
          <Kpi label="Return rate" value={o ? formatPercent(o.return_rate) : "—"} sub={o ? `${o.in_transit.toLocaleString("en-IN")} still in transit` : undefined} />
          <Kpi label="Delayed (of completed)" value={o ? formatPercent(o.delayed_rate) : "—"} sub="Late delivery, not a return" />
          <Kpi label="Needs restock" value={o ? o.stock_critical.toLocaleString("en-IN") : "—"} sub="Latest stock below 20" />
          <Kpi
            label="Top fifth of customers"
            value={pareto.data ? formatPercent(pareto.data.top20_share) : "—"}
            sub="of revenue"
          />
        </div>
      )}

      {electronics && catTotal > 0 && (
        <p className="text-[15px] text-muted-foreground">
          Electronics is {formatPercent(electronics.revenue / catTotal, 0)} of revenue — price, not order count.
        </p>
      )}

      {attention.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {attention.map((a) => (
              <Link key={a.text} to={a.to} className="flex items-center justify-between px-5 py-3.5 text-foreground no-underline transition-colors hover:bg-muted/60">
                <span className="text-[15px] font-medium">{a.text}</span>
                <ArrowUpRight size={16} className="text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-baseline justify-between gap-4">
          <CardTitle>Revenue · last 90 selling days, plus a 30-day outlook</CardTitle>
          {forecast.data?.asof && (
            <span className="font-mono text-[13px] text-muted-foreground tabular-nums">as of {forecast.data.asof}</span>
          )}
        </CardHeader>
        <CardContent className="h-64">
          {trend.isError ? (
            <StackError />
          ) : trend.data ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.8} />
                <XAxis
                  dataKey="date"
                  tickFormatter={monthTick}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  minTickGap={48}
                />
                <YAxis
                  tickFormatter={(v: number) => `₹${Math.round(v / 1e6)}M`}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  formatter={(v, name) => [
                    formatINR(Number(v)),
                    name === "revenue" ? "Revenue" : name === "statistical" ? "Statistical outlook" : "Trend outlook",
                  ]}
                  labelFormatter={(d) => String(d)}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.1} connectNulls={false} />
                <Line type="monotone" dataKey="statistical" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="trendOutlook" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartSkeleton />
          )}
        </CardContent>
      </Card>
      <p className="text-[13px] text-muted-foreground">
        Outlooks are batch projections, not live Databricks job output. Dashed: statistical outlook. Dotted: trend outlook.
      </p>

      <div className="flex flex-wrap gap-3">
        {(o ? Object.entries(o.by_status) : []).map(([status, n]) => (
          <span key={status} className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <StatusPill status={status as DeliveryStatus} />
            <span className="font-mono tabular-nums">{n.toLocaleString("en-IN")}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
