import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Brief } from "@/lib/api";

const brief: Brief = {
  generated_at: "2026-03-31T08:00:00Z",
  window: { as_of: "2026-03-31", days: 30, start: "2026-03-02", end: "2026-03-31", previous_start: "2026-01-31", previous_end: "2026-03-01" },
  role: null,
  counts: { act: 1, watch: 1, info: 0 },
  empty: false,
  signals: [
    { id: "stockout-14d", domain: "inventory", severity: "act", title: "59 selling products run out within 14 days", metric: 59, baseline: null, delta: null, unit: "count", evidence: ["P47311: 3 left"], next_step: "Reorder these first.", link: "/inventory#reorder", kpi: "K8", magnitude: 1 },
    { id: "sellers-late", domain: "sellers", severity: "watch", title: "4 sellers deliver late significantly more often than their peers", metric: 4, baseline: 0.7, delta: null, unit: "count", evidence: [], next_step: "Review delivery SLAs.", link: "/sellers?flag=late_deliveries", kpi: "K4", magnitude: 0.1 },
  ],
};

vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>();
  return {
    ...real,
    api: {
      brief: vi.fn(async () => brief),
      performance: vi.fn(async () => ({ as_of: "2026-03-31", days: 30, metrics: undefined })),
      freshness: vi.fn(async () => ({ as_of: "2026-03-31", orders: 1_000_000, forecast: "missing", forecast_as_of: null, forecast_lag_days: 0, last_import: null })),
      governanceLatest: vi.fn(async () => ({ run_id: 1, status: "passed", evaluated: 29, successful: 29 })),
    },
  };
});

describe("Today brief", () => {
  it("ranks signals with severity, evidence, next step and a link", async () => {
    const { Today } = await import("@/features/today/Today");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><Today /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("59 selling products run out within 14 days")).toBeInTheDocument();
    expect(screen.getByText(/One thing needs you today/)).toBeInTheDocument();
    expect(screen.getByText("Act now")).toBeInTheDocument();
    expect(screen.getByText("Reorder these first.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Inventory/ })).toHaveAttribute("href", "/inventory#reorder");
    expect(screen.getByText("29 of 29 passed")).toBeInTheDocument();
  });
});
