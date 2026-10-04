import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  getOptionLabel = (option) => option,
  className,
  dark = false,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
  getOptionLabel?: (option: T) => React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={cn("mb-2 text-[13px] font-medium", dark ? "term-mist" : "text-muted-foreground")}>{label}</legend>
      <div
        className={cn(
          "inline-flex max-w-full flex-wrap gap-1 rounded-lg border p-1",
          dark ? "border-[var(--term-line)] bg-[var(--term-ground-softer)]" : "border-border bg-card",
        )}
      >
        {options.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={cn(
                "min-h-11 min-w-11 rounded-md px-4 text-sm transition-colors",
                selected
                  ? dark
                    ? "bg-[var(--term-ink)] font-semibold text-[var(--term-ground)] shadow-sm"
                    : "bg-foreground font-semibold text-background shadow-sm"
                  : dark
                    ? "bg-transparent font-medium text-[var(--term-mist)] hover:bg-[var(--term-ground-soft)] hover:text-[var(--term-ink)]"
                    : "bg-transparent font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {getOptionLabel(option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
