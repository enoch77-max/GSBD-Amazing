"use client";

/**
 * Storefront visual language — one geometry for every icon.
 * 24×24 grid · 1.6 stroke · round caps and joins · currentColor only.
 * Category art uses the same stroke, filled at low opacity so it reads as a
 * soft printed shape rather than decoration.
 */
import type { CategoryKey, QualityIndicator } from "@/lib/product-quality";
import { categoryTone } from "@/lib/product-quality";

export type GlyphName =
  | "shield" | "beaker" | "seal" | "list" | "star" | "cycle" | "bolt" | "battery"
  | "board" | "wave" | "grid" | "spark" | "check" | "cross" | "truck" | "scale" | "zoom" | "pin" | "minus" | "plus" | "bag" | "left" | "right" | "close";

const PATHS: Record<GlyphName, React.ReactNode> = {
  shield: <><path d="M12 3.2 5 6v6.1c0 4 2.9 7.1 7 8.7 4.1-1.6 7-4.7 7-8.7V6l-7-2.8Z" /><path d="m8.8 12.1 2.2 2.2 4.3-4.4" /></>,
  beaker: <><path d="M9 3.5h6" /><path d="M10 3.5v5.2L5.9 17a2.3 2.3 0 0 0 2 3.4h8.2a2.3 2.3 0 0 0 2-3.4L14 8.7V3.5" /><path d="M7.4 14.4h9.2" /></>,
  seal: <><path d="M12 3.2l2 1.5 2.5-.2.9 2.3 2 1.5-.7 2.4.7 2.4-2 1.5-.9 2.3-2.5-.2-2 1.5-2-1.5-2.5.2-.9-2.3-2-1.5.7-2.4-.7-2.4 2-1.5.9-2.3 2.5.2 2-1.5Z" /><path d="m9 12 2 2 4-4" /></>,
  list: <><path d="M4.5 7h9M4.5 12h9M4.5 17h6" /><path d="m17 6.4 1.2 1.2 2.3-2.4M17 15.4l1.2 1.2 2.3-2.4" /></>,
  star: <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.8-5.3-2.8-5.3 2.8 1.1-5.8L3.5 9.8l5.9-.8L12 3.6Z" />,
  cycle: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4.2v4.6h-4.6" /></>,
  bolt: <path d="M13.2 2.8 5.4 13.4h5l-1.6 7.8 7.8-10.6h-5l1.6-7.8Z" />,
  battery: <><rect x="2.8" y="7.4" width="15" height="9.2" rx="2.2" /><path d="M20.8 10.4v3.2" /><path d="M6.4 10.6v3.2M10 10.6v3.2M13.6 10.6v3.2" /></>,
  board: <><rect x="4" y="4" width="16" height="16" rx="2.4" /><path d="M7.6 7.6h4.2v4.2H7.6z" /><path d="M14.6 7.6h2M14.6 11.8h2M7.6 14.8h9M7.6 17.4h5.4" /></>,
  wave: <path d="M2.8 13.4c2.2-6 4.4-6 6.6 0s4.4 6 6.6 0 4.4-6 5.2-1.8" />,
  grid: <><rect x="3.4" y="3.4" width="7" height="7" rx="1.4" /><rect x="13.6" y="3.4" width="7" height="7" rx="1.4" /><rect x="3.4" y="13.6" width="7" height="7" rx="1.4" /><rect x="13.6" y="13.6" width="7" height="7" rx="1.4" /></>,
  spark: <><path d="M11 3 12.8 9 19 10.8 12.8 12.6 11 19l-1.8-6.4L3 10.8 9.2 9 11 3Z" /><path d="M18.4 15.6v4M16.4 17.6h4" /></>,
  check: <path d="m4.5 12.4 4.8 4.8L19.5 7" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  truck: <><path d="M2.8 7h10v9h-10z" /><path d="M12.8 10.4h4l3.4 3v2.6h-7.4" /><circle cx="6.4" cy="18.2" r="1.6" /><circle cx="16.6" cy="18.2" r="1.6" /></>,
  scale: <><path d="M12 4.4v15.2M6 19.6h12" /><path d="M4 9.2h16" /><path d="M7.6 9.2 5 14.2h5.2L7.6 9.2ZM16.4 9.2l-2.6 5h5.2l-2.6-5Z" /></>,
  zoom: <><circle cx="11" cy="11" r="6.2" /><path d="m15.8 15.8 4.2 4.2M8.6 11h4.8M11 8.6v4.8" /></>,
  pin: <><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bag: <><path d="M5.6 8h12.8l1.1 11.2a1.8 1.8 0 0 1-1.8 2H6.3a1.8 1.8 0 0 1-1.8-2L5.6 8Z" /><path d="M9 8V6.6a3 3 0 0 1 6 0V8" /></>,
  left: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  right: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
};

const INDICATOR_GLYPH: Record<QualityIndicator["id"], GlyphName> = {
  warranty: "shield", tested: "beaker", genuine: "seal", specs: "list", reviews: "star", cycle: "cycle",
};

export function Glyph({ name, size = 18, strokeWidth = 1.6, className }: { name: GlyphName; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      {PATHS[name]}
    </svg>
  );
}

const CATEGORY_GLYPH: Record<CategoryKey, GlyphName> = {
  "battery-cells": "battery", "battery-packs": "bolt", "bms-circuits": "board",
  "ups-power": "wave", "diy-prototyping": "grid", "tools-safety": "spark", default: "spark",
};

export function CategoryGlyph({ slug, size = 18 }: { slug: string; size?: number }) {
  return <Glyph name={CATEGORY_GLYPH[(slug as CategoryKey)] ?? "spark"} size={size} />;
}

/** Soft printed backdrop: same stroke language, 6–12% fill, four geometry families. */
export function CategoryBackdrop({ slug, className }: { slug: string; className?: string }) {
  const tone = categoryTone(slug);
  const shape = tone.shape;
  return (
    <svg viewBox="0 0 240 180" className={className} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      <g fill={tone.ink} fillOpacity="0.055" stroke={tone.ink} strokeOpacity="0.16" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {shape === "cells" && (
          <>
            <circle cx="196" cy="34" r="46" />
            <rect x="18" y="96" width="34" height="76" rx="10" transform="rotate(-8 35 134)" />
            <rect x="60" y="84" width="34" height="88" rx="10" transform="rotate(-8 77 128)" />
            <path d="M150 148c18-30 44-38 74-26" fill="none" />
          </>
        )}
        {shape === "packs" && (
          <>
            <path d="M168 22l34 20v40l-34 20-34-20V42l34-20Z" />
            <path d="M186 66l-18 26h16l-8 26 26-34h-16l10-18h-10Z" fill={tone.ink} fillOpacity="0.12" stroke="none" />
            <path d="M8 132h74M8 150h52" fill="none" />
          </>
        )}
        {shape === "circuits" && (
          <>
            <path d="M20 36h58v34h44M28 148h48v-30h52M150 26v52h54" fill="none" />
            <circle cx="78" cy="70" r="5" /><circle cx="76" cy="118" r="5" /><circle cx="150" cy="78" r="5" />
            <rect x="150" y="112" width="62" height="44" rx="8" />
          </>
        )}
        {shape === "power" && (
          <>
            <path d="M4 120c22-44 40-44 62 0s40 44 62 0 40-44 62 0" fill="none" />
            <path d="M4 146c22-30 40-30 62 0s40 30 62 0 40-30 62 0" fill="none" />
            <circle cx="196" cy="44" r="26" />
          </>
        )}
        {shape === "diy" && (
          <>
            <path d="M26 26h30v30H26zM70 26h30v30H70zM26 70h30v30H26zM114 26h30v30h-30zM70 70h30v30H70z" />
            <path d="M160 62h56v62h-56zM172 78h20M172 92h30M172 106h14" fill="none" />
          </>
        )}
        {shape === "tools" && (
          <>
            <path d="M150 22l16 40-22-12-8 24-24-52 38 24 0-24Z" fill={tone.ink} fillOpacity="0.1" />
            <path d="M18 140c26-8 46-8 72 0M18 158c30-10 54-10 84 0" fill="none" />
            <circle cx="200" cy="128" r="22" />
          </>
        )}
        {shape === "default" && <><circle cx="60" cy="60" r="34" /><circle cx="170" cy="120" r="44" /></>}
      </g>
    </svg>
  );
}

export function QualityBadge({ indicator, compact = false }: { indicator: QualityIndicator; compact?: boolean }) {
  return (
    <span className="pq-badge" title={indicator.detail}>
      <Glyph name={INDICATOR_GLYPH[indicator.id]} size={compact ? 13 : 15} />
      <span>{indicator.label}</span>
    </span>
  );
}

export function indicatorGlyph(id: QualityIndicator["id"]): GlyphName {
  return INDICATOR_GLYPH[id];
}
