import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api, type OrderCreate } from "@/lib/api";
import { inr } from "@/lib/format";

const CITIES = ["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad"];
const PAYMENTS = ["UPI", "Credit Card", "Debit Card", "Cash on Delivery"];
const DEVICES = ["Mobile App", "Web", "Tablet"];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px]">
      <span className="font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}
const input = "rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none transition-colors focus:border-ink";

/** Book a single order (the API checks stock, the price invariant and the FK graph). */
export function BookOrder() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({
    customer_id: "", product_id: "", seller_id: "", unit_price: "", discount_pct: "0", quantity: "1",
    ship_to_city: "Delhi", payment_method: "UPI", device: "Mobile App", shipping_time_days: "3",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const total = Number(f.unit_price || 0) * Number(f.quantity || 0) * (1 - Number(f.discount_pct || 0) / 100);

  const m = useMutation({
    mutationFn: () => {
      const payload: OrderCreate = {
        customer_id: f.customer_id.trim(), order_date: new Date().toISOString().slice(0, 10),
        ship_to_city: f.ship_to_city, payment_method: f.payment_method, device: f.device,
        shipping_time_days: Number(f.shipping_time_days),
        items: [{ product_id: f.product_id.trim(), seller_id: f.seller_id.trim(), quantity: Number(f.quantity),
          unit_price: Number(f.unit_price), discount_pct: Number(f.discount_pct) }],
      };
      return api.createOrder(payload);
    },
    onSuccess: (o) => {
      toast.success(`Order #${o.order_id} booked`, { description: "Stock decremented; the brief will include it on the next load." });
      qc.invalidateQueries();
      setOpen(false);
      navigate(`/orders/${o.order_id}`);
    },
    onError: (e: Error) => toast.error("The order was not booked", { description: e.message }),
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90">
        <Plus className="size-4" /> Book an order
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(460px,100vw)] flex-col border-l border-line bg-panel">
          <div className="flex items-start justify-between border-b border-line p-6">
            <div>
              <Dialog.Title className="font-serif text-[22px] font-semibold">Book an order</Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-ink-3">
                Dated today. Orders for unknown customers, products or sellers are refused, and so are orders larger than the stock.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-ink-3 hover:text-ink" aria-label="Close"><X className="size-4" /></Dialog.Close>
          </div>
          <form className="flex flex-1 flex-col gap-4 overflow-y-auto p-6" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            <Field label="Customer ID" hint="e.g. U356787 (⌘K finds ids)"><input required className={input} value={f.customer_id} onChange={set("customer_id")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Product ID"><input required className={input} value={f.product_id} onChange={set("product_id")} /></Field>
              <Field label="Seller ID"><input required className={input} value={f.seller_id} onChange={set("seller_id")} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Unit price ₹"><input required type="number" min="0.01" step="0.01" className={input} value={f.unit_price} onChange={set("unit_price")} /></Field>
              <Field label="Discount %"><input required type="number" min="0" max="70" step="0.01" className={input} value={f.discount_pct} onChange={set("discount_pct")} /></Field>
              <Field label="Quantity"><input required type="number" min="1" className={input} value={f.quantity} onChange={set("quantity")} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ship to"><select className={input} value={f.ship_to_city} onChange={set("ship_to_city")}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Promised days"><select className={input} value={f.shipping_time_days} onChange={set("shipping_time_days")}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d}>{d}</option>)}</select></Field>
              <Field label="Payment"><select className={input} value={f.payment_method} onChange={set("payment_method")}>{PAYMENTS.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Device"><select className={input} value={f.device} onChange={set("device")}>{DEVICES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            </div>
            <div className="mt-auto rounded-lg border border-line bg-sunken p-4">
              <div className="flex justify-between text-[13px] text-ink-3"><span>Customer pays</span><span>price × quantity, minus the discount</span></div>
              <div className="num mt-1 text-[24px] font-semibold">{inr(total, { compact: false, digits: 2 })}</div>
              {Number(f.discount_pct) > 35 && <div className="mt-1 text-[12.5px] text-warn">Above 35% off, this sale is below the estimated cost.</div>}
            </div>
            <button disabled={m.isPending} className="rounded-lg bg-ink py-2.5 text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50">
              {m.isPending ? "Booking…" : "Book order"}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
