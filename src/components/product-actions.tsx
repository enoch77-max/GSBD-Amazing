"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Heart, Loader2, Minus, Plus, ShoppingBag, Truck, Zap } from "lucide-react";
import type { Product } from "@/db/schema";
import { useCart } from "@/lib/cart";
import { DISTRICTS, STORE, deliveryPrice, shippingEstimate } from "@/lib/commerce";
import { cn, formatBDT } from "@/lib/format";

export function ProductActions({ product }: { product: Product }) {
  const cart = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [district, setDistrict] = useState("Dhaka");
  const [saved, setSaved] = useState(false);
  const [buying, setBuying] = useState(false);
  const [barHidden, setBarHidden] = useState(true);
  const inlineActionsRef = useRef<HTMLDivElement>(null);
  const soldOut = product.stock <= 0;
  const added = cart.lastAddedSlug === product.slug;
  const maxQty = Math.max(1, Math.min(product.stock, 20));
  const madeToOrder = product.slug === "custom-battery-pack-service" || product.badge === "Built to order";
  const shipping = product.price * qty >= STORE.freeShippingThreshold ? 0 : deliveryPrice("standard", district);
  const restockLink = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(`Hi, when will ${product.name} (${product.sku}) be back in stock?`)}`;

  useEffect(() => {
    setQty(1);
    setBuying(false);
    setBarHidden(true);
    try {
      const list: unknown = JSON.parse(localStorage.getItem("gsbd-wishlist") ?? "[]");
      setSaved(Array.isArray(list) && list.includes(product.slug));
    } catch {
      setSaved(false);
    }
  }, [product.slug]);

  // The sticky purchase bar sinks away while the in-page controls are on screen,
  // then glides back up once the shopper has scrolled past them.
  useEffect(() => {
    const target = inlineActionsRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setBarHidden(entry.isIntersecting),
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [product.slug]);

  function toggleSaved() {
    const next = !saved;
    setSaved(next);
    try {
      const raw: unknown = JSON.parse(localStorage.getItem("gsbd-wishlist") ?? "[]");
      const list = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
      localStorage.setItem(
        "gsbd-wishlist",
        JSON.stringify(next ? [...new Set([...list, product.slug])] : list.filter(slug => slug !== product.slug)),
      );
    } catch {
      /* storage can be unavailable */
    }
  }

  function add() {
    if (soldOut) return;
    cart.addItem(
      {
        id: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        price: product.price,
        image: product.images[0] ?? "/images/col-cells.jpg",
        stock: product.stock,
      },
      qty,
    );
  }

  function buyNow() {
    if (buying || soldOut) return;
    setBuying(true);
    add();
    cart.dismissToast();
    router.push("/checkout");
  }

  return (
    <>
      <div className="mt-3">
        <div ref={inlineActionsRef} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <div className="flex h-11 items-center rounded-full border border-line bg-cream">
            <button type="button" disabled={qty <= 1 || soldOut} onClick={() => setQty(value => Math.max(1, value - 1))} aria-label="Decrease quantity" className="grid size-9 place-items-center rounded-full disabled:opacity-30"><Minus size={13} /></button>
            <span className="w-5 text-center text-xs font-semibold tabular-nums" aria-live="polite">{qty}</span>
            <button type="button" disabled={qty >= maxQty || soldOut} onClick={() => setQty(value => Math.min(maxQty, value + 1))} aria-label="Increase quantity" className="grid size-9 place-items-center rounded-full disabled:opacity-30"><Plus size={13} /></button>
          </div>
          <button type="button" onClick={add} disabled={soldOut} className={cn("btn btn-primary min-h-11 min-w-0 gap-1.5 px-2.5 py-3 text-[0.8rem]", added && "is-added")}>{added ? <><Check size={15} /> Added</> : soldOut ? "Sold out" : <><ShoppingBag size={15} /> Add to bag</>}</button>
          <button type="button" onClick={toggleSaved} aria-label={saved ? "Remove from wishlist" : "Save for later"} aria-pressed={saved} className={cn("grid size-11 place-items-center rounded-full border", saved ? "border-ember/40 bg-ember/5 text-ember" : "border-line bg-cream")}><Heart size={17} fill={saved ? "currentColor" : "none"} /></button>
        </div>
        {soldOut ? (
          <a href={restockLink} target="_blank" rel="noreferrer" className="btn btn-outline mt-2 min-h-11 w-full text-[0.8rem]">Ask about restock</a>
        ) : (
          <button type="button" onClick={buyNow} disabled={buying} className="btn btn-volt mt-2 min-h-11 w-full text-[0.82rem]">
            {buying ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} Buy now · {formatBDT(product.price * qty)}
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-cream py-2 text-center">
        <div className="px-1"><p className="text-[0.62rem] text-muted">Warranty</p><p className="mt-0.5 text-xs font-medium">{product.warrantyMonths > 0 ? `${product.warrantyMonths} mo` : "None"}</p></div>
        <div className="px-1"><p className="text-[0.62rem] text-muted">Dispatch</p><p className="mt-0.5 text-xs font-medium">{soldOut ? "On restock" : madeToOrder ? "3–5 days" : "24 hours"}</p></div>
        <div className="px-1"><p className="text-[0.62rem] text-muted">Returns</p><p className="mt-0.5 text-xs font-medium">{madeToOrder ? "If faulty" : "14 days"}</p></div>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-cream p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium"><Truck size={14} /> Deliver to</span>
          <span className="relative max-w-[60%]">
            <select value={district} onChange={event => setDistrict(event.target.value)} aria-label="Delivery district" className="min-h-9 max-w-full appearance-none rounded-lg border border-line bg-white py-1.5 pl-2.5 pr-7 text-xs outline-none focus:border-ink">
              {DISTRICTS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" />
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted">Delivery <strong className="font-semibold text-ink">{shipping === 0 ? "Free" : formatBDT(shipping)}</strong></span>
          <span className="font-medium">{shippingEstimate(district)}</span>
        </div>
        <p className="mt-1.5 text-[0.65rem] text-muted">Cash on delivery · Free standard delivery over ৳2,500</p>
      </div>

      <div
        data-hidden={barHidden}
        className="sticky-purchase fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bone/95 px-3 py-2.5 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
        aria-hidden={barHidden}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-9 shrink-0 items-center rounded-full border border-line bg-white">
            <button type="button" disabled={qty <= 1 || soldOut} onClick={() => setQty(value => Math.max(1, value - 1))} tabIndex={barHidden ? -1 : 0} aria-label="Decrease quantity" className="grid size-8 place-items-center rounded-full disabled:opacity-30"><Minus size={13} /></button>
            <span className="w-4 text-center text-xs font-semibold tabular-nums">{qty}</span>
            <button type="button" disabled={qty >= maxQty || soldOut} onClick={() => setQty(value => Math.min(maxQty, value + 1))} tabIndex={barHidden ? -1 : 0} aria-label="Increase quantity" className="grid size-8 place-items-center rounded-full disabled:opacity-30"><Plus size={13} /></button>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.58rem] leading-none text-muted">{qty} × {formatBDT(product.price)}</p>
            <p className="mt-0.5 truncate text-[1rem] font-semibold leading-tight tabular-nums">{formatBDT(product.price * qty)}</p>
          </div>

          {soldOut ? (
            <a href={restockLink} target="_blank" rel="noreferrer" tabIndex={barHidden ? -1 : 0} className="btn btn-primary h-10 shrink-0 px-3 text-[0.78rem]">Restock</a>
          ) : (
            <>
              <button type="button" onClick={buyNow} disabled={buying} tabIndex={barHidden ? -1 : 0} className="btn btn-volt h-10 shrink-0 gap-1.5 px-3 text-[0.78rem]">
                {buying ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Buy<span className="hidden min-[380px]:inline"> now</span>
              </button>
              <button type="button" onClick={add} tabIndex={barHidden ? -1 : 0} className={cn("btn btn-primary h-10 shrink-0 gap-1.5 px-3 text-[0.78rem]", added && "is-added")}>
                {added ? <><Check size={14} strokeWidth={3} /> Added</> : <><ShoppingBag size={14} /> Add</>}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
