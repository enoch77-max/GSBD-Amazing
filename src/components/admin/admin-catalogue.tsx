"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDown, ArrowUp, BatteryCharging, CheckCircle2, Copy, ExternalLink, Eye, EyeOff,
  Download, ImagePlus, PackagePlus, Pencil, Plus, RotateCcw, Search, Star, Trash2, X,
} from "lucide-react";
import { store, type ManagedProduct, type ProductInput } from "@/db/local-store";
import type { Product } from "@/db/schema";
import { useStoreVersion } from "@/lib/use-store";
import { formatBDT } from "@/lib/format";
import { isStockedReadyPack, readReadyPackSpecs } from "@/lib/ready-pack-specs";
import { audit, can, download, toCsv } from "@/lib/ops";
import { Badge, Button, Drawer, Empty, Field, PageHead, Panel, ReadOnlyNote } from "./admin-ui";

type Spec = { label: string; value: string };
type Draft = {
  slug: string; name: string; sku: string; brand: string; categorySlug: string;
  price: string; compareAtPrice: string; stock: string; warrantyMonths: string; badge: string;
  featured: boolean; visible: boolean;
  shortDescription: string; description: string; highlights: string;
  specs: Spec[]; images: string[];
};

type StatusFilter = "all" | "live" | "hidden" | "out" | "packs";

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
      highlights: product.highlights.join("\n"), specs: product.specs.map((spec) => ({ ...spec })), images: [...product.images],
    };
  }
  const pack = preset === "pack";
  return {
    slug: "", name: "", sku: "", brand: pack ? "Glowing Space Lab" : "", categorySlug: pack ? "battery-packs" : store.tables.categories[0]?.slug ?? "",
    price: "", compareAtPrice: "", stock: "0", warrantyMonths: pack ? "12" : "3", badge: pack ? "Ready to ship" : "",
    featured: false, visible: !pack,
    shortDescription: "", description: "", highlights: "",
    specs: pack ? READY_PACK_SPECS.map((spec) => ({ ...spec })) : [], images: [],
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
      highlights: draft.highlights.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 8),
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

export function AdminCatalogue({ toast }: { toast: (message: string) => void }) {
  useStoreVersion();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<{ product: ManagedProduct | null; preset?: "pack"; copyOf?: ManagedProduct } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
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
          <div className="adm-table-wrap">
            <table className="adm-table adm-catalogue-table">
              <thead><tr><th className="w-8"><input type="checkbox" className="adm-checkbox" aria-label="Select all shown products" checked={allShownPicked} onChange={() => setPicked(allShownPicked ? picked.filter((slug) => !rows.some((r) => r.slug === slug)) : [...new Set([...picked, ...rows.map((r) => r.slug)])])} /></th><th>Product</th><th>Category</th><th className="text-right">Price</th><th className="text-center">Stock</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {rows.map((product) => (
                  <tr key={product.slug} data-hidden={!product.visible} data-selected={picked.includes(product.slug)}>
                    <td><input type="checkbox" className="adm-checkbox" aria-label={`Select ${product.name}`} checked={picked.includes(product.slug)} onChange={() => togglePick(product.slug)} /></td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="adm-thumb">{product.images[0] ? <img src={resolveImage(product.images[0])} alt="" loading="lazy" /> : <PackagePlus size={14} />}</span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{product.name}</p>
                          <p className="adm-num text-[0.67rem] text-[#6e6e73]">{product.sku} · {product.brand}{product.custom ? " · added here" : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td data-label="Category" className="text-[0.75rem] text-[#3a3a3c]">{categoryName(product.categorySlug)}</td>
                    <td data-label="Price" className="adm-num text-right">{formatBDT(product.price)}</td>
                    <td data-label="Stock" className="adm-num text-center">{product.stock}</td>
                    <td data-label="Status">
                      <div className="flex flex-wrap gap-1">
                        {product.visible ? <Badge tone="emerald">On sale</Badge> : <Badge tone="neutral">Hidden</Badge>}
                        {product.stock === 0 && <Badge tone="rose">Out of stock</Badge>}
                        {product.featured && <Badge tone="sky">Bestseller</Badge>}
                        <ReadinessBadge product={product} />
                      </div>
                    </td>
                    <td className="adm-catalogue-actions">
                      {confirmDelete === product.slug ? (
                        <div className="flex items-center justify-end gap-1.5" role="group" aria-label={`Confirm deleting ${product.name}`}>
                          <span className="text-[0.7rem] text-[#b42318]">Delete permanently?</span>
                          <Button size="sm" variant="danger" onClick={() => { store.deleteProduct(product.slug); audit("Deleted product", product.name); setConfirmDelete(null); setPicked((cur) => cur.filter((s) => s !== product.slug)); report(product.custom ? "Product deleted" : "Product deleted — restore it below at any time"); }}>Delete</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" className="adm-icon-btn" title="Edit" disabled={!canEdit} aria-label={`Edit ${product.name}`} onClick={() => setEditing({ product })}><Pencil size={13} /></button>
                          <button type="button" className="adm-icon-btn" title={product.visible ? "Hide from storefront" : "Put on sale"} aria-label={`${product.visible ? "Hide" : "Show"} ${product.name}`} aria-pressed={!product.visible} disabled={!canEdit}
                            onClick={() => { store.setProductVisible(product.slug, !product.visible); audit(product.visible ? "Hid product" : "Put product on sale", product.name); report(product.visible ? "Hidden from the storefront and Pack Builder" : "Product is on sale"); }}>
                            {product.visible ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button type="button" className="adm-icon-btn" title="Duplicate" disabled={!canEdit} aria-label={`Duplicate ${product.name}`} onClick={() => setEditing({ product: null, copyOf: product })}><Copy size={13} /></button>
                          {product.visible && <Link className="adm-icon-btn" title="View on storefront" aria-label={`View ${product.name} on storefront`} href={`/product/${product.slug}`}><ExternalLink size={13} /></Link>}
                          <button type="button" className="adm-icon-btn" title="Delete" disabled={!canDelete} aria-label={`Delete ${product.name}`} onClick={() => setConfirmDelete(product.slug)}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(message) => { setEditing(null); report(message); }}
        />
      )}
    </>
  );
}

function ProductEditor({ product, preset, copyOf, categories, onClose, onSaved }: {
  product: ManagedProduct | null;
  preset?: "pack";
  copyOf?: ManagedProduct;
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

  return (
    <Drawer
      open wide onClose={close}
      title={product ? product.name : preset === "pack" ? "New ready-made pack" : copyOf ? "Duplicate product" : "New product"}
      subtitle={product ? `/product/${product.slug}` : "Saved in this browser until the production backend is connected"}
      footer={confirmDiscard ? (
        <div className="flex w-full flex-wrap items-center gap-2" role="alert">
          <span className="text-[0.78rem] text-[#92400e]">Discard unsaved changes?</span>
          <Button variant="danger" onClick={onClose}>Discard</Button>
          <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
        </div>
      ) : (
        <>
          <Button variant="primary" onClick={save}>{product ? "Save changes" : "Create product"}</Button>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          {Object.values(errors).some(Boolean) && <span className="text-[0.74rem] text-[#b42318]"><AlertTriangle size={12} className="mr-1 inline" />Fix the highlighted fields.</span>}
        </>
      )}
    >
      <section className="adm-form-section">
        <h3>Basics</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Product name">
            <input className="adm-input" value={draft.name} onChange={(event) => set("name", event.target.value)} aria-invalid={Boolean(errors.name)} />{err("name")}
          </Field>
          <Field label="URL slug" hint={product ? "Fixed after creation so links and orders keep working" : "Created from the name; lowercase and dashes"}>
            <input className="adm-input adm-mono" value={draft.slug} disabled={Boolean(product)} onChange={(event) => { setSlugTouched(true); set("slug", slugify(event.target.value)); }} aria-invalid={Boolean(errors.slug)} />{err("slug")}
          </Field>
          <Field label="SKU"><input className="adm-input adm-mono" value={draft.sku} onChange={(event) => set("sku", event.target.value.toUpperCase())} aria-invalid={Boolean(errors.sku)} />{err("sku")}</Field>
          <Field label="Brand"><input className="adm-input" value={draft.brand} onChange={(event) => set("brand", event.target.value)} aria-invalid={Boolean(errors.brand)} />{err("brand")}</Field>
          <Field label="Category">
            <select className="adm-select" value={draft.categorySlug} onChange={(event) => set("categorySlug", event.target.value)}>
              {categories.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
            </select>{err("categorySlug")}
          </Field>
          <Field label="Badge (optional)" hint="e.g. Bestseller, New, Ready to ship"><input className="adm-input" value={draft.badge} maxLength={28} onChange={(event) => set("badge", event.target.value)} /></Field>
        </div>
      </section>

      <section className="adm-form-section">
        <h3>Price & stock</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Selling price ৳"><input className="adm-input adm-num" inputMode="numeric" disabled={!can("pricing.edit") && Boolean(product)} value={draft.price} onChange={(event) => set("price", event.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(errors.price)} />{err("price")}</Field>
          <Field label="Original price ৳" hint="Optional strike-through"><input className="adm-input adm-num" inputMode="numeric" disabled={!can("pricing.edit") && Boolean(product)} value={draft.compareAtPrice} onChange={(event) => set("compareAtPrice", event.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(errors.compareAtPrice)} />{err("compareAtPrice")}</Field>
          <Field label={isPack ? "Complete packs in stock" : "Units in stock"}><input className="adm-input adm-num" inputMode="numeric" disabled={!can("stock.edit") && Boolean(product)} value={draft.stock} onChange={(event) => set("stock", event.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(errors.stock)} />{err("stock")}</Field>
          <Field label="Warranty (months)"><input className="adm-input adm-num" inputMode="numeric" value={draft.warrantyMonths} onChange={(event) => set("warrantyMonths", event.target.value.replace(/[^\d]/g, ""))} aria-invalid={Boolean(errors.warrantyMonths)} />{err("warrantyMonths")}</Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-[0.8rem]"><input type="checkbox" className="adm-checkbox" checked={draft.visible} onChange={(event) => set("visible", event.target.checked)} /> On sale (visible to customers)</label>
          <label className="inline-flex items-center gap-2 text-[0.8rem]"><input type="checkbox" className="adm-checkbox" checked={draft.featured} onChange={(event) => set("featured", event.target.checked)} /> Show in Bestsellers</label>
        </div>
      </section>

      <section className="adm-form-section">
        <h3>Description</h3>
        <Field label="One-line summary" hint="Shown on cards and in search"><input className="adm-input" value={draft.shortDescription} maxLength={180} onChange={(event) => set("shortDescription", event.target.value)} aria-invalid={Boolean(errors.shortDescription)} />{err("shortDescription")}</Field>
        <Field label="Full description"><textarea className="adm-textarea" rows={4} value={draft.description} onChange={(event) => set("description", event.target.value)} /></Field>
        <Field label="Highlights" hint="One per line, up to 8"><textarea className="adm-textarea" rows={3} value={draft.highlights} onChange={(event) => set("highlights", event.target.value)} /></Field>
      </section>

      <section className="adm-form-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3>Specifications</h3>
          <div className="flex gap-1.5">
            {isPack && <Button size="sm" variant="ghost" onClick={() => setDraft((current) => {
              const have = new Set(current.specs.map((spec) => spec.label.trim().toLowerCase()));
              return { ...current, specs: [...current.specs, ...READY_PACK_SPECS.filter((spec) => !have.has(spec.label.toLowerCase())).map((spec) => ({ ...spec }))] };
            })}><BatteryCharging size={12} /> Add pack fields</Button>}
            <Button size="sm" onClick={() => setDraft((current) => ({ ...current, specs: [...current.specs, { label: "", value: "" }] }))}><Plus size={12} /> Add row</Button>
          </div>
        </div>
        {draft.specs.length === 0 ? <p className="adm-field-hint">No specifications yet.</p> : (
          <ul className="flex flex-col gap-1.5">
            {draft.specs.map((spec, index) => (
              <li key={index} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_auto] gap-1.5">
                <input className="adm-input" placeholder="Label" value={spec.label} aria-label={`Specification ${index + 1} label`} onChange={(event) => set("specs", draft.specs.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} />
                <input className="adm-input" placeholder="Value" value={spec.value} aria-label={`${spec.label || `Specification ${index + 1}`} value`} onChange={(event) => set("specs", draft.specs.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry))} />
                <button type="button" className="adm-icon-btn" aria-label={`Remove ${spec.label || "specification"}`} onClick={() => set("specs", draft.specs.filter((_, i) => i !== index))}><X size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        {err("specs")}
      </section>

      {readiness && (
        <section className="adm-form-section adm-readiness" data-ok={readiness.verified} aria-live="polite">
          <h3 className="flex items-center gap-2">{readiness.verified ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} Pack Builder readiness</h3>
          <p className="adm-field-hint">
            {readiness.verified
              ? "The Pack Builder can recommend this pack when a custom build is unavailable and the voltage, chemistry and load match."
              : "This pack will not be suggested as an automatic substitute until the items below are resolved."}
          </p>
          <ul className="adm-readiness-checks">
            <li data-ok={readiness.shelf}>{readiness.shelf ? "Physical, in-stock, on-sale pack" : "Must be on sale, priced, in stock, and not marked built-to-order / pre-order"}</li>
            <li data-ok={Boolean(readiness.spec.chemistry)}>Chemistry {readiness.spec.chemistry ? `· ${readiness.spec.chemistry === "lifepo4" ? "LiFePO4" : "Li-ion"}` : "· required"}</li>
            <li data-ok={Boolean(readiness.spec.series)}>Configuration {readiness.spec.series ? `· ${readiness.spec.series}S${readiness.spec.parallel ? `${readiness.spec.parallel}P` : ""}` : "· e.g. 4S2P"}</li>
            <li data-ok={Boolean(readiness.spec.capacityAh)}>Capacity {readiness.spec.capacityAh ? `· ${readiness.spec.capacityAh}Ah` : "· e.g. 6Ah"}</li>
            <li data-ok={Boolean(readiness.spec.continuousA)}>Continuous discharge current {readiness.spec.continuousA ? `· ${readiness.spec.continuousA}A` : "· e.g. 20A"}</li>
          </ul>
          {readiness.spec.issues.length > 0 && <ul className="adm-issue-list">{readiness.spec.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
        </section>
      )}

      <section className="adm-form-section">
        <h3>Images</h3>
        <p className="adm-field-hint">The first image is the main photo. Uploads are resized to 1000px and stored in this browser.</p>
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
        <div className="mt-2 flex flex-wrap gap-1.5">
          <input className="adm-input min-w-[200px] flex-1" placeholder="https://… or /images/…" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} aria-label="Add image URL" />
          <Button size="sm" disabled={!imageUrl.trim()} onClick={() => { set("images", [...draft.images, imageUrl.trim()]); setImageUrl(""); }}>Add URL</Button>
          <Button size="sm" variant="primary" disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus size={13} /> {uploading ? "Processing…" : "Upload"}</Button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload product image"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
        </div>
        {uploadError && <span className="adm-field-error" role="alert">{uploadError}</span>}
        {err("images")}
      </section>
    </Drawer>
  );
}
