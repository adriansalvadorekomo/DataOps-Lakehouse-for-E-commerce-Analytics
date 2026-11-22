/** Business names for the data checks (the technical rule codes stay in the API and docs). */
export const RULE_LABEL: Record<string, string> = {
  "R0 columns": "Missing columns",
  "R1 required": "Missing values",
  "R1 type": "Wrong format",
  "R1 null keys": "Missing identifiers",
  "R2 unique": "Duplicates",
  "R3 foreign keys": "Broken links",
  "R4 final_price": "Price doesn't add up",
  "R5 enum": "Unknown value",
  "R6 range": "Out of range",
  "R7 date": "Impossible date",
  "H1 lifecycle hygiene": "Delivery status never closed",
};

export const ruleLabel = (code: string) => RULE_LABEL[code] ?? code;

export const SUITE_LABEL: Record<string, string> = {
  customers: "Customers",
  sellers: "Sellers",
  products: "Products",
  inventory: "Stock levels",
  orders: "Orders",
  order_items: "Order lines",
  money_invariant: "Prices",
  orphans: "Links between records",
  stale_in_transit: "Delivery statuses",
  import_contract: "This file",
};

export const TRIGGER_LABEL: Record<string, string> = {
  api: "Run from this page",
  cli: "Run by the data team",
  import: "After an import",
  ci: "Automated test",
};
