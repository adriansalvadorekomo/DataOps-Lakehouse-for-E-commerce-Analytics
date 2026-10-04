import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatINR } from "@/lib/api";
import { Metric } from "@/components/Metric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/Disclosure";
import { TrustStatus } from "@/components/TrustStatus";
import { ChartSkeleton, EmptyState, PageHeader, StackError } from "@/components/PageHeader";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function formatDate(date: string | null | undefined): string {
  return date ? dateFormatter.format(new Date(`${date}T00:00:00`)) : "date unavailable";
}

function monthTick(date: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${date}T00:00:00`));
}

export default function Forecast() {
  const forecast = useQuery({ queryKey: ["forecast", 90], queryFn: () => api.forecast(90), staleTime: 60_000 });
  const trust = useQuery({ queryKey: ["trust-status"], queryFn: api.trustStatus, staleTime: 60_000 });

  const rfRows = forecast.data?.forecasts.rf ?? [];
  const prophetRows = forecast.data?.forecasts.prophet ?? [];
  const actualRows = forecast.data?.actuals ?? [];
  const rfByDate = new Map(rfRows.map((row) => [row.date, row.yhat]));
  const prophetByDate = new Map(prophetRows.map((row) => [row.date, row.yhat]));
  const futureDates = [...new Set([...rfByDate.keys(), ...prophetByDate.keys()])].sort();
  const chartRows = [
    ...actualRows.map((row) => ({ date: row.date, revenue: row.revenue })),
    ...futureDates.map((date) => ({
      date,
      revenue: null as number | null,
      statistical: rfByDate.get(date) ?? null,
      trendOutlook: prophetByDate.get(date) ?? null,
    })),
  ];
  const expectedRf = rfRows.reduce((sum, row) => sum + row.yhat, 0);
  const horizon = futureDates.length;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Batch outlook, not live output"
        title="Forecast"
        question="What revenue does the stored batch outlook expect, and how fresh is it?"
        caption={forecast.data?.asof ? `Outlook as of ${formatDate(forecast.data.asof)}.` : undefined}
      />

      {forecast.isError ? (
        <StackError message="Couldn't load the batch outlook." retry={() => forecast.refetch()} />
      ) : forecast.isLoading ? (
        <ChartSkeleton />
      ) : chartRows.length === 0 ? (
        <EmptyState title="No outlook yet" body="Actuals and outlook rows appear once the forecast batch has run." />
      ) : (
        <>
          <section aria-label="Outlook summary">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              <Metric
                label="Expected revenue · outlook window"
                value={rfRows.length > 0 ? formatINR(expectedRf, 0) : "—"}
                scope={horizon > 0 ? `${horizon} outlook days` : "No outlook days"}
                interpretation="Sum of the statistical outlook points — a planning figure, not booked revenue."
              />
              <Metric
                label="Outlook freshness"
                value={forecast.data?.asof ? formatDate(forecast.data.asof) : "—"}
                scope="Batch date"
                interpretation={trust.data ? trust.data.forecast.summary : "Freshness is confirmed against the trust evidence."}
              />
            </div>
          </section>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
              <CardTitle>Actual revenue into batch outlook</CardTitle>
              {forecast.data?.asof && (
                <span className="evidence text-[13px] text-muted-foreground">Split at {formatDate(forecast.data.asof)}</span>
              )}
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.8} />
                  <XAxis dataKey="date" tickFormatter={monthTick} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} minTickGap={48} />
                  <YAxis tickFormatter={(value: number) => `₹${Math.round(value / 1e6)}M`} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    formatter={(value, name) => [formatINR(Number(value)), name === "revenue" ? "Actual revenue" : name === "statistical" ? "Statistical outlook" : "Trend outlook"]}
                    labelFormatter={(date) => formatDate(String(date))}
                  />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  {futureDates.length > 0 && (
                    <ReferenceArea x1={futureDates[0]} x2={futureDates[futureDates.length - 1]} fill="var(--chart-2)" fillOpacity={0.06} label={false} />
                  )}
                  {forecast.data?.asof && (
                    <ReferenceLine x={forecast.data.asof} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Outlook starts", fontSize: 12, fill: "var(--muted-foreground)", position: "insideTopLeft" }} />
                  )}
                  <Area type="monotone" dataKey="revenue" name="Actual revenue" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.12} connectNulls={false} />
                  <Line type="monotone" dataKey="statistical" name="Statistical outlook" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="7 4" dot={false} connectNulls />
                  <Line type="monotone" dataKey="trendOutlook" name="Trend outlook" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="2 3" dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <p className="text-[13px] text-muted-foreground">
            Solid region is recorded revenue; the tinted region with dashed lines is the batch outlook. Dashed:
            Statistical outlook. Dotted: Trend outlook.
          </p>

          <section aria-labelledby="assumptions-heading" className="space-y-3">
            <h2 id="assumptions-heading" className="font-serif text-xl">Assumptions</h2>
            <Disclosure summary="How this outlook was produced">
              <ul className="ml-5 list-disc space-y-1.5">
                <li>Two batch models (statistical and trend) project from a trailing window; they do not react to today&apos;s orders.</li>
                <li>The outlook refreshes when the forecast job runs — check freshness above before planning against it.</li>
                <li>Returns and refunds settle separately; the outlook projects gross marketplace revenue.</li>
              </ul>
            </Disclosure>
            {trust.data && (
              <TrustStatus status={trust.data.forecast.status} label={trust.data.forecast.label} summary={trust.data.forecast.summary} variant="full" />
            )}
            <p className="text-[15px]">
              <Link to="/performance" className="text-link font-medium hover:underline">Compare with actual performance</Link>
            </p>
          </section>
        </>
      )}

      <Disclosure summary="Where does this outlook come from?">
        <ol className="ml-5 list-decimal space-y-1.5">
          <li>
            This page reads <span className="evidence">GET /stats/forecast</span>, served from the{" "}
            <span className="evidence">revenue_forecasts</span> batch table — not a live computation.
          </li>
          <li>A scheduled job fits two models over trailing actual revenue and stores one row per model per target date.</li>
          <li>Actuals are committed marketplace records, the same book behind every other dashboard.</li>
        </ol>
        <p className="mt-3">
          <Link to="/pipeline" className="text-link font-medium hover:underline">
            Open the trust center
          </Link>
        </p>
      </Disclosure>
    </div>
  );
}
