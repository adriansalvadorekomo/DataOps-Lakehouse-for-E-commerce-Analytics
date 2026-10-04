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
  return <p className="section-kicker px-3 pt-5 pb-1">{label}</p>;
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
          "flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-[14px] transition-colors",
          isActive
            ? "border-border border-l-2 border-l-primary bg-card font-medium text-foreground shadow-sm"
            : "font-normal text-muted-foreground hover:bg-secondary hover:text-foreground",
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
      <NavItem to="/" end icon={<LayoutDashboard size={17} strokeWidth={1.75} />} label="Today" onClick={onNavigate} />
      <Section label="Commerce" />
      <NavItem to="/orders" icon={<Rows3 size={17} strokeWidth={1.75} />} label="Orders" onClick={onNavigate} />
      <NavItem to="/new" icon={<Plus size={17} strokeWidth={1.75} />} label="Book order" onClick={onNavigate} />
      <NavItem to="/sales" icon={<ChartLine size={17} strokeWidth={1.75} />} label="Revenue" onClick={onNavigate} />
      <NavItem to="/customers" icon={<Users size={17} strokeWidth={1.75} />} label="Customers" onClick={onNavigate} />
      <Section label="Operations" />
      <NavItem to="/sellers" icon={<Store size={17} strokeWidth={1.75} />} label="Sellers" onClick={onNavigate} />
      <NavItem to="/inventory" icon={<Boxes size={17} strokeWidth={1.75} />} label="Inventory" onClick={onNavigate} />
      <NavItem to="/operations" icon={<ClipboardList size={17} strokeWidth={1.75} />} label="Needs action" onClick={onNavigate} />
      <Section label="Analytics" />
      <NavItem to="/performance" icon={<Gauge size={17} strokeWidth={1.75} />} label="Performance" onClick={onNavigate} />
      <NavItem to="/forecast" icon={<TrendingUp size={17} strokeWidth={1.75} />} label="Forecast" onClick={onNavigate} />
      <Section label="Intelligence" />
      <NavItem to="/ask" icon={<MessageCircle size={17} strokeWidth={1.75} />} label="Ask" onClick={onNavigate} />
      <NavItem to="/documents" icon={<FileText size={17} strokeWidth={1.75} />} label="Documents" onClick={onNavigate} />
      <Section label="Platform" />
      <NavItem to="/pipeline" icon={<ShieldCheck size={17} strokeWidth={1.75} />} label="How numbers are trusted" onClick={onNavigate} />
    </nav>
  );
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
    const routeTitle = location.pathname.startsWith("/orders/")
      ? "Order detail"
      : location.pathname.startsWith("/sellers/")
        ? "Seller detail"
        : location.pathname.startsWith("/products/")
          ? "Product detail"
          : location.pathname.startsWith("/customers/")
            ? "Customer detail"
            : ROUTE_TITLES[location.pathname];
    document.title = `${routeTitle ?? "Page not found"} · Smart-ERP`;
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
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:flex">
        <Link to="/" className="px-2 font-serif text-[1.35rem] tracking-tight text-foreground">
          Smart-ERP
        </Link>
        <p className="mt-0.5 px-2 text-xs text-muted-foreground">
          India marketplace
        </p>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          <Nav />
        </div>
        <TrustStrip className="mt-4 border-t border-border pt-4" />
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
            className="relative z-50 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <Link to="/" className="font-serif text-[1.25rem]" onClick={() => setOpen(false)}>
                Smart-ERP
              </Link>
              <button
                ref={closeButtonRef}
                type="button"
                className="rounded-md p-3 text-muted-foreground"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Nav onNavigate={() => setOpen(false)} />
            </div>
            <TrustStrip className="mt-4 border-t border-border pt-4" />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1" aria-hidden={open || undefined}>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            className="rounded-md p-3"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(true)}
          >
            <Menu size={18} />
          </button>
          <span className="font-serif text-lg">Smart-ERP</span>
        </header>
        <main id="main" className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
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
