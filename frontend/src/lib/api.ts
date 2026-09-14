/** Typed client for the Smart-ERP backend (mirrors backend/app/schemas/orders.py).
 * Base '/api' hits the Vite dev proxy (same-origin); set VITE_API_URL for
 * separate deploys (backend CORS allows the frontend origin).
 */
const BASE = import.meta.env.VITE_API_URL ?? "/api";

export type DeliveryStatus = "IN TRANSIT" | "DELIVERED" | "DELAYED" | "RETURNED";

export interface OrderItem {
  order_item_id: number;
  order_id: number;
  product_id: string;
  seller_id: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  final_price: number;
  seller_rating_at_sale: number;
}

export interface Order {
  order_id: number;
  customer_id: string;
  order_date: string;
  ship_to_city: string;
  payment_method: string;
  device: string;
  delivery_status: DeliveryStatus;
  shipping_time_days: number;
  items: OrderItem[];
}

export interface OrderItemCreate {
  product_id: string;
  seller_id: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
}

export interface OrderCreate {
  customer_id: string;
  order_date: string;
  ship_to_city: string;
  payment_method: string;
  device: string;
  shipping_time_days: number;
  items: OrderItemCreate[];
}

export type AskMode = "data" | "docs" | "genie";

export interface AskSource {
  endpoint: string;
  params: Record<string, unknown>;
  document?: string | null;
  chunk_index?: number | null;
  score?: number | null;
}

export interface AskResult {
  answer: string;
  intent: string;
  sources: AskSource[];
  sql?: string;
  rows?: Record<string, unknown>[];
}

export interface DocumentRecord {
  document_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: "uploaded" | "ready" | "failed";
  error: string | null;
}

export interface DocumentHit {
  document: string;
  chunk_index: number;
  content: string;
  score: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }
  return body as T;
}

export const api = {
  health: () => request<{ status: string; db: string }>("/health"),
  listOrders: (params?: { customer_id?: string; delivery_status?: DeliveryStatus }) => {
    const q = new URLSearchParams();
    if (params?.customer_id) q.set("customer_id", params.customer_id);
    if (params?.delivery_status) q.set("delivery_status", params.delivery_status);
    const suffix = q.size > 0 ? `?${q}` : "";
    return request<Order[]>(`/orders${suffix}`);
  },
  getOrder: (id: number) => request<Order>(`/orders/${id}`),
  createOrder: (payload: OrderCreate) =>
    request<Order>("/orders", { method: "POST", body: JSON.stringify(payload) }),
  transition: (id: number, delivery_status: DeliveryStatus) =>
    request<Order>(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ delivery_status }),
    }),
  overview: () => request<Overview>("/stats/overview"),
  trend: (days = 90) => request<TrendPoint[]>(`/stats/revenue-trend?days=${days}`),
  categories: () => request<CategoryShare[]>("/stats/revenue-by-category"),
  bands: () => request<DiscountBand[]>("/stats/discount-bands"),
  topSellers: (limit = 8) => request<TopSeller[]>(`/stats/top-sellers?limit=${limit}`),
  pareto: () => request<{ top20_share: number }>("/stats/pareto"),
  dqChecks: () => request<DQCheck[]>("/stats/dq-checks"),
  sellers: (limit = 50) => request<SellerPerf[]>(`/stats/seller-performance?limit=${limit}`),
  categoryTrend: (months = 12) => request<CategoryMonth[]>(`/stats/category-trend?months=${months}`),
  stockCritical: (limit = 50) => request<StockAlert[]>(`/stats/stock-critical?limit=${limit}`),
  cities: () => request<CityPerf[]>("/stats/city-performance"),
  forecast: (trailing = 90) => request<ForecastResponse>(`/stats/forecast?trailing=${trailing}`),
  ask: (mode: AskMode, question: string) => {
    const path = mode === "data" ? "/ai/ask" : mode === "docs" ? "/ai/ask-docs" : "/ai/ask-genie";
    return request<AskResult>(path, { method: "POST", body: JSON.stringify({ question }) });
  },
  listDocuments: () => request<DocumentRecord[]>("/documents"),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentRecord>("/documents", { method: "POST", body: form });
  },
  deleteDocument: (id: number) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  searchDocuments: (query: string, k = 5) =>
    request<DocumentHit[]>("/documents/search", {
      method: "POST",
      body: JSON.stringify({ query, k }),
    }),
};

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export interface Overview {
  total_orders: number;
  revenue: number;
  aov: number;
  avg_discount_pct: number;
  return_rate: number;
  delayed_rate: number;
  in_transit: number;
  stock_critical: number;
  by_status: Record<string, number>;
}

export interface TrendPoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface CategoryShare {
  category: string;
  revenue: number;
  lines: number;
}

export interface DiscountBand {
  band: string;
  lines: number;
  revenue: number;
}

export interface TopSeller {
  seller_id: string;
  revenue: number;
  lines: number;
  avg_rating: number;
}

export interface DQCheck {
  rule: string;
  violations: number;
}

export interface SellerPerf {
  seller_id: string;
  revenue: number;
  lines: number;
  avg_rating: number;
  delayed_rate: number;
  return_rate: number;
}

export interface CategoryMonth {
  month: string;
  category: string;
  revenue: number;
}

export interface StockAlert {
  product_id: string;
  category: string;
  brand: string;
  current_price: number;
  latest_stock: number;
  latest_snapshot_date: string;
}

export interface CityPerf {
  city: string;
  revenue: number;
  orders: number;
  delayed_rate: number;
  return_rate: number;
}

export interface ForecastResponse {
  asof: string | null;
  actuals: { date: string; revenue: number }[];
  forecasts: { rf: { date: string; yhat: number }[]; prophet: { date: string; yhat: number }[] };
}

export function formatINR(n: number, digits = 2): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
