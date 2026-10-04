import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TrustStatus } from "@/components/TrustStatus";
import { api } from "@/lib/api";

function dateLabel(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function TrustStrip({ className = "" }: { className?: string }) {
  const evidence = useQuery({
    queryKey: ["trust-status"],
    queryFn: api.trustStatus,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  return (
    <div className={`space-y-2 text-[13px] leading-relaxed text-muted-foreground ${className}`}>
      {evidence.isLoading ? (
        <p role="status">Checking evidence…</p>
      ) : evidence.isError || !evidence.data ? (
        <p>Trust evidence unavailable</p>
      ) : (
        <>
          <TrustStatus status={evidence.data.overall.status} label={evidence.data.overall.label} />
          <p>Published contract validated · {dateLabel(evidence.data.published_data.validated_at)}</p>
        </>
      )}
      <Link to="/pipeline" className="inline-flex min-h-11 items-center py-2 font-medium text-link hover:underline">View trust center</Link>
    </div>
  );
}
