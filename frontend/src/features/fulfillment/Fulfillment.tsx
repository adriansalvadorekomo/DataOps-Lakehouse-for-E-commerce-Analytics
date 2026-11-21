import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type DeliveryStatus, type Order } from "@/lib/api";
import { date, inr, int, pct, statusLabel } from "@/lib/format";
import { usePeriod, useParam } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ChartFrame, ChartTooltip } from "@/components/data/ChartFrame";
import { DataTable } from "@/components/data/DataTable";
import { DotBar } from "@/components/data/DotMatrix";
import { KpiTile } from "@/components/data/KpiTile";
import { StatusBadge } from "@/components/data/Badges";
import { PageHeader, SectionTitle } from "@/components/data/PageHeader";
import { ErrorState, Skeleton } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";
import { BookOrder } from "./BookOrder";

const TONE = { "IN TRANSIT": "violet", DELIVERED: "good", DELAYED: "warn", RETURNED: "signal" } as const;
const STATUSES: ("" | DeliveryStatus)[] = ["", "IN TRANSIT", "DELIVERED", "DELAYED", "RETURNED"];

export function Fulfillment() {
  const [days] = usePeriod();
  const [status, setStatus] = useParam("status");
  const [page, setPage] = useState(0);
  const scope = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const funnel = useQuery({ queryKey: ["funnel", days], queryFn: () => api.funnel(days) });
  const ageing = useQuery({ queryKey: ["ageing"], queryFn: api.ageing });
  const cities = useQuery({ queryKey: ["cities", days], queryFn: () => api.cities(days) });
  const orders = useQuery({
    queryKey: ["orders", status, page],
    queryFn: () => api.orders({ delivery_status: status as DeliveryStatus | "", limit: 50, offset: page * 50 }),
  });
  useReveal(scope, [funnel.isSuccess]);

  const f = funnel.data;
  const a = ageing.data;
  const cols: ColumnDef<Order, unknown>[] = [
    { accessorKey: "order_id", header: "Order", cell: (c) => <span className="code">#{c.getValue() as number}</span> },
    { accessorKey: "order_date", header: "Date", cell: (c) => date(c.getValue() as string) },
    { accessorKey: "customer_id", header: "Customer", cell: (c) => <span className="code">{c.getValue() as string}</span> },
    { accessorKey: "ship_to_city", header: "City" },
    { accessorKey: "shipping_time_days", header: "Promised", meta: { numeric: true }, cell: (c) => `${c.getValue()} d` },
    { accessorKey: "delivery_status", header: "Status", cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { id: "paid", header: "Paid", meta: { numeric: true }, accessorFn: (o) => o.items.reduce((s, i) => s + i.final_price, 0), cell: (c) => inr(c.getValue() as number, { compact: false }) },
  ];

  return (
    <div ref={scope}>
      <PageHeader
        kicker="Operations · fulfillment"
        title="Are deliveries on time, and what is stuck?"
        question={`How orders from the last ${days} days ended, which shipments are past their promise, and the order book.`}
        decision="Which carriers and cities to escalate; which orders to close or chase."
        asOf={a?.as_of}
        actions={<BookOrder />}
      />
      {funnel.isError && <ErrorState error={funnel.error} />}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Late deliveries" kpiId="K4" value={f?.delayed_rate} format={(n) => pct(n)} tone={f && f.delayed_rate > 0.3 ? "signal" : undefined}
          note="of orders that reached the customer" />
        <KpiTile label="On time" value={f?.on_time_rate} format={(n) => pct(n)} note="delivered within the promise" />
        <KpiTile label="Return rate" kpiId="K3" value={f?.return_rate} format={(n) => pct(n)} />
        <KpiTile label="Past promise, still in transit" value={a?.recent_past_promise} format={int} tone="signal"
          note={a ? `of ${int(a.in_transit - a.stale_over_30d)} recent shipments` : undefined} />
      </div>

      <div className="mb-8 grid gap-4 xl:grid-cols-2">
        <section className="panel reveal p-5">
          <h3 className="font-sans text-[15px] font-semibold">How orders ended · last {days} days</h3>
          <p className="mb-5 mt-1 text-[13px] text-ink-3">IN TRANSIT → DELIVERED, DELAYED or RETURNED. The three outcomes are final.</p>
          {f ? (
            <ul className="space-y-4">
              {f.statuses.map((s) => (
                <li key={s.status} className="grid grid-cols-[120px_1fr_auto] items-center gap-4 text-[13.5px]">
                  <span className="font-medium">{statusLabel(s.status)}</span>
                  <DotBar value={s.share} dots={32} tone={TONE[s.status]} />
                  <span className="num w-28 text-right"><span className="font-semibold">{pct(s.share)}</span> <span className="text-ink-3">{int(s.orders)}</span></span>
                </li>
              ))}
            </ul>
          ) : <Skeleton className="h-[170px]" />}
        </section>
        <ChartFrame
          title="Still in transit, by age"
          question="Open shipments from the last 30 days, by days on the road; red is past the promised delivery time."
          table={a ? { columns: ["Age", "Orders", "Past promise"], rows: a.buckets.map((b) => [b.bucket, b.orders, b.past_promise]) } : undefined}
        >
          {a ? (
            <div id="ageing" className="scroll-mt-24">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={a.buckets.filter((b) => b.bucket !== "30+ days")} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(n) => int(n)} tickLine={false} axisLine={false} width={64} />
                  <Tooltip content={<ChartTooltip format={int} />} />
                  <Bar dataKey="orders" name="In transit" fill="var(--violet)" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="past_promise" name="Past promise" fill="var(--signal)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-2 text-[12.5px] text-ink-3">{int(a.stale_over_30d)} orders have been "in transit" for more than 30 days: a data-hygiene issue (hygiene rule H1), not a delivery delay.</p>
            </div>
          ) : <Skeleton className="h-[220px]" />}
        </ChartFrame>
      </div>

      <SectionTitle title="Cities" note="Late deliveries and returns by destination." />
      <section className="panel reveal mb-8 grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
        {cities.data?.map((c) => (
          <div key={c.city}>
            <div className="text-[13.5px] font-medium">{c.city}</div>
            <div className="num mt-1 text-[22px] font-semibold">{pct(c.delayed_rate)}</div>
            <div className="text-[12.5px] text-ink-3">late · {pct(c.return_rate)} returned · {int(c.orders)} orders</div>
          </div>
        )) ?? <Skeleton className="h-[80px] sm:col-span-5" />}
      </section>

      <SectionTitle
        title="Order book"
        note="Newest first. Open an order to move it through its lifecycle."
        right={
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button key={s || "all"} onClick={() => { setStatus(s); setPage(0); }}
                className={cn("rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                  status === s ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:text-ink")}>
                {s ? statusLabel(s) : "All"}
              </button>
            ))}
          </div>
        }
      />
      <section className="panel reveal p-5">
        {orders.isError && <ErrorState error={orders.error} />}
        {orders.data ? (
          <>
            <DataTable data={orders.data} columns={cols} pageSize={50} dense onRowClick={(o) => navigate(`/orders/${o.order_id}`)} />
            <div className="mt-3 flex justify-end gap-1 text-[12.5px] text-ink-3">
              <button className="rounded-md border border-line px-2.5 py-1 hover:text-ink disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Newer</button>
              <button className="rounded-md border border-line px-2.5 py-1 hover:text-ink disabled:opacity-40" disabled={orders.data.length < 50} onClick={() => setPage((p) => p + 1)}>Older</button>
            </div>
          </>
        ) : <Skeleton className="h-[400px]" />}
      </section>
    </div>
  );
}
