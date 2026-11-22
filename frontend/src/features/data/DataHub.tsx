import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { api, type ImportBatch } from "@/lib/api";
import { date, inr, int, relativeTime } from "@/lib/format";
import { KPIS } from "@/lib/kpi";
import { DataTable } from "@/components/data/DataTable";
import { Tag } from "@/components/data/Badges";
import { PageHeader, SectionTitle } from "@/components/data/PageHeader";
import { Skeleton } from "@/components/data/States";
import { Governance } from "./Governance";
import { ImportPanel } from "./ImportPanel";

export function DataHub() {
  const navigate = useNavigate();
  const fresh = useQuery({ queryKey: ["freshness"], queryFn: api.freshness });
  const imports = useQuery({
    queryKey: ["imports"], queryFn: api.imports,
    refetchInterval: (q) => (q.state.data?.some((b) => b.status === "processing") ? 2500 : false),
  });
  const trust = useQuery({ queryKey: ["trust"], queryFn: api.trust });

  const cols: ColumnDef<ImportBatch, unknown>[] = [
    { accessorKey: "batch_id", header: "Import", cell: (c) => <span className="num">#{c.getValue() as number}</span> },
    { accessorKey: "filename", header: "File", cell: (c) => <span className="code">{c.getValue() as string}</span> },
    { accessorKey: "status", header: "Status", cell: (c) => { const s = c.getValue() as string; return <Tag tone={s === "completed" ? "good" : s === "failed" ? "signal" : "violet"}>{s}</Tag>; } },
    { accessorKey: "rows_accepted", header: "Added", meta: { numeric: true }, cell: (c) => int(c.getValue() as number) },
    { accessorKey: "rows_duplicate", header: "Already loaded", meta: { numeric: true }, cell: (c) => int(c.getValue() as number) },
    { accessorKey: "rows_rejected", header: "Rejected", meta: { numeric: true }, cell: (c) => <span className={(c.getValue() as number) ? "font-semibold text-signal-ink" : ""}>{int(c.getValue() as number)}</span> },
    { accessorKey: "revenue_added", header: "Revenue added", meta: { numeric: true }, cell: (c) => inr(c.getValue() as number) },
    { accessorKey: "created_at", header: "When", meta: { numeric: true }, cell: (c) => relativeTime(c.getValue() as string) },
  ];
  const f = fresh.data;

  return (
    <div>
      <PageHeader
        kicker="Trust · data & governance"
        title="Can I trust these numbers, and how does new data get in?"
        question="Bring in new marketplace data, see exactly what was accepted or refused and why, and check that the records can be trusted."
        decision="Whether to report on today's numbers, and what to fix at the source."
        asOf={f?.as_of}
      />

      <div className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { l: "Orders on record", v: f ? int(f.orders) : "—" },
          { l: "Latest order date", v: f ? date(f.as_of) : "—" },
          { l: "Forecast", v: f ? (f.forecast === "current" ? "current" : f.forecast === "stale" ? `${f.forecast_lag_days} days behind` : "not published") : "—", warn: f?.forecast !== "current" },
          { l: "Analytics refresh", v: trust.data?.workflow.label ?? "—" },
        ].map((k) => (
          <div key={k.l} className="panel p-5">
            <div className="text-[13px] text-ink-3">{k.l}</div>
            <div className={`num mt-2 text-[18px] font-semibold ${k.warn ? "text-warn" : ""}`}>{k.v}</div>
          </div>
        ))}
      </div>

      <SectionTitle id="import" title="Bring in new data" note="What happens when new data arrives: validate → append → every window, KPI and signal moves forward on the next load; the forecast is flagged stale until retrained." />
      <div className="mb-6"><ImportPanel /></div>
      <section className="panel mb-10 p-5">
        <h3 className="mb-3 font-sans text-[15px] font-semibold">Import history</h3>
        {imports.data ? (
          <DataTable data={imports.data} columns={cols} pageSize={8} onRowClick={(b) => navigate(`/data/imports/${b.batch_id}`)} empty="No imports yet. Drop a CSV above." />
        ) : <Skeleton className="h-[160px]" />}
      </section>

      <SectionTitle id="governance" title="Data checks" note="Automatic checks that every record is complete, unique, correctly linked, correctly priced and possible. They run on demand and after every import." />
      <div className="mb-10"><Governance /></div>

      <SectionTitle id="glossary" title="How the numbers are calculated" note="Every number in the app links back to one of these definitions." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.values(KPIS).map((k) => (
          <div key={k.id} className="panel p-4">
            <div className="flex items-center gap-2">
              <span className="font-serif text-[16px] font-semibold">{k.name}</span>
              {k.estimated && <Tag tone="warn">estimated</Tag>}
            </div>
            <p className="mt-2 text-[13px] text-ink-2">{k.formula}</p>
            <p className="mt-2 text-[13px] text-ink-3">{k.decision}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
