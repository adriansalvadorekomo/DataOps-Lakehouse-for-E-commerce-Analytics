import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError, api, formatINR, type OrderItemCreate } from "@/lib/api";
import { CITIES, DEVICES, PAYMENT_METHODS, estimatedLineTotal } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, PageHeader } from "@/components/PageHeader";

const EMPTY_LINE: OrderItemCreate = {
  product_id: "",
  seller_id: "",
  quantity: 1,
  unit_price: 0,
  discount_pct: 0,
};

export default function CreateOrder() {
  const nav = useNavigate();
  const [customerId, setCustomerId] = useState("");
  const [city, setCity] = useState<(typeof CITIES)[number]>(CITIES[0]);
  const [payment, setPayment] = useState<(typeof PAYMENT_METHODS)[number]>(PAYMENT_METHODS[0]);
  const [device, setDevice] = useState<(typeof DEVICES)[number]>("Web");
  const [shipDays, setShipDays] = useState(2);
  const [lines, setLines] = useState<OrderItemCreate[]>([{ ...EMPTY_LINE }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setLine(i: number, patch: Partial<OrderItemCreate>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  const estimate = lines.reduce(
    (s, l) => s + estimatedLineTotal(Number(l.unit_price) || 0, Number(l.quantity) || 0, Number(l.discount_pct) || 0),
    0,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const order = await api.createOrder({
        customer_id: customerId.trim(),
        order_date: new Date().toISOString().slice(0, 10),
        ship_to_city: city,
        payment_method: payment,
        device,
        shipping_time_days: shipDays,
        items: lines.map((l) => ({
          ...l,
          product_id: l.product_id.trim(),
          seller_id: l.seller_id.trim(),
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          discount_pct: Number(l.discount_pct),
        })),
      });
      nav(`/orders/${order.order_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not book the order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/orders" className="inline-flex items-center gap-1 text-[15px] hover:underline">
        <ArrowLeft size={16} /> Orders
      </Link>
      <PageHeader
        title="Book order"
        question="Totals are calculated on the server. The estimate below is a preview only."
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Customer ID" htmlFor="customer">
                <Input id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required autoComplete="off" />
              </Field>
              <Field label="Ship to city" htmlFor="city">
                <Select id="city" value={city} onChange={(e) => setCity(e.target.value as (typeof CITIES)[number])}>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Payment" htmlFor="payment">
                <Select id="payment" value={payment} onChange={(e) => setPayment(e.target.value as (typeof PAYMENT_METHODS)[number])}>
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Device" htmlFor="device">
                <Select id="device" value={device} onChange={(e) => setDevice(e.target.value as (typeof DEVICES)[number])}>
                  {DEVICES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Shipping time (days)" htmlFor="ship">
                <Input
                  id="ship"
                  type="number"
                  min={1}
                  max={6}
                  value={shipDays}
                  onChange={(e) => setShipDays(Number(e.target.value))}
                  required
                />
              </Field>
            </div>

            <div className="space-y-3">
              <p className="text-[13px] font-medium text-muted-foreground">Lines</p>
              {lines.map((l, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-5">
                  <Field label={i === 0 ? "Product" : ""} htmlFor={`p-${i}`}>
                    <Input id={`p-${i}`} value={l.product_id} onChange={(e) => setLine(i, { product_id: e.target.value })} required />
                  </Field>
                  <Field label={i === 0 ? "Seller" : ""} htmlFor={`s-${i}`}>
                    <Input id={`s-${i}`} value={l.seller_id} onChange={(e) => setLine(i, { seller_id: e.target.value })} required />
                  </Field>
                  <Field label={i === 0 ? "Quantity" : ""} htmlFor={`q-${i}`}>
                    <Input id={`q-${i}`} type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} required />
                  </Field>
                  <Field label={i === 0 ? "Unit price ₹" : ""} htmlFor={`u-${i}`}>
                    <Input id={`u-${i}`} type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} required />
                  </Field>
                  <Field label={i === 0 ? "Discount %" : ""} htmlFor={`d-${i}`}>
                    <Input id={`d-${i}`} type="number" min={0} max={70} step="0.01" value={l.discount_pct} onChange={(e) => setLine(i, { discount_pct: Number(e.target.value) })} />
                  </Field>
                </div>
              ))}
            </div>

            <p className="font-mono text-[15px] tabular-nums">
              Estimate {formatINR(estimate)} <span className="font-sans text-muted-foreground">· server confirms on book</span>
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}>
                Add line
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Booking…" : "Book order"}
              </Button>
            </div>
            {error && <p className="text-[15px] text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
