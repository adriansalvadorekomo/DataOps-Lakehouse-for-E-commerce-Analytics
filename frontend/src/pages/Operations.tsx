import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, formatINR, formatPercent, type StockAlert } from "@/lib/api";
import { dqDetail, dqTitle } from "@/lib/constants";
import { useSortedRows } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Disclosure } from "@/components/Disclosure";
import { MeterRow } from "@/components/MeterRow";
import { TrustStatus } from "@/components/TrustStatus";
import { EmptyState, PageHeader, SortTh, StackError, TableSkeleton } from "@/components/PageHeader";

const STALE = 60_000;
const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function formatDate(date: string | null | undefined): string {
  return date ? dateFormatter.format(new Date(`${date}T00:00:00`)) : "date unavailable";
}

export default function Operations() {
  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities, staleTime: STALE });
  const stock = useQuery({ queryKey: ["stock"], queryFn: () => api.stockCritical(50), staleTime: STALE });
  const dq = useQuery({ queryKey: ["dq"], queryFn: api.dqChecks, staleTime: STALE });
  const failingChecks = (dq.data ?? []).filter((check) => check.violations > 0);
  const checkTotal = (dq.data ?? []).length;
  const stockSort = useSortedRows(stock.data ?? [], "stock", {
    product: (product: StockAlert) => product.product_id,
    category: (product: StockAlert) => product.category,
    brand: (product: StockAlert) => product.brand,
    price: (product: StockAlert) => product.current_price,
    stock: (product: StockAlert) => product.latest_stock,
    snapshot: (product: StockAlert) => product.latest_snapshot_date,
  }, "asc");
  const latestSnapshot = [...(stock.data ?? [])].map((product) => product.latest_snapshot_date).sort().at(-1);

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Fulfillment and inventory" title="Needs action" question="Where are delivery outcomes weak, what needs restocking, and can the books be relied on?" />

      <section aria-labelledby="shipping-heading" className="space-y-4">
        <div><p className="section-kicker section-kicker--ember">Delivery outcomes</p><h2 id="shipping-heading" className="mt-1 font-serif text-2xl">Where customers are waiting longer</h2></div>
        <Card>
          <CardHeader><CardTitle>Delayed orders by metro</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-2 text-[13px] text-muted-foreground">The bar is the delayed share of completed orders. Returned lines are shown separately for context.</p>
            <div className="divide-y divide-border">
              {cities.isError ? (
                <StackError message="Couldn't load metro shipping." retry={() => cities.refetch()} />
              ) : cities.isLoading ? (
                <TableSkeleton rows={5} cols={2} />
              ) : (cities.data ?? []).length === 0 ? (
                <EmptyState title="No metro shipping yet" body="Delay and return rates appear after completed orders are recorded." />
              ) : (
                (cities.data ?? []).map((city) => <MeterRow key={city.city} label={city.city} value={city.delayed_rate} max={1} valueLabel={formatPercent(city.delayed_rate, 0)} secondary={`${formatPercent(city.return_rate, 0)} returned`} />)
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="integrity-heading" className="space-y-4">
        <div><p className="section-kicker section-kicker--ember">Confidence</p><h2 id="integrity-heading" className="mt-1 font-serif text-2xl">Can teams use these books?</h2></div>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
            <div><CardTitle>Marketplace checks</CardTitle><p className="mt-1 text-[13px] text-muted-foreground">Passing requires checks to be present and every returned check to have zero violations.</p></div>
            {dq.data && dq.data.length > 0 && <TrustStatus status={failingChecks.length === 0 ? "passing" : "failing"} label={failingChecks.length === 0 ? "Checks passing" : `${failingChecks.length} checks need attention`} />}
          </CardHeader>
          <CardContent>
            {dq.isError ? (
              <StackError message="Couldn't load marketplace checks." retry={() => dq.refetch()} />
            ) : dq.isLoading ? (
              <TableSkeleton cols={2} />
            ) : (dq.data ?? []).length === 0 ? (
              <div className="space-y-4"><TrustStatus status="unavailable" label="Confidence not established" summary="No checks were returned, so this state cannot pass." variant="full" /><EmptyState title="No checks returned" body="A non-empty result with zero violations is required before the books are marked as passing." /></div>
            ) : (
              <div className="space-y-3">
                <MeterRow
                  label="Checks passing"
                  value={checkTotal - failingChecks.length}
                  max={checkTotal}
                  valueLabel={`${(checkTotal - failingChecks.length).toLocaleString("en-IN")} of ${checkTotal.toLocaleString("en-IN")}`}
                  secondary="Present checks with zero violations."
                />
                {(dq.data ?? []).map((check) => (
                  <Disclosure key={check.rule} summary={dqTitle(check.rule)} eyebrow={check.violations === 0 ? "Passed" : `${check.violations.toLocaleString("en-IN")} violations`}>
                    <p>{dqDetail(check.rule)}</p>
                    <p className="mt-2 text-xs"><span className="evidence text-muted-foreground">Rule: {check.rule}</span></p>
                  </Disclosure>
                ))}
                <Disclosure summary="Technical source and rule set" eyebrow="Technical detail">
                  These checks mirror PostgreSQL rules R1–R7 over the marketplace books. They are not a live Databricks workflow result.
                </Disclosure>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="restock-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="section-kicker section-kicker--ember">Inventory</p><h2 id="restock-heading" className="mt-1 font-serif text-2xl">Restock the thinnest inventory first</h2><p className="mt-2 max-w-[70ch] text-sm text-muted-foreground">This is the real low-stock list, ordered for review; confirm demand and inbound supply before reordering.</p></div>
          {latestSnapshot && <p className="border-l-[3px] border-primary pl-3 text-sm font-medium">Latest snapshot<br /><span className="evidence text-muted-foreground">{formatDate(latestSnapshot)}</span></p>}
        </div>
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><CardTitle>Lowest stock · up to 50 products</CardTitle><Link to="/orders" className="min-h-11 py-3 text-[15px] hover:underline">Orders</Link></CardHeader>
          <CardContent className="p-0">
            {stock.isError ? (
              <div className="p-5"><StackError message="Couldn't load low-stock products." retry={() => stock.refetch()} /></div>
            ) : stock.isLoading ? (
              <TableSkeleton />
            ) : (stock.data ?? []).length === 0 ? (
              <EmptyState title="Nothing below 20 units" body="When stock is thin, products appear here for reorder review." />
            ) : (
              <div className="overflow-x-auto">
                <p className="px-4 py-2 text-xs text-muted-foreground sm:hidden">Scroll horizontally to view all inventory fields.</p>
                <Table>
                  <caption className="sr-only">Up to 50 products from the latest low-stock response, with price, stock and snapshot date.</caption>
                  <TableHeader><TableRow className="hover:bg-transparent">
                    <SortTh label="Product" column="product" activeColumn={stockSort.sortKey} direction={stockSort.direction} onToggle={stockSort.toggle} />
                    <SortTh label="Category" column="category" activeColumn={stockSort.sortKey} direction={stockSort.direction} onToggle={stockSort.toggle} />
                    <SortTh label="Brand" column="brand" activeColumn={stockSort.sortKey} direction={stockSort.direction} onToggle={stockSort.toggle} />
                    <SortTh label="Price" column="price" activeColumn={stockSort.sortKey} direction={stockSort.direction} onToggle={stockSort.toggle} align="right" />
                    <SortTh label="Stock" column="stock" activeColumn={stockSort.sortKey} direction={stockSort.direction} onToggle={stockSort.toggle} align="right" />
                    <SortTh label="Snapshot" column="snapshot" activeColumn={stockSort.sortKey} direction={stockSort.direction} onToggle={stockSort.toggle} align="right" />
                  </TableRow></TableHeader>
                  <TableBody>
                    {stockSort.sorted.map((product) => (
                      <TableRow key={product.product_id}><TableCell className="evidence font-medium">{product.product_id}</TableCell><TableCell className="text-muted-foreground">{product.category}</TableCell><TableCell className="text-muted-foreground">{product.brand}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatINR(product.current_price, 0)}</TableCell><TableCell className="text-right font-semibold tabular-nums text-destructive">{product.latest_stock}</TableCell><TableCell className="evidence whitespace-nowrap text-right text-muted-foreground">{formatDate(product.latest_snapshot_date)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
