import {
  Boxes,
  ChartLine,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Plus,
  Rows3,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { PageHeader, PageSkeleton } from "@/components/PageHeader";
import { TrustStrip } from "@/components/TrustStrip";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Overview = lazy(() => import("@/pages/Overview"));
const Sales = lazy(() => import("@/pages/Sales"));
const Sellers = lazy(() => import("@/pages/Sellers"));
const SellerDetail = lazy(() => import("@/pages/SellerDetail"));
const ProductDetail = lazy(() => import("@/pages/ProductDetail"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const Customers = lazy(() => import("@/pages/Customers"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Performance = lazy(() => import("@/pages/Performance"));
const Forecast = lazy(() => import("@/pages/Forecast"));
const Operations = lazy(() => import("@/pages/Operations"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Orders = lazy(() => import("@/pages/Orders"));
const OrderDetail = lazy(() => import("@/pages/OrderDetail"));
const CreateOrder = lazy(() => import("@/pages/CreateOrder"));
const Assistant = lazy(() => import("@/pages/Assistant"));
const Documents = lazy(() => import("@/pages/Documents"));

const ROUTE_TITLES: Record<string, string> = {
  "/": "Today",
  "/sales": "Revenue",
  "/sellers": "Sellers",
  "/customers": "Customers",
  "/inventory": "Inventory",
  "/performance": "Performance",
  "/forecast": "Forecast",
  "/ask": "Ask",
  "/operations": "Needs action",
  "/orders": "Orders",
  "/new": "Book order",
  "/documents": "Documents",
  "/pipeline": "How numbers are trusted",
};

function Section({ label }: { label: string }) {
  return <p className="section-kicker px-3 pb-1 pt-4">{label}</p>;
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg px-2 py-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">
        <Store size={16} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold tracking-tight text-foreground">Smart-ERP</span>
        <span className="block text-xs text-muted-foreground">India marketplace</span>
      </span>
    </Link>
  );
}

function NavItem({
  to,
  icon,
  label,
  end,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] transition-colors",
          isActive
            ? "bg-secondary font-medium text-foreground"
            : "font-normal text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      <NavItem to="/" end icon={<LayoutDashboard   size={16} strokeWidth={1.75} />} label="Today" onClick={onNavigate} />
      <Section label="Commerce" />
      <NavItem to="/orders" icon={<Rows3   size={16} strokeWidth={1.75} />} label="Orders" onClick={onNavigate} />
      <NavItem to="/new" icon={<Plus   size={16} strokeWidth={1.75} />} label="Book order" onClick={onNavigate} />
      <NavItem to="/sales" icon={<ChartLine   size={16} strokeWidth={1.75} />} label="Revenue" onClick={onNavigate} />
      <NavItem to="/customers" icon={<Users   size={16} strokeWidth={1.75} />} label="Customers" onClick={onNavigate} />
      <Section label="Operations" />
      <NavItem to="/sellers" icon={<Store   size={16} strokeWidth={1.75} />} label="Sellers" onClick={onNavigate} />
      <NavItem to="/inventory" icon={<Boxes   size={16} strokeWidth={1.75} />} label="Inventory" onClick={onNavigate} />
      <NavItem to="/operations" icon={<ClipboardList   size={16} strokeWidth={1.75} />} label="Needs action" onClick={onNavigate} />
      <Section label="Analytics" />
      <NavItem to="/performance" icon={<Gauge   size={16} strokeWidth={1.75} />} label="Performance" onClick={onNavigate} />
      <NavItem to="/forecast" icon={<TrendingUp   size={16} strokeWidth={1.75} />} label="Forecast" onClick={onNavigate} />
      <Section label="Intelligence" />
      <NavItem to="/ask" icon={<MessageCircle   size={16} strokeWidth={1.75} />} label="Ask" onClick={onNavigate} />
      <NavItem to="/documents" icon={<FileText   size={16} strokeWidth={1.75} />} label="Documents" onClick={onNavigate} />
      <Section label="Platform" />
      <NavItem to="/pipeline" icon={<ShieldCheck   size={16} strokeWidth={1.75} />} label="How numbers are trusted" onClick={onNavigate} />
    </nav>
  );
}

const ROUTE_SECTIONS: Record<string, string> = {
  "/": "Overview",
  "/sales": "Commerce",
  "/sellers": "Operations",
  "/customers": "Commerce",
  "/inventory": "Operations",
  "/performance": "Analytics",
  "/forecast": "Analytics",
  "/ask": "Intelligence",
  "/operations": "Operations",
  "/orders": "Commerce",
  "/new": "Commerce",
  "/documents": "Intelligence",
  "/pipeline": "Platform",
};

function routeTitle(pathname: string): string {
  if (pathname.startsWith("/orders/")) return "Order detail";
  if (pathname.startsWith("/sellers/")) return "Seller detail";
  if (pathname.startsWith("/products/")) return "Product detail";
  if (pathname.startsWith("/customers/")) return "Customer detail";
  return ROUTE_TITLES[pathname] ?? "Page not found";
}

function routeSection(pathname: string): string {
  if (pathname.startsWith("/orders/")) return "Commerce";
  if (pathname.startsWith("/sellers/")) return "Operations";
  if (pathname.startsWith("/products/")) return "Operations";
  if (pathname.startsWith("/customers/")) return "Commerce";
  return ROUTE_SECTIONS[pathname] ?? "Console";
}

function NotFound() {
  return (
    <div className="space-y-6">
      <PageHeader title="Page not found" question="This route is not part of the marketplace console." />
      <Link to="/" className="text-link inline-block text-[15px] font-medium hover:underline">
        Go to Today
      </Link>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    document.title = `${routeTitle(location.pathname)} · Smart-ERP`;
    requestAnimationFrame(() => document.getElementById("page-title")?.focus());
  }, [location.pathname]);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      if (wasOpenRef.current) menuButtonRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }

    wasOpenRef.current = true;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-border bg-sidebar px-3 py-4 md:flex">
        <Brand />
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-2">
          <Nav />
        </div>
        <TrustStrip className="rounded-lg border border-border bg-card p-3 shadow-sm" />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-foreground/20" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside
            ref={drawerRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Marketplace navigation"
            className="relative z-50 flex h-full w-72 max-w-[85vw] flex-col gap-1 border-r border-border bg-sidebar px-3 py-4"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <Brand onNavigate={() => setOpen(false)} />
              <button
                ref={closeButtonRef}
                type="button"
                className="rounded-md p-2.5 text-muted-foreground hover:bg-secondary"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              <Nav onNavigate={() => setOpen(false)} />
            </div>
            <TrustStrip className="rounded-lg border border-border bg-card p-3 shadow-sm" />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col" aria-hidden={open || undefined}>
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-[88rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              ref={menuButtonRef}
              type="button"
              className="rounded-md p-2.5 md:hidden"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={16} />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
              <span className="hidden shrink-0 text-muted-foreground sm:inline">{routeSection(location.pathname)}</span>
              <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">/</span>
              <span className="truncate font-medium text-foreground" aria-current="page">{routeTitle(location.pathname)}</span>
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link to="/new" className={buttonVariants({ size: "sm" })}>
                <Plus size={14} strokeWidth={2.25} aria-hidden="true" />
                Book order
              </Link>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[88rem] flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/ask" element={<Assistant />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/sellers" element={<Sellers />} />
              <Route path="/sellers/:sellerId" element={<SellerDetail />} />
              <Route path="/products/:productId" element={<ProductDetail />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:customerId" element={<CustomerDetail />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/forecast" element={<Forecast />} />
              <Route path="/operations" element={<Operations />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/new" element={<CreateOrder />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
