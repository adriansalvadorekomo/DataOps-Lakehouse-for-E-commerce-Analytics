import { useState } from "react";
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
import { Link } from "react-router-dom";
import { api, formatINR, formatPercent, type TopSeller } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import { useSortedRows } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { MeterRow } from "@/components/MeterRow";
import { Metric } from "@/components/Metric";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ChartSkeleton, EmptyState, PageHeader, SortTh, StackError, TableSkeleton } from "@/components/PageHeader";

const STALE = 60_000;
const PERIODS = ["3", "12", "24", "36"] as const;
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

export default function Sales() {
  const [period, setPeriod] = useState<Period>("12");
  const monthsSelected = Number(period);
  const trend = useQuery({ queryKey: ["cat-trend", monthsSelected], queryFn: () => api.categoryTrend(monthsSelected), staleTime: STALE });
  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities, staleTime: STALE });
  const bands = useQuery({ queryKey: ["bands"], queryFn: api.bands, staleTime: STALE });
  const sellers = useQuery({ queryKey: ["sellers8"], queryFn: () => api.sellers(8), staleTime: STALE });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: STALE });

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
  const cityTotal = (cities.data ?? []).reduce((sum, city) => sum + city.revenue, 0);
  const categoryTotal = (categories.data ?? []).reduce((sum, category) => sum + category.revenue, 0);
  const bandTotal = (bands.data ?? []).reduce((sum, band) => sum + band.revenue, 0);
  const sellerSort = useSortedRows(sellers.data ?? [], "revenue", {
    seller: (seller: TopSeller) => seller.seller_id,
    lines: (seller: TopSeller) => seller.lines,
    rating: (seller: TopSeller) => seller.avg_rating,
    revenue: (seller: TopSeller) => seller.revenue,
  });
  const leadingCategory = [...(categories.data ?? [])].sort((a, b) => b.revenue - a.revenue)[0];
  const topCity = [...(cities.data ?? [])].sort((a, b) => b.revenue - a.revenue)[0];
  const topBand = [...(bands.data ?? [])].sort((a, b) => b.revenue - a.revenue)[0];
  const maxBandRevenue = Math.max(...(bands.data ?? []).map((band) => band.revenue), 1);
  const kpiReady = leadingCategory && categoryTotal > 0 && topCity && cityTotal > 0 && topBand && bandTotal > 0;
  const kpiLoading = categories.isLoading || cities.isLoading || bands.isLoading;
  const kpiError = categories.isError || cities.isError || bands.isError;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales performance" title="Revenue" question="What is driving sales, and what changed by category?" />

      <div className="panel px-4 py-3.5">
        <SegmentedControl label="Category trend window" value={period} onChange={setPeriod} options={PERIODS} getOptionLabel={(value) => `${value} months`} />
        <p className="mt-2 text-sm text-muted-foreground">The chart uses the latest {monthsSelected} calendar months returned by the category trend.</p>
      </div>

      {kpiError ? (
        <StackError message="Couldn't load the revenue headline." retry={() => { categories.refetch(); cities.refetch(); bands.refetch(); }} />
      ) : kpiLoading ? (
        <p role="status" className="text-sm text-muted-foreground">Reading the revenue headline…</p>
      ) : kpiReady ? (
        <section aria-label="Revenue headline">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Metric label="Leading category" value={`${leadingCategory.category} ${formatPercent(leadingCategory.revenue / categoryTotal, 0)}`} scope="Share of returned category revenue" interpretation={`${formatINR(leadingCategory.revenue, 0)} of ${formatINR(categoryTotal, 0)} tracked.`} to="/sales" />
            <Metric label="Top metro" value={`${topCity.city} ${formatPercent(topCity.revenue / cityTotal, 0)}`} scope="Share of returned metro revenue" interpretation={`${topCity.orders.toLocaleString("en-IN")} orders on the books.`} to="/operations" />
            <Metric label="Heaviest discount band" value={`${topBand.band}% off · ${formatPercent(topBand.revenue / bandTotal, 0)}`} scope="Share of banded revenue" interpretation={`${topBand.lines.toLocaleString("en-IN")} discounted lines in this band.`} to="/sales" />
          </div>
        </section>
      ) : (
        <EmptyState title="No revenue headline yet" body="Category, metro and discount signals appear once sales are recorded." />
      )}

      <section aria-labelledby="category-change-heading" className="space-y-3">
        <h2 id="category-change-heading" className="section-title">Category momentum · latest {monthsSelected} months</h2>
        {categories.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Reading category totals…</p>
        ) : categories.isError ? (
          <StackError message="Couldn't load the category insight." retry={() => categories.refetch()} />
        ) : !leadingCategory || categoryTotal <= 0 ? (
          <EmptyState title="No category insight yet" body="Category contribution appears once product sales are recorded." />
        ) : (
          <p className="text-sm text-muted-foreground">{leadingCategory.category} contributes the largest revenue share at {formatPercent(leadingCategory.revenue / categoryTotal, 0)}. Colour and line pattern both distinguish categories.</p>
        )}
        <Card>
          <CardContent className="pt-4">
            <div className="h-72">
              {trend.isError ? (
                <StackError message="Couldn't load category momentum." retry={() => trend.refetch()} />
              ) : trend.isLoading ? (
                <ChartSkeleton />
              ) : (trend.data ?? []).length === 0 ? (
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
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-labelledby="category-mix-heading" className="min-w-0 space-y-3">
          <h2 id="category-mix-heading" className="section-title">Category mix</h2>
          <Card>
            <CardHeader><CardTitle>Share of returned category revenue</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border">
              {categories.isError ? (
                <StackError message="Couldn't load the category mix." retry={() => categories.refetch()} />
              ) : categories.isLoading ? (
                <ChartSkeleton />
              ) : (categories.data ?? []).length === 0 || categoryTotal <= 0 ? (
                <EmptyState title="No category mix yet" body="Category contribution appears once product sales are recorded." />
              ) : (
                [...(categories.data ?? [])]
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((category) => (
                    <MeterRow
                      key={category.category}
                      label={category.category}
                      value={category.revenue}
                      max={categoryTotal}
                      valueLabel={formatINR(category.revenue, 0)}
                      secondary={`${formatPercent(category.revenue / categoryTotal, 0)} of returned category revenue · ${category.lines.toLocaleString("en-IN")} lines`}
                    />
                  ))
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="revenue-source-heading" className="min-w-0 space-y-3">
          <h2 id="revenue-source-heading" className="section-title">Where revenue comes from</h2>
          <Card>
            <CardHeader><CardTitle>Revenue by metro</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border">
              {cities.isError ? (
                <StackError message="Couldn't load metro revenue." retry={() => cities.refetch()} />
              ) : cities.isLoading ? (
                <ChartSkeleton />
              ) : (cities.data ?? []).length === 0 ? (
                <EmptyState title="No metro revenue yet" body="Metro contribution appears once orders are on the books." />
              ) : (
                (cities.data ?? []).map((city) => (
                  <MeterRow key={city.city} label={city.city} value={city.revenue} max={cityTotal} valueLabel={formatINR(city.revenue, 0)} secondary={`${formatPercent(city.revenue / (cityTotal || 1), 0)} of returned metro revenue · ${city.orders.toLocaleString("en-IN")} orders`} />
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="levers-heading" className="space-y-3">
        <h2 id="levers-heading" className="section-title">Commercial levers</h2>
        <Card>
          <CardHeader><CardTitle>Seller-funded discount bands</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-2 text-[13px] text-muted-foreground">Bars compare revenue across the real discount bands returned; they are scaled to the largest band.</p>
            <div className="divide-y divide-border">
              {bands.isError ? (
                <StackError message="Couldn't load discount bands." retry={() => bands.refetch()} />
              ) : bands.isLoading ? (
                <ChartSkeleton />
              ) : (bands.data ?? []).length === 0 ? (
                <EmptyState title="No discount bands yet" body="Seller-funded discount totals appear once discounted lines are recorded." />
              ) : (
                (bands.data ?? []).map((band) => (
                  <MeterRow key={band.band} label={`${band.band}% off`} value={band.revenue} max={maxBandRevenue} valueLabel={formatINR(band.revenue, 0)} secondary={`${band.lines.toLocaleString("en-IN")} lines`} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="seller-revenue-heading" className="space-y-3">
        <h2 id="seller-revenue-heading" className="section-title">Seller revenue</h2>
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Who drives revenue · top 8 returned</CardTitle>
            <Link to="/sellers" className="min-h-11 py-3 text-[15px] hover:underline">All sellers</Link>
          </CardHeader>
          <CardContent className="p-0">
            {sellers.isError ? (
              <div className="p-4"><StackError message="Couldn't load seller revenue." retry={() => sellers.refetch()} /></div>
            ) : sellers.isLoading ? (
              <TableSkeleton />
            ) : (sellers.data ?? []).length === 0 ? (
              <EmptyState title="No seller totals yet" body="Once orders land, this list fills from the books." />
            ) : (
              <div className="overflow-x-auto">
                <p className="px-4 py-2 text-xs text-muted-foreground sm:hidden">Scroll horizontally to view every seller measure.</p>
                <Table>
                  <caption className="sr-only">Top eight sellers returned by revenue, with lines and average rating.</caption>
                  <TableHeader><TableRow className="hover:bg-transparent">
                    <SortTh label="Seller" column="seller" activeColumn={sellerSort.sortKey} direction={sellerSort.direction} onToggle={sellerSort.toggle} />
                    <SortTh label="Lines" column="lines" activeColumn={sellerSort.sortKey} direction={sellerSort.direction} onToggle={sellerSort.toggle} align="right" />
                    <SortTh label="Rating" column="rating" activeColumn={sellerSort.sortKey} direction={sellerSort.direction} onToggle={sellerSort.toggle} align="right" />
                    <SortTh label="Revenue" column="revenue" activeColumn={sellerSort.sortKey} direction={sellerSort.direction} onToggle={sellerSort.toggle} align="right" />
                  </TableRow></TableHeader>
                  <TableBody>
                    {sellerSort.sorted.map((seller) => (
                      <TableRow key={seller.seller_id}><TableCell className="evidence font-medium">{seller.seller_id}</TableCell><TableCell className="text-right tabular-nums">{seller.lines.toLocaleString("en-IN")}</TableCell><TableCell className="text-right tabular-nums">{seller.avg_rating.toFixed(1)}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatINR(seller.revenue, 0)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
