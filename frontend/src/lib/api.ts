/** Typed client for the Smart-ERP Control Tower API (backend/app/api).
 * Base '/api' hits the Vite dev proxy / nginx (same-origin); set VITE_API_URL
 * for separate deploys (the backend ships CORS for the frontend origin).
 */
const BASE = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // init.signal lets callers cancel (e.g. "Stop" in Ask).
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

const qs = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.size ? `?${q}` : "";
};

// ── shared ───────────────────────────────────────────────────────────────────
export type Severity = "act" | "watch" | "info";
export type Role = "commercial" | "fulfillment" | "inventory" | "customers" | "data";
export type DeliveryStatus = "IN TRANSIT" | "DELIVERED" | "DELAYED" | "RETURNED";

export interface Window {
  as_of: string;
  days: number;
  start: string;
  end: string;
  previous_start: string;
  previous_end: string;
}

export interface Signal {
  id: string;
  domain: string;
  severity: Severity;
  title: string;
  metric: number | null;
  baseline: number | null;
  delta: number | null;
  unit: "inr" | "count" | "days" | null;
  evidence: string[];
  next_step: string;
  link: string;
  kpi: string;
  magnitude: number;
}

export interface Brief {
  generated_at: string;
  window: Window | null;
  role: Role | null;
  counts: Record<Severity, number>;
  signals: Signal[];
  empty: boolean;
  /** Orders in the window ÷ orders in the previous window; < 0.5 → partial. */
  completeness?: number | null;
  partial?: boolean;
}

export interface Comparison {
  current: number;
  previous: number;
  absolute_change: number;
  relative_change: number | null;
  direction: "up" | "down" | "flat";
}

export interface PerformanceSummary {
  as_of: string | null;
  days: number;
  metrics: Record<"revenue" | "orders" | "aov" | "return_rate" | "delayed_rate", Comparison>;
}

export interface Freshness {
  as_of: string | null;
  orders: number;
  forecast_as_of: string | null;
  forecast: "current" | "stale" | "missing";
  forecast_lag_days: number;
  last_import: ImportBatch | null;
}

// ── revenue ──────────────────────────────────────────────────────────────────
export interface DailyRevenue { date: string; orders: number; revenue: number; period: "current" | "previous" }
export interface MonthlyRevenue { month: string; orders: number; revenue: number; aov: number }
export interface CategoryChange { category: string; current: number; previous: number; share: number; change: number | null }
export interface MarginRow { revenue: number; est_margin: number; est_margin_pct: number; lines?: number }
export interface Margin {
  assumption: string;
  revenue: number;
  est_margin: number;
  est_margin_pct: number;
  break_even_discount_pct: number;
  by_discount_band: (MarginRow & { band: string })[];
  by_category: (MarginRow & { category: string })[];
}
export interface CityRow { city: string; orders: number; revenue: number; delayed_rate: number; return_rate: number }

// ── customers ────────────────────────────────────────────────────────────────
export interface ParetoCurve {
  points: { customers_pct: number; revenue_share: number; decile_share: number; customers: number }[];
  top20_share: number;
  customers: number;
}
export type Segment = "active" | "cooling" | "at_risk" | "one_time";
export interface ChurnRisk {
  as_of: string;
  rule: string;
  segments: { segment: Segment; customers: number; revenue: number; revenue_share: number }[];
  top_at_risk: { customer_id: string; orders: number; last_order: string; days_since: number; avg_gap_days: number; revenue: number }[];
}

// ── sellers ──────────────────────────────────────────────────────────────────
export interface SellerRow {
  seller_id: string;
  orders: number;
  revenue: number;
  revenue_share: number;
  avg_rating: number;
  delayed_rate: number;
  return_rate: number;
  eligible: boolean;
  delayed_z: number;
  return_z: number;
  flags: ("late_deliveries" | "returns")[];
}
export interface SellerScorecard {
  sellers_total: number;
  peers: {
    min_orders: number; eligible_sellers: number; delayed_p50: number; delayed_p90: number;
    return_p50: number; return_p90: number; delayed_pooled: number; return_pooled: number; z_min: number;
  };
  sellers: SellerRow[];
}

// ── fulfillment ──────────────────────────────────────────────────────────────
export interface Funnel {
  orders: number;
  statuses: { status: DeliveryStatus; orders: number; share: number; avg_ship_days: number }[];
  delayed_rate: number;
  return_rate: number;
  on_time_rate: number;
}
export interface Ageing {
  as_of: string;
  in_transit: number;
  past_promise: number;
  recent_past_promise: number;
  stale_over_30d: number;
  buckets: { bucket: string; orders: number; past_promise: number }[];
}
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
export interface OrderCreate {
  customer_id: string;
  order_date: string;
  ship_to_city: string;
  payment_method: string;
  device: string;
  shipping_time_days: number;
  items: { product_id: string; seller_id: string; quantity: number; unit_price: number; discount_pct: number }[];
}

// ── inventory ────────────────────────────────────────────────────────────────
export interface StockCover {
  as_of: string;
  velocity_days: number;
  threshold: number;
  products: number;
  critical: number;
  out_of_stock: number;
  items: {
    product_id: string; category: string; subcategory: string; brand: string; current_price: number;
    stock: number; snapshot_date: string; units_sold: number; revenue: number; daily_velocity: number;
    days_of_cover: number | null;
  }[];
}
export interface ReturnHotspots {
  baseline_return_rate: number;
  min_orders: number;
  orders_in_scope: number;
  pairs: { category: string; brand: string; orders: number; returns: number; return_rate: number; lift: number; z: number; refunded: number }[];
}

// ── entities ─────────────────────────────────────────────────────────────────
export interface Lifetime {
  orders: number; revenue: number; aov: number; delayed_rate: number; return_rate: number;
  first_order: string | null; last_order: string | null;
}
export interface RecentOrder {
  order_id: number; order_date: string; customer_id: string; ship_to_city: string;
  delivery_status: DeliveryStatus; product_id: string; seller_id: string; final_price: number; discount_pct: number;
}
export interface MonthPoint { month: string; orders: number; revenue: number }
export interface SellerProfile {
  seller_id: string; current_rating: number; lifetime: Lifetime; monthly: MonthPoint[];
  top_products: { product_id: string; category: string; brand: string; lines: number; revenue: number }[];
  categories: { category: string; revenue: number }[];
  recent_orders: RecentOrder[];
}
export interface ProductProfile {
  product_id: string; category: string; subcategory: string; brand: string; current_price: number;
  product_rating: number; review_count: number; latest_stock: number | null; stock_critical: boolean;
  units_sold_30d: number; days_of_cover: number | null; stock_history: { date: string; stock: number }[];
  lifetime: Lifetime; monthly: MonthPoint[]; sellers: { seller_id: string; lines: number; revenue: number }[];
  recent_orders: RecentOrder[];
}
export interface CustomerProfile {
  customer_id: string; home_city: string; first_purchase_date: string; lifetime: Lifetime;
  segment: Segment; days_since_last_order: number | null; avg_gap_days: number | null;
  categories: { category: string; revenue: number }[]; recent_orders: RecentOrder[];
}
export interface SearchHit { kind: "seller" | "product" | "customer" | "order"; id: string; hint: string | null }

// ── forecast ─────────────────────────────────────────────────────────────────
export interface ForecastResponse {
  asof: string | null;
  actuals: { date: string; revenue: number }[];
  forecasts: { rf: { date: string; yhat: number }[]; prophet: { date: string; yhat: number }[] };
}

// ── data: imports, governance, trust ─────────────────────────────────────────
export interface ExpectationResult {
  suite: string;
  expectation: string;
  column: string | null;
  rule: string;
  severity: "critical" | "warning";
  why: string;
  success: boolean;
  element_count: number | null;
  unexpected_count: number | null;
  unexpected_percent: number | null;
  sample: unknown[];
}
export interface ImportBatch {
  batch_id: number;
  filename: string;
  status: "processing" | "completed" | "failed";
  rows_total: number;
  rows_accepted: number;
  rows_duplicate: number;
  rows_rejected: number;
  rejections_by_rule: Record<string, number>;
  first_order_date: string | null;
  last_order_date: string | null;
  revenue_added: number;
  error: string | null;
  governance: { engine: string; suite: string; evaluated: number; successful: number; seconds: number; expectations: ExpectationResult[] } | null;
  created_at: string | null;
  finished_at: string | null;
  rejections?: { line_no: number; rule: string; rule_label: string; message: string; raw: Record<string, string> }[];
}
export interface ImportRules { columns: string[]; required: string[]; rules: Record<string, string>; max_bytes: number }
export interface GovernanceRun {
  run_id: number;
  trigger: "api" | "cli" | "import" | "ci";
  status: "running" | "passed" | "warning" | "failed" | "error";
  evaluated: number;
  successful: number;
  critical_failures: number;
  warnings: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  results?: ExpectationResult[];
}
export interface Expectation { type: string; kwargs: Record<string, unknown>; meta: { rule: string; severity: string; why: string } }
export interface Contract {
  engine: string;
  import_contract: Expectation[];
  books_contract: Record<string, { table?: string; query?: string; expectations: Expectation[] }>;
}
export interface TrustStatus {
  overall: { status: "trusted" | "limited" | "attention"; label: string; summary: string };
  workflow: { status: string; label: string; summary: string; last_run?: { started_at?: string | null; result_state?: string | null } | null };
  published_data: { validated_at: string; rows: number; revenue: number; summary: string };
  genie: { status: string; label: string };
}

// ── Ask ──────────────────────────────────────────────────────────────────────
/** "data": the marketplace's own records · "docs": attached documents only. */
export type AskMode = "data" | "docs";
export type ValueKind = "inr" | "pct" | "count" | "rating" | "share" | "date" | "id" | "text";
export interface AskMetric { label: string; value: number | string; kind: ValueKind; note?: string | null }
export interface AskTable {
  title?: string | null;
  columns: { key: string; label: string; kind: ValueKind }[];
  rows: Record<string, number | string>[];
}
export interface AskResult {
  /** Plain-text version (copy, feedback log). The structured fields drive the display. */
  answer: string;
  intent: string;
  headline?: string | null;
  metrics?: AskMetric[];
  table?: AskTable | null;
  takeaway?: string | null;
  suggestions?: string[];
  /** Report layer: title, date, the visual that answers the question, where to act, what to ask next. */
  report?: string | null;
  as_of?: string | null;
  chart?: import("@/features/ask/ReportChart").ChartSpec | null;
  next_step?: { label: string; link: string } | null;
  follow_ups?: string[];
  /** label is the business-facing name of a source; endpoint is for audit only. */
  sources: { label: string; endpoint: string; document?: string | null; chunk_index?: number | null; score?: number | null }[];
  interaction_id: number | null;
}
export type Rating = -1 | 0 | 1;
export interface DocumentRecord {
  document_id: number; filename: string; mime_type: string; size_bytes: number;
  status: "uploaded" | "ready" | "failed"; error: string | null;
}

// ── endpoints ────────────────────────────────────────────────────────────────
export const api = {
  brief: (days: number, role?: Role | null) => request<Brief>(`/insights/brief${qs({ days, role })}`),
  freshness: () => request<Freshness>("/meta/freshness"),
  performance: (days: number) => request<PerformanceSummary>(`/stats/performance-summary${qs({ days })}`),

  dailyRevenue: (days: number) => request<{ window: Window | null; days: DailyRevenue[] }>(`/stats/daily-revenue${qs({ days })}`),
  monthlyRevenue: (months = 24) => request<MonthlyRevenue[]>(`/stats/revenue-monthly${qs({ months })}`),
  categoryComparison: (days: number) => request<{ window: Window | null; categories: CategoryChange[] }>(`/stats/category-comparison${qs({ days })}`),
  margin: (days?: number) => request<Margin>(`/stats/margin${qs({ days })}`),
  cities: (days?: number) => request<CityRow[]>(`/stats/city-scorecard${qs({ days })}`),

  pareto: () => request<ParetoCurve>("/stats/pareto-curve"),
  churn: (limit = 25) => request<ChurnRisk>(`/stats/churn-risk${qs({ limit })}`),

  sellers: (days?: number, limit = 300) => request<SellerScorecard>(`/stats/seller-scorecard${qs({ days, limit })}`),

  funnel: (days?: number) => request<Funnel>(`/stats/fulfillment-funnel${qs({ days })}`),
  ageing: () => request<Ageing>("/stats/in-transit-ageing"),
  orders: (p: { customer_id?: string; delivery_status?: DeliveryStatus | ""; limit?: number; offset?: number }) =>
    request<Order[]>(`/orders${qs(p)}`),
  order: (id: number) => request<Order>(`/orders/${id}`),
  createOrder: (payload: OrderCreate) => request<Order>("/orders", { method: "POST", body: JSON.stringify(payload) }),
  transition: (id: number, delivery_status: DeliveryStatus) =>
    request<Order>(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ delivery_status }) }),

  stockCover: (limit = 100) => request<StockCover>(`/stats/stock-cover${qs({ limit })}`),
  returnHotspots: (days?: number, limit = 20) => request<ReturnHotspots>(`/stats/return-hotspots${qs({ days, limit })}`),

  seller: (id: string) => request<SellerProfile>(`/sellers/${encodeURIComponent(id)}`),
  product: (id: string) => request<ProductProfile>(`/products/${encodeURIComponent(id)}`),
  customer: (id: string) => request<CustomerProfile>(`/customers/${encodeURIComponent(id)}`),
  search: (q: string) => request<SearchHit[]>(`/search${qs({ q })}`),

  forecast: (trailing = 120) => request<ForecastResponse>(`/stats/forecast${qs({ trailing })}`),

  imports: () => request<ImportBatch[]>("/imports"),
  importBatch: (id: number) => request<ImportBatch>(`/imports/${id}`),
  importRules: () => request<ImportRules>("/imports/rules"),
  uploadImport: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportBatch>("/imports", { method: "POST", body: form });
  },
  templateUrl: `${BASE}/imports/template`,

  governanceLatest: () => request<GovernanceRun>("/governance/runs/latest"),
  governanceRuns: () => request<GovernanceRun[]>("/governance/runs"),
  governanceRun: () => request<GovernanceRun>("/governance/runs", { method: "POST" }),
  contract: () => request<Contract>("/governance/contract"),
  trust: () => request<TrustStatus>("/trust/status"),

  ask: (mode: AskMode, question: string, signal?: AbortSignal) =>
    request<AskResult>(mode === "data" ? "/ai/ask" : "/ai/ask-docs", {
      method: "POST", body: JSON.stringify({ question }), signal,
    }),
  rate: (interactionId: number, rating: Rating, comment?: string) =>
    request<{ interaction_id: number; rating: number | null }>(`/ai/interactions/${interactionId}/feedback`, {
      method: "POST", body: JSON.stringify({ rating, comment }),
    }),
  documents: () => request<DocumentRecord[]>("/documents"),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentRecord>("/documents", { method: "POST", body: form });
  },
  deleteDocument: (id: number) => request<void>(`/documents/${id}`, { method: "DELETE" }),
};
