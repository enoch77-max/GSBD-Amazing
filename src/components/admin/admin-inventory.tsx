"use client";

import { useMemo, useState } from "react";
import { Boxes, Check, Download, Minus, Plus, Search, Star, TrendingUp, Users } from "lucide-react";
import { store } from "@/db/local-store";
import { ops } from "@/db/ops-store";
import { formatBDT, formatDate } from "@/lib/format";
import { useStoreVersion } from "@/lib/use-store";
import { can, exportCatalogue, inventoryValue, listOrders, lowStock, repeatCustomers, toggleFeatured, updatePrice, updateStock } from "@/lib/ops";
import { Badge, Button, Empty, Panel, Stat } from "./admin-ui";

export function AdminInventory({ toast }: { toast: (message: string) => void }) {
  const storeVersion = useStoreVersion();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [onlyLow, setOnlyLow] = useState(false);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Record<string, { stock?: string; price?: string }>>({});

  const refresh = () => setRevision((value) => value + 1);
  const threshold = ops.state.settings.notifications.lowStockThreshold;

  const { products, categories, low } = useMemo(() => {
    void revision; void storeVersion;
    const term = query.trim().toLowerCase();
    return {
      products: store.allProducts().filter((product) => {
        if (category !== "all" && product.categorySlug !== category) return false;
        if (onlyLow && product.stock > threshold) return false;
        if (!term) return true;
        return `${product.name} ${product.sku} ${product.brand}`.toLowerCase().includes(term);
      }),
      categories: store.tables.categories,
      low: lowStock(),
    };
  }, [query, category, onlyLow, threshold, revision, storeVersion]);

  const setField = (slug: string, field: "stock" | "price", value: string) =>
    setDraft((current) => ({ ...current, [slug]: { ...current[slug], [field]: value } }));

  const commit = (slug: string, field: "stock" | "price") => {
    const raw = draft[slug]?.[field];
    if (raw === undefined || raw === "") return;
    const value = Number(raw);
    if (!/^\d+$/.test(raw.trim()) || !Number.isFinite(value) || (field === "price" && value <= 0)) {
      setDraft((current) => ({ ...current, [slug]: { ...current[slug], [field]: undefined } }));
      toast(field === "price" ? "Enter a whole taka price above 0" : "Enter a whole number of units");
      return;
    }
    if (field === "stock") updateStock(slug, value);
    else updatePrice(slug, value);
    setDraft((current) => ({ ...current, [slug]: { ...current[slug], [field]: undefined } }));
    refresh();
    toast(store.persistError() ?? `${field === "stock" ? "Stock" : "Price"} updated`);
  };

  const nudge = (slug: string, current: number, by: number) => {
    updateStock(slug, Math.max(0, current + by));
    refresh();
  };

  const outOfStock = store.allProducts().filter((product) => product.stock === 0).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="adm-page-title">Stock & prices</h1>
          <p className="text-[0.78rem] text-[#6e6e73]">Quick inline edits. Use Catalogue to add products or change descriptions, photos and specifications.</p>
        </div>
        <Button size="sm" onClick={() => { exportCatalogue(); toast("Meta / Google product catalogue exported"); }}>
          <Download size={13} /> Ad catalogue feed
        </Button>
      </div>

      <div className="adm-kpis">
        <Stat label="SKUs" value={String(store.allProducts().length)} hint={`${categories.length} categories`} icon={<Boxes size={16} />} />
        <Stat label="Stock at retail" value={formatBDT(inventoryValue())} hint="sell-through value" tone="emerald" icon={<TrendingUp size={16} />} />
        <Stat label="Low stock" value={String(low.length)} hint={`≤ ${threshold} units`} tone="amber" />
        <Stat label="Out of stock" value={String(outOfStock)} hint="hidden from ads feed" tone="rose" />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
            <input className="adm-input pl-8" placeholder="Search product, SKU or brand…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search inventory" />
          </div>
          <select className="adm-select w-auto" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
          </select>
          <button type="button" className="adm-chip" data-active={onlyLow} onClick={() => setOnlyLow((value) => !value)}>Low stock only</button>
        </div>
      </Panel>

      <Panel>
        {products.length === 0 ? (
          <Empty icon={<Boxes size={22} />} title="No products match" />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Product</th><th>Category</th><th className="text-right">Price ৳</th><th className="text-center">Stock</th><th className="text-center">Featured</th></tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.slug}>
                    <td>
                      <p className="font-medium">{product.name} {!product.visible && <Badge className="ml-1">Hidden</Badge>}</p>
                      <p className="adm-num text-[0.67rem] text-[#6e6e73]">{product.sku} · {product.brand}</p>
                    </td>
                    <td className="text-[0.73rem] capitalize text-[#6e6e73]">{product.categorySlug.replace(/-/g, " ")}</td>
                    <td className="text-right">
                      <input
                        className="adm-input adm-num w-24 text-right" data-size="sm" inputMode="numeric"
                        value={draft[product.slug]?.price ?? String(product.price)}
                        disabled={!can("pricing.edit")}
                        onChange={(event) => setField(product.slug, "price", event.target.value)}
                        onBlur={() => commit(product.slug, "price")}
                        onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                        aria-label={`Price for ${product.name}`}
                      />
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" className="adm-icon-btn size-7" disabled={!can("stock.edit")} onClick={() => nudge(product.slug, product.stock, -1)} aria-label={`Decrease stock for ${product.name}`}><Minus size={12} /></button>
                        <input
                          className="adm-input adm-num w-16 text-center" data-size="sm" inputMode="numeric"
                          value={draft[product.slug]?.stock ?? String(product.stock)}
                          disabled={!can("stock.edit")}
                          onChange={(event) => setField(product.slug, "stock", event.target.value)}
                          onBlur={() => commit(product.slug, "stock")}
                          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                          aria-label={`Stock for ${product.name}`}
                        />
                        <button type="button" className="adm-icon-btn size-7" disabled={!can("stock.edit")} onClick={() => nudge(product.slug, product.stock, 1)} aria-label={`Increase stock for ${product.name}`}><Plus size={12} /></button>
                        {product.stock === 0 ? <Badge tone="rose">Out</Badge> : product.stock <= threshold ? <Badge tone="amber">Low</Badge> : null}
                      </div>
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="adm-icon-btn mx-auto size-7"
                        data-on={product.featured}
                        disabled={!can("catalogue.edit")}
                        aria-label={`${product.featured ? "Unfeature" : "Feature"} ${product.name}`}
                        aria-pressed={product.featured}
                        onClick={() => { toggleFeatured(product.slug); refresh(); toast(product.featured ? "Removed from bestsellers" : "Added to bestsellers"); }}
                        style={product.featured ? { color: "#65a30d", borderColor: "#b8de6f", background: "#f1f9e0" } : undefined}
                      >
                        <Star size={12} fill={product.featured ? "currentColor" : "none"} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */

export function AdminCustomers({ toast }: { toast: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const customers = useMemo(() => repeatCustomers(listOrders()), []);
  const filtered = customers.filter((customer) =>
    !query.trim() || `${customer.name} ${customer.phone}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const repeat = customers.filter((customer) => customer.orders > 1);
  const lifetime = customers.reduce((sum, customer) => sum + customer.spend, 0);

  return (
    <>
      <div>
        <h1 className="adm-page-title">Customers</h1>
        <p className="text-[0.78rem] text-[#6e6e73]">Built from order history — phone number is the identity key.</p>
      </div>

      <div className="adm-kpis">
        <Stat label="Customers" value={String(customers.length)} hint="unique numbers" icon={<Users size={16} />} />
        <Stat label="Repeat buyers" value={String(repeat.length)} hint={`${customers.length ? Math.round((repeat.length / customers.length) * 100) : 0}% of base`} tone="emerald" />
        <Stat label="Lifetime value" value={formatBDT(lifetime)} hint="all recorded orders" tone="sky" />
        <Stat label="Avg per customer" value={formatBDT(customers.length ? Math.round(lifetime / customers.length) : 0)} tone="amber" />
      </div>

      <Panel>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
          <input className="adm-input pl-8" placeholder="Search name or phone…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search customers" />
        </div>
      </Panel>

      <Panel>
        {filtered.length === 0 ? (
          <Empty icon={<Users size={22} />} title="No customers match" />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Customer</th><th className="text-right">Orders</th><th className="text-right">Spend</th><th className="text-right">Last order</th><th /></tr></thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.phone}>
                    <td>
                      <p className="font-medium">{customer.name}</p>
                      <p className="adm-num text-[0.68rem] text-[#6e6e73]">{customer.phone}</p>
                    </td>
                    <td className="adm-num text-right">{customer.orders} {customer.orders > 1 && <Badge tone="emerald" className="ml-1">repeat</Badge>}</td>
                    <td className="adm-num text-right font-semibold">{formatBDT(customer.spend)}</td>
                    <td className="text-right text-[0.72rem] text-[#6e6e73]">{formatDate(customer.last)}</td>
                    <td className="text-right">
                      <a className="adm-btn" data-size="sm" href={`https://wa.me/88${customer.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="flex items-center gap-1.5 text-[0.72rem] text-[#6e6e73]"><Check size={12} /> Export the orders CSV for a full customer list with addresses.</p>
      <button type="button" className="sr-only" onClick={() => toast("")}>noop</button>
    </>
  );
}
