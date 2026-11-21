import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { date, inr, int, pct } from "@/lib/format";
import { BackLink, Fact, MonthlyChart, RecentOrders } from "@/components/data/EntityParts";
import { DotBar } from "@/components/data/DotMatrix";
import { PageHeader } from "@/components/data/PageHeader";
import { ErrorState, PageLoading } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

export function SellerDetail() {
  const { id = "" } = useParams();
  const scope = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["seller", id], queryFn: () => api.seller(id) });
  const peers = useQuery({ queryKey: ["sellers", 365], queryFn: () => api.sellers(365, 1) });
  useReveal(scope, [q.isSuccess]);
  if (q.isLoading) return <PageLoading />;
  if (q.isError || !q.data) return <><BackLink to="/sellers" label="Sellers" /><ErrorState error={q.error} title={`Seller ${id} could not load`} /></>;
  const s = q.data;
  const p = peers.data?.peers;
  const late = p && s.lifetime.delayed_rate > p.delayed_p90;
  const ret = p && s.lifetime.return_rate > p.return_p90;
  const total = s.categories.reduce((a, b) => a + b.revenue, 0) || 1;
  return (
    <div ref={scope}>
      <BackLink to="/sellers" label="Sellers" />
      <PageHeader
        kicker={`Seller · rated ${s.current_rating.toFixed(1)} / 5`}
        title={s.seller_id}
        question={`Selling since ${date(s.lifetime.first_order)}; last order ${date(s.lifetime.last_order)}.${late ? " Delivers late more often than 90% of peers over the last year." : ""}${ret ? " Gets more returns than 90% of peers." : ""}`}
        decision="Grow, coach or put on a performance plan."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Fact label="Lifetime revenue" value={inr(s.lifetime.revenue)} />
        <Fact label="Orders" value={int(s.lifetime.orders)} />
        <Fact label="Average order value" value={inr(s.lifetime.aov, { compact: false })} />
        <Fact label={`Late deliveries${p ? ` (peer p90 ${pct(p.delayed_p90)})` : ""}`} value={pct(s.lifetime.delayed_rate)} tone={late ? "signal" : undefined} />
        <Fact label={`Returns${p ? ` (peer p90 ${pct(p.return_p90)})` : ""}`} value={pct(s.lifetime.return_rate)} tone={ret ? "signal" : undefined} />
      </div>
      <div className="mb-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <MonthlyChart data={s.monthly} />
        <section className="panel reveal p-5">
          <h3 className="mb-4 font-sans text-[15px] font-semibold">Category mix</h3>
          <ul className="space-y-3">
            {s.categories.map((x) => (
              <li key={x.category} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="w-24 font-medium">{x.category}</span>
                <DotBar value={x.revenue / total} dots={14} />
                <span className="num w-20 text-right text-ink-2">{inr(x.revenue)}</span>
              </li>
            ))}
          </ul>
          <h3 className="mb-3 mt-6 font-sans text-[15px] font-semibold">Top products</h3>
          <ul className="space-y-2 text-[13.5px]">
            {s.top_products.map((t) => (
              <li key={t.product_id} className="flex justify-between gap-3">
                <Link to={`/products/${t.product_id}`} className="code link-underline">{t.product_id}</Link>
                <span className="text-ink-3">{t.brand} · {t.category}</span>
                <span className="num">{inr(t.revenue)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <RecentOrders rows={s.recent_orders} hide={["seller"]} />
    </div>
  );
}
