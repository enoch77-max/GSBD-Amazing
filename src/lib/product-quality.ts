/**
 * Evidence-backed product presentation. Category colour, compact spec chips,
 * and trust cues derive solely from fields edited by the owner. No cross-SKU
 * value scoring, hypothetical device verdicts, or photo pins.
 */
import type { Product } from "@/db/schema";
import { readPresentation } from "@/lib/product-presentation";

export type Spec = { label: string; value: string };
export type QualityIndicator = {
  id: "warranty" | "tested" | "genuine" | "specs" | "reviews" | "cycle";
  label: string;
  detail: string;
};
export type SpecChip = { label: string; value: string; raw: Spec };

/* ------------------------------------------------------------------ */
/* Category language                                                   */
/* ------------------------------------------------------------------ */

export type CategoryKey = "battery-cells" | "battery-packs" | "bms-circuits" | "ups-power" | "diy-prototyping" | "tools-safety" | "default";

export const CATEGORY_TONE: Record<CategoryKey, { ink: string; tint: string; line: string; unit: string; shape: string }> = {
  "battery-cells": { ink: "#3f6212", tint: "#f2fadf", line: "#cfe4a8", unit: "cell", shape: "cells" },
  "battery-packs": { ink: "#9a3412", tint: "#fff3ec", line: "#ffd3bd", unit: "pack", shape: "packs" },
  "bms-circuits": { ink: "#1d4ed8", tint: "#eef4ff", line: "#c9dbff", unit: "board", shape: "circuits" },
  "ups-power": { ink: "#5b21b6", tint: "#f4f0ff", line: "#ddd2ff", unit: "unit", shape: "power" },
  "diy-prototyping": { ink: "#0f766e", tint: "#eafaf7", line: "#bfe9e2", unit: "board", shape: "diy" },
  "tools-safety": { ink: "#92400e", tint: "#fff8e8", line: "#f6dfb0", unit: "tool", shape: "tools" },
  default: { ink: "#334155", tint: "#f1f5f9", line: "#dbe3ec", unit: "item", shape: "default" },
};

export const categoryTone = (slug: string) => CATEGORY_TONE[(slug as CategoryKey)] ?? CATEGORY_TONE.default;

/** Priority spec labels per category — the four facts that decide this purchase. */
const CHIP_LABELS: Record<string, string[]> = {
  "battery-cells": ["Capacity", "Nominal voltage", "Max discharge", "Cycle life"],
  "battery-packs": ["Energy", "Continuous discharge current", "Configuration", "Cycle life"],
  "bms-circuits": ["Continuous current", "Configuration", "Peak current", "Connectivity"],
  "ups-power": ["Capacity", "Outputs", "Runtime", "Warranty"],
  "diy-prototyping": ["MCU", "Clock", "Wireless", "GPIO"],
  "tools-safety": ["Input", "Output", "Nickel", "Includes"],
};

const SHORT_LABEL: Record<string, string> = {
  "Nominal voltage": "Voltage",
  "Max discharge": "Discharge",
  "Continuous discharge current": "Discharge",
  "Continuous current": "Current",
  "Peak current": "Peak",
  "Cycle life": "Cycle life",
  "GPIO": "GPIO",
};

const compact = (value: string, max = 15) => {
  const head = value.split(/[;(·]/)[0].replace(/\s+/g, " ").trim();
  return head.length > max ? `${head.slice(0, max - 1).trimEnd()}…` : head;
};

/** 3–4 chips, in the order that category buyers care about. Falls back to the stored order. */
export function specChips(product: Pick<Product, "specs" | "categorySlug">, limit = 4): SpecChip[] {
  const priorities = CHIP_LABELS[product.categorySlug] ?? [];
  const used = new Set<string>();
  const chips: SpecChip[] = [];
  for (const label of priorities) {
    const found = product.specs.find((entry) => entry.label.toLowerCase().includes(label.toLowerCase()) && !used.has(entry.label));
    if (!found || !found.value.trim()) continue;
    used.add(found.label);
    chips.push({ label: SHORT_LABEL[found.label] ?? (found.label.length > 12 ? `${found.label.slice(0, 11)}…` : found.label), value: compact(found.value), raw: found });
    if (chips.length >= limit) return chips;
  }
  for (const entry of product.specs) {
    if (chips.length >= limit) break;
    if (used.has(entry.label) || !entry.value.trim()) continue;
    chips.push({ label: entry.label.length > 12 ? `${entry.label.slice(0, 11)}…` : entry.label, value: compact(entry.value), raw: entry });
  }
  return chips;
}

/* ------------------------------------------------------------------ */
/* Trust indicators (real data only)                                   */
/* ------------------------------------------------------------------ */

export function qualityIndicators(product: Pick<Product, "specs" | "warrantyMonths" | "highlights" | "rating" | "reviewCount" | "brand">): QualityIndicator[] {
  const out: QualityIndicator[] = [];
  if (product.warrantyMonths > 0) {
    out.push({ id: "warranty", label: `${product.warrantyMonths}-month warranty`, detail: "Covered by the workshop" });
  }
  const testLine = product.highlights.find((line) => /\btest(ed|ing)?\b/i.test(line));
  if (testLine) {
    out.push({ id: "tested", label: /batch/i.test(testLine) ? "Batch tested" : "Tested", detail: testLine });
  }
  if (product.specs.length >= 4) out.push({ id: "specs", label: `${product.specs.length} specs published`, detail: "Full datasheet on this page" });
  if (product.reviewCount >= 10 && product.rating > 0) out.push({ id: "reviews", label: `${product.rating.toFixed(1)}★ · ${product.reviewCount} buyers`, detail: "Customer reviews on this product" });
  if (product.specs.some((entry) => /cycle life/i.test(entry.label))) out.push({ id: "cycle", label: "Cycle-life rated", detail: "Capacity retention published" });
  return out;
}

/**
 * Card badges: at most three. Authenticity first, then the warranty promise,
 * then how the claim was proven. Buyer reviews render as their own rating
 * line on the card, so they are not duplicated here.
 */
export function cardIndicators(product: Parameters<typeof qualityIndicators>[0]): QualityIndicator[] {
  const order: QualityIndicator["id"][] = ["warranty", "tested"];
  const all = qualityIndicators(product);
  return order.map((id) => all.find((entry) => entry.id === id)).filter((entry): entry is QualityIndicator => Boolean(entry)).slice(0, 2);
}

/**
 * Authenticity is a seller attestation, never inferred from marketing copy.
 * It shows only when the owner has switched it on for this product.
 */
export function genuineConfirmed(product: Pick<Product, "highlights" | "brand">): string | null {
  if (!readPresentation(product.highlights).genuine) return null;
  const brand = product.brand.trim();
  return brand && brand.length <= 14 ? `Genuine ${brand}` : "Genuine product";
}

/**
 * One muted line under the title: the variant (owner badge) plus the leading
 * measured spec — or the spec alone when there is no variant. The line is
 * ellipsised rather than wrapped, so the card keeps one fixed row.
 */
export function cardMetaLine(product: Pick<Product, "badge" | "specs" | "categorySlug">): string[] {
  const fact = specChips(product, 1)[0]?.value.replace(/\s+/g, " ").trim() ?? "";
  const variant = product.badge?.trim() || "";
  return [variant, fact].filter((part): part is string => Boolean(part));
}

