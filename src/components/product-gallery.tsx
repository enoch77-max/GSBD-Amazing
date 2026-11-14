"use client";

import { useEffect, useRef, useState } from "react";
import { discountPercent } from "@/lib/format";
import { productImage, productImageSizes } from "@/lib/product-image";
import { Glyph } from "@/components/store/store-visuals";

/** Real product photos first; zoom and swipe without fictitious photo callouts. */
export function ProductGallery({ images, name, badge, price, compareAt, sku, categorySlug }: {
  images: string[]; name: string; badge?: string | null; price: number; compareAt?: number | null; sku: string; categorySlug: string;
}) {
  const gallery = images.length ? images : ["/images/col-cells.jpg"];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [lightbox, setLightbox] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const off = discountPercent(price, compareAt);
  const image = productImage(gallery[index], 1280, 1);

  useEffect(() => {
    if (!lightbox) return;
    const previousOverflow = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(false);
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      openerRef.current?.focus({ preventScroll: true });
    };
  }, [lightbox]);

  function change(direction: number) {
    setZoom(false);
    setIndex((value) => (value + direction + gallery.length) % gallery.length);
  }

  return (
    <div className="pq" data-cat={categorySlug}>
      <div
        className="pq-gallery-frame"
        data-zoom={zoom || undefined}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const touch = event.changedTouches[0];
          const start = touchStart.current;
          if (touch && start) {
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) change(dx < 0 ? 1 : -1);
          }
          touchStart.current = null;
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          if ((event.target as HTMLElement).closest?.(".pq-gallery-tools, .pq-gallery-nav")) {
            setZoom(false);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setOrigin({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
          setZoom(true);
        }}
        onPointerLeave={() => setZoom(false)}
      >
        <div className="pq-gallery-img" style={{ "--ox": `${origin.x}%`, "--oy": `${origin.y}%` } as React.CSSProperties}>
          <img
            src={image.src} srcSet={image.srcSet} sizes={productImageSizes.gallery}
            width={image.width} height={image.height}
            alt={`${name}, image ${index + 1}`}
            fetchPriority="high" decoding="async"
          />
        </div>
        <div className="pq-media-top">
          {badge && <span className="pq-flag" data-tone="cat">{badge}</span>}
          {off ? <span className="pq-flag" data-tone="sale">−{off}%</span> : null}
        </div>
        <div className="pq-gallery-tools">
          <button ref={openerRef} type="button" className="pq-gallery-tool" aria-label="Open larger image" onClick={() => setLightbox(true)}>
            <Glyph name="zoom" size={17} />
          </button>
        </div>
        {gallery.length > 1 && (
          <div className="pq-gallery-nav absolute bottom-2.5 right-2.5 z-[3] flex items-center gap-1">
            <button type="button" onClick={() => change(-1)} aria-label="Previous image" className="pq-gallery-tool !size-10"><Glyph name="left" size={15} /></button>
            <span aria-live="polite" className="rounded-full bg-white/95 px-2 py-1 text-[0.65rem] font-semibold">{index + 1}/{gallery.length}</span>
            <button type="button" onClick={() => change(1)} aria-label="Next image" className="pq-gallery-tool !size-10"><Glyph name="right" size={15} /></button>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {gallery.length > 1 && (
          <div className="pq-thumbs">
            {gallery.map((src, i) => (
              <button key={`${src}-${i}`} type="button" className="pq-thumb" aria-label={`View image ${i + 1}`} aria-pressed={index === i}
                onClick={() => { setIndex(i); setZoom(false); }}>
                <img src={productImage(src, 160, 1).src} alt="" width={56} height={56} loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto hidden text-[0.62rem] text-muted sm:block">{sku}</span>
      </div>
      {lightbox && (
        <div className="pq-lightbox" role="dialog" aria-modal="true" aria-label={`${name} enlarged image`} onClick={() => setLightbox(false)}>
          <img src={productImage(gallery[index], 1600, 1).src} alt={name} width={1200} height={1200} onClick={(event) => event.stopPropagation()} />
          <button ref={closeRef} type="button" className="pq-lightbox-close" aria-label="Close larger image" onClick={() => setLightbox(false)}><Glyph name="cross" size={17} /></button>
        </div>
      )}
    </div>
  );
}
