import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ApiError, api, formatINR, type DeliveryStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, StackError, TableSkeleton } from "@/components/PageHeader";

const TERMINALS: { status: DeliveryStatus; label: string; description: string }[] = [
  { status: "DELIVERED", label: "Delivered", description: "Delivered closes this order as fulfilled." },
  { status: "DELAYED", label: "Delayed", description: "Delayed closes this order with a terminal late-delivery outcome." },
  { status: "RETURNED", label: "Returned", description: "Returned closes this order and records it for refund." },
];

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
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : "Could not update status");
    },
  });

  useEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  const backLink = (
    <Link to="/orders" className="inline-flex items-center gap-1 text-[15px] hover:underline">
      <ArrowLeft size={16} /> Orders
    </Link>
  );

  if (!validOrderId) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title="Invalid order ID" question="The order ID in this address must be a positive whole number." />
      </div>
    );
  }
  if (order.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title="Order" question="Inspect this order." />
        <TableSkeleton />
      </div>
    );
  }
  if (order.isError || !order.data) {
    const notFound = order.error instanceof ApiError && order.error.status === 404;
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader
          title={notFound ? "Order not found" : "Order unavailable"}
          question={notFound ? `Order #${orderId} does not exist.` : `Could not load order #${orderId}.`}
        />
        {!notFound && <StackError retry={() => void order.refetch()} />}
      </div>
    );
  }
  const o = order.data;
  const total = o.items.reduce((t, i) => t + i.final_price, 0);
  const terminal = o.delivery_status !== "IN TRANSIT";
  const pendingAction = TERMINALS.find((action) => action.status === pending);

  return (
    <div className="space-y-6">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 id="page-title" tabIndex={-1} className="font-serif text-[2rem] font-normal tracking-tight tabular-nums outline-none">
            #{o.order_id}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            <span className="font-mono">{o.customer_id}</span> · {o.order_date} · {o.ship_to_city}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {o.payment_method} · {o.device} · ships in {o.shipping_time_days}d
          </p>
        </div>
        <div className="text-right">
          <StatusPill status={o.delivery_status} />
          <p className="mt-2 font-mono text-[24px] font-medium tracking-tight tabular-nums">{formatINR(total)}</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Product</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.items.map((i) => (
                <TableRow key={i.order_item_id}>
                  <TableCell className="font-mono font-medium">{i.product_id}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{i.seller_id}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{i.quantity}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatINR(i.unit_price)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{i.discount_pct}%</TableCell>
                  <TableCell className="text-right font-mono font-medium tabular-nums">{formatINR(i.final_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!terminal ? (
        pending && pendingAction ? (
          <div
            role="alertdialog"
            aria-labelledby="status-confirm-title"
            aria-describedby="status-confirm-description"
            className="flex flex-wrap items-center gap-2"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !transition.isPending) {
                event.preventDefault();
                closeConfirmation();
              }
            }}
          >
            <div className="mr-2">
              <p id="status-confirm-title" className="text-[15px] font-medium">Confirm {pendingAction.label.toLowerCase()}</p>
              <p id="status-confirm-description" className="text-[15px] text-muted-foreground">
                {pendingAction.description} This cannot be undone.
              </p>
            </div>
            <Button
              ref={confirmRef}
              size="sm"
              disabled={transition.isPending}
              onClick={() => transition.mutate(pending)}
            >
              Confirm {pendingAction.label.toLowerCase()}
            </Button>
            <Button size="sm" variant="outline" disabled={transition.isPending} onClick={closeConfirmation}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-muted-foreground">Mark as</span>
            {TERMINALS.map((action) => (
              <Button
                key={action.status}
                size="sm"
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
      <p className="sr-only" aria-live="polite" aria-atomic="true">{success}</p>
    </div>
  );
}
