"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDown, ArrowUp, BatteryCharging, Check, CheckCircle2, Copy, ExternalLink, Eye, EyeOff,
  Download, ImagePlus, PackagePlus, Pencil, Plus, RotateCcw, Search, Star, Trash2, X, Battery, Cpu, Zap, CircuitBoard, Wrench, Tags, ChevronDown,
} from "lucide-react";
import { store, type ManagedProduct, type ProductInput } from "@/db/local-store";
import { ops } from "@/db/ops-store";
import type { Product } from "@/db/schema";
import { useStoreVersion } from "@/lib/use-store";
import { formatBDT } from "@/lib/format";
import { isStockedReadyPack, readReadyPackSpecs } from "@/lib/ready-pack-specs";
import { audit, can, download, toCsv } from "@/lib/ops";
import { Badge, Button, Drawer, Empty, Field, PageHead, Panel, ReadOnlyNote } from "./admin-ui";
import { ActionMenu } from "./action-menu";
import { ProductThumb } from "./product-thumb";
import { COMPATIBILITY_PRESETS, normalizeCompatibilityTag, readCompatibilityTags, visibleHighlights, withCompatibilityTags } from "@/lib/compatibility-tags";
import { cardMetaLine, genuineConfirmed, specChips } from "@/lib/product-quality";
import { NO_PRESENTATION, readPresentation, withPresentation, type ProductPresentation } from "@/lib/product-presentation";
import { Glyph } from "@/components/store/store-visuals";

type Spec = { label: string; value: string };
type Draft = {
  slug: string; name: string; sku: string; brand: string; categorySlug: string;
  price: string; compareAtPrice: string; stock: string; warrantyMonths: string; badge: string;
  featured: boolean; visible: boolean;
  shortDescription: string; description: string; highlights: string;
  specs: Spec[]; images: string[]; compatibilityTags: string[]; presentation: ProductPresentation;
};

type StatusFilter = "all" | "live" | "hidden" | "out" | "packs";
type EditorTab = "basics" | "tech" | "compatibility";

/** The fields the pack builder reads before recommending a ready-made pack. */
const READY_PACK_SPECS: Spec[] = [
  { label: "Chemistry", value: "" },
  { label: "Configuration", value: "" },
  { label: "Capacity", value: "" },
  { label: "Nominal voltage", value: "" },
  { label: "Charge voltage", value: "" },
  { label: "Cutoff voltage", value: "" },
  { label: "Continuous discharge current", value: "" },
  { label: "BMS", value: "" },
  { label: "Output connector", value: "" },
  { label: "Energy", value: "" },
  { label: "Dimensions", value: "" },
  { label: "Weight", value: "" },
];

/** Same resolution the storefront uses, so bundled /images/* paths render in the single-file build. */
const resolveImage = (url: string) => (typeof globalThis.__gsbdAsset === "function" ? globalThis.__gsbdAsset(url) : url);

const slugify = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

function draftFrom(product: ManagedProduct | null, preset?: "pack"): Draft {
  if (product) {
    return {
      slug: product.slug, name: product.name, sku: product.sku, brand: product.brand, categorySlug: product.categorySlug,
      price: String(product.price), compareAtPrice: product.compareAtPrice == null ? "" : String(product.compareAtPrice),
      stock: String(product.stock), warrantyMonths: String(product.warrantyMonths), badge: product.badge ?? "",
      featured: product.featured, visible: product.visible,
      shortDescription: product.shortDescription, description: product.description,
      highlights: visibleHighlights(product.highlights).join("\n"), specs: product.specs.map((spec) => ({ ...spec })), images: [...product.images],
      compatibilityTags: readCompatibilityTags(product.highlights), presentation: readPresentation(product.highlights),
    };
  }
  const pack = preset === "pack";
  return {
    slug: "", name: "", sku: "", brand: pack ? "Glowing Space Lab" : "", categorySlug: pack ? "battery-packs" : store.tables.categories[0]?.slug ?? "",
    price: "", compareAtPrice: "", stock: "0", warrantyMonths: pack ? "12" : "3", badge: pack ? "Ready to ship" : "",
    featured: false, visible: !pack,
    shortDescription: "", description: "", highlights: "",
    specs: pack ? READY_PACK_SPECS.map((spec) => ({ ...spec })) : [], images: [], compatibilityTags: [], presentation: { ...NO_PRESENTATION },
  };
}

type Checked = { input: ProductInput | null; errors: Partial<Record<keyof Draft | "form", string>> };

function validate(draft: Draft, editing: ManagedProduct | null): Checked {
  const errors: Checked["errors"] = {};
  const whole = (value: string) => /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  const slug = (editing ? editing.slug : draft.slug).trim().toLowerCase();
  if (draft.name.trim().length < 3) errors.name = "Enter a product name of at least 3 characters.";
  if (!editing) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = "Use lowercase letters, numbers and single dashes.";
    else if (store.findAnyProduct(slug)) errors.slug = "Another product already uses this URL.";
  }
  if (!draft.sku.trim()) errors.sku = "Enter a SKU for stock and courier records.";
  else if (store.allProducts().some((product) => product.sku.trim().toLowerCase() === draft.sku.trim().toLowerCase() && product.slug !== editing?.slug)) errors.sku = "This SKU is already in use.";
  if (!draft.brand.trim()) errors.brand = "Enter the brand or maker.";
  if (!store.tables.categories.some((category) => category.slug === draft.categorySlug)) errors.categorySlug = "Choose a category.";
  const price = whole(draft.price);
  if (!Number.isFinite(price) || price <= 0) errors.price = "Enter a whole taka price above 0.";
  const compareAt = draft.compareAtPrice.trim() ? whole(draft.compareAtPrice) : null;
  if (compareAt !== null && (!Number.isFinite(compareAt) || compareAt <= price)) errors.compareAtPrice = "The original price must be higher than the selling price, or left blank.";
  const stock = whole(draft.stock);
  if (!Number.isFinite(stock) || stock > 100000) errors.stock = "Enter a whole number from 0 to 100,000.";
  const warranty = whole(draft.warrantyMonths);
  if (!Number.isFinite(warranty) || warranty > 120) errors.warrantyMonths = "Enter 0–120 months.";
  if (draft.shortDescription.trim().length < 10) errors.shortDescription = "Write a one-line summary (at least 10 characters).";
  const badSpec = draft.specs.find((spec) => spec.label.trim() && !spec.value.trim() || !spec.label.trim() && spec.value.trim());
  if (badSpec) errors.specs = `Complete or remove the “${badSpec.label.trim() || badSpec.value.trim()}” specification.`;
  const labels = draft.specs.filter((spec) => spec.label.trim()).map((spec) => spec.label.trim().toLowerCase());
  if (new Set(labels).size !== labels.length) errors.specs = "Each specification label can only appear once.";
  const badImage = draft.images.find((url) => !/^(https:\/\/|\/|data:image\/(jpeg|png|webp);base64,)/i.test(url.trim()));
  if (badImage !== undefined) errors.images = "Images must be HTTPS links, site paths starting with /, or uploaded files.";
  if (Object.keys(errors).length) return { input: null, errors };
  return {
    errors,
    input: {
      slug, name: draft.name.trim(), sku: draft.sku.trim(), brand: draft.brand.trim(), categorySlug: draft.categorySlug,
      price, compareAtPrice: compareAt, stock, warrantyMonths: warranty, badge: draft.badge.trim() || null,
      featured: draft.featured, shortDescription: draft.shortDescription.trim(),
      description: draft.description.trim() || draft.shortDescription.trim(),
      highlights: withPresentation(withCompatibilityTags(draft.highlights.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 8), draft.compatibilityTags), draft.presentation),
      specs: draft.specs.filter((spec) => spec.label.trim()).map((spec) => ({ label: spec.label.trim(), value: spec.value.trim() })),
      images: draft.images.map((url) => url.trim()).filter(Boolean),
      rating: editing?.rating ?? 0, reviewCount: editing?.reviewCount ?? 0,
    },
  };
}

/** What the pack builder will do with this listing, in the merchant's terms. */
export function packReadiness(product: Pick<Product, "categorySlug" | "stock" | "price" | "name" | "badge" | "shortDescription" | "description" | "specs"> & { slug?: string; visible?: boolean }) {
  const entry = { ...product, slug: product.slug ?? "draft", images: [] as string[] };
  const shelf = isStockedReadyPack(entry);
  const spec = readReadyPackSpecs(entry);
  const verified = shelf && spec.issues.length === 0;
  return { shelf, spec, verified };
}

function CategoryPill({ slug, label }: { slug: string; label: string }) {
  const icon = slug === "battery-cells" ? <Battery size={13} />
    : slug === "battery-packs" || slug === "ups-power" ? <PackagePlus size={13} />
      : slug === "bms-circuits" ? <Cpu size={13} />
        : slug === "diy-prototyping" ? <CircuitBoard size={13} />
          : slug === "tools-safety" ? <Wrench size={13} /> : <Zap size={13} />;
  return <span className="ax-category-pill" title={label}>{icon}<span>{label}</span></span>;
}

function StockPill({ stock, threshold }: { stock: number; threshold: number }) {
  if (stock <= 0) return <span className="ax-stock-pill" data-tone="out"><i />Out of stock</span>;
  if (stock <= threshold) return <span className="ax-stock-pill" data-tone="low"><i />Low · {stock}</span>;
  return <span className="ax-stock-pill" data-tone="ok"><i />{stock} in stock</span>;
}

function ActiveSwitch({ product, disabled, onChange }: { product: Pick<ManagedProduct, "name" | "visible">; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="ax-active-switch" title={product.visible ? "Active on the storefront" : "Draft · hidden from the storefront"}>
      <span className="ax-active-label">{product.visible ? "Active" : "Draft"}</span>
      <button type="button" role="switch" aria-checked={product.visible} aria-label={`${product.visible ? "Move to draft" : "Activate"} ${product.name}`}
        className="ax-switch-lg" data-on={product.visible} disabled={disabled} onClick={() => onChange(!product.visible)}>
        <span />
      </button>
    </div>
  );
}

function ReadinessBadge({ product }: { product: ManagedProduct }) {
  if (product.categorySlug !== "battery-packs") return null;
  const { verified, spec } = packReadiness(product);
  if (verified) return <Badge tone="emerald">Pack Builder match</Badge>;
  if (spec.issues.length) return <Badge tone="amber">Needs specs</Badge>;
  return <Badge>Not suggested</Badge>;
}

async function compressImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is larger than 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("That file could not be read as an image."));
      element.src = url;
    });
    const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot process images.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > 420_000 && quality > 0.5) {
      quality -= 0.08;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Queued by Stock & Prices so the tier pill lands on the right product tab. */
let pendingProductEdit: { slug: string; tab?: EditorTab } | null = null;
export function requestProductEdit(slug: string, tab?: EditorTab) { pendingProductEdit = { slug, tab }; }

export function AdminCatalogue({ toast }: { toast: (message: string) => void }) {
  useStoreVersion();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<{ product: ManagedProduct | null; preset?: "pack"; copyOf?: ManagedProduct; tab?: EditorTab } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  useEffect(() => {
    if (!pendingProductEdit) return;
    const queued = pendingProductEdit;
    pendingProductEdit = null;
    const product = store.allProducts().find((entry) => entry.slug === queued.slug);
    if (product) setEditing({ product, tab: queued.tab });
  }, []);
  const canEdit = can("catalogue.edit");
  const canDelete = can("catalogue.delete");
  const canPrice = can("pricing.edit");
  const canStock = can("stock.edit");

  const all = store.allProducts();
  const categories = store.tables.categories;
  const categoryName = (slug: string) => categories.find((entry) => entry.slug === slug)?.name ?? slug;
  const deletedSeeds = store.deletedSeedProducts();

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return all
      .filter((product) => category === "all" || product.categorySlug === category)
      .filter((product) => status === "all" || (status === "live" && product.visible) || (status === "hidden" && !product.visible)
        || (status === "out" && product.stock === 0) || (status === "packs" && product.categorySlug === "battery-packs"))
      .filter((product) => !term || `${product.name} ${product.sku} ${product.brand} ${product.slug}`.toLowerCase().includes(term))
      .sort((a, b) => Number(a.visible) - Number(b.visible) || a.name.localeCompare(b.name));
  }, [all, query, category, status]);

  const counts = {
    all: all.length,
    live: all.filter((product) => product.visible).length,
    hidden: all.filter((product) => !product.visible).length,
    out: all.filter((product) => product.stock === 0).length,
    packs: all.filter((product) => product.categorySlug === "battery-packs").length,
  };

  const report = (message: string) => toast(store.persistError() ?? message);
  const pickedRows = all.filter((product) => picked.includes(product.slug));
  const allShownPicked = rows.length > 0 && rows.every((product) => picked.includes(product.slug));
  const togglePick = (slug: string) => setPicked((current) => (current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]));
  const bulk = (label: string, fn: (product: ManagedProduct) => void) => {
    pickedRows.forEach(fn);
    audit(label, `${pickedRows.length} product${pickedRows.length === 1 ? "" : "s"}`, pickedRows.slice(0, 5).map((p) => p.name).join(", "));
    report(`${label} · ${pickedRows.length} product${pickedRows.length === 1 ? "" : "s"}`);
  };
  const exportProducts = (list: ManagedProduct[]) => download(`products-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(list.map((p) => ({
    slug: p.slug, name: p.name, sku: p.sku, brand: p.brand, category: categoryName(p.categorySlug), price: p.price,
    compare_at: p.compareAtPrice ?? "", stock: p.stock, status: p.visible ? "on sale" : "hidden", bestseller: p.featured ? "yes" : "no",
  }))));

  return (
    <>
      <PageHead
        title="Products"
        subtitle="Add, edit, hide and remove products. Changes appear on the storefront and in the Pack Builder immediately."
        actions={<>
          <Button size="sm" variant="ghost" onClick={() => exportProducts(rows)}><Download size={13} /> Export CSV</Button>
          {canEdit && <Button size="sm" onClick={() => setEditing({ product: null, preset: "pack" })}><BatteryCharging size={13} /> New ready-made pack</Button>}
          {canEdit && <Button size="sm" variant="primary" onClick={() => setEditing({ product: null })}><Plus size={13} /> New product</Button>}
        </>}
      />
      {!canEdit && <ReadOnlyNote>View only — your role cannot create or edit products.</ReadOnlyNote>}

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
            <input className="adm-input pl-8" placeholder="Search name, SKU, brand or URL…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search catalogue" />
          </div>
          <select className="adm-select w-auto" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
          </select>
        </div>
        <div className="adm-scroll mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Status filter">
          {([["all", "All"], ["live", "On sale"], ["hidden", "Hidden"], ["out", "Out of stock"], ["packs", "Battery packs"]] as const).map(([id, label]) => (
            <button key={id} type="button" className="adm-chip" data-active={status === id} aria-pressed={status === id} onClick={() => setStatus(id)}>
              {label} <span className="adm-mono opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        {rows.length === 0 ? (
          <Empty icon={<Search size={22} />} title="No products match" body="Try another search, category or status filter." />
        ) : (
          <>
            {/* Desktop operations table */}
            <div className="hidden lg:block adm-table-wrap">
              <table className="adm-table ax-products-table">
                <thead><tr><th className="w-8"><input type="checkbox" className="adm-checkbox" aria-label="Select all shown products" checked={allShownPicked} onChange={() => setPicked(allShownPicked ? picked.filter((slug) => !rows.some((r) => r.slug === slug)) : [...new Set([...picked, ...rows.map((r) => r.slug)])])} /></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Listing</th><th /></tr></thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.slug} data-hidden={!product.visible} data-selected={picked.includes(product.slug)}>
                      <td><input type="checkbox" className="adm-checkbox" aria-label={`Select ${product.name}`} checked={picked.includes(product.slug)} onChange={() => togglePick(product.slug)} /></td>
                      <td>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProductThumb src={product.images?.[0] ?? null} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={product.name}>{product.name}</p>
                            <p className="adm-num text-[0.67rem] text-[#6e6e73]">{product.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td><CategoryPill slug={product.categorySlug} label={categoryName(product.categorySlug)} /></td>
                      <td>
                        <span className="adm-num font-semibold">{formatBDT(product.price)}</span>
                        {product.compareAtPrice && product.compareAtPrice > product.price && <span className="ax-old-price">{formatBDT(product.compareAtPrice)}</span>}
                      </td>
                      <td><StockPill stock={product.stock} threshold={ops.state.settings.notifications.lowStockThreshold} /></td>
                      <td>
                        <ActiveSwitch product={product} disabled={!canEdit} onChange={(active) => {
                          store.setProductVisible(product.slug, active);
                          audit(active ? "Activated product" : "Drafted product", product.name);
                          report(active ? "Product is active" : "Product moved to draft");
                        }} />
                      </td>
                      <td className="text-right">
                        <ActionMenu label={`Actions for ${product.name}`} items={[
                          { label: "Edit product", icon: <Pencil size={15} />, disabled: !canEdit, onClick: () => setEditing({ product }) },
                          { label: "Duplicate", icon: <Copy size={15} />, disabled: !canEdit, onClick: () => setEditing({ product: null, copyOf: product }) },
                          ...(product.visible ? [{ label: "View storefront", icon: <ExternalLink size={15} />, href: `/product/${product.slug}` }] : []),
                          { label: "Delete product", icon: <Trash2 size={15} />, tone: "danger" as const, disabled: !canDelete, onClick: () => setConfirmDelete(product.slug) },
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards: name and SKU first, then category / price / stock / listing. */}
            <div className="lg:hidden flex flex-col gap-2.5">
              {rows.map((product) => {
                const isSelected = picked.includes(product.slug);
                return (
                  <article key={product.slug} className="ax-product-card" data-selected={isSelected || undefined}>
                    <header className="ax-product-card-head">
                      <label className="ax-check-hit"><input type="checkbox" className="adm-checkbox" aria-label={`Select ${product.name}`} checked={isSelected} onChange={() => togglePick(product.slug)} /></label>
                      <ProductThumb src={product.images?.[0] ?? null} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="ax-product-name" title={product.name}>{product.name}</p>
                        <p className="ax-product-sku">{product.sku}</p>
                      </div>
                      <ActionMenu label={`Actions for ${product.name}`} items={[
                        { label: "Edit product", icon: <Pencil size={15} />, disabled: !canEdit, onClick: () => setEditing({ product }) },
                        { label: "Duplicate", icon: <Copy size={15} />, disabled: !canEdit, onClick: () => setEditing({ product: null, copyOf: product }) },
                        ...(product.visible ? [{ label: "View storefront", icon: <ExternalLink size={15} />, href: `/product/${product.slug}` }] : []),
                        { label: "Delete product", icon: <Trash2 size={15} />, tone: "danger" as const, disabled: !canDelete, onClick: () => setConfirmDelete(product.slug) },
                      ]} />
                    </header>

                    {confirmDelete === product.slug && (
                      <div className="ax-delete-confirm">
                        <span>Delete permanently?</span>
                        <button type="button" className="adm-btn" data-variant="danger" data-size="sm" onClick={() => {
                          store.deleteProduct(product.slug); audit("Deleted product", product.name); setConfirmDelete(null);
                          setPicked((cur) => cur.filter((slug) => slug !== product.slug));
                          report(product.custom ? "Product deleted" : "Product deleted — restore it below at any time");
                        }}>Delete</button>
                        <button type="button" className="adm-btn" data-size="sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                      </div>
                    )}

                    <div className="ax-product-facts">
                      <CategoryPill slug={product.categorySlug} label={categoryName(product.categorySlug)} />
                      <div className="ax-product-prices">
                        <span className="ax-price-pill"><i>Price</i><b className="adm-num">{formatBDT(product.price)}</b></span>
                        {product.compareAtPrice && product.compareAtPrice > product.price && <span className="ax-price-pill is-sale"><i>Sale</i><b className="adm-num">{formatBDT(product.price)}</b></span>}
                      </div>
                      <StockPill stock={product.stock} threshold={ops.state.settings.notifications.lowStockThreshold} />
                    </div>

                    <footer className="ax-product-card-foot">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {product.featured && <Badge tone="sky">Bestseller</Badge>}
                        {product.categorySlug === "battery-packs" && <ReadinessBadge product={product} />}
                      </div>
                      <ActiveSwitch product={product} disabled={!canEdit} onChange={(active) => {
                        store.setProductVisible(product.slug, active);
                        audit(active ? "Activated product" : "Drafted product", product.name);
                        report(active ? "Product is active" : "Product moved to draft");
                      }} />
                    </footer>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      {pickedRows.length > 0 && (
        <div className="adm-bulkbar" role="region" aria-label="Bulk product actions">
          <span className="text-[0.8rem] font-semibold">{pickedRows.length} selected</span>
          {canEdit && <Button size="sm" variant="accent" onClick={() => bulk("Put on sale", (p) => store.setProductVisible(p.slug, true))}><Eye size={12} /> On sale</Button>}
          {canEdit && <Button size="sm" onClick={() => bulk("Hid products", (p) => store.setProductVisible(p.slug, false))}><EyeOff size={12} /> Hide</Button>}
          {canEdit && <Button size="sm" onClick={() => bulk("Marked bestsellers", (p) => store.updateProduct(p.slug, { featured: true }))}><Star size={12} /> Bestseller</Button>}
          {canPrice && (
            <span className="flex items-center gap-1">
              <input className="adm-input adm-num w-20" data-size="sm" inputMode="numeric" placeholder="±%" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value.replace(/[^\d-]/g, "").slice(0, 4))} aria-label="Adjust price by percent" />
              <Button size="sm" disabled={!/^-?\d{1,2}$/.test(bulkPrice) || Number(bulkPrice) === 0} onClick={() => { const pct = Number(bulkPrice); bulk(`Adjusted price ${pct > 0 ? "+" : ""}${pct}%`, (p) => store.updateProduct(p.slug, { price: Math.max(1, Math.round(p.price * (1 + pct / 100))), compareAtPrice: p.compareAtPrice && p.compareAtPrice > Math.round(p.price * (1 + pct / 100)) ? p.compareAtPrice : null })); setBulkPrice(""); }}>Apply %</Button>
            </span>
          )}
          {canStock && (
            <span className="flex items-center gap-1">
              <input className="adm-input adm-num w-20" data-size="sm" inputMode="numeric" placeholder="Stock" value={bulkStock} onChange={(e) => setBulkStock(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Set stock for selected" />
              <Button size="sm" disabled={!bulkStock} onClick={() => { const qty = Number(bulkStock); bulk(`Set stock to ${qty}`, (p) => store.updateProduct(p.slug, { stock: qty })); setBulkStock(""); }}>Set stock</Button>
            </span>
          )}
          <Button size="sm" onClick={() => exportProducts(pickedRows)}><Download size={12} /> Export</Button>
          {canDelete && (confirmBulkDelete
            ? <><span className="text-[0.75rem] text-[#fda29b]">Delete {pickedRows.length}?</span><Button size="sm" variant="danger" onClick={() => { bulk("Deleted products", (p) => store.deleteProduct(p.slug)); setPicked([]); setConfirmBulkDelete(false); }}>Confirm delete</Button></>
            : <Button size="sm" variant="danger" onClick={() => setConfirmBulkDelete(true)}><Trash2 size={12} /> Delete</Button>)}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setPicked([]); setConfirmBulkDelete(false); }}>Clear</Button>
        </div>
      )}

      {deletedSeeds.length > 0 && (
        <Panel title="Deleted built-in products" subtitle="Restore any original catalogue item with its original details">
          <ul className="flex flex-col gap-2">
            {deletedSeeds.map((product) => (
              <li key={product.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e3e3e8] bg-[#f5f5f7] px-3 py-2">
                <span className="text-[0.8rem]">{product.name} <span className="adm-num text-[0.68rem] text-[#6e6e73]">· {product.sku}</span></span>
                <Button size="sm" disabled={!canEdit} onClick={() => { store.restoreSeedProduct(product.slug); audit("Restored product", product.name); report("Product restored"); }}><RotateCcw size={12} /> Restore</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editing && (
        <ProductEditor
          key={editing.product?.slug ?? `new-${editing.preset ?? ""}-${editing.copyOf?.slug ?? ""}`}
          product={editing.product}
          preset={editing.preset}
          copyOf={editing.copyOf}
          initialTab={editing.tab}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(message) => { setEditing(null); report(message); }}
        />
      )}
    </>
  );
}

function ProductEditor({ product, preset, copyOf, categories, initialTab = "basics", onClose, onSaved }: {
  product: ManagedProduct | null;
  preset?: "pack";
  copyOf?: ManagedProduct;
  initialTab?: EditorTab;
  categories: Array<{ slug: string; name: string }>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const initial = useMemo(() => {
    if (!copyOf) return draftFrom(product, preset);
    const copy = draftFrom(copyOf);
    return { ...copy, slug: "", name: `${copy.name} (copy)`, sku: `${copy.sku}-COPY`, stock: "0", visible: false, featured: false };
  }, [product, preset, copyOf]);
  const [draft, setDraft] = useState<Draft>(initial);
  const canEdit = can("catalogue.edit");
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [tagInput, setTagInput] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Checked["errors"]>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "name" && !product && !slugTouched) next.slug = slugify(String(value));
      return next;
    });
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const close = () => (dirty ? setConfirmDiscard(true) : onClose());

  const isPack = draft.categorySlug === "battery-packs";
  const readiness = isPack ? packReadiness({
    categorySlug: draft.categorySlug, stock: Number(draft.stock) || 0, price: Number(draft.price) || 0, name: draft.name,
    badge: draft.badge || null, shortDescription: draft.shortDescription, description: draft.description,
    specs: draft.specs.filter((spec) => spec.label.trim() && spec.value.trim()), visible: draft.visible,
  }) : null;

  const save = () => {
    const checked = validate(draft, product);
    setErrors(checked.errors);
    if (!checked.input) return;
    if (product) {
      const { slug, rating, reviewCount, createdAt, ...patch } = checked.input;
      void slug; void rating; void reviewCount; void createdAt;
      store.updateProduct(product.slug, patch);
      store.setProductVisible(product.slug, draft.visible);
      audit("Edited product", checked.input.name);
      onSaved("Product saved");
      return;
    }
    const created = store.createProduct(checked.input);
    if (!created.ok) { setErrors({ slug: created.error }); return; }
    store.setProductVisible(created.product.slug, draft.visible);
    audit("Created product", created.product.name, draft.visible ? "On sale" : "Hidden");
    onSaved(draft.visible ? "Product created and on sale" : "Product created as hidden — put it on sale when ready");
  };

  const upload = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      const data = await compressImage(file);
      setDraft((current) => ({ ...current, images: [...current.images, data] }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const err = (key: keyof Checked["errors"]) => errors[key] ? <span className="adm-field-error" role="alert">{errors[key]}</span> : null;
  const moveImage = (index: number, by: number) => setDraft((current) => {
    const images = [...current.images];
    const target = index + by;
    if (target < 0 || target >= images.length) return current;
    [images[index], images[target]] = [images[target], images[index]];
    return { ...current, images };
  });
  const coreMatchers = {
    voltage: (label: string) => /nominal voltage|^voltage$/i.test(label.trim()),
    capacity: (label: string) => /^capacity$/i.test(label.trim()),
    discharge: (label: string) => /discharge/i.test(label) && !/charge/i.test(label),
  };
  const coreValue = (kind: keyof typeof coreMatchers) => draft.specs.find((spec) => coreMatchers[kind](spec.label))?.value ?? "";
  const setCoreValue = (kind: keyof typeof coreMatchers, fallbackLabel: string, value: string) => {
    const index = draft.specs.findIndex((spec) => coreMatchers[kind](spec.label));
    const specs = [...draft.specs];
    if (index < 0) {
      if (value.trim()) specs.push({ label: fallbackLabel, value: value.trim() });
    } else if (!value.trim()) {
      specs.splice(index, 1);
    } else {
      specs[index] = { ...specs[index], value: value.trim() };
    }
    set("specs", specs);
  };
  const coreSpec = (label: string) => Object.values(coreMatchers).some((matcher) => matcher(label));
  const extraSpecs = draft.specs.map((spec, index) => ({ spec, index })).filter(({ spec }) => !coreSpec(spec.label));
  const addTag = (value: string) => {
    const tag = normalizeCompatibilityTag(value);
    if (!tag) return;
    set("compatibilityTags", [...new Set([...draft.compatibilityTags, tag])].slice(0, 16));
    setTagInput("");
  };
  const toggleTag = (value: string) => {
    const tag = normalizeCompatibilityTag(value);
    const has = draft.compatibilityTags.some((current) => current.toLowerCase() === tag.toLowerCase());
    set("compatibilityTags", has ? draft.compatibilityTags.filter((current) => current.toLowerCase() !== tag.toLowerCase()) : [...draft.compatibilityTags, tag].slice(0, 16));
  };


  return (
    <Drawer
      open wide onClose={close}
      title={product ? product.name : preset === "pack" ? "New ready-made pack" : copyOf ? "Duplicate product" : "New product"}
      subtitle={product ? `/${product.slug} · ${product.sku}` : "Draft saved when you choose Save Product"}
      footer={confirmDiscard ? (
        <div className="ax-editor-footer ax-editor-confirm" role="alert">
          <span className="ax-caption">Discard unsaved changes?</span>
          <Button variant="danger" onClick={onClose}>Discard changes</Button>
          <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
        </div>
      ) : (
        <div className="ax-editor-footer">
          <Button variant="ghost" onClick={close}>Discard</Button>
          <span className="ax-editor-footer-note">{Object.values(errors).some(Boolean) ? "Check the highlighted fields" : dirty ? "Unsaved changes" : "All changes saved"}</span>
          <Button variant="primary" onClick={save} disabled={!canEdit}>
            <Check size={14} /> {product ? "Save Product" : "Save Product"}
          </Button>
        </div>
      )}
    >
      <div className="ax-editor-tabs" role="tablist" aria-label="Product editor sections">
        {([
          ["basics", "Basics", <PackagePlus size={14} />],
          ["tech", "Tech specs", <BatteryCharging size={14} />],
          ["compatibility", "Compatibility", <Tags size={14} />],
        ] as Array<[EditorTab, string, React.ReactNode]>).map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-active={tab === id} onClick={() => setTab(id)}>
            {icon}<span>{label}</span>
          </button>
        ))}
      </div>

      {tab === "basics" && (
        <div className="ax-editor-page">
          <section className="ax-editor-block">
            <header><div><h3>Product identity</h3><p>What shoppers and warehouse staff see.</p></div></header>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product title">
                <input className="adm-input" value={draft.name} onChange={(event) => set("name", event.target.value)} aria-invalid={Boolean(errors.name)} />{err("name")}
              </Field>
              <Field label="SKU" hint="Scan-friendly stock and warranty reference">
                <input className="adm-input adm-mono" value={draft.sku} onChange={(event) => set("sku", event.target.value.toUpperCase())} aria-invalid={Boolean(errors.sku)} />{err("sku")}
              </Field>
              <Field label="Brand / maker"><input className="adm-input" value={draft.brand} onChange={(event) => set("brand", event.target.value)} aria-invalid={Boolean(errors.brand)} />{err("brand")}</Field>
              <Field label="Category">
                <select className="adm-select" value={draft.categorySlug} onChange={(event) => set("categorySlug", event.target.value)}>
                  {categories.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
                </select>{err("categorySlug")}
              </Field>
              {!product && <Field label="URL slug" hint="Generated from the title; keep short and readable">
                <input className="adm-input adm-mono" value={draft.slug} onChange={(event) => { setSlugTouched(true); set("slug", slugify(event.target.value)); }} aria-invalid={Boolean(errors.slug)} />{err("slug")}
              </Field>}
              <Field label="Listing badge" hint="Optional · e.g. Bestseller, New">
                <input className="adm-input" value={draft.badge} maxLength={28} onChange={(event) => set("badge", event.target.value)} />
              </Field>
            </div>
          </section>

          <section className="ax-editor-block">
            <header><div><h3>Pricing & listing</h3><p>Live price and storefront visibility.</p></div></header>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Sale price · BDT">
                <div className="ax-price"><span className="ax-price-symbol">৳</span><input className="adm-num" inputMode="numeric" disabled={!can("pricing.edit")} value={draft.price} onChange={(event) => set("price", event.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(errors.price)} /></div>{err("price")}
              </Field>
              <Field label="Regular price · BDT" hint="Leave blank if not discounted">
                <div className="ax-price"><span className="ax-price-symbol">৳</span><input className="adm-num" inputMode="numeric" disabled={!can("pricing.edit")} value={draft.compareAtPrice} onChange={(event) => set("compareAtPrice", event.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(errors.compareAtPrice)} /></div>{err("compareAtPrice")}
              </Field>
              <Field label="Opening stock"><input className="adm-input adm-num" inputMode="numeric" disabled={!can("stock.edit")} value={draft.stock} onChange={(event) => set("stock", event.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(errors.stock)} />{err("stock")}</Field>
            </div>
            <div className="ax-listing-switches">
              <div><span><b>Active listing</b><small>Customers can find and buy this product.</small></span><ActiveSwitch product={{ name: draft.name || "product", visible: draft.visible }} disabled={!canEdit} onChange={(value) => set("visible", value)} /></div>
              <div><span><b>Bestseller</b><small>Feature this product in the storefront shelf.</small></span>
                <button type="button" role="switch" aria-label="Show in Bestsellers" aria-checked={draft.featured} className="ax-switch-lg" data-on={draft.featured} onClick={() => set("featured", !draft.featured)}><span /></button>
              </div>
            </div>
            <div className="ax-listing-switches">
              <div><span><b>Genuine / original</b><small>Switch on only when you can stand behind the item as an original. This is the card’s single accent badge.</small></span>
                <button type="button" role="switch" aria-label="Mark this product as genuine" aria-checked={draft.presentation.genuine} className="ax-switch-lg" data-on={draft.presentation.genuine} onClick={() => set("presentation", { genuine: !draft.presentation.genuine })}><span /></button>
              </div>
            </div>
          </section>

          <section className="ax-editor-block">
            <header><div><h3>Images</h3><p>First image is the product card thumbnail.</p></div></header>
            {draft.images.length > 0 && (
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {draft.images.map((url, index) => (
                  <li key={`${index}-${url.slice(0, 40)}`} className="adm-image-tile">
                    <img src={resolveImage(url)} alt={`Product image ${index + 1}`} />
                    {index === 0 && <span className="adm-image-main">Main</span>}
                    <div className="adm-image-actions">
                      <button type="button" aria-label="Move image earlier" disabled={index === 0} onClick={() => moveImage(index, -1)}><ArrowUp size={12} /></button>
                      <button type="button" aria-label="Move image later" disabled={index === draft.images.length - 1} onClick={() => moveImage(index, 1)}><ArrowDown size={12} /></button>
                      <button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => set("images", draft.images.filter((_, i) => i !== index))}><X size={12} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <input className="adm-input min-w-[180px] flex-1" placeholder="Paste image URL" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} aria-label="Add image URL" />
              <Button size="sm" disabled={!imageUrl.trim()} onClick={() => { set("images", [...draft.images, imageUrl.trim()]); setImageUrl(""); }}>Add URL</Button>
              <Button size="sm" variant="primary" disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus size={13} /> {uploading ? "Processing…" : "Upload"}</Button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload product image" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
            </div>
            {uploadError && <span className="adm-field-error" role="alert">{uploadError}</span>}{err("images")}
          </section>

          <section className="ax-editor-block" aria-label="Storefront signals">
            <header><div><h3>What the storefront will show</h3><p>Live preview from this record — claims without data are never displayed.</p></div></header>
            {(() => {
              const preview = {
                ...({} as ManagedProduct),
                specs: draft.specs.filter((entry) => entry.label.trim() && entry.value.trim()),
                warrantyMonths: Number(draft.warrantyMonths) || 0,
                highlights: draft.highlights.split("\n").map((line) => line.trim()).filter(Boolean),
                rating: product?.rating ?? 0,
                reviewCount: product?.reviewCount ?? 0,
                brand: draft.brand,
                categorySlug: draft.categorySlug,
              } as ManagedProduct;
              const genuine = genuineConfirmed(preview);
              const meta = cardMetaLine(preview);
              return (
                <div className="ax-signals">
                  <div>
                    <span className="ax-caption">Accent badge</span>
                    <ul>{genuine ? <li><Glyph name="shield" size={13} />{genuine}</li> : <li data-empty="true">Off — no authenticity badge shown</li>}</ul>
                  </div>
                  <div>
                    <span className="ax-caption">Variant / spec line</span>
                    <ul>{meta.length ? <li><span>{meta.join(" · ")}</span></li> : <li data-empty="true">Add a badge or spec in Tech specs</li>}</ul>
                  </div>
                  <p className="ax-caption">The card keeps one accent badge at most. Specs and warranty sit on a single muted line below the product name.</p>
                </div>
              );
            })()}
          </section>

          <details className="ax-editor-accordion">
            <summary><span><ChevronDown size={15} /> Product copy</span><small>Description and customer-facing highlights</small></summary>
            <div className="grid gap-3 pt-3">
              <Field label="One-line summary"><input className="adm-input" value={draft.shortDescription} maxLength={180} onChange={(event) => set("shortDescription", event.target.value)} aria-invalid={Boolean(errors.shortDescription)} />{err("shortDescription")}</Field>
              <Field label="Full description"><textarea className="adm-textarea" rows={4} value={draft.description} onChange={(event) => set("description", event.target.value)} /></Field>
              <Field label="Customer highlights" hint="One per line · up to 8">
                <textarea className="adm-textarea" rows={3} value={draft.highlights} onChange={(event) => set("highlights", event.target.value)} />
              </Field>
            </div>
          </details>

          {err("form")}
        </div>
      )}

      {tab === "tech" && (
        <div className="ax-editor-page">
          <section className="ax-editor-block">
            <header><div><h3>Electronics tech specs</h3><p>Structured details power product filters and Builder compatibility.</p></div><span className="ax-editor-number">01</span></header>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Voltage" hint="Nominal pack / system voltage">
                <input className="adm-input" value={coreValue("voltage")} placeholder="e.g. 12V" onChange={(event) => setCoreValue("voltage", "Nominal voltage", event.target.value)} />
              </Field>
              <Field label="Capacity" hint="Keep the unit in the value">
                <input className="adm-input" value={coreValue("capacity")} placeholder="e.g. 3000mAh or 6Ah" onChange={(event) => setCoreValue("capacity", "Capacity", event.target.value)} />
              </Field>
              <Field label="Discharge current" hint="Continuous rating when known">
                <input className="adm-input" value={coreValue("discharge")} placeholder="e.g. 15A continuous" onChange={(event) => setCoreValue("discharge", "Continuous discharge current", event.target.value)} />
              </Field>
              <Field label="Warranty · months">
                <input className="adm-input adm-num" inputMode="numeric" value={draft.warrantyMonths} onChange={(event) => set("warrantyMonths", event.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(errors.warrantyMonths)} />{err("warrantyMonths")}
              </Field>
            </div>
          </section>

          <details className="ax-editor-accordion" open={isPack}>
            <summary><span><ChevronDown size={15} /> Additional structured specs</span><small>{extraSpecs.length} {extraSpecs.length === 1 ? "field" : "fields"}</small></summary>
            <div className="grid gap-2 pt-3">
              {isPack && <div className="ax-spec-tools"><span className="ax-caption">Pack Builder uses chemistry, configuration, charge voltage and BMS specs.</span><Button size="sm" onClick={() => setDraft((current) => {
                const have = new Set(current.specs.map((spec) => spec.label.trim().toLowerCase()));
                return { ...current, specs: [...current.specs, ...READY_PACK_SPECS.filter((spec) => !have.has(spec.label.toLowerCase())).map((spec) => ({ ...spec }))] };
              })}><BatteryCharging size={13} /> Add pack fields</Button></div>}
              {extraSpecs.map(({ spec, index }) => (
                <div key={index} className="ax-spec-row">
                  <input className="adm-input" placeholder="Spec name" value={spec.label} aria-label={`Specification ${index + 1} label`} onChange={(event) => set("specs", draft.specs.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} />
                  <input className="adm-input" placeholder="Value · unit" value={spec.value} aria-label={`${spec.label || `Specification ${index + 1}`} value`} onChange={(event) => set("specs", draft.specs.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry))} />
                  <button type="button" className="adm-icon-btn" aria-label={`Remove ${spec.label || "specification"}`} onClick={() => set("specs", draft.specs.filter((_, i) => i !== index))}><X size={14} /></button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setDraft((current) => ({ ...current, specs: [...current.specs, { label: "", value: "" }] }))}><Plus size={13} /> Add spec</Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, specs: [...current.specs, { label: "Bulk price · 10+", value: "" }] }))}><Plus size={13} /> Add bulk tier price</Button>
              </div>
              {err("specs")}
            </div>
          </details>

          {readiness && (
            <section className="adm-form-section adm-readiness" data-ok={readiness.verified} aria-live="polite">
              <h3 className="flex items-center gap-2">{readiness.verified ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} Pack Builder readiness</h3>
              <p className="adm-field-hint">{readiness.verified ? "The Builder can recommend this pack when voltage, chemistry and load match." : "This pack is hidden from automatic substitutions until the required specs are complete."}</p>
              <ul className="adm-readiness-checks">
                <li data-ok={readiness.shelf}>{readiness.shelf ? "Physical, in-stock, on-sale pack" : "Must be on sale, priced and in stock"}</li>
                <li data-ok={Boolean(readiness.spec.chemistry)}>Chemistry {readiness.spec.chemistry ? `· ${readiness.spec.chemistry}` : "· required"}</li>
                <li data-ok={Boolean(readiness.spec.series)}>Configuration {readiness.spec.series ? `· ${readiness.spec.series}S` : "· e.g. 4S2P"}</li>
                <li data-ok={Boolean(readiness.spec.capacityAh)}>Capacity {readiness.spec.capacityAh ? `· ${readiness.spec.capacityAh}Ah` : "· required"}</li>
                <li data-ok={Boolean(readiness.spec.continuousA)}>Discharge current {readiness.spec.continuousA ? `· ${readiness.spec.continuousA}A` : "· required"}</li>
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "compatibility" && (
        <div className="ax-editor-page">
          <section className="ax-editor-block">
            <header><div><h3>Battery Builder compatibility</h3><p>These tags help the Builder surface this product for matching cell, chemistry, voltage and use-case configurations.</p></div></header>
            <div className="ax-compat-tags" role="group" aria-label="Suggested compatibility tags">
              {COMPATIBILITY_PRESETS.map((tag) => {
                const selected = draft.compatibilityTags.some((entry) => entry.toLowerCase() === tag.toLowerCase());
                return <button key={tag} type="button" data-selected={selected} aria-pressed={selected} onClick={() => toggleTag(tag)}><span>{selected ? <Check size={13} /> : <Plus size={13} />}</span>{tag}</button>;
              })}
            </div>
            <div className="ax-inline-form mt-3">
              <input className="adm-input" value={tagInput} maxLength={40} placeholder="Custom compatibility tag" aria-label="Custom compatibility tag" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(tagInput); } }} />
              <Button size="sm" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}><Plus size={14} /> Add tag</Button>
            </div>
            <p className="ax-caption mt-2">Tags are internal matching hints. They stay out of customer-facing product highlights.</p>
          </section>

          <section className="ax-editor-block">
            <header><div><h3>Selected tags</h3><p>{draft.compatibilityTags.length}/16 · choose only combinations this product is verified to support.</p></div></header>
            {draft.compatibilityTags.length ? (
              <ul className="ax-product-tags">{draft.compatibilityTags.map((tag) => <li key={tag}><span>{tag}</span><button type="button" aria-label={`Remove ${tag}`} onClick={() => toggleTag(tag)}><X size={13} /></button></li>)}</ul>
            ) : <p className="ax-empty-inline">No compatibility tags yet. Untagged products will not be added to the Builder's tag-based suggestions.</p>}
          </section>
        </div>
      )}
    </Drawer>
  );
}
