import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { api, type ReturnHotspots, type StockCover } from "@/lib/api";
import { inr, int, pct } from "@/lib/format";
import { usePeriod } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/data/DataTable";
import { KpiInfo } from "@/components/data/KpiInfo";
import { KpiTile } from "@/components/data/KpiTile";
import { Tag } from "@/components/data/Badges";
import { PageHeader, SectionTitle } from "@/components/data/PageHeader";
import { ErrorState, Skeleton } from "@/components/data/States";
import { useReveal } from "@/components/data/useReveal";

type Item = StockCover["items"][number];
type Pair = ReturnHotspots["pairs"][number];

export function Inventory() {
  const [days] = usePeriod();
  const scope = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const cover = useQuery({ queryKey: ["stock-cover"], queryFn: () => api.stockCover(200) });
  const hot = useQuery({ queryKey: ["hotspots", days], queryFn: () => api.returnHotspots(Math.max(days, 90), 25) });
  useReveal(scope, [cover.isSuccess, hot.isSuccess]);
  const c = cover.data;

  const itemCols: ColumnDef<Item, unknown>[] = [
    { accessorKey: "product_id", header: "Product", cell: (x) => <span className="code font-medium">{x.getValue() as string}</span> },
    { id: "what", header: "Brand · category", accessorFn: (r) => `${r.brand} · ${r.category}` },
    { accessorKey: "stock", header: "In stock", meta: { numeric: true }, cell: (x) => <span className={cn((x.getValue() as number) === 0 && "font-semibold text-signal-ink")}>{int(x.getValue() as number)}</span> },
    { accessorKey: "units_sold", header: "Sold (30 d)", meta: { numeric: true } },
    {
      accessorKey: "days_of_cover", header: "Days of stock left", meta: { numeric: true },
      sortingFn: (a, b) => (a.original.days_of_cover ?? 1e9) - (b.original.days_of_cover ?? 1e9),
      cell: (x) => {
        const v = x.getValue() as number | null;
        if (x.row.original.stock === 0) return <Tag tone="signal">out of stock</Tag>;
        if (v === null) return <span className="text-ink-3">no recent sales</span>;
        return <span className={cn("font-semibold", v <= 7 ? "text-signal-ink" : v <= 14 ? "text-warn" : "")}>{v.toFixed(1)}</span>;
      },
    },
    { accessorKey: "revenue", header: "Revenue (30 d)", meta: { numeric: true }, cell: (x) => inr(x.getValue() as number) },
    { accessorKey: "current_price", header: "Price", meta: { numeric: true }, cell: (x) => inr(x.getValue() as number, { compact: false }) },
  ];
  const pairCols: ColumnDef<Pair, unknown>[] = [
    { id: "pair", header: "Brand in category", accessorFn: (r) => `${r.brand} · ${r.category}`, cell: (x) => <span className="font-medium">{x.getValue() as string}</span> },
    { accessorKey: "orders", header: "Orders", meta: { numeric: true }, cell: (x) => int(x.getValue() as number) },
    { accessorKey: "return_rate", header: "Return rate", meta: { numeric: true }, cell: (x) => pct(x.getValue() as number) },
    { accessorKey: "lift", header: "vs usual rate", meta: { numeric: true }, cell: (x) => `${(x.getValue() as number).toFixed(1)}×` },
    {
      accessorKey: "z", header: "Unusual?", meta: { numeric: true },
      cell: (x) => ((x.getValue() as number) >= 2
        ? <Tag tone="signal">Yes</Tag>
        : <span className="text-ink-3">Within normal range</span>),
    },
    { accessorKey: "refunded", header: "Refunded", meta: { numeric: true }, cell: (x) => inr(x.getValue() as number) },
  ];

  return (
    <div ref={scope}>
      <PageHeader
        kicker="Operations · inventory"
        title="What runs out first, and what comes back?"
        question="Products running low, ranked by how many days their stock will last at the current sales pace — and the brands that come back far more often than usual."
        decision="What to reorder today, what to delist, and which brands to inspect."
        asOf={c?.as_of}
      />
      {cover.isError && <ErrorState error={cover.error} />}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Products in the catalog" value={c?.products} format={int} />
        <KpiTile label="Running low (under 20 units)" kpiId="K8" value={c?.critical} format={int} note={c ? `${pct(c.critical / Math.max(c.products, 1))} of the catalog` : undefined} />
        <KpiTile label="Out of stock" value={c?.out_of_stock} format={int} tone="signal" />
        <KpiTile label="Usual return rate" kpiId="K3" value={hot.data?.baseline_return_rate} format={(n) => pct(n)} note={`last ${Math.max(days, 90)} days`} />
      </div>

      <SectionTitle id="reorder" title="Reorder list" note={c ? `Days of stock left = units in stock ÷ units sold per day over the last ${c.velocity_days} days. Products that still sell come first; products already out of stock come last.` : undefined} right={<KpiInfo id="K8" />} />
      <section className="panel reveal mb-8 p-5">
        {c ? <DataTable data={c.items} columns={itemCols} pageSize={15} onRowClick={(r) => navigate(`/products/${r.product_id}`)} /> : <Skeleton className="h-[420px]" />}
      </section>

      <SectionTitle id="returns" title="Return hotspots"
        note={hot.data ? `Each brand within a category, compared with the usual ${pct(hot.data.baseline_return_rate)} return rate. "Unusual" means the gap is too large to be chance. Brands with fewer than ${hot.data.min_orders} orders are left out.` : undefined}
        right={<KpiInfo id="K12" />} />
      <section className="panel reveal p-5">
        {hot.data ? <DataTable data={hot.data.pairs} columns={pairCols} pageSize={10} initialSort={[{ id: "z", desc: true }]} /> : <Skeleton className="h-[300px]" />}
      </section>
    </div>
  );
}
