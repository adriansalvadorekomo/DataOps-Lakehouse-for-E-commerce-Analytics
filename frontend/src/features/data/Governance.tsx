import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { CheckCircle2, CircleAlert, PlayCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, type ExpectationResult } from "@/lib/api";
import { int, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tag } from "@/components/data/Badges";
import { SUITE_LABEL, TRIGGER_LABEL, ruleLabel } from "./plain";
import { Dots, EmptyState, Skeleton } from "@/components/data/States";

export function ExpectationRow({ r }: { r: ExpectationResult }) {
  const Icon = r.success ? CheckCircle2 : r.severity === "critical" ? CircleAlert : TriangleAlert;
  return (
    <li className="grid grid-cols-[18px_150px_1fr_auto] items-start gap-3 border-b border-line/70 py-2.5 text-[13px] last:border-0">
      <Icon className={cn("mt-0.5 size-4", r.success ? "text-good" : r.severity === "critical" ? "text-signal" : "text-warn")} />
      <span className="text-[12.5px] font-medium text-ink-2">{ruleLabel(r.rule)}</span>
      <span>
        <span className="text-ink">{r.why}</span>
        {!r.success && r.sample.length > 0 && <span className="block text-[12px] text-ink-3">For example: {r.sample.slice(0, 3).map(String).join(", ")}</span>}
      </span>
      <span className="num text-right">
        {r.success ? <span className="text-ink-3">{r.element_count !== null ? `${int(r.element_count)} rows` : "ok"}</span>
          : <span className={cn("font-semibold", r.severity === "critical" ? "text-signal-ink" : "text-warn")}>{int(Number(r.unexpected_count ?? 0))} records</span>}
      </span>
    </li>
  );
}

/** Automatic checks on the live records (run with Great Expectations; see docs/product.md). */
export function Governance() {
  const qc = useQueryClient();
  const latest = useQuery({ queryKey: ["governance-latest"], queryFn: api.governanceLatest, retry: false });
  const runs = useQuery({
    queryKey: ["governance-runs"], queryFn: api.governanceRuns,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : false),
  });
  const running = runs.data?.some((r) => r.status === "running");
  const start = useMutation({
    mutationFn: api.governanceRun,
    onSuccess: () => { toast.message("Checking the records…", { description: "Every table is being checked. This takes a few seconds." }); qc.invalidateQueries({ queryKey: ["governance-runs"] }); },
  });
  // When a run finishes, load its results.
  const newestFinished = runs.data?.find((r) => r.status !== "running")?.run_id;
  useEffect(() => {
    if (newestFinished !== undefined) qc.invalidateQueries({ queryKey: ["governance-latest"] });
  }, [newestFinished, qc]);
  const bySuite = useMemo(() => {
    const m = new Map<string, ExpectationResult[]>();
    latest.data?.results?.forEach((r) => m.set(r.suite, [...(m.get(r.suite) ?? []), r]));
    return [...m.entries()];
  }, [latest.data]);
  const noRun = latest.error instanceof ApiError && latest.error.status === 404;
  const L = latest.data;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-sans text-[15px] font-semibold">Checks on the records</h3>
              {L && <Tag tone={L.status === "passed" ? "good" : L.status === "warning" ? "warn" : "signal"}>{L.status === "passed" ? "all passed" : L.status === "warning" ? "to tidy up" : "problems"}</Tag>}
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {L ? `Checked ${relativeTime(L.finished_at)} · ${L.successful} of ${L.evaluated} checks passed · ${L.critical_failures} serious problem${L.critical_failures === 1 ? "" : "s"}, ${L.warnings} to tidy up.`
                : "Every table of the records is checked for missing, duplicated, inconsistent or impossible values."}
            </p>
          </div>
          <button onClick={() => start.mutate()} disabled={running || start.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-canvas disabled:opacity-50">
            {running ? <><Dots /> Checking</> : <><PlayCircle className="size-4" /> Check now</>}
          </button>
        </div>
        {latest.isLoading && <Skeleton className="h-[300px]" />}
        {noRun && !running && <EmptyState title="Not checked yet">Run the checks to see each one and its result. They also run automatically after every import.</EmptyState>}
        <div className="space-y-5">
          {bySuite.map(([suite, rows]) => (
            <div key={suite}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[13px] font-semibold">{SUITE_LABEL[suite] ?? suite}</span>
                <span className="text-[12px] text-ink-3">{rows.filter((r) => r.success).length}/{rows.length}</span>
              </div>
              <ul>{rows.map((r, i) => <ExpectationRow key={i} r={r} />)}</ul>
            </div>
          ))}
        </div>
      </section>
      <aside className="panel h-fit p-5">
        <div className="label mb-3">Recent checks</div>
        <ul className="space-y-2 text-[13px]">
          {runs.data?.length === 0 && <li className="text-ink-3">No runs yet.</li>}
          {runs.data?.map((r) => (
            <li key={r.run_id} className="flex items-center justify-between gap-2">
              <span className="num text-ink-3">#{r.run_id}</span>
              <span className="text-ink-2">{TRIGGER_LABEL[r.trigger] ?? r.trigger}</span>
              <Tag tone={r.status === "passed" ? "good" : r.status === "warning" ? "warn" : r.status === "running" ? "violet" : "signal"}>{r.status === "passed" ? "all passed" : r.status === "warning" ? "to tidy up" : r.status === "running" ? "checking" : "problems"}</Tag>
              <span className="text-[12px] text-ink-3">{relativeTime(r.started_at)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-3">
          <span className="font-semibold text-signal-ink">Serious problems</span> mean some reported numbers may be wrong. <span className="font-semibold text-warn">Things to tidy up</span> don't change the numbers but should be fixed where the data comes from.
        </p>
      </aside>
    </div>
  );
}
