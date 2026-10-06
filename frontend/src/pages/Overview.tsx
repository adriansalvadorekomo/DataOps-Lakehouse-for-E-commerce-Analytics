import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { api, formatINR, formatINRCompact, formatPercent, type DeliveryStatus, type MetricComparison } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { Metric } from "@/components/Metric";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TickerTape } from "@/components/TickerTape";
import { ChartSkeleton, EmptyState, KpiSkeleton, Lineage, PageHeader, StackError } from "@/components/PageHeader";

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
  const thinStock = useQuery({ queryKey: ["context-stock"], queryFn: () => api.stockCritical(6), staleTime: STALE });

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

  const tapeItems = [
    ...[...(categories.data ?? [])].sort((a, b) => b.revenue - a.revenue).map((c) => ({ symbol: c.category.toUpperCase(), value: c.revenue })),
    ...[...(cities.data ?? [])].sort((a, b) => b.revenue - a.revenue).map((c) => ({ symbol: c.city.toUpperCase(), value: c.revenue })),
    ...[...(sellers.data ?? [])].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((s) => ({ symbol: s.seller_id, value: s.revenue })),
  ];

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
    <div className="space-y-6">
      {tapeItems.length > 0 && <TickerTape items={tapeItems} label="Tracked revenue levels by category, metro and top seller" />}
      <PageHeader
        eyebrow="Latest recorded marketplace data"
        title="Marketplace overview"
        question="How did the marketplace perform in the selected selling-day window?"
        caption={summary?.as_of ? `Latest order on record ${formatDate(summary.as_of)}; figures reflect recorded orders, not live activity.` : "Source date appears when the performance summary is available."}
      />

      <div className="panel px-4 py-3.5">
        <SegmentedControl label="Performance window" value={period} onChange={setPeriod} options={PERIODS} getOptionLabel={(value) => `${value} days`} />
        <p className="mt-2 text-sm text-muted-foreground">Last {days} selling days compared with the prior equal window.</p>
      </div>

      {o && summary?.as_of && (
        <div className="panel flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 font-mono text-xs tabular-nums" role="status" aria-label="Market status">
          <span className="inline-flex items-center gap-1.5 font-semibold text-success">
            <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden="true" />
            BOOKS LIVE
          </span>
          <span className="text-muted-foreground">AS OF <span className="font-semibold text-foreground">{formatDate(summary.as_of)}</span></span>
          <span className="text-muted-foreground">ORDERS <span className="font-semibold text-foreground">{o.total_orders.toLocaleString("en-IN")}</span></span>
          <span className="text-muted-foreground">TRACKED <span className="font-semibold text-foreground">{formatINRCompact(o.revenue)}</span></span>
        </div>
      )}

      {performance.isError ? (
        <StackError message="Couldn't load the performance comparison." retry={() => performance.refetch()} />
      ) : performance.isLoading ? (
        <KpiSkeleton n={5} />
      ) : !summary || !metrics?.revenue || !metrics.orders || !metrics.aov || !metrics.return_rate || !metrics.delayed_rate ? (
        <EmptyState title="No performance summary yet" body="Measures and comparisons appear once both selling-day windows contain source data." />
      ) : (
        <section aria-labelledby="performance-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="performance-heading" className="section-title">Performance</h2>
            <p className="text-xs text-muted-foreground">As of {formatDate(summary.as_of)}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Revenue" value={metrics.revenue.current == null ? "—" : formatINR(metrics.revenue.current, 0)} scope={`Last ${days} selling days`} comparison={relativeComparison(metrics.revenue)} direction={metrics.revenue.direction} polarity="good-up" interpretation="Value paid across marketplace order lines in this window." spark={(trend.data ?? []).map((row) => row.revenue)} to="/sales" />
            <Metric label="Orders" value={metrics.orders.current == null ? "—" : metrics.orders.current.toLocaleString("en-IN")} scope={`Last ${days} selling days`} comparison={relativeComparison(metrics.orders)} direction={metrics.orders.direction} polarity="good-up" interpretation="Orders recorded in the selected selling-day window." spark={(trend.data ?? []).map((row) => row.orders)} to="/orders" />
            <Metric label="Average order" value={metrics.aov.current == null ? "—" : formatINR(metrics.aov.current, 0)} scope={`Last ${days} selling days`} comparison={relativeComparison(metrics.aov)} direction={metrics.aov.direction} polarity="good-up" interpretation="Average marketplace revenue per recorded order." to="/performance" />
            <Metric label="Return rate" value={metrics.return_rate.current == null ? "—" : formatPercent(metrics.return_rate.current)} scope={`Last ${days} selling days`} comparison={rateComparison(metrics.return_rate)} direction={metrics.return_rate.direction} polarity="good-down" interpretation={metrics.return_rate.direction === "down" ? "Lower return rate than the prior window." : metrics.return_rate.direction === "up" ? "Higher return rate than the prior window." : "Return rate is unchanged from the prior window."} tone={metrics.return_rate.direction === "up" ? "attention" : "normal"} to="/operations" />
            <Metric label="Delayed rate" value={metrics.delayed_rate.current == null ? "—" : formatPercent(metrics.delayed_rate.current)} scope={`Last ${days} selling days`} comparison={rateComparison(metrics.delayed_rate)} direction={metrics.delayed_rate.direction} polarity="good-down" interpretation={metrics.delayed_rate.direction === "down" ? "Lower delayed rate than the prior window." : metrics.delayed_rate.direction === "up" ? "Higher delayed rate than the prior window." : "Delayed rate is unchanged from the prior window."} tone={metrics.delayed_rate.direction === "up" ? "attention" : "normal"} to="/operations" />
          </div>
        </section>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Revenue · last {days} selling days{hasForecast ? ", plus batch outlook" : ""}</CardTitle>
          {hasForecast && forecast.data?.asof && <span className="evidence text-[13px] text-muted-foreground">Outlook as of {formatDate(forecast.data.asof)}</span>}
        </CardHeader>
        <CardContent>
          <div className="h-64">
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
          </div>
          {compatibleForecast ? (
            forecast.isLoading ? (
              <p role="status" className="mt-3 border-t border-border pt-3 text-[13px] text-muted-foreground">Loading the compatible batch outlook…</p>
            ) : forecast.isError ? (
              <div className="mt-3 border-t border-border pt-3"><StackError message="Couldn't load the batch outlook. The historical trend remains available." retry={() => forecast.refetch()} /></div>
            ) : hasForecast ? (
              <p className="mt-3 border-t border-border pt-3 text-[13px] text-muted-foreground">Outlooks are batch projections based on a 90-day trailing window as of {formatDate(forecast.data?.asof)}, not live output. Dashed: Statistical outlook. Dotted: Trend outlook.</p>
            ) : (
              <div className="mt-3 border-t border-border pt-3"><EmptyState title="No forecast rows" body="The historical trend is available, but the compatible 90-day batch returned no outlook rows." /></div>
            )
          ) : (
            <p className="mt-3 border-t border-border pt-3 text-[13px] text-muted-foreground">The batch outlook is shown only for its compatible 90-day trailing window.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-labelledby="movers-heading" className="min-w-0">
          <h2 id="movers-heading" className="mb-3 section-title">Market movers</h2>
          {categories.isLoading || cities.isLoading || sellers.isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Reading market movers…</p>
          ) : categories.isError || cities.isError || sellers.isError ? (
            <StackError message="Couldn't load market movers." retry={() => { categories.refetch(); cities.refetch(); sellers.refetch(); }} />
          ) : electronics && catTotal > 0 && worstCity && worstSeller ? (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  <li>
                    <Link to="/sales" className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60" aria-label={`${electronics.category}, ${formatPercent(electronics.revenue / catTotal, 0)} of tracked revenue. View revenue drivers.`}>
                      <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums" aria-hidden="true">01</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{electronics.category}</span>
                        <span className="block truncate text-xs text-muted-foreground">{formatPercent(electronics.revenue / catTotal, 0)} of tracked revenue · largest category</span>
                      </span>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{formatINRCompact(electronics.revenue)}</span>
                      <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                  <li>
                    <Link to="/operations" className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60" aria-label={`${worstCity.city}, ${formatPercent(worstCity.delayed_rate, 0)} delayed, highest metro. Investigate fulfillment.`}>
                      <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums" aria-hidden="true">02</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{worstCity.city}</span>
                        <span className="block truncate text-xs text-muted-foreground">Highest metro delay rate</span>
                      </span>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-destructive">{formatPercent(worstCity.delayed_rate, 0)} late</span>
                      <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                  <li>
                    <Link to={`/sellers/${worstSeller.seller_id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60" aria-label={`${worstSeller.seller_id}, ${formatPercent(worstSeller.return_rate, 0)} returns, highest in the watched set. Open seller.`}>
                      <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums" aria-hidden="true">03</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm font-semibold">{worstSeller.seller_id}</span>
                        <span className="block truncate text-xs text-muted-foreground">Highest returns in the watched set</span>
                      </span>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-destructive">{formatPercent(worstSeller.return_rate, 0)} back</span>
                      <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                </ul>
              </CardContent>
            </Card>
          ) : (
            <EmptyState title="No movers yet" body="Market movers appear once category, metro and seller signals are available." />
          )}
        </section>

        <section aria-labelledby="attention-heading" className="min-w-0">
          <h2 id="attention-heading" className="mb-3 section-title">What needs attention</h2>
          <Card>
            <CardContent className="p-0">
              {cities.isLoading || sellers.isLoading ? <p role="status" className="px-4 py-3.5 text-sm text-muted-foreground">Checking city and seller signals…</p> : null}
              {cities.isError && <div className="px-4 py-3.5"><StackError message="Couldn't load city signals." retry={() => cities.refetch()} /></div>}
              {sellers.isError && <div className="px-4 py-3.5"><StackError message="Couldn't load seller signals." retry={() => sellers.refetch()} /></div>}
              {!cities.isLoading && !cities.isError && (cities.data ?? []).length === 0 && <EmptyState title="No city signals yet" body="Metro delivery signals appear after completed orders are recorded." />}
              {!sellers.isLoading && !sellers.isError && (sellers.data ?? []).length === 0 && <EmptyState title="No seller signals yet" body="Seller return signals appear after order lines are completed." />}
              {attention.length > 0 && (
                <ol className="divide-y divide-border">
                  {attention.map((item, index) => (
                    <li key={item.text}>
                      <Link to={item.to} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted/60" aria-label={`Attention ${index + 1}: ${item.text}`}>
                        <span className="queue-numeral" aria-hidden="true">{index + 1}</span>
                        <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{item.text}</span>
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
      </div>

      <section aria-labelledby="context-heading">
        <h2 id="context-heading" className="mb-3 section-title">Marketplace context</h2>
        {overview.isError || pareto.isError || categories.isError || thinStock.isError ? (
          <StackError message="Couldn't load the marketplace context." retry={() => { overview.refetch(); pareto.refetch(); categories.refetch(); thinStock.refetch(); }} />
        ) : overview.isLoading || pareto.isLoading || categories.isLoading || thinStock.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Reading the marketplace context…</p>
        ) : !o || !pareto.data || (categories.data ?? []).length === 0 || catTotal <= 0 ? (
          <EmptyState title="No context yet" body="Stock, concentration and mix appear once marketplace records are available." />
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="min-w-0">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Restock watch</CardTitle>
                <Link to="/inventory" className="text-[13px] font-medium text-link hover:underline">Inventory</Link>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">{o.stock_critical.toLocaleString("en-IN")}</span> products under 20 units
                </p>
                {(thinStock.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing under review right now.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {[...(thinStock.data ?? [])]
                      .sort((a, b) => a.latest_stock - b.latest_stock)
                      .slice(0, 6)
                      .map((product) => (
                        <li key={product.product_id}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <Link to={`/products/${product.product_id}`} className="evidence min-w-0 truncate font-medium underline-offset-4 hover:underline">
                              {product.product_id}
                            </Link>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{product.latest_stock} units</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${product.product_id}: ${product.latest_stock} units of the 20-unit review line`}>
                            <span
                              className={product.latest_stock <= 5 ? "block h-full rounded-full bg-destructive/70" : "block h-full rounded-full bg-warning/80"}
                              style={{ width: `${Math.min(100, (product.latest_stock / 20) * 100)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">Bars scale to the 20-unit review line.</p>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Customer concentration</CardTitle>
                <Link to="/customers" className="text-[13px] font-medium text-link hover:underline">Customers</Link>
              </CardHeader>
              <CardContent>
                <div className="relative h-44" role="img" aria-label={`Top fifth of customers hold ${formatPercent(pareto.data.top20_share)} of revenue.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value) => formatPercent(Number(value))} />
                      <Pie
                        data={[
                          { name: "Top fifth", value: pareto.data.top20_share },
                          { name: "Everyone else", value: Math.max(0, 1 - pareto.data.top20_share) },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="66%"
                        outerRadius="90%"
                        strokeWidth={2}
                        stroke="var(--card)"
                        paddingAngle={2}
                        isAnimationActive={false}
                      >
                        <Cell fill="var(--chart-1)" />
                        <Cell fill="var(--secondary)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                    <span className="font-mono text-xl font-semibold tabular-nums">{formatPercent(pareto.data.top20_share, 0)}</span>
                    <span className="text-xs text-muted-foreground">top fifth</span>
                  </div>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Share of revenue held by the highest-spending fifth of customers.</p>
              </CardContent>
            </Card>

            <Card className="min-w-0 md:col-span-2 xl:col-span-1">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Category mix</CardTitle>
                <Link to="/sales" className="text-[13px] font-medium text-link hover:underline">Revenue</Link>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {[...(categories.data ?? [])]
                    .sort((a, b) => b.revenue - a.revenue)
                    .map((category) => (
                      <li key={category.category}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">{category.category}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{catTotal > 0 ? formatPercent(category.revenue / catTotal, 0) : "—"}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${category.category}: ${catTotal > 0 ? formatPercent(category.revenue / catTotal, 0) : "no share"} of tracked category revenue`}>
                          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${catTotal > 0 ? Math.min(100, (category.revenue / catTotal) * 100) : 0}%` }} />
                        </div>
                      </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">Share of tracked category revenue.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="mb-3 section-title">Order status mix</h2>
          <Card>
            <CardContent>
              {overview.isError ? (
                <StackError message="Couldn't load order statuses." retry={() => overview.refetch()} />
              ) : overview.isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">Loading order statuses…</p>
              ) : !o || Object.keys(o.by_status).length === 0 ? (
                <EmptyState title="No order statuses yet" body="Status mix appears once orders are available." />
              ) : (
                <ul className="divide-y divide-border">
                  {Object.entries(o.by_status).map(([status, count]) => (
                    <li key={status} className="flex min-h-11 items-center justify-between gap-3 py-2">
                      <StatusPill status={status as DeliveryStatus} />
                      <span className="text-sm font-medium tabular-nums">{count.toLocaleString("en-IN")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

      <Lineage metric="marketplace revenue" endpoint="GET /stats/performance-summary" gold="fact_sales" />
    </div>
  );
}
