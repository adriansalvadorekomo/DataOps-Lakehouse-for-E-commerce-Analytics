import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, formatPercent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MeterRow } from "@/components/MeterRow";
import { Metric } from "@/components/Metric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Field, Lineage, PageHeader, StackError } from "@/components/PageHeader";

export default function Customers() {
  const navigate = useNavigate();
  const [draftId, setDraftId] = useState("");
  const pareto = useQuery({ queryKey: ["pareto"], queryFn: api.pareto, staleTime: 60_000 });

  function lookup(event: React.FormEvent) {
    event.preventDefault();
    const id = draftId.trim();
    if (id) navigate(`/customers/${encodeURIComponent(id)}`);
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Customer base"
        title="Customers"
        question="How concentrated is revenue, and which customer should be investigated?"
        caption="Customer detail is built from recorded orders; lifetime aggregates arrive with the customer summary contract."
      />

      <section aria-labelledby="concentration-heading" className="space-y-4">
        <h2 id="concentration-heading" className="font-serif text-xl">Revenue concentration</h2>
        {pareto.isError ? (
          <StackError message="Couldn't load customer concentration." retry={() => pareto.refetch()} />
        ) : pareto.isLoading ? (
          <p role="status" className="text-[15px] text-muted-foreground">Calculating customer concentration…</p>
        ) : pareto.data ? (
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <Metric
              label="Top fifth of customers"
              value={formatPercent(pareto.data.top20_share)}
              scope="All available data"
              interpretation="Share of revenue earned by the highest-spending fifth of customers."
            />
            <Card className="shadow-none">
              <CardHeader><CardTitle>Concentration curve</CardTitle></CardHeader>
              <CardContent>
                <MeterRow
                  label="Top fifth share"
                  value={pareto.data.top20_share}
                  max={1}
                  valueLabel={formatPercent(pareto.data.top20_share, 0)}
                  secondary="A high share means a small customer set carries revenue — protect those relationships first."
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <EmptyState title="No customer concentration yet" body="Revenue share appears once customer sales are available." />
        )}
      </section>

      <section aria-labelledby="lookup-heading" className="space-y-4">
        <h2 id="lookup-heading" className="font-serif text-xl">Investigate a customer</h2>
        <form onSubmit={lookup} className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Customer ID" htmlFor="customer-lookup">
            <Input
              id="customer-lookup"
              className="h-11"
              value={draftId}
              onChange={(event) => setDraftId(event.target.value)}
              placeholder="For example, U356787"
              autoComplete="off"
            />
          </Field>
          <Button type="submit" className="min-h-11 shrink-0" disabled={!draftId.trim()}>
            Open customer
          </Button>
        </form>
        <p className="text-[13px] text-muted-foreground">
          Opens recorded orders for that customer. Prefer browsing?{" "}
          <Link to="/orders" className="text-link font-medium hover:underline">Open the order workspace</Link>
        </p>
      </section>

      <Lineage metric="customer concentration" endpoint="GET /stats/pareto" gold="customer_360" />
    </div>
  );
}
