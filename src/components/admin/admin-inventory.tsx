"use client";

/**
 * Stock & Prices — fast warehouse editor.
 *
 * Price, sale price and counts stage locally. A single Save changes action
 * commits the batch, while stock +/- buttons remain responsive enough for a
 * barcode-led count. Low-stock, out-of-stock and estimated-margin queues use
 * the same category assumptions as Analytics.
 */
import { useMemo, useState } from "react";
import { Barcode, Battery, Boxes, CircuitBoard, Cpu, Download, Package, Search, Zap } from "lucide-react";
import { store, type ManagedProduct } from "@/db/local-store";
import { ops } from "@/db/ops-store";
import { formatBDT } from "@/lib/format";
import { useStoreVersion } from "@/lib/use-store";
import { audit, can, download, toCsv, updatePrice, updateStock } from "@/lib/ops";
import { categoryOf, MARGIN_RATE } from "@/lib/admin-metrics";
import { ProductThumb } from "./product-thumb";
import { Button, Empty, PageHead, Panel, ReadOnlyNote } from "./admin-ui";

type InventoryFilter = "all" | "low" | "out" | "margin";
type PriceField = "regular" | "sale";
type PendingEdit = { stock?: number; salePrice?: number; regularPrice?: number | null };
type EditingCell = { slug: string; field: PriceField } | null;

const FILTERS: Array<{ id: InventoryFilter; label: string }> = [
  { id: "low", label: "Low stock" },
  { id: "out", label: "Out of stock" },
  { id: "margin", label: "Margin alert" },
  { id: "all", label: "All products" },
];

function CategoryPill({ product }: { product: ManagedProduct }) {
  const icon = product.categorySlug === "battery-cells" ? <Battery size={13} />
    : product.categorySlug === "battery-packs" ? <Package size={13} />
      : product.categorySlug === "bms-circuits" ? <Cpu size={13} />
        : product.categorySlug === "ups-power" ? <Zap size={13} />
          : product.categorySlug === "diy-prototyping" ? <CircuitBoard size={13} /> : <Boxes size={13} />;
  const label = store.tables.categories.find((entry) => entry.slug === product.categorySlug)?.name ?? product.categorySlug;
  return <span className="ax-category-pill" title={label}>{icon}<span>{label}</span></span>;
}

function StockStatus({ stock, threshold }: { stock: number; threshold: number }) {
  if (stock <= 0) return <span className="ax-stock-pill" data-tone="out"><i />Out of stock</span>;
  if (stock <= threshold) return <span className="ax-stock-pill" data-tone="low"><i />Low · {stock}</span>;
  return <span className="ax-stock-pill" data-tone="ok"><i />In stock</span>;
}

function estimatedCost(product: ManagedProduct) {
  const rate = MARGIN_RATE[categoryOf(product.slug)];
  const listPrice = product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : product.price;
  return Math.round(listPrice * (1 - rate));
}

function marginAlert(product: ManagedProduct, salePrice = product.price) {
  return salePrice < estimatedCost(product);
}

function bulkTier(product: ManagedProduct) {
  return product.specs.find((spec) => /bulk|trade|wholesale|tier/i.test(spec.label) && spec.value.trim()) ?? null;
}

export function AdminInventory({ toast }: { toast: (message: string) => void }) {
  const version = useStoreVersion();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [pending, setPending] = useState<Record<string, PendingEdit>>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [tierFor, setTierFor] = useState<string | null>(null);
  const [tierValue, setTierValue] = useState("");
  const threshold = ops.state.settings.notifications.lowStockThreshold;
  const canStock = can("stock.edit");
  const canPrice = can("pricing.edit");

  const all = useMemo(() => { void version; return store.allProducts(); }, [version]);
  const categories = store.tables.categories;
  const counts = useMemo(() => ({
    all: all.length,
    low: all.filter((product) => product.stock > 0 && product.stock <= threshold).length,
    out: all.filter((product) => product.stock === 0).length,
    margin: all.filter((product) => marginAlert(product)).length,
  }), [all]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return all
      .filter((product) => category === "all" || product.categorySlug === category)
      .filter((product) => {
        const stock = pending[product.slug]?.stock ?? product.stock;
        const sale = pending[product.slug]?.salePrice ?? product.price;
        return filter === "all" || (filter === "low" ? stock > 0 && stock <= threshold : filter === "out" ? stock === 0 : marginAlert(product, sale));
      })
      .filter((product) => !term || `${product.name} ${product.sku} ${product.brand} ${product.slug}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const score = (product: ManagedProduct) => product.stock === 0 ? 0 : product.stock <= threshold ? 1 : marginAlert(product) ? 2 : 3;
        return score(a) - score(b) || a.name.localeCompare(b.name);
      });
  }, [all, category, filter, query, pending]);

  const staged = (product: ManagedProduct) => ({
    stock: pending[product.slug]?.stock ?? product.stock,
    sale: pending[product.slug]?.salePrice ?? product.price,
    regular: pending[product.slug]?.regularPrice !== undefined ? pending[product.slug].regularPrice : product.compareAtPrice,
  });

  const stage = (slug: string, patch: PendingEdit) => {
    setPending((current) => {
      const product = store.findAnyProduct(slug);
      if (!product) return current;
      const nextEdit = { ...current[slug], ...patch };
      const stock = nextEdit.stock ?? product.stock;
      const sale = nextEdit.salePrice ?? product.price;
      const regular = nextEdit.regularPrice !== undefined ? nextEdit.regularPrice : product.compareAtPrice;
      if (stock === product.stock && sale === product.price && regular === product.compareAtPrice) {
        const next = { ...current }; delete next[slug]; return next;
      }
      return { ...current, [slug]: nextEdit };
    });
  };

  const beginEdit = (product: ManagedProduct, field: PriceField) => {
    if (!canPrice) return;
    const current = staged(product);
    setEditingCell({ slug: product.slug, field });
    setEditValue(String(field === "sale" ? current.sale : current.regular ?? current.sale));
  };

  const finishEdit = (commit: boolean) => {
    if (!editingCell) return;
    if (commit) {
      const raw = editValue.trim();
      if (editingCell.field === "regular" && !raw) stage(editingCell.slug, { regularPrice: null });
      else {
        const value = Number(raw.replace(/\D/g, ""));
        if (!Number.isInteger(value) || value <= 0) toast("Enter a price above 0, or clear the regular price");
        else stage(editingCell.slug, editingCell.field === "sale" ? { salePrice: value } : { regularPrice: value });
      }
    }
    setEditingCell(null);
    setEditValue("");
  };

  const stageStock = (product: ManagedProduct, quantity: number) => {
    if (!canStock) return;
    stage(product.slug, { stock: Math.max(0, Math.min(100000, Math.round(quantity))) });
  };

  const dirtyCount = Object.keys(pending).length;
  const save = () => {
    if (!dirtyCount) return;
    const changes = Object.entries(pending);
    for (const [slug, edit] of changes) {
      const product = store.findAnyProduct(slug);
      if (!product) continue;
      const sale = edit.salePrice ?? product.price;
      const regular = edit.regularPrice !== undefined ? edit.regularPrice : product.compareAtPrice;
      if (!Number.isInteger(sale) || sale <= 0) { toast(`${product.sku}: sale price must be above 0`); return; }
      if (regular !== null && regular !== undefined && (!Number.isInteger(regular) || regular <= sale)) {
        toast(`${product.sku}: regular price must be higher than sale price`); return;
      }
      if (edit.stock !== undefined && (!Number.isInteger(edit.stock) || edit.stock < 0 || edit.stock > 100000)) {
        toast(`${product.sku}: stock must be between 0 and 100,000`); return;
      }
    }
    changes.forEach(([slug, edit]) => {
      const product = store.findAnyProduct(slug);
      if (!product) return;
      if (edit.stock !== undefined && edit.stock !== product.stock) updateStock(slug, edit.stock);
      if (edit.salePrice !== undefined || edit.regularPrice !== undefined) {
        const sale = edit.salePrice ?? product.price;
        const regular = edit.regularPrice !== undefined ? edit.regularPrice : product.compareAtPrice;
        updatePrice(slug, sale, regular !== null && regular !== undefined && regular > sale ? regular : null);
      }
    });
    audit("Saved stock and pricing batch", `${changes.length} products`);
    setPending({});
    toast(store.persistError() ?? `Saved ${changes.length} product${changes.length === 1 ? "" : "s"}`);
  };
  const discard = () => { setPending({}); setEditingCell(null); setEditValue(""); };

  const priceControl = (product: ManagedProduct, field: PriceField) => {
    const active = editingCell?.slug === product.slug && editingCell.field === field;
    const current = staged(product);
    const label = field === "regular" ? "Price" : "Sale price";
    const amount = field === "sale" ? current.sale : current.regular ?? current.sale;
    if (active) return (
      <label className="ax-edit-price" data-field={field}>
        <span>{label}</span>
        <span className="ax-edit-price-field"><i>৳</i><input autoFocus inputMode="numeric" value={editValue} aria-label={`${label} for ${product.name}`}
          onChange={(event) => setEditValue(event.target.value.replace(/\D/g, ""))}
          onBlur={() => finishEdit(true)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishEdit(true); } if (event.key === "Escape") finishEdit(false); }} /></span>
      </label>
    );
    return (
      <button type="button" className="ax-price-pill" data-field={field} disabled={!canPrice} onClick={() => beginEdit(product, field)} aria-label={`Edit ${label.toLowerCase()} for ${product.name}`}>
        <i>{label}</i><b className="adm-num">{field === "regular" && current.regular == null ? <>{formatBDT(amount)} <small>list</small></> : formatBDT(amount)}</b>
      </button>
    );
  };

  const openTier = (product: ManagedProduct) => {
    if (!canPrice) return;
    setTierFor(product.slug);
    setTierValue(bulkTier(product)?.value ?? "");
  };
  const saveTier = (product: ManagedProduct) => {
    const value = tierValue.trim().slice(0, 40);
    const label = /bulk|trade|wholesale|tier/i.test(bulkTier(product)?.label ?? "") ? bulkTier(product)!.label : "Bulk price · 10+";
    const specs = value
      ? [...product.specs.filter((spec) => !/bulk|trade|wholesale|tier/i.test(spec.label)), { label, value }]
      : product.specs.filter((spec) => !/bulk|trade|wholesale|tier/i.test(spec.label));
    store.updateProduct(product.slug, { specs });
    audit("Updated bulk tier price", product.name, value || "cleared");
    setTierFor(null);
    setTierValue("");
    toast(store.persistError() ?? (value ? "Bulk tier price saved" : "Bulk tier price cleared"));
  };
  const tierIndicator = (product: ManagedProduct) => {
    const tier = bulkTier(product);
    return <button type="button" className="ax-tier-indicator" data-has-tier={Boolean(tier)} disabled={!canPrice} onClick={() => openTier(product)} title="Set the bulk / trade price shown on the product page">
      {tier ? <>{tier.label}<span className="adm-num">{tier.value}</span></> : <>No bulk tier <span>Add</span></>}
    </button>;
  };
  const tierEditor = (product: ManagedProduct) => {
    if (tierFor !== product.slug) return null;
    return (
      <form className="ax-tier-editor" onSubmit={(event) => { event.preventDefault(); saveTier(product); }}>
        <label className="min-w-0 flex-1"><span className="ax-caption">Bulk tier price · e.g. ৳7,900 for 10+</span>
          <input className="adm-input" autoFocus value={tierValue} maxLength={40} placeholder="৳7,900 for 10+" aria-label={`Bulk tier price for ${product.name}`} onChange={(event) => setTierValue(event.target.value)} />
        </label>
        <button type="submit" className="adm-btn" data-variant="primary" data-size="sm">Save tier</button>
        <button type="button" className="adm-btn" data-size="sm" onClick={() => setTierFor(null)}>Cancel</button>
      </form>
    );
  };

  const stockStepper = (product: ManagedProduct, compact = false) => {
    const quantity = pending[product.slug]?.stock ?? product.stock;
    return <div className={`ax-stepper${compact ? " compact" : ""}`} aria-label={`Stock controls for ${product.name}`}>
      <button type="button" disabled={!canStock || quantity <= 0} aria-label={`Decrease ${product.name} stock`} onClick={() => stageStock(product, quantity - 1)}>−</button>
      <input inputMode="numeric" aria-label={`Stock count for ${product.name}`} value={quantity} disabled={!canStock}
        onChange={(event) => { const value = event.target.value.replace(/\D/g, ""); stageStock(product, value === "" ? 0 : Number(value)); }} />
      <button type="button" disabled={!canStock} aria-label={`Increase ${product.name} stock`} onClick={() => stageStock(product, quantity + 1)}>+</button>
    </div>;
  };

  const ProductCard = ({ product }: { product: ManagedProduct }) => {
    const stock = pending[product.slug]?.stock ?? product.stock;
    const sale = pending[product.slug]?.salePrice ?? product.price;
    const tier = bulkTier(product);
    return (
      <article className="ax-stock-card" data-pending={pending[product.slug] ? "true" : undefined}>
        <header className="ax-stock-card-head">
          <ProductThumb src={product.images?.[0] ?? null} size="lg" />
          <div className="min-w-0 flex-1"><p className="ax-product-name" title={product.name}>{product.name}</p><p className="ax-product-sku">{product.sku} · {product.brand}</p></div>
          <CategoryPill product={product} />
        </header>
        <div className="ax-stock-price-row">{priceControl(product, "regular")}{priceControl(product, "sale")}</div>
        <div className="ax-stock-action-row">
          <div className="ax-stock-count-block"><span className="ax-stock-label">Stock count</span><StockStatus stock={stock} threshold={threshold} /></div>
          {stockStepper(product)}
        </div>
        {tierEditor(product)}
        <footer className="ax-stock-card-foot">
          {tierIndicator(product)}
          {marginAlert(product, sale) ? <span className="ax-margin-alert" title="Estimated cost model from category assumptions">Margin alert</span> : <span className="ax-margin-est" title="Estimated category margin; not product-level COGS">~{Math.max(0, Math.round(((sale - estimatedCost(product)) / Math.max(1, sale)) * 100))}% est. margin</span>}
        </footer>
      </article>
    );
  };

  const exportRows = () => download(`stock-prices-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((product) => ({
    sku: product.sku, product: product.name, category: store.tables.categories.find((entry) => entry.slug === product.categorySlug)?.name ?? product.categorySlug,
    regularPrice: product.compareAtPrice ?? product.price, salePrice: product.price, stock: product.stock,
    marginAlert: marginAlert(product) ? "yes · modelled" : "no · modelled", bulkTier: bulkTier(product)?.value ?? "",
  }))));

  return (
    <>
      <PageHead title="Stock & prices" subtitle={`${all.length} SKUs · ${counts.low} low stock · ${counts.out} out · ${counts.margin} modelled margin alerts`}
        actions={<Button size="sm" variant="ghost" onClick={exportRows}><Download size={13} /> Export CSV</Button>} />
      {!canStock && !canPrice && <ReadOnlyNote>View only — your role cannot change stock or pricing.</ReadOnlyNote>}

      <Panel>
        <div className="ax-stock-toolbar">
          <div className="relative min-w-0 flex-1">
            <Barcode size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--adm-faint)]" />
            <input className="adm-input pl-9" placeholder="Scan barcode or search SKU / product…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Barcode, SKU or product search" />
          </div>
          <select className="adm-select ax-stock-category" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>{categories.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
          </select>
        </div>
        <div className="ax-seg wrap mt-3" role="tablist" aria-label="Warehouse filters">
          {FILTERS.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={filter === entry.id} data-active={filter === entry.id} onClick={() => setFilter(entry.id)}>{entry.label}<span className="ax-seg-count">{counts[entry.id]}</span></button>)}
        </div>
        <p className="ax-margin-disclaimer">Margin alerts use category-level cost assumptions, not item COGS. Add real costs before treating them as accounting figures.</p>
      </Panel>

      <Panel>
        {rows.length === 0 ? <Empty icon={<Boxes size={22} />} title="Nothing in this queue" body="Try another filter or scan a different SKU." /> : <>
          <div className="hidden lg:block adm-table-wrap"><table className="adm-table ax-stock-table">
            <thead><tr><th>Product</th><th>Price / sale</th><th>Count</th><th>Status</th><th>Bulk tier</th><th>Margin</th></tr></thead>
            <tbody>{rows.map((product) => {
              const stock = pending[product.slug]?.stock ?? product.stock;
              const sale = pending[product.slug]?.salePrice ?? product.price;
              return <tr key={product.slug} data-pending={pending[product.slug] ? "true" : undefined}>
                <td><div className="ax-stock-product"><ProductThumb src={product.images?.[0] ?? null} size="sm" /><span className="min-w-0"><b className="ax-product-name" title={product.name}>{product.name}</b><small className="ax-product-sku">{product.sku}</small><span className="mt-1 block"><CategoryPill product={product} /></span></span></div></td>
                <td><div className="ax-stock-price-row compact">{priceControl(product, "regular")}{priceControl(product, "sale")}</div></td>
                <td>{stockStepper(product, true)}</td>
                <td><StockStatus stock={stock} threshold={threshold} /></td>
                <td>{tierIndicator(product)}{tierEditor(product)}</td>
                <td>{marginAlert(product, sale) ? <span className="ax-margin-alert">Alert</span> : <span className="ax-margin-est">~{Math.max(0, Math.round(((sale - estimatedCost(product)) / Math.max(1, sale)) * 100))}%</span>}</td>
              </tr>;
            })}</tbody>
          </table></div>
          <div className="ax-stock-mobile lg:hidden">{rows.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
        </>}
      </Panel>

      {dirtyCount > 0 && <div className="ax-savebar" role="status" aria-live="polite">
        <span><b>{dirtyCount}</b> {dirtyCount === 1 ? "product changed" : "products changed"}</span>
        <button type="button" className="ax-savebar-discard" onClick={() => setPending({})}>Discard</button>
        <button type="button" className="ax-savebar-save" disabled={!canStock && !canPrice} onClick={save}>Save {dirtyCount} {dirtyCount === 1 ? "change" : "changes"}</button>
      </div>}
    </>
  );
}
