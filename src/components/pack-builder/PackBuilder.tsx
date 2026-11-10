"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Battery, Check, CheckCircle2, Minus, Plus, RotateCcw, Settings2, ShieldCheck, Wrench, Zap } from "lucide-react";
import {
  PACK_CELLS, PACK_LIMITS, PACK_OPTIONAL_EXTRAS, calculatePack, normalizePackConfiguration,
  suggestPackProducts, type CellId, type PackConfiguration,
} from "@/lib/pack-builder";
import { useCart, type CartLine } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { readAllProducts } from "@/lib/queries";
import { useStoreVersion } from "@/lib/use-store";
import { STORE } from "@/lib/commerce";
import { PackVisual } from "./pack-visual";
import { PackSuggestions } from "./pack-suggestions";

const PRESETS: Array<{ label: string; detail: string; config: PackConfiguration }> = [
  { label: "Router backup", detail: "3S · 6Ah", config: { cellId: "18650", series: 3, parallel: 2, loadCurrentA: 10 } },
  { label: "12V solar", detail: "4S · 12Ah", config: { cellId: "lifepo4-32700", series: 4, parallel: 2, loadCurrentA: 15 } },
  { label: "36V e-bike", detail: "10S · 12.6Ah", config: { cellId: "21700", series: 10, parallel: 3, loadCurrentA: 30 } },
];

function initialConfiguration(search: { get: (key: string) => string | null }): PackConfiguration {
  const fallback = { cellId: "18650" as CellId, series: 4, parallel: 2, loadCurrentA: 10, extras: [] };
  const cell = search.get("cell");
  const rawExtras = search.get("extras");
  try {
    return normalizePackConfiguration({
      cellId: cell && Object.hasOwn(PACK_CELLS, cell) ? cell : fallback.cellId,
      series: search.get("s") ?? fallback.series,
      parallel: search.get("p") ?? fallback.parallel,
      loadCurrentA: search.get("load") ?? fallback.loadCurrentA,
      extras: rawExtras ? rawExtras.split(",").filter(Boolean) : [],
    });
  } catch {
    return fallback;
  }
}

export function PackBuilder() {
  const catalogueVersion = useStoreVersion();
  const search = useSearchParams();
  const cart = useCart();
  const [config, setConfig] = useState<PackConfiguration>(() => initialConfiguration(search));
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const editSlug = search.get("edit");
  const editingLine = editSlug ? cart.lines.find((line) => line.slug === editSlug && line.customPack) : undefined;
  const searchKey = search.toString();
  useEffect(() => {
    // Editing can navigate from the bag to this same route, changing only the query.
    if (new URLSearchParams(searchKey).has("edit")) {
      setConfig(initialConfiguration(new URLSearchParams(searchKey)));
      setNotice("");
    }
  }, [searchKey]);
  const catalogue = useMemo(() => { void catalogueVersion; return readAllProducts(); }, [catalogueVersion]);
  const result = useMemo(() => calculatePack(config, { products: catalogue }), [config, catalogue]);
  const suggestions = useMemo(() => suggestPackProducts(result, catalogue), [result, catalogue]);
  const selectedExtras = new Set(result.config.extras);
  const productsBySlug = new Map(catalogue.map((product) => [product.slug, product]));

  function change(next: Partial<PackConfiguration>) {
    setConfig((current) => {
      const candidate = { ...current, ...next };
      if (candidate.series * candidate.parallel > PACK_LIMITS.maxCells) {
        setNotice(`A build is limited to ${PACK_LIMITS.maxCells} cells. Reduce one count first.`);
        return current;
      }
      const extras = (candidate.extras ?? []).filter((slug) =>
        PACK_OPTIONAL_EXTRAS.some((extra) => extra.slug === slug && extra.fits(candidate as Parameters<typeof extra.fits>[0])),
      );
      setNotice(extras.length !== (candidate.extras ?? []).length ? "An add-on was removed because it does not fit this configuration." : "");
      return { ...candidate, extras };
    });
  }

  function toggleExtra(slug: string) {
    const current = config.extras ?? [];
    change({ extras: current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug] });
  }

  function addPack() {
    if (!result.available) return;
    const line: Omit<CartLine, "qty"> = {
      id: 0, slug: result.slug, name: result.name, brand: "Glowing Space Lab",
      price: result.price, image: result.cell.image, stock: result.maxPacks,
      customPack: result.config, packComponents: result.components,
    };
    if (editingLine) cart.replaceItem(editingLine.slug, line);
    else cart.addItem(line);
    cart.openCart();
  }

  async function share() {
    const params = new URLSearchParams({ cell: result.config.cellId, s: String(result.config.series), p: String(result.config.parallel), load: String(result.config.loadCurrentA) });
    if (result.config.extras.length) params.set("extras", result.config.extras.join(","));
    const url = `${window.location.origin}/pack-builder?${params.toString()}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copy this configuration link", url); }
  }

  const quoteMessage = encodeURIComponent(`Hi, could you quote a ${result.config.series}S${result.config.parallel}P ${result.cell.label} pack for a ${result.config.loadCurrentA}A continuous load?`);
  return (
    <>
      <div className="builder-layout">
        <div className="builder-main">
          <section className="builder-section" aria-labelledby="cell-heading">
            <div className="builder-section-heading"><div><span className="builder-step">STEP 01</span><h2 id="cell-heading">Choose your cells</h2><p>Each build uses new, matched cells from our catalogue.</p></div><button type="button" className="builder-reset" onClick={() => { setConfig({ cellId: "18650", series: 4, parallel: 2, loadCurrentA: 10, extras: [] }); setNotice(""); }}><RotateCcw size={14} /> Reset</button></div>
            <div className="builder-cell-grid" role="group" aria-label="Cell type">
              {Object.values(PACK_CELLS).map((cell) => {
                const product = productsBySlug.get(({ "18650": "samsung-inr18650-30q", "21700": "molicel-p42a-21700", "lifepo4-32700": "lifepo4-32700-6000" } as const)[cell.id]);
                return (
                  <button key={cell.id} type="button" className="builder-cell-option" data-selected={config.cellId === cell.id} aria-pressed={config.cellId === cell.id} onClick={() => change({ cellId: cell.id })}>
                    <span className="builder-cell-top"><span className="builder-cell-mark"><Battery size={18} /></span><span className="builder-cell-check"><Check size={13} strokeWidth={2.5} /></span></span>
                    <strong>{cell.shortLabel}</strong><span>{cell.label}</span><small>{cell.capacityAh}Ah · {cell.nominalVoltage}V / cell</small>
                    <b>{product ? `${formatBDT(product.price)} / cell` : "Price unavailable"}</b>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="builder-section" aria-labelledby="layout-heading">
            <div className="builder-section-heading"><div><span className="builder-step">STEP 02</span><h2 id="layout-heading">Set your configuration</h2><p>Series sets voltage; parallel increases capacity.</p></div></div>
            <div className="builder-controls">
              <CountControl label="Series" suffix="S" description="Sets your pack voltage" value={config.series} min={1} max={24} onChange={(series) => change({ series })} />
              <CountControl label="Parallel" suffix="P" description="Sets capacity and runtime" value={config.parallel} min={1} max={12} onChange={(parallel) => change({ parallel })} />
            </div>
            <div className="builder-load">
              <div><label htmlFor="pack-load">Expected continuous load</label><p>Helps us select a BMS with enough current capacity.</p></div>
              <div className="builder-load-input"><input id="pack-load" type="number" min="1" max="200" value={config.loadCurrentA ?? 10} onChange={(event) => change({ loadCurrentA: Math.max(1, Math.min(200, Math.floor(Number(event.target.value) || 1))) })} /><span>A</span></div>
            </div>
            {notice && <p className="builder-notice" role="status"><AlertCircle size={15} /> {notice}</p>}
            <div className="builder-presets"><span>Start with a preset</span><div>{PRESETS.map((preset) => <button key={preset.label} type="button" onClick={() => { setConfig({ ...preset.config, extras: [] }); setNotice(""); }}><strong>{preset.label}</strong><small>{preset.detail}</small></button>)}</div></div>
          </section>

          <section className="builder-section builder-components" aria-labelledby="included-heading">
            <div className="builder-section-heading"><div><span className="builder-step">STEP 03</span><h2 id="included-heading">What’s included</h2><p>Every essential is included in the price. Protection cannot be removed.</p></div><span className="builder-included-badge"><Check size={13} /> Included</span></div>
            <ul className="builder-bom">
              {result.components.filter((component) => component.required).map((component) => (
                <li key={component.key} className="builder-bom-row" data-available={component.available}>
                  <span className="builder-bom-check" role="checkbox" aria-checked={component.available} aria-disabled="true" aria-label={`${component.name}: ${component.available ? "required and included" : "required but unavailable"}`}>{component.available ? <Check size={14} strokeWidth={2.7} /> : <AlertCircle size={14} />}</span>
                  <span className="builder-bom-icon">{component.kind === "cells" ? <Battery size={18} /> : component.kind === "bms" ? <ShieldCheck size={18} /> : component.kind === "testing" ? <CheckCircle2 size={18} /> : <Wrench size={18} />}</span>
                  <span className="builder-bom-copy"><strong>{component.name}</strong><small>{component.note}</small>{component.qty > 1 && <small>{component.qty} × {formatBDT(component.unitPrice)}</small>}</span>
                  <span className="builder-bom-price">{component.available || component.total > 0 ? formatBDT(component.total) : "Quote needed"}<small>{component.available ? "Included" : "Unavailable"}</small></span>
                </li>
              ))}
            </ul>
            <div className="builder-extra-heading"><div><h3>Optional add-ons</h3><p>Tick an item to include it with this pack.</p></div><span>OPTIONAL</span></div>
            <div className="builder-extra-list">
              {PACK_OPTIONAL_EXTRAS.map((extra) => {
                const product = productsBySlug.get(extra.slug);
                const fits = extra.fits(result.config);
                const available = Boolean(product && product.stock > 0 && fits);
                const selected = selectedExtras.has(extra.slug);
                return (
                  <label key={extra.slug} className="builder-extra-row" data-selected={selected} data-disabled={!available && !selected}>
                    <input type="checkbox" checked={selected} disabled={!available && !selected} onChange={() => toggleExtra(extra.slug)} aria-label={`Include ${extra.label}`} />
                    <span className="builder-extra-check"><Check size={13} strokeWidth={3} /></span>
                    <span className="builder-extra-copy"><strong>{extra.label}</strong><small>{!fits ? extra.incompatibility : !product || product.stock < 1 ? "Currently out of stock." : extra.note}</small></span>
                    <span className="builder-extra-price">{product ? `+ ${formatBDT(product.price)}` : "Unavailable"}</span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="builder-summary" aria-label="Your pack summary">
          <div className="builder-summary-heading"><div><span className="builder-step">YOUR PACK</span><h2>{result.config.series}S{result.config.parallel}P {result.cell.shortLabel}</h2><p>{result.cell.label} · {result.cellCount} cells</p></div><span className="builder-summary-icon"><Zap size={18} /></span></div>
          <PackVisual result={result} />
          <div className="builder-metrics" aria-live="polite">
            <div><span>Nominal voltage</span><strong>{result.nominalVoltage}<small> V</small></strong></div>
            <div><span>Capacity</span><strong>{result.capacityAh}<small> Ah</small></strong></div>
            <div><span>Energy</span><strong>{result.energyWh}<small> Wh</small></strong></div>
            <div><span>Est. weight</span><strong>{result.weightKg}<small> kg</small></strong></div>
          </div>
          <div className="builder-dimensions"><span>Approx. dimensions</span><strong>{result.dimensionsMm.length} × {result.dimensionsMm.width} × {result.dimensionsMm.height} mm</strong></div>
          <div className="builder-protection"><ShieldCheck size={17} /><p><strong>{result.bms.ratedCurrentA ? `${result.bms.ratedCurrentA}A BMS selected` : "BMS confirmation needed"}</strong><span>{result.bms.name}. Charge ceiling: {result.chargeVoltage}V.</span></p></div>
          {result.availabilityNote && <div className="builder-warning" role="alert"><AlertCircle size={16} /><span>{result.availabilityNote}</span></div>}
          <div className="builder-total"><div><span>{result.bms.ratedCurrentA ? "Estimated build total" : "Build estimate incomplete"}</span><strong>{result.bms.ratedCurrentA ? formatBDT(result.price) : "Quote required"}</strong><small>{result.bms.ratedCurrentA ? `Includes ${result.components.length} line items` : "A compatible BMS must be confirmed"}</small></div><span>{result.bms.ratedCurrentA ? "BDT" : ""}</span></div>
          {result.available ? (
            <button type="button" onClick={addPack} className="builder-add-button"><ShoppingBagIcon /> {editingLine ? "Update build in bag" : "Add custom pack to bag"} <ArrowRight size={16} /></button>
          ) : (
            <a href={`https://wa.me/${STORE.whatsapp}?text=${quoteMessage}`} target="_blank" rel="noreferrer" className="builder-add-button">Ask the workshop for a quote <ArrowRight size={16} /></a>
          )}
          <p className="builder-disclaimer">Estimate based on current catalogue prices. Dimensions, BMS settings and the final connector need workshop confirmation.</p>
          <button type="button" className="builder-share" onClick={() => void share()}><Settings2 size={14} /> {copied ? "Configuration link copied" : "Share this configuration"}</button>
        </aside>
      </div>
      <PackSuggestions result={result} suggestions={suggestions} />
    </>
  );
}

function ShoppingBagIcon() { return <Battery size={17} />; }

function CountControl({ label, suffix, description, value, min, max, onChange }: { label: string; suffix: string; description: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="builder-count">
      <div><span>{label} <b>{suffix}</b></span><small>{description}</small></div>
      <div className="builder-stepper">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label.toLowerCase()}`}><Minus size={15} /></button>
        <input type="number" aria-label={`${label} count`} min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Math.floor(Number(event.target.value) || min))))} />
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label.toLowerCase()}`}><Plus size={15} /></button>
      </div>
    </div>
  );
}
