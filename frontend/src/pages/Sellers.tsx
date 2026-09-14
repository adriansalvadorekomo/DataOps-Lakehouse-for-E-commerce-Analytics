import { useQuery } from "@tanstack/react-query";
import { api, formatINR, formatPercent } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SellerPerf } from "@/lib/api";
import { EmptyState, PageHeader, StackError, TableSkeleton } from "@/components/PageHeader";

function flags(s: SellerPerf): string[] {
  const out: string[] = [];
  if (s.avg_rating < 3.5) out.push("Low rating");
  if (s.delayed_rate > 0.6) out.push("Delays");
  if (s.return_rate > 0.2) out.push("Returns");
  return out;
}

export default function Sellers() {
  const sellers = useQuery({ queryKey: ["sellers50"], queryFn: () => api.sellers(50), staleTime: 60_000 });
  const rows = sellers.data ?? [];
  const flagged = rows.filter((s) => flags(s).length > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sellers"
        question={
          rows.length > 0
            ? `Who performs — and who needs attention. ${flagged.length} of ${rows.length} on this list need a look.`
            : "Who performs — and who needs attention."
        }
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Performance · top 50 by revenue</CardTitle>
          <details className="text-[13px] text-muted-foreground">
            <summary className="cursor-pointer">How attention thresholds work</summary>
            <p className="mt-1">Attention means rating below 3.5, delayed delivery above 60% of completed orders, or returns above 20% of lines.</p>
          </details>
        </CardHeader>
        <CardContent className="p-0">
          {sellers.isError ? (
            <div className="p-5">
              <StackError message="Couldn't load the top 50 sellers." retry={() => sellers.refetch()} />
            </div>
          ) : sellers.isLoading ? (
            <TableSkeleton cols={7} />
          ) : rows.length === 0 ? (
            <EmptyState title="No sellers to rank" body="Seller quality appears once orders are on the books." />
          ) : (
            <Table>
              <caption className="sr-only">Top 50 sellers by revenue with ratings, delayed delivery rates, return rates and attention flags.</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">Seller</TableHead>
                  <TableHead scope="col" className="text-right">Revenue</TableHead>
                  <TableHead scope="col" className="text-right">Lines</TableHead>
                  <TableHead scope="col" className="text-right">Rating</TableHead>
                  <TableHead scope="col" className="text-right">Delayed (of completed)</TableHead>
                  <TableHead scope="col" className="text-right">Returned</TableHead>
                  <TableHead scope="col" className="text-right">Attention</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const f = flags(s);
                  return (
                    <TableRow key={s.seller_id} className={cn(f.length > 0 && "bg-destructive/[0.04]")}>
                      <TableCell className="font-mono font-medium">{s.seller_id}</TableCell>
                      <TableCell className="text-right font-mono font-medium tabular-nums">{formatINR(s.revenue, 0)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{s.lines.toLocaleString("en-IN")}</TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", s.avg_rating < 3.5 ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {s.avg_rating.toFixed(1)}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", s.delayed_rate > 0.6 ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {formatPercent(s.delayed_rate, 0)}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", s.return_rate > 0.2 ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {formatPercent(s.return_rate, 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {f.length > 0 ? (
                          <span className="text-[13px] font-medium text-destructive">{f.join(" · ")}</span>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
