import { BACKFILL, WORKSPACE_URL } from "@/lib/constants";

export function TrustStrip({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-1 text-[12px] leading-snug text-muted-foreground ${className}`}>
      <p>Live marketplace books</p>
      <p>
        Last published on Databricks · {BACKFILL.at}{" "}
        <span className="text-muted-foreground/80">(validation snapshot)</span>
      </p>
      <a
        href={WORKSPACE_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block hover:underline"
      >
        Open workspace
      </a>
    </div>
  );
}
