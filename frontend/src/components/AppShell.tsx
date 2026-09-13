import {
  ChartLine,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Plus,
  Rows3,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { TrustStrip } from "@/components/TrustStrip";
import { cn } from "@/lib/utils";

const Overview = lazy(() => import("@/pages/Overview"));
const Sales = lazy(() => import("@/pages/Sales"));
const Sellers = lazy(() => import("@/pages/Sellers"));
const Operations = lazy(() => import("@/pages/Operations"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Orders = lazy(() => import("@/pages/Orders"));
const OrderDetail = lazy(() => import("@/pages/OrderDetail"));
const CreateOrder = lazy(() => import("@/pages/CreateOrder"));
const Assistant = lazy(() => import("@/pages/Assistant"));
const Documents = lazy(() => import("@/pages/Documents"));

function Section({ label }: { label: string }) {
  return (
    <p className="px-3 pt-5 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
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
          "flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors",
          isActive
            ? "bg-primary/10 font-medium text-foreground"
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
    <nav className="flex flex-col gap-0.5">
      <Section label="Marketplace" />
      <NavItem to="/" end icon={<LayoutDashboard size={17} strokeWidth={1.75} />} label="Today" onClick={onNavigate} />
      <NavItem to="/sales" icon={<ChartLine size={17} strokeWidth={1.75} />} label="Revenue" onClick={onNavigate} />
      <NavItem to="/sellers" icon={<Store size={17} strokeWidth={1.75} />} label="Sellers" onClick={onNavigate} />
      <NavItem to="/ask" icon={<MessageCircle size={17} strokeWidth={1.75} />} label="Ask" onClick={onNavigate} />
      <Section label="Fulfillment" />
      <NavItem to="/operations" icon={<ClipboardList size={17} strokeWidth={1.75} />} label="Needs action" onClick={onNavigate} />
      <NavItem to="/orders" icon={<Rows3 size={17} strokeWidth={1.75} />} label="Orders" onClick={onNavigate} />
      <NavItem to="/new" icon={<Plus size={17} strokeWidth={1.75} />} label="Book order" onClick={onNavigate} />
      <NavItem to="/documents" icon={<FileText size={17} strokeWidth={1.75} />} label="Briefs" onClick={onNavigate} />
      <Section label="Trust" />
      <NavItem to="/pipeline" icon={<ShieldCheck size={17} strokeWidth={1.75} />} label="How numbers are trusted" onClick={onNavigate} />
    </nav>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);

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
        <p className="mt-0.5 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
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
          <aside className="relative z-50 flex h-full w-64 flex-col bg-sidebar p-4 shadow-none">
            <div className="mb-2 flex items-center justify-between">
              <Link to="/" className="font-serif text-[1.25rem]" onClick={() => setOpen(false)}>
                Smart-ERP
              </Link>
              <button type="button" className="rounded-md p-2 text-muted-foreground" aria-label="Close menu" onClick={() => setOpen(false)}>
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

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm md:hidden">
          <button type="button" className="rounded-md p-2" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={18} />
          </button>
          <span className="font-serif text-lg">Smart-ERP</span>
        </header>
        <div id="main" className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          <Suspense fallback={<p className="text-[15px] text-muted-foreground">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/ask" element={<Assistant />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/sellers" element={<Sellers />} />
              <Route path="/operations" element={<Operations />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/new" element={<CreateOrder />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
