"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, FolderSearch, Loader2, Search, ShoppingBag, X } from "lucide-react";
import { formatBDT } from "@/lib/format";
import { readCategories, readProductBySlug } from "@/lib/queries";
import { useCart } from "@/lib/cart";
import { useStoreVersion } from "@/lib/use-store";

type Suggestion = {
  slug: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  stock: number;
  rating?: number;
  categorySlug?: string;
};

type ActiveItem = { type: "product"; index: number } | { type: "category"; index: number } | { type: "all" };

export function SearchAutocomplete() {
  useStoreVersion();
  const router = useRouter();
  const pathname = usePathname();
  const cart = useCart();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<ActiveItem>({ type: "all" });

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search unavailable");
        const data = (await response.json()) as { results?: Suggestion[] };
        if (!controller.signal.aborted) setResults((data.results ?? []).slice(0, 6));
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const categories = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return readCategories().filter((category) =>
      `${category.name} ${category.tagline} ${category.slug}`.toLowerCase().includes(term),
    ).slice(0, 3);
  }, [query]);

  const show = open && query.trim().length >= 2;
  const resultCount = results.length + categories.length + 1;

  function goToProduct(slug: string) {
    setOpen(false);
    setQuery("");
    router.push(`/product/${slug}`);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const term = query.trim();
    setOpen(false);
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
    inputRef.current?.blur();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const order: ActiveItem[] = [
        ...results.map((_, index) => ({ type: "product", index }) as ActiveItem),
        ...categories.map((_, index) => ({ type: "category", index }) as ActiveItem),
        { type: "all" },
      ];
      const current = order.findIndex((item) => item.type === active.type && ("index" in active && "index" in item ? active.index === item.index : item.type === active.type));
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = order[(current + direction + order.length) % order.length] ?? { type: "all" };
      setActive(next);
      return;
    }
    if (event.key === "Enter" && show) {
      if (active.type === "product" && results[active.index]) {
        event.preventDefault();
        goToProduct(results[active.index].slug);
      } else if (active.type === "category" && categories[active.index]) {
        event.preventDefault();
        setOpen(false);
        router.push(`/shop?category=${categories[active.index].slug}`);
      }
    }
  }

  return (
    <div ref={rootRef} className="store-search relative order-4 col-span-3 mt-1 w-full min-w-0 md:order-none md:ml-auto md:mt-0 md:max-w-[22rem] md:flex-1 lg:max-w-[28rem] xl:max-w-[36rem]">
      <form role="search" onSubmit={submit}>
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive({ type: "all" }); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search cells, BMS, UPS…"
          aria-label="Search products"
          aria-expanded={show}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          role="combobox"
          enterKeyHint="search"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-line bg-cream pl-10 pr-[4.7rem] text-[0.9rem] outline-none transition-shadow focus:border-ink/50 focus:ring-2 focus:ring-volt/50"
        />
        {query && <button type="button" onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }} aria-label="Clear search query" className="absolute right-10 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-ink"><X size={14} /></button>}
        <button type="submit" aria-label="Submit search" className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg bg-ink text-volt transition-colors hover:bg-ink-soft"><ArrowRight size={17} /></button>
      </form>

      {show && (
        <div id="search-suggestions" role="listbox" aria-label="Search suggestions" className="search-autocomplete absolute inset-x-0 top-full z-50 mt-2 max-h-[70dvh] overflow-y-auto rounded-2xl border border-line bg-cream shadow-[var(--shadow-lift)]">
          {loading && <p className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-xs text-muted"><Loader2 size={13} className="animate-spin" /> Searching the live catalogue…</p>}
          {!loading && results.length === 0 && categories.length === 0 && (
            <div className="px-4 py-5 text-sm text-muted">No exact matches. Try “18650”, “BMS”, “LiFePO4” or “router”.</div>
          )}
          {results.length > 0 && (
            <ul className="p-1.5" aria-label="Products">
              {results.map((result, index) => {
                const product = readProductBySlug(result.slug);
                return (
                  <li key={result.slug} role="option" aria-selected={active.type === "product" && active.index === index} data-active={active.type === "product" && active.index === index}>
                    <div className="search-result-row flex items-center gap-2 rounded-xl p-2 hover:bg-bone" data-active={active.type === "product" && active.index === index}>
                      <button type="button" onClick={() => goToProduct(result.slug)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-bone"><Image src={result.image} alt="" fill sizes="44px" className="object-cover" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8rem] font-medium">{result.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.66rem] text-muted">
                            <span>{result.brand}</span>
                            <span className={result.stock > 0 ? "text-[#3d7a2f]" : "text-ember"}>{result.stock > 0 ? `${result.stock} in stock` : "Out of stock"}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-[0.78rem] font-semibold">{formatBDT(result.price)}</span>
                      </button>
                      {product && product.stock > 0 && (
                        <button
                          type="button"
                          aria-label={`Quick add ${result.name}`}
                          onClick={() => cart.addItem({ id: product.id, slug: product.slug, name: product.name, brand: product.brand, price: product.price, image: result.image, stock: product.stock })}
                          className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted hover:border-ink hover:text-ink"
                        ><ShoppingBag size={13} /></button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {categories.length > 0 && (
            <div className="border-t border-line-soft p-1.5">
              <p className="px-2.5 pb-1 pt-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted">Matching departments</p>
              {categories.map((category, index) => (
                <Link
                  key={category.slug}
                  href={`/shop?category=${category.slug}`}
                  onClick={() => setOpen(false)}
                  role="option"
                  aria-selected={active.type === "category" && active.index === index}
                  className="flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 text-[0.78rem] hover:bg-bone"
                ><FolderSearch size={15} className="text-muted" /><span className="font-medium">{category.name}</span><span className="ml-auto text-[0.65rem] text-muted">{category.tagline}</span></Link>
              ))}
            </div>
          )}
          <button type="button" onClick={() => submit()} className="sticky bottom-0 flex min-h-11 w-full items-center justify-between gap-2 border-t border-line bg-cream px-4 text-[0.78rem] font-semibold">
            Search all products for “{query.trim()}” <ArrowRight size={14} />
          </button>
          <span className="sr-only" aria-live="polite">{resultCount - 1} suggestions available</span>
        </div>
      )}
    </div>
  );
}
