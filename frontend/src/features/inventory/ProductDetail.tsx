import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { date, inr, int, pct } from "@/lib/format";
import { ChartFrame, ChartTooltip } from "@/components/data/ChartFrame";
import { BackLink, Fact, MonthlyChart, RecentOrders } from "@/components/data/EntityParts";
import { PageHeader } from "@/components/data/PageHeader";
import { ErrorState, PageLoading } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

export function ProductDetail() {
  const { id = "" } = useParams();
  const scope = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id) });
  useReveal(scope, [q.isSuccess]);
  if (q.isLoading) return <PageLoading />;
  if (q.isError || !q.data) return <><BackLink to="/inventory" label="Inventory" /><ErrorState error={q.error} title={`Product ${id} could not load`} /></>;
  const p = q.data;
  const cover = p.days_of_cover;
  return (
    <div ref={scope}>
      <BackLink to="/inventory" label="Inventory" />
      <PageHeader
        kicker={`${p.category} · ${p.subcategory} · ${p.brand}`}
        title={p.product_id}
        question={`${inr(p.current_price, { compact: false })} · rated ${p.product_rating.toFixed(1)} from ${int(p.review_count)} reviews.${p.stock_critical ? " Stock-critical." : ""}`}
        decision="Reorder, keep, or delist."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Fact label="In stock" value={p.latest_stock === null ? "—" : int(p.latest_stock)} tone={p.stock_critical ? "signal" : undefined} />
        <Fact label="Sold, last 30 days" value={int(p.units_sold_30d)} />
        <Fact label="Days of cover" value={cover === null ? "no recent sales" : cover.toFixed(1)} tone={cover !== null && cover <= 14 ? "signal" : undefined} />
        <Fact label="Lifetime revenue" value={inr(p.lifetime.revenue)} />
        <Fact label="Return rate" value={pct(p.lifetime.return_rate)} />
      </div>
      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <ChartFrame title="Stock snapshots" question="Latest 24 snapshots; the dashed line is the stock-critical threshold (20)." kpiId="K8"
          table={{ columns: ["Date", "Stock"], rows: p.stock_history.map((s) => [date(s.date), s.stock]) }}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={p.stock_history} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => date(d).slice(0, 6)} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ReferenceLine y={20} stroke="var(--signal)" strokeDasharray="4 4" />
              <Tooltip content={<ChartTooltip format={int} labelFormat={(l) => date(l)} />} />
              <Line type="stepAfter" dataKey="stock" name="Stock" stroke="var(--ink)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
        <MonthlyChart data={p.monthly} />
      </div>
      <section className="panel reveal mb-6 p-5">
        <h3 className="mb-3 font-sans text-[15px] font-semibold">Sold by</h3>
        <div className="flex flex-wrap gap-2">
          {p.sellers.map((s) => (
            <Link key={s.seller_id} to={`/sellers/${s.seller_id}`} className="rounded-lg border border-line px-3 py-2 text-[13px] transition-colors hover:border-ink">
              <span className="code font-medium">{s.seller_id}</span> <span className="text-ink-3">· {int(s.lines)} sales · {inr(s.revenue)}</span>
            </Link>
          ))}
        </div>
      </section>
      <RecentOrders rows={p.recent_orders} hide={["product"]} />
    </div>
  );
}
