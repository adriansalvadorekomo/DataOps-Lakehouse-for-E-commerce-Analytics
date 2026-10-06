import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Disclosure } from "@/components/Disclosure";
import { MeterRow } from "@/components/MeterRow";
import { EmptyState, PageHeader, PageSkeleton, StackError } from "@/components/PageHeader";
import { TrustStatus } from "@/components/TrustStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, formatINR, type TrustStatus as TrustEvidence } from "@/lib/api";
import { WORKSPACE_URL } from "@/lib/constants";

const trustQuery = {
  queryKey: ["trust-status"] as const,
  queryFn: api.trustStatus,
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchInterval: false as const,
};

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value: string | null | undefined): string {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date) : "Not available";
}

function dateTimeLabel(value: string | null | undefined): string {
  const date = validDate(value);
  return date
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date)
    : "Not available";
}

function durationLabel(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "Not available";
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

function resultLabel(value: string): string {
  return value ? value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) : "Not available";
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-border pt-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Stage({
  number,
  title,
  status,
  children,
}: {
  number: string;
  title: string;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-7 last:pb-0">
      <div className="relative z-10 grid size-8 place-items-center rounded-full border border-border bg-background font-mono text-xs font-medium tabular-nums">
        {number}
      </div>
      <Card className="min-w-0 shadow-none">
        <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="text-lg tracking-tight">{title}</CardTitle>
          <div className="shrink-0">{status}</div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function MissingEvidence({ data }: { data: TrustEvidence }) {
  const missing: string[] = [];
  if (data.live_books.status !== "passing") missing.push(data.live_books.summary);
  if (data.workflow.status !== "succeeded") missing.push(data.workflow.business_impact);
  if (data.forecast.status !== "current") missing.push(data.forecast.summary);
  if (data.genie.status !== "ready") missing.push(data.genie.summary);
  if (missing.length === 0) return null;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="text-sm font-medium text-foreground">Evidence still needed</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
        {missing.map((item) => <li key={item}>— {item}</li>)}
      </ul>
    </div>
  );
}

export default function Pipeline() {
  const evidence = useQuery(trustQuery);

  if (evidence.isLoading) return <PageSkeleton />;
  if (evidence.isError || !evidence.data) {
    return <StackError message="Trust evidence could not be loaded. No live status is being shown." retry={() => evidence.refetch()} />;
  }

  const data = evidence.data;
  const run = data.workflow.last_run;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data trust center"
        title="Why should I trust the numbers I’m seeing?"
        question="A plain-language view of the evidence behind marketplace reporting, from source records to published numbers."
        meta={<span>Evidence checked {dateTimeLabel(data.checked_at)}</span>}
        action={
          <Button variant="outline" onClick={() => evidence.refetch()} disabled={evidence.isFetching} aria-label="Refresh trust evidence">
            <RefreshCw className={evidence.isFetching ? "animate-spin" : ""} aria-hidden="true" />
            {evidence.isFetching ? "Refreshing evidence…" : "Refresh evidence"}
          </Button>
        }
      />

      <section className="panel p-4 sm:p-5" aria-labelledby="overall-trust-title">
        <p id="overall-trust-title" className="section-kicker mb-3">
          Overall evidence
        </p>
        <TrustStatus {...data.overall} variant="full" />
        <MissingEvidence data={data} />
      </section>

      <section aria-labelledby="evidence-title">
        <div className="mb-6">
          <p className="section-kicker section-kicker--ember">Evidence chain</p>
          <h2 id="evidence-title" className="mt-1 text-lg font-semibold tracking-tight">What the evidence says</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Data collected → Records checked → Marketplace numbers prepared. Each step below shows its own actual status; later evidence does not erase an earlier issue.
          </p>
        </div>

        <div className="relative before:absolute before:bottom-4 before:left-[0.95rem] before:top-4 before:w-px before:bg-border">
          <Stage
            number="1"
            title="Data available · Live marketplace books"
            status={<TrustStatus status={data.live_books.status} label={data.live_books.label} />}
          >
            <p className="text-sm leading-relaxed text-muted-foreground">{data.live_books.summary}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <Fact label="Latest order on record">{dateLabel(data.live_books.source_as_of)}</Fact>
              <Fact label="Checks passed">{data.live_books.checks_passed.toLocaleString("en-IN")} of {data.live_books.checks_total.toLocaleString("en-IN")}</Fact>
              <Fact label="Records failing checks">{data.live_books.violations.toLocaleString("en-IN")}</Fact>
            </dl>
          </Stage>

          <Stage
            number="2"
            title="Processing · Latest analytics run"
            status={<TrustStatus status={data.workflow.status} label={data.workflow.label} />}
          >
            <p className="text-sm leading-relaxed text-muted-foreground">{data.workflow.summary}</p>
            {run ? (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Fact label="Last run started">{dateTimeLabel(run.started_at)}</Fact>
                <Fact label="Last run ended">{dateTimeLabel(run.ended_at)}</Fact>
                <Fact label="Duration">{durationLabel(run.duration_seconds)}</Fact>
                <Fact label="Outcome">{resultLabel(run.result)}</Fact>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No processing run was reported.</p>
            )}
            <p className="mt-4 text-sm"><span className="font-medium text-foreground">Business impact:</span> <span className="text-muted-foreground">{data.workflow.business_impact}</span></p>
          </Stage>

          <Stage
            number="3"
            title="Published numbers · Validation snapshot"
            status={<TrustStatus status={data.published_data.status} label={data.published_data.label} />}
          >
            <p className="text-sm leading-relaxed text-muted-foreground">{data.published_data.summary}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <Fact label="Validated on">{dateLabel(data.published_data.validated_at)}</Fact>
              <Fact label="Validated rows">{data.published_data.rows.toLocaleString("en-IN")}</Fact>
              <Fact label="Validated revenue">{formatINR(data.published_data.revenue, 0)}</Fact>
            </dl>
            <p className="mt-4 text-xs font-medium text-muted-foreground">Checked on the validation date above — not a live lookup.</p>
          </Stage>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]" aria-labelledby="activity-title">
        <Card className="shadow-none">
          <CardHeader>
            <p className="section-kicker">Processing history</p>
            <CardTitle id="activity-title">Latest run</CardTitle>
          </CardHeader>
          <CardContent>
            {run ? (
              <div>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <Fact label="Run date and time">{dateTimeLabel(run.started_at)}</Fact>
                  <Fact label="Duration">{durationLabel(run.duration_seconds)}</Fact>
                  <Fact label="Outcome">{resultLabel(run.result)}</Fact>
                </dl>
                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{data.workflow.business_impact}</p>
              </div>
            ) : (
              <EmptyState title={data.workflow.label} body={`${data.workflow.summary} ${data.workflow.business_impact}`} />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Quality at a glance</CardTitle>
          </CardHeader>
          <CardContent>
            <MeterRow
              label="Critical checks passed"
              value={data.live_books.checks_passed}
              max={data.live_books.checks_total}
              valueLabel={`${data.live_books.checks_passed} / ${data.live_books.checks_total}`}
              secondary="Checks run against committed marketplace records."
            />
            <div className="border-t border-border py-3">
              <p className="flex items-baseline justify-between gap-4 text-sm"><span className="font-medium">Records failing checks</span><span className="font-semibold tabular-nums">{data.live_books.violations.toLocaleString("en-IN")}</span></p>
            </div>
            <Link to="/operations" className="mt-2 inline-block text-sm font-medium text-link hover:underline">View check details</Link>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="ai-title">
        <div className="mb-5">
          <p className="section-kicker section-kicker--ember">Analytical services</p>
          <h2 id="ai-title" className="mt-1 text-lg font-semibold tracking-tight">AI and forecast readiness</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Revenue forecast</CardTitle></CardHeader>
            <CardContent>
              <TrustStatus status={data.forecast.status} label={data.forecast.label} summary={data.forecast.summary} variant="full" />
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <Fact label="Forecast source date">{dateLabel(data.forecast.as_of)}</Fact>
                <Fact label="Generated">{dateTimeLabel(data.forecast.generated_at)}</Fact>
              </dl>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader><CardTitle>Ask with Genie AI</CardTitle></CardHeader>
            <CardContent>
              <TrustStatus status={data.genie.status} label={data.genie.label} summary={data.genie.summary} variant="full" />
              {data.genie.status === "setup_required" && (
                <ol className="ml-5 mt-5 list-decimal space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <li>Create a question-answering space for the published Smart-ERP reports.</li>
                  <li>Add the published marketplace datasets.</li>
                  <li>Save its ID as <span className="font-mono text-foreground">GENIE_SPACE_ID</span> in the backend settings.</li>
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Disclosure eyebrow="Evidence boundaries" summary="How the business stages map to the underlying data">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="font-medium text-foreground">Data collected and records checked</p>
            <p className="mt-1">Recorded orders live in the marketplace database, which the backend checks directly. The analytics workspace keeps its own copies: raw arrivals, cleaned records, and quality checks. Book checks don&apos;t show whether the latest analytics processing finished.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Marketplace numbers prepared</p>
            <p className="mt-1">Published reports are the validated figures. Their row and revenue counts were checked on the validation date, while processing status is read live from the workspace. Neither is a live lookup of the reports.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Three different dates</p>
            <p className="mt-1"><span className="font-medium text-foreground">Source as of</span> is the dataset’s latest order date. <span className="font-medium text-foreground">Evidence checked</span> is when the backend evaluated available evidence. <span className="font-medium text-foreground">Validated on</span> belongs only to the published contract snapshot.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Credentials and normalization</p>
            <p className="mt-1">The backend holds the workspace sign-in and turns workspace responses into these statuses. Sign-in details never reach the browser.</p>
            <a href={WORKSPACE_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-medium text-link hover:underline">
              Open Databricks workspace <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      </Disclosure>
    </div>
  );
}
