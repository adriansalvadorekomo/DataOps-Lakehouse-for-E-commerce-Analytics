import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type ChurnRisk } from "@/lib/api";
import { date, inr, int, pct, segmentLabel } from "@/lib/format";
import { ChartFrame, ChartTooltip } from "@/components/data/ChartFrame";
import { DataTable } from "@/components/data/DataTable";
import { DotBar, DotMatrix } from "@/components/data/DotMatrix";
import { KpiInfo } from "@/components/data/KpiInfo";
import { PageHeader, SectionTitle } from "@/components/data/PageHeader";
import { ErrorState, Skeleton } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

type AtRisk = ChurnRisk["top_at_risk"][number];

const SEG_TONE = { active: "good", cooling: "warn", at_risk: "signal", one_time: "ink" } as const;
const SEG_NOTE = {
  active: "Buying at their usual rhythm",
  cooling: "Quiet for longer than their usual gap",
  at_risk: "Quiet for more than twice their usual gap",
  one_time: "One order so far: no rhythm to measure yet",
};

export function Customers() {
  const scope = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const pareto = useQuery({ queryKey: ["pareto"], queryFn: api.pareto });
  const churn = useQuery({ queryKey: ["churn"], queryFn: () => api.churn(50) });
  useReveal(scope, [pareto.isSuccess, churn.isSuccess]);

  const curve = [{ customers_pct: 0, revenue_share: 0 }, ...(pareto.data?.points ?? [])];
  const cols: ColumnDef<AtRisk, unknown>[] = [
    { accessorKey: "customer_id", header: "Customer", cell: (c) => <span className="code font-medium">{c.getValue() as string}</span> },
    { accessorKey: "revenue", header: "Lifetime revenue", meta: { numeric: true }, cell: (c) => inr(c.getValue() as number) },
    { accessorKey: "orders", header: "Orders", meta: { numeric: true } },
    { accessorKey: "avg_gap_days", header: "Usual gap", meta: { numeric: true }, cell: (c) => `${c.getValue()} d` },
    { accessorKey: "days_since", header: "Quiet for", meta: { numeric: true }, cell: (c) => <span className="font-semibold text-signal-ink">{int(c.getValue() as number)} d</span> },
    { accessorKey: "last_order", header: "Last order", meta: { numeric: true }, cell: (c) => date(c.getValue() as string) },
  ];

  return (
    <div ref={scope}>
      <PageHeader
        kicker="Commercial · customers"
        title="Who carries revenue, and who is drifting away?"
        question="How concentrated revenue is, and which repeat customers have stopped buying at their usual rhythm."
        decision="Who to retain first, and how much a win-back campaign is worth."
        asOf={churn.data?.as_of}
      />
      {(pareto.isError || churn.isError) && <ErrorState error={pareto.error ?? churn.error} />}

      <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <section className="panel reveal flex flex-col justify-between gap-6 p-6">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Revenue from the top 20% of customers</span>
            <KpiInfo id="K9" />
          </div>
          {pareto.data ? <DotMatrix value={pct(pareto.data.top20_share, 1)} dot={8} gap={3} /> : <Skeleton className="h-[74px]" />}
          <p className="text-[14px] leading-relaxed text-ink-2">
            {pareto.data
              ? `${int(Math.round(pareto.data.customers * 0.2))} of ${int(pareto.data.customers)} customers bring ${pct(pareto.data.top20_share)} of revenue — not the textbook 80/20, but losing a top-decile customer still costs far more than an average one.`
              : "Ranking customers by lifetime revenue…"}
          </p>
        </section>
        <ChartFrame
          title="Concentration curve"
          question="Cumulative share of revenue as you add customers, best first."
          kpiId="K9"
          table={{ columns: ["Top customers", "Cumulative revenue share"], rows: (pareto.data?.points ?? []).map((p) => [`${p.customers_pct}%`, pct(p.revenue_share)]) }}
        >
          {pareto.isLoading ? <Skeleton className="h-[260px]" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={curve} margin={{ left: 8, right: 16, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="customers_pct" type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} tickLine={false} axisLine={false} width={44} />
                <ReferenceLine x={20} stroke="var(--signal)" strokeDasharray="3 3" />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 1 }]} stroke="var(--line-strong)" strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip format={(n) => pct(n)} labelFormat={(l) => `Top ${l}% of customers`} />} />
                <Line type="monotone" dataKey="revenue_share" name="Revenue share" stroke="var(--ink)" strokeWidth={2.2} dot={{ r: 3, fill: "var(--ink)" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>

      <SectionTitle id="at-risk" title="Customer rhythm" note="A repeat customer is 'at risk' when they have been quiet for more than twice their usual time between orders, and 'cooling' when they are past their usual time." right={<KpiInfo id="K11" />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {churn.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px]" />)}
        {churn.data?.segments.map((s) => (
          <div key={s.segment} className="panel reveal flex flex-col gap-3 p-5">
            <div className="text-[13px] font-medium text-ink-2">{segmentLabel(s.segment)}</div>
            <div className="num text-[26px] font-semibold leading-none">{int(s.customers)}</div>
            <DotBar value={s.revenue_share} dots={22} tone={SEG_TONE[s.segment] === "ink" ? "ink" : SEG_TONE[s.segment]} />
            <div className="text-[12.5px] text-ink-3">{pct(s.revenue_share)} of lifetime revenue · {SEG_NOTE[s.segment]}</div>
          </div>
        ))}
      </div>
      <section className="panel reveal p-5">
        <h3 className="mb-1 font-sans text-[15px] font-semibold">At risk, highest lifetime value first</h3>
        <p className="mb-4 text-[13px] text-ink-3">The win-back list. Click a customer for their history.</p>
        {churn.data ? (
          <DataTable data={churn.data.top_at_risk} columns={cols} initialSort={[{ id: "revenue", desc: true }]}
            onRowClick={(r) => navigate(`/customers/${r.customer_id}`)} />
        ) : <Skeleton className="h-[300px]" />}
      </section>
    </div>
  );
}
