import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AskResult, Rating } from "@/lib/api";

const rate = vi.fn(async () => ({ interaction_id: 7, rating: 1 }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: { rate } }));

const result: AskResult = {
  answer: "11.6% of orders are returned (115,990 of 1,000,000).",
  intent: "return_rate",
  sources: [{ label: "All orders to date", endpoint: "GET /stats/overview" }],
  interaction_id: 7,
};

function Harness() {
  const [rating, setRating] = useState<Rating>(0);
  return <AnswerMessageLazy result={result} animate={false} rating={rating} onRated={setRating} />;
}
let AnswerMessageLazy: typeof import("@/features/ask/AnswerMessage").AnswerMessage;

describe("Ask answer", () => {
  it("shows business sources only and records 👍 / 👎 for later learning", async () => {
    AnswerMessageLazy = (await import("@/features/ask/AnswerMessage")).AnswerMessage;
    render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
    expect(screen.getByText("All orders to date")).toBeInTheDocument();
    expect(screen.queryByText(/stats\/overview/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Helpful" }));
    await waitFor(() => expect(rate).toHaveBeenCalledWith(7, 1, undefined));
    expect(screen.getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Not helpful" }));
    await waitFor(() => expect(rate).toHaveBeenCalledWith(7, -1, undefined));
    const box = screen.getByPlaceholderText(/What would have been more useful/);
    fireEvent.change(box, { target: { value: "Only last month" } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => expect(rate).toHaveBeenCalledWith(7, -1, "Only last month"));
  });
});
