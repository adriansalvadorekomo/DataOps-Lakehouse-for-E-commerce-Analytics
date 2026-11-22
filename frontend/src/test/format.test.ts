import { describe, expect, it } from "vitest";
import { delta, inr, int, pct, pts, statusLabel } from "@/lib/format";
import { KPIS, kpi } from "@/lib/kpi";

describe("format", () => {
  it("formats rupees in international units", () => {
    expect(inr(9_938_876_985)).toBe("₹9.94B");
    expect(inr(419_000_000)).toBe("₹419.0M");
    expect(inr(959_000)).toBe("₹959K");
    expect(inr(9958)).toBe("₹9,958");
    expect(inr(-1_200_000)).toBe("−₹1.2M");
    expect(int(1_000_000)).toBe("1,000,000");
  });
  it("formats rates and changes", () => {
    expect(pct(0.1162)).toBe("11.6%");
    expect(delta(0.042)).toBe("+4.2%");
    expect(delta(-0.1)).toBe("−10.0%");
    expect(delta(null)).toBe("—");
    expect(pts(0.494, 0.506)).toBe("−1.2 pts");
  });
  it("speaks business language for statuses", () => {
    expect(statusLabel("DELAYED")).toBe("Delivered late");
  });
});

describe("KPI glossary", () => {
  it("covers K1–K12 from the business model", () => {
    expect(Object.keys(KPIS)).toHaveLength(12);
    expect(kpi("K6 · K10")?.id).toBe("K6");
    expect(KPIS.K10.estimated).toBe(true);
  });
});
