import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { api, formatINR, type DeliveryStatus } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/SegmentedControl";
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

const FILTERS = ["ALL", "IN TRANSIT", "DELIVERED", "DELAYED", "RETURNED"] as const;
type StatusFilter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: "All",
  "IN TRANSIT": "In transit",
  DELIVERED: "Delivered",
  DELAYED: "Delayed",
  RETURNED: "Returned",
};

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

const PAGE_SIZE = 20;

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedCustomer = searchParams.get("customer_id") ?? "";
  const linkedStatus = (searchParams.get("delivery_status") ?? "ALL") as StatusFilter;
  const initialStatus: StatusFilter = FILTERS.includes(linkedStatus) ? linkedStatus : "ALL";
  const [draftCustomer, setDraftCustomer] = useState(linkedCustomer);
  const [draftStatus, setDraftStatus] = useState<StatusFilter>(initialStatus);
  const [customer, setCustomer] = useState(linkedCustomer);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [page, setPage] = useState(0);
  const hasActiveFilters = Boolean(customer) || status !== "ALL";
  const orders = useQuery({
    queryKey: ["orders", { customer, status, page }],
    queryFn: () =>
      api.listOrders({
        customer_id: customer || undefined,
        delivery_status: status === "ALL" ? undefined : (status as DeliveryStatus),
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    staleTime: 30_000,
  });
  const rows = orders.data ?? [];
  const hasMore = rows.length === PAGE_SIZE;

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    setCustomer(draftCustomer.trim());
    setStatus(draftStatus);
    setPage(0);
    const next = new URLSearchParams();
    if (draftCustomer.trim()) next.set("customer_id", draftCustomer.trim());
    if (draftStatus !== "ALL") next.set("delivery_status", draftStatus);
    setSearchParams(next, { replace: true });
  }

  function resetFilters() {
    setDraftCustomer("");
    setDraftStatus("ALL");
    setCustomer("");
    setStatus("ALL");
    setPage(0);
    setSearchParams({}, { replace: true });
  }

  const resultCopy = orders.data
    ? `Page ${page + 1} · ${rows.length.toLocaleString("en-IN")} orders shown${hasActiveFilters ? " matching" : ""}${hasMore ? " · more follow" : ""}`
    : `Latest ${PAGE_SIZE} orders`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Orders"
        question={`${resultCopy}, latest first.`}
        action={
          <Link to="/new" className={buttonVariants()}>
            Book order
          </Link>
        }
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {orders.isFetching ? "Loading orders" : resultCopy}
      </p>

      <form onSubmit={applyFilters} className="flex flex-col gap-4 border-y border-border py-4 lg:flex-row lg:items-end">
        <div className="w-full lg:max-w-xs">
          <label htmlFor="customer-filter" className="mb-2 block text-[13px] font-medium text-muted-foreground">
            Customer ID
          </label>
          <Input
            id="customer-filter"
            className="h-11"
            value={draftCustomer}
            onChange={(event) => setDraftCustomer(event.target.value)}
            placeholder="Exact customer ID"
            autoComplete="off"
          />
        </div>
        <SegmentedControl
          label="Fulfillment status"
          value={draftStatus}
          onChange={setDraftStatus}
          options={FILTERS}
          getOptionLabel={(option) => FILTER_LABEL[option]}
          className="min-w-0 flex-1"
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonVariants({ className: "min-h-11" })}>
            Apply filters
          </button>
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters && !draftCustomer && draftStatus === "ALL"}
            className={buttonVariants({ variant: "outline", className: "min-h-11" })}
          >
            Reset filters
          </button>
        </div>
      </form>

      {hasActiveFilters && (
        <p className="text-[13px] text-muted-foreground">
          Active filters: {customer ? `Customer ${customer}` : "All customers"} · {FILTER_LABEL[status]}
        </p>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {orders.isError ? (
            <div className="p-6">
              <StackError retry={() => void orders.refetch()} />
            </div>
          ) : orders.isLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <p id="orders-scroll-hint" className="border-b border-border px-4 py-2 text-xs text-muted-foreground sm:hidden">
                Swipe horizontally to see every column.
              </p>
              <Table aria-describedby="orders-scroll-hint">
                <caption className="sr-only">Latest orders with customer, order date, fulfillment status and total paid</caption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Order</TableHead>
                    <TableHead scope="col">Customer</TableHead>
                    <TableHead scope="col">Date</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col" className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(orders.data ?? []).map((order) => (
                    <TableRow key={order.order_id}>
                      <TableCell className="evidence font-medium">
                        <Link
                          to={`/orders/${order.order_id}`}
                          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          #{order.order_id}
                        </Link>
                      </TableCell>
                      <TableCell className="evidence text-muted-foreground">
                        <Link
                          to={`/customers/${order.customer_id}`}
                          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          {order.customer_id}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        <time dateTime={order.order_date}>{formatOrderDate(order.order_date)}</time>
                      </TableCell>
                      <TableCell><StatusPill status={order.delivery_status} /></TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatINR(order.items.reduce((total, item) => total + item.final_price, 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="px-4 py-12 text-center">
                        <p className="text-[15px] font-medium">{hasActiveFilters ? "No orders match these filters" : "No orders yet"}</p>
                        <p className="mt-1 text-[15px] text-muted-foreground">
                          {hasActiveFilters ? "Clear the filters to return to the latest orders." : "Book an order to start the order record."}
                        </p>
                        {hasActiveFilters ? (
                          <button type="button" onClick={resetFilters} className="mt-3 min-h-11 font-medium text-link underline underline-offset-4">
                            Reset filters
                          </button>
                        ) : (
                          <Link to="/new" className="mt-3 inline-flex min-h-11 items-center font-medium text-link underline underline-offset-4">
                            Book order
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                <p className="text-[13px] text-muted-foreground" aria-live="polite">
                  Page {page + 1}{hasMore ? " · more orders follow" : " · end of results"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 0 || orders.isFetching}
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    className={buttonVariants({ variant: "outline", className: "min-h-11" })}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!hasMore || orders.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                    className={buttonVariants({ variant: "outline", className: "min-h-11" })}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
