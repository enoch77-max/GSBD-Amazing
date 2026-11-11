"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Headphones, Loader2, PackageSearch, Search, SlidersHorizontal, X } from "lucide-react";
import type { Product } from "@/db/schema";
import { ProductCard } from "@/components/product-card";
import { PRICE_RANGES, SORT_OPTIONS, type SortId } from "@/lib/catalog";
import { categoryLabel } from "@/lib/product-copy";
import { cn } from "@/lib/format";
import { STORE } from "@/lib/commerce";

type CategoryFacet = { slug: string; name: string; count: number };
type BrandFacet = { brand: string; count: number };
export type ShopQuery = { category?: string; brand: string[]; price: string[]; q?: string; sort: SortId; inStock: boolean };

export function ShopBrowser({ items, total, page, pageCount, categories, brands, query }: {
  items: Product[]; total: number; page: number; pageCount: number;
  categories: CategoryFacet[]; brands: BrandFacet[]; query: ShopQuery;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(query.q ?? "");
  const resultsRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { setSearchTerm(query.q ?? ""); }, [query.q]);
  useEffect(() => {
    if (!filtersOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    filterRef.current?.querySelector<HTMLButtonElement>("button[aria-label='Close filters']")?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setFiltersOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = original; window.removeEventListener("keydown", onKey); filterButton.current?.focus({ preventScroll: true }); };
  }, [filtersOpen]);

  const activeCount = (query.category ? 1 : 0) + query.brand.length + query.price.length + (query.q ? 1 : 0) + (query.inStock ? 1 : 0);
  function navigate(mutate: (next: URLSearchParams) => void, scroll = false) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    startTransition(() => router.push(next.size ? `${pathname}?${next.toString()}` : pathname, { scroll: false }));
    /* A new results page behaves like a new page: jump to the top of the
       results instantly (filters keep the shopper where they are). */
    if (scroll) resultsRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }
  function selectCategory(slug?: string) {
    navigate(next => {
      next.delete("page"); next.delete("brand");
      if (slug) next.set("category", slug); else next.delete("category");
    });
    setFiltersOpen(false);
  }
  function toggle(key: "brand" | "price", value: string) {
    navigate(next => {
      next.delete("page");
      const values = next.getAll(key);
      next.delete(key);
      (values.includes(value) ? values.filter(entry => entry !== value) : [...values, value]).forEach(entry => next.append(key, entry));
    });
  }
  function clearAll() { setSearchTerm(""); startTransition(() => router.push(pathname, { scroll: false })); }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    navigate(next => { next.delete("page"); if (searchTerm.trim()) next.set("q", searchTerm.trim()); else next.delete("q"); });
    setFiltersOpen(false);
  }
  function setSort(sort: string) { navigate(next => { next.delete("page"); if (sort === "featured") next.delete("sort"); else next.set("sort", sort); }); }

  const filterBody = (
    <div className="space-y-5">
      <form onSubmit={submitSearch} className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search products" aria-label="Search catalogue" className="field min-h-11 py-2 pl-9 pr-9 text-sm" />
        <button type="submit" aria-label="Search catalogue now" className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink"><ArrowRight size={15} /></button>
      </form>
      <fieldset><legend className="mb-2 text-xs font-semibold text-ink">Category</legend><div className="space-y-0.5"><button type="button" onClick={() => selectCategory()} className={cn("flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-left text-[0.8rem]", !query.category ? "bg-ink text-cream" : "hover:bg-bone")}><span>All products</span><span className="text-[0.65rem] opacity-60">{categories.reduce((sum, item) => sum + item.count, 0)}</span></button>{categories.map(category => <button type="button" key={category.slug} onClick={() => selectCategory(category.slug)} aria-pressed={category.slug === query.category} className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[0.8rem]", category.slug === query.category ? "bg-ink text-cream" : "hover:bg-bone")}><span>{category.name}</span><span className="text-[0.65rem] opacity-60">{category.count}</span></button>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-xs font-semibold">Price</legend>{Object.entries(PRICE_RANGES).map(([key, range]) => <label key={key} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[0.8rem]"><input type="checkbox" checked={query.price.includes(key)} onChange={() => toggle("price", key)} className="size-4 shrink-0 accent-ink" />{range.label}</label>)}</fieldset>
      <fieldset><legend className="mb-2 text-xs font-semibold">Brand</legend><div className="max-h-64 overflow-y-auto pr-1">{brands.map(brand => <label key={brand.brand} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[0.8rem]"><input type="checkbox" checked={query.brand.includes(brand.brand)} onChange={() => toggle("brand", brand.brand)} className="size-4 shrink-0 accent-ink" /><span className="min-w-0 flex-1 leading-snug">{brand.brand}</span><span className="text-[0.65rem] text-muted">{brand.count}</span></label>)}</div></fieldset>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-white px-3 text-[0.8rem] font-medium"><input type="checkbox" checked={query.inStock} onChange={() => navigate(next => { next.delete("page"); if (query.inStock) next.delete("stock"); else next.set("stock", "1"); })} className="size-4 shrink-0 accent-ink" /> In stock only</label>
      {activeCount > 0 && <button type="button" onClick={clearAll} className="btn btn-outline btn-sm min-h-10 w-full">Reset filters</button>}
      <a href={`https://wa.me/${STORE.whatsapp}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-xl bg-volt/20 px-3 text-xs font-medium"><Headphones size={15} /> Need a part? Ask us <ArrowRight size={12} className="ml-auto" /></a>
    </div>
  );

  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (query.q) chips.push({ key: "q", label: `“${query.q}”`, remove: () => navigate(next => { next.delete("q"); next.delete("page"); }) });
  query.brand.forEach(brand => chips.push({ key:brand, label:brand, remove:() => toggle("brand",brand) }));
  query.price.forEach(price => chips.push({ key:price, label:PRICE_RANGES[price]?.short ?? price, remove:() => toggle("price",price) }));
  if (query.inStock) chips.push({key:"stock",label:"In stock",remove:() => navigate(next => {next.delete("stock");next.delete("page");})});

  return (
    <div ref={resultsRef} className="shell scroll-mt-3 pb-6 sm:pb-9">
      <nav aria-label="Product categories" className="scrollbar-none mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 sm:mb-4 sm:gap-2">
        <button type="button" onClick={() => selectCategory()} className={cn("category-chip chip min-h-9 shrink-0", !query.category && "chip-active")}>All</button>
        {categories.map(category => <button key={category.slug} data-tone={category.slug} type="button" onClick={() => selectCategory(category.slug)} aria-pressed={query.category === category.slug} className={cn("category-chip chip min-h-9 shrink-0", query.category === category.slug && "chip-active")}>{categoryLabel(category.slug, category.name)}</button>)}
      </nav>
      <div className="grid items-start gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-6">
        <aside className="sticky top-28 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border border-line bg-cream p-4 lg:block"><h2 className="mb-4 text-base">Filters</h2>{filterBody}</aside>
        <div className="min-w-0" aria-busy={pending}>
          <div className="mb-3 grid grid-cols-2 items-center gap-2 lg:flex lg:justify-between">
            <button ref={filterButton} type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen} className="btn btn-ghost btn-sm min-h-11 rounded-xl lg:hidden"><SlidersHorizontal size={15} /> Filters {activeCount > 0 && <span className="grid size-4 place-items-center rounded-full bg-ink text-[0.6rem] text-volt">{activeCount}</span>}</button>
            <p className="hidden text-xs text-muted lg:block">{total} {total === 1 ? "product" : "products"} {pending && <Loader2 size={12} className="ml-1 inline animate-spin" />}</p>
            <label className="relative block min-w-0 lg:w-48"><span className="sr-only">Sort products</span><select value={query.sort} onChange={event => setSort(event.target.value)} aria-label="Sort products" className="sort-select min-h-11 w-full min-w-0 appearance-none rounded-xl py-2 pl-3 pr-8 text-[0.8rem] font-medium outline-none">{SORT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" /></label>
          </div>
          {chips.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-1.5">{chips.map(chip => <button key={chip.key} type="button" onClick={chip.remove} className="filter-chip"><span className="min-w-0 break-words">{chip.label}</span><X size={12} className="shrink-0" /></button>)}<button type="button" onClick={clearAll} className="min-h-8 px-1 text-[0.7rem] font-semibold text-muted underline-offset-2 hover:underline">Clear</button></div>}
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-cream px-5 py-10 text-center"><PackageSearch size={28} className="mx-auto text-muted" /><h2 className="mt-3 text-lg">No matching products</h2><p className="mt-1 text-sm text-muted">Try another search or remove a filter.</p><button type="button" onClick={clearAll} className="btn btn-primary btn-sm mt-4 min-h-10">Reset filters</button></div>
          ) : (
            <div className={cn("grid grid-cols-2 gap-2.5 transition-opacity sm:grid-cols-3 sm:gap-4", pending && "pointer-events-none opacity-50")}>{items.map((product,index) => <ProductCard key={product.id} product={product} priority={index < 4} />)}</div>
          )}
          {pageCount > 1 && <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-center gap-1.5"><button type="button" disabled={page <= 1 || pending} onClick={() => navigate(next => { next.set("page",String(Math.max(1,page-1))); },true)} aria-label="Previous page" className="pagination-pill disabled:opacity-35"><ArrowLeft size={15} /></button>{Array.from({length:pageCount},(_,index) => index+1).map(value => <button key={value} type="button" disabled={pending} aria-current={value === page ? "page" : undefined} onClick={() => navigate(next => { if (value===1) next.delete("page"); else next.set("page",String(value)); },true)} className={cn("pagination-pill text-xs font-semibold", value===page && "is-current")}>{value}</button>)}<button type="button" disabled={page>=pageCount || pending} onClick={() => navigate(next => {next.set("page",String(Math.min(pageCount,page+1)));},true)} aria-label="Next page" className="pagination-pill disabled:opacity-35"><ArrowRight size={15} /></button></nav>}
        </div>
      </div>

      {filtersOpen && <div className="fixed inset-0 z-[75] lg:hidden" role="dialog" aria-modal="true" aria-label="Filters"><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filter backdrop" className="absolute inset-0 bg-ink/50 backdrop-blur-sm" /><div ref={filterRef} className="animate-slide-in-left absolute inset-y-0 left-0 flex h-dvh w-[min(90%,23rem)] flex-col bg-bone"><div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3"><h2 className="text-lg">Filters</h2><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" className="grid size-10 place-items-center rounded-full border border-line"><X size={18} /></button></div><div className="min-h-0 flex-1 overflow-y-auto p-4">{filterBody}</div><div className="shrink-0 border-t border-line bg-cream p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><button type="button" disabled={pending} onClick={() => setFiltersOpen(false)} className="btn btn-primary min-h-11 w-full">{pending ? <><Loader2 size={15} className="animate-spin" /> Updating…</> : <>Show {total} {total === 1 ? "product" : "products"} <ArrowRight size={14} /></>}</button></div></div></div>}
    </div>
  );
}
