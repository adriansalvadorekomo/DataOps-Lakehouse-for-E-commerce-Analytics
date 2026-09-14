import { cn } from "@/lib/utils";
import type { DeliveryStatus } from "@/lib/api";

const DOT: Record<DeliveryStatus, string> = {
  "IN TRANSIT": "bg-muted-foreground",
  DELIVERED: "bg-[var(--success)]",
  DELAYED: "bg-primary",
  RETURNED: "bg-destructive",
};

const LABEL: Record<DeliveryStatus, string> = {
  "IN TRANSIT": "In transit",
  DELIVERED: "Delivered",
  DELAYED: "Delayed",
  RETURNED: "Returned",
};

export function StatusPill({ status, className }: { status: DeliveryStatus; className?: string }) {
  const dot = DOT[status] ?? "bg-muted-foreground";
  const label = LABEL[status] ?? "Unknown status";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
