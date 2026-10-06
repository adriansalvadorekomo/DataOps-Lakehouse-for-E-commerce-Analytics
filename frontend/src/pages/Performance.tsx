import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatINR, formatINRCompact, formatPercent, type CityPerf, type MetricComparison } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import { cn, useSortedRows } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Metric } from "@/components/Metric";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { ChartSkeleton, EmptyState, Lineage, PageHeader, SortTh, StackError, TableSkeleton } from "@/components/PageHeader";

const PERIODS = ["30", "90", "365"] as const;
type Period = (typeof PERIODS)[number];

const CAT_STYLES: Record<string, { color: string; dash?: string }> = {
  Electronics: { color: "var(--chart-1)" },
  Home: { color: "var(--chart-2)", dash: "8 3" },
  Sports: { color: "var(--chart-3)", dash: "3 3" },
  Beauty: { color: "var(--chart-4)", dash: "10 3 2 3" },
  Clothing: { color: "var(--chart-5)", dash: "2 2" },
};

function shortMonth(month: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" }).format(new Date(`${month}-01T00:00:00`));
}

function comparisonText(metric: MetricComparison, unit: "percent" | "points"): string | null {
  if (metric.relative_change == null) return null;
  if (unit === "points" && metric.absolute_change != null) {
    return `${Math.abs(metric.absolute_change * 100).toFixed(1)} percentage points versus the prior equal window`;
  }
  return `${Math.abs(metric.relative_change * 100).toFixed(1)}% versus the prior equal window`;
}

/** Power-BI-style conditional cell: value plus a data bar scaled to the column max. */
function BarCell({ display, fraction, barClass }: { display: string; fraction: number; barClass: string }) {
  const width = Math.min(100, Math.max(0, fraction * 100));
  return (
    <span className="flex items-center justify-end gap-2">
      <span aria-hidden="true" className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-secondary sm:block">
        <span className={cn("block h-full rounded-full", barClass)} style={{ width: `${width}%` }} />
      </span>
      <span className="tabular-nums">{display}</span>
    </span>
  );
}

export default function Performance() {
  const [period, setPeriod] = useState<Period>("90");
  const days = Number(period);
  const summary = useQuery({ queryKey: ["performance-summary", days], queryFn: () => api.performanceSummary(days), staleTime: 60_000 });
  const daily = useQuery({ queryKey: ["perf-trend", days], queryFn: () => api.trend(days), staleTime: 60_000 });
  const trend = useQuery({ queryKey: ["cat-trend-12"], queryFn: () => api.categoryTrend(12), staleTime: 60_000 });
  const categories = useQuery({ queryKey: ["perf-categories"], queryFn: api.categories, staleTime: 60_000 });
  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities, staleTime: 60_000 });
  const sellers = useQuery({ queryKey: ["sellers8"], queryFn: () => api.sellers(8), staleTime: 60_000 });

  const metrics = summary.data?.metrics;
  const months: string[] = [];
  const byMonth: Record<string, Record<string, number>> = {};
  for (const row of trend.data ?? []) {
    if (!byMonth[row.month]) {
      byMonth[row.month] = {};
      months.push(row.month);
    }
    byMonth[row.month][row.category] = row.revenue;
  }
  months.sort();
  const series = months.map((month) => ({ month, ...byMonth[month] }));
  const catRows = [...(categories.data ?? [])].sort((a, b) => b.revenue - a.revenue);
  const catTotal = catRows.reduce((sum, category) => sum + category.revenue, 0);
  const cityRows = cities.data ?? [];
  const maxDelayed = Math.max(...cityRows.map((city) => city.delayed_rate), 0);
  const maxReturned = Math.max(...cityRows.map((city) => city.return_rate), 0);
  const sellerRows = sellers.data ?? [];
  const maxSellerRevenue = Math.max(...sellerRows.map((seller) => seller.revenue), 1);
  const citySort = useSortedRows(cityRows, "revenue", {
    city: (city: CityPerf) => city.city,
    revenue: (city: CityPerf) => city.revenue,
    orders: (city: CityPerf) => city.orders,
    delayed: (city: CityPerf) => city.delayed_rate,
    returned: (city: CityPerf) => city.return_rate,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Comparisons and breakdowns"
        title="Performance"
        question="How does the current window compare with the prior equal window, and where does performance come from?"
      />

      <div className="panel flex flex-wrap items-end gap-x-6 gap-y-3 px-4 py-3.5">
        <SegmentedControl label="Comparison window" value={period} onChange={setPeriod} options={PERIODS} getOptionLabel={(value) => `${value} days`} />
        <p className="pb-2 text-sm text-muted-foreground">Last {days} selling days compared with the prior equal window.</p>
      </div>

      <section aria-label="Key indicators">
        {summary.isError ? (
          <StackError message="Couldn't load the performance comparison." retry={() => summary.refetch()} />
        ) : summary.isLoading || !metrics ? (
          <p role="status" className="text-sm text-muted-foreground">Loading the indicators…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Metric label="Revenue" value={metrics.revenue.current == null ? "—" : formatINR(metrics.revenue.current, 0)} scope={`Last ${days} days`} comparison={comparisonText(metrics.revenue, "percent")} direction={metrics.revenue.direction} polarity="good-up" spark={(daily.data ?? []).map((row) => row.revenue)} to="/sales" />
            <Metric label="Orders" value={metrics.orders.current == null ? "—" : metrics.orders.current.toLocaleString("en-IN")} scope={`Last ${days} days`} comparison={comparisonText(metrics.orders, "percent")} direction={metrics.orders.direction} polarity="good-up" spark={(daily.data ?? []).map((row) => row.orders)} to="/orders" />
            <Metric label="Average order" value={metrics.aov.current == null ? "—" : formatINR(metrics.aov.current, 0)} scope={`Last ${days} days`} comparison={comparisonText(metrics.aov, "percent")} direction={metrics.aov.direction} polarity="good-up" />
            <Metric label="Return rate" value={metrics.return_rate.current == null ? "—" : formatPercent(metrics.return_rate.current)} scope={`Last ${days} days`} comparison={comparisonText(metrics.return_rate, "points")} direction={metrics.return_rate.direction} polarity="good-down" tone={metrics.return_rate.direction === "up" ? "attention" : "normal"} to="/operations" />
            <Metric label="Delayed rate" value={metrics.delayed_rate.current == null ? "—" : formatPercent(metrics.delayed_rate.current)} scope={`Last ${days} days`} comparison={comparisonText(metrics.delayed_rate, "points")} direction={metrics.delayed_rate.direction} polarity="good-down" tone={metrics.delayed_rate.direction === "up" ? "attention" : "normal"} to="/operations" />
          </div>
        )}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Revenue by category · latest 12 months</CardTitle>
            <Link to="/sales" className="text-[13px] font-medium text-link hover:underline">Open Revenue</Link>
          </CardHeader>
          <CardContent className="h-72">
            {trend.isError ? (
              <StackError message="Couldn't load category momentum." retry={() => trend.refetch()} />
            ) : trend.isLoading ? (
              <ChartSkeleton />
            ) : series.length === 0 ? (
              <EmptyState title="No category trend yet" body="Monthly category revenue appears once selling months are recorded." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tickFormatter={shortMonth} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} minTickGap={40} />
                  <YAxis tickFormatter={(value: number) => `₹${Math.round(value / 1e6)}M`} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Tooltip formatter={(value) => formatINR(Number(value), 0)} labelFormatter={(label) => shortMonth(String(label))} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  {CATEGORIES.map((category) => (
                    <Line key={category} type="monotone" dataKey={category} stroke={CAT_STYLES[category].color} strokeDasharray={CAT_STYLES[category].dash} strokeWidth={2.25} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Revenue mix</CardTitle>
            <Link to="/sales" className="text-[13px] font-medium text-link hover:underline">Details</Link>
          </CardHeader>
          <CardContent>
            {categories.isError ? (
              <StackError message="Couldn't load the revenue mix." retry={() => categories.refetch()} />
            ) : categories.isLoading ? (
              <ChartSkeleton />
            ) : catRows.length === 0 || catTotal <= 0 ? (
              <EmptyState title="No mix yet" body="Category contribution appears once product sales are recorded." />
            ) : (
              <>
                <div className="relative h-52" role="img" aria-label={`Revenue mix. Total ${formatINRCompact(catTotal)} tracked. Largest: ${catRows[0].category}.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value) => formatINR(Number(value), 0)} />
                      <Pie data={catRows} dataKey="revenue" nameKey="category" innerRadius="64%" outerRadius="88%" strokeWidth={2} stroke="var(--card)" paddingAngle={2} isAnimationActive={false}>
                        {catRows.map((category) => (
                          <Cell key={category.category} fill={CAT_STYLES[category.category]?.color ?? "var(--chart-3)"} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                    <span className="font-mono text-xl font-semibold tabular-nums">{formatINRCompact(catTotal)}</span>
                    <span className="text-xs text-muted-foreground">tracked</span>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {catRows.map((category) => (
                    <li key={category.category} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: CAT_STYLES[category.category]?.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-medium">{category.category}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{catTotal > 0 ? formatPercent(category.revenue / catTotal, 0) : "—"}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Card className="min-w-0 overflow-hidden xl:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Metro matrix</CardTitle>
            <span className="text-xs text-muted-foreground">Bars scale to the column maximum</span>
          </CardHeader>
          <CardContent className="p-0">
            {cities.isError ? (
              <div className="p-4"><StackError message="Couldn't load metro performance." retry={() => cities.refetch()} /></div>
            ) : cities.isLoading ? (
              <TableSkeleton cols={5} />
            ) : cityRows.length === 0 ? (
              <EmptyState title="No metro performance yet" body="Metro contribution appears once orders are on the books." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Metro revenue, orders, delayed and return rates with data bars. Sortable.</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <SortTh label="Metro" column="city" activeColumn={citySort.sortKey} direction={citySort.direction} onToggle={citySort.toggle} />
                      <SortTh label="Revenue" column="revenue" activeColumn={citySort.sortKey} direction={citySort.direction} onToggle={citySort.toggle} align="right" />
                      <SortTh label="Orders" column="orders" activeColumn={citySort.sortKey} direction={citySort.direction} onToggle={citySort.toggle} align="right" />
                      <SortTh label="Delayed" column="delayed" activeColumn={citySort.sortKey} direction={citySort.direction} onToggle={citySort.toggle} align="right" />
                      <SortTh label="Returned" column="returned" activeColumn={citySort.sortKey} direction={citySort.direction} onToggle={citySort.toggle} align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {citySort.sorted.map((city) => (
                      <TableRow key={city.city}>
                        <TableCell className="font-medium">{city.city}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatINRCompact(city.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{city.orders.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right"><BarCell display={formatPercent(city.delayed_rate, 0)} fraction={maxDelayed > 0 ? city.delayed_rate / maxDelayed : 0} barClass="bg-destructive/60" /></TableCell>
                        <TableCell className="text-right"><BarCell display={formatPercent(city.return_rate, 0)} fraction={maxReturned > 0 ? city.return_rate / maxReturned : 0} barClass="bg-warning/70" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Top sellers</CardTitle>
            <Link to="/sellers" className="text-[13px] font-medium text-link hover:underline">All sellers</Link>
          </CardHeader>
          <CardContent>
            {sellers.isError ? (
              <StackError message="Couldn't load contributing sellers." retry={() => sellers.refetch()} />
            ) : sellers.isLoading ? (
              <p role="status" className="py-4 text-sm text-muted-foreground">Reading contributing sellers…</p>
            ) : sellerRows.length === 0 ? (
              <EmptyState title="No sellers yet" body="Contributors appear once orders land on the books." />
            ) : (
              <ul className="space-y-2.5">
                {sellerRows.map((seller, index) => (
                  <li key={seller.seller_id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="mr-2 font-mono text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                        <Link to={`/sellers/${seller.seller_id}`} className="evidence font-medium underline-offset-4 hover:underline">
                          {seller.seller_id}
                        </Link>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">{formatINRCompact(seller.revenue)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (seller.revenue / maxSellerRevenue) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Lineage metric="window comparison" endpoint="GET /stats/performance-summary" gold="fact_sales" />
    </div>
  );
}
