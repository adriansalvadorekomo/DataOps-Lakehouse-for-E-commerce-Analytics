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

const RUN_STATUS: Record<string, { label: string; dot: string; pill: string }> = {
  passed: { label: "All passed", dot: "bg-good", pill: "bg-good-wash text-good" },
  warning: { label: "To tidy up", dot: "bg-warn", pill: "bg-warn-wash text-warn" },
  running: { label: "Checking", dot: "bg-violet", pill: "bg-violet-wash text-violet" },
  failed: { label: "Problems", dot: "bg-signal", pill: "bg-signal-wash text-signal-ink" },
  error: { label: "Didn't finish", dot: "bg-signal", pill: "bg-signal-wash text-signal-ink" },
};

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
        <div className="mb-4 flex items-center justify-between">
          <span className="label">Recent checks</span>
          {runs.data && runs.data.length > 0 && <span className="text-[12px] text-ink-3">{runs.data.length} shown</span>}
        </div>
        {runs.data?.length === 0 && <p className="text-[13px] text-ink-3">No checks yet.</p>}
        {/* A timeline: one column of dots, one of text, one of statuses — every row aligned. */}
        <ol className="relative">
          {runs.data?.map((r, i) => {
            const s = RUN_STATUS[r.status] ?? RUN_STATUS.failed;
            const last = i === (runs.data?.length ?? 0) - 1;
            return (
              <li key={r.run_id} className="relative grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-3 pb-4 last:pb-0">
                {!last && <span className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-px bg-line" aria-hidden="true" />}
                <span className="relative mt-[5px] flex size-[15px] items-center justify-center rounded-full bg-panel">
                  <span className={cn("size-[9px] rounded-full", s.dot, r.status === "running" && "animate-pulse-dot")} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{TRIGGER_LABEL[r.trigger] ?? r.trigger}</span>
                  <span className="block text-[12px] text-ink-3">{relativeTime(r.started_at)}</span>
                </span>
                <span className={cn("mt-px whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold", s.pill)}>{s.label}</span>
              </li>
            );
          })}
        </ol>
        <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[12.5px]">
          <div className="grid grid-cols-[16px_1fr] gap-x-3">
            <span className="mt-[5px] size-[9px] justify-self-center rounded-full bg-signal" />
            <span className="text-ink-3"><span className="font-semibold text-ink-2">Problems</span> — some reported numbers may be wrong.</span>
          </div>
          <div className="grid grid-cols-[16px_1fr] gap-x-3">
            <span className="mt-[5px] size-[9px] justify-self-center rounded-full bg-warn" />
            <span className="text-ink-3"><span className="font-semibold text-ink-2">To tidy up</span> — numbers are fine; fix it where the data comes from.</span>
          </div>
          <div className="grid grid-cols-[16px_1fr] gap-x-3">
            <span className="mt-[5px] size-[9px] justify-self-center rounded-full bg-good" />
            <span className="text-ink-3"><span className="font-semibold text-ink-2">All passed</span> — every check holds.</span>
          </div>
        </dl>
      </aside>
    </div>
  );
}
