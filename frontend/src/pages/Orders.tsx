import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, formatINR, type DeliveryStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
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
import { EmptyState, PageHeader, StackError, TableSkeleton } from "@/components/PageHeader";

const FILTERS: (DeliveryStatus | "ALL")[] = ["ALL", "IN TRANSIT", "DELIVERED", "DELAYED", "RETURNED"];

const FILTER_LABEL: Record<(typeof FILTERS)[number], string> = {
  ALL: "All",
  "IN TRANSIT": "In transit",
  DELIVERED: "Delivered",
  DELAYED: "Delayed",
  RETURNED: "Returned",
};

export default function Orders() {
  const nav = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const orders = useQuery({
    queryKey: ["orders", filter],
    queryFn: () => api.listOrders(filter === "ALL" ? undefined : { delivery_status: filter }),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Orders"
        question={orders.data ? `${orders.data.length.toLocaleString("en-IN")} shown · latest first` : "Inspect a single order — latest first."}
        action={
          <Link
            to="/new"
            className="rounded-md bg-primary px-4 py-2 text-[15px] font-medium text-primary-foreground no-underline hover:bg-primary/90"
          >
            Book order
          </Link>
        }
      />

      <div className="inline-flex flex-wrap rounded-md bg-secondary p-1" role="tablist" aria-label="Fulfillment status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              filter === f ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {orders.isError ? (
            <div className="p-6">
              <StackError />
            </div>
          ) : orders.isLoading ? (
            <TableSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orders.data ?? []).map((o) => (
                  <TableRow
                    key={o.order_id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => nav(`/orders/${o.order_id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        nav(`/orders/${o.order_id}`);
                      }
                    }}
                  >
                    <TableCell className="font-mono font-medium">#{o.order_id}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{o.customer_id}</TableCell>
                    <TableCell className="font-mono text-muted-foreground tabular-nums">{o.order_date}</TableCell>
                    <TableCell>
                      <StatusPill status={o.delivery_status} />
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium tabular-nums">
                      {formatINR(o.items.reduce((t, i) => t + i.final_price, 0))}
                    </TableCell>
                  </TableRow>
                ))}
                {orders.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        title="No orders in this view"
                        body="Book an order, or switch the status filter."
                        to="/new"
                        cta="Book order"
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
