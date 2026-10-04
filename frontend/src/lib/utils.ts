import { useMemo, useState } from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type SortDirection = "asc" | "desc";

/**
 * Client-side sorting for an already-fetched row set (search results, top-N
 * lists). The row set and its order of magnitude come from the backend; this
 * only reorders the returned rows for review. Numeric columns compare
 * numerically, everything else with locale-aware string comparison.
 */
export function useSortedRows<T>(
  rows: T[],
  initialKey: string,
  values: Record<string, (row: T) => string | number>,
  initialDirection: SortDirection = "desc",
) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);

  const sorted = useMemo(() => {
    const get = values[sortKey];
    if (!get) return rows;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const compared =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "en-IN", { numeric: true });
      return direction === "asc" ? compared : -compared;
    });
    // values is a per-render map of pure accessors; recompute is O(n log n) on tiny sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, direction]);

  function toggle(key: string) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("desc");
    }
  }

  return { sorted, sortKey, direction, toggle };
}
