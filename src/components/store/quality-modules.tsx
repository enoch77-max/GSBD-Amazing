"use client";

/**
 * At-a-glance product proof. Only fields in the product record can appear here;
 * no competitor rankings or hypothetical device-compatibility verdicts.
 */
import { useState } from "react";
import type { Product } from "@/db/schema";
import { genuineConfirmed, qualityIndicators, specChips, type QualityIndicator } from "@/lib/product-quality";
import { Glyph, indicatorGlyph } from "./store-visuals";

/**
 * Product proof, ordered like the card: authenticity is the single accented
 * claim; everything else is a quiet, tappable line of supporting evidence.
 */
export function QualityRail({ product }: { product: Product }) {
  const [open, setOpen] = useState<QualityIndicator["id"] | "genuine" | null>(null);
  const genuine = genuineConfirmed(product);
  const supporting = qualityIndicators(product).filter((indicator) => indicator.id === "warranty" || indicator.id === "tested");
  if (!genuine && !supporting.length) return null;
  const detail = open === "genuine" ? "Confirmed as an original item by the seller." : supporting.find((item) => item.id === open)?.detail;
  return (
    <section aria-label="Product assurance" className="pq-proof">
      <div className="pq-proof-row">
        {genuine && (
          <button type="button" className="pq-proof-genuine" aria-expanded={open === "genuine"} onClick={() => setOpen((current) => current === "genuine" ? null : "genuine")}>
            <Glyph name="shield" size={14} />{genuine}
          </button>
        )}
        {supporting.map((indicator) => (
          <button key={indicator.id} type="button" className="pq-proof-note" aria-expanded={open === indicator.id} onClick={() => setOpen((current) => current === indicator.id ? null : indicator.id)}>
            <Glyph name={indicatorGlyph(indicator.id)} size={14} />{indicator.label}
          </button>
        ))}
      </div>
      {detail && <p className="pq-proof-detail">{detail}</p>}
    </section>
  );
}

export function SpecChipRow({ product, limit = 4 }: { product: Product; limit?: number }) {
  const chips = specChips(product, limit);
  if (!chips.length) return null;
  return (
    <section aria-label="Key product specifications" className="pq-spec-summary">
      <p className="pq-eyebrow">Key specs</p>
      <div className="pq-chips">
        {chips.map((chip) => (
          <span key={`${chip.raw.label}-${chip.raw.value}`} className="pq-chip" title={`${chip.raw.label}: ${chip.raw.value}`}>
            <span>{chip.raw.label}</span><b>{chip.raw.value}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
