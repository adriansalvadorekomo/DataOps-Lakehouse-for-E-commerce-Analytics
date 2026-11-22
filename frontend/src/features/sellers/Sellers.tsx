import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { api, type SellerRow } from "@/lib/api";
import { inr, int, pct } from "@/lib/format";
import { usePeriod, useParam } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ChartFrame, ChartLegend } from "@/components/data/ChartFrame";
import { DataTable } from "@/components/data/DataTable";
import { KpiInfo } from "@/components/data/KpiInfo";
import { Tag } from "@/components/data/Badges";
import { PageHeader, SectionTitle } from "@/components/data/PageHeader";
import { ErrorState, Skeleton } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

const FILTERS = [
  { id: "", label: "All sellers" },
  { id: "late_deliveries", label: "Late deliveries" },
  { id: "returns", label: "High returns" },
];

function QuadrantTip({ active, payload }: { active?: boolean; payload?: { payload: SellerRow }[] }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="panel px-3 py-2 text-[12.5px] shadow-lg">
      <div className="code mb-1 font-semibold">{s.seller_id}</div>
      <div className="num text-ink-2">Revenue {inr(s.revenue)} · {int(s.orders)} orders</div>
      <div className="num text-ink-2">Late {pct(s.delayed_rate)} · Returns {pct(s.return_rate)}</div>
    </div>
  );
}

export function Sellers() {
  const [days] = usePeriod();
  const [flag, setFlag] = useParam("flag");
  const scope = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["sellers", days], queryFn: () => api.sellers(days, 2000) });
  useReveal(scope, [q.isSuccess]);

  const card = q.data;
  const rows = useMemo(
    () => (card?.sellers ?? []).filter((s) => !flag || s.flags.includes(flag as SellerRow["flags"][number])),
    [card, flag],
  );
  const eligible = (card?.sellers ?? []).filter((s) => s.eligible);
  const flagged = (card?.sellers ?? []).filter((s) => s.flags.length);

  const cols: ColumnDef<SellerRow, unknown>[] = [
    { accessorKey: "seller_id", header: "Seller", cell: (c) => <span className="code font-medium">{c.getValue() as string}</span> },
    { accessorKey: "revenue", header: "Revenue", meta: { numeric: true }, cell: (c) => inr(c.getValue() as number) },
    { accessorKey: "revenue_share", header: "Share", meta: { numeric: true }, cell: (c) => pct(c.getValue() as number, 2) },
    { accessorKey: "orders", header: "Orders", meta: { numeric: true }, cell: (c) => int(c.getValue() as number) },
    { accessorKey: "avg_rating", header: "Rating", meta: { numeric: true }, cell: (c) => (c.getValue() as number).toFixed(2) },
    {
      accessorKey: "delayed_rate", header: "Late", meta: { numeric: true },
      cell: (c) => <span className={cn(c.row.original.flags.includes("late_deliveries") && "font-semibold text-signal-ink")}>{pct(c.getValue() as number)}</span>,
    },
    {
      accessorKey: "return_rate", header: "Returns", meta: { numeric: true },
      cell: (c) => <span className={cn(c.row.original.flags.includes("returns") && "font-semibold text-signal-ink")}>{pct(c.getValue() as number)}</span>,
    },
    {
      id: "flags", header: "Flags", enableSorting: false,
      cell: (c) => (
        <div className="flex gap-1">
          {c.row.original.flags.map((f) => <Tag key={f} tone="signal">{f === "late_deliveries" ? "Late" : "Returns"}</Tag>)}
          {!c.row.original.eligible && <Tag>too few orders</Tag>}
        </div>
      ),
    },
  ];

  return (
    <div ref={scope}>
      <PageHeader
        kicker="Operations · sellers"
        title="Which sellers drive revenue, and which hurt it?"
        question={`Every seller in the last ${days} days, measured against their peers — and only flagged when the difference is unlikely to be chance.`}
        decision="Who to grow, who to coach on delivery or listing quality, and in which order."
      />
      {q.isError && <ErrorState error={q.error} />}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { l: "Active sellers", v: card ? int(card.sellers_total) : "—" },
          { l: `With enough orders to compare (${card?.peers.min_orders ?? "—"}+)`, v: card ? int(card.peers.eligible_sellers) : "—" },
          { l: "A typical seller delivers late", v: card ? pct(card.peers.delayed_p50) : "—" },
          { l: "Flagged: far worse than their peers", v: card ? int(flagged.length) : "—", signal: true },
        ].map((k) => (
          <div key={k.l} className="panel reveal p-5">
            <div className="text-[13px] text-ink-3">{k.l}</div>
            <div className={cn("num mt-2 text-[20px] font-semibold", k.signal && flagged.length > 0 && "text-signal")}>{k.v}</div>
          </div>
        ))}
      </div>

      <ChartFrame
        className="mb-8"
        title="Delivery × returns, sellers with enough volume"
        question="Each dot is a seller, sized by revenue. The top-right corner — late often and returned often — is where to look first."
        kpiId="K7"
      >
        {card ? (
          <>
          <ChartLegend items={[
            { label: "Seller within the normal range", color: "var(--ink-3)", shape: "dot" },
            { label: "Flagged: far worse than their peers", color: "var(--signal)", shape: "dot" },
            { label: "Worse than 9 in 10 sellers beyond this line", color: "var(--signal)", shape: "dashed" },
          ]} />
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid />
              <XAxis type="number" dataKey="delayed_rate" name="Late deliveries" tickFormatter={(v) => pct(v, 0)} tickLine={false} axisLine={false}
                domain={["auto", "auto"]} label={{ value: "Late deliveries →", position: "insideBottomRight", offset: -4, fill: "var(--ink-3)", fontSize: 11 }} />
              <YAxis type="number" dataKey="return_rate" name="Returns" tickFormatter={(v) => pct(v, 0)} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
              <ZAxis type="number" dataKey="revenue" range={[16, 260]} />
              <ReferenceLine x={card.peers.delayed_p90} stroke="var(--signal)" strokeDasharray="4 4" />
              <ReferenceLine y={card.peers.return_p90} stroke="var(--signal)" strokeDasharray="4 4" />
              <Tooltip content={<QuadrantTip />} />
              <Scatter data={eligible.filter((s) => !s.flags.length)} fill="var(--ink-2)" fillOpacity={0.35} />
              <Scatter data={eligible.filter((s) => s.flags.length)} fill="var(--signal)" fillOpacity={0.9}
                onClick={(d: { payload?: SellerRow }) => d.payload && navigate(`/sellers/${d.payload.seller_id}`)} />
            </ScatterChart>
          </ResponsiveContainer>
          </>
        ) : <Skeleton className="h-[340px]" />}
      </ChartFrame>

      <SectionTitle
        title="Scorecard"
        note="A seller is flagged when they do worse than 9 in 10 of their peers and the gap is too large to be chance. Sellers with too few orders are shown but never flagged. Short windows hold few orders per seller: 90D or 1Y gives a sturdier read."
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <KpiInfo id="K7" />
            {FILTERS.map((f) => (
              <button key={f.id || "all"} onClick={() => setFlag(f.id)}
                className={cn("rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                  flag === f.id ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:text-ink")}>
                {f.label}
              </button>
            ))}
          </div>
        }
      />
      <section className="panel reveal p-5">
        {card ? (
          <DataTable data={rows} columns={cols} initialSort={[{ id: "revenue", desc: true }]} pageSize={15}
            onRowClick={(r) => navigate(`/sellers/${r.seller_id}`)} empty="No seller matches this filter." />
        ) : <Skeleton className="h-[420px]" />}
      </section>
    </div>
  );
}
