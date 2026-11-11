"use client";

import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { CartLine } from "@/lib/cart";
import { cn, formatBDT } from "@/lib/format";
import { productLabel } from "@/lib/product-copy";
import { PackBreakdown } from "@/components/pack-breakdown";

/** One selection and editing UI for both mobile and desktop order summaries. */
export function CheckoutItems({ lines, excluded, onToggle, onSelectAll, onDeselectAll, onQuantity, onRemove, disabled }: {
  lines: CartLine[];
  excluded: Set<string>;
  onToggle: (slug: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onQuantity: (slug: string, qty: number) => void;
  onRemove: (line: CartLine) => void;
  disabled: boolean;
}) {
  const selectedCount = lines.filter((line) => !excluded.has(line.slug)).length;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line-soft pb-2">
        <span className="text-[0.72rem] font-medium text-muted">{selectedCount} of {lines.length} products selected</span>
        <div className="flex items-center gap-2 text-[0.72rem] font-semibold">
          <button type="button" onClick={onSelectAll} disabled={disabled || selectedCount === lines.length} className="text-ink hover:underline disabled:opacity-40">Select all</button>
          <span className="text-line">/</span>
          <button type="button" onClick={onDeselectAll} disabled={disabled || selectedCount === 0} className="text-muted hover:text-ink hover:underline disabled:opacity-40">Deselect all</button>
        </div>
      </div>
      <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto pr-1 lg:max-h-[28rem]">
        {lines.map((line) => {
          const selected = !excluded.has(line.slug);
          const maxQty = line.stock > 0 ? Math.max(1, Math.min(line.stock, 20)) : 99;
          return (
            <li key={line.slug} className={cn("rounded-xl border p-2.5 transition-colors", selected ? "border-line-soft bg-white" : "border-line-soft bg-bone/60")}>
              <div className="flex items-start gap-2.5">
                <input type="checkbox" checked={selected} onChange={() => onToggle(line.slug)} disabled={disabled} aria-label={`Buy ${productLabel(line.slug, line.name)}`} className="mt-3 size-[18px] shrink-0 cursor-pointer accent-[#78a929] disabled:cursor-not-allowed" />
                <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-bone"><Image src={line.image} alt="" fill sizes="48px" className="object-cover" /></span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[0.78rem] font-semibold leading-snug", !selected && "text-muted")}>{productLabel(line.slug, line.name)}</p>
                  <p className="mt-0.5 text-[0.68rem] text-muted">{formatBDT(line.price)} each</p>
                </div>
                <button type="button" onClick={() => onRemove(line)} disabled={disabled} aria-label={`Remove ${productLabel(line.slug, line.name)} from bag`} title="Remove from bag" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-ember/10 hover:text-ember disabled:opacity-40"><Trash2 size={15} /></button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 pl-7">
                <div className="flex h-9 items-center rounded-full border border-line bg-white">
                  <button type="button" onClick={() => onQuantity(line.slug, line.qty - 1)} disabled={disabled || line.qty <= 1} aria-label={`Decrease quantity of ${productLabel(line.slug, line.name)}`} className="grid size-9 place-items-center rounded-full hover:bg-bone disabled:opacity-35"><Minus size={13} /></button>
                  <span className="w-7 text-center text-xs font-semibold tabular-nums" aria-live="polite">{line.qty}</span>
                  <button type="button" onClick={() => onQuantity(line.slug, line.qty + 1)} disabled={disabled || line.qty >= maxQty} aria-label={`Increase quantity of ${productLabel(line.slug, line.name)}`} className="grid size-9 place-items-center rounded-full hover:bg-bone disabled:opacity-35"><Plus size={13} /></button>
                </div>
                <span className={cn("text-[0.85rem] font-semibold tabular-nums", !selected && "text-muted")}>{formatBDT(line.price * line.qty)}</span>
              </div>
              {line.customPack && <div className="pl-7"><PackBreakdown line={line} /></div>}
            </li>
          );
        })}
      </ul>
      {selectedCount === 0 && <p role="status" className="mt-2 rounded-lg bg-bone px-3 py-2 text-xs text-muted">Select at least one product to place an order. Nothing has been removed from your bag.</p>}
    </div>
  );
}