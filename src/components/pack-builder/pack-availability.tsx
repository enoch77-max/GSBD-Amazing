"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BatteryCharging, CheckCircle2, ChevronDown, Info, Package, RefreshCw, ShieldCheck } from "lucide-react";
import { formatBDT } from "@/lib/format";
import { formatRuntime, type LoadSpec } from "@/lib/pack-planning";
import { MATCH_PRIORITIES, type MatchPriority, type PackAvailabilityAdvice, type CustomAlternative } from "@/lib/pack-availability";
import type { PackResult } from "@/lib/pack-builder";
import { STORE } from "@/lib/commerce";
import { PackChangeDialog } from "./pack-change-dialog";

function PriceChange({ value }: { value: number | null }) {
  return <span className="pack-match-price-change">{value === null ? "Complete estimate; original quote incomplete" : value === 0 ? "Same estimated price" : `${formatBDT(Math.abs(value))} ${value < 0 ? "less" : "more"} than your build`}</span>;
}
function Metric({ label, value, note, good }: { label: string; value: string; note?: string; good?: boolean }) {
  return <div><dt>{label}</dt><dd>{value}</dd>{note && <small data-tone={good === undefined ? undefined : good ? "good" : "caution"}>{note}</small>}</div>;
}

export function PackAvailability({ advice, current, load, budget, onBudget, onPriority, onApply, onRefresh, refreshing, refreshError, reserved }: {
  advice: PackAvailabilityAdvice;
  current: PackResult;
  load: LoadSpec;
  budget: string;
  onBudget: (value: string) => void;
  onPriority: (priority: MatchPriority) => void;
  onApply: (option: CustomAlternative) => Promise<string | null>;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: string;
  reserved: boolean;
}) {
  const [chosenView, setChosenView] = useState<"custom" | "ready" | null>(null);
  const [pending, setPending] = useState<CustomAlternative | null>(null);
  const view = chosenView ?? (advice.custom.length ? "custom" : "ready");
  const noMatches = !advice.custom.length && !advice.ready.length;
  const loadText = load.mode === "W" ? `${load.watts}W${load.ac ? " AC" : ""}` : `${load.amps}A`;
  const context = `I am planning a ${current.config.series}S${current.config.parallel}P ${current.cell.label} pack (${current.nominalVoltage}V nominal / ${current.chargeVoltage}V charge), ${loadText} load, ${formatRuntime(advice.targetHours)} runtime target. Unavailable: ${advice.unavailable.join("; ")}.`;
  const contact = (extra: string) => `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(`${context} ${extra}`)}`;

  return (
    <section id="pack-alternatives" className="builder-availability" aria-labelledby="builder-availability-heading">
      <div className="pack-match-heading">
        <div>
          <p className="builder-step">A BETTER FIT, NOT A GUESS</p>
          <h2 id="builder-availability-heading">Keep your project moving.</h2>
          <p>Compare available options without changing your voltage or chemistry.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="pack-match-refresh"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Checking stock" : "Recheck stock"}</button>
      </div>
      <div className="pack-match-requirements"><ShieldCheck size={15} /><span>{current.nominalVoltage}V nominal / {current.chargeVoltage}V charge <span aria-hidden="true">·</span> {loadText} load <span aria-hidden="true">·</span> {formatRuntime(advice.targetHours)} target{advice.quantity > 1 ? ` · ${advice.quantity} packs` : ""}</span></div>
      <details className="pack-match-shortages">
        <summary>{advice.unavailable.length} stock or load {advice.unavailable.length === 1 ? "check needs" : "checks need"} attention <ChevronDown size={14} /></summary>
        <ul>{advice.unavailable.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </details>
      <div className="pack-match-controls">
        <label><span>Prioritize</span><select value={advice.priority} onChange={(e) => onPriority(e.target.value as MatchPriority)}>{MATCH_PRIORITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Budget / pack (BDT)</span><input type="number" min={1} step={1} inputMode="numeric" placeholder="No budget limit" value={budget} onChange={(e) => onBudget(e.target.value)} aria-label="Maximum pack price in BDT" /></label>
      </div>
      {refreshError && <p role="alert" className="pack-match-error">{refreshError}</p>}
      {budget && (!Number.isFinite(Number(budget)) || Number(budget) <= 0) && <p className="pack-match-error" role="status">Enter a positive budget. No budget filter is applied yet.</p>}
      <div className="pack-match-tabs" role="group" aria-label="Alternative type">
        <button type="button" aria-pressed={view === "custom"} onClick={() => setChosenView("custom")}><BatteryCharging size={16} /> Custom builds <span>{advice.custom.length}</span></button>
        <button type="button" aria-pressed={view === "ready"} onClick={() => setChosenView("ready")}><Package size={16} /> Ready-made packs <span>{advice.ready.length}</span></button>
      </div>
      <p className="pack-match-result-note" role="status">{noMatches ? "No complete match under these requirements." : "Best distinct options shown. Runtime is estimated, not guaranteed."}{reserved ? " Parts already in your bag are deducted from available stock." : ""}</p>

      {view === "custom" && advice.custom.length > 0 ? (
        <div className="builder-alternatives-list">
          {advice.custom.map((option, index) => <article className="pack-match-option" data-featured={index === 0} key={option.result.slug}>
            <div className="pack-match-option-top"><span>{option.label}</span><span>{option.result.maxPacks <= 3 ? `Only ${option.result.maxPacks} build${option.result.maxPacks === 1 ? "" : "s"} available` : "All included parts in stock"}</span></div>
            <h3>{option.config.series}S{option.config.parallel}P {option.result.cell.label}</h3>
            <p className="pack-match-price">{formatBDT(option.result.price)} <small>/ pack</small></p>
            <PriceChange value={option.priceDelta} />
            <dl className="pack-match-metrics">
              <Metric label="Estimated runtime" value={formatRuntime(option.runtimeH)} note={option.meetsTarget ? "Meets target" : `${formatRuntime(advice.targetHours)} target not met`} good={option.meetsTarget} />
              <Metric label="Capacity" value={`${option.result.capacityAh}Ah`} note={option.capacityDeltaPct === 0 ? "Unchanged" : `${option.capacityDeltaPct > 0 ? "+" : ""}${option.capacityDeltaPct}% vs. your build`} good={option.meetsCapacity} />
              <Metric label="Continuous output" value={`${option.result.physics.continuousA}A`} note={`${option.result.bms.ratedCurrentA}A protection board`} />
            </dl>
            <details className="pack-match-details"><summary>Why this fits & what changes <ChevronDown size={14} /></summary><p>{option.reason}</p><ul>{option.changes.map((change) => <li key={change}>{change}</li>)}{option.warnings.map((warning) => <li className="pack-match-caution" key={warning}>{warning}</li>)}</ul><p>Enclosure estimate: {option.result.dimensionsMm.length} x {option.result.dimensionsMm.width} x {option.result.dimensionsMm.height} mm. Weight: {option.result.weightKg} kg.</p></details>
            {option.removedExtras.length > 0 && <p className="pack-match-caution"><Info size={13} /> Leaves out {option.removedExtras.join(", ")}.</p>}
            <button type="button" className={index === 0 ? "btn btn-buy pack-match-apply" : "btn btn-outline pack-match-apply"} onClick={() => setPending(option)} aria-label={`Review ${option.result.config.series}S${option.result.config.parallel}P ${option.result.cell.label} alternative`}>Review this build <ArrowRight size={15} /></button>
          </article>)}
        </div>
      ) : view === "ready" && advice.ready.length > 0 ? (
        <div className="builder-alternatives-list">
          {advice.ready.map((option, index) => <article className="pack-match-option" data-featured={index === 0} key={option.product.slug}>
            <div className="pack-match-option-top"><span>{option.label}</span><span>{Math.floor(option.product.stock)} in stock</span></div>
            <div className="pack-match-product"><span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-bone"><Image src={option.product.images[0] ?? "/images/col-packs.jpg"} alt="" fill sizes="64px" className="object-cover" /></span><h3>{option.product.name}</h3></div>
            <p className="pack-match-price">{formatBDT(option.product.price)} <small>/ pack</small></p><PriceChange value={option.priceDelta} />
            <dl className="pack-match-metrics">
              <Metric label="Estimated runtime" value={formatRuntime(option.estimatedRuntimeH)} note={option.meetsTarget ? "Meets target" : "Below target"} good={option.meetsTarget} />
              <Metric label="Capacity" value={`${option.capacityAh}Ah`} note={`${option.energyWh}Wh nominal`} good={option.meetsCapacity} />
              <Metric label="Continuous output" value={`${option.continuousA}A`} note="Published rating" />
            </dl>
            <details className="pack-match-details"><summary>Compatibility & assumptions <ChevronDown size={14} /></summary><p>{option.reason}</p><ul>{option.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>
            <Link href={`/product/${option.product.slug}`} className="btn btn-primary pack-match-apply">View pack & specifications <ArrowRight size={15} /></Link>
          </article>)}
        </div>
      ) : <div className="pack-match-empty"><Package size={22} /><div><h3>{view === "custom" ? "No complete custom build fits these limits." : "No ready-made pack passes all checks."}</h3><p>{advice.counts.overBudget > 0 ? "Some otherwise suitable options are over your budget. Clear the limit to compare them." : "We will not suggest changing the voltage, removing required protection, or using an unverified current rating."}</p>{advice.maxBudget !== null && <button type="button" onClick={() => onBudget("")}>Clear budget limit <ArrowRight size={13} /></button>}</div></div>}

      {advice.counts.overBudget > 0 && !noMatches && <p className="pack-match-result-note">{advice.counts.overBudget} other checked configurations exceed your budget. <button type="button" onClick={() => onBudget("")}>Show without a budget limit</button></p>}
      {advice.review.length > 0 && <details className="pack-match-review" open={noMatches}>
        <summary><span><Info size={15} /> Ready-made packs that need a workshop check</span><ChevronDown size={15} /></summary>
        <p>These are stocked products, <strong>not verified substitutes</strong>. Ask us to resolve the issues below before choosing one.</p>
        {advice.review.map(({product, reasons}) => <article key={product.slug} className="pack-review-row"><div><Link href={`/product/${product.slug}`}>{product.name} <ArrowRight size={12} /></Link><p>{formatBDT(product.price)} / pack</p><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><a href={contact(`Could you check ${product.name}? Please resolve: ${reasons.join(" ")}`)} target="_blank" rel="noreferrer">Ask the workshop <ArrowRight size={13} /></a></article>)}
      </details>}
      <div className="pack-match-footer"><span><CheckCircle2 size={14} /> Same voltage and chemistry for automatic replacements. Final stock is confirmed when you place the order.</span><a href={contact("Please help me source a suitable pack or the missing components.")} target="_blank" rel="noreferrer">Discuss my requirements <ArrowRight size={14} /></a></div>
      {pending && <PackChangeDialog current={current} option={pending} onClose={() => setPending(null)} onApply={onApply} />}
    </section>
  );
}
