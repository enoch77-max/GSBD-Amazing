"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, Eye, EyeOff, ImagePlus, Plus, Search, Star, Tags, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/lib/live";
import { formatBDT } from "@/lib/format";
import { Badge, Button, Drawer, Empty, Field, Panel } from "@/components/admin/admin-ui";

type Product = {
  id: number; slug: string; name: string; brand: string; categorySlug: string;
  shortDescription: string; description: string; price: number; compareAtPrice: number | null;
  stock: number; rating: number; reviewCount: number; badge: string | null;
  highlights: string[]; specs: Array<{ label: string; value: string }>; images: string[];
  featured: boolean; visible: boolean; warrantyMonths: number; sku: string;
};

type Category = {
  slug: string; name: string; tagline: string; description: string; image: string; icon: string; sortOrder: number; productCount?: number;
};

type Review = {
  id: number; productSlug: string; productName?: string; author: string; location: string;
  rating: number; title: string; body: string; visible: boolean; createdAt: string;
};

const SUBTABS = [
  { id: "products", label: "Products", icon: Boxes },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "reviews", label: "Reviews", icon: Star },
] as const;

export function OwnerProducts({ toast }: { toast: (message: string) => void }) {
  const [tab, setTab] = useState<(typeof SUBTABS)[number]["id"]>("products");
  return (
    <>
      <div>
        <h1 className="font-display text-[1.5rem] font-bold leading-tight">Catalogue</h1>
        <p className="text-[0.78rem] text-[#8aa697]">Products, categories and reviews — changes go live on the storefront immediately.</p>
      </div>
      <div className="adm-scroll flex gap-1.5 overflow-x-auto pb-1">
        {SUBTABS.map((entry) => (
          <button key={entry.id} type="button" className="adm-chip inline-flex items-center gap-1.5" data-active={tab === entry.id} onClick={() => setTab(entry.id)}>
            <entry.icon size={12} /> {entry.label}
          </button>
        ))}
      </div>
      {tab === "products" && <ProductList toast={toast} />}
      {tab === "categories" && <CategoryList toast={toast} />}
      {tab === "reviews" && <ReviewList toast={toast} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function ProductList({ toast }: { toast: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ q: query, limit: "100" });
    if (category !== "all") params.set("category", category);
    if (lowOnly) params.set("low", "1");
    const payload = await api<{ products: Product[]; total: number }>(`/api/admin/products?${params.toString()}`);
    setRows(payload.products);
    setTotal(payload.total);
  }, [query, category, lowOnly]);

  const loadCategories = useCallback(async () => {
    const payload = await api<{ categories: Category[] }>("/api/admin/categories");
    setCategories(payload.categories);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch(() => {}), query ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    void loadCategories().catch(() => {});
  }, [loadCategories]);

  const fail = (error: unknown) => toast(error instanceof ApiError ? error.message : "That did not work. Try again.");

  const quickPatch = async (slug: string, patch: Record<string, unknown>, message: string) => {
    try {
      await api(`/api/admin/products/${encodeURIComponent(slug)}`, { method: "PATCH", body: patch });
      toast(message);
      await load();
    } catch (error) {
      fail(error);
    }
  };

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5d7a6a]" />
            <input className="adm-input pl-8" placeholder="Search product, SKU or brand…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products" />
          </div>
          <select className="adm-select w-auto" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
          </select>
          <button type="button" className="adm-chip" data-active={lowOnly} onClick={() => setLowOnly((value) => !value)}>Low stock only</button>
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus size={13} /> New product</Button>
        </div>
      </Panel>

      <Panel>
        <p className="mb-2 text-[0.72rem] text-[#8aa697]">{total} product{total === 1 ? "" : "s"} · price and stock edit inline</p>
        {rows.length === 0 ? (
          <Empty icon={<Boxes size={22} />} title="No products match" />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Product</th><th className="text-right">Price ৳</th><th className="text-center">Stock</th><th className="text-center">Live</th><th className="text-center">Star</th><th /></tr></thead>
              <tbody>
                {rows.map((product) => (
                  <Row
                    key={product.slug}
                    product={product}
                    onPatch={(patch, message) => void quickPatch(product.slug, patch, message)}
                    onEdit={() => setEditing(product)}
                    onDelete={async () => {
                      try {
                        await api(`/api/admin/products/${encodeURIComponent(product.slug)}`, { method: "DELETE" });
                        toast("Product deleted");
                        await load();
                      } catch (error) {
                        fail(error);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && (
        <ProductDrawer
          initial={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          toast={toast}
        />
      )}
    </>
  );
}

function Row({ product, onPatch, onEdit, onDelete }: {
  product: Product;
  onPatch: (patch: Record<string, unknown>, message: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock));
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setPrice(String(product.price));
    setStock(String(product.stock));
  }, [product.price, product.stock, product.slug]);

  return (
    <tr>
      <td>
        <p className="font-medium">{product.name} {!product.visible && <Badge tone="rose" className="ml-1">hidden</Badge>}</p>
        <p className="adm-num text-[0.67rem] text-[#8aa697]">{product.sku} · {product.brand} · ★ {Number(product.rating).toFixed(1)} ({product.reviewCount})</p>
      </td>
      <td className="text-right">
        <input
          className="adm-input adm-num w-24 text-right" data-size="sm" inputMode="numeric"
          value={price} onChange={(event) => setPrice(event.target.value)}
          onBlur={() => { if (price !== String(product.price) && Number(price) >= 0) onPatch({ price: Math.round(Number(price)) }, "Price updated"); else setPrice(String(product.price)); }}
          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
          aria-label={`Price for ${product.name}`}
        />
      </td>
      <td>
        <div className="flex items-center justify-center gap-1">
          <input
            className="adm-input adm-num w-16 text-center" data-size="sm" inputMode="numeric"
            value={stock} onChange={(event) => setStock(event.target.value)}
            onBlur={() => { if (stock !== String(product.stock) && Number(stock) >= 0) onPatch({ stock: Math.round(Number(stock)) }, "Stock updated"); else setStock(String(product.stock)); }}
            onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
            aria-label={`Stock for ${product.name}`}
          />
          {product.stock === 0 ? <Badge tone="rose">Out</Badge> : null}
        </div>
      </td>
      <td className="text-center">
        <button type="button" className="adm-icon-btn mx-auto size-7" aria-label={`${product.visible ? "Hide" : "Show"} ${product.name}`} aria-pressed={product.visible}
          onClick={() => onPatch({ visible: !product.visible }, product.visible ? "Hidden from the storefront" : "Visible on the storefront")}>
          {product.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </td>
      <td className="text-center">
        <button type="button" className="adm-icon-btn mx-auto size-7" aria-label={`${product.featured ? "Unfeature" : "Feature"} ${product.name}`} aria-pressed={product.featured}
          onClick={() => onPatch({ featured: !product.featured }, product.featured ? "Removed from bestsellers" : "Added to bestsellers")}
          style={product.featured ? { color: "#c9f16b", borderColor: "#4a7a2a", background: "#223d16" } : undefined}>
          <Star size={12} fill={product.featured ? "currentColor" : "none"} />
        </button>
      </td>
      <td className="text-right">
        <div className="inline-flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
          {confirming ? (
            <Button size="sm" variant="danger" onClick={onDelete}>Sure?</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${product.name}`}><Trash2 size={12} /></Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ProductDrawer({ initial, categories, onClose, onSaved, toast }: {
  initial: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({
    slug: initial?.slug ?? "",
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    brand: initial?.brand ?? "",
    categorySlug: initial?.categorySlug ?? categories[0]?.slug ?? "",
    price: String(initial?.price ?? ""),
    compareAtPrice: initial?.compareAtPrice == null ? "" : String(initial.compareAtPrice),
    stock: String(initial?.stock ?? 0),
    badge: initial?.badge ?? "",
    warrantyMonths: String(initial?.warrantyMonths ?? 3),
    featured: initial?.featured ?? false,
    visible: initial?.visible ?? true,
    shortDescription: initial?.shortDescription ?? "",
    description: initial?.description ?? "",
    highlights: (initial?.highlights ?? []).join("\n"),
    specs: (initial?.specs ?? []).map((spec) => `${spec.label}: ${spec.value}`).join("\n"),
    images: [...(initial?.images ?? [])],
  });
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof form, value: string | boolean | string[]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.slug.trim() || !form.name.trim() || !form.sku.trim() || !form.categorySlug) {
      toast("Slug, name, SKU and category are required.");
      return;
    }
    if (!/^[a-z0-9-]{2,120}$/.test(form.slug.trim().toLowerCase())) {
      toast("Slug must be lowercase letters, numbers and dashes.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        sku: form.sku.trim(),
        brand: form.brand.trim(),
        categorySlug: form.categorySlug,
        price: Math.max(0, Math.round(Number(form.price) || 0)),
        compareAtPrice: form.compareAtPrice === "" ? null : Math.max(0, Math.round(Number(form.compareAtPrice) || 0)),
        stock: Math.max(0, Math.round(Number(form.stock) || 0)),
        badge: form.badge.trim() || null,
        warrantyMonths: Math.max(0, Math.round(Number(form.warrantyMonths) || 0)),
        featured: form.featured,
        visible: form.visible,
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim(),
        highlights: form.highlights.split("\n").map((line) => line.trim()).filter(Boolean),
        specs: form.specs.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
          const split = line.indexOf(":");
          return split > 0 ? { label: line.slice(0, split).trim(), value: line.slice(split + 1).trim() } : { label: line, value: "" };
        }),
        images: form.images,
      };
      if (initial) {
        const { slug: _slug, ...patch } = payload;
        await api(`/api/admin/products/${encodeURIComponent(initial.slug)}`, { method: "PATCH", body: patch });
        toast("Product saved");
      } else {
        await api("/api/admin/products", { method: "POST", body: payload });
        toast("Product created");
      }
      onSaved();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Could not save the product.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });
      const result = await api<{ url: string }>("/api/admin/uploads", { method: "POST", body: { filename: file.name, data } });
      setForm((current) => ({ ...current, images: [...current.images, result.url] }));
      toast("Image uploaded");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Upload failed.");
    }
  };

  return (
    <Drawer
      open wide onClose={onClose}
      title={initial ? initial.name : "New product"}
      subtitle={initial ? `/${initial.slug} · changes go live immediately` : "Fill in the essentials — you can refine everything later"}
      footer={
        <>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : initial ? "Save changes" : "Create product"}</Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className="adm-input" value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
        <Field label="Slug" hint="Lowercase, dashes, never changes after creation"><input className="adm-input adm-mono" value={form.slug} disabled={Boolean(initial)} onChange={(event) => set("slug", event.target.value)} /></Field>
        <Field label="SKU"><input className="adm-input adm-mono" value={form.sku} onChange={(event) => set("sku", event.target.value)} /></Field>
        <Field label="Brand"><input className="adm-input" value={form.brand} onChange={(event) => set("brand", event.target.value)} /></Field>
        <Field label="Category">
          <select className="adm-select" value={form.categorySlug} onChange={(event) => set("categorySlug", event.target.value)}>
            {categories.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.name}</option>)}
          </select>
        </Field>
        <Field label="Badge (optional)" hint="e.g. Bestseller, New"><input className="adm-input" value={form.badge} onChange={(event) => set("badge", event.target.value)} /></Field>
        <Field label="Price ৳"><input className="adm-input adm-num" inputMode="numeric" value={form.price} onChange={(event) => set("price", event.target.value)} /></Field>
        <Field label="Compare-at ৳ (optional)"><input className="adm-input adm-num" inputMode="numeric" value={form.compareAtPrice} onChange={(event) => set("compareAtPrice", event.target.value)} /></Field>
        <Field label="Stock"><input className="adm-input adm-num" inputMode="numeric" value={form.stock} onChange={(event) => set("stock", event.target.value)} /></Field>
        <Field label="Warranty (months)"><input className="adm-input adm-num" inputMode="numeric" value={form.warrantyMonths} onChange={(event) => set("warrantyMonths", event.target.value)} /></Field>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-[0.8rem]"><input type="checkbox" className="adm-checkbox" checked={form.featured} onChange={(event) => set("featured", event.target.checked)} /> Bestseller</label>
        <label className="inline-flex items-center gap-2 text-[0.8rem]"><input type="checkbox" className="adm-checkbox" checked={form.visible} onChange={(event) => set("visible", event.target.checked)} /> Visible on storefront</label>
      </div>

      <Field label="Short description"><input className="adm-input" value={form.shortDescription} onChange={(event) => set("shortDescription", event.target.value)} /></Field>
      <Field label="Full description"><textarea className="adm-textarea" value={form.description} onChange={(event) => set("description", event.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Highlights" hint="One per line"><textarea className="adm-textarea" value={form.highlights} onChange={(event) => set("highlights", event.target.value)} /></Field>
        <Field label="Specs" hint="One per line — Label: value"><textarea className="adm-textarea" value={form.specs} onChange={(event) => set("specs", event.target.value)} /></Field>
      </div>

      <div>
        <span className="adm-field-label">Images</span>
        <ul className="mt-2 flex flex-col gap-1.5">
          {form.images.map((url, index) => (
            <li key={`${url}-${index}`} className="flex items-center gap-2">
              <input className="adm-input adm-mono" value={url} onChange={(event) => set("images", form.images.map((entry, i) => (i === index ? event.target.value : entry)))} aria-label={`Image ${index + 1}`} />
              <button type="button" className="adm-icon-btn shrink-0" aria-label="Remove image" onClick={() => set("images", form.images.filter((_, i) => i !== index))}><X size={13} /></button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <input className="adm-input min-w-[200px] flex-1" placeholder="Paste an image URL…" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} aria-label="Add image URL" />
          <Button size="sm" disabled={!imageUrl.trim()} onClick={() => { set("images", [...form.images, imageUrl.trim()]); setImageUrl(""); }}>Add URL</Button>
          <Button size="sm" variant="primary" onClick={() => fileRef.current?.click()}><ImagePlus size={13} /> Upload</Button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload product image"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); event.target.value = ""; }} />
        </div>
        <p className="adm-field-hint mt-1.5">JPG, PNG or WebP up to 4 MB. Uploaded files are scanned by type, not by name.</p>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function CategoryList({ toast }: { toast: (message: string) => void }) {
  const [rows, setRows] = useState<Category[]>([]);
  const [form, setForm] = useState({ slug: "", name: "", tagline: "", image: "", sortOrder: "99" });
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const payload = await api<{ categories: Category[] }>("/api/admin/categories");
    setRows(payload.categories);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const fail = (error: unknown) => toast(error instanceof ApiError ? error.message : "That did not work. Try again.");

  const save = async () => {
    if (!form.slug.trim() || !form.name.trim()) {
      toast("Slug and name are required.");
      return;
    }
    try {
      if (editing) {
        await api(`/api/admin/categories/${encodeURIComponent(editing)}`, {
          method: "PATCH",
          body: { name: form.name, tagline: form.tagline, image: form.image, sortOrder: Number(form.sortOrder) || 99 },
        });
        toast("Category saved");
      } else {
        await api("/api/admin/categories", {
          method: "POST",
          body: { slug: form.slug.trim().toLowerCase(), name: form.name, tagline: form.tagline, image: form.image, sortOrder: Number(form.sortOrder) || 99 },
        });
        toast("Category created");
      }
      setForm({ slug: "", name: "", tagline: "", image: "", sortOrder: "99" });
      setEditing(null);
      await load();
    } catch (error) {
      fail(error);
    }
  };

  const remove = async (slug: string) => {
    try {
      await api(`/api/admin/categories/${encodeURIComponent(slug)}`, { method: "DELETE" });
      toast("Category deleted");
      await load();
    } catch (error) {
      fail(error);
    }
  };

  return (
    <div className="adm-grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title={editing ? "Edit category" : "New category"} subtitle={editing ? "Slug cannot change — it is referenced by products" : undefined}>
        <div className="grid gap-2.5">
          <Field label="Slug"><input className="adm-input adm-mono" value={form.slug} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></Field>
          <Field label="Name"><input className="adm-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Tagline"><input className="adm-input" value={form.tagline} onChange={(event) => setForm({ ...form, tagline: event.target.value })} /></Field>
          <Field label="Image URL"><input className="adm-input" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /></Field>
          <Field label="Sort order"><input className="adm-input adm-num" inputMode="numeric" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></Field>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void save()}>{editing ? "Save" : "Create"}</Button>
            {editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm({ slug: "", name: "", tagline: "", image: "", sortOrder: "99" }); }}>Cancel</Button>}
          </div>
        </div>
      </Panel>

      <Panel title="Categories" subtitle={`${rows.length} total`}>
        <ul className="flex flex-col gap-2">
          {rows.map((entry) => (
            <li key={entry.slug} className="flex items-center gap-3 rounded-xl border border-[#1d3529] bg-[#0b1712] p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.82rem] font-medium">{entry.name}</p>
                <p className="adm-num text-[0.66rem] text-[#8aa697]">/{entry.slug} · {entry.productCount ?? 0} products</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => {
                setEditing(entry.slug);
                setForm({ slug: entry.slug, name: entry.name, tagline: entry.tagline, image: entry.image, sortOrder: String(entry.sortOrder) });
              }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => void remove(entry.slug)} aria-label={`Delete ${entry.name}`}><Trash2 size={12} /></Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReviewList({ toast }: { toast: (message: string) => void }) {
  const [rows, setRows] = useState<Review[]>([]);
  const [visible, setVisible] = useState("all");

  const load = useCallback(async () => {
    const params = visible === "all" ? "" : `?visible=${visible}`;
    const payload = await api<{ reviews: Review[] }>(`/api/admin/reviews${params}`);
    setRows(payload.reviews);
  }, [visible]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const act = async (id: number, request: Promise<unknown>, message: string) => {
    try {
      await request;
      toast(message);
      await load();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "That did not work. Try again.");
    }
  };

  return (
    <Panel
      title="Customer reviews"
      subtitle="Hide spam or abuse — hiding recalculates the product rating"
      action={
        <div className="flex gap-1.5">
          {(["all", "true", "false"] as const).map((option) => (
            <button key={option} type="button" className="adm-chip" data-active={visible === option} onClick={() => setVisible(option)}>
              {option === "all" ? "All" : option === "true" ? "Visible" : "Hidden"}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty icon={<Star size={22} />} title="No reviews here" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((review) => (
            <li key={review.id} className="rounded-xl border border-[#1d3529] bg-[#0b1712] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.8rem] font-semibold">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                <span className="text-[0.8rem] font-medium">{review.title}</span>
                {!review.visible && <Badge tone="rose">hidden</Badge>}
                <span className="ml-auto text-[0.68rem] text-[#8aa697]">{review.author} · {review.productName ?? review.productSlug}</span>
              </div>
              <p className="mt-1.5 text-[0.76rem] leading-relaxed text-[#b9cdbe]">{review.body}</p>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => void act(review.id, api(`/api/admin/reviews/${review.id}`, { method: "PATCH", body: { visible: !review.visible } }), review.visible ? "Review hidden" : "Review visible")}>
                  {review.visible ? "Hide" : "Show"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => void act(review.id, api(`/api/admin/reviews/${review.id}`, { method: "DELETE" }), "Review deleted")}>
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
