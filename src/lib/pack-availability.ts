/** Pure inventory recovery. Price/stock remain authoritative at order time. */
import {
  BMS_HEADROOM, PACK_CELLS, PACK_LIMITS, PACK_OPTIONAL_EXTRAS, calculatePack,
  type CellId, type PackCatalogEntry, type PackConfiguration, type PackResult,
} from "./pack-builder";
import { assessPackLoad, formatRuntime, simulateLoad, withLoad, type LoadSpec } from "./pack-planning";
import { isStockedReadyPack, readReadyPackSpecs, type ReadyPackSpecs } from "./ready-pack-specs";

export type MatchPriority = "closest" | "price" | "runtime";
export const MATCH_PRIORITIES: Array<{ id: MatchPriority; label: string }> = [
  { id: "closest", label: "Closest to my build" },
  { id: "price", label: "Lower price" },
  { id: "runtime", label: "Meet my runtime target" },
];
export type MatchOptions = { priority?: MatchPriority; maxBudget?: number; quantity?: number };
export type CartReservation = { slug: string; qty: number; customPack?: PackConfiguration };

export type CustomAlternative = {
  config: PackConfiguration;
  result: PackResult;
  reason: string;
  changes: string[];
  warnings: string[];
  removedExtras: string[];
  runtimeH: number;
  meetsTarget: boolean;
  meetsCapacity: boolean;
  priceDelta: number | null;
  capacityDeltaPct: number;
  score: number;
  label: string;
};
export type ReadyPackAlternative = {
  product: PackCatalogEntry;
  voltage: number;
  chargeVoltage: number;
  capacityAh: number;
  continuousA: number;
  energyWh: number;
  estimatedRuntimeH: number;
  meetsTarget: boolean;
  meetsCapacity: boolean;
  reason: string;
  score: number;
  label: string;
  priceDelta: number | null;
  warnings: string[];
};
export type ReviewPack = { product: PackCatalogEntry; reasons: string[]; voltage: number | null };
export type PackAvailabilityAdvice = {
  triggered: boolean;
  unavailable: string[];
  custom: CustomAlternative[];
  ready: ReadyPackAlternative[];
  review: ReviewPack[];
  /** Legacy browse-only reference; never a direct replacement. */
  browseOnly: PackCatalogEntry | null;
  counts: { custom: number; ready: number; overBudget: number };
  targetHours: number;
  quantity: number;
  priority: MatchPriority;
  maxBudget: number | null;
};
const chemistry = (id: CellId) => id === "lifepo4-32700" ? "lifepo4" : "li-ion";
const round = (n: number) => Math.round(n * 10) / 10;
const units = (quantity: number | undefined) => Number.isFinite(quantity) ? Math.max(1, Math.min(20, Math.floor(quantity!))) : 1;
const loadValid = (load: LoadSpec) => load.mode === "A"
  ? Number.isFinite(load.amps) && load.amps > 0 && load.amps <= PACK_LIMITS.maxLoadCurrentA
  : Number.isFinite(load.watts) && load.watts > 0 && load.watts <= 5000;

/** Deduct both loose products and the complete BOM of bagged packs. This is a
 * local planning allowance, not a server-side stock reservation. */
export function inventoryForBuild(products: PackCatalogEntry[], cart: CartReservation[], editingSlug?: string | null): PackCatalogEntry[] {
  const used = new Map<string, number>();
  const add = (slug: string, qty: number) => used.set(slug, (used.get(slug) ?? 0) + qty);
  for (const line of cart) {
    if (line.slug === editingSlug || !Number.isFinite(line.qty) || line.qty <= 0) continue;
    const qty = Math.floor(line.qty);
    if (!line.customPack) { add(line.slug, qty); continue; }
    try {
      const quote = calculatePack(line.customPack, { products });
      for (const part of quote.components) if (part.slug) add(part.slug, qty * part.qty);
    } catch { /* Old malformed bag entries cannot be priced as a new build. */ }
  }
  return products.map((product) => ({ ...product, stock: product.visible === false || !Number.isFinite(product.stock)
    ? 0 : Math.max(0, Math.floor(product.stock) - (used.get(product.slug) ?? 0)) }));
}

export { assessPackLoad } from "./pack-planning";

function usablePrice(result: PackResult, products: Map<string, PackCatalogEntry>) {
  return result.components.every((part) => part.slug
    ? Boolean(products.get(part.slug)) && Number.isFinite(part.unitPrice) && part.unitPrice > 0
    : part.available && Number.isFinite(part.unitPrice) && part.unitPrice > 0);
}
function compareCustom(a: CustomAlternative, b: CustomAlternative, priority: MatchPriority) {
  if (priority === "price") return Number(b.meetsCapacity) - Number(a.meetsCapacity) || a.result.price - b.result.price || b.score - a.score || a.result.slug.localeCompare(b.result.slug);
  if (priority === "runtime") return Number(b.meetsTarget) - Number(a.meetsTarget) ||
    (a.meetsTarget && b.meetsTarget ? a.result.price - b.result.price : b.runtimeH - a.runtimeH) || b.score - a.score || a.result.slug.localeCompare(b.result.slug);
  return Number(b.meetsCapacity) - Number(a.meetsCapacity) || b.score - a.score || a.result.price - b.result.price || a.result.slug.localeCompare(b.result.slug);
}
function customWinners(pool: CustomAlternative[], priority: MatchPriority): CustomAlternative[] {
  const picked = new Map<string, CustomAlternative>();
  for (const goal of [priority, "closest", "price", "runtime"] as MatchPriority[]) {
    const winner = [...pool].sort((a, b) => compareCustom(a, b, goal))[0];
    if (!winner || picked.has(winner.result.slug)) continue;
    const label = goal === "closest" ? "Closest fit" : goal === "price" ? "Lower price"
      : winner.meetsTarget ? "Meets your runtime target" : "Longest available runtime";
    picked.set(winner.result.slug, { ...winner, label });
  }
  return [...picked.values()].slice(0, 3);
}

function readyMismatch(spec: ReadyPackSpecs, base: PackResult): string[] {
  const reasons = [...spec.issues];
  if (spec.chemistry && spec.chemistry !== chemistry(base.config.cellId)) reasons.push("Different chemistry; charger and protection settings are not interchangeable.");
  if (spec.series && spec.series !== base.config.series) reasons.push(`Different series count (${spec.series}S instead of ${base.config.series}S).`);
  if (spec.chargeVoltage && Math.abs(spec.chargeVoltage - base.chargeVoltage) > 0.15) reasons.push(`Different full-charge voltage (${round(spec.chargeVoltage)}V instead of ${base.chargeVoltage}V).`);
  return reasons;
}

export function findPackAvailability(result: PackResult, load: LoadSpec, targetHours: number, products: PackCatalogEntry[], options: MatchOptions = {}): PackAvailabilityAdvice {
  // Never rely on a caller's stale quote or hidden/non-finite inventory values.
  products = inventoryForBuild(products, []);
  result = calculatePack(result.config, { products });
  const base = result.config;
  const quantity = units(options.quantity);
  const priority = MATCH_PRIORITIES.some((item) => item.id === options.priority) ? options.priority! : "closest";
  const maxBudget = Number.isFinite(options.maxBudget) && options.maxBudget! > 0 ? options.maxBudget! : null;
  const target = Number.isFinite(targetHours) && targetHours > 0 ? targetHours : 4;
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const completeEstimate = usablePrice(result, bySlug);
  const safety = assessPackLoad(result, load);
  const triggered = !result.available || result.maxPacks < quantity || !safety.safe || !completeEstimate;
  const empty: PackAvailabilityAdvice = {
    triggered, unavailable: [], custom: [], ready: [], review: [], browseOnly: null,
    counts: { custom: 0, ready: 0, overBudget: 0 }, targetHours: target, quantity, priority, maxBudget,
  };
  if (!triggered) return empty;
  const unavailable = result.components.filter((part) => !part.available ||
    (part.slug && (bySlug.get(part.slug)?.stock ?? 0) < part.qty * quantity)).map((part) =>
    part.key === "bms" && !part.slug ? `No verified ${base.series}S BMS for this load.`
      : `${part.name}: need ${part.qty * quantity}, ${bySlug.get(part.slug ?? "")?.stock ?? 0} available for this build.`,
  );
  if (!safety.safe) unavailable.push(...safety.reasons);
  if (!completeEstimate) unavailable.push("One or more component prices need a workshop quote.");
  if (!loadValid(load)) return { ...empty, unavailable };
  const baseRuntime = simulateLoad(result, load);
  const wantedRuntime = baseRuntime.feasible && !baseRuntime.overContinuous ? baseRuntime.runtimeH : 0;
  const custom: CustomAlternative[] = [];

  for (const cellId of Object.keys(PACK_CELLS) as CellId[]) {
    // Do not change voltage or chemistry to get around an unavailable BMS.
    if (chemistry(cellId) !== chemistry(base.cellId)) continue;
    const series = base.series;
    const maxParallel = Math.min(PACK_LIMITS.maxParallel, Math.floor(PACK_LIMITS.maxCells / series));
    for (let parallel = 1; parallel <= maxParallel; parallel += 1) {
      const layout = { cellId, series, parallel };
      const extras = base.extras.filter((slug) => PACK_OPTIONAL_EXTRAS.some((extra) => extra.slug === slug && extra.fits(layout)) &&
        (bySlug.get(slug)?.stock ?? 0) >= quantity);
      let candidate: PackResult;
      try { candidate = calculatePack(withLoad({ ...layout, extras }, load), { products }); } catch { continue; }
      if (!candidate.available || candidate.maxPacks < quantity || !usablePrice(candidate, bySlug)) continue;
      const tested = assessPackLoad(candidate, load);
      if (!tested.safe) continue;
      const removedExtras = base.extras.filter((slug) => !extras.includes(slug)).map((slug) =>
        bySlug.get(slug)?.name ?? PACK_OPTIONAL_EXTRAS.find((extra) => extra.slug === slug)!.label);
      const changes: string[] = [];
      const warnings: string[] = [];
      if (cellId !== base.cellId) changes.push(`${PACK_CELLS[cellId].label} replaces ${result.cell.label}.`);
      if (parallel !== base.parallel) changes.push(`${series}S${parallel}P replaces ${base.series}S${base.parallel}P.`);
      if (cellId !== base.cellId || parallel !== base.parallel) warnings.push("Pack dimensions change; confirm that the new enclosure fits.");
      if (removedExtras.length) changes.push(`Remove: ${removedExtras.join(", ")}.`);
      if (!changes.length) continue;
      const meetsTarget = tested.runtimeH >= target;
      const meetsCapacity = candidate.energyWh >= result.energyWh * 0.9 && (!wantedRuntime || tested.runtimeH >= wantedRuntime * 0.9);
      if (!meetsCapacity) warnings.push("Less capacity or runtime than your original build.");
      if (!meetsTarget) warnings.push(`Below your ${formatRuntime(target)} runtime target.`);
      if (load.mode === "W" && load.ac) warnings.push("Runtime assumes a suitable inverter (87% efficiency); an inverter is not included.");
      const capacityDeltaPct = Math.round((candidate.capacityAh / result.capacityAh - 1) * 100);
      const priceRatio = candidate.price / Math.max(result.price, 1);
      const score = Math.max(0, Math.round(100 - Math.min(40, Math.abs(candidate.energyWh / result.energyWh - 1) * 20)
        - Math.min(20, Math.abs(tested.runtimeH / Math.max(wantedRuntime, .1) - 1) * 8)
        - (cellId !== base.cellId ? 5 : 0) - removedExtras.length * 8 - (meetsTarget ? 0 : 6)
        - (meetsCapacity ? 0 : 25) - (priceRatio > 1.5 ? 6 : 0)));
      custom.push({ config: candidate.config, result: candidate, changes, removedExtras, warnings,
        runtimeH: tested.runtimeH, meetsTarget, meetsCapacity, capacityDeltaPct, score, label: "In stock",
        priceDelta: completeEstimate ? candidate.price - result.price : null,
        reason: removedExtras.length && cellId === base.cellId && parallel === base.parallel
          ? "Keep the same core pack; leave out the named optional items."
          : `Same chemistry and ${series}S voltage profile, with stock for every included part and 20% BMS headroom at the modelled load.`,
      });
    }
  }

  const ready: ReadyPackAlternative[] = [];
  const review: ReviewPack[] = [];
  for (const product of products) {
    if (!isStockedReadyPack(product, quantity)) continue;
    const spec = readReadyPackSpecs(product);
    const reasons = readyMismatch(spec, result);
    const requiredA = load.mode === "A" ? load.amps : spec.cutoffVoltage
      ? load.watts / (spec.cutoffVoltage * (load.ac ? .87 : .92)) : Infinity;
    const currentLimit = Math.min(spec.continuousA ?? 0, spec.bmsCurrentA ?? Infinity);
    if (spec.continuousA && currentLimit < requiredA * BMS_HEADROOM) reasons.push("Continuous output does not provide 20% headroom at this load.");
    if (reasons.length || !spec.energyWh || !spec.nominalVoltage || !spec.capacityAh || !spec.chargeVoltage || !spec.continuousA) {
      review.push({ product, reasons: [...new Set(reasons)], voltage: spec.nominalVoltage });
      continue;
    }
    const loadWatts = load.mode === "W" ? load.watts / (load.ac ? .87 : .92) : load.amps * spec.nominalVoltage;
    const estimatedRuntimeH = spec.energyWh * .75 / loadWatts;
    const meetsTarget = estimatedRuntimeH >= target;
    const meetsCapacity = spec.energyWh >= result.energyWh * .9;
    ready.push({ product, voltage: round(spec.nominalVoltage), chargeVoltage: round(spec.chargeVoltage), capacityAh: spec.capacityAh,
      continuousA: currentLimit, energyWh: Math.round(spec.energyWh), estimatedRuntimeH, meetsTarget, meetsCapacity,
      priceDelta: completeEstimate ? product.price - result.price : null, label: "Ready-made option",
      reason: `Same ${spec.series}S ${spec.chemistry === "lifepo4" ? "LiFePO4" : "Li-ion"} profile; published continuous current covers the modelled load with headroom.`,
      warnings: [...spec.notes, ...(!meetsCapacity ? ["Less energy than your original build."] : []),
        ...(!meetsTarget ? [`Below your ${formatRuntime(target)} runtime target.`] : []),
        "Runtime is a conservative estimate using 75% of nominal energy, not a bench-tested guarantee."],
      score: Math.max(0, Math.round(100 - Math.min(45, Math.abs(spec.energyWh / result.energyWh - 1) * 24) - (meetsCapacity ? 0 : 20) - (meetsTarget ? 0 : 12))),
    });
  }
  const withinBudget = (price: number) => maxBudget === null || price <= maxBudget;
  const filteredCustom = custom.filter((item) => withinBudget(item.result.price));
  const filteredReady = ready.filter((item) => withinBudget(item.product.price));
  filteredReady.sort((a, b) => {
    const tie = a.product.price - b.product.price || a.product.slug.localeCompare(b.product.slug);
    if (priority === "price") return Number(b.meetsCapacity) - Number(a.meetsCapacity) || tie;
    if (priority === "runtime") return Number(b.meetsTarget) - Number(a.meetsTarget) ||
      (a.meetsTarget && b.meetsTarget ? tie : b.estimatedRuntimeH - a.estimatedRuntimeH) || tie;
    return Number(b.meetsCapacity) - Number(a.meetsCapacity) || b.score - a.score || tie;
  });
  review.sort((a, b) => Math.abs((a.voltage ?? Infinity) - result.nominalVoltage) - Math.abs((b.voltage ?? Infinity) - result.nominalVoltage) ||
    a.reasons.length - b.reasons.length || a.product.price - b.product.price || a.product.slug.localeCompare(b.product.slug));
  const shownReady = filteredReady.slice(0, 3).map((item, i) => ({ ...item, label: i ? "Another stocked option" : priority === "price" ? "Lower-price ready pack" : priority === "runtime" && item.meetsTarget ? "Meets your runtime target" : "Closest ready-made fit" }));
  const shownReview = review.filter((item) => withinBudget(item.product.price)).slice(0, 2);
  return { ...empty, unavailable: [...new Set(unavailable)], custom: customWinners(filteredCustom, priority), ready: shownReady,
    review: shownReview, browseOnly: shownReady.length ? null : shownReview[0]?.product ?? null,
    counts: { custom: custom.length, ready: ready.length, overBudget: custom.length + ready.length - filteredCustom.length - filteredReady.length },
  };
}
