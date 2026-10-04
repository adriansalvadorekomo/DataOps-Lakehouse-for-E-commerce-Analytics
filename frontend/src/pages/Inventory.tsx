import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, formatINR, type StockAlert } from "@/lib/api";
import { useSortedRows } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { MeterRow } from "@/components/MeterRow";
import { Metric } from "@/components/Metric";
import { EmptyState, Lineage, PageHeader, SortTh, StackError, TableSkeleton } from "@/components/PageHeader";

const LIMIT = 200;

function exposure(product: StockAlert): number {
  return product.current_price * product.latest_stock;
}

export default function Inventory() {
  const stock = useQuery({ queryKey: ["stock", LIMIT], queryFn: () => api.stockCritical(LIMIT), staleTime: 60_000 });
  const rows = stock.data ?? [];
  const critical = rows.filter((product) => product.latest_stock <= 5);
  const low = rows.filter((product) => product.latest_stock > 5);
  const exposureTotal = rows.reduce((sum, product) => sum + exposure(product), 0);
  const tableSort = useSortedRows(rows, "stock", {
    product: (product: StockAlert) => product.product_id,
    category: (product: StockAlert) => product.category,
    brand: (product: StockAlert) => product.brand,
    price: (product: StockAlert) => product.current_price,
    stock: (product: StockAlert) => product.latest_stock,
    exposure: (product: StockAlert) => exposure(product),
    snapshot: (product: StockAlert) => product.latest_snapshot_date,
  }, "asc");

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Stock below the review line"
        title="Inventory"
        question="What inventory requires attention, and what revenue sits on thin stock?"
        caption={`Latest ${LIMIT} low-stock products (under 20 units), thinnest first. Bands below group the returned set for review.`}
      />

      {stock.isError ? (
        <StackError message="Couldn't load low-stock products." retry={() => stock.refetch()} />
      ) : stock.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing below 20 units" body="When stock is thin, products appear here for reorder review." />
      ) : (
        <>
          <section aria-label="Inventory health">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              <Metric
                label="Critical · 5 units or fewer"
                value={critical.length.toLocaleString("en-IN")}
                scope={`Returned set of ${rows.length}`}
                interpretation="Confirm inbound supply before promising delivery dates."
                tone={critical.length > 0 ? "attention" : "normal"}
              />
              <Metric
                label="Low · 6 to 19 units"
                value={low.length.toLocaleString("en-IN")}
                scope={`Returned set of ${rows.length}`}
                interpretation="Confirm demand and inbound supply before reordering."
              />
              <Metric
                label="Revenue exposure (est.)"
                value={formatINR(exposureTotal, 0)}
                scope="Returned set"
                interpretation="Price times stock across the set — a review estimate, not a booked figure."
              />
            </div>
            <Card className="mt-4 shadow-none">
              <CardContent>
                <MeterRow
                  label="Share of the set at critical levels"
                  value={critical.length}
                  max={Math.max(rows.length, 1)}
                  valueLabel={`${critical.length.toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")}`}
                  secondary="Critical means 5 units or fewer in the latest snapshot."
                />
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="review-heading" className="space-y-3">
            <h2 id="review-heading" className="font-serif text-xl">Review list</h2>
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Thinnest stock first · up to {LIMIT} products</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <p className="px-4 py-2 text-xs text-muted-foreground sm:hidden">Scroll horizontally to view all inventory fields.</p>
                  <Table>
                    <caption className="sr-only">Low-stock products with price, stock, estimated revenue exposure and snapshot date.</caption>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <SortTh label="Product" column="product" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} />
                        <SortTh label="Category" column="category" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} />
                        <SortTh label="Brand" column="brand" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} />
                        <SortTh label="Price" column="price" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                        <SortTh label="Stock" column="stock" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                        <SortTh label="Exposure (est.)" column="exposure" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                        <SortTh label="Snapshot" column="snapshot" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableSort.sorted.map((product) => (
                        <TableRow key={product.product_id}>
                          <TableCell className="evidence font-medium">
                            <Link to={`/products/${product.product_id}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                              {product.product_id}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{product.category}</TableCell>
                          <TableCell className="text-muted-foreground">{product.brand}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatINR(product.current_price, 0)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-destructive">{product.latest_stock}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatINR(exposure(product), 0)}</TableCell>
                          <TableCell className="evidence whitespace-nowrap text-right text-muted-foreground">{product.latest_snapshot_date}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <Lineage metric="low-stock review" endpoint="GET /stats/stock-critical" gold="inventory_kpis" />
    </div>
  );
}
