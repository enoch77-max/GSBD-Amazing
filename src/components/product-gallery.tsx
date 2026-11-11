"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { cn, discountPercent } from "@/lib/format";

export function ProductGallery({ images, name, badge, price, compareAt, sku }: {
  images: string[]; name: string; badge?: string | null; price: number; compareAt?: number | null; sku: string;
}) {
  const gallery = images.length ? images : ["/images/col-cells.jpg"];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState({x:50,y:50});
  const touchStart = useRef<{x:number;y:number} | null>(null);
  const off = discountPercent(price, compareAt);
  function change(direction: number) { setZoom(false); setIndex(value => (value + direction + gallery.length) % gallery.length); }

  return (
    <div>
      <div
        className="product-gallery-frame group relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-[#f0f2f5] sm:aspect-[4/3.4] lg:aspect-square"
        style={{touchAction:"pan-y"}}
        onTouchStart={event => { const touch=event.touches[0]; if(touch) touchStart.current={x:touch.clientX,y:touch.clientY}; }}
        onTouchEnd={event => { const touch=event.changedTouches[0], start=touchStart.current; if(touch && start) { const dx=touch.clientX-start.x, dy=touch.clientY-start.y; if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)) change(dx<0?1:-1); } touchStart.current=null; }}
        onPointerMove={event => { if(event.pointerType!=="mouse") return; const rect=event.currentTarget.getBoundingClientRect(); setOrigin({x:(event.clientX-rect.left)/rect.width*100,y:(event.clientY-rect.top)/rect.height*100}); setZoom(true); }}
        onPointerLeave={() => setZoom(false)}
      >
        <div className="absolute inset-0 transition-transform duration-300" style={zoom?{transform:"scale(1.65)",transformOrigin:`${origin.x}% ${origin.y}%`}:undefined}><Image key={gallery[index]} src={gallery[index]} alt={`${name}, image ${index+1}`} fill priority sizes="(max-width:1024px) 100vw, 48vw" className="object-cover" /></div>
        <div className="pointer-events-none absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
          {badge && <span className="rounded-full bg-volt px-2.5 py-1 text-[0.64rem] font-semibold leading-none">{badge}</span>}
          {off && <span className="rounded-full bg-ember px-2.5 py-1 text-[0.64rem] font-semibold leading-none text-white">−{off}%</span>}
        </div>
        <span className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1 rounded-full bg-cream/90 px-2.5 py-1 text-[0.6rem] text-muted sm:inline-flex"><Expand size={10} /> Hover to zoom</span>
        {gallery.length>1 && <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1"><button type="button" onClick={() => change(-1)} aria-label="Previous image" className="grid size-10 place-items-center rounded-full border border-ink/10 bg-cream/95"><ChevronLeft size={17} /></button><span aria-live="polite" className="rounded-full bg-cream/95 px-2 py-1 text-[0.65rem]">{index+1}/{gallery.length}</span><button type="button" onClick={() => change(1)} aria-label="Next image" className="grid size-10 place-items-center rounded-full border border-ink/10 bg-cream/95"><ChevronRight size={17} /></button></div>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {gallery.length>1 && <div className="scrollbar-none flex min-w-0 gap-2 overflow-x-auto py-0.5">{gallery.map((image,i) => <button key={`${image}-${i}`} type="button" onClick={() => {setIndex(i);setZoom(false);}} aria-label={`View image ${i+1}`} aria-pressed={index===i} className={cn("relative size-12 shrink-0 overflow-hidden rounded-lg border-2 bg-[#f0f2f5] sm:size-16", index===i ? "border-ink" : "border-transparent opacity-70")}><Image src={image} alt="" fill sizes="64px" className="object-cover" /></button>)}</div>}
        <span className="ml-auto hidden text-[0.6rem] text-muted sm:block">{sku}</span>
      </div>
    </div>
  );
}
