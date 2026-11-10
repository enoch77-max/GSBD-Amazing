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
export type PackComponentKind = "cells" | "bms" | "assembly" | "testing" | "balance" | "charger" | "safety";
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
  capacityAh: number;
  maxDischargeA: number;
  diameterMm: number;
  heightMm: number;
  weightG: number;
  unitCost: number;
  image: string;
  note: string;
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
  slug: string;
  name: string;
  summary: string;
};

export const PACK_CELLS: Record<CellId, CellDefinition> = {
  "18650": {
    id: "18650", label: "Samsung 30Q", shortLabel: "18650", chemistry: "Li-ion NMC",
    nominalVoltage: 3.6, chargeVoltage: 4.2, capacityAh: 3, maxDischargeA: 15,
    diameterMm: 18.4, heightMm: 65, weightG: 48, unitCost: 520,
    image: "/images/col-cells.jpg", note: "A compact, versatile high-drain cell.",
  },
  "21700": {
    id: "21700", label: "Molicel P42A", shortLabel: "21700", chemistry: "Li-ion NCA",
    nominalVoltage: 3.6, chargeVoltage: 4.2, capacityAh: 4.2, maxDischargeA: 30,
    diameterMm: 21.2, heightMm: 70.3, weightG: 70, unitCost: 880,
    image: "/images/col-cells.jpg", note: "More capacity per cell for demanding builds.",
  },
  "lifepo4-32700": {
    id: "lifepo4-32700", label: "LiFePO4 32700", shortLabel: "LiFePO4", chemistry: "Lithium iron phosphate",
    nominalVoltage: 3.2, chargeVoltage: 3.65, capacityAh: 6, maxDischargeA: 18,
    diameterMm: 32.2, heightMm: 70, weightG: 145, unitCost: 390,
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
const dimensions = (config: Pick<NormalizedPackConfiguration, "cellId" | "series" | "parallel">) => {
  const cell = PACK_CELLS[config.cellId];
  return {
    length: Math.round(config.series * (cell.diameterMm + 2) + 45),
    width: Math.round(config.parallel * (cell.diameterMm + 2) + 35),
    height: Math.round(cell.heightMm + 30),
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
const BMS_PROFILES: Array<{ slug: string; minS: number; maxS: number; currentA: number; chemistries: Chemistry[] }> = [
  { slug: "3s-20a-bms-balance", minS: 3, maxS: 3, currentA: 20, chemistries: ["li-ion"] },
  { slug: "daly-smart-bms-4s-40a", minS: 4, maxS: 4, currentA: 40, chemistries: ["li-ion", "lifepo4"] },
  { slug: "jk-smart-bms-24s-200a", minS: 8, maxS: 24, currentA: 200, chemistries: ["li-ion", "lifepo4"] },
];

export function calculatePack(input: unknown, options: { products?: PackCatalogEntry[] } = {}): PackResult {
  const config = normalizePackConfiguration(input);
  const cell = PACK_CELLS[config.cellId];
  const cellCount = config.series * config.parallel;
  const nominalVoltage = round(config.series * cell.nominalVoltage, 2);
  const chargeVoltage = round(config.series * cell.chargeVoltage, 2);
  const capacityAh = round(config.parallel * cell.capacityAh, 2);
  const energyWh = round(nominalVoltage * capacityAh, 1);
  const estimatedPeakCurrentA = config.parallel * cell.maxDischargeA;
  const weightKg = round((cellCount * cell.weightG + 180 + config.series * 18) / 1000, 2);
  const dimensionsMm = dimensions(config);
  const chemistry: Chemistry = config.cellId === "lifepo4-32700" ? "lifepo4" : "li-ion";
  const bySlug = new Map((options.products ?? []).map((product) => [product.slug, product]));
  const cellProduct = bySlug.get(PACK_PRODUCT_SLUG[config.cellId]);
  const nickel = bySlug.get(NICKEL_SLUG);
  const bmsMatches = BMS_PROFILES
    .filter((profile) => profile.minS <= config.series && profile.maxS >= config.series && profile.currentA >= config.loadCurrentA && profile.chemistries.includes(chemistry))
    .map((profile) => ({ profile, product: bySlug.get(profile.slug) }))
    .filter((entry): entry is { profile: typeof BMS_PROFILES[number]; product: PackCatalogEntry } => Boolean(entry.product))
    .sort((a, b) => Number(b.product.stock > 0) - Number(a.product.stock > 0) || a.product.price - b.product.price);
  const bmsMatch = bmsMatches[0];
  const nickelQty = Math.max(1, Math.ceil(cellCount * 0.045));
  const components: PackComponent[] = [
    {
      key: "cells", slug: PACK_PRODUCT_SLUG[config.cellId], name: `${cell.label} cells`,
      image: cellProduct?.images[0] ?? cell.image, qty: cellCount, unitPrice: cellProduct?.price ?? cell.unitCost,
      total: cellCount * (cellProduct?.price ?? cell.unitCost), required: true,
      note: `${cellCount} cells arranged ${config.series}S${config.parallel}P`, kind: "cells", available: Boolean(cellProduct && cellProduct.stock >= cellCount),
    },
    {
      key: "bms", slug: bmsMatch?.product.slug ?? null,
      name: bmsMatch?.product.name ?? `Compatible ${config.series}S BMS`,
      image: bmsMatch?.product.images[0] ?? "/images/col-circuits.jpg", qty: 1,
      unitPrice: bmsMatch?.product.price ?? 0, total: bmsMatch?.product.price ?? 0, required: true,
      note: bmsMatch ? `${bmsMatch.profile.currentA}A rated · chemistry settings confirmed by the bench` : "No verified compatible board is available in the catalogue.",
      kind: "bms", available: Boolean(bmsMatch && bmsMatch.product.stock > 0),
    },
    {
      key: "nickel", slug: NICKEL_SLUG, name: "Pure nickel strip (1m)",
      image: nickel?.images[0] ?? "/images/col-cells.jpg", qty: nickelQty,
      unitPrice: nickel?.price ?? 120, total: (nickel?.price ?? 120) * nickelQty, required: true,
      note: `${nickelQty} metre${nickelQty === 1 ? "" : "s"} estimated for connections`, kind: "assembly", available: Boolean(nickel && nickel.stock >= nickelQty),
    },
    {
      key: "assembly", slug: null, name: "Workshop assembly & insulation", image: "", qty: 1,
      unitPrice: 450 + cellCount * 8, total: 450 + cellCount * 8, required: true,
      note: "Welding, wiring, insulation and standard enclosure materials", kind: "assembly", available: true,
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
  const unavailable = components.find((component) => !component.available);
  const exceedsCells = config.loadCurrentA > estimatedPeakCurrentA;
  const availabilityNote = exceedsCells
    ? `The requested ${config.loadCurrentA}A load exceeds the estimated ${estimatedPeakCurrentA}A cell limit. Increase parallel cells or lower the load.`
    : unavailable
      ? unavailable.key === "bms" && !bmsMatch
        ? `We need to confirm a compatible ${config.series}S BMS for this build. Contact the workshop for a quote.`
        : `${unavailable.name} is unavailable in the required quantity. Contact the workshop or adjust the build.`
      : null;
  const maxPacks = availabilityNote ? 0 : Math.max(0, Math.min(20, ...components.filter((c) => c.slug).map((c) => Math.floor((bySlug.get(c.slug!)?.stock ?? 0) / c.qty))));
  const name = `Custom ${config.series}S${config.parallel}P ${cell.shortLabel} pack`;
  return {
    config, cell, cellCount, nominalVoltage, chargeVoltage, capacityAh, energyWh, estimatedPeakCurrentA,
    recommendedCurrentA: config.loadCurrentA, weightKg, dimensionsMm, components,
    price: components.reduce((sum, component) => sum + component.total, 0),
    available: maxPacks > 0, maxPacks, availabilityNote,
    bms: { minSeries: config.series, maxSeries: config.series, recommendedCurrentA: config.loadCurrentA, chemistry, name: bmsMatch?.product.name ?? `Compatible ${config.series}S BMS`, ratedCurrentA: bmsMatch?.profile.currentA ?? null },
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
