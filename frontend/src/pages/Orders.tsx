import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { api, formatINR, type DeliveryStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const orders = useQuery({
    queryKey: ["orders", filter],
    queryFn: () => api.listOrders(filter === "ALL" ? undefined : { delivery_status: filter }),
    staleTime: 30_000,
  });
  const resultCopy = orders.data
    ? filter === "ALL"
      ? `${orders.data.length.toLocaleString("en-IN")} of the latest 20 orders shown`
      : `${orders.data.length.toLocaleString("en-IN")} of the latest 20 ${FILTER_LABEL[filter].toLowerCase()} orders shown`
    : "Latest 20 orders";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Orders"
        question={`${resultCopy} · latest first.`}
        action={
          <Link to="/new" className={buttonVariants()}>
            Book order
          </Link>
        }
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {orders.isFetching ? "Loading orders" : resultCopy}
      </p>

      <fieldset className="inline-flex flex-wrap rounded-md bg-secondary p-1">
        <legend className="sr-only">Fulfillment status</legend>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              filter === f ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </fieldset>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {orders.isError ? (
            <div className="p-6">
              <StackError retry={() => void orders.refetch()} />
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
                  <TableRow key={o.order_id}>
                    <TableCell className="font-mono font-medium">
                      <Link
                        to={`/orders/${o.order_id}`}
                        className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        #{o.order_id}
                      </Link>
                    </TableCell>
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
