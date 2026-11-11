"use client";

import {
  AlertTriangle, CheckCircle2, Clock, Feather, Gauge, HeartPulse, Info, Lightbulb, PiggyBank, Plug, RefreshCw,
  Ruler, ShieldAlert, ShieldCheck, Sparkles, Thermometer, Wand2, Zap,
} from "lucide-react";
import { BMS_HEADROOM, PACK_CELLS, PACK_LIMITS, calculatePack, type PackCatalogEntry, type PackConfiguration, type PackResult } from "@/lib/pack-builder";
import { formatRuntime, optimizePack, simulateLoad, sizeParallel, withLoad, type LoadSpec } from "@/lib/pack-planning";
import { formatBDT } from "@/lib/format";

export const TARGET_HOURS = [2, 4, 8, 12];

/* ------------------------------------------------------------------ */
/* Runtime planner (summary card)                                      */
/* ------------------------------------------------------------------ */

export function PackPlanner({
  result, config, load, targetH, products, balancerSlug, onTarget, onApply, onAddExtra,
}: {
  result: PackResult;
  config: PackConfiguration;
  load: LoadSpec;
  targetH: number;
  products: PackCatalogEntry[];
  balancerSlug: string | null;
  onTarget: (hours: number) => void;
  onApply: (patch: Partial<PackConfiguration>) => void;
  onAddExtra: (slug: string) => void;
}) {
  const sim = simulateLoad(result, load);
  const sized = sizeParallel(config, load, targetH, products);
  const options = optimizePack(config, load, targetH, products);
  const b = result.physics.balance;
  const loadLabel = load.mode === "W" ? `${load.watts}W${load.ac ? " AC" : ""}` : `${load.amps}A`;
  const meetsTarget = sim.feasible && sim.runtimeH >= targetH;
  const agedExtraMin = Math.round(sim.runtimeH * 60 * (b.gainAgedPct / 100));

  return (
    <div className="builder-planner" aria-label="Runtime planner">
      <div className="builder-planner-result" data-tone={!sim.feasible || sim.overContinuous ? "warn" : meetsTarget ? "ok" : "neutral"} aria-live="polite">
        <span><Clock size={11} /> Runtime at {loadLabel}</span>
        <strong>{sim.feasible ? formatRuntime(sim.runtimeH) : "Over limit"}</strong>
        <small title="Includes voltage sag, rate-capacity loss, cut-off window, cell mismatch and delivery efficiency">
          {Math.round(sim.currentA * 10) / 10}A draw · {Math.round(sim.efficiency * 100)}% eff. · {result.physics.usableWh} Wh usable
        </small>
        {balancerSlug && !b.installed && agedExtraMin >= 1 && (
          <button type="button" className="builder-planner-boost" onClick={() => onAddExtra(balancerSlug)} title={`Active balancer: +${b.gainAgedPct}% runtime once cells age, +${b.cycleGainPct}% cycle life`}>
            <Sparkles size={11} /> +{agedExtraMin}m
          </button>
        )}
      </div>

      <div className="builder-planner-target" role="group" aria-label="Target runtime">
        <Clock size={13} aria-hidden="true" />
        {TARGET_HOURS.map((hours) => (
          <button key={hours} type="button" data-active={targetH === hours} onClick={() => onTarget(hours)} aria-pressed={targetH === hours}>{hours}h</button>
        ))}
        <button
          type="button"
          className="builder-planner-apply"
          disabled={!sized.reachable || sized.parallel === config.parallel}
          onClick={() => onApply({ parallel: sized.parallel })}
          title={sized.reachable ? `Smallest stocked build that runs ${targetH}h` : `No stocked, protected configuration can meet ${targetH}h at this load`}
          aria-label={sized.reachable ? `Resize to ${config.series}S${sized.parallel}P` : `No available build meets ${targetH} hours`}
        >
          {!sized.reachable ? <AlertTriangle size={13} /> : sized.parallel === config.parallel ? <CheckCircle2 size={13} /> : <Wand2 size={13} />}
          {sized.reachable ? `${config.series}S${sized.parallel}P` : "Unavailable"}
        </button>
      </div>

      {options.length > 0 && (
        <div className="builder-planner-options" aria-label={`Best builds for ${targetH}h`}>
          {options.map((option) => {
            const current = option.config.cellId === config.cellId && option.config.series === config.series && option.config.parallel === config.parallel;
            return (
              <button
                key={option.result.slug}
                type="button"
                data-current={current}
                disabled={current}
                onClick={() => onApply({ cellId: option.config.cellId, series: option.config.series, parallel: option.config.parallel })}
                title={`${option.result.name} · ${formatRuntime(option.runtimeH)} · ${option.result.weightKg} kg · ${option.result.physics.cycleLife} cycles`}
              >
                <span className="builder-planner-option-icons">
                  {option.wins.includes("value") && <PiggyBank size={12} aria-label="Lowest price" />}
                  {option.wins.includes("light") && <Feather size={12} aria-label="Lightest" />}
                  {option.wins.includes("life") && <HeartPulse size={12} aria-label="Longest life" />}
                </span>
                <b>{option.config.series}S{option.config.parallel}P {PACK_CELLS[option.config.cellId].shortLabel}</b>
                <small>{formatBDT(option.result.price)}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Spec chips (summary card)                                           */
/* ------------------------------------------------------------------ */

export function PackSpecs({ result }: { result: PackResult }) {
  const p = result.physics;
  const hot = p.tempRiseC > 20;
  const chips: Array<{ icon: React.ReactNode; value: string; title: string; tone?: "warn" | "ok" }> = [
    {
      icon: result.bms.ratedCurrentA ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />,
      value: result.bms.ratedCurrentA ? `${result.bms.ratedCurrentA}A BMS` : "BMS: quote",
      title: result.bms.ratedCurrentA ? `${result.bms.name} · ${p.bmsHeadroomPct}% headroom · ${p.balance.method === "active" ? "active" : "passive"} balancing` : "No stocked BMS fits this series count",
      tone: !result.bms.ratedCurrentA || (p.bmsHeadroomPct ?? 0) < (BMS_HEADROOM - 1) * 100 ? "warn" : undefined,
    },
    { icon: <Zap size={12} />, value: `${p.continuousA}A cont.`, title: `Continuous estimate: 80% of the ${p.cellLimitA}A cell limit, capped by the BMS and nickel interconnects · ~${p.powerLimitW}W` },
    { icon: <Gauge size={12} />, value: `${p.cutoffVoltage}–${result.chargeVoltage}V`, title: `Operating window · ${p.resistanceMohm} mΩ · −${p.sagV}V sag at ${result.config.loadCurrentA}A` },
    { icon: <Thermometer size={12} />, value: `+${p.tempRiseC}°C`, title: `${p.heatW}W of heat at ${result.config.loadCurrentA}A`, tone: hot ? "warn" : undefined },
    { icon: <RefreshCw size={12} />, value: `${p.cycleLife.toLocaleString("en-IN")} cycles`, title: `To 80% capacity at this load · ~${Math.round(p.cycleLife / 365 * 10) / 10} years of daily use` },
    { icon: <Plug size={12} />, value: `${p.charger.currentA}A · ${p.charger.hours}h`, title: `Use a ${p.charger.voltage}V ${p.charger.currentA}A charger · full in ~${p.charger.hours}h` },
    { icon: <Ruler size={12} />, value: `${result.dimensionsMm.length}×${result.dimensionsMm.width}×${result.dimensionsMm.height}`, title: `Millimetres · ${p.layout.rows > 1 ? `${p.layout.rows} rows of ${p.layout.groupsPerRow} groups` : "single row"}` },
    { icon: <Feather size={12} />, value: `${p.energyDensityWhKg} Wh/kg`, title: "Energy density including holders, nickel, BMS and wrap" },
  ];
  return (
    <ul className="builder-specs" aria-label="Pack specifications">
      {chips.map((chip) => (
        <li key={chip.title} title={chip.title} data-tone={chip.tone}>
          {chip.icon}<span>{chip.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Build advisor (step 2)                                              */
/* ------------------------------------------------------------------ */

export type Advice = {
  id: string;
  tone: "warn" | "tip";
  title: string;
  body: string;
  action?: { label: string; patch: Partial<PackConfiguration> };
};

function minParallelWhere(config: PackConfiguration, load: LoadSpec, products: PackCatalogEntry[], ok: (r: PackResult) => boolean): number | null {
  const maxP = Math.min(PACK_LIMITS.maxParallel, Math.floor(PACK_LIMITS.maxCells / config.series));
  for (let p = config.parallel + 1; p <= maxP; p += 1) {
    try {
      const candidate = calculatePack(withLoad({ ...config, parallel: p, extras: [] }, load), { products });
      if (candidate.available && ok(candidate)) return p;
    } catch {
      // A candidate that cannot be quoted must never be offered as a fix.
    }
  }
  return null;
}

export function buildAdvice(result: PackResult, config: PackConfiguration, load: LoadSpec, products: PackCatalogEntry[]): Advice[] {
  const { physics: p } = result;
  const s = config.series;
  const advice: Advice[] = [];

  if (config.loadCurrentA! > p.cellLimitA * 0.8) {
    const fix = minParallelWhere(config, load, products, (r) => r.config.loadCurrentA <= r.physics.cellLimitA * 0.8);
    advice.push({
      id: "load", tone: "warn",
      title: `Cells at ${Math.round((config.loadCurrentA! / p.cellLimitA) * 100)}% of limit`,
      body: "Above 80% the cells run hot and age fast. More parallel strings share the current.",
      action: fix ? { label: `${s}S${fix}P`, patch: { parallel: fix } } : undefined,
    });
  } else if (p.tempRiseC > 20) {
    const fix = minParallelWhere(config, load, products, (r) => r.physics.tempRiseC <= 18);
    advice.push({
      id: "heat", tone: "warn",
      title: `Runs +${p.tempRiseC}°C under load`,
      body: `${p.heatW}W of resistive heat. Every 10°C above ambient roughly halves calendar life.`,
      action: fix ? { label: `${s}S${fix}P`, patch: { parallel: fix } } : undefined,
    });
  }

  if (!result.components.find((component) => component.key === "bms")?.available) {
    advice.push({
      id: "bms", tone: "warn",
      title: `No stocked ${s}S BMS`,
      body: "Do not change your voltage to fit a different protection board. Compare the inventory-checked alternatives below or ask the workshop to source the correct BMS.",
    });
  } else if ((p.bmsHeadroomPct ?? 100) < (BMS_HEADROOM - 1) * 100) {
    advice.push({ id: "headroom", tone: "warn", title: `BMS headroom only ${p.bmsHeadroomPct}%`, body: "Inrush and heat can trip the board. Keep the continuous load at least 20% under its rating." });
  }

  if (load.mode === "W" && !load.ac && !p.direct12V && result.nominalVoltage < 20) {
    advice.push({
      id: "12v", tone: "tip",
      title: "Confirm your device's DC input range",
      body: `This pack reaches ${result.chargeVoltage}V at full charge. A device labelled 12V may need a regulator; confirm its actual voltage tolerance before connecting it.`,
    });
  }

  if (result.chargeVoltage > 60) {
    advice.push({ id: "hv", tone: "warn", title: `${result.chargeVoltage}V — above touch-safe 60V`, body: "Needs insulated connectors, a fuse and a matching high-voltage charger." });
  }

  if (config.parallel === 1 && s > 1 && !advice.some((item) => item.action?.patch.parallel)) {
    advice.push({
      id: "single", tone: "tip",
      title: "No parallel redundancy",
      body: "One weak cell limits the whole pack. 2P doubles runtime and averages out cell differences (mismatch ÷ √2).",
      action: 2 * s <= PACK_LIMITS.maxCells ? { label: `${s}S2P`, patch: { parallel: 2 } } : undefined,
    });
  }
  return advice.sort((a, b) => Number(b.tone === "warn") - Number(a.tone === "warn")).slice(0, 3);
}

export function PackAdvisor({ advice, onPatch }: { advice: Advice[]; onPatch: (patch: Partial<PackConfiguration>) => void }) {
  if (advice.length === 0) {
    return <p className="builder-advisor-ok"><CheckCircle2 size={14} /> No additional model warnings. Final fit and wiring need a workshop check.</p>;
  }
  return (
    <ul className="builder-advisor" aria-label="Build advisor">
      {advice.map((item) => (
        <li key={item.id} data-tone={item.tone}>
          <span className="builder-advisor-icon">{item.tone === "warn" ? <AlertTriangle size={13} /> : <Lightbulb size={13} />}</span>
          <details>
            <summary>{item.title}<Info size={11} aria-hidden="true" /></summary>
            <p>{item.body}</p>
          </details>
          {item.action && (
            <button type="button" onClick={() => onPatch(item.action!.patch)} aria-label={`Apply: ${item.action.label}`}>
              <Wand2 size={12} /> {item.action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
