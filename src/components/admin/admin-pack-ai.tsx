"use client";

/**
 * ⚡ Battery Pack Builder AI — the console for how packs are sold.
 *
 * Three deliberate tabs:
 *   A. Pack rules      chemistries, series/parallel guardrails, BMS auto-match
 *   B. Smart add-ons   recipe cards, real attach rates, bundle discount
 *   C. Simulator       a real quote preview for a chosen voltage / capacity
 */
import { useMemo, useState } from "react";
import {
  ArrowRight, Battery, BatteryCharging, Check, ChevronRight, ClipboardCheck, Flame, Gauge, PackageCheck,
  Plus, RotateCcw, Save, SlidersHorizontal, Sparkles, TrendingUp, Wrench, Zap,
} from "lucide-react";
import { ops } from "@/db/ops-store";
import { readAllProducts } from "@/lib/queries";
import { listOrders } from "@/lib/ops";
import { isBuilderOrder, categoryOf } from "@/lib/admin-metrics";
import { formatBDT } from "@/lib/format";
import { useStoreVersion } from "@/lib/use-store";
import {
  DEFAULT_PACK_AI, SIM_CAPACITIES, SIM_VOLTAGES, attachRateForRule, sanitizePackAi, simulatePack,
  type PackAddOnRule, type PackAiConsole, type PackChemistryId, type SimulatorChoice,
} from "@/lib/pack-ai-console";
import {
  DEFAULT_PACK_RECOMMENDATIONS, loadPackRecommendationSettings, sanitizePackRecommendations,
  savePackRecommendationSettings, type PackRecommendationSettings,
} from "@/lib/pack-recommendations";
import { Button, PageHead } from "./admin-ui";

type AiTab = "rules" | "addons" | "simulator";
const TABS: Array<{ id: AiTab; label: string; short: string; icon: React.ReactNode }> = [
  { id: "rules", label: "Pack rules & compatibility", short: "Rules", icon: <SlidersHorizontal size={15} /> },
  { id: "addons", label: "Smart add-on AI suggestions", short: "Add-ons", icon: <Sparkles size={15} /> },
  { id: "simulator", label: "AI simulator / test preview", short: "Simulator", icon: <Gauge size={15} /> },
];

const CHEM_ICON: Record<PackChemistryId, React.ReactNode> = {
  "li-ion-18650": <Battery size={17} />,
  "li-ion-21700": <BatteryCharging size={17} />,
  lifepo4: <Flame size={17} />,
  lipo: <Zap size={17} />,
};

export function AdminPackAI({ toast }: { toast: (message: string) => void }) {
  useStoreVersion();
  const [tab, setTab] = useState<AiTab>("rules");
  const [rules, setRules] = useState<PackAiConsole>(() => sanitizePackAi(ops.state.packAi));
  const [engine, setEngine] = useState<PackRecommendationSettings>(() => sanitizePackRecommendations(ops.state.settings.packRecommendations));
  const [choice, setChoice] = useState<SimulatorChoice>({ chemistry: "li-ion-18650", voltage: 48, capacityAh: 15, loadA: 20 });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [persistence, setPersistence] = useState<"local" | "postgres" | "memory">("local");
  const [showEngine, setShowEngine] = useState(false);

  const catalogue = useMemo(() => { void 0; return readAllProducts(); }, []);
  const builderOrders = useMemo(() => listOrders().filter(isBuilderOrder), []);
  const simulation = useMemo(() => simulatePack(choice, rules, catalogue), [choice, rules, catalogue]);
  const activeChemistries = rules.chemistries.filter((entry) => entry.active);

  const edit = (patch: Partial<PackAiConsole>) => { setRules((current) => sanitizePackAi({ ...current, ...patch })); setDirty(true); };
  const editChemistry = (id: PackChemistryId, active: boolean) => {
    const next = rules.chemistries.map((entry) => entry.id === id ? { ...entry, active } : entry);
    edit({ chemistries: next });
  };
  const editRule = (id: string, patch: Partial<PackAddOnRule>) => edit({ addOns: rules.addOns.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) });

  const save = async () => {
    setSaving(true);
    const clean = sanitizePackAi(rules);
    ops.set({ packAi: clean });
    ops.updateSettings((current) => ({ ...current, packRecommendations: sanitizePackRecommendations(engine) }));
    const result = await savePackRecommendationSettings(sanitizePackRecommendations(engine));
    setPersistence(result.persisted === "postgres" ? "postgres" : result.persisted);
    setRules(clean);
    setDirty(false);
    setSaving(false);
    toast(result.persisted === "postgres" ? "Builder AI rules saved — live on the storefront" : "Builder AI rules saved in this browser");
  };
  const reloadRemote = async () => {
    const remote = await loadPackRecommendationSettings();
    if (!remote) { toast("No server copy — using the local rules"); return; }
    setEngine(remote);
    ops.updateSettings((current) => ({ ...current, packRecommendations: remote }));
    setDirty(true);
    toast("Loaded the server's scoring rules");
  };
  const reset = () => {
    setRules(structuredClone(DEFAULT_PACK_AI));
    setEngine(structuredClone(DEFAULT_PACK_RECOMMENDATIONS));
    setDirty(true);
    toast("Builder AI rules reset — save to apply");
  };

  const overallAttach = builderOrders.length
    ? Math.round((builderOrders.filter((order) => order.items.some((item) => ["bms-circuits", "tools-safety", "diy-prototyping"].includes(categoryOf(item.slug)))).length / builderOrders.length) * 100)
    : 0;

  return (
    <>
      <PageHead
        title="⚡ Battery Pack Builder AI"
        subtitle={`${activeChemistries.length} chemistries live · ${rules.addOns.filter((rule) => rule.enabled).length} add-on recipes · ${overallAttach}% add-on attach on builder orders`}
        actions={
          <>
            <span className={`ax-ai-save-state`} data-dirty={dirty || undefined}>{dirty ? "Unsaved changes" : `Saved ${persistence === "postgres" ? "to database" : "locally"}`}</span>
            <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={13} /> Reset</Button>
            <Button size="sm" variant="primary" disabled={saving || !dirty} onClick={() => void save()}><Save size={13} /> {saving ? "Saving…" : "Save rules"}</Button>
          </>
        }
      />

      <div className="ax-ai-tabs" role="tablist" aria-label="Battery builder sections">
        {TABS.map((entry) => (
          <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} data-active={tab === entry.id} onClick={() => setTab(entry.id)}>
            {entry.icon}<span className="ax-ai-tab-label">{entry.label}</span><span className="ax-ai-tab-short">{entry.short}</span>
          </button>
        ))}
      </div>

      {tab === "rules" && (
        <div className="ax-ai-page">
          <div className="ax-kpis">
            <div className="ax-kpi" data-static="true"><span className="ax-caption">Chemistries live</span><strong className="ax-kpi-value">{activeChemistries.length}<small> / {rules.chemistries.length}</small></strong><span className="ax-kpi-foot"><span className="ax-pill" data-tone={activeChemistries.length ? "up" : "down"}>{activeChemistries.length ? "Selling" : "Paused"}</span></span></div>
            <div className="ax-kpi" data-static="true"><span className="ax-caption">Series guardrail</span><strong className="ax-kpi-value">{rules.seriesMin}S–{rules.seriesMax}S</strong><span className="ax-kpi-foot"><span className="ax-caption">of 1S–24S physical range</span></span></div>
            <div className="ax-kpi" data-static="true"><span className="ax-caption">Parallel guardrail</span><strong className="ax-kpi-value">{rules.parallelMin}P–{rules.parallelMax}P</strong><span className="ax-kpi-foot"><span className="ax-caption">of 1P–20P physical range</span></span></div>
            <div className="ax-kpi" data-static="true" data-accent="true"><span className="ax-caption flex items-center gap-1"><Sparkles size={11} /> Auto-optimise</span><strong className="ax-kpi-value">{rules.autoOptimize ? "On" : "Off"}</strong><span className="ax-kpi-foot"><span className="ax-caption">{rules.autoMatchBms ? "BMS auto-matched" : "BMS manual"}</span></span></div>
          </div>

          <section className="ax-card">
            <header className="ax-card-head"><div><h2 className="ax-title-sm">Supported chemistries</h2><p className="ax-caption mt-0.5">Switch a chemistry off and the Builder stops quoting it immediately.</p></div></header>
            <div className="ax-card-body ax-chem-grid">
              {rules.chemistries.map((entry) => (
                <article key={entry.id} className="ax-chem-card" data-active={entry.active || undefined} data-pending={!entry.cellId && entry.active ? "true" : undefined}>
                  <div className="ax-chem-head">
                    <span className="ax-chem-icon">{CHEM_ICON[entry.id]}</span>
                    <div className="min-w-0 flex-1"><p className="ax-body font-semibold">{entry.label}</p><p className="ax-caption">{entry.detail}</p></div>
                    <button type="button" role="switch" aria-checked={entry.active} aria-label={`${entry.active ? "Disable" : "Enable"} ${entry.label}`} className="ax-switch-lg" data-on={entry.active} onClick={() => editChemistry(entry.id, !entry.active)}><span /></button>
                  </div>
                  <dl className="ax-chem-specs">
                    <div><dt>Voltage</dt><dd>{entry.voltageRange}</dd></div>
                    <div><dt>Capacity</dt><dd>{entry.capacityRange}</dd></div>
                  </dl>
                  <p className="ax-chem-state">{entry.active ? <><Check size={12} /> Live in the Builder</> : <>Paused — hidden from new builds</>}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="ax-card">
            <header className="ax-card-head"><div><h2 className="ax-title-sm">Configuration guardrails</h2><p className="ax-caption mt-0.5">Hard limits the Builder refuses to quote, plus automatic electrical matching.</p></div><span className="ax-pill" data-tone={rules.enforceLimits ? "up" : "warn"}>{rules.enforceLimits ? "Enforcing" : "Advisory"}</span></header>
            <div className="ax-card-body ax-guardrails">
              <div className="ax-range">
                <div className="ax-range-head"><span><b>Series</b><small>1S–24S · voltage safety</small></span><b className="adm-num">{rules.seriesMin}S – {rules.seriesMax}S</b></div>
                <label>Minimum <input type="range" min={1} max={24} value={rules.seriesMin} aria-label="Minimum series" onChange={(event) => edit({ seriesMin: Math.min(Number(event.target.value), rules.seriesMax) })} /><output>{rules.seriesMin}S</output></label>
                <label>Maximum <input type="range" min={1} max={24} value={rules.seriesMax} aria-label="Maximum series" onChange={(event) => edit({ seriesMax: Math.max(Number(event.target.value), rules.seriesMin) })} /><output>{rules.seriesMax}S</output></label>
              </div>
              <div className="ax-range">
                <div className="ax-range-head"><span><b>Parallel</b><small>1P–20P · capacity and current</small></span><b className="adm-num">{rules.parallelMin}P – {rules.parallelMax}P</b></div>
                <label>Minimum <input type="range" min={1} max={20} value={rules.parallelMin} aria-label="Minimum parallel" onChange={(event) => edit({ parallelMin: Math.min(Number(event.target.value), rules.parallelMax) })} /><output>{rules.parallelMin}P</output></label>
                <label>Maximum <input type="range" min={1} max={20} value={rules.parallelMax} aria-label="Maximum parallel" onChange={(event) => edit({ parallelMax: Math.max(Number(event.target.value), rules.parallelMin) })} /><output>{rules.parallelMax}P</output></label>
              </div>
              <div className="ax-toggle-stack">
                <ToggleRow label="Auto-match BMS continuous amps to cell discharge rating" hint="Picks a BMS whose rated current covers the pack's continuous discharge plus headroom." checked={rules.autoMatchBms} onChange={(value) => edit({ autoMatchBms: value })} />
                <ToggleRow label="Enforce guardrails in the storefront" hint="Off = show a warning but still quote. On = refuse out-of-range builds." checked={rules.enforceLimits} onChange={(value) => edit({ enforceLimits: value })} />
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "addons" && (
        <div className="ax-ai-page">
          <section className="ax-card" data-accent="true">
            <div className="ax-card-body ax-ai-optimize">
              <div className="min-w-0">
                <p className="ax-body flex items-center gap-1.5 font-semibold"><Sparkles size={15} className="text-[#4d7c0f]" /> AI auto-optimise</p>
                <p className="ax-caption mt-0.5">Rank recipes by fit and margin, and surface the single best add-on as the &ldquo;recommended&rdquo; capsule.</p>
              </div>
              <div className="ax-ai-optimize-controls">
                <span className="ax-attach-badge"><TrendingUp size={12} /> {overallAttach}% attach</span>
                <button type="button" role="switch" aria-checked={rules.autoOptimize} aria-label="AI auto-optimise" className="ax-switch-lg" data-on={rules.autoOptimize} onClick={() => edit({ autoOptimize: !rules.autoOptimize })}><span /></button>
              </div>
            </div>
            <div className="ax-card-body ax-bundle-row">
              <div className="min-w-0"><p className="ax-body font-medium">Bundle discount on add-ons</p><p className="ax-caption mt-0.5">Applied when a customer accepts an AI suggestion with the pack.</p></div>
              <div className="ax-bundle-stepper" role="group" aria-label="Bundle discount">
                <button type="button" aria-label="Decrease bundle discount" disabled={rules.bundleDiscountPct <= 0} onClick={() => edit({ bundleDiscountPct: Math.max(0, rules.bundleDiscountPct - 1) })}>−</button>
                <output>{rules.bundleDiscountPct}% off</output>
                <button type="button" aria-label="Increase bundle discount" disabled={rules.bundleDiscountPct >= 30} onClick={() => edit({ bundleDiscountPct: Math.min(30, rules.bundleDiscountPct + 1) })}>+</button>
              </div>
            </div>
          </section>

          <div className="ax-ai-recipes">
            {rules.addOns.map((rule) => {
              const rate = attachRateForRule(rule, builderOrders, categoryOf);
              return (
                <article key={rule.id} className="ax-recipe" data-off={!rule.enabled || undefined}>
                  <header className="ax-recipe-head">
                    <span className="ax-recipe-icon"><Sparkles size={15} /></span>
                    <div className="min-w-0 flex-1"><p className="ax-body font-semibold">{rule.label}</p><p className="ax-caption">{rule.suggests.length} suggested item{rule.suggests.length === 1 ? "" : "s"}</p></div>
                    <span className="ax-attach-badge" data-tone={rate >= 40 ? "up" : rate > 0 ? "warn" : "neutral"}>{rate}% attach</span>
                    <button type="button" role="switch" aria-checked={rule.enabled} aria-label={`${rule.enabled ? "Pause" : "Enable"} ${rule.label} recipe`} className="ax-switch-lg" data-on={rule.enabled} onClick={() => editRule(rule.id, { enabled: !rule.enabled })}><span /></button>
                  </header>
                  <div className="ax-recipe-flow">
                    <div className="ax-recipe-node ax-recipe-trigger"><span className="ax-caption">Trigger</span><p>{rule.trigger}</p></div>
                    <span className="ax-recipe-arrow" aria-hidden="true"><ArrowRight size={15} /></span>
                    <div className="ax-recipe-node ax-recipe-suggest"><span className="ax-caption">AI suggests</span>
                      <ul>{rule.suggests.map((item) => <li key={item}><Plus size={11} />{item}</li>)}</ul>
                      {rules.bundleDiscountPct > 0 && <span className="ax-recipe-discount">{rules.bundleDiscountPct}% off add-on</span>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <details className="ax-card ax-ai-engine">
            <summary><span><Wrench size={15} /> Engine scoring weights</span><span className="ax-caption">{engine.strategy === "smart" ? "Smart scoring" : engine.strategy === "pinned" ? "Pinned part" : "Off"} · {engine.scoreThreshold} threshold</span></summary>
            <div className="ax-card-body grid gap-3 sm:grid-cols-3">
              <label className="ax-field-mini"><span>Strategy</span>
                <select className="adm-select" value={engine.strategy} onChange={(event) => { setEngine((current) => ({ ...current, strategy: event.target.value as PackRecommendationSettings["strategy"] })); setDirty(true); }}>
                  <option value="smart">Smart scoring</option><option value="pinned">Always pin one part</option><option value="off">Off</option>
                </select>
              </label>
              <label className="ax-field-mini"><span>Backup gain %, shown in copy</span>
                <input className="adm-input adm-num" type="number" min={0} max={60} value={engine.gainPct} onChange={(event) => { setEngine((current) => ({ ...current, gainPct: Number(event.target.value) })); setDirty(true); }} />
              </label>
              <label className="ax-field-mini"><span>Score threshold</span>
                <input className="adm-input adm-num" type="number" min={0} max={150} value={engine.scoreThreshold} onChange={(event) => { setEngine((current) => ({ ...current, scoreThreshold: Number(event.target.value) })); setDirty(true); }} />
              </label>
              <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => void reloadRemote()}><RotateCcw size={13} /> Load server rules</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowEngine((value) => !value)}>{showEngine ? "Hide" : "Show"} detailed weights</Button>
                {showEngine && <span className="ax-caption">Balance {engine.balanceWeight} · Backup {engine.backupWeight} · Protection {engine.protectionWeight} · Pinned boost {engine.pinnedBoost}</span>}
              </div>
            </div>
          </details>
        </div>
      )}

      {tab === "simulator" && (
        <div className="ax-ai-page">
          <section className="ax-card">
            <header className="ax-card-head"><div><h2 className="ax-title-sm">Test a customer build</h2><p className="ax-caption mt-0.5">The exact cells, BMS and add-ons a shopper would see — calculated, not mocked.</p></div></header>
            <div className="ax-card-body ax-sim-controls">
              <div className="ax-sim-field">
                <span className="ax-caption">Chemistry</span>
                <div className="ax-sim-options">
                  {rules.chemistries.map((entry) => (
                    <button key={entry.id} type="button" data-active={choice.chemistry === entry.id} disabled={!entry.active} aria-pressed={choice.chemistry === entry.id} onClick={() => setChoice((current) => ({ ...current, chemistry: entry.id }))}>
                      {CHEM_ICON[entry.id]}<span>{entry.label}</span>{!entry.active && <i className="ax-sim-off">off</i>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ax-sim-field">
                <span className="ax-caption">Target voltage</span>
                <div className="ax-sim-options numeric">
                  {SIM_VOLTAGES.map((voltage) => <button key={voltage} type="button" data-active={choice.voltage === voltage} aria-pressed={choice.voltage === voltage} onClick={() => setChoice((current) => ({ ...current, voltage }))}>{voltage}V</button>)}
                </div>
              </div>
              <div className="ax-sim-field">
                <span className="ax-caption">Target capacity</span>
                <div className="ax-sim-options numeric">
                  {SIM_CAPACITIES.map((capacity) => <button key={capacity} type="button" data-active={choice.capacityAh === capacity} aria-pressed={choice.capacityAh === capacity} onClick={() => setChoice((current) => ({ ...current, capacityAh: capacity }))}>{capacity}Ah</button>)}
                </div>
              </div>
              <label className="ax-sim-field"><span className="ax-caption">Continuous load · {choice.loadA}A</span><input type="range" min={1} max={60} value={choice.loadA} aria-label="Continuous load amps" onChange={(event) => setChoice((current) => ({ ...current, loadA: Number(event.target.value) }))} /></label>
            </div>
          </section>

          {!simulation.ok ? (
            <section className="ax-card ax-sim-blocked" role="status">
              <span className="ax-sim-blocked-icon"><Wrench size={18} /></span>
              <div><p className="ax-body font-semibold">Guardrail reached</p><p className="ax-caption mt-0.5">{simulation.guardrail}</p></div>
              <button type="button" className="ax-link" onClick={() => setTab("rules")}>Adjust rules <ChevronRight size={14} /></button>
            </section>
          ) : (
            <div className="ax-sim-result">
              <section className="ax-card ax-sim-quote">
                <div className="ax-card-body">
                  <div className="ax-sim-title">
                    <div><p className="ax-caption">Preview build</p><p className="ax-sim-name">{simulation.result!.config.series}S{simulation.result!.config.parallel}P · {simulation.result!.nominalVoltage}V · {simulation.result!.capacityAh}Ah</p><p className="ax-caption mt-0.5">{simulation.chemistry.label} · {simulation.result!.energyWh}Wh · {simulation.result!.cellCount} cells</p></div>
                    <span className="ax-sim-price adm-num">{formatBDT(simulation.result!.price)}</span>
                  </div>
                  <dl className="ax-sim-facts">
                    <div><dt>Cells</dt><dd className="adm-num">{simulation.result!.cellCount} × {simulation.result!.cell.label}</dd></div>
                    <div><dt>BMS</dt><dd>{simulation.result!.bms.name} · <span className="adm-num">{simulation.result!.bms.ratedCurrentA ?? simulation.result!.recommendedCurrentA}A</span></dd></div>
                    <div><dt>Charge voltage</dt><dd className="adm-num">{simulation.result!.chargeVoltage}V</dd></div>
                    <div><dt>Peak current</dt><dd className="adm-num">{simulation.result!.estimatedPeakCurrentA}A</dd></div>
                    <div><dt>Dimensions</dt><dd className="adm-num">{simulation.result!.dimensionsMm.length}×{simulation.result!.dimensionsMm.width}×{simulation.result!.dimensionsMm.height}mm</dd></div>
                    <div><dt>Weight</dt><dd className="adm-num">{simulation.result!.weightKg}kg</dd></div>
                  </dl>
                  <ul className="ax-sim-lines">
                    {simulation.result!.components.map((part) => (
                      <li key={part.key}>
                        <span className="min-w-0 flex-1"><b>{part.name}</b><small>{part.qty} × {formatBDT(part.unitPrice)}{part.note ? ` · ${part.note}` : ""}</small></span>
                        <span className="adm-num">{formatBDT(part.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="ax-card" data-accent="true">
                <header className="ax-card-head"><div><h2 className="ax-title-sm flex items-center gap-1.5"><Sparkles size={14} className="text-[#4d7c0f]" /> AI add-ons</h2><p className="ax-caption mt-0.5">{rules.autoOptimize ? "Auto-optimised by fit" : "Rules order"} · {rules.bundleDiscountPct}% bundle discount</p></div><span className="ax-attach-badge"><TrendingUp size={12} /> {simulation.suggestions.length} matched</span></header>
                <div className="ax-card-body">
                  {simulation.suggestions.length === 0 ? <p className="ax-caption">No enabled recipe matches this build. Add stock in a rule category or enable a recipe.</p> : (
                    <ul className="ax-sim-addons">
                      {simulation.suggestions.map((entry) => (
                        <li key={entry.slug}>
                          <span className="ax-sim-addon-icon"><PackageCheck size={15} /></span>
                          <span className="min-w-0 flex-1"><b>{entry.name}</b><small>{entry.recommended ? "Recommended · " : ""}{entry.reason}</small></span>
                          <span className="ax-sim-addon-price"><b className="adm-num">{formatBDT(entry.discounted)}</b>{entry.price !== entry.discounted && <s className="adm-num">{formatBDT(entry.price)}</s>}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="ax-sim-total">
                    <div><dt>Pack</dt><dd className="adm-num">{formatBDT(simulation.result!.price)}</dd></div>
                    <div><dt>Add-ons</dt><dd className="adm-num">{formatBDT(simulation.addOnDiscounted)}</dd></div>
                    {simulation.saving > 0 && <div className="is-saving"><dt>Bundle saving</dt><dd className="adm-num">−{formatBDT(simulation.saving)}</dd></div>}
                    <div className="is-total"><dt>Customer pays</dt><dd className="adm-num">{formatBDT(simulation.grandTotal)}</dd></div>
                  </dl>
                  <div className="ax-sim-note"><ClipboardCheck size={14} /><span>Preview only. Stock, BMS and prices are re-checked at checkout.</span></div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="ax-toggle-row">
      <div className="min-w-0"><p className="ax-body font-medium">{label}</p><p className="ax-caption mt-0.5">{hint}</p></div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="ax-switch-lg" data-on={checked} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}
