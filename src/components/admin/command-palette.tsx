"use client";

/**
 * ⌘K global search. One field finds an order number, a SKU/product, a
 * customer (name or phone) or a console section. Arrow keys + Enter on
 * desktop; large tap rows on mobile, where it opens as a bottom sheet.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, LayoutGrid, Package, Search, Store, User } from "lucide-react";
import { store } from "@/db/local-store";
import { listOrders, STATUS_META } from "@/lib/ops";
import { formatBDT } from "@/lib/format";

type Result =
  | { kind: "order"; id: string; title: string; meta: string; dot: string }
  | { kind: "product"; id: string; title: string; meta: string }
  | { kind: "customer"; id: string; title: string; meta: string }
  | { kind: "section"; id: string; title: string; meta: string; dest: string; sub: string };

export function CommandPalette({ open, onClose, destinations, onNavigate, onOpenOrder }: {
  open: boolean;
  onClose: () => void;
  destinations: Array<{ dest: string; sub: string; label: string }>;
  onNavigate: (dest: string, sub?: string) => void;
  onOpenOrder: (orderNumber: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const results = useMemo<Result[]>(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const sections: Result[] = destinations
      .filter((entry) => !q || entry.label.toLowerCase().includes(q))
      .map((entry) => ({ kind: "section", id: `${entry.dest}-${entry.sub}`, title: entry.label, meta: "Go to section", dest: entry.dest, sub: entry.sub }));
    if (!q) return sections.slice(0, 8);

    const orders = listOrders();
    const orderHits: Result[] = orders
      .filter((order) => order.orderNumber.toLowerCase().includes(q) || order.customerName.toLowerCase().includes(q) || (digits.length >= 4 && order.phone.replace(/\D/g, "").includes(digits)))
      .slice(0, 5)
      .map((order) => ({
        kind: "order", id: order.orderNumber, title: order.orderNumber,
        meta: `${order.customerName} · ${formatBDT(order.total)} · ${STATUS_META[order.status].label}`, dot: STATUS_META[order.status].dot,
      }));

    const productHits: Result[] = store.allProducts()
      .filter((product) => product.name.toLowerCase().includes(q) || product.slug.includes(q) || product.brand.toLowerCase().includes(q))
      .slice(0, 5)
      .map((product) => ({ kind: "product", id: product.slug, title: product.name, meta: `${formatBDT(product.price)} · ${product.stock} in stock` }));

    const seen = new Set<string>();
    const customerHits: Result[] = [];
    for (const order of orders) {
      const phone = order.phone.replace(/\D/g, "");
      if (seen.has(phone)) continue;
      if (order.customerName.toLowerCase().includes(q) || (digits.length >= 4 && phone.includes(digits))) {
        seen.add(phone);
        customerHits.push({ kind: "customer", id: phone, title: order.customerName, meta: order.phone });
      }
      if (customerHits.length >= 4) break;
    }
    return [...orderHits, ...productHits, ...customerHits, ...sections.slice(0, 4)];
  }, [open, query, destinations]);

  useEffect(() => { setCursor(0); }, [query]);

  if (!open) return null;

  const choose = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    if (result.kind === "order") onOpenOrder(result.id);
    else if (result.kind === "product") onNavigate("products", "catalogue");
    else if (result.kind === "customer") onNavigate("customers", "customers");
    else onNavigate(result.dest, result.sub);
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(results.length - 1, value + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(0, value - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(results[cursor]); }
  };

  const icon = (kind: Result["kind"]) =>
    kind === "order" ? <Package size={15} /> : kind === "product" ? <Store size={15} /> : kind === "customer" ? <User size={15} /> : <LayoutGrid size={15} />;
  const groupLabel: Record<Result["kind"], string> = { order: "Orders", product: "Products", customer: "Customers", section: "Sections" };

  return (
    <div className="ax-cmd-root" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKey}>
      <button type="button" className="ax-cmd-scrim" aria-label="Close search" onClick={onClose} />
      <div className="ax-cmd">
        <div className="ax-cmd-field">
          <Search size={17} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Order #, SKU, customer or phone…" aria-label="Search the console"
            role="combobox" aria-expanded="true" aria-controls="ax-cmd-list" aria-activedescendant={results[cursor] ? `cmd-${cursor}` : undefined} />
          <button type="button" className="ax-cmd-esc" onClick={onClose}>Esc</button>
        </div>
        <ul className="ax-cmd-list" id="ax-cmd-list" role="listbox">
          {results.length === 0 && <li className="ax-cmd-empty">No matches for “{query}”</li>}
          {results.map((result, index) => (
            <li key={`${result.kind}-${result.id}`} role="presentation">
              {(index === 0 || results[index - 1].kind !== result.kind) && <p className="ax-cmd-group">{groupLabel[result.kind]}</p>}
              <button type="button" id={`cmd-${index}`} role="option" aria-selected={cursor === index} className="ax-cmd-item"
                data-active={cursor === index} onMouseMove={() => setCursor(index)} onClick={() => choose(result)}>
                <span className="ax-cmd-icon">{icon(result.kind)}</span>
                <span className="min-w-0 flex-1">
                  <span className="ax-body block truncate font-medium">
                    {result.kind === "order" && <i className="ax-dot is-static mr-1.5" style={{ background: result.dot }} />}
                    {result.title}
                  </span>
                  <span className="ax-caption block truncate">{result.meta}</span>
                </span>
                {cursor === index ? <CornerDownLeft size={14} className="ax-cmd-enter" /> : <ArrowRight size={14} className="ax-cmd-enter opacity-0" />}
              </button>
            </li>
          ))}
        </ul>
        <p className="ax-cmd-foot"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> open · <kbd>esc</kbd> close</p>
      </div>
    </div>
  );
}
