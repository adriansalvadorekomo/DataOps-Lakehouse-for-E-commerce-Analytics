import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({
  summary,
  eyebrow,
  children,
  defaultOpen = false,
  className,
}: {
  summary: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={cn("group border-y border-border bg-card/70", className)} open={defaultOpen || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        <span>
          {eyebrow && (
            <span className="section-kicker mb-1 block">
              {eyebrow}
            </span>
          )}
          {summary}
        </span>
        <ChevronDown className="shrink-0 transition-transform group-open:rotate-180" size={16} aria-hidden="true" />
      </summary>
      <div className="border-t border-border py-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
