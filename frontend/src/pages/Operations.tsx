import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatINR, formatPercent } from "@/lib/api";
import { dqDetail, dqTitle } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PageHeader, StackError, TableSkeleton } from "@/components/PageHeader";

const STALE = 60_000;

export default function Operations() {
  const cities = useQuery({ queryKey: ["cities"], queryFn: api.cities, staleTime: STALE });
  const stock = useQuery({ queryKey: ["stock"], queryFn: () => api.stockCritical(50), staleTime: STALE });
  const dq = useQuery({ queryKey: ["dq"], queryFn: api.dqChecks, staleTime: STALE });
  const bad = (dq.data ?? []).filter((c) => c.violations > 0);

  return (
    <div className="space-y-10">
      <PageHeader title="Needs action" question="What should fulfillment and inventory look at today?" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shipping by metro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cities.isError && <StackError />}
            {(cities.data ?? []).map((c) => (
              <div key={c.city} className="flex items-baseline justify-between gap-4 text-[15px]">
                <span className="font-medium">{c.city}</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {formatPercent(c.delayed_rate, 0)} delayed · {formatPercent(c.return_rate, 0)} returned
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Integrity of the live books</CardTitle>
            {dq.data &&
              (bad.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--success)]">
                  <CheckCircle2 size={14} /> Passing
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-destructive">
                  <XCircle size={14} /> {bad.length} failing
                </span>
              ))}
          </CardHeader>
          <CardContent className="p-0">
            {dq.isError ? (
              <div className="p-5">
                <StackError />
              </div>
            ) : dq.isLoading ? (
              <TableSkeleton cols={2} />
            ) : (
              <Table>
                <TableBody>
                  {(dq.data ?? []).map((c) => (
                    <TableRow key={c.rule}>
                      <TableCell>
                        <p className="font-medium">{dqTitle(c.rule)}</p>
                        <details className="mt-0.5">
                          <summary className="cursor-pointer text-[13px] text-muted-foreground">Why this matters</summary>
                          <p className="mt-1 text-[13px] text-muted-foreground">
                            {dqDetail(c.rule)} <span className="font-mono">({c.rule})</span>
                          </p>
                        </details>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {c.violations === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[var(--success)]">
                            <CheckCircle2 size={14} /> 0
                          </span>
                        ) : (
                          <span className="font-medium text-destructive">{c.violations.toLocaleString("en-IN")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Restock first · lowest stock</CardTitle>
          <Link to="/orders" className="text-[15px] hover:underline">
            Orders
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {stock.isError ? (
            <div className="p-5">
              <StackError />
            </div>
          ) : stock.isLoading ? (
            <TableSkeleton />
          ) : (stock.data ?? []).length === 0 ? (
            <EmptyState title="Nothing below 20 units" body="When stock is thin, products appear here for reorder." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stock.data ?? []).map((p) => (
                  <TableRow key={p.product_id}>
                    <TableCell className="font-mono font-medium">{p.product_id}</TableCell>
                    <TableCell className="text-muted-foreground">{p.category}</TableCell>
                    <TableCell className="text-muted-foreground">{p.brand}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatINR(p.current_price, 0)}</TableCell>
                    <TableCell className="text-right font-mono font-medium tabular-nums text-destructive">{p.latest_stock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
