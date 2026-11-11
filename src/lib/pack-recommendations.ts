/**
 * Smart pack-builder recommendations ("recommended capsule").
 *
 * The workshop can tune every part of this feature from the merchant console:
 * which part is featured, when it is eligible, how strongly build signals are
 * weighted, the badge/benefit copy, and whether a customer can add the part
 * straight into their custom pack. Rules are deterministic, compatibility
 * aware, and shared by the storefront and the admin preview.
 */
import { PACK_OPTIONAL_EXTRAS, type PackCatalogEntry, type PackResult, type PackSuggestion } from "@/lib/pack-builder";

export type RecommendationStrategy = "smart" | "pinned" | "off";
export type PackChemistryFilter = "any" | "li-ion" | "lifepo4";

export type PackRecommendationSettings = {
  enabled: boolean;
  /** smart = score every part, pinned = always feature the chosen part, off = hide capsule. */
  strategy: RecommendationStrategy;
  featuredSlug: string;
  badgeLabel: string;
  headline: string;
  detail: string;
  gainPct: number;
  minSeries: number;
  minParallel: number;
  minEnergyWh: number;
  chemistry: PackChemistryFilter;
  scoreThreshold: number;
  balanceWeight: number;
  backupWeight: number;
  protectionWeight: number;
  pinnedBoost: number;
  boostSlugs: string[];
  hiddenSlugs: string[];
  allowAddToPack: boolean;
  showScore: boolean;
};

export const RECOMMENDABLE_PARTS: Array<{ slug: string; label: string; kind: string }> = [
  { slug: "5a-active-balancer", label: "5A active balancer", kind: "balance" },
  { slug: "lipo-safe-fireproof-bag", label: "Battery storage bag", kind: "safety" },
  { slug: "tp4056-type-c-charger-module", label: "Type-C 1S charge module", kind: "charger" },
  { slug: "30a-mppt-solar-charge-controller", label: "30A MPPT solar controller", kind: "charger" },
  { slug: "dc-dc-60v-12v-10a", label: "DC-DC 60V→12V converter", kind: "charger" },
  { slug: "pure-sine-inverter-1kva-24v", label: "1kVA pure sine inverter", kind: "charger" },
  { slug: "3s-20a-bms-balance", label: "3S 20A BMS", kind: "protection" },
  { slug: "daly-smart-bms-4s-40a", label: "Daly smart 4S BMS", kind: "protection" },
  { slug: "jk-smart-bms-24s-200a", label: "JK smart 24S BMS", kind: "protection" },
];

export const DEFAULT_PACK_RECOMMENDATIONS: PackRecommendationSettings = {
  enabled: true,
  strategy: "smart",
  featuredSlug: "5a-active-balancer",
  badgeLabel: "RECOMMENDED",
  headline: "+{gain}% backup · +{life}% lifespan",
  detail:
    "Keeps all {series} groups matched while the pack works, so the weakest group stops cutting backup short and the pack ages evenly.",
  gainPct: 18,
  minSeries: 2,
  minParallel: 1,
  minEnergyWh: 30,
  chemistry: "any",
  scoreThreshold: 55,
  balanceWeight: 100,
  backupWeight: 100,
  protectionWeight: 100,
  pinnedBoost: 10,
  boostSlugs: [],
  hiddenSlugs: [],
  allowAddToPack: true,
  showScore: true,
};

const STRATEGIES: RecommendationStrategy[] = ["smart", "pinned", "off"];
const CHEMISTRIES: PackChemistryFilter[] = ["any", "li-ion", "lifepo4"];
const SLUGS = RECOMMENDABLE_PARTS.map((part) => part.slug);

function num(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
function str(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}
function slugs(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && SLUGS.includes(entry)))].slice(0, 12);
}

/** Allow-list sanitizer: bad admin input or an old save can never break the builder. */
export function sanitizePackRecommendations(input: unknown): PackRecommendationSettings {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const d = DEFAULT_PACK_RECOMMENDATIONS;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : d.enabled,
    strategy: STRATEGIES.includes(raw.strategy as RecommendationStrategy) ? (raw.strategy as RecommendationStrategy) : d.strategy,
    featuredSlug: SLUGS.includes(raw.featuredSlug as string) ? (raw.featuredSlug as string) : d.featuredSlug,
    badgeLabel: str(raw.badgeLabel, d.badgeLabel, 40),
    headline: str(raw.headline, d.headline, 180),
    detail: str(raw.detail, d.detail, 420),
    gainPct: num(raw.gainPct, 0, 60, d.gainPct),
    minSeries: num(raw.minSeries, 1, 24, d.minSeries),
    minParallel: num(raw.minParallel, 1, 12, d.minParallel),
    minEnergyWh: num(raw.minEnergyWh, 0, 10_000, d.minEnergyWh),
    chemistry: CHEMISTRIES.includes(raw.chemistry as PackChemistryFilter) ? (raw.chemistry as PackChemistryFilter) : d.chemistry,
    scoreThreshold: num(raw.scoreThreshold, 0, 150, d.scoreThreshold),
    balanceWeight: num(raw.balanceWeight, 0, 200, d.balanceWeight),
    backupWeight: num(raw.backupWeight, 0, 200, d.backupWeight),
    protectionWeight: num(raw.protectionWeight, 0, 200, d.protectionWeight),
    pinnedBoost: num(raw.pinnedBoost, 0, 100, d.pinnedBoost),
    boostSlugs: slugs(raw.boostSlugs, d.boostSlugs),
    hiddenSlugs: slugs(raw.hiddenSlugs, d.hiddenSlugs),
    allowAddToPack: typeof raw.allowAddToPack === "boolean" ? raw.allowAddToPack : d.allowAddToPack,
    showScore: typeof raw.showScore === "boolean" ? raw.showScore : d.showScore,
  };
}

export type ScoredSuggestion = PackSuggestion & {
  score: number;
  recommended: boolean;
  rank: number;
  reasons: string[];
  impact: string;
  gainPct: number;
  headline: string;
  badgeLabel: string;
  detail: string;
  showScore: boolean;
  allowAddToPack: boolean;
  extraMinutes: number;
};

export type PackIntelligence = {
  chemistry: "li-ion" | "lifepo4";
  backupMinutes: number;
  imbalanceRisk: number;
  eligible: boolean;
  eligibilityNote: string;
};

export function analysePack(result: PackResult, settings: PackRecommendationSettings): PackIntelligence {
  const { config } = result;
  const chemistry: "li-ion" | "lifepo4" = config.cellId === "lifepo4-32700" ? "lifepo4" : "li-ion";
  const backupMinutes = Math.max(1, Math.round(result.physics.runtimeH * 60));
  const imbalanceRisk = Math.min(100, Math.round(result.physics.balance.mismatchAgedPct * 10 + result.physics.balance.driftPct * 10));
  const checks: string[] = [];
  if (config.series < settings.minSeries) checks.push(`at least ${settings.minSeries}S`);
  if (config.parallel < settings.minParallel) checks.push(`at least ${settings.minParallel}P`);
  if (result.energyWh < settings.minEnergyWh) checks.push(`at least ${settings.minEnergyWh}Wh`);
  if (settings.chemistry !== "any" && settings.chemistry !== chemistry) checks.push(`${settings.chemistry} chemistry`);
  return {
    chemistry,
    backupMinutes,
    imbalanceRisk,
    eligible: checks.length === 0,
    eligibilityNote: checks.length ? `Capsule hidden — this build needs ${checks.join(", ")}.` : "Capsule active for this build.",
  };
}

function baseScore(kind: PackSuggestion["kind"]): number {
  switch (kind) {
    case "balance":
      return 30;
    case "bms":
      return 30;
    case "safety":
      return 18;
    case "charger":
      return 22;
    default:
      return 12;
  }
}

const fmtPct = (value: number) => (value < 10 ? Math.round(value * 10) / 10 : Math.round(value));

/** Fills placeholders and drops " · " segments that would read "+0%" or "+0 min". */
function renderCopy(template: string, vars: Record<string, string | number>): string {
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
  const parts = template.split(" · ").map(fill).filter((part) => !/(^|\s)\+?0(\.0)?\s?(%|min)/.test(part));
  return parts.join(" · ") || fill(template);
}

/**
 * Ranks every compatible suggestion with a transparent, deterministic score
 * derived from the pack physics. The highest eligible part gets the capsule.
 */
export function scorePackSuggestions(
  result: PackResult,
  suggestions: PackSuggestion[],
  settingsInput: PackRecommendationSettings | unknown,
): ScoredSuggestion[] {
  const settings = sanitizePackRecommendations(settingsInput);
  const intelligence = analysePack(result, settings);
  const { config, physics } = result;
  const b = physics.balance;
  const gain = fmtPct(Math.min(settings.gainPct, b.gainAgedPct));
  const life = b.cycleGainPct;
  const extraMinutes = Math.round((intelligence.backupMinutes * gain) / 100);
  const bmsActive = b.method === "active" && !b.installed;
  const vars = {
    gain, life, minutes: extraMinutes,
    series: config.series, parallel: config.parallel,
    pack: `${config.series}S${config.parallel}P`, energy: result.energyWh, load: config.loadCurrentA,
  };

  const candidates = suggestions
    .filter((suggestion) => !settings.hiddenSlugs.includes(suggestion.product.slug))
    .map((suggestion, index) => {
      const { product, kind } = suggestion;
      let score = baseScore(kind);
      const reasons: string[] = [];

      if (kind === "balance") {
        score -= 10;
        score += (gain * 6 + life * 1.2 + b.driftPct * 3) * (settings.balanceWeight / 100);
        score += bmsActive ? -25 : 10;
        score += (physics.runtimeH >= 1 ? 6 : 2) * (settings.backupWeight / 100);
        reasons.push(`Weakest of ${config.series} groups costs ~${b.mismatchAgedPct}% capacity as cells age.`);
        reasons.push(
          bmsActive
            ? `Your BMS already balances actively at ${b.bmsBalanceA}A.`
            : `The BMS only bleeds ${Math.round(b.bmsBalanceA * 1000)}mA at full charge — it can't fix mismatch during use.`,
        );
        if (life > 0) reasons.push(`+${life}% cycle life: no group gets over-discharged.`);
        if (b.driftPct > 0) reasons.push(`Corrects ~${b.driftPct}% self-discharge drift the BMS can't.`);
      } else if (kind === "safety" || kind === "bms") {
        score += Math.min(20, config.series * 1.5 + (result.bms.ratedCurrentA === null ? 10 : 0)) * (settings.protectionWeight / 100);
        reasons.push(suggestion.reason, `Sized for ${result.dimensionsMm.length}×${result.dimensionsMm.width}×${result.dimensionsMm.height} mm.`);
      } else if (kind === "charger") {
        score += (config.series === 1 ? 16 : intelligence.chemistry === "lifepo4" ? 12 : 4) * (settings.backupWeight / 100);
        reasons.push(suggestion.reason, `Matches the ${result.chargeVoltage}V charge ceiling.`);
      } else {
        reasons.push(suggestion.reason);
      }

      if (settings.boostSlugs.includes(product.slug)) score += settings.pinnedBoost;
      if (product.slug === settings.featuredSlug) score += settings.pinnedBoost * (settings.strategy === "pinned" ? 2 : 1);
      if (settings.strategy === "pinned" && product.slug === settings.featuredSlug) score += 200;

      const impact = kind === "balance"
        ? renderCopy("+{gain}% backup · +{life}% lifespan", vars)
        : `Fits this ${vars.pack} build`;
      return {
        ...suggestion,
        score: Math.max(0, Math.min(100, Math.round(score))),
        recommended: false,
        rank: index,
        reasons: [...new Set(reasons)].slice(0, 4),
        impact,
        gainPct: gain,
        headline: renderCopy(settings.headline, vars),
        badgeLabel: settings.badgeLabel,
        detail: renderCopy(settings.detail, vars),
        showScore: settings.showScore,
        allowAddToPack: settings.allowAddToPack,
        extraMinutes,
      };
    });

  const active = settings.enabled && settings.strategy !== "off" && intelligence.eligible;
  if (active) {
    let winner: ScoredSuggestion | null = null;
    for (const candidate of candidates) {
      const qualified = settings.strategy === "pinned"
        ? candidate.product.slug === settings.featuredSlug
        : candidate.score >= settings.scoreThreshold;
      if (!qualified) continue;
      if (!winner || candidate.score > winner.score || (candidate.score === winner.score && candidate.rank < winner.rank)) winner = candidate;
    }
    if (winner) {
      (winner as ScoredSuggestion).recommended = true;
      (winner as ScoredSuggestion).score = settings.strategy === "pinned" ? 100 : (winner as ScoredSuggestion).score;
    }
  }

  return candidates.sort(
    (a, b) => Number(b.recommended) - Number(a.recommended) || b.score - a.score || a.rank - b.rank,
  );
}

/**
 * Ranks the builder's own "Optional add-ons" (including ones already ticked),
 * so the recommended capsule sits directly on the part that improves the build.
 */
export function rankPackAddOns(
  result: PackResult,
  products: PackCatalogEntry[],
  settings: PackRecommendationSettings | unknown,
): Map<string, ScoredSuggestion> {
  if (!result.available) return new Map();
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const candidates: PackSuggestion[] = [];
  for (const extra of PACK_OPTIONAL_EXTRAS) {
    const product = bySlug.get(extra.slug);
    if (!product || product.stock < 1 || !extra.fits(result.config)) continue;
    candidates.push({ product, reason: extra.note, kind: extra.kind });
  }
  return new Map(scorePackSuggestions(result, candidates, settings).map((entry) => [entry.product.slug, entry]));
}

/* ------------------------------------------------------------------ */
/* Server sync: the console writes to PostgreSQL; localStorage mirrors it.  */
/* ------------------------------------------------------------------ */

const ENDPOINT = "/api/pack-recommendations";

export async function loadPackRecommendationSettings(): Promise<PackRecommendationSettings | null> {
  try {
    const response = await fetch(ENDPOINT, { headers: { "x-requested-with": "fetch" }, cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { settings?: unknown };
    if (!payload.settings) return null;
    return sanitizePackRecommendations(payload.settings);
  } catch {
    return null;
  }
}

export async function savePackRecommendationSettings(
  settings: PackRecommendationSettings,
): Promise<{ ok: boolean; persisted: "postgres" | "memory" | "local" }> {
  const clean = sanitizePackRecommendations(settings);
  try {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-requested-with": "fetch" },
      body: JSON.stringify({ settings: clean }),
    });
    if (!response.ok) return { ok: true, persisted: "local" };
    const payload = (await response.json()) as { persisted?: string };
    return { ok: true, persisted: payload.persisted === "postgres" ? "postgres" : "memory" };
  } catch {
    return { ok: true, persisted: "local" };
  }
}
