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
import { ChartSkeleton, EmptyState, Kpi, KpiSkeleton, PageHeader, StackError } from "@/components/PageHeader";

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

  const rfRows = forecast.data?.forecasts.rf ?? [];
  const prophetRows = forecast.data?.forecasts.prophet ?? [];
  const hasForecast = rfRows.length > 0 || prophetRows.length > 0;
  const rfByDate = new Map(rfRows.map((f) => [f.date, f.yhat]));
  const phByDate = new Map(prophetRows.map((f) => [f.date, f.yhat]));
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
        <StackError retry={() => overview.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader title="Today" question="How is the marketplace doing right now?" />

      {overview.isLoading ? (
        <KpiSkeleton />
      ) : !o ? (
        <EmptyState title="No marketplace summary yet" body="Revenue and operating measures appear once orders are on the live books." />
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-3">
          <Kpi label="Revenue" value={formatINR(o.revenue, 0)} sub={`${o.total_orders.toLocaleString("en-IN")} orders`} />
          <Kpi label="Average order" value={formatINR(o.aov, 0)} sub={`${o.avg_discount_pct.toFixed(1)}% average discount`} />
          <Kpi label="Return rate" value={formatPercent(o.return_rate)} sub={`${o.in_transit.toLocaleString("en-IN")} still in transit`} />
          <Kpi label="Delayed (of completed)" value={formatPercent(o.delayed_rate)} sub="Late delivery, not a return" />
          <Kpi label="Needs restock" value={o.stock_critical.toLocaleString("en-IN")} sub="Latest stock below 20" />
          <div>
            <p className="text-[13px] text-muted-foreground">Top fifth of customers</p>
            {pareto.isLoading ? (
              <p role="status" className="mt-1 text-[15px] text-muted-foreground">Calculating revenue share…</p>
            ) : pareto.isError ? (
              <StackError message="Couldn't load the customer revenue share." retry={() => pareto.refetch()} />
            ) : pareto.data ? (
              <>
                <p className="mt-1 font-mono text-[1.65rem] font-medium tracking-tight tabular-nums">{formatPercent(pareto.data.top20_share)}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">of revenue</p>
              </>
            ) : (
              <p className="mt-1 text-[15px] text-muted-foreground">No customer revenue share yet.</p>
            )}
          </div>
        </div>
      )}

      {categories.isLoading ? (
        <p role="status" className="text-[15px] text-muted-foreground">Reading category mix…</p>
      ) : categories.isError ? (
        <StackError message="Couldn't load the category insight." retry={() => categories.refetch()} />
      ) : (categories.data ?? []).length === 0 ? (
        <EmptyState title="No category mix yet" body="Category contribution appears once product sales are recorded." />
      ) : electronics && catTotal > 0 ? (
        <p className="text-[15px] text-muted-foreground">
          Electronics is {formatPercent(electronics.revenue / catTotal, 0)} of revenue, price rather than order count.
        </p>
      ) : (
        <p className="text-[15px] text-muted-foreground">Category revenue is available, but no Electronics sales are present.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What needs attention</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cities.isLoading || sellers.isLoading ? (
            <p role="status" className="px-5 py-4 text-[15px] text-muted-foreground">Checking city and seller signals…</p>
          ) : null}
          {cities.isError && <div className="px-5 py-4"><StackError message="Couldn't load city signals." retry={() => cities.refetch()} /></div>}
          {!cities.isLoading && !cities.isError && (cities.data ?? []).length === 0 && (
            <EmptyState title="No city signals yet" body="Metro delivery signals appear after completed orders are recorded." />
          )}
          {sellers.isError && <div className="px-5 py-4"><StackError message="Couldn't load seller signals." retry={() => sellers.refetch()} /></div>}
          {!sellers.isLoading && !sellers.isError && (sellers.data ?? []).length === 0 && (
            <EmptyState title="No seller signals yet" body="Seller return signals appear after order lines are completed." />
          )}
          {attention.length > 0 && (
            <div className="divide-y divide-border">
              {attention.map((a) => (
                <Link key={a.text} to={a.to} className="flex items-center justify-between px-5 py-3.5 text-foreground no-underline transition-colors hover:bg-muted/60">
                  <span className="text-[15px] font-medium">{a.text}</span>
                  <ArrowUpRight size={16} className="text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
          {!cities.isLoading && !sellers.isLoading && !cities.isError && !sellers.isError && attention.length === 0 && (cities.data ?? []).length > 0 && (sellers.data ?? []).length > 0 && (
            <EmptyState title="No attention signals" body="Current stock, metro delays and seller returns do not raise an item here." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-baseline justify-between gap-4">
          <CardTitle>Revenue · last 90 selling days{hasForecast ? ", plus a 30-day outlook" : ""}</CardTitle>
          {hasForecast && forecast.data?.asof && (
            <span className="font-mono text-[13px] text-muted-foreground tabular-nums">as of {forecast.data.asof}</span>
          )}
        </CardHeader>
        <CardContent className="h-64">
          {trend.isError ? (
            <StackError message="Couldn't load the revenue trend." retry={() => trend.refetch()} />
          ) : trend.isLoading ? (
            <ChartSkeleton />
          ) : (trend.data ?? []).length === 0 ? (
            <EmptyState title="No revenue trend yet" body="Daily revenue appears here once selling days are recorded." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.8} />
                <XAxis dataKey="date" tickFormatter={monthTick} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} minTickGap={48} />
                <YAxis tickFormatter={(v: number) => `₹${Math.round(v / 1e6)}M`} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip formatter={(v, name) => [formatINR(Number(v)), name === "revenue" ? "Revenue" : name === "statistical" ? "Statistical outlook" : "Trend outlook"]} labelFormatter={(d) => String(d)} />
                <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.1} connectNulls={false} />
                {hasForecast && <Line type="monotone" dataKey="statistical" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />}
                {hasForecast && <Line type="monotone" dataKey="trendOutlook" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls />}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      {forecast.isLoading ? (
        <p role="status" className="text-[13px] text-muted-foreground">Loading the batch outlook…</p>
      ) : forecast.isError ? (
        <StackError message="Couldn't load the batch outlook. The historical trend remains available." retry={() => forecast.refetch()} />
      ) : hasForecast ? (
        <p className="text-[13px] text-muted-foreground">
          Outlooks are batch projections as of {forecast.data?.asof ?? "the latest available batch"}, not live Databricks job output. Dashed: Statistical outlook. Dotted: Trend outlook.
        </p>
      ) : (
        <EmptyState title="No forecast rows" body="The historical trend is available, but this batch returned no Statistical outlook or Trend outlook rows." />
      )}

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
