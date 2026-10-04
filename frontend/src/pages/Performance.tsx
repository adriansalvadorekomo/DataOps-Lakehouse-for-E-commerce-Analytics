import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatINR, formatPercent, type CityPerf, type MetricComparison } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import { useSortedRows } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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

export default function Performance() {
  const [period, setPeriod] = useState<Period>("90");
  const days = Number(period);
  const summary = useQuery({ queryKey: ["performance-summary", days], queryFn: () => api.performanceSummary(days), staleTime: 60_000 });
  const trend = useQuery({ queryKey: ["cat-trend-12"], queryFn: () => api.categoryTrend(12), staleTime: 60_000 });
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
  const citySort = useSortedRows(cities.data ?? [], "revenue", {
    city: (city: CityPerf) => city.city,
    revenue: (city: CityPerf) => city.revenue,
    orders: (city: CityPerf) => city.orders,
    delayed: (city: CityPerf) => city.delayed_rate,
    returned: (city: CityPerf) => city.return_rate,
  });

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Comparisons and breakdowns"
        title="Performance"
        question="How does the current window compare with the prior equal window, and where does performance come from?"
      />

      <div className="border-y border-border bg-card/60 px-4 py-4 sm:px-5">
        <SegmentedControl label="Comparison window" value={period} onChange={setPeriod} options={PERIODS} getOptionLabel={(value) => `${value} days`} />
        <p className="mt-3 text-sm text-muted-foreground">Last {days} selling days compared with the prior equal window.</p>
      </div>

      <section aria-labelledby="comparison-heading">
        <h2 id="comparison-heading" className="mb-3 font-serif text-xl">Window comparison</h2>
        {summary.isError ? (
          <StackError message="Couldn't load the performance comparison." retry={() => summary.refetch()} />
        ) : summary.isLoading ? (
          <p role="status" className="text-[15px] text-muted-foreground">Loading the comparison…</p>
        ) : !metrics ? (
          <EmptyState title="No comparison yet" body="Measures appear once both selling-day windows contain source data." />
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Revenue" value={metrics.revenue.current == null ? "—" : formatINR(metrics.revenue.current, 0)} scope={`Last ${days} selling days`} comparison={comparisonText(metrics.revenue, "percent")} direction={metrics.revenue.direction} to="/sales" />
            <Metric label="Orders" value={metrics.orders.current == null ? "—" : metrics.orders.current.toLocaleString("en-IN")} scope={`Last ${days} selling days`} comparison={comparisonText(metrics.orders, "percent")} direction={metrics.orders.direction} to="/orders" />
            <Metric label="Average order" value={metrics.aov.current == null ? "—" : formatINR(metrics.aov.current, 0)} scope={`Last ${days} selling days`} comparison={comparisonText(metrics.aov, "percent")} direction={metrics.aov.direction} />
            <Metric label="Return rate" value={metrics.return_rate.current == null ? "—" : formatPercent(metrics.return_rate.current)} scope={`Last ${days} selling days`} comparison={comparisonText(metrics.return_rate, "points")} direction={metrics.return_rate.direction} tone={metrics.return_rate.direction === "up" ? "attention" : "normal"} to="/operations" />
            <Metric label="Delayed rate" value={metrics.delayed_rate.current == null ? "—" : formatPercent(metrics.delayed_rate.current)} scope={`Last ${days} selling days`} comparison={comparisonText(metrics.delayed_rate, "points")} direction={metrics.delayed_rate.direction} tone={metrics.delayed_rate.direction === "up" ? "attention" : "normal"} to="/operations" />
          </div>
        )}
      </section>

      <section aria-labelledby="category-heading" className="space-y-4">
        <h2 id="category-heading" className="font-serif text-xl">Revenue by category · latest 12 months</h2>
        <Card>
          <CardContent className="h-72 pt-5">
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
        <p className="text-[13px] text-muted-foreground">
          Category detail lives on <Link to="/sales" className="text-link font-medium hover:underline">Revenue</Link>.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="metro-heading" className="min-w-0 space-y-3">
          <h2 id="metro-heading" className="font-serif text-xl">Metro breakdown</h2>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {cities.isError ? (
                <div className="p-5"><StackError message="Couldn't load metro performance." retry={() => cities.refetch()} /></div>
              ) : cities.isLoading ? (
                <TableSkeleton cols={4} />
              ) : (cities.data ?? []).length === 0 ? (
                <EmptyState title="No metro performance yet" body="Metro contribution appears once orders are on the books." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <caption className="sr-only">Metro revenue, orders, delayed and return rates. Sortable.</caption>
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
                          <TableCell className="text-right tabular-nums">{formatINR(city.revenue, 0)}</TableCell>
                          <TableCell className="text-right tabular-nums">{city.orders.toLocaleString("en-IN")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPercent(city.delayed_rate, 0)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPercent(city.return_rate, 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="contributors-heading" className="min-w-0 space-y-3">
          <h2 id="contributors-heading" className="font-serif text-xl">Top contributing sellers</h2>
          <Card className="shadow-none">
            <CardContent>
              {sellers.isError ? (
                <StackError message="Couldn't load contributing sellers." retry={() => sellers.refetch()} />
              ) : sellers.isLoading ? (
                <p role="status" className="py-4 text-[15px] text-muted-foreground">Reading contributing sellers…</p>
              ) : (sellers.data ?? []).length === 0 ? (
                <EmptyState title="No sellers yet" body="Contributors appear once orders land on the books." />
              ) : (
                <ul className="divide-y divide-border">
                  {(sellers.data ?? []).map((seller, index) => (
                    <li key={seller.seller_id} className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="mr-2 font-mono text-[13px] text-muted-foreground tabular-nums">{index + 1}</span>
                        <Link to={`/sellers/${seller.seller_id}`} className="evidence font-medium underline-offset-4 hover:underline">
                          {seller.seller_id}
                        </Link>
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{formatINR(seller.revenue, 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/sellers" className="text-link mt-2 inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
                All sellers
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>

      <Lineage metric="window comparison" endpoint="GET /stats/performance-summary" gold="fact_sales" />
    </div>
  );
}
