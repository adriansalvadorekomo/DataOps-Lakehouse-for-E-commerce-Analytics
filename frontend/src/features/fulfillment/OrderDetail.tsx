import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type DeliveryStatus } from "@/lib/api";
import { date, inr, pct, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BackLink, Fact } from "@/components/data/EntityParts";
import { StatusBadge } from "@/components/data/Badges";
import { PageHeader } from "@/components/data/PageHeader";
import { ErrorState, PageLoading } from "@/components/data/States";

const OUTCOMES: { s: DeliveryStatus; hint: string }[] = [
  { s: "DELIVERED", hint: "Arrived within the promise" },
  { s: "DELAYED", hint: "Arrived, but late" },
  { s: "RETURNED", hint: "Sent back; full refund" },
];

export function OrderDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api.order(Number(id)) });
  const m = useMutation({
    mutationFn: (s: DeliveryStatus) => api.transition(Number(id), s),
    onSuccess: (o) => {
      toast.success(`Order #${o.order_id} is now ${statusLabel(o.delivery_status).toLowerCase()}`, { description: "Final state: it can no longer change. Logged in the audit trail." });
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error("Status not changed", { description: e.message }),
  });
  if (q.isLoading) return <PageLoading />;
  if (q.isError || !q.data) return <><BackLink to="/fulfillment" label="Fulfillment" /><ErrorState error={q.error} title={`Order #${id} could not load`} /></>;
  const o = q.data;
  const open = o.delivery_status === "IN TRANSIT";
  const paid = o.items.reduce((s, i) => s + i.final_price, 0);
  return (
    <div>
      <BackLink to="/fulfillment" label="Fulfillment" />
      <PageHeader
        kicker={`Order · ${date(o.order_date)}`}
        title={`#${o.order_id}`}
        question={open ? `In transit to ${o.ship_to_city}, promised in ${o.shipping_time_days} days.` : `${statusLabel(o.delivery_status)}. This is a final state.`}
        actions={<StatusBadge status={o.delivery_status} />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Customer" value={<Link to={`/customers/${o.customer_id}`} className="code link-underline">{o.customer_id}</Link>} />
        <Fact label="Paid" value={inr(paid, { compact: false, digits: 2 })} />
        <Fact label="Payment · device" value={<span className="text-[15px]">{o.payment_method} · {o.device}</span>} />
        <Fact label="Promised delivery" value={`${o.shipping_time_days} days`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="panel p-5">
          <h3 className="mb-3 font-sans text-[15px] font-semibold">Lines</h3>
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line">
              <th className="label py-2 text-left">Product</th><th className="label py-2 text-left">Seller</th>
              <th className="label py-2 text-right">Qty</th><th className="label py-2 text-right">Unit price</th>
              <th className="label py-2 text-right">Discount</th><th className="label py-2 text-right">Paid</th>
            </tr></thead>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.order_item_id} className="border-b border-line/70 last:border-0">
                  <td className="py-3"><Link to={`/products/${i.product_id}`} className="code link-underline">{i.product_id}</Link></td>
                  <td className="py-3"><Link to={`/sellers/${i.seller_id}`} className="code link-underline">{i.seller_id}</Link></td>
                  <td className="num py-3 text-right">{i.quantity}</td>
                  <td className="num py-3 text-right">{inr(i.unit_price, { compact: false, digits: 2 })}</td>
                  <td className="num py-3 text-right">{pct(i.discount_pct / 100, 0)}</td>
                  <td className="num py-3 text-right font-semibold">{inr(i.final_price, { compact: false, digits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel p-5">
          <h3 className="font-sans text-[15px] font-semibold">Close the shipment</h3>
          <p className="mb-4 mt-1 text-[13px] text-ink-3">
            {open ? "Pick how it ended. Each outcome is final and written to the audit log." : "Terminal states are immutable (business-model lifecycle)."}
          </p>
          <div className="flex flex-col gap-2">
            {OUTCOMES.map(({ s, hint }) => (
              <button key={s} disabled={!open || m.isPending} onClick={() => m.mutate(s)}
                className={cn("flex items-center justify-between rounded-lg border border-line px-4 py-3 text-left transition-colors",
                  open ? "hover:border-ink hover:bg-panel-2" : "cursor-not-allowed opacity-45",
                  o.delivery_status === s && "border-ink opacity-100")}>
                <span><span className="block text-[14px] font-medium">{statusLabel(s)}</span><span className="text-[12.5px] text-ink-3">{hint}</span></span>
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
