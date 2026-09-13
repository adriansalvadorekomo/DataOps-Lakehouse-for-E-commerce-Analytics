import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
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

const TERMINALS: { status: DeliveryStatus; label: string }[] = [
  { status: "DELIVERED", label: "Delivered" },
  { status: "DELAYED", label: "Delayed" },
  { status: "RETURNED", label: "Returned" },
];

export default function OrderDetail() {
  const { id } = useParams();
  const orderId = Number(id);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DeliveryStatus | null>(null);
  const order = useQuery({ queryKey: ["order", orderId], queryFn: () => api.getOrder(orderId) });
  const transition = useMutation({
    mutationFn: (to: DeliveryStatus) => api.transition(orderId, to),
    onSuccess: () => {
      setError(null);
      setPending(null);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => {
      setPending(null);
      setError(e instanceof ApiError ? e.message : "Could not update status");
    },
  });

  if (order.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Order" question="Inspect this order." />
        <TableSkeleton />
      </div>
    );
  }
  if (order.isError || !order.data) {
    return (
      <div className="space-y-6">
        <Link to="/orders" className="inline-flex items-center gap-1 text-[15px] hover:underline">
          <ArrowLeft size={16} /> Orders
        </Link>
        <StackError message={`Order #${id} was not found.`} />
      </div>
    );
  }
  const o = order.data;
  const total = o.items.reduce((t, i) => t + i.final_price, 0);
  const terminal = o.delivery_status !== "IN TRANSIT";

  return (
    <div className="space-y-6">
      <Link to="/orders" className="inline-flex items-center gap-1 text-[15px] hover:underline">
        <ArrowLeft size={16} /> Orders
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[2rem] font-normal tracking-tight tabular-nums">#{o.order_id}</h1>
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
        pending ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-muted-foreground">
              Mark as {TERMINALS.find((t) => t.status === pending)?.label.toLowerCase()}? This cannot be undone.
            </span>
            <Button
              size="sm"
              disabled={transition.isPending}
              onClick={() => transition.mutate(pending)}
            >
              Confirm
            </Button>
            <Button size="sm" variant="outline" disabled={transition.isPending} onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-muted-foreground">Mark as</span>
            {TERMINALS.map((t) => (
              <Button key={t.status} size="sm" variant="outline" disabled={transition.isPending} onClick={() => setPending(t.status)}>
                {t.label}
              </Button>
            ))}
          </div>
        )
      ) : (
        <p className="text-[13px] text-muted-foreground">This order is closed; status cannot change.</p>
      )}
      {error && <p className="text-[15px] text-destructive">{error}</p>}
    </div>
  );
}
