import { useState } from "react";
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
import { api, formatINR, formatPercent, type DeliveryStatus, type MetricComparison } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { Metric } from "@/components/Metric";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ChartSkeleton, EmptyState, Insight, KpiSkeleton, Lineage, PageHeader, StackError } from "@/components/PageHeader";

const STALE = 60_000;
const PERIODS = ["30", "90", "365"] as const;
type Period = (typeof PERIODS)[number];

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function formatDate(date: string | null | undefined): string {
  return date ? dateFormatter.format(new Date(`${date}T00:00:00`)) : "date unavailable";
}

function monthTick(date: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${date}T00:00:00`));
}

function relativeComparison(metric: MetricComparison): string | null {
  if (metric.relative_change == null) return null;
  return `${Math.abs(metric.relative_change * 100).toFixed(1)}% versus the prior equal window`;
}

function rateComparison(metric: MetricComparison): string | null {
  if (metric.relative_change == null || metric.absolute_change == null) return null;
  return `${Math.abs(metric.absolute_change * 100).toFixed(1)} percentage points versus the prior equal window`;
}

export default function Overview() {
  const [period, setPeriod] = useState<Period>("90");
  const days = Number(period);
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.overview, staleTime: STALE });
  const performance = useQuery({ queryKey: ["performance-summary", days], queryFn: () => api.performanceSummary(days), staleTime: STALE });
  const trend = useQuery({ queryKey: ["trend", days], queryFn: () => api.trend(days), staleTime: STALE });
  const forecast = useQuery({ queryKey: ["forecast", 90], queryFn: () => api.forecast(90), staleTime: STALE, enabled: days === 90 });
  const pareto = useQuery({ queryKey: ["pareto"], queryFn: api.pareto, staleTime: STALE });
  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities, staleTime: STALE });
  const sellers = useQuery({ queryKey: ["sellers-att"], queryFn: () => api.sellers(20), staleTime: STALE });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: STALE });

  const o = overview.data;
  const summary = performance.data;
  const metrics = summary?.metrics;
  const worstCity = [...(cities.data ?? [])].sort((a, b) => b.delayed_rate - a.delayed_rate)[0];
  const worstSeller = [...(sellers.data ?? [])].sort((a, b) => b.return_rate - a.return_rate)[0];
  const electronics = (categories.data ?? []).find((c) => c.category === "Electronics");
  const catTotal = (categories.data ?? []).reduce((sum, category) => sum + category.revenue, 0);
  const attention = [
    o && o.stock_critical > 0
      ? { text: `${o.stock_critical.toLocaleString("en-IN")} products need restocking`, to: "/inventory" }
      : null,
    worstCity
      ? { text: `${worstCity.city} delayed ${formatPercent(worstCity.delayed_rate, 0)} of completed orders`, to: "/operations" }
      : null,
    worstSeller && worstSeller.return_rate > 0
      ? { text: `${worstSeller.seller_id} returned ${formatPercent(worstSeller.return_rate, 0)} of lines`, to: `/sellers/${worstSeller.seller_id}` }
      : null,
  ].filter((item): item is { text: string; to: string } => item !== null);

  const compatibleForecast = days === 90;
  const rfRows = compatibleForecast ? forecast.data?.forecasts.rf ?? [] : [];
  const prophetRows = compatibleForecast ? forecast.data?.forecasts.prophet ?? [] : [];
  const hasForecast = rfRows.length > 0 || prophetRows.length > 0;
  const rfByDate = new Map(rfRows.map((row) => [row.date, row.yhat]));
  const prophetByDate = new Map(prophetRows.map((row) => [row.date, row.yhat]));
  const futureDates = [...new Set([...rfByDate.keys(), ...prophetByDate.keys()])].sort();
  const chartRows = [
    ...(trend.data ?? []).map((row) => ({ date: row.date, revenue: row.revenue })),
    ...futureDates.map((date) => ({
      date,
      revenue: null as number | null,
      statistical: rfByDate.get(date) ?? null,
      trendOutlook: prophetByDate.get(date) ?? null,
    })),
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Latest recorded marketplace data"
        title="Marketplace overview"
        question="How did the marketplace perform in the selected selling-day window?"
        caption={summary?.as_of ? `Latest source date ${formatDate(summary.as_of)}; this is not a wall-clock live view.` : "Source date appears when the performance summary is available."}
      />

      <div className="border-y border-border bg-card/60 px-4 py-4 sm:px-5">
        <SegmentedControl label="Performance window" value={period} onChange={setPeriod} options={PERIODS} getOptionLabel={(value) => `${value} days`} />
        <p className="mt-3 text-sm text-muted-foreground">Last {days} selling days compared with the prior equal window.</p>
      </div>

      {performance.isError ? (
        <StackError message="Couldn't load the performance comparison." retry={() => performance.refetch()} />
      ) : performance.isLoading ? (
        <KpiSkeleton n={5} />
      ) : !summary || !metrics?.revenue || !metrics.orders || !metrics.aov || !metrics.return_rate || !metrics.delayed_rate ? (
        <EmptyState title="No performance summary yet" body="Measures and comparisons appear once both selling-day windows contain source data." />
      ) : (
        <section aria-labelledby="performance-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="performance-heading" className="font-serif text-xl">Performance</h2>
            <p className="text-xs text-muted-foreground">As of {formatDate(summary.as_of)}</p>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Revenue" value={metrics.revenue.current == null ? "—" : formatINR(metrics.revenue.current, 0)} scope={`Last ${days} selling days`} comparison={relativeComparison(metrics.revenue)} direction={metrics.revenue.direction} interpretation="Value paid across marketplace order lines in this window." spark={(trend.data ?? []).map((row) => row.revenue)} to="/sales" />
            <Metric label="Orders" value={metrics.orders.current == null ? "—" : metrics.orders.current.toLocaleString("en-IN")} scope={`Last ${days} selling days`} comparison={relativeComparison(metrics.orders)} direction={metrics.orders.direction} interpretation="Orders recorded in the selected selling-day window." spark={(trend.data ?? []).map((row) => row.orders)} to="/orders" />
            <Metric label="Average order" value={metrics.aov.current == null ? "—" : formatINR(metrics.aov.current, 0)} scope={`Last ${days} selling days`} comparison={relativeComparison(metrics.aov)} direction={metrics.aov.direction} interpretation="Average marketplace revenue per recorded order." to="/performance" />
            <Metric label="Return rate" value={metrics.return_rate.current == null ? "—" : formatPercent(metrics.return_rate.current)} scope={`Last ${days} selling days`} comparison={rateComparison(metrics.return_rate)} direction={metrics.return_rate.direction} interpretation={metrics.return_rate.direction === "down" ? "Lower return rate than the prior window." : metrics.return_rate.direction === "up" ? "Higher return rate than the prior window." : "Return rate is unchanged from the prior window."} tone={metrics.return_rate.direction === "up" ? "attention" : "normal"} to="/operations" />
            <Metric label="Delayed rate" value={metrics.delayed_rate.current == null ? "—" : formatPercent(metrics.delayed_rate.current)} scope={`Last ${days} selling days`} comparison={rateComparison(metrics.delayed_rate)} direction={metrics.delayed_rate.direction} interpretation={metrics.delayed_rate.direction === "down" ? "Lower delayed rate than the prior window." : metrics.delayed_rate.direction === "up" ? "Higher delayed rate than the prior window." : "Delayed rate is unchanged from the prior window."} tone={metrics.delayed_rate.direction === "up" ? "attention" : "normal"} to="/operations" />
          </div>
        </section>
      )}

      <section aria-labelledby="context-heading">
        <h2 id="context-heading" className="mb-3 font-serif text-xl">Latest marketplace context</h2>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {overview.isError ? (
            <div className="sm:col-span-2"><StackError message="Couldn't load the stock snapshot." retry={() => overview.refetch()} /></div>
          ) : overview.isLoading ? (
            <div role="status" className="text-sm text-muted-foreground">Loading the stock snapshot…</div>
          ) : o ? (
            <Metric label="Needs restock" value={o.stock_critical.toLocaleString("en-IN")} scope="Latest stock snapshot" interpretation="Products with fewer than 20 units; no period comparison." to="/inventory" />
          ) : (
            <EmptyState title="No stock context yet" body="Restock context appears when a stock snapshot is available." />
          )}
          {pareto.isError ? (
            <StackError message="Couldn't load customer concentration." retry={() => pareto.refetch()} />
          ) : pareto.isLoading ? (
            <div role="status" className="text-sm text-muted-foreground">Calculating customer concentration…</div>
          ) : pareto.data ? (
            <Metric label="Top fifth of customers" value={formatPercent(pareto.data.top20_share)} scope="All available data" interpretation="Share of revenue; no period comparison." to="/customers" />
          ) : (
            <EmptyState title="No customer concentration yet" body="Revenue share appears once customer sales are available." />
          )}
        </div>
      </section>

      {categories.isLoading ? (
        <p role="status" className="text-[15px] text-muted-foreground">Reading category mix…</p>
      ) : categories.isError ? (
        <StackError message="Couldn't load the category context." retry={() => categories.refetch()} />
      ) : (categories.data ?? []).length === 0 ? (
        <EmptyState title="No category mix yet" body="Category contribution appears once product sales are recorded." />
      ) : electronics && catTotal > 0 ? (
        <p className="text-[15px] text-muted-foreground">Category context: Electronics represents {formatPercent(electronics.revenue / catTotal, 0)} of revenue across the category totals returned.</p>
      ) : (
        <p className="text-[15px] text-muted-foreground">Category totals are available, with no Electronics sales in the response.</p>
      )}

      <section aria-labelledby="drivers-heading">
        <h2 id="drivers-heading" className="mb-3 font-serif text-xl">Why it moves</h2>
        {categories.isLoading || cities.isLoading || sellers.isLoading ? (
          <p role="status" className="text-[15px] text-muted-foreground">Reading revenue drivers…</p>
        ) : categories.isError || cities.isError || sellers.isError ? (
          <StackError message="Couldn't load revenue drivers." retry={() => { categories.refetch(); cities.refetch(); sellers.refetch(); }} />
        ) : electronics && catTotal > 0 && worstCity && worstSeller ? (
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
            <Insight
              value={`${electronics.category} ${formatPercent(electronics.revenue / catTotal, 0)}`}
              context="Largest category share of returned revenue"
              interpretation={`${electronics.category} earns ${formatINR(electronics.revenue, 0)} — revenue concentration, not order volume, drives the mix.`}
              to="/sales"
              actionLabel="View revenue drivers"
            />
            <Insight
              value={`${worstCity.city} ${formatPercent(worstCity.delayed_rate, 0)}`}
              context="Highest delayed share among metros"
              interpretation={`Fulfillment delays are heaviest in ${worstCity.city}; delays affect half of completed orders overall.`}
              to="/operations"
              actionLabel="Investigate fulfillment"
            />
            <Insight
              value={`${worstSeller.seller_id} ${formatPercent(worstSeller.return_rate, 0)}`}
              context="Highest return rate in the watched set"
              interpretation="Returns concentrate at specific sellers — open the seller to see commercial and operational context."
              to={`/sellers/${worstSeller.seller_id}`}
              actionLabel="Open seller"
            />
          </div>
        ) : (
          <EmptyState title="No drivers yet" body="Revenue drivers appear once category, metro and seller signals are available." />
        )}
      </section>

      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="mb-3 font-serif text-xl">What needs attention</h2>
        <Card>
          <CardContent className="p-0">
            {cities.isLoading || sellers.isLoading ? <p role="status" className="px-5 py-4 text-[15px] text-muted-foreground">Checking city and seller signals…</p> : null}
            {cities.isError && <div className="px-5 py-4"><StackError message="Couldn't load city signals." retry={() => cities.refetch()} /></div>}
            {sellers.isError && <div className="px-5 py-4"><StackError message="Couldn't load seller signals." retry={() => sellers.refetch()} /></div>}
            {!cities.isLoading && !cities.isError && (cities.data ?? []).length === 0 && <EmptyState title="No city signals yet" body="Metro delivery signals appear after completed orders are recorded." />}
            {!sellers.isLoading && !sellers.isError && (sellers.data ?? []).length === 0 && <EmptyState title="No seller signals yet" body="Seller return signals appear after order lines are completed." />}
            {attention.length > 0 && (
              <ol className="divide-y divide-border">
                {attention.map((item, index) => (
                  <li key={item.text}>
                    <Link to={item.to} className="flex min-h-14 items-center gap-4 px-5 py-4 text-foreground no-underline transition-colors hover:bg-muted/60" aria-label={`Attention ${index + 1}: ${item.text}`}>
                      <span className="queue-numeral" aria-hidden="true">{index + 1}</span>
                      <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{item.text}</span>
                      <ArrowUpRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {!overview.isLoading && !cities.isLoading && !sellers.isLoading && !overview.isError && !cities.isError && !sellers.isError && attention.length === 0 && <EmptyState title="No attention signals" body="Current stock, metro delays and seller returns do not raise an item here." />}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Revenue · last {days} selling days{hasForecast ? ", plus batch outlook" : ""}</CardTitle>
          {hasForecast && forecast.data?.asof && <span className="evidence text-[13px] text-muted-foreground">Outlook as of {formatDate(forecast.data.asof)}</span>}
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
                <YAxis tickFormatter={(value: number) => `₹${Math.round(value / 1e6)}M`} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip formatter={(value, name) => [formatINR(Number(value)), name === "revenue" ? "Revenue" : name === "statistical" ? "Statistical outlook" : "Trend outlook"]} labelFormatter={(date) => formatDate(String(date))} />
                <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.1} connectNulls={false} />
                {hasForecast && <Line type="monotone" dataKey="statistical" stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="7 4" dot={false} connectNulls />}
                {hasForecast && <Line type="monotone" dataKey="trendOutlook" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls />}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      {compatibleForecast ? (
        forecast.isLoading ? (
          <p role="status" className="text-[13px] text-muted-foreground">Loading the compatible batch outlook…</p>
        ) : forecast.isError ? (
          <StackError message="Couldn't load the batch outlook. The historical trend remains available." retry={() => forecast.refetch()} />
        ) : hasForecast ? (
          <p className="text-[13px] text-muted-foreground">Outlooks are batch projections based on a 90-day trailing window as of {formatDate(forecast.data?.asof)}, not live output. Dashed: Statistical outlook. Dotted: Trend outlook.</p>
        ) : (
          <EmptyState title="No forecast rows" body="The historical trend is available, but the compatible 90-day batch returned no outlook rows." />
        )
      ) : (
        <p className="text-[13px] text-muted-foreground">The batch outlook is shown only for its compatible 90-day trailing window.</p>
      )}

      <section aria-labelledby="status-heading">
        <h2 id="status-heading" className="mb-3 font-serif text-xl">Order status mix</h2>
        {overview.isError ? (
          <StackError message="Couldn't load order statuses." retry={() => overview.refetch()} />
        ) : overview.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Loading order statuses…</p>
        ) : !o || Object.keys(o.by_status).length === 0 ? (
          <EmptyState title="No order statuses yet" body="Status mix appears once orders are available." />
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {Object.entries(o.by_status).map(([status, count]) => (
              <div key={status} className="flex min-h-11 items-center gap-2">
                <StatusPill status={status as DeliveryStatus} />
                <span className="text-[13px] tabular-nums text-muted-foreground">{count.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Lineage metric="marketplace revenue" endpoint="GET /stats/performance-summary" gold="fact_sales" />
    </div>
  );
}
