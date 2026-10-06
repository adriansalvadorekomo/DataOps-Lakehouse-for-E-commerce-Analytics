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
    <details className={cn("panel px-4", className)} open={defaultOpen || undefined}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 py-2.5 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        <span>
          {eyebrow && (
            <span className="section-kicker mb-1 block">
              {eyebrow}
            </span>
          )}
          {summary}
        </span>
        <ChevronDown className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" size={16} aria-hidden="true" />
      </summary>
      <div className="border-t border-border py-3.5 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
