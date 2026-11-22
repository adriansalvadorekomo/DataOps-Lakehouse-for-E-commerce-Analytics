import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, ReceiptText, Search, Store, User } from "lucide-react";
import { api, type SearchHit } from "@/lib/api";
import { statusLabel } from "@/lib/format";
import { NAV } from "./nav";

const KIND = {
  seller: { icon: Store, path: (id: string) => `/sellers/${id}`, label: "Seller" },
  product: { icon: Package, path: (id: string) => `/products/${id}`, label: "Product" },
  customer: { icon: User, path: (id: string) => `/customers/${id}`, label: "Customer" },
  order: { icon: ReceiptText, path: (id: string) => `/orders/${id}`, label: "Order" },
} as const;

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);
  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.search(debounced),
    enabled: debounced.length >= 2,
  });
  const go = (path: string) => {
    setQ("");
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) setQ(""); onOpenChange(o); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(640px,92vw)] -translate-x-1/2">
          <Dialog.Title className="sr-only">Search and jump</Dialog.Title>
          <Command shouldFilter={false} className="panel overflow-hidden shadow-2xl" label="Search and jump">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-ink-3" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Seller (S…), product (P…), customer (U…), order number, or a page"
                className="h-12 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-3"
              />
              {isFetching && <span className="size-1.5 animate-pulse-dot rounded-full bg-signal" />}
            </div>
            <Command.List className="max-h-[420px] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-3">
                {debounced.length >= 2 ? "No seller, product, customer or order starts with that." : "Type at least two characters."}
              </Command.Empty>
              {hits.length > 0 && (
                <Command.Group heading="Records" className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                  {hits.map((h: SearchHit) => {
                    const k = KIND[h.kind];
                    const Icon = k.icon;
                    return (
                      <Command.Item
                        key={`${h.kind}-${h.id}`}
                        value={`${h.kind}-${h.id}`}
                        onSelect={() => go(k.path(h.id))}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] data-[selected=true]:bg-panel-2"
                      >
                        <Icon className="size-4 text-ink-3" />
                        <span className="code font-medium">{h.kind === "order" ? `#${h.id}` : h.id}</span>
                        <span className="text-ink-3">{h.kind === "order" && h.hint ? statusLabel(h.hint) : h.hint}</span>
                        <span className="ml-auto label">{k.label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {NAV.flatMap((g) => g.items)
                  .filter((it) => !q || `${it.label} ${it.hint}`.toLowerCase().includes(q.toLowerCase()))
                  .map((it) => {
                    const Icon = it.icon;
                    return (
                      <Command.Item
                        key={it.to}
                        value={`page-${it.to}`}
                        onSelect={() => go(it.to)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] data-[selected=true]:bg-panel-2"
                      >
                        <Icon className="size-4 text-ink-3" />
                        <span className="font-medium">{it.label}</span>
                        <span className="text-ink-3">{it.hint}</span>
                      </Command.Item>
                    );
                  })}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
