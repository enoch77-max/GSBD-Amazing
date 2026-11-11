"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle, ArrowRight, Battery, Cctv, Check, CheckCircle2, Fan, Info, Laptop, Lightbulb, Minus, Plus, RotateCcw,
  Router, Share2, ShieldCheck, Sparkles, Tv, Undo2, Wifi, Wrench, Zap,
} from "lucide-react";
import {
  PACK_CELLS, PACK_LIMITS, PACK_OPTIONAL_EXTRAS, PACK_PRODUCT_SLUG, calculatePack, normalizePackConfiguration,
  suggestPackProducts, type CellId, type PackConfiguration,
} from "@/lib/pack-builder";
import { DEVICE_PRESETS, withLoad, type LoadSpec } from "@/lib/pack-planning";
import { rankPackAddOns } from "@/lib/pack-recommendations";
import { assessPackLoad, findPackAvailability, inventoryForBuild, type CustomAlternative, type MatchPriority } from "@/lib/pack-availability";
import { useCart, type CartLine } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { readAllProducts } from "@/lib/queries";
import { useStoreVersion } from "@/lib/use-store";
import { STORE } from "@/lib/commerce";
import { bootLive, isLive } from "@/lib/live";
import { ops } from "@/db/ops-store";
import { PackAdvisor, PackPlanner, PackSpecs, buildAdvice } from "./pack-planner";
import { PlannerBoundary } from "./planner-boundary";
import { PackSuggestions } from "./pack-suggestions";
import { PackAvailability } from "./pack-availability";

const DEFAULT_CONFIG: PackConfiguration = { cellId: "18650", series: 4, parallel: 2, loadCurrentA: 10, extras: [] };
const BALANCER = "5a-active-balancer";

async function recheckCatalogue() {
  if (!isLive()) return;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    await bootLive(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The stock check timed out. Please try again; your build has not changed.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

const PRESETS: Array<{ label: string; detail: string; config: PackConfiguration; load: LoadSpec; target: number }> = [
  { label: "Router backup", detail: "3S · 20W · 8h", config: { cellId: "18650", series: 3, parallel: 6, loadCurrentA: 2 }, load: { mode: "W", watts: 20 }, target: 8 },
  { label: "12V solar", detail: "4S LFP · 60W", config: { cellId: "lifepo4-32700", series: 4, parallel: 4, loadCurrentA: 5 }, load: { mode: "W", watts: 60 }, target: 4 },
  { label: "36V e-bike", detail: "10S · 30A", config: { cellId: "21700", series: 10, parallel: 3, loadCurrentA: 30 }, load: { mode: "A", amps: 30 }, target: 2 },
];

const DEVICE_ICON: Record<string, React.ReactNode> = {
  router: <Wifi size={15} />, onu: <Router size={15} />, lights: <Lightbulb size={15} />, fan: <Fan size={15} />,
  cctv: <Cctv size={15} />, laptop: <Laptop size={15} />, tv: <Tv size={15} />,
};

function initialState(search: { get: (key: string) => string | null }): { config: PackConfiguration; load: LoadSpec } {
  const cell = search.get("cell");
  const rawExtras = search.get("extras");
  const watts = Number(search.get("w"));
  try {
    const config = normalizePackConfiguration({
      cellId: cell && Object.hasOwn(PACK_CELLS, cell) ? cell : DEFAULT_CONFIG.cellId,
      series: search.get("s") ?? DEFAULT_CONFIG.series,
      parallel: search.get("p") ?? DEFAULT_CONFIG.parallel,
      loadCurrentA: search.get("load") ?? DEFAULT_CONFIG.loadCurrentA,
      extras: rawExtras ? rawExtras.split(",").filter(Boolean) : [],
    });
    const load: LoadSpec = Number.isFinite(watts) && watts >= 1 && watts <= 5000
      ? { mode: "W", watts: Math.round(watts), ac: search.get("ac") === "1" }
      : { mode: "A", amps: config.loadCurrentA };
    return { config, load };
  } catch {
    return { config: DEFAULT_CONFIG, load: { mode: "A", amps: 10 } };
  }
}

export function PackBuilder() {
  const catalogueVersion = useStoreVersion();
  const search = useSearchParams();
  const cart = useCart();
  const [state, setState] = useState(() => initialState(search));
  const [targetH, setTargetH] = useState(() => [2, 4, 8, 12].includes(Number(search.get("target"))) ? Number(search.get("target")) : 4);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [priority, setPriority] = useState<MatchPriority>("closest");
  const [budget, setBudget] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [previousBuild, setPreviousBuild] = useState<{ state: typeof state; target: number } | null>(null);
  const [appliedMessage, setAppliedMessage] = useState("");
  useEffect(() => {
    if (!appliedMessage) return;
    const frame = window.requestAnimationFrame(() => {
      const notice = document.getElementById("pack-change-notice");
      notice?.focus({ preventScroll: true });
      notice?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [appliedMessage]);
  const { load } = state;
  const editSlug = search.get("edit");
  const editingLine = editSlug ? cart.lines.find((line) => line.slug === editSlug && line.customPack) : undefined;
  const searchKey = search.toString();
  useEffect(() => {
    // Editing can navigate from the bag to this same route, changing only the query.
    if (new URLSearchParams(searchKey).has("edit")) {
      setState(initialState(new URLSearchParams(searchKey)));
      setNotice("");
      setPreviousBuild(null);
      setAppliedMessage("");
    }
  }, [searchKey]);

  /* The load drives BMS sizing; in watt mode it is re-derived whenever voltage changes. */
  const config = useMemo(() => withLoad(state.config, load), [state.config, load]);
  const products = useMemo(() => { void catalogueVersion; void refreshVersion; return readAllProducts(); }, [catalogueVersion, refreshVersion]);
  const catalogue = useMemo(() => inventoryForBuild(products, cart.lines, editingLine?.slug), [products, cart.lines, editingLine?.slug]);
  const buildQuantity = editingLine?.qty ?? 1;
  const result = useMemo(() => calculatePack(config, { products: catalogue }), [config, catalogue]);
  const availability = useMemo(() => findPackAvailability(result, load, targetH, catalogue, {
    priority, maxBudget: budget ? Number(budget) : undefined, quantity: buildQuantity,
  }), [result, load, targetH, catalogue, priority, budget, buildQuantity]);
  const canBuild = !availability.triggered;
  const currentKey = JSON.stringify({ config, load, cart: cart.lines });
  const latestKey = useRef(currentKey);
  latestKey.current = currentKey;
  const opsVersion = useSyncExternalStore(ops.subscribe, ops.getVersion, ops.getVersion);
  const recommendationSettings = useMemo(() => { void opsVersion; return ops.state.settings.packRecommendations; }, [opsVersion]);
  const addOnRanking = useMemo(() => rankPackAddOns(result, catalogue, recommendationSettings), [result, catalogue, recommendationSettings]);
  const recommendedAddOn = [...addOnRanking.values()].find((entry) => entry.recommended) ?? null;
  const recommendedSlug = recommendedAddOn?.product.slug ?? null;
  const extraSlugs = new Set(PACK_OPTIONAL_EXTRAS.map((extra) => extra.slug));
  /* Builder add-ons already have their own ticks above — don't repeat them below. */
  const suggestions = useMemo(
    () => suggestPackProducts(result, catalogue).filter((entry) => !extraSlugs.has(entry.product.slug)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, catalogue],
  );
  const advice = useMemo(() => {
    try { return buildAdvice(result, config, load, catalogue); }
    catch (error) { console.error("[pack-builder] Advisor calculation failed", error); return []; }
  }, [result, config, load, catalogue]);
  const orderedExtras = [...PACK_OPTIONAL_EXTRAS].sort((a, b) => {
    const rank = (slug: string, fits: boolean) => (slug === recommendedSlug ? 0 : fits ? 1 : 2);
    return rank(a.slug, a.fits(result.config)) - rank(b.slug, b.fits(result.config));
  });
  const selectedExtras = new Set(result.config.extras);
  const productsBySlug = new Map(catalogue.map((product) => [product.slug, product]));

  function update(nextConfig: Partial<PackConfiguration>, nextLoad?: LoadSpec) {
    setPreviousBuild(null);
    setAppliedMessage("");
    setState((current) => {
      const candidate = { ...current.config, ...nextConfig };
      if (candidate.series * candidate.parallel > PACK_LIMITS.maxCells) {
        setNotice(`A build is limited to ${PACK_LIMITS.maxCells} cells. Reduce one count first.`);
        return current;
      }
      const extras = (candidate.extras ?? []).filter((slug) =>
        PACK_OPTIONAL_EXTRAS.some((extra) => extra.slug === slug && extra.fits(candidate as Parameters<typeof extra.fits>[0])),
      );
      setNotice(extras.length !== (candidate.extras ?? []).length ? "An add-on was removed because it no longer fits." : "");
      return { config: { ...candidate, extras }, load: nextLoad ?? current.load };
    });
  }
  const change = (next: Partial<PackConfiguration>) => update(next);
  const setLoad = (next: LoadSpec) => update({}, next);
  const setRuntimeTarget = (hours: number) => { setTargetH(hours); setPreviousBuild(null); setAppliedMessage(""); };

  async function refreshInventory() {
    setRefreshing(true);
    setRefreshError("");
    try {
      await recheckCatalogue();
      setRefreshVersion((value) => value + 1);
    } catch {
      setRefreshError("Could not refresh stock. These are the last loaded quantities; try again before choosing.");
    } finally {
      setRefreshing(false);
    }
  }

  async function applyAlternative(option: CustomAlternative): Promise<string | null> {
    await recheckCatalogue();
    if (latestKey.current !== currentKey) return "Your build or bag changed. Close this comparison and review the updated choices.";
    const fresh = inventoryForBuild(readAllProducts(), cart.lines, editingLine?.slug);
    const verified = calculatePack(withLoad(option.config, load), { products: fresh });
    if (!verified.available || verified.maxPacks < buildQuantity || !assessPackLoad(verified, load).safe) {
      setRefreshVersion((value) => value + 1);
      return "This build no longer has enough stock or current headroom. Close the comparison to see fresh alternatives.";
    }
    if (verified.config.series !== result.config.series || verified.bms.chemistry !== result.bms.chemistry || Math.abs(verified.chargeVoltage - result.chargeVoltage) > .15) {
      return "This option changes the voltage or chemistry. Please ask the workshop to review it.";
    }
    if (verified.price !== option.result.price || JSON.stringify(verified.components.map((p) => [p.slug, p.qty, p.unitPrice])) !== JSON.stringify(option.result.components.map((p) => [p.slug, p.qty, p.unitPrice]))) {
      setRefreshVersion((value) => value + 1);
      return "The price or included parts changed. Close this comparison and review the new estimate before applying.";
    }
    setPreviousBuild({ state, target: targetH });
    setState({ config: verified.config, load });
    setNotice("");
    setAppliedMessage(`Now using ${verified.config.series}S${verified.config.parallel}P ${verified.cell.label}. Your load and runtime target were kept.`);
    return null;
  }

  function toggleExtra(slug: string) {
    const current = state.config.extras ?? [];
    if (current.includes(slug)) {
      change({ extras: current.filter((entry) => entry !== slug) });
      return;
    }
    const extra = PACK_OPTIONAL_EXTRAS.find((entry) => entry.slug === slug);
    const product = catalogue.find((entry) => entry.slug === slug);
    if (!extra || !extra.fits(config) || !product || product.stock < 1) {
      setNotice("This add-on is unavailable or does not fit your build.");
      return;
    }
    change({ extras: [...current, slug] });
  }

  function reset() {
    setState({ config: DEFAULT_CONFIG, load: { mode: "A", amps: 10 } });
    setTargetH(4);
    setNotice("");
    setPreviousBuild(null);
    setAppliedMessage("");
  }

  async function addPack() {
    if (adding) return;
    setAdding(true);
    try {
      await recheckCatalogue();
      if (latestKey.current !== currentKey) { setNotice("Your configuration changed. Review it before adding to your bag."); return; }
      const inventory = inventoryForBuild(readAllProducts(), cart.lines, editingLine?.slug);
      const current = calculatePack(config, { products: inventory });
      const assessment = assessPackLoad(current, load);
      if (!current.available || current.maxPacks < buildQuantity || !assessment.safe) {
        setNotice(current.availabilityNote ?? assessment.reasons[0] ?? "Not enough stock remains for this build quantity.");
        setRefreshVersion((value) => value + 1);
        return;
      }
      if (current.price !== result.price) { setNotice("The build price changed. Review the updated estimate and add it again."); setRefreshVersion((value) => value + 1); return; }
      const existingQty = cart.lines.find((line) => line.slug === current.slug && line.slug !== editingLine?.slug)?.qty ?? 0;
      const line: Omit<CartLine, "qty"> = {
        id: 0, slug: current.slug, name: current.name, brand: "Glowing Space Lab",
        price: current.price, image: current.cell.image, stock: current.maxPacks + existingQty,
        customPack: current.config, packComponents: current.components,
      };
      if (editingLine) cart.replaceItem(editingLine.slug, line);
      else cart.addItem(line);
      cart.openCart();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add this build. Please review the configuration.");
    } finally {
      setAdding(false);
    }
  }

  async function share() {
    const params = new URLSearchParams({ cell: result.config.cellId, s: String(result.config.series), p: String(result.config.parallel), load: String(result.config.loadCurrentA) });
    params.set("target", String(targetH));
    if (load.mode === "W") { params.set("w", String(load.watts)); if (load.ac) params.set("ac", "1"); }
    if (result.config.extras.length) params.set("extras", result.config.extras.join(","));
    const url = `${window.location.origin}/pack-builder?${params.toString()}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copy this configuration link", url); }
  }

  const loadValue = load.mode === "W" ? load.watts : load.amps;
  const quoteMessage = encodeURIComponent(`Hi, could you quote a ${result.config.series}S${result.config.parallel}P ${result.cell.label} pack for a ${result.config.loadCurrentA}A continuous load?`);
  return (
    <>
      {appliedMessage && <div id="pack-change-notice" className="builder-change-success" role="status" tabIndex={-1}><CheckCircle2 size={18} /><span>{appliedMessage}</span>{previousBuild && <button type="button" onClick={() => { setState(previousBuild.state); setTargetH(previousBuild.target); setPreviousBuild(null); setAppliedMessage("Original configuration restored. Nothing in your bag was changed."); }}><Undo2 size={14} /> Undo change</button>}</div>}
      {availability.triggered && <div className="builder-recovery-notice" role="status"><AlertCircle size={18} /><div><strong>This build needs a stock or load adjustment.</strong><p>{availability.unavailable[0]}</p></div><a href="#pack-alternatives">Compare alternatives <ArrowRight size={14} /></a></div>}
      <div className="builder-layout">
        <div className="builder-main">
          <section className="builder-section" aria-labelledby="cell-heading">
            <div className="builder-section-heading"><div><span className="builder-step">STEP 01</span><h2 id="cell-heading">Choose your cells</h2><p>Each build uses new, matched cells from our catalogue.</p></div><button type="button" className="builder-reset" onClick={reset}><RotateCcw size={14} /> Reset</button></div>
            <div className="builder-cell-grid" role="group" aria-label="Cell type">
              {Object.values(PACK_CELLS).map((cell) => {
                const product = productsBySlug.get(PACK_PRODUCT_SLUG[cell.id]);
                const inStock = Boolean(product && product.stock >= config.series * config.parallel);
                return (
                  <button key={cell.id} type="button" className="builder-cell-option" data-selected={config.cellId === cell.id} aria-pressed={config.cellId === cell.id} disabled={!inStock} title={!inStock ? "Not enough cells in stock for this configuration" : undefined} onClick={() => change({ cellId: cell.id as CellId })}>
                    <span className="builder-cell-top"><span className="builder-cell-mark"><Battery size={18} /></span><span className="builder-cell-check"><Check size={13} strokeWidth={2.5} /></span></span>
                    <strong>{cell.shortLabel}</strong><span>{cell.label}</span>
                    <small>{cell.capacityAh}Ah · {cell.maxDischargeA}A · {cell.cycleLife.toLocaleString("en-IN")} cyc</small>
                    <b>{!inStock ? `Unavailable · ${product?.stock ?? 0} in stock` : `${formatBDT(product!.price)} / cell`}</b>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="builder-section" aria-labelledby="layout-heading">
            <div className="builder-section-heading"><div><span className="builder-step">STEP 02</span><h2 id="layout-heading">Set your configuration</h2><p>Series sets voltage; parallel sets capacity and current.</p></div></div>
            <div className="builder-controls">
              <CountControl label="Series" suffix="S" description={`${result.nominalVoltage}V nominal`} value={config.series} min={1} max={24} onChange={(series) => change({ series })} />
              <CountControl label="Parallel" suffix="P" description={`${result.capacityAh}Ah · ${result.physics.continuousA}A cont.`} value={config.parallel} min={1} max={12} onChange={(parallel) => change({ parallel })} />
            </div>
            <div className="builder-load">
              <div className="builder-load-head">
                <label htmlFor="pack-load">Load</label>
                <div className="builder-unit" role="group" aria-label="Load unit">
                  <button type="button" data-active={load.mode === "W"} onClick={() => load.mode !== "W" && setLoad({ mode: "W", watts: Math.max(1, Math.round(load.amps * result.nominalVoltage)) })}>W</button>
                  <button type="button" data-active={load.mode === "A"} onClick={() => load.mode !== "A" && setLoad({ mode: "A", amps: config.loadCurrentA ?? 10 })}>A</button>
                </div>
                <div className="builder-load-input">
                  <input id="pack-load" type="number" min={1} max={load.mode === "W" ? 5000 : PACK_LIMITS.maxLoadCurrentA} value={loadValue}
                    onChange={(event) => {
                      const raw = Math.floor(Number(event.target.value) || 1);
                      setLoad(load.mode === "W" ? { mode: "W", watts: Math.max(1, Math.min(5000, raw)), ac: load.ac } : { mode: "A", amps: Math.max(1, Math.min(PACK_LIMITS.maxLoadCurrentA, raw)) });
                    }} />
                  <span>{load.mode}</span>
                </div>
              </div>
              <div className="builder-devices" role="group" aria-label="Quick load presets">
                {DEVICE_PRESETS.map((device) => {
                  const active = load.mode === "W" && load.watts === device.watts && Boolean(load.ac) === Boolean(device.ac);
                  return (
                    <button key={device.id} type="button" data-active={active} aria-pressed={active} title={`${device.label} · ${device.watts}W`} aria-label={`${device.label}, ${device.watts} watts`}
                      onClick={() => setLoad({ mode: "W", watts: device.watts, ac: device.ac })}>
                      {DEVICE_ICON[device.id]}<small>{device.watts}</small>
                    </button>
                  );
                })}
                {load.mode === "W" && (
                  <button type="button" className="builder-ac" data-active={Boolean(load.ac)} title="AC device via inverter (87% efficient)" onClick={() => setLoad({ ...load, ac: !load.ac })}>AC</button>
                )}
              </div>
              <p className="builder-load-hint">{load.mode === "W" ? `≈ ${config.loadCurrentA}A from the pack · sizes the BMS` : `≈ ${Math.round(config.loadCurrentA! * result.nominalVoltage)}W · sizes the BMS`}</p>
            </div>
            {notice && <p className="builder-notice" role="status"><AlertCircle size={15} /> {notice}</p>}
            <PlannerBoundary><PackAdvisor advice={advice} onPatch={(patch) => change(patch)} /></PlannerBoundary>
            <div className="builder-presets"><span>Start with a preset</span><div>{PRESETS.filter((preset) => {
              try { return calculatePack(withLoad({ ...preset.config, extras: [] }, preset.load), { products: catalogue }).available; }
              catch { return false; }
            }).map((preset) => <button key={preset.label} type="button" onClick={() => { setState({ config: { ...preset.config, extras: [] }, load: preset.load }); setTargetH(preset.target); setNotice(""); setPreviousBuild(null); setAppliedMessage(""); }}><strong>{preset.label}</strong><small>{preset.detail}</small></button>)}</div></div>
            {recommendedAddOn && result.available && !selectedExtras.has(recommendedAddOn.product.slug) && (
              <div className="builder-inline-recommendation" role="status">
                <Sparkles size={16} aria-hidden="true" />
                <span><strong>{recommendationSettings.badgeLabel}: {recommendedAddOn.product.name}</strong><small>{recommendedAddOn.impact} · {formatBDT(recommendedAddOn.product.price)}</small></span>
                <button type="button" onClick={() => toggleExtra(recommendedAddOn.product.slug)} disabled={!recommendationSettings.allowAddToPack || (productsBySlug.get(recommendedAddOn.product.slug)?.stock ?? 0) < 1} aria-label={`Add ${recommendedAddOn.product.name} to this pack`}><Plus size={13} /> Add</button>
              </div>
            )}
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
            <div className="builder-extra-heading"><div><h3>Optional add-ons</h3><p>Tick to include. Incompatible parts are greyed out.</p></div><span>OPTIONAL</span></div>
            <div className="builder-extra-list">
              {orderedExtras.map((extra) => {
                const product = productsBySlug.get(extra.slug);
                const fits = extra.fits(result.config);
                const available = Boolean(product && product.stock > 0 && fits);
                const selected = selectedExtras.has(extra.slug);
                if (!fits && !selected) return null;
                const rec = available && extra.slug === recommendedSlug ? recommendedAddOn : null;
                return (
                  <div key={extra.slug} className="builder-extra-item" data-recommended={Boolean(rec)} data-selected={selected}>
                    {rec && (
                      <span className="builder-extra-capsule">
                        <Sparkles size={11} strokeWidth={2.6} /> {rec.badgeLabel}
                        {rec.showScore && <em>{rec.score}%</em>}
                      </span>
                    )}
                    <label className="builder-extra-row" data-selected={selected} data-disabled={!available && !selected}>
                      <input type="checkbox" checked={selected} disabled={!available && !selected} onChange={() => toggleExtra(extra.slug)} aria-label={`Include ${extra.label}`} />
                      <span className="builder-extra-check"><Check size={13} strokeWidth={3} /></span>
                      <span className="builder-extra-copy">
                        <strong>{extra.label}</strong>
                        {rec ? (
                          <small className="builder-extra-impact"><Zap size={11} /> {rec.headline}</small>
                        ) : (
                          <small>{!fits ? extra.incompatibility : !product || product.stock < 1 ? "Currently out of stock." : extra.note}</small>
                        )}
                      </span>
                      <span className="builder-extra-price">{product ? `+ ${formatBDT(product.price)}` : "Unavailable"}</span>
                    </label>
                    {rec && (
                      <details className="builder-extra-why">
                        <summary aria-label="Why this is recommended"><Info size={12} /></summary>
                        <p>{rec.detail}</p>
                        <ul>{rec.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="builder-summary" aria-label="Your pack summary">
          <div className="builder-summary-heading"><div><span className="builder-step">YOUR PACK</span><h2>{result.config.series}S{result.config.parallel}P {result.cell.shortLabel}</h2><p>{result.cell.label} · {result.cellCount} cells</p></div><button type="button" className="builder-summary-icon" onClick={() => void share()} title={copied ? "Link copied" : "Copy a link to this build"} aria-label="Share this configuration">{copied ? <Check size={16} /> : <Share2 size={16} />}</button></div>
          <PlannerBoundary><PackPlanner
            result={result}
            config={config}
            load={load}
            targetH={targetH}
            products={catalogue}
            balancerSlug={recommendedSlug === BALANCER && recommendationSettings.allowAddToPack && !selectedExtras.has(BALANCER) ? BALANCER : null}
            onTarget={setRuntimeTarget}
            onApply={(patch) => change(patch)}
            onAddExtra={(slug) => toggleExtra(slug)}
          /></PlannerBoundary>
          <div className="builder-metrics" aria-live="polite">
            <div><span>Nominal voltage</span><strong>{result.nominalVoltage}<small> V</small></strong></div>
            <div><span>Capacity</span><strong>{result.capacityAh}<small> Ah</small></strong></div>
            <div><span>Energy</span><strong>{result.energyWh}<small> Wh</small></strong></div>
            <div><span>Est. weight</span><strong>{result.weightKg}<small> kg</small></strong></div>
          </div>
          <PackSpecs result={result} />
          {result.availabilityNote && <div className="builder-warning" role="alert"><AlertCircle size={16} /><span>{result.availabilityNote}</span></div>}
          <div className="builder-total"><div><span>{canBuild ? "Estimated build total" : "Build needs review"}</span><strong>{canBuild ? formatBDT(result.price) : "Review alternatives"}</strong><small>{canBuild ? `Includes technician build service · ${result.components.length} items` : (availability.unavailable[0] ?? "Contact the workshop for availability")}</small></div><span>{canBuild ? "BDT" : ""}</span></div>
          {canBuild ? (
            <button type="button" onClick={() => void addPack()} disabled={adding} className="builder-add-button"><Battery size={17} /> {adding ? "Checking stock..." : editingLine ? "Update build in bag" : "Add custom pack to bag"} <ArrowRight size={16} /></button>
          ) : (
            <><a href="#pack-alternatives" className="builder-add-button">Find an available alternative <ArrowRight size={16} /></a><a href={`https://wa.me/${STORE.whatsapp}?text=${quoteMessage}`} target="_blank" rel="noreferrer" className="builder-share">Ask the workshop</a></>
          )}
          <p className="builder-disclaimer">Engineering estimates from cell datasheets. The workshop confirms BMS settings, connector and enclosure before assembly.</p>
        </aside>
      </div>
      {availability.triggered && <PackAvailability advice={availability} current={result} load={load} budget={budget} onBudget={setBudget} onPriority={setPriority} onApply={applyAlternative} onRefresh={() => void refreshInventory()} refreshing={refreshing} refreshError={refreshError} reserved={cart.lines.some((line) => line.slug !== editingLine?.slug)} />}
      <PackSuggestions result={result} suggestions={suggestions} />
    </>
  );
}

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

