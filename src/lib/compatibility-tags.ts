/**
 * Battery Builder compatibility tags.
 *
 * Tags travel with the existing product `highlights` JSON array using a
 * reserved marker. This keeps the preview and the Drizzle product row in sync
 * without a second source of product identity. The marker is stripped from
 * storefront highlights and exposed to the pack-builder catalogue separately.
 */
import type { PackConfiguration } from "@/lib/pack-builder";

const CELL_PROFILE = {
  "18650": { chemistry: "li-ion", nominal: 3.6, charge: 4.2, label: "18650" },
  "21700": { chemistry: "li-ion", nominal: 3.6, charge: 4.2, label: "21700" },
  "lifepo4-32700": { chemistry: "lifepo4", nominal: 3.2, charge: 3.65, label: "32700" },
} as const;

export const COMPATIBILITY_PREFIX = "__builder_compat__:";

export const COMPATIBILITY_PRESETS = [
  "18650", "21700", "Li-ion", "LiFePO4", "12V", "24V", "36V", "48V", "Solar", "UPS", "DIY", "High current",
] as const;

export function normalizeCompatibilityTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function readCompatibilityTags(highlights: string[] | null | undefined): string[] {
  if (!Array.isArray(highlights)) return [];
  return [...new Set(highlights
    .filter((value) => value.startsWith(COMPATIBILITY_PREFIX))
    .map((value) => normalizeCompatibilityTag(value.slice(COMPATIBILITY_PREFIX.length)))
    .filter(Boolean))];
}

export function visibleHighlights(highlights: string[] | null | undefined): string[] {
  return (Array.isArray(highlights) ? highlights : []).filter((value) => !value.startsWith(COMPATIBILITY_PREFIX));
}

export function withCompatibilityTags(highlights: string[], tags: string[]): string[] {
  const visible = visibleHighlights(highlights).slice(0, 8);
  const encoded = [...new Set(tags.map(normalizeCompatibilityTag).filter(Boolean))]
    .slice(0, 16)
    .map((tag) => `${COMPATIBILITY_PREFIX}${tag}`);
  // The DB column caps public product highlights at eight. Reserve the extra
  // array capacity for at most 16 compatibility tokens; public copy stays eight.
  return [...visible, ...encoded];
}

function token(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, ""); }

/**
 * True when an explicitly tagged product matches this configured battery.
 * An empty tag list is intentionally not a match: only tagged stock gets this
 * extra Builder discovery path; existing curated rules remain authoritative.
 */
export function compatibilityMatch(tags: string[], config: PackConfiguration): string | null {
  if (!tags.length) return null;
  const cell = CELL_PROFILE[config.cellId];
  const chemistry = cell.chemistry;
  const series = Math.max(1, Math.floor(config.series));
  const parallel = Math.max(1, Math.floor(config.parallel));
  const standardSeries = chemistry === "lifepo4"
    ? ({ 4: 12, 8: 24, 12: 36, 16: 48 } as Record<number, number>)[series]
    : ({ 3: 12, 7: 24, 10: 36, 13: 48 } as Record<number, number>)[series];
  const context = new Set([
    token(config.cellId), token(chemistry), token("battery"), token("battery pack"), token("universal"), token("all packs"), token("DIY"),
    token(`${series}s`), token(`${parallel}p`), token(`${series}s${parallel}p`),
    token(`${Math.round(cell.nominal * series)}v`),
    token(`${Math.round(cell.charge * series)}v`),
    ...(standardSeries ? [token(`${standardSeries}v`)] : []),
    ...(chemistry === "lifepo4" && [4, 8].includes(series) ? [token("solar")] : []),
    ...(standardSeries && standardSeries <= 24 ? [token("ups")] : []),
    ...(Number(config.loadCurrentA ?? 0) >= 10 ? [token("high current")] : []),
    token(cell.label),
  ]);
  for (const tag of tags) {
    const normalized = token(tag);
    if (context.has(normalized)) return tag;
    // Include shorthand chemistry and cell-form tags while keeping 21700 and
    // LiFePO4 distinct rather than fuzzy-matching unrelated voltage numbers.
    if (normalized === "liion" && chemistry === "li-ion") return tag;
    if (normalized === "lifepo4" && chemistry === "lifepo4") return tag;
    if (normalized === token(config.cellId)) return tag;
    if (normalized === `${series}s` || normalized === `${series}s${parallel}p`) return tag;
  }
  return null;
}
