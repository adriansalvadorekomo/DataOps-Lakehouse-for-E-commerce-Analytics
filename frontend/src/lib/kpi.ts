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
    formula: "Add up what customers paid on every order, after discounts and before returns",
    meaning: "What customers paid for what they ordered in the period.",
    decision: "Are we on pace? Compare with the previous period and the forecast.",
    baseline: "₹9.94B over 24 months — steady at ₹380–430M a month",
  },
  K2: {
    id: "K2", name: "Average order value",
    formula: "Revenue divided by the number of orders",
    meaning: "How much a typical order is worth.",
    decision: "Bundling, minimum-basket offers and category mix.",
    baseline: "₹9,939",
  },
  K3: {
    id: "K3", name: "Return rate",
    formula: "Returned orders as a share of all orders",
    meaning: "Share of orders sent back. The customer gets back everything they paid.",
    decision: "Which sellers, categories or brands to investigate for quality or listing accuracy.",
    baseline: "11.6%",
  },
  K4: {
    id: "K4", name: "Late deliveries",
    formula: "Orders that arrived late, as a share of all orders that arrived",
    meaning: "Of the orders that reached the customer, how many arrived late. Orders still in transit are excluded.",
    decision: "Which sellers and cities need a conversation about delivery times.",
    baseline: "About half of the orders that arrived",
  },
  K5: {
    id: "K5", name: "Revenue by city, category, month",
    formula: "Revenue split by delivery city, by category (as sold) and by month",
    meaning: "Where the money comes from and how that mix moves.",
    decision: "Where to put stock, marketing and seller recruitment.",
    baseline: "Electronics 66.2% · Home 15.4% · Sports 11.3% · Beauty 3.8% · Clothing 3.3%",
  },
  K6: {
    id: "K6", name: "Discount bands",
    formula: "Sales and revenue grouped by discount level: up to 10%, 10–30%, 30–50% and 50–70% off",
    meaning: "How deep the seller-funded discounts go.",
    decision: "Whether deep discounts buy volume worth their cost.",
    baseline: "Average discount 29%",
  },
  K7: {
    id: "K7", name: "Seller scorecard",
    formula: "Each seller's revenue, orders, rating, late deliveries and returns, compared with other sellers",
    meaning: "Who drives the marketplace, and who hurts the customer experience.",
    decision: "Which sellers to grow, coach or put on a performance plan.",
  },
  K8: {
    id: "K8", name: "Stock-critical products",
    formula: "Fewer than 20 units in stock. Days of stock left = units in stock ÷ units sold per day over the last 30 days",
    meaning: "What will run out first, given how fast it sells.",
    decision: "What to reorder now, and what to delist.",
    baseline: "3,561 products (4.0% of the catalog)",
  },
  K9: {
    id: "K9", name: "Customer concentration",
    formula: "Rank customers by what they have spent, then see how much of revenue the top 10%, 20%, … bring in",
    meaning: "How dependent revenue is on the best customers.",
    decision: "How much to invest in retaining the top decile.",
    baseline: "Top 20% of customers = 62.9% of revenue",
  },
  K10: {
    id: "K10", name: "Estimated gross margin",
    formula: "What customers paid, minus an assumed cost of 65% of the list price",
    meaning: "Margin under an assumed cost of 65% of list price. The source has no cost of goods, so this is an estimate.",
    decision: "Which discount levels sell below cost (break-even: 35% off).",
    estimated: true,
  },
  K11: {
    id: "K11", name: "Churn risk",
    formula: "A repeat customer who has been quiet for more than twice their usual time between orders",
    meaning: "Customers who have stopped buying at their usual rhythm.",
    decision: "Who to target with a win-back offer, highest lifetime value first.",
  },
  K12: {
    id: "K12", name: "Return hotspots",
    formula: "Each brand's return rate within a category, compared with the usual rate; flagged only when the gap is too large to be chance",
    meaning: "Where returns are clearly above normal, not by chance.",
    decision: "Which listings and brands to inspect before the next promotion.",
  },
};

export function kpi(id: string | null | undefined): KpiDef | undefined {
  if (!id) return undefined;
  const first = id.split(/[ ·,]/)[0];
  return KPIS[first];
}
