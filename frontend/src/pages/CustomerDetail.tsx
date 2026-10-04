import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, formatINR, formatPercent } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";
import { Metric } from "@/components/Metric";
import { EntityHeader, PageHeader, StackError, TableSkeleton } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

export default function CustomerDetail() {
  const { customerId } = useParams();
  const orders = useQuery({
    queryKey: ["orders", { customer: customerId }],
    queryFn: () => api.listOrders({ customer_id: customerId, limit: 100 }),
    enabled: Boolean(customerId),
    staleTime: 30_000,
  });

  const backLink = (
    <Link to="/customers" className="inline-flex min-h-11 items-center gap-1 text-[15px] hover:underline">
      <ArrowLeft size={16} /> Customers
    </Link>
  );

  if (!customerId) {
    return <div className="space-y-6">{backLink}<PageHeader title="Customer not specified" question="Look up a customer from the Customers page." /></div>;
  }
  if (orders.isLoading) {
    return <div className="space-y-6">{backLink}<PageHeader title="Customer" question={`Reading ${customerId}.`} /><TableSkeleton /></div>;
  }
  if (orders.isError || !orders.data) {
    return <div className="space-y-6">{backLink}<PageHeader title="Customer unavailable" question={`Could not load ${customerId}.`} /><StackError retry={() => void orders.refetch()} /></div>;
  }
  if (orders.data.length === 0) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title="No orders found" question={`${customerId} has no recorded orders.`} />
      </div>
    );
  }

  const rows = orders.data;
  const total = rows.reduce((sum, order) => sum + order.items.reduce((line, item) => line + item.final_price, 0), 0);
  const returned = rows.filter((order) => order.delivery_status === "RETURNED").length;
  const cities = [...new Set(rows.map((order) => order.ship_to_city))];
  const latest = [...rows].sort((a, b) => (a.order_date < b.order_date ? 1 : -1))[0];

  return (
    <div className="space-y-8">
      {backLink}
      <EntityHeader
        title={customerId}
        sub={`Customer · ${rows.length >= 100 ? "latest 100 returned orders" : `${rows.length} returned orders`}`}
        facts={[
          { label: "Paid in returned orders", value: formatINR(total) },
          { label: "Return rate in set", value: formatPercent(returned / rows.length) },
          { label: "Ship-to cities", value: cities.length > 2 ? `${cities.length} cities` : cities.join(", ") },
          { label: "Latest order", value: <time dateTime={latest.order_date}>{formatOrderDate(latest.order_date)}</time> },
        ]}
      />

      <section aria-label="Customer summary">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Returned orders" value={rows.length >= 100 ? "100+" : rows.length.toLocaleString("en-IN")} scope="Latest returned" interpretation="Counts stop at 100 returned rows; lifetime totals need the customer summary contract." />
          <Metric label="Paid in set" value={formatINR(total, 0)} scope="Returned orders" interpretation="Sum of line totals across the returned orders." />
          <Metric label="Return rate in set" value={formatPercent(returned / rows.length)} scope="Returned orders" interpretation="Share of returned orders with a returned outcome." to="/operations" />
        </div>
      </section>

      <section aria-labelledby="orders-heading" className="space-y-3">
        <h2 id="orders-heading" className="font-serif text-xl">Orders</h2>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">Returned orders for this customer with date, status and total paid.</caption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Order</TableHead>
                    <TableHead scope="col">Date</TableHead>
                    <TableHead scope="col">City</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col" className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((order) => (
                    <TableRow key={order.order_id}>
                      <TableCell className="evidence font-medium">
                        <Link to={`/orders/${order.order_id}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                          #{order.order_id}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        <time dateTime={order.order_date}>{formatOrderDate(order.order_date)}</time>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{order.ship_to_city}</TableCell>
                      <TableCell><StatusPill status={order.delivery_status} /></TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatINR(order.items.reduce((sum, item) => sum + item.final_price, 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
