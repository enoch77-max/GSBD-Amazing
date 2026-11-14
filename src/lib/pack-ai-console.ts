/**
 * Battery Pack Builder AI — merchant console model.
 *
 * The storefront engine (`pack-recommendations.ts`) owns scoring weights.
 * This module owns the *rules the merchant manages*: which chemistries are
 * sellable, hard series/parallel guardrails, BMS auto-matching, and the add-on
 * recipe cards shown by the smart suggestion rail. It is deliberately pure so
 * the simulator and the console share exactly one source of truth.
 */
import { PACK_CELLS, calculatePack, type CellId, type PackConfiguration, type PackResult, type PackSuggestion } from "@/lib/pack-builder";
import { rankPackAddOns } from "@/lib/pack-recommendations";

export type PackChemistryId = "li-ion-18650" | "li-ion-21700" | "lifepo4" | "lipo";

export type PackChemistryCard = {
  id: PackChemistryId;
  label: string;
  detail: string;
  cellId: CellId | null;
  active: boolean;
  voltageRange: string;
  capacityRange: string;
};

export type PackAddOnRule = {
  id: string;
  label: string;
  trigger: string;
  suggests: string[];
  enabled: boolean;
  /** Category slugs used to measure the real attach rate from builder orders. */
  categorySlugs: string[];
};

export type PackAiConsole = {
  chemistries: PackChemistryCard[];
  seriesMin: number;
  seriesMax: number;
  parallelMin: number;
  parallelMax: number;
  autoMatchBms: boolean;
  enforceLimits: boolean;
  autoOptimize: boolean;
  bundleDiscountPct: number;
  addOns: PackAddOnRule[];
};

export const DEFAULT_PACK_AI: PackAiConsole = {
  chemistries: [
    { id: "li-ion-18650", label: "Li-ion 18650", detail: "Samsung 30Q · 3.0Ah · 15A", cellId: "18650", active: true, voltageRange: "12–48V", capacityRange: "3–30Ah" },
    { id: "li-ion-21700", label: "Li-ion 21700", detail: "Molice P42A · 4.2Ah · 30A", cellId: "21700", active: true, voltageRange: "12–60V", capacityRange: "4–40Ah" },
    { id: "lifepo4", label: "LiFePO4", detail: "32700 · 6Ah · 18A · 12/24/48V", cellId: "lifepo4-32700", active: true, voltageRange: "12.8–51.2V", capacityRange: "6–60Ah" },
    { id: "lipo", label: "LiPo pouch", detail: "Quoted per cell · high burst", cellId: null, active: false, voltageRange: "11.1–44.4V", capacityRange: "5–20Ah" },
  ],
  seriesMin: 3,
  seriesMax: 16,
  parallelMin: 1,
  parallelMax: 10,
  autoMatchBms: true,
  enforceLimits: true,
  autoOptimize: true,
  bundleDiscountPct: 5,
  addOns: [
    { id: "bms", label: "Matching BMS board", trigger: "Any 3S+ pack without a BMS", suggests: ["Matching BMS board", "Balance leads harness"], enabled: true, categorySlugs: ["bms-circuits"] },
    { id: "nickel", label: "Pure nickel strips", trigger: "Pack needs spot-welded busbars", suggests: ["Pure nickel strip 0.15 × 8 mm", "Cell insulation rings"], enabled: true, categorySlugs: ["diy-prototyping"] },
    { id: "shrink", label: "Heat shrink + caps", trigger: "Enclosure not added to the build", suggests: ["Heat-shrink wrap", "End caps + foam padding"], enabled: true, categorySlugs: ["tools-safety"] },
    { id: "charger", label: "Smart charger", trigger: "Charge voltage 12–60V", suggests: ["Smart charger matched to pack voltage"], enabled: true, categorySlugs: ["ups-power"] },
    { id: "welder", label: "Spot welder", trigger: "Loose cells added for DIY", suggests: ["Spot welder for 0.15 mm nickel"], enabled: true, categorySlugs: ["tools-safety"] },
    { id: "balancer", label: "Active balancer", trigger: "Series ≥ 4 with a passive BMS", suggests: ["5A active balancer"], enabled: true, categorySlugs: ["bms-circuits"] },
  ],
};

const CHEMISTRY_IDS: PackChemistryId[] = ["li-ion-18650", "li-ion-21700", "lifepo4", "lipo"];
const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

/** Storage must never be able to corrupt the console or the simulator. */
export function sanitizePackAi(input: unknown): PackAiConsole {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<PackAiConsole>;
  const saved = new Map<PackChemistryId, PackChemistryCard>();
  if (Array.isArray(raw.chemistries)) {
    for (const entry of raw.chemistries) {
      if (entry && CHEMISTRY_IDS.includes(entry.id)) saved.set(entry.id, entry);
    }
  }
  const chemistries = DEFAULT_PACK_AI.chemistries.map((fallback) => {
    const entry = saved.get(fallback.id);
    return entry ? { ...fallback, active: entry.active === true } : { ...fallback };
  });
  if (!chemistries.some((entry) => entry.active)) chemistries[0].active = true;

  const addOns = DEFAULT_PACK_AI.addOns.map((fallback) => {
    const entry = Array.isArray(raw.addOns) ? raw.addOns.find((candidate) => candidate?.id === fallback.id) : undefined;
    if (!entry) return { ...fallback };
    const suggests = Array.isArray(entry.suggests)
      ? entry.suggests.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim().slice(0, 80)).slice(0, 4)
      : fallback.suggests;
    return {
      ...fallback,
      enabled: entry.enabled !== false,
      suggests: suggests.length ? suggests : fallback.suggests,
      trigger: typeof entry.trigger === "string" && entry.trigger.trim() ? entry.trigger.trim().slice(0, 90) : fallback.trigger,
    };
  });

  return {
    chemistries,
    seriesMin: clampInt(raw.seriesMin, 1, 24, DEFAULT_PACK_AI.seriesMin),
    seriesMax: clampInt(raw.seriesMax, 1, 24, DEFAULT_PACK_AI.seriesMax),
    parallelMin: clampInt(raw.parallelMin, 1, 20, DEFAULT_PACK_AI.parallelMin),
    parallelMax: clampInt(raw.parallelMax, 1, 20, DEFAULT_PACK_AI.parallelMax),
    autoMatchBms: raw.autoMatchBms !== false,
    enforceLimits: raw.enforceLimits !== false,
    autoOptimize: raw.autoOptimize !== false,
    bundleDiscountPct: clampInt(raw.bundleDiscountPct, 0, 30, DEFAULT_PACK_AI.bundleDiscountPct),
    addOns,
  };
}

/* ------------------------------------------------------------------ */
/* Simulator                                                          */
/* ------------------------------------------------------------------ */

export const SIM_VOLTAGES = [12, 24, 36, 48, 60, 72] as const;
export const SIM_CAPACITIES = [5, 10, 15, 20, 30] as const;

export type SimulatorChoice = { chemistry: PackChemistryId; voltage: number; capacityAh: number; loadA: number };

export type SimulatorAddOn = { slug: string; name: string; price: number; discounted: number; reason: string; recommended: boolean };

export type SimulatorOutput = {
  ok: boolean;
  guardrail?: string;
  chemistry: PackChemistryCard;
  config?: PackConfiguration;
  result?: PackResult;
  suggestions: SimulatorAddOn[];
  addOnTotal: number;
  addOnDiscounted: number;
  grandTotal: number;
  saving: number;
  autoMatchedBms: boolean;
};

/**
 * Turns a voltage/capacity request into the nearest legal series/parallel
 * configuration, applies the merchant guardrails, then runs the real quote and
 * add-on ranking so the preview matches the storefront to the taka.
 */
export function simulatePack(choice: SimulatorChoice, console: PackAiConsole, catalogue: Parameters<typeof calculateCatalogue>[0]): SimulatorOutput {
  const chemistry = console.chemistries.find((entry) => entry.id === choice.chemistry) ?? console.chemistries[0];
  const base: SimulatorOutput = {
    ok: false, chemistry, suggestions: [], addOnTotal: 0, addOnDiscounted: 0, grandTotal: 0, saving: 0, autoMatchedBms: console.autoMatchBms,
  };
  if (!chemistry.active) return { ...base, guardrail: `${chemistry.label} is switched off for new builds. Enable it in Pack rules to quote it.` };
  if (!chemistry.cellId) return { ...base, guardrail: `${chemistry.label} is quoted by the workshop — no automatic cell/BMS match is published.` };

  const cell = PACK_CELLS[chemistry.cellId];
  const series = Math.max(1, Math.round(choice.voltage / cell.nominalVoltage));
  const parallel = Math.max(1, Math.ceil(choice.capacityAh / cell.capacityAh));
  if (console.enforceLimits && (series < console.seriesMin || series > console.seriesMax || parallel < console.parallelMin || parallel > console.parallelMax)) {
    return { ...base, guardrail: `Guardrail: ${series}S${parallel}P is outside your allowed ${console.seriesMin}S–${console.seriesMax}S / ${console.parallelMin}P–${console.parallelMax}P range.` };
  }

  let result: PackResult;
  try {
    result = calculateCatalogue(catalogue, { cellId: chemistry.cellId, series, parallel, loadCurrentA: Math.max(1, choice.loadA) });
  } catch {
    return { ...base, guardrail: "This configuration cannot be quoted with the current catalogue. Check cell and BMS stock." };
  }

  const enabled = new Set(console.addOns.filter((rule) => rule.enabled).map((rule) => rule.id));
  const ranked = rankAddOns(result, catalogue, console);
  const suggestions: SimulatorAddOn[] = [];
  for (const entry of ranked) {
    const rule = console.addOns.find((candidate) => candidate.id === ruleForSlug(candidate, entry.product.categorySlug));
    if (!rule || !enabled.has(rule.id)) continue;
    suggestions.push({
      slug: entry.product.slug,
      name: entry.product.name,
      price: entry.product.price,
      discounted: Math.round(entry.product.price * (1 - console.bundleDiscountPct / 100)),
      reason: entry.reason,
      recommended: entry.recommended,
    });
    if (suggestions.length >= 3) break;
  }
  if (console.autoOptimize) suggestions.sort((a, b) => Number(b.recommended) - Number(a.recommended));

  const addOnTotal = suggestions.reduce((sum, entry) => sum + entry.price, 0);
  const addOnDiscounted = suggestions.reduce((sum, entry) => sum + entry.discounted, 0);
  return {
    ok: true,
    chemistry,
    config: { cellId: chemistry.cellId, series, parallel, loadCurrentA: choice.loadA },
    result,
    suggestions,
    addOnTotal,
    addOnDiscounted,
    grandTotal: result.price + addOnDiscounted,
    saving: addOnTotal - addOnDiscounted,
    autoMatchedBms: console.autoMatchBms,
  };
}

/* Late imports keep the type surface above readable and avoid a cycle at load time. */
type Catalogue = Array<{ slug: string; name: string; price: number; stock: number; images: string[]; categorySlug?: string; brand?: string; id?: number }>;
type ScoredRank = PackSuggestion & { recommended: boolean; reason: string };

function calculateCatalogue(catalogue: Catalogue, config: PackConfiguration): PackResult {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return calculatePack(config, { products: catalogue });
}
function rankAddOns(result: PackResult, catalogue: Catalogue, consoleState: PackAiConsole): ScoredRank[] {
  const map = rankPackAddOns(result, catalogue, consoleState);
  return [...map.values()] as ScoredRank[];
}
function ruleForSlug(rule: PackAddOnRule, categorySlug?: string): string {
  return rule.categorySlugs.includes(categorySlug ?? "") ? rule.id : "";
}

/** Real attach rate from the order book, per rule category. */
export function attachRateForRule(rule: PackAddOnRule, builderOrders: Array<{ items: Array<{ slug: string }> }>, categoryOf: (slug: string) => string): number {
  if (!builderOrders.length) return 0;
  const attached = builderOrders.filter((order) => order.items.some((item) => rule.categorySlugs.includes(categoryOf(item.slug)))).length;
  return Math.round((attached / builderOrders.length) * 100);
}
