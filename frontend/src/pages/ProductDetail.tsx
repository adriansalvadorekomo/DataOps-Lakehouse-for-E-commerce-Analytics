import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, formatINR } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityHeader, PageHeader, StackError } from "@/components/PageHeader";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function ProductDetail() {
  const { productId } = useParams();
  const stock = useQuery({ queryKey: ["stock200"], queryFn: () => api.stockCritical(200), staleTime: 60_000 });

  const backLink = (
    <Link to="/inventory" className="inline-flex min-h-11 items-center gap-1 text-[15px] hover:underline">
      <ArrowLeft size={16} /> Inventory
    </Link>
  );

  if (!productId) {
    return <div className="space-y-6">{backLink}<PageHeader title="Product not specified" question="Choose a product from Inventory." /></div>;
  }
  if (stock.isLoading) {
    return <div className="space-y-6">{backLink}<PageHeader title="Product" question={`Reading ${productId}.`} /><p role="status" className="text-sm text-muted-foreground">Reading stock position…</p></div>;
  }
  if (stock.isError || !stock.data) {
    return <div className="space-y-6">{backLink}<PageHeader title="Product unavailable" question={`Could not load ${productId}.`} /><StackError retry={() => void stock.refetch()} /></div>;
  }

  const row = stock.data.find((product) => product.product_id === productId);
  if (!row) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title="Product outside the low-stock set" question={`${productId} holds 20 or more units in the latest snapshot, so it sits outside inventory review.`} />
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Product revenue history and order-level drill-down aren&apos;t available yet.
        </p>
        <Link to="/inventory" className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
          Back to Inventory
        </Link>
      </div>
    );
  }

  const exposure = row.current_price * row.latest_stock;

  return (
    <div className="space-y-6">
      {backLink}
      <EntityHeader
        title={row.product_id}
        sub={`${row.category} · ${row.brand}`}
        status={row.latest_stock <= 5 ? <Badge variant="destructive">Critical</Badge> : <Badge variant="secondary">Low stock</Badge>}
        facts={[
          { label: "Current price", value: formatINR(row.current_price, 0) },
          { label: "Latest stock", value: row.latest_stock.toLocaleString("en-IN") },
          { label: "Revenue exposure (est.)", value: formatINR(exposure, 0) },
          { label: "Snapshot", value: dateFormatter.format(new Date(`${row.latest_snapshot_date}T00:00:00`)) },
        ]}
      />

      <section aria-labelledby="exposure-heading">
        <Card>
          <CardHeader><CardTitle>Stock position</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="max-w-2xl text-sm leading-relaxed">
              {row.latest_stock <= 5
                ? "Stock is at or below 5 units — confirm inbound supply before promising delivery dates."
                : "Stock sits below the 20-unit review line — confirm demand and inbound supply before reordering."}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Revenue exposure multiplies current price by latest stock as a review estimate, not a booked figure.
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="related-heading">
        <h2 id="related-heading" className="mb-2 section-title">Related</h2>
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Product revenue history and order-level drill-down aren&apos;t available yet.
        </p>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/inventory" className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
            Inventory review
          </Link>
          <Link to="/sales" className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
            Category revenue
          </Link>
        </div>
      </section>
    </div>
  );
}
