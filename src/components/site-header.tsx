"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Battery, BatteryCharging, ChevronDown, CircleHelp, CircuitBoard, Cpu,
  Headphones, Heart, Menu, Package, ShoppingBag, Truck, Wrench, X, Zap,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { NAV_CATEGORIES, SUPPORT_LINKS } from "@/lib/nav";
import { cn } from "@/lib/format";
import { STORE } from "@/lib/commerce";
import { SearchAutocomplete } from "@/components/search-autocomplete";

const categoryIcons = [Battery, Package, Cpu, Zap, CircuitBoard, Wrench];

function Logo() {
  return (
    <Link href="/" aria-label="Glowing Space BD home" className="flex shrink-0 items-center gap-2">
      <span className="store-logo-mark grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-volt"><Zap size={19} fill="currentColor" strokeWidth={1.8} /></span>
      <span className="leading-none">
        <span className="block whitespace-nowrap font-display text-[1.05rem] font-semibold tracking-[-0.04em]">glowing space<span className="ml-1 text-[0.65rem] text-muted">BD</span></span>
        <span className="mt-1 block text-[0.6rem] tracking-[0.04em] text-muted">Batteries · Electronics · DIY</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const cart = useCart();
  const wishlist = useWishlist();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setShopOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setShopOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShopOpen(false);
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

  return (
    <header ref={headerRef} className="store-header no-print sticky top-0 z-50 border-b border-line bg-bone">
      <div className="hidden border-b border-cream/10 bg-ink text-cream/80 lg:block">
        <div className="shell flex h-7 items-center justify-between gap-3 text-[0.69rem]">
          <span className="flex items-center gap-1.5"><Truck size={12} className="text-volt" /> Free delivery over ৳2,500 · Cash on delivery</span>
          <div className="flex items-center gap-5">
            <Link href="/pack-builder" className="text-volt hover:text-cream">Build a custom pack</Link>
            <Link href="/track" className="hover:text-volt">Track order</Link>
            <Link href="/help/shipping" className="hover:text-volt">Delivery charges</Link>
            <a href={`tel:${STORE.phone.replace(/\s/g, "")}`} className="hover:text-volt">{STORE.phone}</a>
          </div>
        </div>
      </div>

      <div className="shell grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 py-2 md:flex md:h-[4.5rem] md:gap-4 md:py-0">
        <button ref={menuButton} type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-cream lg:hidden"><Menu size={21} /></button>
        <Logo />
        <nav aria-label="Main navigation" className="hidden shrink-0 items-center gap-1 lg:flex">
          <button type="button" onClick={() => setShopOpen(!shopOpen)} aria-expanded={shopOpen} aria-controls="shop-menu" className="flex min-h-11 items-center gap-1 rounded-full px-3 text-[0.85rem] font-medium hover:bg-cream">
            Shop all <ChevronDown size={14} className={cn("transition-transform", shopOpen && "rotate-180")} />
          </button>
          <Link href="/pack-builder" className="hidden items-center gap-1.5 rounded-full bg-volt/25 px-3 py-2 text-[0.82rem] font-semibold text-ink hover:bg-volt/40 xl:flex"><BatteryCharging size={15} /> Pack builder</Link>
          <Link href="/shop?category=battery-cells" className="hidden px-3 py-3 text-[0.85rem] text-muted hover:text-ink xl:block">Cells</Link>
          <Link href="/shop?category=ups-power" className="hidden px-3 py-3 text-[0.85rem] text-muted hover:text-ink xl:block">UPS</Link>
        </nav>

        <SearchAutocomplete />

        <div className="col-start-3 row-start-1 flex shrink-0 items-center gap-1 md:ml-auto">
          <Link href="/help" aria-label="Help centre" className="hidden size-10 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink min-[360px]:grid"><CircleHelp size={19} /></Link>
          <Link href="/wishlist" aria-label={`Wishlist, ${wishlist.count} saved products`} className="relative grid size-10 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink">
            <Heart size={19} fill={wishlist.count > 0 ? "currentColor" : "none"} />
            {wishlist.hydrated && wishlist.count > 0 && <span className="animate-badge-pop absolute -right-0.5 -top-0.5 grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full bg-ember px-1 text-[0.58rem] font-bold text-white ring-2 ring-bone">{wishlist.count}</span>}
          </Link>
          <button type="button" onClick={cart.openCart} aria-label={`Open cart, ${cart.itemCount} items`} className="relative grid size-10 place-items-center rounded-full bg-cream hover:bg-white">
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
              <Link href="/pack-builder" onClick={() => setMobileOpen(false)} className="mb-2 flex items-center justify-between rounded-xl bg-volt px-3 py-3 text-sm font-semibold text-ink"><span className="flex items-center gap-2"><BatteryCharging size={17} /> Custom pack builder</span><ArrowRight size={16} /></Link>
              <Link href="/shop" onClick={() => setMobileOpen(false)} className="mb-2 flex items-center justify-between rounded-xl bg-ink px-3 py-3 text-sm font-semibold text-cream">All products <ArrowRight size={16} /></Link>
              {NAV_CATEGORIES.map((category, index) => {
                const Icon = categoryIcons[index];
                return <Link key={category.slug} href={`/shop?category=${category.slug}`} onClick={() => setMobileOpen(false)} className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 hover:bg-cream"><Icon size={18} className="shrink-0 text-muted" /><span className="text-sm font-medium">{category.name}</span><ArrowRight size={14} className="ml-auto text-muted" /></Link>;
              })}
              <div className="my-3 border-t border-line" />
              <Link href="/wishlist" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-cream">Wishlist <span className="font-mono text-xs text-muted">{wishlist.count}</span></Link>
              <Link href="/help" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-cream">Help centre <ArrowRight size={14} className="text-muted" /></Link>
              {SUPPORT_LINKS.map((link) => <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-cream">{link.label}<ArrowRight size={14} className="text-muted" /></Link>)}
            </div>
            <div className="shrink-0 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><a href={`tel:${STORE.phone.replace(/\s/g, "")}`} className="flex min-h-11 items-center gap-2 text-sm font-semibold"><Headphones size={16} /> {STORE.phone}</a><p className="text-xs text-muted">Mirpur DOHS, Dhaka · {STORE.hours}</p></div>
          </div>
        </div>
      )}
    </header>
  );
}
