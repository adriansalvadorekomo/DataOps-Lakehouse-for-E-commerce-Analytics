import { Check, Clock, RotateCcw, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliveryStatus } from "@/lib/api";

const TONE: Record<DeliveryStatus, string> = {
  "IN TRANSIT": "border-border bg-secondary text-secondary-foreground",
  DELIVERED: "border-success/50 bg-card text-foreground",
  DELAYED: "border-warning/60 bg-card text-foreground",
  RETURNED: "border-destructive/50 bg-card text-foreground",
};

const ICON: Record<DeliveryStatus, typeof Check> = {
  "IN TRANSIT": Truck,
  DELIVERED: Check,
  DELAYED: Clock,
  RETURNED: RotateCcw,
};

const LABEL: Record<DeliveryStatus, string> = {
  "IN TRANSIT": "In transit",
  DELIVERED: "Delivered",
  DELAYED: "Delayed",
  RETURNED: "Returned",
};

export function StatusPill({ status, className }: { status: DeliveryStatus; className?: string }) {
  const tone = TONE[status] ?? TONE["IN TRANSIT"];
  const label = LABEL[status] ?? "Unknown status";
  const Icon = ICON[status] ?? Truck;

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon size={12} strokeWidth={2.25} aria-hidden="true" />
      {label}
    </span>
  );
}
