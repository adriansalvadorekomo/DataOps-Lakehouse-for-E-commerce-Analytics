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
import { api, formatINR, formatPercent } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartSkeleton, EmptyState, PageHeader, StackError, TableSkeleton } from "@/components/PageHeader";

const STALE = 60_000;
const CAT_COLORS: Record<string, string> = {
  Electronics: "var(--primary)",
  Home: "var(--foreground)",
  Sports: "var(--success)",
  Beauty: "var(--muted-foreground)",
  Clothing: "var(--link)",
};

function shortMonth(ym: string): string {
  return new Date(ym + "-01T00:00:00").toLocaleString("en-IN", { month: "short" });
}

export default function Sales() {
  const trend = useQuery({ queryKey: ["cat-trend"], queryFn: () => api.categoryTrend(12), staleTime: STALE });
  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities, staleTime: STALE });
  const bands = useQuery({ queryKey: ["bands"], queryFn: api.bands, staleTime: STALE });
  const sellers = useQuery({ queryKey: ["sellers8"], queryFn: () => api.sellers(8), staleTime: STALE });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: STALE });

  const months: string[] = [];
  const byMonth: Record<string, Record<string, number>> = {};
  for (const r of trend.data ?? []) {
    if (!byMonth[r.month]) {
      byMonth[r.month] = {};
      months.push(r.month);
    }
    byMonth[r.month][r.category] = r.revenue;
  }
  months.sort();
  const series = months.map((m) => ({ month: m, ...byMonth[m] }));
  const cityTotal = (cities.data ?? []).reduce((s, c) => s + c.revenue, 0);
  const catTotal = (categories.data ?? []).reduce((s, c) => s + c.revenue, 0);
  const electronics = (categories.data ?? []).find((c) => c.category === "Electronics");

  return (
    <div className="space-y-10">
      <PageHeader title="Revenue" question="What is driving sales, and what is changing?" />

      {categories.isLoading ? (
        <p role="status" className="text-[15px] text-muted-foreground">Reading category mix…</p>
      ) : categories.isError ? (
        <StackError message="Couldn't load the categories insight." retry={() => categories.refetch()} />
      ) : (categories.data ?? []).length === 0 ? (
        <EmptyState title="No category insight yet" body="Category contribution appears once product sales are recorded." />
      ) : electronics && catTotal > 0 ? (
        <p className="text-[15px] text-muted-foreground">
          Orders are spread evenly across five categories; Electronics still takes{" "}
          {formatPercent(electronics.revenue / catTotal, 0)} of rupees because ticket size is higher.
        </p>
      ) : (
        <p className="text-[15px] text-muted-foreground">Category totals are available, but no Electronics sales are present.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Category momentum · monthly revenue</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
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
                <XAxis
                  dataKey="month"
                  tickFormatter={shortMonth}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  minTickGap={40}
                />
                <YAxis
                  tickFormatter={(v: number) => `₹${Math.round(v / 1e6)}M`}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                />
                <Tooltip formatter={(v) => formatINR(Number(v), 0)} labelFormatter={(label) => shortMonth(String(label))} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                {CATEGORIES.map((c) => (
                  <Line key={c} type="monotone" dataKey={c} stroke={CAT_COLORS[c]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by metro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cities.isError ? (
              <StackError message="Couldn't load metro revenue." retry={() => cities.refetch()} />
            ) : cities.isLoading ? (
              <ChartSkeleton />
            ) : (cities.data ?? []).length === 0 ? (
              <EmptyState title="No metro revenue yet" body="Metro contribution appears once orders are on the live books." />
            ) : (
              (cities.data ?? []).map((c) => (
                <div key={c.city} className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-[15px]">
                    <span className="font-medium">{c.city}</span>
                    <span className="font-mono text-muted-foreground tabular-nums">
                      {formatINR(c.revenue, 0)} · {formatPercent(c.revenue / (cityTotal || 1), 0)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((c.revenue / (cityTotal || 1)) * 100, 1.5)}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seller-funded discounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[13px] text-muted-foreground">Bands of 0–10, 10–30, 30–50 and 50–70 percent off.</p>
            {bands.isError ? (
              <StackError message="Couldn't load discount bands." retry={() => bands.refetch()} />
            ) : bands.isLoading ? (
              <ChartSkeleton />
            ) : (bands.data ?? []).length === 0 ? (
              <EmptyState title="No discount bands yet" body="Seller-funded discount totals appear once discounted lines are recorded." />
            ) : (
              (bands.data ?? []).map((b) => {
                const max = Math.max(...(bands.data ?? []).map((x) => x.revenue), 1);
                return (
                  <div key={b.band} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-[15px]">
                      <span className="font-medium tabular-nums">{b.band}% off</span>
                      <span className="font-mono text-muted-foreground tabular-nums">
                        {formatINR(b.revenue, 0)} · {b.lines.toLocaleString("en-IN")} lines
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max((b.revenue / max) * 100, 1.5)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Who drives revenue</CardTitle>
          <Link to="/sellers" className="text-[15px] hover:underline">
            All sellers
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {sellers.isError ? (
            <div className="p-5">
              <StackError message="Couldn't load seller revenue." retry={() => sellers.refetch()} />
            </div>
          ) : sellers.isLoading ? (
            <TableSkeleton />
          ) : (sellers.data ?? []).length === 0 ? (
            <EmptyState title="No seller totals yet" body="Once orders land, this list fills from the live books." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Seller</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sellers.data ?? []).map((s) => (
                  <TableRow key={s.seller_id}>
                    <TableCell className="font-mono font-medium">{s.seller_id}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{s.lines.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{s.avg_rating.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono font-medium tabular-nums">{formatINR(s.revenue, 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
