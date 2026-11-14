"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { cn, discountPercent, formatBDT } from "@/lib/format";
import { brandLabel, productLabel } from "@/lib/product-copy";
import { productImage, productImageSizes } from "@/lib/product-image";
import { cardMetaLine, genuineConfirmed, specChips } from "@/lib/product-quality";
import type { Product } from "@/db/schema";
import { Glyph, CategoryBackdrop, CategoryGlyph } from "@/components/store/store-visuals";
import { WishlistButton } from "@/components/wishlist-button";
import { QuickPreview } from "@/components/store/quick-preview";

/**
 * Product card — the whole system in miniature.
 * Large photo, one-line name, price, at most three trust badges and one add
 * button. Hovering (pointer) or tapping “Quick details” reveals the real spec
 * chips and the device-fit verdict without leaving the grid.
 */
export function ProductCard({ product, className, priority = false }: {
  product: Product; className?: string; priority?: boolean; elevated?: boolean;
}) {
  const cart = useCart();
  const [quickOpen, setQuickOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hoverDismissed, setHoverDismissed] = useState(false);
  const [pop, setPop] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const popTimer = useRef<number | null>(null);
  const addedTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (popTimer.current) window.clearTimeout(popTimer.current);
    if (addedTimer.current) window.clearTimeout(addedTimer.current);
  }, []);

  const qty = cart.lines.find((line) => line.slug === product.slug)?.qty ?? 0;
  const added = cart.lastAddedSlug === product.slug;
  const soldOut = product.stock <= 0;
  const off = discountPercent(product.price, product.compareAtPrice);
  const title = productLabel(product.slug, product.name);
  const image = productImage(product.images[0], 960);
  const genuine = genuineConfirmed(product);
  const metaLine = cardMetaLine(product);
  const chips = specChips(product, 3);
  const compareAt = product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : null;

  function add() {
    cart.addItem({ id: product.id, slug: product.slug, name: product.name, brand: product.brand, price: product.price, image: image.src, stock: product.stock });
    setPop(true);
    setJustAdded(true);
    if (popTimer.current) window.clearTimeout(popTimer.current);
    if (addedTimer.current) window.clearTimeout(addedTimer.current);
    popTimer.current = window.setTimeout(() => setPop(false), 520);
    /* Hold the confirmation for a beat, then reveal the stepper — the cart
       itself updates immediately, this is presentation only. */
    addedTimer.current = window.setTimeout(() => setJustAdded(false), 1100);
  }
  function decrease() {
    // Removing is one tap: at one unit, minus removes the line immediately.
    if (qty <= 1) cart.removeItem(product.slug);
    else cart.updateQty(product.slug, qty - 1);
  }

  return (
    <>
      <article className={cn("pq pq-card", className)} data-cat={product.categorySlug} aria-label={title} onMouseLeave={() => setHoverDismissed(false)}>
        <div className="pq-media" data-out={soldOut || undefined}>
          <CategoryBackdrop slug={product.categorySlug} className="pq-backdrop" />
          <Link href={`/product/${product.slug}`} aria-label={title} className="pq-media-link">
            <img
              src={image.src}
              srcSet={image.srcSet}
              sizes={productImageSizes.card}
              width={image.width}
              height={image.height}
              alt={product.name}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
            />
          </Link>
          <div className="pq-media-top">
            {off ? <span className="pq-flag" data-tone="sale">−{off}%</span> : null}
            {genuine && <span className="pq-genuine"><Glyph name="shield" size={11} />{genuine}</span>}
          </div>

          <button
            type="button"
            className="pq-quick-btn"
            aria-expanded={quickOpen || sheetOpen}
            aria-controls={`quick-${product.slug}`}
            onClick={() => {
              if (window.matchMedia("(hover: none)").matches) setSheetOpen(true);
              else setQuickOpen((value) => !value);
            }}
            onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) setQuickOpen(false); }}
          >
            <Glyph name="list" size={14} /><span>Quick look</span>
          </button>

          <div id={`quick-${product.slug}`} className="pq-quick" data-open={quickOpen || undefined} data-hover-closed={hoverDismissed || undefined}>
            <div className="pq-quick-head">
              <span>At a glance</span>
              <button type="button" aria-label={`Close quick details for ${product.name}`} onClick={() => { setQuickOpen(false); setHoverDismissed(true); }}><Glyph name="cross" size={12} /></button>
            </div>
            <div className="pq-chips">
              {chips.map((chip) => <span key={chip.raw.label} className="pq-chip"><span>{chip.label}</span><b>{chip.raw.value}</b></span>)}
            </div>
            <Link href={`/product/${product.slug}`} className="pq-quick-link">
              See photos & full specs <Glyph name="right" size={12} />
            </Link>
          </div>
        </div>

        <div className="pq-body">
          <div className="pq-brand">
            <CategoryGlyph slug={product.categorySlug} size={12} />
            <span className="pq-brand-text" title={product.brand}>{brandLabel(product.brand)}</span>
            {product.reviewCount > 0 && (
              <span className="pq-rating" title={`${product.rating.toFixed(1)} from ${product.reviewCount} reviews`}>
                <Glyph name="star" size={11} /> {product.rating.toFixed(1)} ({product.reviewCount})
              </span>
            )}
          </div>
          <Link href={`/product/${product.slug}`} title={product.name} className="pq-name">{title}</Link>

          {metaLine.length > 0 && (
            <p className="pq-meta" aria-label="Variant and key specification">
              {metaLine.map((part, index) => <span key={part}>{index > 0 && <i aria-hidden="true">·</i>}{part}</span>)}
            </p>
          )}

          <div className="pq-price-row">
            <span className="pq-price">{formatBDT(product.price)}</span>
            {compareAt && <span className="pq-old-price">{formatBDT(compareAt)}</span>}
            <span className="pq-stock-note" data-low={(product.stock > 0 && product.stock <= 10) || soldOut || undefined}>
              {soldOut ? "Sold out" : product.stock <= 10 ? `${product.stock} left` : "In stock"}
            </span>
          </div>

          <div className="pq-actions">
            {soldOut ? (
              <button type="button" disabled className="pq-add">Out of stock</button>
            ) : qty > 0 && !justAdded ? (
              <div className="pq-stepper" role="group" aria-label={`Quantity of ${product.name} in bag`}>
                <button type="button" onClick={decrease} aria-label={`Decrease quantity of ${product.name}`}><Glyph name="minus" size={13} /></button>
                <output key={qty} aria-live="polite">{qty} in bag</output>
                <button type="button" onClick={add} aria-label={`Increase quantity of ${product.name}`}><Glyph name="plus" size={13} /></button>
              </div>
            ) : (
              <button type="button" onClick={add} className="pq-add" data-added={justAdded || added || undefined} data-pop={pop || undefined} aria-label={`Add ${product.name} to bag`}>
                <Glyph name={justAdded || added ? "check" : "bag"} size={14} /> {justAdded || added ? "Added to bag" : "Add to bag"}
              </button>
            )}
            <WishlistButton slug={product.slug} className="pq-wish" label={false} />
          </div>
        </div>
      </article>
      {sheetOpen && <QuickPreview product={product} onClose={() => setSheetOpen(false)} />}
    </>
  );
}
