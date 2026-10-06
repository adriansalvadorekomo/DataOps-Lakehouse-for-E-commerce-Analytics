import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { api, formatINR, type DeliveryStatus } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/StatusPill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StackError, TableSkeleton } from "@/components/PageHeader";
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
  const [customer, setCustomer] = useState(linkedCustomer);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [page, setPage] = useState(0);
  const hasActiveFilters = Boolean(customer) || status !== "ALL";
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.overview, staleTime: 60_000 });
  const byStatus = overview.data?.by_status ?? {};
  const totalOrders = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  const tabCounts: Record<StatusFilter, number | null> = {
    ALL: overview.data ? totalOrders : null,
    "IN TRANSIT": overview.data ? (byStatus["IN TRANSIT"] ?? 0) : null,
    DELIVERED: overview.data ? (byStatus["DELIVERED"] ?? 0) : null,
    DELAYED: overview.data ? (byStatus["DELAYED"] ?? 0) : null,
    RETURNED: overview.data ? (byStatus["RETURNED"] ?? 0) : null,
  };
  const attentionCount = (byStatus["DELAYED"] ?? 0) + (byStatus["RETURNED"] ?? 0);
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
    setPage(0);
    const next = new URLSearchParams();
    if (draftCustomer.trim()) next.set("customer_id", draftCustomer.trim());
    if (status !== "ALL") next.set("delivery_status", status);
    setSearchParams(next, { replace: true });
  }

  function selectTab(next: StatusFilter) {
    const cust = draftCustomer.trim();
    setCustomer(cust);
    setStatus(next);
    setPage(0);
    const params = new URLSearchParams();
    if (cust) params.set("customer_id", cust);
    if (next !== "ALL") params.set("delivery_status", next);
    setSearchParams(params, { replace: true });
  }

  function resetFilters() {
    setDraftCustomer("");
    setCustomer("");
    setStatus("ALL");
    setPage(0);
    setSearchParams({}, { replace: true });
  }

  function clearCustomer() {
    setDraftCustomer("");
    setCustomer("");
    setPage(0);
    const next = new URLSearchParams(searchParams);
    next.delete("customer_id");
    setSearchParams(next, { replace: true });
  }

  function clearStatus() {
    setStatus("ALL");
    setPage(0);
    const next = new URLSearchParams(searchParams);
    next.delete("delivery_status");
    setSearchParams(next, { replace: true });
  }

  const resultCopy = orders.data
    ? `Page ${page + 1} · ${rows.length.toLocaleString("en-IN")} orders shown${hasActiveFilters ? " matching" : ""}${hasMore ? " · more follow" : ""}`
    : `Latest ${PAGE_SIZE} orders`;

  function exportPage() {
    const header = "order_id,customer_id,order_date,delivery_status,total_paid_inr";
    const lines = rows.map((order) => {
      const total = order.items.reduce((sum, item) => sum + item.final_price, 0);
      return [order.order_id, order.customer_id, order.order_date, order.delivery_status, total.toFixed(2)].join(",");
    });
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `orders-page-${page + 1}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="page-title" className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            <p className="section-kicker">Commerce · Order workspace</p>
            <h1 id="page-title" tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight text-foreground outline-none">
              Orders
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Find and review recorded marketplace orders, latest first.</p>
          </div>
          <Link to="/new" className={cn(buttonVariants(), "shrink-0")}>
            Book order
          </Link>
        </div>

        <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-y border-border bg-muted/40">
          <div className="min-w-0 px-4 py-3 sm:px-5">
            <dt className="section-kicker">Total orders</dt>
            <dd className="mt-1 truncate font-mono text-xl font-semibold tabular-nums">
              {overview.data ? totalOrders.toLocaleString("en-IN") : <span aria-hidden="true">…</span>}
            </dd>
          </div>
          <div className="min-w-0 px-4 py-3 sm:px-5">
            <dt className="section-kicker">In transit now</dt>
            <dd className="mt-1 truncate font-mono text-xl font-semibold tabular-nums">
              {overview.data ? (byStatus["IN TRANSIT"] ?? 0).toLocaleString("en-IN") : <span aria-hidden="true">…</span>}
            </dd>
          </div>
          <div className="min-w-0 px-4 py-3 sm:px-5">
            <dt className="section-kicker">Needs attention</dt>
            <dd className="mt-1 truncate font-mono text-xl font-semibold tabular-nums text-destructive">
              {overview.data ? attentionCount.toLocaleString("en-IN") : <span aria-hidden="true">…</span>}
            </dd>
          </div>
        </dl>

        <div role="group" aria-label="Filter by fulfillment status" className="flex overflow-x-auto px-2 sm:px-3">
          {FILTERS.map((option) => {
            const active = status === option;
            const count = tabCounts[option];
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => selectTab(option)}
                className={cn(
                  "-mb-px flex min-w-24 flex-1 flex-col items-center gap-0.5 border-b-2 px-3 py-2.5 transition-colors sm:flex-none sm:px-6",
                  active ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                <span className={cn("font-mono text-lg font-semibold tabular-nums", active ? "text-foreground" : "text-muted-foreground")}>
                  {count == null ? <span aria-hidden="true">…</span> : count.toLocaleString("en-IN")}
                </span>
                <span className={cn("text-xs", active ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {FILTER_LABEL[option]}
                </span>
              </button>
            );
          })}
        </div>

        <form onSubmit={applyFilters} aria-label="Order filters" className="flex flex-col gap-3 border-t border-border bg-muted/40 px-4 py-3.5 sm:flex-row sm:items-end sm:px-5">
          <div className="min-w-0 flex-1">
            <label htmlFor="customer-filter" className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
              Customer ID
            </label>
            <Input
              id="customer-filter"
              value={draftCustomer}
              onChange={(event) => setDraftCustomer(event.target.value)}
              placeholder="e.g. U356787"
              autoComplete="off"
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="submit" className={buttonVariants()}>
              Apply
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters && !draftCustomer}
              className={buttonVariants({ variant: "outline" })}
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Active filters">
          <span className="text-muted-foreground">Filtered by</span>
          {customer && (
            <button
              type="button"
              onClick={clearCustomer}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3 pr-2 text-[13px] font-medium shadow-sm hover:border-input"
              aria-label={`Remove customer filter ${customer}`}
            >
              {customer}
              <X size={13} aria-hidden="true" />
            </button>
          )}
          {status !== "ALL" && (
            <button
              type="button"
              onClick={clearStatus}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3 pr-2 text-[13px] font-medium shadow-sm hover:border-input"
              aria-label={`Remove status filter ${FILTER_LABEL[status]}`}
            >
              {FILTER_LABEL[status]}
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
          <p className="text-[13px] text-muted-foreground" aria-live="polite" aria-atomic="true">
            {orders.isFetching ? "Loading orders…" : resultCopy}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void orders.refetch()}
              disabled={orders.isFetching}
              aria-label="Refresh results"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw size={15} aria-hidden="true" className={orders.isFetching ? "animate-spin" : undefined} />
            </button>
            <button
              type="button"
              onClick={exportPage}
              disabled={rows.length === 0}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium shadow-sm transition-colors hover:border-input disabled:opacity-50"
            >
              <Download size={14} aria-hidden="true" />
              Export page
            </button>
          </div>
        </div>
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
                        <p className="text-sm font-medium">{hasActiveFilters ? "No orders match these filters" : "No orders yet"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
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
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!hasMore || orders.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                    className={buttonVariants({ variant: "outline" })}
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
