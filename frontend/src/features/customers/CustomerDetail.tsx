import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { date, inr, int, pct, segmentLabel } from "@/lib/format";
import { BackLink, Fact, RecentOrders } from "@/components/data/EntityParts";
import { DotBar } from "@/components/data/DotMatrix";
import { PageHeader } from "@/components/data/PageHeader";
import { ErrorState, PageLoading } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

export function CustomerDetail() {
  const { id = "" } = useParams();
  const scope = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["customer", id], queryFn: () => api.customer(id) });
  useReveal(scope, [q.isSuccess]);
  if (q.isLoading) return <PageLoading />;
  if (q.isError || !q.data) return <><BackLink to="/customers" label="Customers" /><ErrorState error={q.error} title={`Customer ${id} could not load`} /></>;
  const c = q.data;
  const total = c.categories.reduce((a, b) => a + b.revenue, 0) || 1;
  const tone = c.segment === "at_risk" ? "signal" : c.segment === "cooling" ? "warn" : c.segment === "active" ? "good" : undefined;
  return (
    <div ref={scope}>
      <BackLink to="/customers" label="Customers" />
      <PageHeader
        kicker={`Customer · ${c.home_city}`}
        title={c.customer_id}
        question={`Customer since ${date(c.first_purchase_date)}. ${c.segment === "at_risk" ? "Quiet for more than twice their usual gap: a win-back candidate." : c.segment === "cooling" ? "Quieter than usual." : c.segment === "active" ? "Buying at their usual rhythm." : "One order so far."}`}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Fact label="Status" value={segmentLabel(c.segment)} tone={tone} />
        <Fact label="Lifetime revenue" value={inr(c.lifetime.revenue)} />
        <Fact label="Orders" value={int(c.lifetime.orders)} />
        <Fact label="Usual gap between orders" value={c.avg_gap_days !== null ? `${c.avg_gap_days} days` : "—"} />
        <Fact label="Days since last order" value={c.days_since_last_order !== null ? int(c.days_since_last_order) : "—"} tone={tone} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <section className="panel reveal p-5">
          <h3 className="mb-4 font-sans text-[15px] font-semibold">What they buy</h3>
          <ul className="space-y-3">
            {c.categories.map((x) => (
              <li key={x.category} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="w-24 font-medium">{x.category}</span>
                <DotBar value={x.revenue / total} dots={16} />
                <span className="num w-20 text-right text-ink-2">{inr(x.revenue)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px] text-ink-3">Returns: {pct(c.lifetime.return_rate)} of their orders.</p>
        </section>
        <RecentOrders rows={c.recent_orders} hide={["customer"]} />
      </div>
    </div>
  );
}
