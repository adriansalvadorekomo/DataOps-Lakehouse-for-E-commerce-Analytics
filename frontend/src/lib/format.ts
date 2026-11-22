/** Number formatting with international units (₹ with K / M / B) and plain-language helpers.
 * Indian units (lakh, crore) and digit grouping are deliberately not used: the product is
 * read by an international audience. */

const K = 1e3;
const M = 1e6;
const B = 1e9;

/** ₹ in international units: ₹9,939 · ₹12.4K · ₹419.0M · ₹9.94B. */
export function inr(n: number | null | undefined, opts: { compact?: boolean; digits?: number } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const { compact = true, digits } = opts;
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (compact && a >= B) return `${sign}₹${(a / B).toFixed(digits ?? 2)}B`;
  if (compact && a >= M) return `${sign}₹${(a / M).toFixed(digits ?? 1)}M`;
  if (compact && a >= 100 * K) return `${sign}₹${(a / K).toFixed(digits ?? 0)}K`;
  return `${sign}₹${a.toLocaleString("en-US", { maximumFractionDigits: digits ?? 0 })}`;
}

export function int(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** 0.1162 → "11.6%". */
export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

/** Signed relative change: 0.042 → "+4.2%", −0.1 → "−10.0%". */
export function delta(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const v = n * 100;
  if (Math.abs(v) < 0.05) return "±0.0%";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}

/** Percentage points between two rates: 0.52 vs 0.50 → "+2.0 pts". */
export function pts(current: number, previous: number): string {
  const d = (current - previous) * 100;
  if (Math.abs(d) < 0.05) return "±0.0 pts";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`;
}

export function date(iso: string | null | undefined, style: "short" | "long" = "short"): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("en-IN", style === "long"
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    : { day: "numeric", month: "short", year: "numeric" });
}

export function month(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00`);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${int(n)} ${n === 1 ? one : many}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function statusLabel(s: string): string {
  return { "IN TRANSIT": "In transit", DELIVERED: "Delivered", DELAYED: "Delivered late", RETURNED: "Returned" }[s] ?? s;
}

export function segmentLabel(s: string): string {
  return { active: "Active", cooling: "Cooling", at_risk: "At risk", one_time: "One-time buyers" }[s] ?? s;
}
