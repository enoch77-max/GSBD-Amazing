"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, BatteryCharging, RotateCcw, Save, Sparkles, Zap } from "lucide-react";
import { ops } from "@/db/ops-store";
import { readAllProducts } from "@/lib/queries";
import { calculatePack, type PackConfiguration } from "@/lib/pack-builder";
import {
  DEFAULT_PACK_RECOMMENDATIONS,
  RECOMMENDABLE_PARTS,
  analysePack,
  loadPackRecommendationSettings,
  rankPackAddOns,
  sanitizePackRecommendations,
  savePackRecommendationSettings,
  type PackRecommendationSettings,
} from "@/lib/pack-recommendations";
import { Badge, Button, Field, Panel, Toggle } from "./admin-ui";

const SCENARIOS: Array<{ label: string; detail: string; config: PackConfiguration }> = [
  { label: "Default build", detail: "4S2P · 18650 · 10A", config: { cellId: "18650", series: 4, parallel: 2, loadCurrentA: 10, extras: [] } },
  { label: "Router backup", detail: "3S2P · 18650 · 10A", config: { cellId: "18650", series: 3, parallel: 2, loadCurrentA: 10, extras: [] } },
  { label: "Solar backup", detail: "4S4P · LiFePO4 · 15A", config: { cellId: "lifepo4-32700", series: 4, parallel: 4, loadCurrentA: 15, extras: [] } },
  { label: "E-bike pack", detail: "10S3P · 21700 · 30A", config: { cellId: "21700", series: 10, parallel: 3, loadCurrentA: 30, extras: [] } },
];

function NumberBox({ value, onChange, min, max, step = 1 }: { value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) {
  return (
    <input
      className="adm-input"
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
      }}
    />
  );
}

export function AdminPackAI({ toast }: { toast: (message: string) => void }) {
  const [draft, setDraft] = useState<PackRecommendationSettings>(() =>
    sanitizePackRecommendations(ops.state.settings.packRecommendations),
  );
  const [saving, setSaving] = useState(false);
  const [persistence, setPersistence] = useState<string>("local");

  useEffect(() => {
    void loadPackRecommendationSettings().then((remote) => {
      if (!remote) return;
      setDraft(remote);
      ops.updateSettings((current) => ({ ...current, packRecommendations: remote }));
      setPersistence("postgres");
    });
  }, []);

  const edit = (patch: Partial<PackRecommendationSettings>) => {
    setDraft((current) => sanitizePackRecommendations({ ...current, ...patch }));
  };

  const save = async () => {
    setSaving(true);
    const clean = sanitizePackRecommendations(draft);
    ops.updateSettings((current) => ({ ...current, packRecommendations: clean }));
    const result = await savePackRecommendationSettings(clean);
    setPersistence(result.persisted);
    setSaving(false);
    toast(
      result.persisted === "postgres"
        ? "Pack AI rules saved to the database — live on the builder"
        : "Pack AI rules saved locally — the storefront will use them now",
    );
  };

  const reset = () => {
    const clean = structuredClone(DEFAULT_PACK_RECOMMENDATIONS);
    setDraft(clean);
    ops.updateSettings((current) => ({ ...current, packRecommendations: clean }));
    void savePackRecommendationSettings(clean);
    toast("Pack AI rules restored to workshop defaults");
  };

  const previews = useMemo(() => {
    const products = readAllProducts();
    return SCENARIOS.map((scenario) => {
      try {
        const result = calculatePack(scenario.config, { products });
        const scored = [...rankPackAddOns(result, products, draft).values()].sort(
          (a, b) => Number(b.recommended) - Number(a.recommended) || b.score - a.score,
        );
        const intelligence = analysePack(result, draft);
        return {
          ...scenario,
          result,
          top: scored[0] ?? null,
          active: Boolean(scored[0]?.recommended),
          intelligence,
        };
      } catch {
        return { ...scenario, result: null, top: null, active: false, intelligence: null };
      }
    });
  }, [draft]);

  const toggleSlug = (field: "boostSlugs" | "hiddenSlugs", slug: string) => {
    const current = draft[field];
    edit({ [field]: current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="adm-page-title">Pack AI · smart recommendations</h1>
          <p className="text-[0.78rem] text-[#6e6e73]">
            Control the &ldquo;recommended&rdquo; capsule the pack builder puts on its best suggested part — e.g. an active balancer for longer backup.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={draft.enabled && draft.strategy !== "off" ? "emerald" : "neutral"}>
            {draft.enabled && draft.strategy !== "off" ? "Capsule live" : "Capsule paused"}
          </Badge>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={12} /> Reset</Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving}>
            <Save size={12} /> {saving ? "Saving…" : "Save rules"}
          </Button>
        </div>
      </div>

      <div className="adm-status-pill inline-flex w-fit items-center gap-2">
        <BadgeCheck size={12} /> Stored in {persistence === "postgres" ? "PostgreSQL" : persistence === "memory" ? "server memory" : "browser"} · changes appear on the builder immediately
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Recommendation engine" subtitle="Which part gets the capsule, and how it is chosen">
          <div className="flex flex-col gap-3">
            <Toggle checked={draft.enabled} onChange={(enabled) => edit({ enabled })} label="Show smart recommendations" hint="Master switch for the capsule on pack-builder suggestions." />
            <Field label="Selection strategy" hint="Smart scores each compatible part against the exact build. Pinned always features the chosen part when eligible.">
              <select className="adm-input" value={draft.strategy} onChange={(event) => edit({ strategy: event.target.value as PackRecommendationSettings["strategy"] })}>
                <option value="smart">Smart scoring (recommended)</option>
                <option value="pinned">Always pin featured part</option>
                <option value="off">Off — plain suggestions only</option>
              </select>
            </Field>
            <Field label="Featured upgrade" hint="Default: 5A active balancer. It keeps series groups matched, so more of the pack's capacity is usable on every backup cycle.">
              <select className="adm-input" value={draft.featuredSlug} onChange={(event) => edit({ featuredSlug: event.target.value })}>
                {RECOMMENDABLE_PARTS.map((part) => <option key={part.slug} value={part.slug}>{part.label}</option>)}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Capsule label"><input className="adm-input" value={draft.badgeLabel} onChange={(event) => edit({ badgeLabel: event.target.value })} /></Field>
              <Field label="Cap on claimed backup gain (%)"><NumberBox value={draft.gainPct} min={0} max={60} onChange={(gainPct) => edit({ gainPct })} /></Field>
            </div>
            <Toggle checked={draft.showScore} onChange={(showScore) => edit({ showScore })} label="Show match score" hint="Displays the calculated fit percentage inside the capsule." />
            <Toggle checked={draft.allowAddToPack} onChange={(allowAddToPack) => edit({ allowAddToPack })} label="One-click add to build" hint="Lets a customer add the recommended part into their custom pack quote, not just the bag." />
          </div>
        </Panel>

        <Panel title="Benefit copy" subtitle="Shown inside the recommended capsule. {gain}, {life}, {minutes}, {series}, {pack} and {energy} are filled from the pack physics.">
          <div className="flex flex-col gap-3">
            <Field label="Headline"><input className="adm-input" value={draft.headline} onChange={(event) => edit({ headline: event.target.value })} /></Field>
            <Field label="Explanation"><textarea className="adm-input min-h-[6rem] resize-y" value={draft.detail} onChange={(event) => edit({ detail: event.target.value })} /></Field>
            <div className="rounded-lg border border-[#e3e3e8] bg-[#0e2119] p-3">
              <p className="text-[0.64rem] font-bold uppercase tracking-[.12em] text-[#6e6e73]">Customer-facing preview</p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#c8ff38] px-2.5 py-1 text-[0.66rem] font-bold text-[#12291c]"><Sparkles size={11} /> {draft.badgeLabel}</p>
              <p className="mt-2 font-display text-[0.95rem] font-bold text-[#1d1d1f]">{draft.headline.replace("{gain}", "3.5").replace("{life}", "12").replace("{minutes}", "9").replace("{series}", "4")}</p>
              <p className="mt-1 text-[0.74rem] leading-relaxed text-[#6e6e73]">{draft.detail.replace("{series}", "4").replace("{gain}", "3.5").replace("{life}", "12")}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Eligibility" subtitle="The capsule only appears when the build actually benefits from the upgrade">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Minimum series groups"><NumberBox value={draft.minSeries} min={1} max={24} onChange={(minSeries) => edit({ minSeries })} /></Field>
            <Field label="Minimum parallel strings"><NumberBox value={draft.minParallel} min={1} max={12} onChange={(minParallel) => edit({ minParallel })} /></Field>
            <Field label="Minimum pack energy (Wh)"><NumberBox value={draft.minEnergyWh} min={0} max={10000} onChange={(minEnergyWh) => edit({ minEnergyWh })} /></Field>
            <Field label="Chemistry filter">
              <select className="adm-input" value={draft.chemistry} onChange={(event) => edit({ chemistry: event.target.value as PackRecommendationSettings["chemistry"] })}>
                <option value="any">All chemistries</option>
                <option value="li-ion">Li-ion only</option>
                <option value="lifepo4">LiFePO4 only</option>
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Minimum match score" hint="Smart strategy only. Raise it to show the capsule on fewer builds."><NumberBox value={draft.scoreThreshold} min={0} max={150} onChange={(scoreThreshold) => edit({ scoreThreshold })} /></Field>
          </div>
        </Panel>

        <Panel title="Ranking weights" subtitle="Tune how strongly each build signal influences the smart score">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cell balance weight (%)"><NumberBox value={draft.balanceWeight} min={0} max={200} onChange={(balanceWeight) => edit({ balanceWeight })} /></Field>
            <Field label="Backup runtime weight (%)"><NumberBox value={draft.backupWeight} min={0} max={200} onChange={(backupWeight) => edit({ backupWeight })} /></Field>
            <Field label="Protection weight (%)"><NumberBox value={draft.protectionWeight} min={0} max={200} onChange={(protectionWeight) => edit({ protectionWeight })} /></Field>
            <Field label="Featured-part boost (points)"><NumberBox value={draft.pinnedBoost} min={0} max={100} onChange={(pinnedBoost) => edit({ pinnedBoost })} /></Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="adm-field-label">Boost these parts</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {RECOMMENDABLE_PARTS.map((part) => (
                  <button key={part.slug} type="button" className="adm-chip" data-active={draft.boostSlugs.includes(part.slug)} onClick={() => toggleSlug("boostSlugs", part.slug)}>{part.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="adm-field-label">Hide these parts</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {RECOMMENDABLE_PARTS.map((part) => (
                  <button key={part.slug} type="button" className="adm-chip" data-active={draft.hiddenSlugs.includes(part.slug)} onClick={() => toggleSlug("hiddenSlugs", part.slug)}>{part.label}</button>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Live simulation" subtitle="The capsule shoppers see on the Optional add-ons list for typical builds — scores update as you edit the rules">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {previews.map((scenario) => (
            <div key={scenario.label} className="rounded-xl border border-[#e3e3e8] bg-[#0b1b14] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-[#1d1d1f]"><BatteryCharging size={13} /> {scenario.label}</span>
                <Badge tone={scenario.active ? "emerald" : "neutral"}>{scenario.active ? "Capsule shown" : "No capsule"}</Badge>
              </div>
              <p className="mt-1 text-[0.7rem] text-[#6e6e73]">{scenario.detail}</p>
              {scenario.top ? (
                <>
                  <div className="mt-3 rounded-lg border border-[#e3e3e8] bg-[#10281c] p-2.5">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[.1em] text-[#4d7c0f]">Top ranked part</p>
                    <p className="mt-1 text-[0.84rem] font-semibold text-[#1d1d1f]">{scenario.top.product.name}</p>
                    <p className="mt-1 text-[0.7rem] text-[#6e6e73]">{scenario.top.impact}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[0.7rem] text-[#6e6e73]">
                    <span>Score <strong className="text-[#1d1d1f]">{scenario.top.score}/100</strong></span>
                    <span>Backup ~{scenario.intelligence?.backupMinutes ?? 0} min</span>
                  </div>
                  {scenario.intelligence && !scenario.intelligence.eligible && (
                    <p className="mt-1.5 text-[0.68rem] text-[#92400e]">{scenario.intelligence.eligibilityNote}</p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-[0.72rem] text-[#6e6e73]">No compatible suggestions for this build.</p>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="How the smart score works" subtitle="Every number comes from the pack physics — no guesses">
        <div className="grid gap-2 text-[0.75rem] leading-relaxed text-[#6e6e73] sm:grid-cols-2">
          <p className="flex gap-2"><Zap size={14} className="mt-0.5 shrink-0 text-[#4d7c0f]" /> Mismatch: the weakest of S groups sits ~σ·z(S) below average (σ = cell spread ÷ √P, z from order statistics). Passive BMS boards can&apos;t recover it during use; a 5A active balancer can.</p>
          <p className="flex gap-2"><Zap size={14} className="mt-0.5 shrink-0 text-[#4d7c0f]" /> Drift: monthly self-discharge spread is compared with the BMS&apos;s real balance current (35–60mA passive, 2A JK active) — large LiFePO4 banks drift more than a passive board can correct.</p>
          <p className="flex gap-2"><Zap size={14} className="mt-0.5 shrink-0 text-[#4d7c0f]" /> Lifespan: the weakest group is over-discharged on every cycle; removing that stress raises cycle life — shown as +{"{life}"}%.</p>
          <p className="flex gap-2"><Zap size={14} className="mt-0.5 shrink-0 text-[#4d7c0f]" /> Packs whose BMS already balances actively are scored down automatically, so the capsule only appears where it genuinely helps.</p>
        </div>
      </Panel>
    </div>
  );
}
