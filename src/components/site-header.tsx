"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight, Battery, ChevronDown, CircleHelp, CircuitBoard, Cpu,
  Headphones, Loader2, Menu, Package, Search, ShoppingBag, Truck,
  Wrench, X, Zap,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { NAV_CATEGORIES, SUPPORT_LINKS } from "@/lib/nav";
import { cn, formatBDT } from "@/lib/format";
import { STORE } from "@/lib/commerce";

const categoryIcons = [Battery, Package, Cpu, Zap, CircuitBoard, Wrench];
type Suggestion = { slug: string; name: string; brand: string; price: number; image: string; stock: number };

function Logo() {
  return (
    <Link href="/" aria-label="Glowing Space BD home" className="flex shrink-0 items-center gap-2">
      <span className="store-logo-mark grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-volt">
        <Zap size={19} fill="currentColor" strokeWidth={1.8} />
      </span>
      <span className="leading-none">
        <span className="block whitespace-nowrap font-display text-[1.05rem] font-semibold tracking-[-0.04em]">glowing space<span className="ml-1 text-[0.65rem] text-muted">BD</span></span>
        <span className="mt-1 block text-[0.6rem] tracking-[0.04em] text-muted">Batteries · Electronics · DIY</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const cart = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setShopOpen(false);
    setFocused(false);
  }, [pathname]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setShopOpen(false);
        setFocused(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShopOpen(false);
        setFocused(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      menuButton.current?.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const data = (await response.json()) as { results: Suggestion[] };
        if (!controller.signal.aborted) setResults(data.results ?? []);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setFocused(false);
    setShopOpen(false);
    const term = query.trim();
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
    (document.activeElement as HTMLElement)?.blur();
  }

  const showSuggestions = focused && query.trim().length >= 2;

  return (
    <header ref={headerRef} className="store-header sticky top-0 z-50 border-b border-line bg-bone">
      <div className="hidden border-b border-cream/10 bg-ink text-cream/80 lg:block">
        <div className="shell flex h-7 items-center justify-between gap-3 text-[0.69rem]">
          <span className="flex items-center gap-1.5"><Truck size={12} className="text-volt" /> Free delivery over ৳2,500 · Cash on delivery</span>
          <div className="flex items-center gap-5">
            <Link href="/track" className="hover:text-volt">Track order</Link>
            <Link href="/support#shipping" className="hover:text-volt">Delivery charges</Link>
            <a href={`tel:${STORE.phone.replace(/\s/g, "")}`} className="hover:text-volt">{STORE.phone}</a>
          </div>
        </div>
      </div>

      <div className="shell grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 py-2 md:flex md:h-[4.5rem] md:gap-4 md:py-0">
        <button ref={menuButton} type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-cream lg:hidden">
          <Menu size={21} />
        </button>
        <Logo />
        <nav aria-label="Main navigation" className="hidden shrink-0 items-center gap-1 lg:flex">
          <button type="button" onClick={() => { setShopOpen(!shopOpen); setFocused(false); }} aria-expanded={shopOpen} aria-controls="shop-menu" className="flex min-h-11 items-center gap-1 rounded-full px-3 text-[0.85rem] font-medium hover:bg-cream">
            Shop all <ChevronDown size={14} className={cn("transition-transform", shopOpen && "rotate-180")} />
          </button>
          <Link href="/shop?category=battery-cells" className="hidden px-3 py-3 text-[0.85rem] text-muted hover:text-ink xl:block">Cells</Link>
          <Link href="/shop?category=battery-packs" className="hidden px-3 py-3 text-[0.85rem] text-muted hover:text-ink xl:block">Packs</Link>
          <Link href="/shop?category=ups-power" className="hidden px-3 py-3 text-[0.85rem] text-muted hover:text-ink xl:block">UPS</Link>
        </nav>

        <form role="search" onSubmit={submitSearch} className="store-search relative order-4 col-span-3 mt-1 w-full min-w-0 md:order-none md:ml-auto md:mt-0 md:max-w-[28rem] md:flex-1">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search" value={query} onChange={event => setQuery(event.target.value)}
            onFocus={() => { setFocused(true); setShopOpen(false); }}
            placeholder="Search products" aria-label="Search products"
            enterKeyHint="search" autoComplete="off"
            className="h-11 w-full rounded-xl border border-line bg-cream pl-10 pr-[4.7rem] text-[0.9rem] outline-none transition-shadow focus:border-ink/50 focus:ring-2 focus:ring-volt/50"
          />
          {query && <button type="button" onClick={() => { setQuery(""); setResults([]); }} aria-label="Clear search query" className="absolute right-10 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-ink"><X size={14} /></button>}
          <button type="submit" aria-label="Submit search" className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg bg-ink text-volt transition-colors hover:bg-ink-soft"><ArrowRight size={17} /></button>
          {showSuggestions && (
            <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[65dvh] overflow-y-auto rounded-2xl border border-line bg-cream shadow-[var(--shadow-lift)]">
              {loading ? <p className="flex items-center gap-2 px-4 py-5 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Searching…</p> : results.length === 0 ? <p className="px-4 py-4 text-sm text-muted">No matches. Try “18650” or “BMS”.</p> : (
                <ul className="p-1.5">
                  {results.slice(0, 5).map(result => (
                    <li key={result.slug}>
                      <Link href={`/product/${result.slug}`} onClick={() => setFocused(false)} className="flex items-center gap-2.5 rounded-xl p-2.5 hover:bg-bone">
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-bone"><Image src={result.image} alt="" fill sizes="40px" className="object-cover" /></span>
                        <span className="min-w-0 flex-1 text-[0.8rem] font-medium leading-snug">{result.name}</span>
                        <span className="shrink-0 text-[0.8rem] font-semibold">{formatBDT(result.price)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <button type="submit" className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-line-soft px-4 text-[0.8rem] font-semibold">View all results <ArrowRight size={14} /></button>
            </div>
          )}
        </form>

        <div className="col-start-3 row-start-1 flex shrink-0 items-center gap-1 md:ml-auto">
          <Link href="/support" aria-label="Help and support" className="hidden size-10 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink min-[360px]:grid"><CircleHelp size={19} /></Link>
          <button type="button" onClick={cart.openCart} aria-label={`Open bag, ${cart.itemCount} items`} className="relative grid size-10 place-items-center rounded-full bg-cream hover:bg-white">
            <ShoppingBag size={20} />
            {cart.hydrated && cart.itemCount > 0 && <span key={cart.pulse} className="animate-badge-pop absolute -right-0.5 -top-0.5 grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full bg-volt px-1 text-[0.6rem] font-bold ring-2 ring-bone">{cart.itemCount}</span>}
          </button>
        </div>
      </div>

      {shopOpen && (
        <div id="shop-menu" className="absolute inset-x-0 top-full hidden border-b border-line bg-cream shadow-lg lg:block">
          <div className="shell grid grid-cols-3 gap-2 py-4">
            {NAV_CATEGORIES.map((category, index) => {
              const Icon = categoryIcons[index];
              return <Link key={category.slug} href={`/shop?category=${category.slug}`} onClick={() => setShopOpen(false)} className="flex items-center gap-3 rounded-xl p-3 hover:bg-bone"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-volt/30"><Icon size={18} /></span><span><span className="block text-sm font-semibold">{category.name}</span><span className="text-xs text-muted">{category.tagline}</span></span></Link>;
            })}
          </div>
        </div>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Shop menu">
          <button type="button" aria-label="Close menu backdrop" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-ink/50 backdrop-blur-sm" />
          <div className="animate-slide-in-left relative flex h-dvh w-[min(90%,23rem)] flex-col bg-bone">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3"><Logo /><button ref={closeButton} type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="grid size-10 place-items-center rounded-full border border-line"><X size={19} /></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <Link href="/shop" onClick={() => setMobileOpen(false)} className="mb-2 flex items-center justify-between rounded-xl bg-ink px-3 py-3 text-sm font-semibold text-cream">All products <ArrowRight size={16} /></Link>
              {NAV_CATEGORIES.map((category, index) => {
                const Icon = categoryIcons[index];
                return <Link key={category.slug} href={`/shop?category=${category.slug}`} onClick={() => setMobileOpen(false)} className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 hover:bg-cream"><Icon size={18} className="shrink-0 text-muted" /><span className="text-sm font-medium">{category.name}</span><ArrowRight size={14} className="ml-auto text-muted" /></Link>;
              })}
              <div className="my-3 border-t border-line" />
              {SUPPORT_LINKS.map(link => <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-cream">{link.label}<ArrowRight size={14} className="text-muted" /></Link>)}
            </div>
            <div className="shrink-0 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><a href={`tel:${STORE.phone.replace(/\s/g, "")}`} className="flex min-h-11 items-center gap-2 text-sm font-semibold"><Headphones size={16} /> {STORE.phone}</a><p className="text-xs text-muted">Mirpur DOHS, Dhaka · {STORE.hours}</p></div>
          </div>
        </div>
      )}
    </header>
  );
}
