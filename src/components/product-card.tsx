"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Minus, Plus, ShoppingBag, Star } from "lucide-react";
import type { Product } from "@/db/schema";
import { useCart } from "@/lib/cart";
import { cn, discountPercent, formatBDT } from "@/lib/format";
import { brandLabel, productLabel } from "@/lib/product-copy";
import { WishlistButton } from "@/components/wishlist-button";

export function ProductCard({ product, className, priority = false, elevated = false }: {
  product: Product; className?: string; priority?: boolean; elevated?: boolean;
}) {
  const cart = useCart();
  const added = cart.lastAddedSlug === product.slug;
  const qty = cart.lines.find(line => line.slug === product.slug)?.qty ?? 0;
  const off = discountPercent(product.price, product.compareAtPrice);
  const soldOut = product.stock <= 0;
  const low = product.stock > 0 && product.stock <= 10;
  const image = product.images[0] ?? "/images/col-cells.jpg";
  const title = productLabel(product.slug, product.name);
  // Keep the model name and its spec as separate fields so neither can orphan a separator.
  const [modelName, modelSpec] = title.split(" · ");
  const badge = product.badge === "Load-shedding pick" ? "Router backup" : product.badge;
  const hasCompare = !!product.compareAtPrice && product.compareAtPrice > product.price;

  function add() {
    cart.addItem({ id: product.id, slug: product.slug, name: product.name, brand: product.brand, price: product.price, image, stock: product.stock });
  }
  function decrease() {
    if (qty <= 1) cart.removeItem(product.slug);
    else cart.updateQty(product.slug, qty - 1);
  }

  return (
    <article data-tone={product.categorySlug} className={cn("product-card group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-cream transition-shadow duration-200 hover:shadow-[var(--shadow-card)]", elevated && "shadow-[var(--shadow-card)]", className)}>
      <div className="product-media relative aspect-[5/4] overflow-hidden bg-[#eeeade]">
        <Link href={`/product/${product.slug}`} aria-label={product.name} className="absolute inset-0">
          <Image src={image} alt={product.name} fill priority={priority} sizes="(max-width:640px) 48vw, (max-width:1024px) 32vw, 24vw" className={cn("object-cover transition-transform duration-500 group-hover:scale-[1.04]", soldOut && "opacity-60 saturate-50")} />
        </Link>
        <div className="pointer-events-none absolute left-2 right-2 top-2 flex flex-wrap items-start gap-1">
          {badge && <span className="product-badge rounded-full bg-volt px-2 py-1 text-[0.56rem] font-semibold leading-none text-ink sm:text-[0.62rem]">{badge}</span>}
          {off && <span className="product-badge rounded-full bg-ember px-2 py-1 text-[0.56rem] font-semibold leading-none text-white sm:text-[0.62rem]">−{off}%</span>}
        </div>
        <WishlistButton slug={product.slug} className="absolute bottom-2 right-2 z-10 shadow-sm" label={false} />
      </div>

      <div className="flex flex-1 flex-col px-3 pb-2.5 pt-2 sm:px-3.5 sm:pb-3">
        {/* Eyebrow: brand gives the model context; availability sits opposite it. */}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted">{brandLabel(product.brand)}</p>
          {soldOut ? (
            <span className="shrink-0 text-[0.6rem] font-medium uppercase tracking-[0.06em] text-muted">Sold out</span>
          ) : low ? (
            <span className="shrink-0 text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-ember tabular-nums">{product.stock} left</span>
          ) : (
            <span className="size-1.5 shrink-0 rounded-full bg-[#61a83f]" aria-label="In stock" />
          )}
        </div>

        {/* Title: the model is the anchor. */}
        <Link href={`/product/${product.slug}`} title={product.name} className="mt-1 block">
          <h3 className="line-clamp-2 min-h-[2.2rem] font-sans text-[0.85rem] font-semibold leading-[1.3] tracking-[-0.012em] sm:text-[0.92rem]">
            {modelName}
          </h3>
        </Link>

        {/* One metadata line: spec and social proof together, instead of two sparse rows. */}
        <div className="mt-1.5 flex items-center gap-1.5 text-[0.69rem] text-muted">
          {modelSpec && (
            <>
              <span className="shrink-0 font-medium text-ink/70 tabular-nums">{modelSpec}</span>
              <span aria-hidden className="hidden text-line min-[360px]:inline">·</span>
            </>
          )}
          <Star size={11} fill="currentColor" strokeWidth={0} className="shrink-0 text-[#c78c2c]" aria-hidden />
          <span className="shrink-0 font-semibold text-ink tabular-nums">{product.rating.toFixed(1)}</span>
          <span className="hidden truncate tabular-nums min-[360px]:inline">({product.reviewCount})</span>
        </div>

        {/* Price owns its line, with the comparison price adjacent. */}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-2.5">
          <span className="product-price text-[1.1rem] font-bold leading-none tabular-nums tracking-tight sm:text-[1.2rem]">{formatBDT(product.price)}</span>
          {hasCompare && <span className="text-[0.7rem] tabular-nums text-muted line-through">{formatBDT(product.compareAtPrice!)}</span>}
        </div>

        {/* Action gets its own dedicated row. */}
        <div className="mt-2.5">
          {soldOut ? (
            <button type="button" disabled aria-label={`${product.name} is out of stock`} className="card-add flex min-h-9 w-full items-center justify-center rounded-full border border-line bg-bone/70 text-[0.78rem] font-semibold text-muted">
              Out of stock
            </button>
          ) : qty > 0 ? (
            <div className="card-stepper flex min-h-9 items-center justify-between rounded-full px-1">
              <button type="button" onClick={decrease} aria-label={`Decrease quantity of ${product.name}`} className="grid size-7 place-items-center rounded-full transition-colors hover:bg-white/10"><Minus size={13} /></button>
              <span className="text-[0.74rem] font-semibold tabular-nums" aria-live="polite">{qty} in bag</span>
              <button type="button" onClick={add} aria-label={`Increase quantity of ${product.name}`} className="grid size-7 place-items-center rounded-full transition-colors hover:bg-white/10"><Plus size={13} /></button>
            </div>
          ) : (
            <button type="button" onClick={add} aria-label={`Add ${product.name} to bag`} className={cn("card-add flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full text-[0.78rem] font-semibold", added && "added")}>
              {added ? <><Check size={14} strokeWidth={3} /> Added</> : <><ShoppingBag size={14} /> Add to bag</>}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
