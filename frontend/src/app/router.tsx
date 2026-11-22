import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { NotFound } from "@/components/data/States";

const page = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as React.ComponentType }));

const Today = page(() => import("@/features/today/Today"), "Today");
const Revenue = page(() => import("@/features/revenue/Revenue"), "Revenue");
const Customers = page(() => import("@/features/customers/Customers"), "Customers");
const CustomerDetail = page(() => import("@/features/customers/CustomerDetail"), "CustomerDetail");
const Sellers = page(() => import("@/features/sellers/Sellers"), "Sellers");
const SellerDetail = page(() => import("@/features/sellers/SellerDetail"), "SellerDetail");
const Fulfillment = page(() => import("@/features/fulfillment/Fulfillment"), "Fulfillment");
const OrderDetail = page(() => import("@/features/fulfillment/OrderDetail"), "OrderDetail");
const Inventory = page(() => import("@/features/inventory/Inventory"), "Inventory");
const ProductDetail = page(() => import("@/features/inventory/ProductDetail"), "ProductDetail");
const Forecast = page(() => import("@/features/forecast/Forecast"), "Forecast");
const Ask = page(() => import("@/features/ask/Ask"), "Ask");
const DataHub = page(() => import("@/features/data/DataHub"), "DataHub");
const ImportDetail = page(() => import("@/features/data/ImportDetail"), "ImportDetail");

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Today /> },
      { path: "/revenue", element: <Revenue /> },
      { path: "/customers", element: <Customers /> },
      { path: "/customers/:id", element: <CustomerDetail /> },
      { path: "/sellers", element: <Sellers /> },
      { path: "/sellers/:id", element: <SellerDetail /> },
      { path: "/fulfillment", element: <Fulfillment /> },
      { path: "/orders/:id", element: <OrderDetail /> },
      { path: "/inventory", element: <Inventory /> },
      { path: "/products/:id", element: <ProductDetail /> },
      { path: "/forecast", element: <Forecast /> },
      { path: "/ask", element: <Ask /> },
      { path: "/data", element: <DataHub /> },
      { path: "/data/imports/:id", element: <ImportDetail /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
