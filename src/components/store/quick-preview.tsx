"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Product } from "@/db/schema";
import { formatBDT } from "@/lib/format";
import { cardIndicators, specChips } from "@/lib/product-quality";
import { productImage } from "@/lib/product-image";
import { Glyph, QualityBadge } from "./store-visuals";

/** Mobile quick-look sheet: full stored values, never clipped into tiny image text. */
export function QuickPreview({ product, onClose }: { product: Product; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chips = specChips(product, 4);
  const proof = cardIndicators(product);
  const photo = productImage(product.images[0], 480, 1);

  useEffect(() => {
    const prior = document.body.style.overflow;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prior;
      window.removeEventListener("keydown", onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div className="pq pq-preview-root" data-cat={product.categorySlug} role="presentation">
      <button type="button" className="pq-preview-scrim" aria-label="Close quick preview" tabIndex={-1} onClick={onClose} />
      <div ref={panelRef} className="pq-preview-sheet" role="dialog" aria-modal="true" aria-label={`Quick preview: ${product.name}`}>
        <span className="pq-preview-grip" aria-hidden="true" />
        <div className="pq-preview-head">
          <p className="pq-eyebrow">Quick look</p>
          <button ref={closeRef} type="button" className="pq-preview-close" aria-label="Close quick preview" onClick={onClose}><Glyph name="close" size={18} /></button>
        </div>
        <div className="pq-preview-product">
          <img src={photo.src} srcSet={photo.srcSet} sizes="80px" alt="" width={72} height={72} loading="lazy" />
          <div className="min-w-0">
            <h2>{product.name}</h2>
            <p className="pq-preview-meta">{product.brand} · {product.sku}</p>
            <strong className="pq-preview-price">{formatBDT(product.price)}</strong>
          </div>
        </div>
        {proof.length > 0 && <div className="pq-badges pq-preview-proof">{proof.map((item) => <QualityBadge key={item.id} indicator={item} compact />)}</div>}
        {chips.length > 0 && (
          <dl className="pq-preview-specs">
            {chips.map((chip) => (
              <div key={chip.raw.label}><dt>{chip.raw.label}</dt><dd>{chip.raw.value}</dd></div>
            ))}
          </dl>
        )}
        <Link href={`/product/${product.slug}`} onClick={onClose} className="pq-preview-cta">
          Explore product <Glyph name="right" size={17} />
        </Link>
      </div>
    </div>,
    document.body,
  );
}
