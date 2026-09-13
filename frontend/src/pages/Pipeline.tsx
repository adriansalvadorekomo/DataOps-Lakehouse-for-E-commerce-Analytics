import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { api, formatINR } from "@/lib/api";
import { BACKFILL, WORKSPACE_URL } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StackError } from "@/components/PageHeader";

function Stage({
  index,
  name,
  children,
}: {
  index: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 flex-1">
      <CardHeader className="pb-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{index}</p>
        <CardTitle className="text-[17px] tracking-tight">{name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-[15px]">{children}</CardContent>
    </Card>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono font-medium tabular-nums">{children}</span>;
}

export default function Pipeline() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.overview, staleTime: 60_000 });
  const dq = useQuery({ queryKey: ["dq"], queryFn: api.dqChecks, staleTime: 60_000 });
  const bad = (dq.data ?? []).filter((c) => c.violations > 0);
  const o = overview.data;

  const stages = [
    <Stage key="oltp" index="Live" name="Incoming orders">
      <p>
        <Num>{o ? o.total_orders.toLocaleString("en-IN") : "—"}</Num> orders
      </p>
      <p className="text-muted-foreground">Marketplace books · live</p>
    </Stage>,
    <Stage key="bronze" index="Databricks" name="Landing">
      <p>
        <Num>{BACKFILL.bronze_rows.toLocaleString("en-IN")}</Num> rows
      </p>
      <p className="text-muted-foreground">Snapshot · {BACKFILL.at}</p>
    </Stage>,
    <Stage key="silver" index="Databricks" name="Cleaned records">
      <p>
        <Num>{BACKFILL.silver.length}</Num> entities
      </p>
      <p className="text-muted-foreground">Typed marketplace tables</p>
    </Stage>,
    <Stage key="dq" index="Gate" name="Integrity checks">
      {dq.isError ? (
        <StackError />
      ) : dq.data ? (
        bad.length === 0 ? (
          <p className="inline-flex items-center gap-1.5 text-[15px] font-medium">
            <CheckCircle2 size={16} className="text-[var(--success)]" /> Passing
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-[15px] font-medium text-destructive">
            <XCircle size={16} /> {bad.length} failing
          </p>
        )
      ) : (
        <p className="text-muted-foreground">Checking…</p>
      )}
      <p className="text-muted-foreground">over the live books</p>
    </Stage>,
    <Stage key="gold" index="Databricks" name="Trusted numbers">
      <p>
        <Num>{BACKFILL.gold.length}</Num> published sets
      </p>
      <p className="text-muted-foreground">{o ? formatINR(o.revenue, 0) : "—"} revenue</p>
    </Stage>,
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="How numbers are trusted" question="Orders become published marketplace figures on Databricks — then this console reads the live books." />

      <p className="text-[15px] text-muted-foreground">
        Landing, cleaned records and trusted numbers below are a{" "}
        <strong className="font-medium text-foreground">validation snapshot from {BACKFILL.at}</strong>, not a live
        workspace job. Integrity checks run against the live books.{" "}
        <a href={WORKSPACE_URL} target="_blank" rel="noreferrer" className="hover:underline">
          Open the Databricks workspace
        </a>
        .
      </p>

      <div className="flex flex-col gap-2 xl:flex-row xl:items-stretch">
        {stages.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && <ArrowRight size={16} className="mx-auto shrink-0 self-center text-muted-foreground xl:mx-0" />}
            {s}
          </Fragment>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cleaned marketplace tables</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[15px] text-muted-foreground">{BACKFILL.silver.join(" · ")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Published marketplace numbers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[15px] text-muted-foreground">{BACKFILL.gold.join(" · ")}</p>
            <p className="mt-3 text-[15px]">
              <Link to="/operations" className="hover:underline">
                Check-level status
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
