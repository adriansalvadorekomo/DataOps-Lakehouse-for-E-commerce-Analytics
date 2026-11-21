import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { MonthPoint, RecentOrder } from "@/lib/api";
import { date, inr, month, pct } from "@/lib/format";
import { ChartFrame, ChartTooltip } from "./ChartFrame";
import { StatusBadge } from "./Badges";

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink">
      <ArrowLeft className="size-3.5" /> {label}
    </Link>
  );
}

export function MonthlyChart({ data, title = "Revenue by month" }: { data: MonthPoint[]; title?: string }) {
  return (
    <ChartFrame
      title={title}
      question="Last 12 months with orders."
      table={{ columns: ["Month", "Revenue", "Orders"], rows: data.map((r) => [month(r.month), inr(r.revenue), r.orders]) }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={month} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickFormatter={(n) => inr(n, { digits: 0 })} tickLine={false} axisLine={false} width={68} />
          <Tooltip content={<ChartTooltip format={(n) => inr(n)} labelFormat={month} />} />
          <Bar dataKey="revenue" name="Revenue" fill="var(--ink-2)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function RecentOrders({ rows, hide }: { rows: RecentOrder[]; hide?: ("customer" | "seller" | "product")[] }) {
  const navigate = useNavigate();
  const show = (k: "customer" | "seller" | "product") => !hide?.includes(k);
  return (
    <section className="panel reveal p-5">
      <h3 className="mb-3 font-sans text-[15px] font-semibold">Recent orders</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <thead><tr className="border-b border-line">
            <th className="label py-2 text-left">Order</th><th className="label py-2 text-left">Date</th>
            {show("customer") && <th className="label py-2 text-left">Customer</th>}
            {show("product") && <th className="label py-2 text-left">Product</th>}
            {show("seller") && <th className="label py-2 text-left">Seller</th>}
            <th className="label py-2 text-left">Status</th><th className="label py-2 text-right">Discount</th><th className="label py-2 text-right">Paid</th>
          </tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.order_id} onClick={() => navigate(`/orders/${o.order_id}`)} className="cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-panel-2">
                <td className="code py-2.5">#{o.order_id}</td>
                <td className="num py-2.5 text-ink-2">{date(o.order_date)}</td>
                {show("customer") && <td className="code py-2.5">{o.customer_id}</td>}
                {show("product") && <td className="code py-2.5">{o.product_id}</td>}
                {show("seller") && <td className="code py-2.5">{o.seller_id}</td>}
                <td className="py-2.5"><StatusBadge status={o.delivery_status} /></td>
                <td className="num py-2.5 text-right">{pct(o.discount_pct / 100, 0)}</td>
                <td className="num py-2.5 text-right">{inr(o.final_price, { compact: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "signal" | "good" | "warn" }) {
  const cls = tone === "signal" ? "text-signal-ink" : tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="panel reveal p-4">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className={`num mt-1.5 text-[20px] font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
