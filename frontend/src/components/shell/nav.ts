import {
  BarChart3, Boxes, Database, Gauge, LineChart, MessageSquareText, Store, Truck, Users,
} from "lucide-react";

/** Information architecture: one page per role question (docs/product.md). */
export const NAV = [
  { group: "Brief", items: [{ to: "/", label: "Today", icon: Gauge, hint: "What needs you today" }] },
  {
    group: "Commercial",
    items: [
      { to: "/revenue", label: "Revenue", icon: BarChart3, hint: "Pace, mix, margin" },
      { to: "/customers", label: "Customers", icon: Users, hint: "Concentration, churn risk" },
    ],
  },
  {
    group: "Operations",
    items: [
      { to: "/sellers", label: "Sellers", icon: Store, hint: "Scorecards vs peers" },
      { to: "/fulfillment", label: "Fulfillment", icon: Truck, hint: "Late deliveries, orders" },
      { to: "/inventory", label: "Inventory", icon: Boxes, hint: "Stock cover, returns" },
    ],
  },
  {
    group: "Planning",
    items: [
      { to: "/forecast", label: "Forecast", icon: LineChart, hint: "30-day outlook" },
      { to: "/ask", label: "Ask", icon: MessageSquareText, hint: "Questions in plain language" },
    ],
  },
  { group: "Trust", items: [{ to: "/data", label: "Data & governance", icon: Database, hint: "Imports, contract, quality" }] },
];
