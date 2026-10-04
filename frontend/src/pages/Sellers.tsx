import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatINR, formatPercent, type SellerPerf } from "@/lib/api";
import { SELLER_ATTENTION } from "@/lib/constants";
import { cn, useSortedRows } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Disclosure } from "@/components/Disclosure";
import { Metric } from "@/components/Metric";
import { SegmentedControl } from "@/components/SegmentedControl";
import { EmptyState, Field, PageHeader, SortTh, StackError, TableSkeleton } from "@/components/PageHeader";

const FILTERS = ["all", "attention"] as const;
type SellerFilter = (typeof FILTERS)[number];

function flags(seller: SellerPerf): string[] {
  const result: string[] = [];
  if (seller.avg_rating < SELLER_ATTENTION.ratingBelow) result.push("Low rating");
  if (seller.delayed_rate > SELLER_ATTENTION.delayedAbove) result.push("Delays");
  if (seller.return_rate > SELLER_ATTENTION.returnsAbove) result.push("Returns");
  return result;
}

export default function Sellers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SellerFilter>(searchParams.get("attention") === "1" ? "attention" : "all");
  const sellers = useQuery({ queryKey: ["sellers50"], queryFn: () => api.sellers(50), staleTime: 60_000 });
  const rows = sellers.data ?? [];
  const flaggedCount = rows.filter((seller) => flags(seller).length > 0).length;
  const normalizedSearch = search.trim().toLocaleLowerCase("en-IN");
  const filteredRows = rows.filter(
    (seller) => seller.seller_id.toLocaleLowerCase("en-IN").includes(normalizedSearch)
      && (filter === "all" || flags(seller).length > 0),
  );
  const filtersActive = normalizedSearch.length > 0 || filter !== "all";

  const setRevenue = rows.reduce((sum, seller) => sum + seller.revenue, 0);
  const setRating = rows.length > 0 ? rows.reduce((sum, seller) => sum + seller.avg_rating, 0) / rows.length : null;
  const worstDelayed = rows.length > 0 ? [...rows].sort((a, b) => b.delayed_rate - a.delayed_rate)[0] : null;

  const tableSort = useSortedRows(filteredRows, "revenue", {
    seller: (seller: SellerPerf) => seller.seller_id,
    revenue: (seller: SellerPerf) => seller.revenue,
    lines: (seller: SellerPerf) => seller.lines,
    rating: (seller: SellerPerf) => seller.avg_rating,
    delayed: (seller: SellerPerf) => seller.delayed_rate,
    returned: (seller: SellerPerf) => seller.return_rate,
  });

  function resetFilters() {
    setSearch("");
    setFilter("all");
    setSearchParams({}, { replace: true });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Seller performance"
        title="Sellers"
        question={rows.length > 0 ? `${flaggedCount} of ${rows.length} sellers in the top-50 revenue set need attention.` : "Who performs — and who needs attention?"}
        caption="Search and attention filters are applied locally within the top 50 sellers by revenue; they do not search every seller in the marketplace."
      />

      <div className="grid gap-4 border-y border-border bg-card/60 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-5">
        <Field label="Search seller ID within top 50" htmlFor="seller-search">
          <Input id="seller-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11" autoComplete="off" />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <SegmentedControl label="Show sellers" value={filter} onChange={setFilter} options={FILTERS} getOptionLabel={(option) => option === "all" ? "All" : "Attention"} />
          {filtersActive && <Button type="button" variant="outline" className="min-h-11" onClick={resetFilters}>Reset filters</Button>}
        </div>
      </div>

      <Disclosure summary="How attention thresholds work" eyebrow="Top-50 screening rules">
        Attention means rating below {SELLER_ATTENTION.ratingBelow.toFixed(1)}, delayed delivery above {formatPercent(SELLER_ATTENTION.delayedAbove, 0)} of completed orders, or returns above {formatPercent(SELLER_ATTENTION.returnsAbove, 0)} of lines.
      </Disclosure>

      {sellers.isError ? (
        <StackError message="Couldn't load the top 50 sellers." retry={() => sellers.refetch()} />
      ) : sellers.isLoading ? (
        <p role="status" className="text-[15px] text-muted-foreground">Summarizing the top-50 set…</p>
      ) : rows.length > 0 ? (
        <section aria-label="Top-50 set summary">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Need attention" value={`${flaggedCount} of ${rows.length}`} scope="Top 50 by revenue" interpretation="Sellers tripping any screening rule in the returned set." tone={flaggedCount > 0 ? "attention" : "normal"} />
            <Metric label="Set revenue" value={formatINR(setRevenue, 0)} scope="Top 50 by revenue" interpretation="Revenue across the returned set; no period comparison." />
            <Metric label="Average rating" value={setRating == null ? "—" : setRating.toFixed(1)} scope="Top 50 by revenue" interpretation="Mean of current seller ratings in the returned set." />
            <Metric label="Highest delayed share" value={worstDelayed == null ? "—" : formatPercent(worstDelayed.delayed_rate, 0)} scope="Top 50 by revenue" interpretation={worstDelayed ? `Highest belongs to ${worstDelayed.seller_id}.` : undefined} tone="attention" />
          </div>
        </section>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Performance · {filteredRows.length.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")} shown</CardTitle>
          <p className="text-[13px] text-muted-foreground">Top 50 by revenue; current search and attention filters are local to this returned set.</p>
        </CardHeader>
        <CardContent className="p-0">
          {sellers.isError ? (
            <div className="p-5"><StackError message="Couldn't load the top 50 sellers." retry={() => sellers.refetch()} /></div>
          ) : sellers.isLoading ? (
            <TableSkeleton cols={7} />
          ) : rows.length === 0 ? (
            <EmptyState title="No sellers to rank" body="Seller quality appears once orders are on the books." />
          ) : filteredRows.length === 0 ? (
            <EmptyState title="No sellers match these filters" body="Reset the local top-50 filters or try a different seller ID." />
          ) : (
            <div className="overflow-x-auto">
              <p className="px-4 py-2 text-xs text-muted-foreground sm:hidden">Scroll horizontally to view every seller measure.</p>
              <Table>
                <caption className="sr-only">Filtered results within the top 50 sellers by revenue, with ratings, delayed delivery rates, return rates and attention flags.</caption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortTh label="Seller" column="seller" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} />
                    <SortTh label="Revenue" column="revenue" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                    <SortTh label="Lines" column="lines" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                    <SortTh label="Rating" column="rating" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                    <SortTh label="Delayed (of completed)" column="delayed" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                    <SortTh label="Returned" column="returned" activeColumn={tableSort.sortKey} direction={tableSort.direction} onToggle={tableSort.toggle} align="right" />
                    <TableHead scope="col">Attention</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableSort.sorted.map((seller) => {
                    const sellerFlags = flags(seller);
                    return (
                      <TableRow key={seller.seller_id} className={cn(sellerFlags.length > 0 && "bg-destructive/[0.04]") }>
                        <TableCell className="evidence font-medium">
                          <Link to={`/sellers/${seller.seller_id}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                            {seller.seller_id}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatINR(seller.revenue, 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{seller.lines.toLocaleString("en-IN")}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", seller.avg_rating < SELLER_ATTENTION.ratingBelow ? "font-medium text-destructive" : "text-muted-foreground")}>{seller.avg_rating.toFixed(1)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", seller.delayed_rate > SELLER_ATTENTION.delayedAbove ? "font-medium text-destructive" : "text-muted-foreground")}>{formatPercent(seller.delayed_rate, 0)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", seller.return_rate > SELLER_ATTENTION.returnsAbove ? "font-medium text-destructive" : "text-muted-foreground")}>{formatPercent(seller.return_rate, 0)}</TableCell>
                        <TableCell><div className="flex min-w-40 flex-wrap gap-1.5">{sellerFlags.length > 0 ? sellerFlags.map((flag) => <Badge key={flag} variant="destructive">{flag}</Badge>) : <span className="text-[13px] text-muted-foreground">No flags</span>}</div></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
