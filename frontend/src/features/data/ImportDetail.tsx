import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { date, inr, int, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BackLink, Fact } from "@/components/data/EntityParts";
import { DotBar } from "@/components/data/DotMatrix";
import { PageHeader } from "@/components/data/PageHeader";
import { Dots, ErrorState, PageLoading } from "@/components/data/States";
import { Tag } from "@/components/data/Badges";
import { ExpectationRow } from "./Governance";
import { ruleLabel } from "./plain";

export function ImportDetail() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["import", id], queryFn: () => api.importBatch(Number(id)),
    refetchInterval: (x) => (x.state.data?.status === "processing" ? 1500 : false),
  });
  if (q.isLoading) return <PageLoading />;
  if (q.isError || !q.data) return <><BackLink to="/data" label="Data & governance" /><ErrorState error={q.error} title={`Import #${id} could not load`} /></>;
  const b = q.data;
  const total = Math.max(b.rows_total, 1);
  const rules = Object.entries(b.rejections_by_rule);
  return (
    <div>
      <BackLink to="/data" label="Data & governance" />
      <PageHeader
        kicker={`Import #${b.batch_id} · ${relativeTime(b.created_at)}`}
        title={b.filename}
        question={b.status === "processing" ? "Checking every row…" : b.status === "failed" ? `The file was refused: ${b.error}` :
          `${int(b.rows_accepted)} new orders added${b.first_order_date ? ` (${date(b.first_order_date)} → ${date(b.last_order_date)})` : ""}, ${int(b.rows_duplicate)} already known, ${int(b.rows_rejected)} rejected.`}
        actions={<Tag tone={b.status === "completed" ? "good" : b.status === "failed" ? "signal" : "violet"}>{b.status}</Tag>}
      />
      {b.status === "processing" && <div className="mb-6 flex items-center gap-3 text-[13.5px] text-ink-2"><Dots /> Checking every row before it is added…</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Fact label="Rows in the file" value={int(b.rows_total)} />
        <Fact label="Added" value={int(b.rows_accepted)} tone="good" />
        <Fact label="Already loaded (skipped)" value={int(b.rows_duplicate)} />
        <Fact label="Rejected" value={int(b.rows_rejected)} tone={b.rows_rejected ? "signal" : undefined} />
        <Fact label="Revenue added" value={inr(b.revenue_added)} />
      </div>
      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <section className="panel p-5">
          <h3 className="mb-4 font-sans text-[15px] font-semibold">Where the rows went</h3>
          <ul className="space-y-3 text-[13.5px]">
            {[["Added", b.rows_accepted, "good"], ["Already loaded", b.rows_duplicate, "ink"], ["Rejected", b.rows_rejected, "signal"]].map(([l, n, t]) => (
              <li key={l as string} className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
                <span>{l}</span><DotBar value={(n as number) / total} dots={30} tone={t as "good"} /><span className="num">{int(n as number)}</span>
              </li>
            ))}
          </ul>
          {rules.length > 0 && (
            <>
              <h4 className="label mb-2 mt-6">Why rows were refused</h4>
              <ul className="space-y-1.5 text-[13px]">
                {rules.map(([r, n]) => <li key={r} className="flex justify-between"><span>{ruleLabel(r)}</span><span className="num font-semibold text-signal-ink">{int(n)}</span></li>)}
              </ul>
            </>
          )}
        </section>
        <section className="panel p-5">
          <h3 className="font-sans text-[15px] font-semibold">Checks on this file</h3>
          <p className="mb-3 mt-1 text-[13px] text-ink-3">
            {b.governance ? `${b.governance.successful} of ${b.governance.evaluated} checks passed for every row · checked in ${b.governance.seconds}s` : "The file was refused before its rows could be checked."}
          </p>
          <ul className="max-h-[340px] overflow-y-auto">
            {b.governance?.expectations.filter((r) => !r.success).map((r, i) => <ExpectationRow key={i} r={r} />)}
            {b.governance && b.governance.expectations.every((r) => r.success) && <li className="text-[13px] text-good">Every check passed.</li>}
          </ul>
        </section>
      </div>
      {b.rejections && b.rejections.length > 0 && (
        <section className="panel p-5">
          <h3 className="mb-1 font-sans text-[15px] font-semibold">Rejected rows</h3>
          <p className="mb-3 text-[13px] text-ink-3">Fix these at the source and re-upload the file: rows already imported are skipped automatically.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead><tr className="border-b border-line"><th className="label py-2 text-left">Line</th><th className="label py-2 text-left">Problem</th><th className="label py-2 text-left">Why</th><th className="label py-2 text-left">Row</th></tr></thead>
              <tbody>
                {b.rejections.map((r) => (
                  <tr key={r.line_no} className="border-b border-line/70 align-top last:border-0">
                    <td className="num py-2">{r.line_no}</td>
                    <td className="py-2 font-medium text-signal-ink">{ruleLabel(r.rule)}</td>
                    <td className="py-2">{r.message}</td>
                    <td className={cn("code py-2 text-[11.5px] text-ink-3")}>{[r.raw.user_id, r.raw.product_id, r.raw.purchase_date, r.raw.final_price].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
