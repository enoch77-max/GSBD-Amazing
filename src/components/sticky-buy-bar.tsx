"use client";

import Image from "next/image";
import { useEffect, useState, type RefObject } from "react";
import { Loader2, Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import type { Product } from "@/db/schema";
import { formatBDT } from "@/lib/format";

export function StickyBuyBar({
  product,
  targetRef,
  quantity,
  onQuantity,
  onAdd,
  onBuyNow,
  buying,
  added,
}: {
  product: Product;
  targetRef: RefObject<HTMLElement | null>;
  quantity: number;
  onQuantity: (value: number) => void;
  onAdd: () => void;
  onBuyNow: () => void;
  buying: boolean;
  added: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const soldOut = product.stock <= 0;
  const maxQty = Math.max(1, Math.min(product.stock, 20));

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), {
      threshold: 0.05,
      rootMargin: "0px 0px -10% 0px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef, product.slug]);

  return (
    <div className="sticky-buy-bar no-print" data-visible={visible} aria-hidden={!visible}>
      <div className="sticky-buy-inner">
        <span className="relative hidden size-11 shrink-0 overflow-hidden rounded-xl border border-line-soft bg-white sm:block">
          <Image src={product.images[0] ?? "/images/col-cells.jpg"} alt="" fill sizes="44px" className="object-cover" />
        </span>
        <div className="hidden min-w-0 flex-1 md:block">
          <p className="truncate text-[0.78rem] font-semibold">{product.name}</p>
          <p className="mt-0.5 text-[0.65rem] text-muted">{product.sku} · {soldOut ? "Out of stock" : `${product.stock} available`}</p>
        </div>
        <div className="flex h-9 shrink-0 items-center rounded-full border border-line bg-white">
          <button type="button" tabIndex={visible ? 0 : -1} disabled={quantity <= 1 || soldOut} onClick={() => onQuantity(Math.max(1, quantity - 1))} aria-label="Decrease quantity" className="grid size-8 place-items-center rounded-full disabled:opacity-30"><Minus size={12} /></button>
          <span className="w-5 text-center text-xs font-semibold tabular-nums">{quantity}</span>
          <button type="button" tabIndex={visible ? 0 : -1} disabled={quantity >= maxQty || soldOut} onClick={() => onQuantity(Math.min(maxQty, quantity + 1))} aria-label="Increase quantity" className="grid size-8 place-items-center rounded-full disabled:opacity-30"><Plus size={12} /></button>
        </div>
        <div className="min-w-0 text-right">
          <p className="hidden text-[0.6rem] text-muted sm:block">{quantity} × {formatBDT(product.price)}</p>
          <p className="text-[0.95rem] font-bold leading-tight tabular-nums">{formatBDT(product.price * quantity)}</p>
        </div>
        {!soldOut && (
          <>
            <button type="button" tabIndex={visible ? 0 : -1} onClick={onAdd} aria-label={added ? "Added to bag" : "Add to bag"} className="btn btn-primary h-10 shrink-0 gap-1.5 px-3 text-[0.75rem] sm:px-4">
              <ShoppingBag size={14} /> {added ? "Added" : <><span className="max-[359px]:sr-only sm:hidden">Add</span><span className="hidden sm:inline">Add to bag</span></>}
            </button>
            <button type="button" tabIndex={visible ? 0 : -1} disabled={buying} onClick={onBuyNow} className="btn btn-buy h-10 min-w-0 flex-1 gap-1.5 px-3 text-[0.8rem] sm:flex-none sm:px-5">
              {buying ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} className="fill-current" />} Buy now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
