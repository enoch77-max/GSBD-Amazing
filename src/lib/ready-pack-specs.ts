import { PACK_CELLS, type Chemistry, type PackCatalogEntry } from "./pack-builder";

export type ReadyPackSpecs = {
  chemistry: Chemistry | null;
  series: number | null;
  parallel: number | null;
  nominalVoltage: number | null;
  chargeVoltage: number | null;
  cutoffVoltage: number | null;
  capacityAh: number | null;
  energyWh: number | null;
  continuousA: number | null;
  bmsCurrentA: number | null;
  connector: string | null;
  regulated: boolean;
  issues: string[];
  notes: string[];
};

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const positive = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value > 0 ? value : null;

function unit(text: string, expression: RegExp): number | null {
  if (/(?:^|\s)-\s*\d|\d\s*[-\u2013\u2014]\s*\d|\d[eE][+-]?\d/.test(text)) return null;
  const match = text.match(expression);
  return match ? positive(Number(match[1].replace(/,/g, ""))) : null;
}
const volts = (text: string) => unit(text, /([\d,]+(?:\.\d+)?)\s*V\b/i);
const amps = (text: string) => unit(text, /([\d,]+(?:\.\d+)?)\s*A\b/i);
function ah(text: string): number | null {
  if (/(?:^|\s)-\s*\d|\d\s*[-\u2013\u2014]\s*\d|\d[eE][+-]?\d/.test(text)) return null;
  const match = text.match(/([\d,]+(?:\.\d+)?)\s*(m?Ah)\b/i);
  return match ? positive(Number(match[1].replace(/,/g, "")) / (match[2].toLowerCase() === "mah" ? 1000 : 1)) : null;
}
function explicitChemistry(text: string): Chemistry | null {
  const lfp = /lifepo4|\blfp\b|lithium\s*iron\s*phosphate/i.test(text);
  const liion = /li[ -]?ion|lithium[ -]?ion|\bnmc\b|\bnca\b/i.test(text);
  return lfp === liion ? null : lfp ? "lifepo4" : "li-ion";
}

/** A catalogue slot, service deposit, or made-to-order listing is not shelf stock. */
export function isStockedReadyPack(product: PackCatalogEntry, quantity = 1): boolean {
  if (product.categorySlug !== "battery-packs" || product.visible === false ||
      !Number.isFinite(product.stock) || product.stock < quantity ||
      !Number.isFinite(product.price) || product.price <= 0) return false;
  const specs = Array.isArray(product.specs) ? product.specs.filter((s) => s && typeof s.label === "string" && typeof s.value === "string") : [];
  const description = [product.name, product.badge, product.shortDescription, product.description,
    ...specs.filter((s) => /fulfil|fulfill|availability|producttype|leadtime/i.test(key(s.label))).map((s) => s.value)].join(" ").replace(/[\u2013\u2014]/g, "-");
  return !/built[ -]to[ -]order|made[ -]to[ -](?:order|spec)|build service|assembly service|design service|deposit|pre[ -]?order|back[ -]?order/i.test(description);
}

/** Parse named specification fields, retaining uncertainty instead of guessing
 * from a pack's marketing name. BMS amps are NOT pack-level discharge amps. */
export function readReadyPackSpecs(product: PackCatalogEntry): ReadyPackSpecs {
  const issues: string[] = [];
  const notes: string[] = [];
  const fields = new Map<string, string>();
  for (const spec of Array.isArray(product.specs) ? product.specs : []) {
    if (!spec || typeof spec.label !== "string" || typeof spec.value !== "string") continue;
    const label = key(spec.label);
    const value = spec.value.trim();
    if (fields.has(label) && fields.get(label) !== value) issues.push(`Conflicting ${spec.label.toLowerCase()} specifications.`);
    fields.set(label, value);
  }
  const get = (...names: string[]) => names.map((name) => fields.get(key(name))).find(Boolean) ?? "";
  const configuration = get("Configuration", "Pack configuration");
  const sp = configuration.match(/\b(\d+)\s*S\s*(\d+)\s*P\b/i);
  const seriesText = get("Series", "Series count");
  const parallelText = get("Parallel", "Parallel count");
  const series = positive(Number(sp?.[1] ?? seriesText.match(/^\s*(\d+)\s*S?\s*$/i)?.[1]));
  const parallel = positive(Number(sp?.[2] ?? parallelText.match(/^\s*(\d+)\s*P?\s*$/i)?.[1]));
  if (!series || series > 48) issues.push("Series count is missing or outside the supported catalogue range.");

  const declaredChemistry = get("Chemistry", "Battery chemistry", "Cell chemistry");
  const cellText = get("Cells", "Cell model");
  const knownCell = Object.values(PACK_CELLS).find((cell) => cellText.toLowerCase().includes(cell.label.toLowerCase()));
  const cellChemistry = explicitChemistry(cellText) ?? (knownCell ? knownCell.id === "lifepo4-32700" ? "lifepo4" : "li-ion" : null);
  const chemistry = declaredChemistry ? explicitChemistry(declaredChemistry) : cellChemistry;
  if (!chemistry) issues.push("A single, explicit battery chemistry is required.");
  if (declaredChemistry && cellChemistry && chemistry !== cellChemistry) issues.push("Cell model and declared chemistry disagree.");
  if (!declaredChemistry && knownCell) notes.push(`Chemistry comes from the listed ${knownCell.label} cell profile.`);

  const configuredCapacity = ah(configuration);
  const capacityText = get("Capacity", "Rated capacity", "Pack capacity");
  const listedCapacity = ah(capacityText);
  const capacityAh = listedCapacity ?? configuredCapacity;
  if (capacityText && !listedCapacity) issues.push("The capacity field could not be validated.");
  if (!capacityAh) issues.push("Rated capacity in Ah or mAh is missing.");
  if (listedCapacity && configuredCapacity && Math.abs(listedCapacity / configuredCapacity - 1) > 0.05) issues.push("Capacity fields disagree.");
  if (knownCell && parallel && capacityAh && Math.abs(capacityAh / (knownCell.capacityAh * parallel) - 1) > 0.15) {
    issues.push("Capacity does not agree with the listed cell model and parallel count.");
  }

  const derivedNominal = series && chemistry ? series * (chemistry === "lifepo4" ? 3.2 : 3.6) : null;
  const derivedCharge = series && chemistry ? series * (chemistry === "lifepo4" ? 3.65 : 4.2) : null;
  const nominalText = get("Nominal voltage", "Battery voltage", "Pack voltage");
  const chargeText = get("Charge voltage", "Charge ceiling", "Maximum charge voltage", "Full charge voltage");
  const cutoffText = get("Cutoff voltage", "Cut-off voltage", "Discharge cutoff");
  const listedNominal = volts(nominalText);
  const listedCharge = volts(chargeText);
  const listedCutoff = volts(cutoffText);
  if (nominalText && !listedNominal) issues.push("The nominal voltage field could not be validated.");
  if (chargeText && !listedCharge) issues.push("The charge voltage field could not be validated.");
  if (cutoffText && !listedCutoff) issues.push("The cutoff voltage field could not be validated.");
  const nominalVoltage = listedNominal ?? derivedNominal;
  const chargeVoltage = listedCharge ?? derivedCharge;
  const cutoffVoltage = listedCutoff ?? (series && chemistry ? series * (chemistry === "lifepo4" ? 2.8 : 3) : null);
  if (listedNominal && derivedNominal && Math.abs(listedNominal / derivedNominal - 1) > 0.04) issues.push("Nominal voltage disagrees with chemistry and series count.");
  if (listedCharge && derivedCharge && Math.abs(listedCharge - derivedCharge) > 0.15) issues.push("Charge voltage disagrees with the standard chemistry profile.");
  if (cutoffVoltage && nominalVoltage && cutoffVoltage >= nominalVoltage) issues.push("Discharge cutoff must be below nominal voltage.");
  const configurationVoltage = volts(configuration);
  if (configurationVoltage && derivedNominal && derivedCharge &&
      Math.abs(configurationVoltage / derivedNominal - 1) > 0.04 && Math.abs(configurationVoltage - derivedCharge) > 0.15) {
    issues.push("Configuration voltage cannot be reconciled with the specified cells.");
  }
  if (!listedNominal || !listedCharge || !listedCutoff) notes.push("Missing voltage limits use standard cell-profile estimates; confirm the charger's settings and device input range.");
  if (cutoffVoltage && chargeVoltage) notes.push(`Confirm that your device accepts the full ${Math.round(cutoffVoltage * 100) / 100}-${Math.round(chargeVoltage * 100) / 100}V operating window.`);

  const continuousText = get("Continuous discharge current", "Continuous discharge", "Continuous current", "Continuous output current", "Discharge current");
  // A combined field is only valid if the continuous number is explicitly identified.
  const continuousMatch = continuousText.match(/([\d.]+)\s*A\s*(?:continuous|cont\b)/i)
    ?? continuousText.match(/(?:continuous|cont\b)\s*[:=]?\s*([\d.]+)\s*A/i);
  const invalidCurrent = /(?:^|\s)-\s*\d|\d\s*[-\u2013\u2014]\s*\d|\d[eE][+-]?\d/.test(continuousText);
  const continuousA = invalidCurrent ? null : continuousMatch ? positive(Number(continuousMatch[1]))
    : !/peak|burst|pulse|\b\d+\s*s\b/i.test(continuousText) ? amps(continuousText) : null;
  if (!continuousA) issues.push("Pack-level continuous discharge rating is missing; BMS or peak current alone is not enough.");
  const bmsText = get("BMS", "Protection");
  const bmsCurrentA = /peak|burst|pulse/i.test(bmsText)
    ? unit(bmsText, /([\d.]+)\s*A\s*continuous/i) : amps(bmsText);
  if (!bmsText || /not included|no bms|unprotected|without/i.test(bmsText)) issues.push("Built-in battery protection is not confirmed.");

  let energyWh = nominalVoltage && capacityAh ? nominalVoltage * capacityAh : null;
  const listedEnergy = get("Energy", "Rated energy").match(/([\d,]+(?:\.\d+)?)\s*(k?Wh)\b/i);
  if (listedEnergy && energyWh) {
    const value = Number(listedEnergy[1].replace(/,/g, "")) * (listedEnergy[2].toLowerCase() === "kwh" ? 1000 : 1);
    if (Math.abs(value / energyWh - 1) > 0.1) issues.push("Energy and capacity specifications disagree.");
    else energyWh = Math.min(value, energyWh);
  }
  const output = get("Output", "Output voltage");
  const regulated = /regulat|converter|usb|\bpd\b/i.test(output);
  if (regulated) issues.push("Regulated output needs a separate device-level compatibility check.");
  const connector = get("Connector", "Output connector", "Terminals") || (output && !/\d\s*[VA]\b/i.test(output) ? output : null);
  notes.push(connector ? `Output: ${connector}. Confirm connector size and polarity.` : "Output connector and polarity need confirmation.");
  return { chemistry, series, parallel, nominalVoltage, chargeVoltage, cutoffVoltage, capacityAh, energyWh,
    continuousA, bmsCurrentA, connector, regulated, issues: [...new Set(issues)], notes };
}