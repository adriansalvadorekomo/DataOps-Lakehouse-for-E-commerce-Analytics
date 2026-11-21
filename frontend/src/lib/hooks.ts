import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export const PERIODS = [7, 30, 90, 365] as const;
export type Period = (typeof PERIODS)[number];

/** The analysis window (days) lives in the URL (?days=30) so every view is shareable. */
export function usePeriod(): [Period, (p: Period) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("days"));
  const period = (PERIODS as readonly number[]).includes(raw) ? (raw as Period) : 30;
  const set = useCallback(
    (p: Period) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (p === 30) next.delete("days");
        else next.set("days", String(p));
        return next;
      }, { replace: true });
    },
    [setParams],
  );
  return [period, set];
}

export type Theme = "graphite" | "paper";

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || "graphite",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "paper" ? "#f4f3ef" : "#0a0a0b");
    try {
      localStorage.setItem("smart-erp-theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "graphite" ? "paper" : "graphite"))];
}

/** Keep a value in a URL search param (filters are shareable links). */
export function useParam(key: string, fallback = ""): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (v: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (!v || v === fallback) next.delete(key);
        else next.set(key, v);
        return next;
      }, { replace: true }),
    [key, fallback, setParams],
  );
  return [value, set];
}
