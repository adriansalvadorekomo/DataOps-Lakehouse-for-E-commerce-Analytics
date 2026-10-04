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

function formatIndiaDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

export default function CreateOrder() {
  const nav = useNavigate();
  const orderDate = indiaLocalDate();
  const [customerId, setCustomerId] = useState("");
  const [city, setCity] = useState<(typeof CITIES)[number]>(CITIES[0]);
  const [payment, setPayment] = useState<(typeof PAYMENT_METHODS)[number]>(PAYMENT_METHODS[0]);
  const [device, setDevice] = useState<(typeof DEVICES)[number]>("Web");
  const [shipDays, setShipDays] = useState(2);
  const [lines, setLines] = useState<OrderItemCreate[]>([{ ...EMPTY_LINE }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const validationShown = error?.startsWith("Line ") || error === "Customer ID is required." || error?.startsWith("Shipping time");

  function setLine(index: number, patch: Partial<OrderItemCreate>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  const estimate = lines.reduce(
    (sum, line) => sum + estimatedLineTotal(Number(line.unit_price) || 0, Number(line.quantity) || 0, Number(line.discount_pct) || 0),
    0,
  );

  function validationError() {
    if (!customerId.trim()) return "Customer ID is required.";
    if (!Number.isInteger(shipDays) || shipDays < 1 || shipDays > 6) return "Shipping time must be a whole number from 1 to 6 days.";
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.product_id.trim()) return `Line ${index + 1}: Product is required.`;
      if (!line.seller_id.trim()) return `Line ${index + 1}: Seller is required.`;
      if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1) return `Line ${index + 1}: Quantity must be a whole number of at least 1.`;
      if (!Number.isFinite(Number(line.unit_price)) || Number(line.unit_price) < 0.01) return `Line ${index + 1}: Unit price must be at least ₹0.01.`;
      if (!Number.isFinite(Number(line.discount_pct)) || Number(line.discount_pct) < 0 || Number(line.discount_pct) > 70) return `Line ${index + 1}: Discount must be from 0% to 70%.`;
    }
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
        order_date: orderDate,
        ship_to_city: city,
        payment_method: payment,
        device,
        shipping_time_days: shipDays,
        items: lines.map((line) => ({
          ...line,
          product_id: line.product_id.trim(),
          seller_id: line.seller_id.trim(),
          quantity: Number(line.quantity),
          unit_price: Number(line.unit_price),
          discount_pct: Number(line.discount_pct),
        })),
      });
      nav(`/orders/${order.order_id}`);
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Could not book the order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/orders" className="inline-flex min-h-11 items-center gap-1 text-[15px] hover:underline">
        <ArrowLeft size={16} /> Orders
      </Link>
      <PageHeader
        eyebrow="Order operations"
        title="Book order"
        question="Enter each sale unit price. The server computes and records the final paid amount and inventory update."
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-6" noValidate aria-describedby={error ? "order-error" : undefined}>
            <fieldset disabled={busy} className="space-y-6">
              <legend className="sr-only">Order details</legend>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Order date" htmlFor="order-date">
                  <div>
                    <Input id="order-date" className="h-11" value={formatIndiaDate(orderDate)} readOnly />
                    <p className="mt-1 text-xs text-muted-foreground">Recorded as today in India.</p>
                  </div>
                </Field>
                <Field label="Customer ID" htmlFor="customer">
                  <Input id="customer" className="h-11" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required autoComplete="off" aria-invalid={validationShown && !customerId.trim()} />
                </Field>
                <Field label="Ship to city" htmlFor="city">
                  <Select id="city" className="h-11" value={city} onChange={(event) => setCity(event.target.value as (typeof CITIES)[number])}>
                    {CITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </Field>
                <Field label="Payment" htmlFor="payment">
                  <Select id="payment" className="h-11" value={payment} onChange={(event) => setPayment(event.target.value as (typeof PAYMENT_METHODS)[number])}>
                    {PAYMENT_METHODS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </Field>
                <Field label="Device" htmlFor="device">
                  <Select id="device" className="h-11" value={device} onChange={(event) => setDevice(event.target.value as (typeof DEVICES)[number])}>
                    {DEVICES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </Field>
                <Field label="Shipping time (days)" htmlFor="ship">
                  <Input id="ship" className="h-11" type="number" min={1} max={6} step={1} value={shipDays} onChange={(event) => setShipDays(Number(event.target.value))} required aria-invalid={validationShown && (!Number.isInteger(shipDays) || shipDays < 1 || shipDays > 6)} />
                </Field>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="text-[15px] font-medium">Order lines</h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">Enter exact product and seller IDs. ID lookup is not available here.</p>
                </div>
                {lines.map((line, index) => {
                  const lineHasError = validationShown && error?.startsWith(`Line ${index + 1}:`);
                  return (
                    <section key={index} aria-labelledby={`line-${index}-title`} className="space-y-4 border border-border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 id={`line-${index}-title`} className="text-[15px] font-medium">Line {index + 1}</h3>
                        {lines.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`Remove line ${index + 1}`} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <Field label="Product ID" htmlFor={`p-${index}`}><Input id={`p-${index}`} className="h-11" value={line.product_id} onChange={(event) => setLine(index, { product_id: event.target.value })} required aria-invalid={lineHasError && !line.product_id.trim()} /></Field>
                        <Field label="Seller ID" htmlFor={`s-${index}`}><Input id={`s-${index}`} className="h-11" value={line.seller_id} onChange={(event) => setLine(index, { seller_id: event.target.value })} required aria-invalid={lineHasError && !line.seller_id.trim()} /></Field>
                        <Field label="Quantity" htmlFor={`q-${index}`}><Input id={`q-${index}`} className="h-11" type="number" min={1} step={1} value={line.quantity} onChange={(event) => setLine(index, { quantity: Number(event.target.value) })} required aria-invalid={lineHasError && (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1)} /></Field>
                        <Field label="Unit price ₹" htmlFor={`u-${index}`}><Input id={`u-${index}`} className="h-11" type="number" min={0.01} step="0.01" value={line.unit_price || ""} onChange={(event) => setLine(index, { unit_price: Number(event.target.value) })} required aria-invalid={lineHasError && Number(line.unit_price) < 0.01} /></Field>
                        <Field label="Discount %" htmlFor={`d-${index}`}><Input id={`d-${index}`} className="h-11" type="number" min={0} max={70} step="0.01" value={line.discount_pct} onChange={(event) => setLine(index, { discount_pct: Number(event.target.value) })} required aria-invalid={lineHasError && (Number(line.discount_pct) < 0 || Number(line.discount_pct) > 70)} /></Field>
                      </div>
                    </section>
                  );
                })}
                <Button type="button" className="min-h-11" variant="outline" onClick={() => setLines((current) => [...current, { ...EMPTY_LINE }])}>Add line</Button>
              </div>
            </fieldset>

            <div className="flex flex-col gap-4 border-y border-border bg-card py-4 lg:sticky lg:bottom-0 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[13px] font-medium text-muted-foreground">Estimated line total</p>
                <p className="text-xl font-semibold tabular-nums">{formatINR(estimate)}</p>
                <p className="text-xs text-muted-foreground">Preview only. The server is the source of truth.</p>
              </div>
              <Button type="submit" className="min-h-11" disabled={busy}>{busy ? "Booking…" : "Book order"}</Button>
            </div>

            {error && <p id="order-error" role="alert" className="border-l-2 border-destructive pl-3 text-[15px] text-destructive">{error}</p>}
            <p role="status" aria-live="polite" className="sr-only">{busy ? "Booking order" : ""}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
