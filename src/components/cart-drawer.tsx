"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
  X,
  Zap,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { STORE } from "@/lib/commerce";
import { cn, formatBDT } from "@/lib/format";
import { productLabel } from "@/lib/product-copy";
import { PackBreakdown } from "@/components/pack-breakdown";
import { calculatePack, suggestPackProducts } from "@/lib/pack-builder";
import { readAllProducts } from "@/lib/queries";

type Upsell = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  stock: number;
};

export function CartDrawer() {
  const cart = useCart();
  const [upsell, setUpsell] = useState<Upsell[]>([]);

  useEffect(() => {
    if (!cart.isOpen || upsell.length > 0) return;
    let active = true;
    fetch("/api/products/upsell")
      .then((response) => response.json())
      .then((data: { products: Upsell[] }) => {
        if (active) setUpsell(data.products ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [cart.isOpen, upsell.length]);

  if (!cart.isOpen) return null;

  const remaining = Math.max(0, STORE.freeShippingThreshold - cart.subtotal);
  const progress = Math.min(100, Math.round((cart.subtotal / STORE.freeShippingThreshold) * 100));
  const inBag = new Set(cart.lines.flatMap((line) => [line.slug, ...(line.packComponents ?? []).flatMap((component) => component.slug ? [component.slug] : [])]));
  const packs = cart.lines.filter((line) => line.customPack);
  let usefulExtras = upsell.filter((item) => !inBag.has(item.slug));
  if (packs.length) {
    try {
      const products = readAllProducts();
      const compatible = packs.map((line) => suggestPackProducts(calculatePack(line.customPack, { products }), products));
      usefulExtras = (compatible[0] ?? [])
        .filter((entry) => compatible.every((list) => list.some((other) => other.product.slug === entry.product.slug)))
        .filter((entry) => !inBag.has(entry.product.slug))
        .map(({ product }) => ({ id: product.id ?? 0, slug: product.slug, name: product.name, brand: product.brand ?? "Glowing Space", price: product.price, image: product.images[0] ?? "/images/col-circuits.jpg", stock: product.stock }));
    } catch {
      usefulExtras = [];
    }
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Shopping bag">
      <button
        type="button"
        onClick={cart.closeCart}
        className="animate-fade-in absolute inset-0 bg-ink/55 backdrop-blur-[3px]"
        aria-label="Close bag"
      />
      <aside className="animate-slide-in-right absolute inset-y-0 right-0 flex w-full max-w-[27rem] flex-col bg-bone shadow-[-24px_0_60px_-30px_rgba(11,23,18,0.6)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow text-muted">Your bag</p>
            <p className="mt-1 font-display text-lg font-semibold">
              {cart.itemCount > 0 ? `${cart.itemCount} item${cart.itemCount > 1 ? "s" : ""}` : "Empty for now"}
            </p>
          </div>
          <button
            type="button"
            onClick={cart.closeCart}
            className="grid size-9 place-items-center rounded-full border border-line bg-cream transition-colors hover:border-ink"
            aria-label="Close bag"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-line bg-cream px-5 py-3">
          <div className="flex items-center gap-2 text-[0.75rem]">
            <Truck size={14} className="text-ink" />
            {remaining > 0 ? (
              <span>
                Add <strong className="font-semibold">{formatBDT(remaining)}</strong> more for free delivery
              </span>
            ) : (
              <span className="flex items-center gap-1 font-medium text-[#3d7a2f]">
                <Check size={13} /> Free standard delivery unlocked
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-volt-deep to-volt transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <span className="relative grid size-20 place-items-center rounded-full border border-dashed border-line bg-cream">
              <ShoppingBag size={26} className="text-muted" />
              <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-volt text-ink">
                <Zap size={12} fill="currentColor" />
              </span>
            </span>
            <h3 className="mt-5 text-xl">Your bag is empty</h3>
            <p className="mt-2 text-[0.85rem] text-muted">
              Choose products to start your order.
            </p>
            <Link href="/shop" onClick={cart.closeCart} className="btn btn-primary mt-5">
              Start shopping <ArrowRight size={15} />
            </Link>
            <div className="mt-8 grid w-full gap-2 text-left">
              {[
                ["Free delivery", "On orders above ৳2,500"],
                ["14-day returns", "Unopened cells & modules"],
                ["Real support", "Build advice on WhatsApp"],
              ].map(([title, copy]) => (
                <div key={title} className="flex items-center gap-2 rounded-xl border border-line-soft bg-cream px-3 py-2.5">
                  <Check size={14} className="text-[#3d7a2f]" />
                  <p className="text-[0.76rem]">
                    <span className="font-semibold">{title}</span>{" "}
                    <span className="text-muted">· {copy}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <ul className="space-y-3">
                {cart.lines.map((line) => (
                  <li key={line.slug} className="animate-fade-in rounded-2xl border border-line-soft bg-cream p-3">
                    <div className="flex gap-3">
                      <span className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-bone">
                        <Image src={line.image} alt="" fill sizes="72px" className="object-cover" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[0.62rem] font-medium uppercase tracking-wider text-muted">{line.customPack ? "Made to order" : line.brand}</p>
                            {line.customPack ? (
                              <p className="mt-1 text-[0.85rem] font-semibold leading-snug">{line.name}</p>
                            ) : (
                              <Link href={`/product/${line.slug}`} onClick={cart.closeCart} className="mt-1 block text-[0.85rem] font-semibold leading-snug hover:underline">
                                {productLabel(line.slug, line.name)}
                              </Link>
                            )}
                          </div>
                          <button type="button" onClick={() => cart.removeItem(line.slug)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bone hover:text-ember" aria-label={`Remove ${line.name}`}><Trash2 size={14} /></button>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center rounded-full border border-line bg-white">
                            <button type="button" onClick={() => cart.updateQty(line.slug, line.qty - 1)} className="grid size-8 place-items-center rounded-full text-ink hover:bg-bone disabled:opacity-40" disabled={line.qty <= 1} aria-label="Decrease quantity"><Minus size={12} /></button>
                            <span className="w-6 text-center text-[0.75rem] tabular-nums">{line.qty}</span>
                            <button type="button" onClick={() => cart.updateQty(line.slug, line.qty + 1)} className="grid size-8 place-items-center rounded-full text-ink hover:bg-bone disabled:opacity-40" disabled={line.qty >= Math.min(line.stock, 20)} aria-label="Increase quantity"><Plus size={12} /></button>
                          </div>
                          <p className="text-[0.9rem] font-semibold tabular-nums">{formatBDT(line.price * line.qty)}</p>
                        </div>
                      </div>
                    </div>
                    {line.customPack && <PackBreakdown line={line} onNavigate={cart.closeCart} />}
                  </li>
                ))}
              </ul>

              {usefulExtras.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <p className="eyebrow text-muted">Useful extras</p>
                    <span className="text-[0.66rem] text-muted">{packs.length ? "Matched to your build" : "Under ৳1,500"}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {usefulExtras.map((item) => (
                        <li
                          key={item.slug}
                          className="flex items-center gap-2.5 rounded-xl border border-line-soft bg-cream p-2"
                        >
                          <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-bone">
                            <Image src={item.image} alt="" fill sizes="40px" className="object-cover" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.76rem] font-medium leading-snug">{productLabel(item.slug, item.name)}</span>
                            <span className="text-[0.7rem] text-muted">{formatBDT(item.price)}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => cart.addItem(item)}
                            className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/15 bg-white transition-colors hover:border-ink hover:bg-ink hover:text-volt"
                            aria-label={`Add ${item.name}`}
                          >
                            <Plus size={13} />
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-line bg-cream px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="flex items-center justify-between text-[0.88rem]">
                <span className="text-muted">Subtotal</span>
                <span className="font-semibold">{formatBDT(cart.subtotal)}</span>
              </div>
              <p className="mt-1 text-[0.7rem] text-muted">
                Delivery calculated at checkout · COD available
              </p>
              <Link
                href="/checkout"
                onClick={cart.closeCart}
                className={cn("btn btn-primary mt-3 w-full justify-between")}
              >
                Checkout <span className="flex items-center gap-1">{formatBDT(cart.subtotal)} <ArrowRight size={15} /></span>
              </Link>
              <button
                type="button"
                onClick={cart.closeCart}
                className="mt-2 w-full text-center text-[0.78rem] font-medium text-muted transition-colors hover:text-ink"
              >
                Continue shopping
              </button>
              <div className="mt-3 flex items-center justify-center gap-3 border-t border-line-soft pt-3 text-[0.62rem] uppercase tracking-[0.12em] text-muted">
                <span className="flex items-center gap-1"><ShieldCheck size={11} /> Verified stock</span>
                <span className="size-1 rounded-full bg-line" />
                <span>bKash · Nagad · COD</span>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export function CartToast() {
  const cart = useCart();
  if (!cart.toast || cart.isOpen) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.8rem+env(safe-area-inset-bottom))] z-[60] flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end lg:bottom-6">
      <div className="animate-toast-in flex w-full max-w-sm items-center gap-3 rounded-2xl border border-ink/10 bg-ink p-2.5 pr-3 text-cream shadow-[0_24px_50px_-24px_rgba(11,23,18,0.8)]">
        {cart.toast.image ? (
          <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-ink-soft">
            <Image src={cart.toast.image} alt="" fill sizes="44px" className="object-cover" />
          </span>
        ) : (
          <span className="grid size-11 place-items-center rounded-xl bg-volt text-ink">
            <Check size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.16em] text-volt">
            <Check size={11} /> {cart.toast.subtitle}
          </p>
          <p className="text-[0.78rem] font-medium leading-snug">{cart.lastAddedSlug ? productLabel(cart.lastAddedSlug, cart.toast.title) : cart.toast.title}</p>
        </div>
        <button
          type="button"
          onClick={cart.openCart}
          className="shrink-0 rounded-full bg-volt px-3 py-2 text-[0.72rem] font-semibold text-ink transition-colors hover:bg-[#d6f887]"
        >
          View bag
        </button>
        <button
          type="button"
          onClick={cart.dismissToast}
          className="shrink-0 text-cream/50 transition-colors hover:text-cream"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
