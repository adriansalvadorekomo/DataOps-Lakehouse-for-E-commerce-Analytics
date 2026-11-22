import { useQuery } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { date, int, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "How current is what I'm looking at?" — always visible. */
export function FreshnessPill() {
  const { data } = useQuery({ queryKey: ["freshness"], queryFn: api.freshness, refetchInterval: 60_000 });
  const stale = data?.forecast === "stale";
  return (
    <Popover.Root>
      <Popover.Trigger className="hidden items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-line-strong md:flex">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-pulse-dot rounded-full bg-signal" />
          <span className="relative inline-flex size-2 rounded-full bg-signal" />
        </span>
        <span>
          Books to <span className="num font-semibold text-ink">{data?.as_of ? date(data.as_of) : "—"}</span>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="end"
          className="panel z-50 w-[320px] p-4 text-[13px] shadow-xl"
        >
          <div className="label mb-3">Data freshness</div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-2">
            <dt className="text-ink-3">Latest order date</dt>
            <dd className="num text-right">{date(data?.as_of)}</dd>
            <dt className="text-ink-3">Orders in the books</dt>
            <dd className="num text-right">{int(data?.orders)}</dd>
            <dt className="text-ink-3">Forecast trained to</dt>
            <dd className={cn("num text-right", stale && "text-warn")}>
              {data?.forecast === "missing" ? "not published" : date(data?.forecast_as_of)}
            </dd>
            <dt className="text-ink-3">Last import</dt>
            <dd className="text-right">
              {data?.last_import ? relativeTime(data.last_import.finished_at ?? data.last_import.created_at) : "none yet"}
            </dd>
          </dl>
          <p className="mt-3 border-t border-line pt-3 text-ink-3">
            Every window ends on the latest order date, so an import moves all numbers forward on the next load.
          </p>
          <Link to="/data" className="mt-3 inline-block font-medium text-signal-ink link-underline">
            Open Data &amp; governance →
          </Link>
          <Popover.Arrow className="fill-[var(--line)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
