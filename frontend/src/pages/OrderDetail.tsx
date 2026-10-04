import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CircleDashed, Clock } from "lucide-react";
import { ApiError, api, formatINR, formatPercent, type DeliveryStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EntityHeader, PageHeader, StackError, TableSkeleton } from "@/components/PageHeader";

const TERMINALS: { status: DeliveryStatus; label: string; description: string }[] = [
  { status: "DELIVERED", label: "Delivered", description: "Delivered closes this order as fulfilled." },
  { status: "DELAYED", label: "Delayed", description: "Delayed closes this order with a terminal late-delivery outcome." },
  { status: "RETURNED", label: "Returned", description: "Returned closes this order and records it for refund." },
];

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

export default function OrderDetail() {
  const { id } = useParams();
  const orderId = Number(id);
  const validOrderId = Number.isSafeInteger(orderId) && orderId > 0;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState<DeliveryStatus | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const initiatingActionRef = useRef<HTMLButtonElement | null>(null);
  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.getOrder(orderId),
    enabled: validOrderId,
  });
  const sellerContext = useQuery({
    queryKey: ["sellers200"],
    queryFn: () => api.sellers(200),
    staleTime: 60_000,
    enabled: validOrderId,
  });
  const restoreActionFocus = () => requestAnimationFrame(() => initiatingActionRef.current?.focus());
  const closeConfirmation = () => {
    setPending(null);
    restoreActionFocus();
  };
  const transition = useMutation({
    mutationFn: (to: DeliveryStatus) => api.transition(orderId, to),
    onSuccess: (updated, status) => {
      setError(null);
      setSuccess(`Order marked ${status.toLowerCase()}.`);
      qc.setQueryData(["order", orderId], updated);
      void qc.invalidateQueries({ queryKey: ["orders"] });
      setPending(null);
      restoreActionFocus();
    },
    onError: (transitionError) => {
      setError(transitionError instanceof ApiError ? transitionError.message : "Could not update status");
    },
  });

  useEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  const backLink = (
    <Link to="/orders" className="inline-flex min-h-11 items-center gap-1 text-[15px] hover:underline">
      <ArrowLeft size={16} /> Orders
    </Link>
  );

  if (!validOrderId) {
    return <div className="space-y-6">{backLink}<PageHeader title="Invalid order ID" question="The order ID in this address must be a positive whole number." /></div>;
  }
  if (order.isLoading) {
    return <div className="space-y-6">{backLink}<PageHeader title="Order" question="Inspect this order." /><TableSkeleton /></div>;
  }
  if (order.isError || !order.data) {
    const notFound = order.error instanceof ApiError && order.error.status === 404;
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title={notFound ? "Order not found" : "Order unavailable"} question={notFound ? `Order #${orderId} does not exist.` : `Could not load order #${orderId}.`} />
        {!notFound && <StackError retry={() => void order.refetch()} />}
      </div>
    );
  }

  const currentOrder = order.data;
  const total = currentOrder.items.reduce((sum, item) => sum + item.final_price, 0);
  const terminal = currentOrder.delivery_status !== "IN TRANSIT";
  const pendingAction = TERMINALS.find((action) => action.status === pending);
  const localizedDate = formatOrderDate(currentOrder.order_date);
  const primarySellerId = currentOrder.items[0]?.seller_id;
  const sellerRow = (sellerContext.data ?? []).find((seller) => seller.seller_id === primarySellerId);
  const lifecycle: { label: string; detail: string; state: "done" | "current" | "todo" }[] = [
    { label: "Placed", detail: localizedDate, state: "done" },
    terminal
      ? { label: "In transit", detail: "Left the shelf", state: "done" }
      : { label: "In transit", detail: "Moving through fulfillment", state: "current" },
    terminal
      ? { label: `Closed · ${currentOrder.delivery_status.toLowerCase()}`, detail: "Terminal outcome", state: "done" }
      : { label: "Outcome", detail: "Delivered, delayed or returned", state: "todo" },
  ];

  return (
    <div className="space-y-8">
      {backLink}
      <EntityHeader
        title={`Order #${currentOrder.order_id}`}
        sub={`Customer ${currentOrder.customer_id} · ${currentOrder.ship_to_city}`}
        status={<StatusPill status={currentOrder.delivery_status} />}
        facts={[
          { label: "Total paid", value: formatINR(total) },
          { label: "Order date", value: <time dateTime={currentOrder.order_date}>{localizedDate}</time> },
          { label: "Payment", value: currentOrder.payment_method },
          { label: "Channel", value: `${currentOrder.device} · ships in ${currentOrder.shipping_time_days}d` },
        ]}
      />

      <section aria-label="Order lifecycle">
        <ol className="grid gap-3 sm:grid-cols-3">
          {lifecycle.map((step) => {
            const Icon = step.state === "done" ? Check : step.state === "current" ? Clock : CircleDashed;
            return (
              <li
                key={step.label}
                aria-current={step.state === "current" ? "step" : undefined}
                className="flex items-start gap-3 border-t-2 border-border pt-3"
              >
                <span
                  aria-hidden="true"
                  className={
                    step.state === "todo"
                      ? "mt-0.5 text-muted-foreground"
                      : "mt-0.5 text-primary-ink"
                  }
                >
                  <Icon size={16} strokeWidth={2.25} />
                </span>
                <span>
                  <span className="block text-[15px] font-medium">{step.label}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{step.detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="items-heading" className="space-y-3">
        <h2 id="items-heading" className="font-serif text-xl">Items</h2>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <caption className="sr-only">Products, sellers, ratings at sale, quantities, prices and discounts for this order</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">Product</TableHead>
                  <TableHead scope="col">Seller</TableHead>
                  <TableHead scope="col" className="text-right">Rating at sale</TableHead>
                  <TableHead scope="col" className="text-right">Qty</TableHead>
                  <TableHead scope="col" className="text-right">Unit</TableHead>
                  <TableHead scope="col" className="text-right">Discount</TableHead>
                  <TableHead scope="col" className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentOrder.items.map((item) => (
                  <TableRow key={item.order_item_id}>
                    <TableCell className="evidence font-medium">
                      <Link to={`/products/${item.product_id}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                        {item.product_id}
                      </Link>
                    </TableCell>
                    <TableCell className="evidence text-muted-foreground">
                      <Link to={`/sellers/${item.seller_id}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                        {item.seller_id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.seller_rating_at_sale.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(item.unit_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.discount_pct}%</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatINR(item.final_price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="fulfillment-heading">
          <Card className="h-full shadow-none">
            <CardHeader><CardTitle>Fulfillment</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div><dt className="text-[13px] text-muted-foreground">Ship to</dt><dd className="mt-1 text-[15px] font-medium">{currentOrder.ship_to_city}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">Shipping time</dt><dd className="mt-1 text-[15px] font-medium tabular-nums">{currentOrder.shipping_time_days}d</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">Payment</dt><dd className="mt-1 text-[15px] font-medium">{currentOrder.payment_method}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">Device</dt><dd className="mt-1 text-[15px] font-medium">{currentOrder.device}</dd></div>
              </dl>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="seller-context-heading">
          <Card className="h-full shadow-none">
            <CardHeader><CardTitle>Seller context</CardTitle></CardHeader>
            <CardContent>
              {sellerContext.isError ? (
                <StackError message="Couldn't load seller context." retry={() => sellerContext.refetch()} />
              ) : sellerContext.isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">Reading seller performance…</p>
              ) : sellerRow && primarySellerId ? (
                <div className="space-y-3">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div><dt className="text-[13px] text-muted-foreground">Revenue</dt><dd className="mt-1 text-[15px] font-medium tabular-nums">{formatINR(sellerRow.revenue, 0)}</dd></div>
                    <div><dt className="text-[13px] text-muted-foreground">Lines</dt><dd className="mt-1 text-[15px] font-medium tabular-nums">{sellerRow.lines.toLocaleString("en-IN")}</dd></div>
                    <div><dt className="text-[13px] text-muted-foreground">Delayed share</dt><dd className="mt-1 text-[15px] font-medium tabular-nums">{formatPercent(sellerRow.delayed_rate, 0)}</dd></div>
                    <div><dt className="text-[13px] text-muted-foreground">Return rate</dt><dd className="mt-1 text-[15px] font-medium tabular-nums">{formatPercent(sellerRow.return_rate, 0)}</dd></div>
                  </dl>
                  <Link to={`/sellers/${primarySellerId}`} className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
                    Open {primarySellerId}
                  </Link>
                </div>
              ) : (
                <p className="text-[15px] text-muted-foreground">
                  {primarySellerId} is outside the watched top-200 revenue set.{" "}
                  <Link to="/sellers" className="text-link font-medium hover:underline">Browse sellers</Link>
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="related-heading">
        <h2 id="related-heading" className="mb-2 font-serif text-xl">Related</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to={`/customers/${currentOrder.customer_id}`} className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
            Customer {currentOrder.customer_id}
          </Link>
          {primarySellerId && (
            <Link to={`/sellers/${primarySellerId}`} className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
              Seller {primarySellerId}
            </Link>
          )}
          <Link to="/orders" className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
            All orders
          </Link>
        </div>
      </section>

      {success && (
        <div aria-live="polite" aria-atomic="true" className="flex items-center gap-2 rounded-lg border border-emerald-700/50 bg-card px-4 py-3 text-[15px] text-foreground">
          <Check size={17} className="text-emerald-700" aria-hidden="true" />
          <span>{success}</span>
        </div>
      )}

      {!terminal ? (
        pending && pendingAction ? (
          <div
            role="alertdialog"
            aria-labelledby="status-confirm-title"
            aria-describedby="status-confirm-description"
            className="flex flex-wrap items-center gap-2 border-y border-border py-4"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !transition.isPending) {
                event.preventDefault();
                closeConfirmation();
              }
            }}
          >
            <div className="mr-2 flex-1 basis-72">
              <p id="status-confirm-title" className="text-[15px] font-medium">Confirm {pendingAction.label.toLowerCase()}</p>
              <p id="status-confirm-description" className="text-[15px] text-muted-foreground">{pendingAction.description} This cannot be undone.</p>
            </div>
            <Button ref={confirmRef} className="min-h-11" disabled={transition.isPending} onClick={() => transition.mutate(pending)}>
              Confirm {pendingAction.label.toLowerCase()}
            </Button>
            <Button className="min-h-11" variant="outline" disabled={transition.isPending} onClick={closeConfirmation}>Cancel</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-muted-foreground">Mark as</span>
            {TERMINALS.map((action) => (
              <Button
                key={action.status}
                className="min-h-11"
                variant="outline"
                disabled={transition.isPending}
                onClick={(event) => {
                  initiatingActionRef.current = event.currentTarget;
                  setError(null);
                  setSuccess("");
                  setPending(action.status);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )
      ) : (
        <p className="text-[13px] text-muted-foreground">This order is closed; status cannot change.</p>
      )}
      {error && <p role="alert" className="text-[15px] text-destructive">{error}</p>}
    </div>
  );
}
