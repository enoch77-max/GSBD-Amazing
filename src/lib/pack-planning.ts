/**
 * Runtime planning on top of the pack engine: exact constant-power runtime,
 * minimal-parallel sizing for a target, and a same-chemistry optimiser.
 * Pure and deterministic — shared by the builder UI and the advisor.
 */
import {
  BMS_HEADROOM, PACK_CELLS, PACK_LIMITS, calculatePack, currentForPower, rateFactor,
  type CellId, type PackCatalogEntry, type PackConfiguration, type PackResult,
} from "@/lib/pack-builder";

export type LoadSpec = { mode: "A"; amps: number } | { mode: "W"; watts: number; ac?: boolean };

export type DevicePreset = { id: string; label: string; watts: number; ac?: boolean };
export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "router", label: "Wi-Fi router", watts: 12 },
  { id: "onu", label: "Router + ONU", watts: 20 },
  { id: "lights", label: "LED lights", watts: 30 },
  { id: "fan", label: "DC fan", watts: 40 },
  { id: "cctv", label: "CCTV kit", watts: 60 },
  { id: "laptop", label: "Laptop (AC)", watts: 65, ac: true },
  { id: "tv", label: "TV (AC)", watts: 90, ac: true },
];

/** Delivery efficiency from pack to device. */
export function deliveryEfficiency(result: PackResult, load: LoadSpec): number {
  if (load.mode === "A") return 1;
  if (load.ac) return 0.87; // pure-sine inverter
  return result.physics.direct12V ? 0.98 : 0.92; // direct wiring vs buck converter
}

export type LoadSimulation = {
  feasible: boolean;
  currentA: number;
  runtimeH: number;
  runtimeBalancedH: number;
  efficiency: number;
  overContinuous: boolean;
};

/** Runtime for a load, with and without the active balancer installed. */
export function simulateLoad(result: PackResult, load: LoadSpec): LoadSimulation {
  const { cell, config, physics } = result;
  const efficiency = deliveryEfficiency(result, load);
  const r = physics.resistanceMohm / 1000;
  const current = load.mode === "A" ? load.amps : currentForPower(load.watts / efficiency, result.nominalVoltage, r);
  if (current === null || current <= 0) {
    return { feasible: false, currentA: 0, runtimeH: 0, runtimeBalancedH: 0, efficiency, overContinuous: true };
  }
  /* usableAh is quoted at the configured load; rescale for this load's C-rate. */
  const b = physics.balance;
  const gain = 1 + b.gainNowPct / 100;
  const ahConfigured =
    physics.usableAh * (rateFactor(cell, current / config.parallel) / rateFactor(cell, config.loadCurrentA / config.parallel));
  const ahWith = b.installed ? ahConfigured : ahConfigured * gain;
  const ahWithout = b.installed ? ahConfigured / gain : ahConfigured;
  return {
    feasible: true,
    currentA: current,
    runtimeH: (b.installed ? ahWith : ahWithout) / current,
    runtimeBalancedH: ahWith / current,
    efficiency,
    overContinuous: current > physics.continuousA,
  };
}

/** Recheck current at the low-voltage end for constant-power loads. A nominal
 * current calculation alone can under-size protection as the battery drains. */
export function assessPackLoad(result: PackResult, load: LoadSpec): { safe: boolean; reasons: string[]; requiredA: number; runtimeH: number } {
  const valid = load.mode === "A" ? Number.isFinite(load.amps) && load.amps > 0 && load.amps <= PACK_LIMITS.maxLoadCurrentA
    : Number.isFinite(load.watts) && load.watts > 0 && load.watts <= 5000;
  if (!valid) return { safe: false, reasons: ["Enter a positive load within the builder's supported range."], requiredA: Infinity, runtimeH: 0 };
  const sim = simulateLoad(result, load);
  const lowCurrent = load.mode === "A" ? load.amps : currentForPower(
    load.watts / deliveryEfficiency(result, load), result.physics.cutoffVoltage, result.physics.resistanceMohm / 1000,
  );
  const requiredA = lowCurrent === null ? Infinity : Math.max(lowCurrent, sim.currentA);
  const reasons: string[] = [];
  if (!sim.feasible || !Number.isFinite(requiredA) || requiredA > result.physics.continuousA) {
    reasons.push("This load exceeds the estimated continuous output, including low-voltage operation.");
  }
  if (!result.bms.ratedCurrentA || requiredA * BMS_HEADROOM > result.bms.ratedCurrentA + 0.001) {
    reasons.push("The protection board needs at least 20% current headroom for this load.");
  }
  if (!Number.isFinite(result.physics.tempRiseC) || result.physics.tempRiseC > 35) reasons.push("Estimated heating is too high for an automatic recommendation.");
  return { safe: reasons.length === 0, reasons, requiredA, runtimeH: sim.feasible ? sim.runtimeH : 0 };
}

/** Smallest parallel count that meets the target runtime and current headroom. */
export function sizeParallel(
  config: PackConfiguration,
  load: LoadSpec,
  targetH: number,
  products: PackCatalogEntry[],
): { parallel: number; reachable: boolean } {
  const maxP = Math.min(PACK_LIMITS.maxParallel, Math.floor(PACK_LIMITS.maxCells / config.series));
  // Size the core pack, not its optional accessories: a bag fitted to the
  // current pack can cease fitting a larger candidate. The UI removes such
  // extras only when the shopper actually applies a new configuration.
  for (let p = 1; p <= maxP; p += 1) {
    try {
      const candidate = withLoad({ ...config, parallel: p, extras: [] }, load);
      const result = calculatePack(candidate, { products });
      const assessment = assessPackLoad(result, load);
      if (result.available && assessment.safe && assessment.runtimeH >= targetH) return { parallel: p, reachable: true };
    } catch {
      // An unavailable or unsupported candidate is not a valid recommendation.
    }
  }
  return { parallel: config.parallel, reachable: false };
}

/** Integer pack current for BMS sizing; recomputed whenever voltage changes. */
export function withLoad(config: PackConfiguration, load: LoadSpec): PackConfiguration {
  if (load.mode === "A") return { ...config, loadCurrentA: clampAmps(load.amps) };
  const cell = PACK_CELLS[config.cellId];
  const voltage = config.series * cell.nominalVoltage;
  const efficiency = load.ac ? 0.87 : 0.92;
  return { ...config, loadCurrentA: clampAmps(Math.ceil(load.watts / efficiency / voltage)) };
}

const clampAmps = (amps: number) => Math.max(1, Math.min(PACK_LIMITS.maxLoadCurrentA, Math.round(amps)));

/* Voltage classes: series counts that serve the same devices per chemistry. */
const VOLTAGE_CLASSES = [
  { v: 12, liion: 3, lfp: 4 },
  { v: 24, liion: 7, lfp: 8 },
  { v: 36, liion: 10, lfp: 12 },
  { v: 48, liion: 13, lfp: 16 },
  { v: 60, liion: 16, lfp: 19 },
  { v: 72, liion: 20, lfp: 23 },
];

export function equivalentSeries(fromCell: CellId, series: number, toCell: CellId): number {
  if ((fromCell === "lifepo4-32700") === (toCell === "lifepo4-32700")) return series;
  const voltage = series * PACK_CELLS[fromCell].nominalVoltage;
  const lfp = toCell === "lifepo4-32700";
  const match = VOLTAGE_CLASSES.find((entry) => Math.abs(entry.v - voltage) / entry.v <= 0.12);
  if (match) return lfp ? match.lfp : match.liion;
  return Math.max(1, Math.min(PACK_LIMITS.maxSeries, Math.round(voltage / PACK_CELLS[toCell].nominalVoltage - 0.01)));
}

export type OptimizedOption = {
  /** Every criterion this option wins — duplicates are merged. */
  wins: Array<"value" | "light" | "life">;
  config: PackConfiguration;
  result: PackResult;
  runtimeH: number;
};

/**
 * For the same chemistry, voltage and load, find the cheapest, lightest and
 * longest-lasting buildable pack that meets the target runtime.
 */
export function optimizePack(
  base: PackConfiguration,
  load: LoadSpec,
  targetH: number,
  products: PackCatalogEntry[],
): OptimizedOption[] {
  const candidates: Array<{ config: PackConfiguration; result: PackResult; runtimeH: number }> = [];
  for (const cellId of Object.keys(PACK_CELLS) as CellId[]) {
    if ((cellId === "lifepo4-32700") !== (base.cellId === "lifepo4-32700")) continue;
    const series = equivalentSeries(base.cellId, base.series, cellId);
    const sized = sizeParallel({ ...base, cellId, series, extras: [] }, load, targetH, products);
    if (!sized.reachable) continue;
    const config = withLoad({ ...base, cellId, series, parallel: sized.parallel, extras: [] }, load);
    try {
      const result = calculatePack(config, { products });
      if (!result.available || !assessPackLoad(result, load).safe) continue;
      candidates.push({ config, result, runtimeH: simulateLoad(result, load).runtimeH });
    } catch {
      /* configuration not buildable */
    }
  }
  if (candidates.length === 0) return [];
  const pick = (score: (entry: (typeof candidates)[number]) => number) => [...candidates].sort((a, b) => score(a) - score(b))[0];
  const winners: Array<["value" | "light" | "life", (typeof candidates)[number]]> = [
    ["value", pick((entry) => entry.result.price)],
    ["light", pick((entry) => entry.result.weightKg)],
    ["life", pick((entry) => -entry.result.physics.cycleLife * Math.min(entry.runtimeH, targetH * 1.5))],
  ];
  const merged = new Map<string, OptimizedOption>();
  for (const [id, entry] of winners) {
    const key = entry.result.slug;
    const existing = merged.get(key);
    if (existing) existing.wins.push(id);
    else merged.set(key, { wins: [id], config: entry.config, result: entry.result, runtimeH: entry.runtimeH });
  }
  return [...merged.values()];
}

export function formatRuntime(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  if (hours >= 48) return `${Math.round(hours / 24)} days`;
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
