import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { kpi } from "@/lib/kpi";

/** "How is this calculated?" — the business-model definition behind a number. */
export function KpiInfo({ id }: { id: string }) {
  const def = kpi(id);
  if (!def) return null;
  return (
    <Popover.Root>
      <Popover.Trigger
        className="inline-flex size-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
        aria-label={`How ${def.name} is calculated`}
        title="How is this calculated?"
      >
        <Info className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} className="panel z-50 w-[340px] p-4 text-[13px] shadow-xl">
          <div className="label">How it's calculated</div>
          <div className="mt-1 font-serif text-[17px] font-semibold">
            {def.name}
            {def.estimated && <span className="ml-2 rounded bg-warn-wash px-1.5 py-0.5 align-middle font-sans text-[10.5px] font-semibold text-warn">ESTIMATED</span>}
          </div>
          <dl className="mt-3 space-y-2.5">
            <div><dt className="label">Calculation</dt><dd className="mt-0.5 text-ink-2">{def.formula}</dd></div>
            <div><dt className="label">What it means</dt><dd className="mt-0.5 text-ink-2">{def.meaning}</dd></div>
            <div><dt className="label">Decision it supports</dt><dd className="mt-0.5 text-ink-2">{def.decision}</dd></div>
            {def.baseline && <div><dt className="label">Over the full history</dt><dd className="num mt-0.5 text-ink-2">{def.baseline}</dd></div>}
          </dl>
          <Popover.Arrow className="fill-[var(--line)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
