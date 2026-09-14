import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
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

function indiaLocalDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

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

  function validationError() {
    if (!customerId.trim()) return "Customer ID is required.";
    if (!Number.isInteger(shipDays) || shipDays < 1 || shipDays > 6) return "Shipping time must be a whole number from 1 to 6 days.";
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.product_id.trim()) return `Line ${i + 1}: Product is required.`;
      if (!line.seller_id.trim()) return `Line ${i + 1}: Seller is required.`;
      if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1) return `Line ${i + 1}: Quantity must be a whole number of at least 1.`;
      if (!Number.isFinite(Number(line.unit_price)) || Number(line.unit_price) < 0.01) return `Line ${i + 1}: Unit price must be at least ₹0.01.`;
      if (!Number.isFinite(Number(line.discount_pct)) || Number(line.discount_pct) < 0 || Number(line.discount_pct) > 70) return `Line ${i + 1}: Discount must be from 0% to 70%.`;
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validationError();
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const order = await api.createOrder({
        customer_id: customerId.trim(),
        order_date: indiaLocalDate(),
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
        question="Enter each sale unit price. The server computes and persists the final paid amount and inventory update; the estimate below is only a preview."
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-6" noValidate>
            <fieldset disabled={busy} className="space-y-6">
              <legend className="sr-only">Order details</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Customer ID" htmlFor="customer">
                  <Input id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required autoComplete="off" />
                </Field>
                <Field label="Ship to city" htmlFor="city">
                  <Select id="city" value={city} onChange={(e) => setCity(e.target.value as (typeof CITIES)[number])}>
                    {CITIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Payment" htmlFor="payment">
                  <Select id="payment" value={payment} onChange={(e) => setPayment(e.target.value as (typeof PAYMENT_METHODS)[number])}>
                    {PAYMENT_METHODS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Device" htmlFor="device">
                  <Select id="device" value={device} onChange={(e) => setDevice(e.target.value as (typeof DEVICES)[number])}>
                    {DEVICES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Shipping time (days)" htmlFor="ship">
                  <Input id="ship" type="number" min={1} max={6} step={1} value={shipDays} onChange={(e) => setShipDays(Number(e.target.value))} required />
                </Field>
              </div>

              <div className="space-y-4">
                <p className="text-[13px] font-medium text-muted-foreground">Lines</p>
                {lines.map((line, i) => (
                  <section key={i} aria-labelledby={`line-${i}-title`} className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 id={`line-${i}-title`} className="text-[15px] font-medium">Line {i + 1}</h2>
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove line ${i + 1}`}
                          onClick={() => setLines((current) => current.filter((_, index) => index !== i))}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-2 md:grid-cols-5">
                      <Field label="Product" htmlFor={`p-${i}`}>
                        <Input id={`p-${i}`} value={line.product_id} onChange={(e) => setLine(i, { product_id: e.target.value })} required />
                      </Field>
                      <Field label="Seller" htmlFor={`s-${i}`}>
                        <Input id={`s-${i}`} value={line.seller_id} onChange={(e) => setLine(i, { seller_id: e.target.value })} required />
                      </Field>
                      <Field label="Quantity" htmlFor={`q-${i}`}>
                        <Input id={`q-${i}`} type="number" min={1} step={1} value={line.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} required />
                      </Field>
                      <Field label="Unit price ₹" htmlFor={`u-${i}`}>
                        <Input id={`u-${i}`} type="number" min={0.01} step="0.01" value={line.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} required />
                      </Field>
                      <Field label="Discount %" htmlFor={`d-${i}`}>
                        <Input id={`d-${i}`} type="number" min={0} max={70} step="0.01" value={line.discount_pct} onChange={(e) => setLine(i, { discount_pct: Number(e.target.value) })} required />
                      </Field>
                    </div>
                  </section>
                ))}
                <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}>
                  Add line
                </Button>
              </div>
            </fieldset>

            <p className="font-mono text-[15px] tabular-nums">
              Estimate {formatINR(estimate)} <span className="font-sans text-muted-foreground">· server is the source of truth</span>
            </p>

            {error && <p role="alert" className="text-[15px] text-destructive">{error}</p>}
            <p role="status" aria-live="polite" className="sr-only">{busy ? "Booking order" : ""}</p>
            <Button type="submit" disabled={busy}>
              {busy ? "Booking…" : "Book order"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
