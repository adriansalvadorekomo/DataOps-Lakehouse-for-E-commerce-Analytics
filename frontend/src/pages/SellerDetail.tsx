import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, formatINR, formatPercent } from "@/lib/api";
import { SELLER_ATTENTION } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MeterRow } from "@/components/MeterRow";
import { Metric } from "@/components/Metric";
import { EntityHeader, PageHeader, StackError } from "@/components/PageHeader";

export default function SellerDetail() {
  const { sellerId } = useParams();
  const sellers = useQuery({ queryKey: ["sellers200"], queryFn: () => api.sellers(200), staleTime: 60_000 });

  const backLink = (
    <Link to="/sellers" className="inline-flex min-h-11 items-center gap-1 text-[15px] hover:underline">
      <ArrowLeft size={16} /> Sellers
    </Link>
  );

  if (!sellerId) {
    return <div className="space-y-6">{backLink}<PageHeader title="Seller not specified" question="Choose a seller from the Sellers list." /></div>;
  }
  if (sellers.isLoading) {
    return <div className="space-y-6">{backLink}<PageHeader title="Seller" question={`Reading ${sellerId}.`} /><p role="status" className="text-sm text-muted-foreground">Reading seller performance…</p></div>;
  }
  if (sellers.isError || !sellers.data) {
    return <div className="space-y-6">{backLink}<PageHeader title="Seller unavailable" question={`Could not load ${sellerId}.`} /><StackError retry={() => void sellers.refetch()} /></div>;
  }

  const rows = sellers.data;
  const seller = rows.find((row) => row.seller_id === sellerId);
  if (!seller) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title="Seller outside the watched set" question={`${sellerId} is not in the top-200 revenue set returned for review.`} />
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Seller detail covers the watched revenue set. Order-level drill-down for any seller arrives with the
          transaction filter contract.
        </p>
        <Link to="/sellers" className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
          Browse sellers
        </Link>
      </div>
    );
  }

  const rank = [...rows].sort((a, b) => b.revenue - a.revenue).findIndex((row) => row.seller_id === sellerId) + 1;
  const attention: string[] = [];
  if (seller.avg_rating < SELLER_ATTENTION.ratingBelow) attention.push("Low rating");
  if (seller.delayed_rate > SELLER_ATTENTION.delayedAbove) attention.push("Delays");
  if (seller.return_rate > SELLER_ATTENTION.returnsAbove) attention.push("Returns");

  return (
    <div className="space-y-8">
      {backLink}
      <EntityHeader
        title={seller.seller_id}
        sub={`Seller · rank #${rank} of ${rows.length} by revenue in the returned set`}
        status={
          attention.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {attention.map((flag) => <Badge key={flag} variant="destructive">{flag}</Badge>)}
            </span>
          ) : (
            <Badge>Healthy</Badge>
          )
        }
        facts={[
          { label: "Revenue", value: formatINR(seller.revenue, 0) },
          { label: "Order lines", value: seller.lines.toLocaleString("en-IN") },
          { label: "Average rating", value: seller.avg_rating.toFixed(1) },
          { label: "Rank by revenue", value: `#${rank} of ${rows.length}` },
        ]}
      />

      <section aria-label="Commercial and operational summary">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Revenue" value={formatINR(seller.revenue, 0)} scope="Returned set" interpretation="Revenue across this seller's returned lines." to="/sales" />
          <Metric label="Order lines" value={seller.lines.toLocaleString("en-IN")} scope="Returned set" interpretation="Lines attributed to this seller." />
          <Metric
            label="Delayed share"
            value={formatPercent(seller.delayed_rate, 0)}
            scope="Completed lines"
            interpretation={seller.delayed_rate > SELLER_ATTENTION.delayedAbove ? "Above the delay screening rule — needs attention." : "Within the delay screening rule."}
            tone={seller.delayed_rate > SELLER_ATTENTION.delayedAbove ? "attention" : "normal"}
            to="/operations"
          />
          <Metric
            label="Return rate"
            value={formatPercent(seller.return_rate, 0)}
            scope="Returned set"
            interpretation={seller.return_rate > SELLER_ATTENTION.returnsAbove ? "Above the returns screening rule — needs attention." : "Within the returns screening rule."}
            tone={seller.return_rate > SELLER_ATTENTION.returnsAbove ? "attention" : "normal"}
            to="/operations"
          />
        </div>
      </section>

      <section aria-labelledby="thresholds-heading">
        <Card className="shadow-none">
          <CardHeader><CardTitle>Against screening rules</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            <MeterRow
              label="Rating"
              value={seller.avg_rating}
              max={5}
              valueLabel={seller.avg_rating.toFixed(1)}
              secondary={`Screening rule: below ${SELLER_ATTENTION.ratingBelow.toFixed(1)} needs attention.`}
            />
            <MeterRow
              label="Delayed share of completed"
              value={seller.delayed_rate}
              max={1}
              valueLabel={formatPercent(seller.delayed_rate, 0)}
              secondary={`Screening rule: above ${formatPercent(SELLER_ATTENTION.delayedAbove, 0)} needs attention.`}
            />
            <MeterRow
              label="Return rate"
              value={seller.return_rate}
              max={1}
              valueLabel={formatPercent(seller.return_rate, 0)}
              secondary={`Screening rule: above ${formatPercent(SELLER_ATTENTION.returnsAbove, 0)} needs attention.`}
            />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="related-heading">
        <h2 id="related-heading" className="mb-2 font-serif text-xl">Related</h2>
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Order-level drill-down for this seller needs the transaction filter contract (phase 2).
          Start from the full order workspace meanwhile.
        </p>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/orders" className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
            Order workspace
          </Link>
          <Link to="/sellers" className="text-link inline-flex min-h-11 items-center text-[15px] font-medium hover:underline">
            All sellers
          </Link>
        </div>
      </section>
    </div>
  );
}
