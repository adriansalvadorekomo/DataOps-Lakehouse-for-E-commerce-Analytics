/** The KPI glossary — the business model (docs/business-model.md §4) in plain language.
 * Every number in the product links to one of these, so a reader can always ask
 * "how is this calculated, and what should I do with it?" */

export interface KpiDef {
  id: string;
  name: string;
  formula: string;
  meaning: string;
  decision: string;
  baseline?: string;
  estimated?: boolean;
}

export const KPIS: Record<string, KpiDef> = {
  K1: {
    id: "K1", name: "Revenue",
    formula: "Σ final_price over order lines (after discount, before returns)",
    meaning: "What customers paid for what they ordered in the period.",
    decision: "Are we on pace? Compare with the previous period and the forecast.",
    baseline: "₹9.94B over 24 months; ₹13.9M → ₹423.7M per month",
  },
  K2: {
    id: "K2", name: "Average order value",
    formula: "Revenue ÷ distinct orders",
    meaning: "How much a typical order is worth.",
    decision: "Bundling, minimum-basket offers and category mix.",
    baseline: "₹9,939",
  },
  K3: {
    id: "K3", name: "Return rate",
    formula: "Orders RETURNED ÷ all orders",
    meaning: "Share of orders sent back (the full final_price is refunded).",
    decision: "Which sellers, categories or brands to investigate for quality or listing accuracy.",
    baseline: "11.6%",
  },
  K4: {
    id: "K4", name: "Late deliveries",
    formula: "Orders DELAYED ÷ (DELIVERED + DELAYED)",
    meaning: "Of the orders that reached the customer, how many arrived late. Orders still in transit are excluded.",
    decision: "Which sellers and cities need a delivery SLA conversation.",
    baseline: "≈ 50% of completed orders",
  },
  K5: {
    id: "K5", name: "Revenue by city, category, month",
    formula: "K1 grouped by ship-to city, product category and month",
    meaning: "Where the money comes from and how that mix moves.",
    decision: "Where to put stock, marketing and seller recruitment.",
    baseline: "Electronics 66.2% · Home 15.4% · Sports 11.3% · Beauty 3.8% · Clothing 3.3%",
  },
  K6: {
    id: "K6", name: "Discount bands",
    formula: "Lines and revenue in 0–10 / 10–30 / 30–50 / 50–70% discount bands",
    meaning: "How deep the seller-funded discounts go.",
    decision: "Whether deep discounts buy volume worth their cost.",
    baseline: "Average discount 29%",
  },
  K7: {
    id: "K7", name: "Seller scorecard",
    formula: "Revenue, orders, rating at sale, late-delivery and return rates per seller, vs peers",
    meaning: "Who drives the marketplace, and who hurts the customer experience.",
    decision: "Which sellers to grow, coach or put on a performance plan.",
  },
  K8: {
    id: "K8", name: "Stock-critical products",
    formula: "Latest stock snapshot < 20 units; days of cover = stock ÷ units sold per day (last 30 days)",
    meaning: "What will run out first, given how fast it sells.",
    decision: "What to reorder now, and what to delist.",
    baseline: "3,561 products (4.0% of the catalog)",
  },
  K9: {
    id: "K9", name: "Customer concentration",
    formula: "Cumulative revenue share by customer decile (ranked by lifetime revenue)",
    meaning: "How dependent revenue is on the best customers.",
    decision: "How much to invest in retaining the top decile.",
    baseline: "Top 20% of customers = 62.9% of revenue",
  },
  K10: {
    id: "K10", name: "Estimated gross margin",
    formula: "Σ (final_price − 0.65 × unit_price × quantity)",
    meaning: "Margin under an assumed cost of 65% of list price. The source has no cost of goods, so this is an estimate.",
    decision: "Which discount levels sell below cost (break-even: 35% off).",
    estimated: true,
  },
  K11: {
    id: "K11", name: "Churn risk",
    formula: "Repeat customer whose days since last order > 2 × their own average gap between orders (gap ≥ 7 days)",
    meaning: "Customers who have stopped buying at their usual rhythm.",
    decision: "Who to target with a win-back offer, highest lifetime value first.",
  },
  K12: {
    id: "K12", name: "Return hotspots",
    formula: "Return rate per category × brand vs the overall rate; flagged when z ≥ 2 at sufficient volume",
    meaning: "Where returns are significantly above normal — a baseline for a return-propensity model.",
    decision: "Which listings and brands to inspect before the next promotion.",
  },
};

export function kpi(id: string | null | undefined): KpiDef | undefined {
  if (!id) return undefined;
  const first = id.split(/[ ·,]/)[0];
  return KPIS[first];
}
