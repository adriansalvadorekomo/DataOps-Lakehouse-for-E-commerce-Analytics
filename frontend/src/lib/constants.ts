/** Marketplace contract from docs/business-model.md — shown to operators, not engineers. */

export const CITIES = ["Delhi", "Bangalore", "Mumbai", "Chennai", "Hyderabad"] as const;

export const PAYMENT_METHODS = ["UPI", "Credit Card", "Debit Card", "Cash on Delivery"] as const;

export const DEVICES = ["Mobile App", "Web", "Tablet"] as const;

export const CATEGORIES = ["Electronics", "Home", "Sports", "Beauty", "Clothing"] as const;

/** Documented Free Edition workspace — outbound only; the browser holds no token. */
export const WORKSPACE_URL = "https://dbc-cba3c27a-ade0.cloud.databricks.com";

/** Last full backfill validated on Databricks. Static by design. */
export const BACKFILL = {
  at: "11 Sep 2026",
  atIso: "2026-09-11",
  bronze_rows: 1_000_000,
  revenue: 9_938_876_984.9,
  silver: ["customers", "sellers", "products", "inventory", "orders", "order_items"],
  gold: ["fact_sales", "sales_daily", "customer_360", "inventory_kpis"],
};

export const DQ_COPY: Record<string, { title: string; detail: string }> = {
  "R1 customers null keys": {
    title: "Every customer has an identity",
    detail: "No customer record is missing its marketplace ID.",
  },
  "R1 orders null keys": {
    title: "Every order is tied to a customer",
    detail: "No order is missing its ID or customer.",
  },
  "R1 order_items null keys": {
    title: "Every line names product and seller",
    detail: "No line is missing its order, product, or seller.",
  },
  "R2 customers unique": {
    title: "Customer IDs are unique",
    detail: "The same customer is not stored twice.",
  },
  "R2 products unique": {
    title: "Product IDs are unique",
    detail: "The same product is not stored twice.",
  },
  "R3 order_items → orders": {
    title: "Every line belongs to an order",
    detail: "No orphan lines without a parent order.",
  },
  "R3 order_items → products": {
    title: "Every line points at a real product",
    detail: "No line references a product that is not in the catalogue.",
  },
  "R4 final_price invariant": {
    title: "Paid amount matches the line formula",
    detail: "Price × quantity × (1 − discount), within ₹5.",
  },
  "R5 delivery_status enum": {
    title: "Every order uses an allowed status",
    detail: "In transit, delivered, delayed, or returned — nothing else.",
  },
  "R6 quantity/discount/price ranges": {
    title: "Quantities, discounts and prices are in range",
    detail: "Quantity at least 1; discount 0–70%; prices are positive.",
  },
  "R7 order_date window": {
    title: "Order dates sit in the trading window",
    detail: "31 Mar 2024 through 31 Mar 2026.",
  },
};

export function dqTitle(rule: string): string {
  return DQ_COPY[rule]?.title ?? rule;
}

export function dqDetail(rule: string): string {
  return DQ_COPY[rule]?.detail ?? rule;
}

export function estimatedLineTotal(unitPrice: number, quantity: number, discountPct: number): number {
  return unitPrice * quantity * (1 - discountPct / 100);
}
