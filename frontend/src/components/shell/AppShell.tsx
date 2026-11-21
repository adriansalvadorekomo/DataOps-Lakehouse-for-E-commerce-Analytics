import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Command, Menu, Moon, Sun, X } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand/BrandMark";
import { PageLoading } from "@/components/data/States";
import { useTheme } from "@/lib/hooks";
import { gsap, useGSAP, withMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { FreshnessPill } from "./FreshnessPill";
import { NAV } from "./nav";
import { PeriodSwitch } from "./PeriodSwitch";

const NAV_INDEX = new Map(NAV.flatMap((g) => g.items).map((it, i) => [it.to, i + 1]));

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="label mb-2 px-3">{g.group}</div>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const n = NAV_INDEX.get(it.to) ?? 0;
              const Icon = it.icon;
              return (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.to === "/"}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors",
                        isActive ? "bg-panel-2 text-ink" : "text-ink-2 hover:bg-panel-2/60 hover:text-ink",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity",
                            isActive ? "bg-signal opacity-100" : "opacity-0",
                          )}
                        />
                        <Icon className="size-4 shrink-0 opacity-80" strokeWidth={1.75} />
                        <span className="flex-1 font-medium">{it.label}</span>
                        <span className="num text-[11px] text-ink-3">{String(n).padStart(2, "0")}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-3 px-3" aria-label="Smart-ERP home">
      <BrandMark tile size={34} recordId="brand-record" />
      <div className="leading-tight">
        <Wordmark className="block text-[17px]" />
        <span className="block text-[11.5px] text-ink-3">Marketplace control tower</span>
      </div>
    </NavLink>
  );
}

export function AppShell() {
  const [theme, toggleTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  // Page transition: content rises in on every route change.
  useGSAP(
    () => {
      withMotion(() => {
        gsap.from(main.current, { opacity: 0, y: 10, duration: 0.45 });
      });
    },
    { dependencies: [pathname], scope: main },
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-line bg-sunken/60 px-3 py-6 lg:flex">
        <div className="flex flex-col gap-8">
          <Brand />
          <Nav />
        </div>
        <a
          href="https://adriansalvadorekomodev.vercel.app"
          target="_blank"
          rel="noreferrer"
          className="mx-3 flex items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-ink-3 transition-colors hover:text-ink"
        >
          <BrandMark size={16} className="text-ink-2" />
          <span className="text-[11.5px] leading-tight">
            Built by <span className="text-ink-2">adrián salvador ekomo</span>
            <br />
            data engineering <span className="text-signal">+</span> devops
          </span>
        </a>
      </aside>

      <div className="min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
              <Dialog.Trigger asChild>
                <button className="rounded-md p-2 text-ink-2 hover:bg-panel-2 lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col gap-8 overflow-y-auto border-r border-line bg-canvas px-3 py-6">
                  <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                  <div className="flex items-center justify-between pr-2">
                    <Brand />
                    <Dialog.Close className="rounded-md p-1.5 text-ink-3 hover:text-ink" aria-label="Close navigation">
                      <X className="size-4" />
                    </Dialog.Close>
                  </div>
                  <Nav onNavigate={() => setDrawerOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <div className="lg:hidden">
              <BrandMark tile size={28} />
            </div>

            <PeriodSwitch />
            <div className="flex-1" />
            <FreshnessPill />
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink sm:flex"
            >
              <Command className="size-3.5" />
              <span>Search sellers, products, orders…</span>
              <kbd className="code rounded border border-line px-1.5 text-[10.5px]">⌘K</kbd>
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="rounded-md p-2 text-ink-2 hover:bg-panel-2 sm:hidden"
              aria-label="Search"
            >
              <Command className="size-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="rounded-md p-2 text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
              aria-label={theme === "graphite" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "graphite" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </header>

        <main id="main" ref={main} className="mx-auto max-w-[1440px] px-4 pb-24 pt-8 sm:px-6 lg:px-8">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
