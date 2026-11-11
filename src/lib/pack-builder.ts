/** Shared, deterministic custom-pack quote. The server recalculates every order. */
export type CellId = "18650" | "21700" | "lifepo4-32700";
export type Chemistry = "li-ion" | "lifepo4";

export type PackConfiguration = {
  cellId: CellId;
  series: number;
  parallel: number;
  /** Customer's expected continuous load, not a guarantee of pack output. */
  loadCurrentA?: number;
  extras?: string[];
};
export type NormalizedPackConfiguration = Required<PackConfiguration>;

export type PackCatalogEntry = {
  slug: string;
  name: string;
  price: number;
  stock: number;
  images: string[];
  categorySlug?: string;
  brand?: string;
  id?: number;
  shortDescription?: string;
};
export type PackComponentKind = "cells" | "bms" | "assembly" | "labour" | "testing" | "balance" | "charger" | "safety";
export type PackComponent = {
  key: string;
  slug: string | null;
  name: string;
  image: string;
  qty: number;
  unitPrice: number;
  total: number;
  required: boolean;
  note: string;
  kind: PackComponentKind;
  available: boolean;
};
export type CellDefinition = {
  id: CellId;
  label: string;
  shortLabel: string;
  chemistry: string;
  nominalVoltage: number;
  chargeVoltage: number;
  /** Practical low-voltage cut-off used for runtime (above the datasheet minimum, for cycle life). */
  cutoffVoltage: number;
  capacityAh: number;
  /** Fraction of rated capacity available between charge voltage and the practical cut-off. */
  usableFraction: number;
  maxDischargeA: number;
  maxChargeA: number;
  /** DC internal resistance per cell, milliohm. */
  internalResistanceMohm: number;
  /** Capacity lost per C of discharge above 0.2C (rate-capacity effect). */
  rateDerateK: number;
  /** Cycles to 80% at 0.5C, full depth, 25°C. */
  cycleLife: number;
  /** Capacity spread (1σ) of matched cells, new and after ~2 years of daily cycling. */
  toleranceNewPct: number;
  toleranceAgedPct: number;
  /** Self-discharge spread between cells, % of capacity per month. */
  driftPctMonth: number;
  /** Hours per day a passive BMS can bleed (cells sit above the balance threshold). */
  balanceWindowH: number;
  diameterMm: number;
  heightMm: number;
  weightG: number;
  holderWeightG: number;
  unitCost: number;
  image: string;
  note: string;
};

export type BalanceAnalysis = {
  method: "passive" | "active";
  bmsBalanceA: number;
  /** Capacity lost to the weakest series group, % — new cells / ~2 years. */
  mismatchNowPct: number;
  mismatchAgedPct: number;
  /** Capacity lost to self-discharge drift the BMS cannot correct, %. */
  driftPct: number;
  /** Usable-capacity gain from adding the 5A active balancer, % — now / aged. */
  gainNowPct: number;
  gainAgedPct: number;
  /** Cycle-life gain from the balancer (weakest group no longer over-discharged), %. */
  cycleGainPct: number;
  installed: boolean;
};

export type PackPhysics = {
  usableAh: number;
  usableWh: number;
  cutoffVoltage: number;
  resistanceMohm: number;
  cellLimitA: number;
  continuousA: number;
  peakA: number;
  bmsHeadroomPct: number | null;
  loadCRate: number;
  sagV: number;
  heatW: number;
  tempRiseC: number;
  runtimeH: number;
  powerLimitW: number;
  cycleLife: number;
  energyDensityWhKg: number;
  direct12V: boolean;
  charger: { voltage: number; currentA: number; hours: number };
  layout: { rows: number; groupsPerRow: number };
  nickelLayers: number;
  balance: BalanceAnalysis;
};

export type PackResult = {
  config: NormalizedPackConfiguration;
  cell: CellDefinition;
  cellCount: number;
  nominalVoltage: number;
  chargeVoltage: number;
  capacityAh: number;
  energyWh: number;
  estimatedPeakCurrentA: number;
  recommendedCurrentA: number;
  weightKg: number;
  dimensionsMm: { length: number; width: number; height: number };
  components: PackComponent[];
  price: number;
  available: boolean;
  maxPacks: number;
  availabilityNote: string | null;
  bms: { minSeries: number; maxSeries: number; recommendedCurrentA: number; chemistry: Chemistry; name: string; ratedCurrentA: number | null };
  physics: PackPhysics;
  slug: string;
  name: string;
  summary: string;
};

export const PACK_CELLS: Record<CellId, CellDefinition> = {
  "18650": {
    id: "18650", label: "Samsung 30Q", shortLabel: "18650", chemistry: "Li-ion NMC",
    nominalVoltage: 3.6, chargeVoltage: 4.2, cutoffVoltage: 3.0, capacityAh: 3, usableFraction: 0.93,
    maxDischargeA: 15, maxChargeA: 4, internalResistanceMohm: 22, rateDerateK: 0.025, cycleLife: 450,
    toleranceNewPct: 1.5, toleranceAgedPct: 5, driftPctMonth: 1, balanceWindowH: 1.5,
    diameterMm: 18.4, heightMm: 65, weightG: 48, holderWeightG: 2.4, unitCost: 520,
    image: "/images/col-cells.jpg", note: "A compact, versatile high-drain cell.",
  },
  "21700": {
    id: "21700", label: "Molicel P42A", shortLabel: "21700", chemistry: "Li-ion NCA",
    nominalVoltage: 3.6, chargeVoltage: 4.2, cutoffVoltage: 3.0, capacityAh: 4.2, usableFraction: 0.92,
    maxDischargeA: 30, maxChargeA: 4.2, internalResistanceMohm: 16, rateDerateK: 0.018, cycleLife: 600,
    toleranceNewPct: 1.5, toleranceAgedPct: 4.5, driftPctMonth: 1, balanceWindowH: 1.5,
    diameterMm: 21.2, heightMm: 70.3, weightG: 70, holderWeightG: 3, unitCost: 880,
    image: "/images/col-cells.jpg", note: "More capacity per cell for demanding builds.",
  },
  "lifepo4-32700": {
    id: "lifepo4-32700", label: "LiFePO4 32700", shortLabel: "LiFePO4", chemistry: "Lithium iron phosphate",
    nominalVoltage: 3.2, chargeVoltage: 3.65, cutoffVoltage: 2.8, capacityAh: 6, usableFraction: 0.97,
    maxDischargeA: 18, maxChargeA: 6, internalResistanceMohm: 8, rateDerateK: 0.012, cycleLife: 2000,
    toleranceNewPct: 2, toleranceAgedPct: 4, driftPctMonth: 2, balanceWindowH: 0.5,
    diameterMm: 32.2, heightMm: 70, weightG: 145, holderWeightG: 6, unitCost: 390,
    image: "/images/col-cells.jpg", note: "Long cycle life for solar and backup power.",
  },
};
export const PACK_LIMITS = { minSeries: 1, maxSeries: 24, minParallel: 1, maxParallel: 12, maxCells: 120, maxLoadCurrentA: 200 } as const;
export const PACK_PRODUCT_SLUG: Record<CellId, string> = {
  "18650": "samsung-inr18650-30q",
  "21700": "molicel-p42a-21700",
  "lifepo4-32700": "lifepo4-32700-6000",
};
const NICKEL_SLUG = "pure-nickel-strip-015-8mm";

export type PackExtraDefinition = {
  slug: string;
  code: string;
  label: string;
  note: string;
  kind: "balance" | "charger" | "safety";
  fits: (config: Pick<NormalizedPackConfiguration, "cellId" | "series" | "parallel">) => boolean;
  incompatibility: string;
};
/** Holder pitch: cell diameter plus moulded holder wall. */
const pitchOf = (cell: CellDefinition) => cell.diameterMm + 2;

/**
 * Compact block layout: series groups are folded into rows so the pack is a
 * brick rather than a 600 mm stick. Picks the row count with the smallest
 * perimeter (closest to square), preferring fewer rows on a tie.
 */
export function packLayout(config: Pick<NormalizedPackConfiguration, "cellId" | "series" | "parallel">) {
  const cell = PACK_CELLS[config.cellId];
  const pitch = pitchOf(cell);
  let best = { rows: 1, groupsPerRow: config.series, length: 0, width: 0 };
  let bestScore = Infinity;
  for (let rows = 1; rows <= config.series; rows += 1) {
    const groupsPerRow = Math.ceil(config.series / rows);
    if (rows > 1 && Math.ceil(config.series / (rows - 1)) === groupsPerRow) continue;
    const a = groupsPerRow * pitch;
    const b = rows * config.parallel * pitch;
    const empty = (groupsPerRow * rows - config.series) * config.parallel * pitch * pitch;
    const score = a + b + empty / 200;
    if (score < bestScore - 0.01) {
      bestScore = score;
      best = { rows, groupsPerRow, length: Math.max(a, b), width: Math.min(a, b) };
    }
  }
  return best;
}

const dimensions = (config: Pick<NormalizedPackConfiguration, "cellId" | "series" | "parallel">) => {
  const cell = PACK_CELLS[config.cellId];
  const layout = packLayout(config);
  /* 5 mm per side for insulation + wrap; holders, BMS and leads add height. */
  return {
    length: Math.round(layout.length + 10),
    width: Math.round(layout.width + 10),
    height: Math.round(cell.heightMm + 22),
  };
};
export const PACK_OPTIONAL_EXTRAS: PackExtraDefinition[] = [
  {
    slug: "5a-active-balancer", code: "balance", label: "5A active balancer", kind: "balance",
    note: "Additional balancing alongside the BMS.",
    fits: ({ series }) => series >= 2 && series <= 24,
    incompatibility: "Requires 2–24 series groups.",
  },
  {
    slug: "lipo-safe-fireproof-bag", code: "bag", label: "Battery storage bag", kind: "safety",
    note: "Fire-resistant storage bag, supplied separately.",
    fits: (config) => {
      const d = dimensions(config);
      const sides = [d.length, d.width].sort((a, b) => b - a);
      return sides[0] <= 215 && sides[1] <= 180 && d.height <= 120;
    },
    incompatibility: "Estimated pack exceeds the bag's 215 × 180 × 120 mm interior.",
  },
  {
    slug: "tp4056-type-c-charger-module", code: "charger", label: "Type-C 1S charge module", kind: "charger",
    note: "1A charger for a single-series li-ion pack.",
    fits: ({ cellId, series }) => cellId !== "lifepo4-32700" && series === 1,
    incompatibility: "Only suitable for a 1S lithium-ion pack.",
  },
  {
    slug: "30a-mppt-solar-charge-controller", code: "solar", label: "30A MPPT solar controller", kind: "charger",
    note: "12V / 24V controller supplied separately.",
    fits: ({ cellId, series }) => cellId === "lifepo4-32700" && (series === 4 || series === 8),
    incompatibility: "Only suitable for 4S or 8S LiFePO4 banks.",
  },
];

const round = (value: number, precision = 1) => Math.round(value * 10 ** precision) / 10 ** precision;

export function normalizePackConfiguration(input: unknown): NormalizedPackConfiguration {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose a valid pack configuration.");
  const value = input as Record<string, unknown>;
  const cellId = value.cellId as CellId;
  if (typeof cellId !== "string" || !Object.hasOwn(PACK_CELLS, cellId)) throw new Error("Choose a supported cell type.");
  const series = Number(value.series);
  const parallel = Number(value.parallel);
  const loadCurrentA = value.loadCurrentA === undefined ? 10 : Number(value.loadCurrentA);
  if (!Number.isInteger(series) || series < 1 || series > PACK_LIMITS.maxSeries) throw new Error("Series count must be a whole number between 1 and 24.");
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > PACK_LIMITS.maxParallel) throw new Error("Parallel count must be a whole number between 1 and 12.");
  if (series * parallel > PACK_LIMITS.maxCells) throw new Error(`A pack can contain at most ${PACK_LIMITS.maxCells} cells.`);
  if (!Number.isInteger(loadCurrentA) || loadCurrentA < 1 || loadCurrentA > PACK_LIMITS.maxLoadCurrentA) throw new Error("Expected continuous load must be a whole number between 1A and 200A.");
  if (value.extras !== undefined && !Array.isArray(value.extras)) throw new Error("Pack extras must be a list.");
  const extras = value.extras ?? [];
  if ((extras as unknown[]).length > PACK_OPTIONAL_EXTRAS.length) throw new Error("Too many pack extras.");
  const normalized: string[] = [];
  for (const entry of extras as unknown[]) {
    if (typeof entry !== "string") throw new Error("Invalid pack add-on.");
    const definition = PACK_OPTIONAL_EXTRAS.find((extra) => extra.slug === entry);
    if (!definition) throw new Error("Unknown pack add-on.");
    if (!definition.fits({ cellId, series, parallel })) throw new Error(`${definition.label} is not compatible with this configuration.`);
    if (normalized.includes(entry)) throw new Error("A pack add-on cannot be selected twice.");
    normalized.push(entry);
  }
  return { cellId, series, parallel, loadCurrentA, extras: normalized.sort() };
}

/** Different loads/add-ons must never merge into the same cart line. */
export function packSlug(input: PackConfiguration): string {
  const config = normalizePackConfiguration(input);
  const base = `custom-pack-${config.cellId}-${config.series}s${config.parallel}p`;
  const load = config.loadCurrentA === 10 ? "" : `-${config.loadCurrentA}a`;
  const extras = config.extras.map((slug) => PACK_OPTIONAL_EXTRAS.find((extra) => extra.slug === slug)!.code).sort();
  return `${base}${load}${extras.length ? `-with-${extras.join("-")}` : ""}`;
}

/** Explicit, catalog-backed compatibility profiles; 24S is not a 1S board. */
type BmsProfile = { slug: string; minS: number; maxS: number; currentA: number; chemistries: Chemistry[]; balanceA: number; activeBalance: boolean; weightG: number };
const BMS_PROFILES: BmsProfile[] = [
  { slug: "3s-20a-bms-balance", minS: 3, maxS: 3, currentA: 20, chemistries: ["li-ion"], balanceA: 0.06, activeBalance: false, weightG: 15 },
  { slug: "daly-smart-bms-4s-40a", minS: 4, maxS: 4, currentA: 40, chemistries: ["li-ion", "lifepo4"], balanceA: 0.035, activeBalance: false, weightG: 70 },
  { slug: "jk-smart-bms-24s-200a", minS: 8, maxS: 24, currentA: 200, chemistries: ["li-ion", "lifepo4"], balanceA: 2, activeBalance: true, weightG: 420 },
];
/** Continuous BMS rating should exceed the load by this margin (MOSFET heat, inrush). */
export const BMS_HEADROOM = 1.2;
const BALANCER_SLUG = "5a-active-balancer";
const BALANCER_A = 5;
/** Pure nickel 0.15 × 8 mm: ~58 mΩ/m, ~4.5 A per strip before it runs hot. */
const NICKEL_MOHM_PER_MM = 0.058;
const NICKEL_AMPS_PER_STRIP = 4.5;
const NICKEL_G_PER_M = 10.7;
const CHARGER_STEPS = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];

/* ------------------------------------------------------------------ */
/* Physics helpers                                                     */
/* ------------------------------------------------------------------ */

/** Acklam's rational approximation of the inverse standard normal CDF. */
function inverseNormal(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -inverseNormal(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Expected shortfall of the weakest of n groups, in σ (Blom's order-statistic estimate). */
export function expectedWeakestSigma(n: number): number {
  if (n <= 1) return 0;
  return inverseNormal((n - 0.375) / (n + 0.25));
}

/** Rate-capacity effect: cells deliver less capacity at higher C. */
export function rateFactor(cell: CellDefinition, cellCurrentA: number): number {
  const c = cellCurrentA / cell.capacityAh;
  return Math.max(0.8, Math.min(1, 1 - cell.rateDerateK * Math.max(0, c - 0.2)));
}

/**
 * Pack current for a constant-power load, accounting for internal-resistance
 * sag: R·I² − V·I + P = 0. Returns null when the pack cannot deliver P.
 */
export function currentForPower(watts: number, voltage: number, resistanceOhm: number): number | null {
  if (watts <= 0) return 0;
  if (resistanceOhm <= 0) return watts / voltage;
  const disc = voltage * voltage - 4 * resistanceOhm * watts;
  if (disc < 0) return null;
  return (voltage - Math.sqrt(disc)) / (2 * resistanceOhm);
}

function balanceLosses(opts: {
  cell: CellDefinition; series: number; parallel: number; capacityAh: number; dischargeH: number;
  bmsBalanceA: number; bmsActive: boolean; extraActiveA: number; aged: boolean;
}): { mismatch: number; drift: number; residual: number } {
  const { cell, series, parallel, capacityAh, dischargeH, bmsBalanceA, bmsActive, extraActiveA, aged } = opts;
  const sigma = (aged ? cell.toleranceAgedPct : cell.toleranceNewPct) / 100 / Math.sqrt(parallel);
  const mismatch = Math.min(0.3, sigma * expectedWeakestSigma(series));
  /* Monthly self-discharge drift vs. what the balancing circuit can move back. */
  const driftAh = (cell.driftPctMonth / 100) * capacityAh * (aged ? 1.5 : 1);
  const activeA = (bmsActive ? bmsBalanceA : 0) + extraActiveA;
  const correctAh = activeA > 0 ? activeA * 24 * 30 : bmsBalanceA * cell.balanceWindowH * 30;
  const drift = series > 1 ? Math.min(0.08, (Math.max(0, driftAh - correctAh) * 3) / capacityAh) : 0;
  /* Active balancing moves charge during discharge and recovers mismatch; passive cannot. */
  let recovered = 0;
  if (activeA > 0 && mismatch > 0) {
    const movableAh = activeA * Math.max(0.1, dischargeH) * 0.85;
    recovered = Math.min(0.9, movableAh / (mismatch * capacityAh));
  }
  return { mismatch, drift, residual: mismatch * (1 - recovered) + drift };
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}



export function calculatePack(input: unknown, options: { products?: PackCatalogEntry[] } = {}): PackResult {
  const config = normalizePackConfiguration(input);
  const cell = PACK_CELLS[config.cellId];
  const cellCount = config.series * config.parallel;
  const nominalVoltage = round(config.series * cell.nominalVoltage, 2);
  const chargeVoltage = round(config.series * cell.chargeVoltage, 2);
  const cutoffVoltage = round(config.series * cell.cutoffVoltage, 1);
  const capacityAh = round(config.parallel * cell.capacityAh, 2);
  const energyWh = round(nominalVoltage * capacityAh, 1);
  const cellLimitA = config.parallel * cell.maxDischargeA;
  const dimensionsMm = dimensions(config);
  const layout = packLayout(config);
  const chemistry: Chemistry = config.cellId === "lifepo4-32700" ? "lifepo4" : "li-ion";
  const bySlug = new Map((options.products ?? []).map((product) => [product.slug, product]));
  const cellProduct = bySlug.get(PACK_PRODUCT_SLUG[config.cellId]);
  const nickel = bySlug.get(NICKEL_SLUG);

  /* BMS: prefer boards with 20% headroom; fall back to an exact-rating board. */
  const bmsMatches = BMS_PROFILES
    .filter((profile) => profile.minS <= config.series && profile.maxS >= config.series && profile.currentA >= config.loadCurrentA && profile.chemistries.includes(chemistry))
    .map((profile) => ({ profile, product: bySlug.get(profile.slug) }))
    .filter((entry): entry is { profile: BmsProfile; product: PackCatalogEntry } => Boolean(entry.product))
    .sort((a, b) =>
      Number(b.product.stock > 0) - Number(a.product.stock > 0) ||
      Number(b.profile.currentA >= config.loadCurrentA * BMS_HEADROOM) - Number(a.profile.currentA >= config.loadCurrentA * BMS_HEADROOM) ||
      a.product.price - b.product.price);
  const bmsMatch = bmsMatches[0];

  /* Interconnect: busbars per group plus row bridges, layered for the load current. */
  const pitch = pitchOf(cell);
  const nickelLayers = Math.max(1, Math.min(4, Math.ceil(config.loadCurrentA / config.parallel / NICKEL_AMPS_PER_STRIP)));
  const stripMm = ((config.series + 1) + (layout.rows - 1)) * config.parallel * pitch * nickelLayers * 1.15;
  const nickelQty = Math.max(1, Math.ceil(stripMm / 1000));
  // Labour is charged once per pack, not once per component. More cells,
  // high-current connections and high-voltage insulation take longer to build.
  const technicianCharge = 650 + cellCount * 12 + (config.loadCurrentA > 40 ? 250 : 0) + (chargeVoltage > 60 ? 350 : 0);
  const assemblyMaterials = 200 + cellCount * 6;

  const components: PackComponent[] = [
    {
      key: "cells", slug: PACK_PRODUCT_SLUG[config.cellId], name: `${cell.label} cells`,
      image: cellProduct?.images[0] ?? cell.image, qty: cellCount, unitPrice: cellProduct?.price ?? cell.unitCost,
      total: cellCount * (cellProduct?.price ?? cell.unitCost), required: true,
      note: `${cellCount} cells arranged ${config.series}S${config.parallel}P${layout.rows > 1 ? ` · ${layout.rows} rows` : ""}`, kind: "cells", available: Boolean(cellProduct && cellProduct.stock >= cellCount),
    },
    {
      key: "bms", slug: bmsMatch?.product.slug ?? null,
      name: bmsMatch?.product.name ?? `Compatible ${config.series}S BMS`,
      image: bmsMatch?.product.images[0] ?? "/images/col-circuits.jpg", qty: 1,
      unitPrice: bmsMatch?.product.price ?? 0, total: bmsMatch?.product.price ?? 0, required: true,
      note: bmsMatch
        ? `${bmsMatch.profile.currentA}A rated (${Math.round((bmsMatch.profile.currentA / config.loadCurrentA - 1) * 100)}% headroom) · ${bmsMatch.profile.activeBalance ? `${bmsMatch.profile.balanceA}A active` : `${Math.round(bmsMatch.profile.balanceA * 1000)}mA passive`} balancing`
        : "No verified compatible board is available in the catalogue.",
      kind: "bms", available: Boolean(bmsMatch && bmsMatch.product.stock > 0),
    },
    {
      key: "nickel", slug: NICKEL_SLUG, name: "Pure nickel strip (1m)",
      image: nickel?.images[0] ?? "/images/col-cells.jpg", qty: nickelQty,
      unitPrice: nickel?.price ?? 120, total: (nickel?.price ?? 120) * nickelQty, required: true,
      note: `${nickelQty} m · ${nickelLayers} layer${nickelLayers === 1 ? "" : "s"} for ${round(config.loadCurrentA / config.parallel, 1)}A per strip`, kind: "assembly", available: Boolean(nickel && nickel.stock >= nickelQty),
    },
    {
      key: "assembly", slug: null, name: "Insulation & assembly materials", image: "", qty: 1,
      unitPrice: assemblyMaterials, total: assemblyMaterials, required: true,
      note: "Holders, insulation, wrap and standard connectors", kind: "assembly", available: true,
    },
    {
      key: "technician", slug: null, name: "Technician build service", image: "", qty: 1,
      unitPrice: technicianCharge, total: technicianCharge, required: true,
      note: "Cell matching, spot welding, BMS wiring and final assembly", kind: "labour", available: true,
    },
    {
      key: "testing", slug: null, name: "Capacity & balance testing", image: "", qty: 1,
      unitPrice: 180, total: 180, required: true,
      note: "Workshop testing before dispatch", kind: "testing", available: true,
    },
  ];
  for (const slug of config.extras) {
    const def = PACK_OPTIONAL_EXTRAS.find((extra) => extra.slug === slug)!;
    const product = bySlug.get(slug);
    components.push({
      key: slug, slug, name: product?.name ?? def.label, image: product?.images[0] ?? "", qty: 1,
      unitPrice: product?.price ?? 0, total: product?.price ?? 0, required: false, note: def.note,
      kind: def.kind, available: Boolean(product && product.stock > 0),
    });
  }

  /* ---------------- Electrical & thermal model ---------------- */
  const linkCount = config.series - 1 + (layout.rows - 1);
  const resistanceMohm = round(
    (config.series * cell.internalResistanceMohm) / config.parallel +
      (linkCount * pitch * NICKEL_MOHM_PER_MM) / (config.parallel * nickelLayers) +
      2 + 3, // BMS MOSFETs + main leads
    1,
  );
  const resistanceOhm = resistanceMohm / 1000;
  const loadA = config.loadCurrentA;
  const cellCurrent = loadA / config.parallel;
  const loadCRate = round(cellCurrent / cell.capacityAh, 2);
  const sagV = round(loadA * resistanceOhm, 2);
  const heatW = round(loadA * loadA * resistanceOhm, 1);

  const balancerInstalled = config.extras.includes(BALANCER_SLUG);
  const bmsBalanceA = bmsMatch?.profile.balanceA ?? 0.05;
  const bmsActive = bmsMatch?.profile.activeBalance ?? false;
  const nominalDischargeH = (capacityAh * cell.usableFraction) / Math.max(0.1, loadA);
  const loss = (aged: boolean, extra: number) =>
    balanceLosses({ cell, series: config.series, parallel: config.parallel, capacityAh, dischargeH: nominalDischargeH, bmsBalanceA, bmsActive, extraActiveA: extra, aged });
  const nowBase = loss(false, 0);
  const nowBal = loss(false, BALANCER_A);
  const agedBase = loss(true, 0);
  const agedBal = loss(true, BALANCER_A);
  const gain = (base: { residual: number }, bal: { residual: number }) =>
    config.series < 2 ? 0 : round(((1 - bal.residual) / (1 - base.residual) - 1) * 100, 1);
  const residualNow = balancerInstalled ? nowBal.residual : nowBase.residual;
  const balance: BalanceAnalysis = {
    method: bmsActive || balancerInstalled ? "active" : "passive",
    bmsBalanceA,
    mismatchNowPct: round(nowBase.mismatch * 100, 1),
    mismatchAgedPct: round(agedBase.mismatch * 100, 1),
    driftPct: round(agedBase.drift * 100, 1),
    gainNowPct: gain(nowBase, nowBal),
    gainAgedPct: gain(agedBase, agedBal),
    cycleGainPct: 0,
    installed: balancerInstalled,
  };

  const usableAh = round(capacityAh * cell.usableFraction * rateFactor(cell, cellCurrent) * (1 - residualNow), 2);
  const usableWh = round(usableAh * Math.max(0, nominalVoltage - sagV), 1);
  const runtimeH = round(usableAh / Math.max(0.01, loadA), 2);

  /* Weight: cells, holders, nickel, BMS, wrap (≈0.05 g/cm²) and current-sized leads. */
  const surfaceCm2 = (2 * (dimensionsMm.length * dimensionsMm.width + dimensionsMm.length * dimensionsMm.height + dimensionsMm.width * dimensionsMm.height)) / 100;
  const weightG = cellCount * (cell.weightG + cell.holderWeightG) + nickelQty * NICKEL_G_PER_M + (bmsMatch?.profile.weightG ?? 60) + surfaceCm2 * 0.05 + 25 + loadA * 1.2;
  const weightKg = round(weightG / 1000, 2);

  /* Temperature rise: steady state Q/(hA), limited by discharge time and thermal mass. */
  const areaM2 = surfaceCm2 / 10_000;
  const hA = 6 * areaM2;
  const tau = ((cellCount * cell.weightG) / 1000) * 1000 / hA; // s, cp ≈ 1000 J/kg·K
  const tempRiseC = round((heatW / hA) * (1 - Math.exp(-(runtimeH * 3600) / tau)), 1);

  const continuousA = Math.floor(Math.min(cellLimitA * 0.8, bmsMatch?.profile.currentA ?? Infinity));
  const powerLimitW = Math.round(continuousA * Math.max(0, nominalVoltage - continuousA * resistanceOhm));

  /* Cycle life: rate, heat and weakest-group depth all shorten it. */
  const rawCycles = (residual: number) =>
    cell.cycleLife /
      (1 + 0.18 * Math.max(0, loadCRate - 0.5)) *
      (tempRiseC > 10 ? 1 - Math.min(0.35, (tempRiseC - 10) * 0.02) : 1) *
      (1 - Math.min(0.3, residual * 3));
  const cyclesWithout = rawCycles(agedBase.residual);
  const cyclesWith = rawCycles(agedBal.residual);
  const cycleLife = Math.max(100, roundTo(balancerInstalled ? cyclesWith : cyclesWithout, 50));
  balance.cycleGainPct = config.series < 2 ? 0 : Math.max(0, Math.round((cyclesWith / cyclesWithout - 1) * 100));

  /* Charger: 0.5C, limited by the cells' charge rating, snapped to common sizes. */
  const idealCharge = Math.min(capacityAh * 0.5, config.parallel * cell.maxChargeA);
  const chargerA = CHARGER_STEPS.filter((step) => step <= idealCharge).pop() ?? 0.5;
  const chargeHours = round(chemistry === "lifepo4" ? (0.95 * capacityAh) / chargerA + 0.3 : (0.85 * capacityAh) / chargerA + 0.6, 1);

  const unavailable = components.find((component) => !component.available);
  const exceedsCells = config.loadCurrentA > cellLimitA;
  const availabilityNote = exceedsCells
    ? `The requested ${config.loadCurrentA}A load exceeds the estimated ${cellLimitA}A cell limit. Increase parallel cells or lower the load.`
    : unavailable
      ? unavailable.key === "bms" && !bmsMatch
        ? `We need to confirm a compatible ${config.series}S BMS for this build. Contact the workshop for a quote.`
        : `${unavailable.name} is unavailable in the required quantity. Contact the workshop or adjust the build.`
      : null;
  const maxPacks = availabilityNote ? 0 : Math.max(0, Math.min(20, ...components.filter((c) => c.slug).map((c) => Math.floor((bySlug.get(c.slug!)?.stock ?? 0) / c.qty))));
  const name = `Custom ${config.series}S${config.parallel}P ${cell.shortLabel} pack`;
  return {
    config, cell, cellCount, nominalVoltage, chargeVoltage, capacityAh, energyWh,
    estimatedPeakCurrentA: cellLimitA,
    recommendedCurrentA: continuousA,
    weightKg, dimensionsMm, components,
    price: components.reduce((sum, component) => sum + component.total, 0),
    available: maxPacks > 0, maxPacks, availabilityNote,
    bms: { minSeries: config.series, maxSeries: config.series, recommendedCurrentA: config.loadCurrentA, chemistry, name: bmsMatch?.product.name ?? `Compatible ${config.series}S BMS`, ratedCurrentA: bmsMatch?.profile.currentA ?? null },
    physics: {
      usableAh, usableWh, cutoffVoltage, resistanceMohm, cellLimitA, continuousA, peakA: cellLimitA,
      bmsHeadroomPct: bmsMatch ? Math.round((bmsMatch.profile.currentA / config.loadCurrentA - 1) * 100) : null,
      loadCRate, sagV, heatW, tempRiseC, runtimeH, powerLimitW, cycleLife,
      energyDensityWhKg: Math.round(energyWh / weightKg),
      direct12V: cutoffVoltage >= 9 && chargeVoltage <= 14.6,
      charger: { voltage: chargeVoltage, currentA: chargerA, hours: chargeHours },
      layout: { rows: layout.rows, groupsPerRow: layout.groupsPerRow },
      nickelLayers, balance,
    },
    slug: packSlug(config), name,
    summary: `${config.series}S${config.parallel}P · ${nominalVoltage}V nominal · ${capacityAh}Ah · ${energyWh}Wh`,
  };
}

export type PackSuggestion = {
  product: PackCatalogEntry;
  reason: string;
  kind: "bms" | "balance" | "charger" | "assembly" | "safety";
};

/** Recommend only accessories whose published voltage and dimensions fit. */
export function suggestPackProducts(result: PackResult, products: PackCatalogEntry[]): PackSuggestion[] {
  const { config } = result;
  const excluded = new Set(result.components.map((component) => component.slug));
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const suggestions: PackSuggestion[] = [];
  const add = (slug: string, reason: string, kind: PackSuggestion["kind"]) => {
    const product = bySlug.get(slug);
    if (product && product.stock > 0 && !excluded.has(slug)) suggestions.push({ product, reason, kind });
  };
  if (config.series >= 2) add("5a-active-balancer", `Extra balancing for ${config.series}S groups.`, "balance");
  if (PACK_OPTIONAL_EXTRAS.find((extra) => extra.code === "bag")!.fits(config)) add("lipo-safe-fireproof-bag", "Sized for this estimated enclosure.", "safety");
  if (config.cellId !== "lifepo4-32700" && config.series === 1) add("tp4056-type-c-charger-module", "1A charging for a single-series lithium-ion pack.", "charger");
  if (config.cellId === "lifepo4-32700" && [4, 8].includes(config.series)) add("30a-mppt-solar-charge-controller", "For 12V or 24V LiFePO4 solar systems.", "charger");
  const minimumVoltage = config.series * 2.5;
  if (minimumVoltage >= 15 && result.chargeVoltage <= 60) add("dc-dc-60v-12v-10a", "Steps a compatible higher-voltage pack down to 12V.", "charger");
  if ((config.cellId === "lifepo4-32700" && config.series === 8) || (config.cellId !== "lifepo4-32700" && config.series === 7)) {
    add("pure-sine-inverter-1kva-24v", "24V inverter; confirm low-voltage cut-off with the workshop.", "charger");
  }
  return suggestions.slice(0, 4);
}

export const PACK_ASSEMBLY_NOTE = "All dimensions and electrical values are estimates. The workshop must confirm the load, protection settings, charger and enclosure before assembly.";
