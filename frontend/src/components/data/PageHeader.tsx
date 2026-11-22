import { date } from "@/lib/format";

/** Every page states the question it answers and the decision it supports. */
export function PageHeader({
  kicker,
  title,
  question,
  decision,
  asOf,
  actions,
}: {
  kicker: string;
  title: string;
  question: string;
  decision?: string;
  asOf?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-line pb-7 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        <div className="label mb-3 flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-signal" />
          {kicker}
        </div>
        <h1 className="text-[34px] leading-[1.08] sm:text-[42px]">{title}</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{question}</p>
        {decision && (
          <p className="mt-2 text-[13.5px] text-ink-3">
            <span className="font-semibold text-ink-2">Decision it supports · </span>
            {decision}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
        {asOf && (
          <div className="text-[12.5px] text-ink-3">
            Data as of <span className="num font-semibold text-ink">{date(asOf, "long")}</span>
          </div>
        )}
        {actions}
      </div>
    </header>
  );
}

export function SectionTitle({ title, note, id, right }: { title: string; note?: string; id?: string; right?: React.ReactNode }) {
  return (
    <div id={id} className="mb-4 flex scroll-mt-20 flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[22px] leading-tight">{title}</h2>
        {note && <p className="mt-1 max-w-2xl text-[13.5px] text-ink-3">{note}</p>}
      </div>
      {right}
    </div>
  );
}
