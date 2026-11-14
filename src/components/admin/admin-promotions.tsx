"use client";

/**
 * Promotions — coupon and bundle cards, not a spreadsheet.
 * Each card answers: what is the offer, is it live, how much of the budget is
 * used, and when does it stop. One tap copies the code; one switch pauses it.
 */
import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Package, Pause, Pencil, Play, Plus, RotateCcw, Sparkles, TicketPercent, Trash2, Truck } from "lucide-react";
import { ops } from "@/db/ops-store";
import { DEFAULT_PROMOS, PROMOS, type Promo } from "@/lib/commerce";
import { audit, can, listOrders } from "@/lib/ops";
import { formatBDT } from "@/lib/format";
import { Button, Drawer, Empty, Field, PageHead, ReadOnlyNote } from "./admin-ui";

type Status = "live" | "paused" | "scheduled" | "expired" | "used up";
type Preset = "code" | "volume" | "bundle";

export function promoStatus(promo: Promo, uses: number, now = Date.now()): Status {
  if (promo.active === false) return "paused";
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return "scheduled";
  if (promo.endsAt && new Date(promo.endsAt).getTime() < now) return "expired";
  if (promo.maxUses && uses >= promo.maxUses) return "used up";
  return "live";
}

const TONE: Record<Status, string> = { live: "emerald", paused: "neutral", scheduled: "sky", expired: "rose", "used up": "amber" };
const PRESETS: Array<{ id: Preset; label: string; icon: React.ReactNode; blurb: string }> = [
  { id: "code", label: "Promo code", icon: <TicketPercent size={16} />, blurb: "A typed code at checkout" },
  { id: "volume", label: "Volume bulk discount", icon: <Package size={16} />, blurb: "Bigger baskets, bigger % off" },
  { id: "bundle", label: "Battery bundle deal", icon: <Sparkles size={16} />, blurb: "Pack + charger / BMS together" },
];

/** Big, human headline for the discount itself. */
export function offerHeadline(promo: Promo): string {
  if (promo.type === "percent") return `${promo.value}% OFF`;
  if (promo.type === "flat") return `${formatBDT(promo.value)} OFF`;
  return "FREE DELIVERY";
}

const expiryLabel = (promo: Promo) => {
  if (!promo.endsAt) return "No expiry";
  const end = new Date(promo.endsAt);
  const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
  if (days < 0) return `Ended ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  if (days === 0) return "Ends today";
  if (days <= 14) return `${days}d left`;
  return `Ends ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
};

export function AdminPromotions({ toast }: { toast: (message: string) => void }) {
  useSyncExternalStore(ops.subscribe, ops.getVersion, ops.getVersion);
  const [editing, setEditing] = useState<{ promo: Promo | null; preset?: Preset } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const manage = can("promotions.manage");
  const promos = [...PROMOS];
  const orders = listOrders();
  const usage = (code: string) => orders.filter((order) => order.promoCode === code).length;
  const revenue = (code: string) => orders.filter((order) => order.promoCode === code).reduce((sum, order) => sum + order.total, 0);
  const discountGiven = (code: string) => orders.filter((order) => order.promoCode === code).reduce((sum, order) => sum + (order.discount ?? 0), 0);
  const save = (next: Promo[], message: string, action: string, target: string) => {
    ops.setPromos(next);
    audit(action, target);
    toast(message);
  };
  const copy = (code: string) => {
    void navigator.clipboard?.writeText(code);
    setCopied(code);
    window.setTimeout(() => setCopied((current) => (current === code ? null : current)), 1600);
    toast(`${code} copied`);
  };
  const live = promos.filter((promo) => promoStatus(promo, usage(promo.code)) === "live").length;
  const totalUses = orders.filter((order) => order.promoCode).length;
  const totalDiscount = orders.reduce((sum, order) => sum + (order.promoCode ? order.discount ?? 0 : 0), 0);

  return (
    <>
      <PageHead
        title="Promotions"
        subtitle={`${live} live of ${promos.length} · ${totalUses} redeemed · ${formatBDT(totalDiscount)} discounted all time`}
        actions={manage && <>
          <Button size="sm" variant="ghost" onClick={() => save(DEFAULT_PROMOS.map((promo) => ({ ...promo })), "Default codes restored", "Restored default promotions", "All codes")}><RotateCcw size={13} /> Restore</Button>
          <Button size="sm" variant="primary" onClick={() => setEditing({ promo: null })}><Plus size={13} /> New offer</Button>
        </>}
      />
      {!manage && <ReadOnlyNote />}

      {promos.length === 0 ? (
        <div className="ax-card"><Empty icon={<TicketPercent size={22} />} title="No offers yet" body="Create a promo code, volume discount or battery bundle to start." /></div>
      ) : (
        <div className="ax-promo-grid">
          {promos.map((promo) => {
            const uses = usage(promo.code);
            const status = promoStatus(promo, uses);
            const limit = promo.maxUses ?? 0;
            const progress = limit > 0 ? Math.min(100, Math.round((uses / limit) * 100)) : null;
            const kind = promo.kind ?? (promo.type === "shipping" ? "bundle" : "code");
            return (
              <article key={promo.code} className="ax-promo-card" data-status={status}>
                <header className="ax-promo-head">
                  <button type="button" className="ax-code-chip" onClick={() => copy(promo.code)} aria-label={`Copy code ${promo.code}`}>
                    <span className="adm-mono">{promo.code}</span>
                    {copied === promo.code ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <span className="ax-promo-kind">{kind === "volume" ? "Volume" : kind === "bundle" ? "Bundle" : "Code"}</span>
                  <div className="ax-active-switch">
                    <span className="ax-active-label">{status === "paused" ? "Paused" : "Live"}</span>
                    <button type="button" role="switch" aria-checked={status !== "paused"} aria-label={`${status === "paused" ? "Resume" : "Pause"} ${promo.code}`} className="ax-switch-lg" data-on={status !== "paused"} disabled={!manage}
                      onClick={() => save(promos.map((entry) => entry.code === promo.code ? { ...entry, active: entry.active === false } : entry), status === "paused" ? `${promo.code} is live` : `${promo.code} paused`, status === "paused" ? "Resumed promotion" : "Paused promotion", promo.code)}><span /></button>
                  </div>
                </header>

                <div className="ax-promo-value">
                  <strong>{offerHeadline(promo)}</strong>
                  <p className="ax-caption">{promo.label}</p>
                </div>

                <div className="ax-promo-meta">
                  <span className={`ax-promo-status`} data-tone={TONE[status]}>{status}</span>
                  <span className="ax-promo-expiry">{expiryLabel(promo)}</span>
                  {promo.minSubtotal > 0 && <span className="ax-promo-expiry">Min {formatBDT(promo.minSubtotal)}</span>}
                </div>

                <div className="ax-promo-usage">
                  <div className="ax-promo-usage-head">
                    <span className="ax-caption">{limit > 0 ? `${uses} / ${limit} used` : `${uses} used · unlimited`}</span>
                    <span className="ax-caption adm-num">{formatBDT(revenue(promo.code))} revenue</span>
                  </div>
                  <div className="ax-progress" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`${promo.code} usage`}>
                    <span style={{ width: `${progress ?? Math.min(100, uses * 4)}%` }} data-full={progress !== null && progress >= 100 ? "true" : undefined} />
                  </div>
                </div>

                {confirmDelete === promo.code ? (
                  <div className="ax-promo-confirm" role="alert">
                    <span>Delete {promo.code}?</span>
                    <Button size="sm" variant="danger" onClick={() => { save(promos.filter((entry) => entry.code !== promo.code), `${promo.code} deleted`, "Deleted promotion", promo.code); setConfirmDelete(null); }}>Delete</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                  </div>
                ) : (
                  <footer className="ax-promo-foot">
                    <button type="button" className="ax-link" disabled={!manage} onClick={() => setEditing({ promo })}><Pencil size={13} /> Edit offer</button>
                    <button type="button" className="adm-icon-btn" aria-label={`Delete ${promo.code}`} disabled={!manage} onClick={() => setConfirmDelete(promo.code)}><Trash2 size={15} /></button>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <PromoEditor
          promo={editing.promo}
          preset={editing.preset}
          existing={promos}
          onClose={() => setEditing(null)}
          onSave={(next, isNew) => {
            save(next, isNew ? "Offer created" : "Offer saved", isNew ? "Created promotion" : "Updated promotion", next.find((entry) => !promos.some((other) => JSON.stringify(other) === JSON.stringify(entry)))?.code ?? "Offer");
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

const toLocal = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

function PromoEditor({ promo, preset, existing, onClose, onSave }: {
  promo: Promo | null;
  preset?: Preset;
  existing: Promo[];
  onClose: () => void;
  onSave: (next: Promo[], isNew: boolean) => void;
}) {
  const [kind, setKind] = useState<Preset>(promo?.kind ?? preset ?? "code");
  const [form, setForm] = useState({
    code: promo?.code ?? "", label: promo?.label ?? "", type: promo?.type ?? "percent" as Promo["type"],
    value: String(promo?.value ?? (kind === "volume" ? 12 : 10)), minSubtotal: String(promo?.minSubtotal ?? (kind === "volume" ? 5000 : kind === "bundle" ? 3000 : 0)),
    maxDiscount: promo?.maxDiscount ? String(promo.maxDiscount) : "", startsAt: toLocal(promo?.startsAt), endsAt: toLocal(promo?.endsAt),
    maxUses: promo?.maxUses ? String(promo.maxUses) : kind === "volume" ? "100" : "", active: promo?.active !== false,
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | boolean) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };

  const choosePreset = (id: Preset) => {
    setKind(id);
    setError("");
    if (id === "volume") { setForm((current) => ({ ...current, type: "percent", value: "12", minSubtotal: "5000", maxUses: current.maxUses || "100", label: current.label || "12% off orders over ৳5,000" })); return; }
    if (id === "bundle") { setForm((current) => ({ ...current, type: "flat", value: "500", minSubtotal: "3000", label: current.label || "৳500 off when you add a charger or BMS" })); return; }
    setForm((current) => ({ ...current, type: "percent" }));
  };

  const submit = () => {
    const code = form.code.trim().toUpperCase().replace(/\s/g, "");
    const n = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : NaN);
    if (!/^[A-Z0-9]{3,20}$/.test(code)) return setError("Codes use 3–20 letters or numbers, no spaces.");
    if (existing.some((entry) => entry.code === code && entry.code !== promo?.code)) return setError("That code already exists.");
    if (form.label.trim().length < 3) return setError("Add a short customer-facing description.");
    const value = form.type === "shipping" ? 0 : n(form.value);
    if (form.type !== "shipping" && (!Number.isFinite(value) || value <= 0 || (form.type === "percent" && value > 90))) return setError(form.type === "percent" ? "Percent discounts must be between 1 and 90." : "Enter a discount amount above 0.");
    const minSubtotal = form.minSubtotal.trim() ? n(form.minSubtotal) : 0;
    if (!Number.isFinite(minSubtotal)) return setError("Minimum order must be a whole number.");
    const maxDiscount = form.maxDiscount.trim() ? n(form.maxDiscount) : undefined;
    if (maxDiscount !== undefined && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) return setError("Maximum discount must be a positive whole number.");
    const maxUses = form.maxUses.trim() ? n(form.maxUses) : null;
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) return setError("Usage limit must be at least 1.");
    const startsAt = form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null;
    const endsAt = form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null;
    if (startsAt && endsAt && startsAt > endsAt) return setError("The end date must be after the start date.");
    const next: Promo = { code, label: form.label.trim(), type: form.type, value, minSubtotal, kind, ...(form.type === "percent" && maxDiscount ? { maxDiscount } : {}), startsAt, endsAt, maxUses, active: form.active };
    onSave(promo ? existing.map((entry) => (entry.code === promo.code ? next : entry)) : [...existing, next], !promo);
  };

  return (
    <Drawer
      open onClose={onClose}
      title={promo ? `Edit ${promo.code}` : "Create an offer"}
      subtitle={promo ? promo.label : "Pick a shape, then set the numbers"}
      footer={
        <div className="ax-editor-footer">
          <Button variant="ghost" onClick={onClose}>Discard</Button>
          <span className="ax-editor-footer-note">{error || (form.code ? offerPreview(kind, form.type, form.value) : "")}</span>
          <Button variant="primary" onClick={submit} disabled={false}>{promo ? "Save offer" : "Create offer"}</Button>
        </div>
      }
    >
      {!promo && (
        <div className="ax-preset-grid" role="group" aria-label="Offer preset">
          {PRESETS.map((entry) => (
            <button key={entry.id} type="button" data-active={kind === entry.id} aria-pressed={kind === entry.id} onClick={() => choosePreset(entry.id)}>
              <span className="ax-preset-icon">{entry.icon}</span>
              <span className="ax-body font-semibold">{entry.label}</span>
              <span className="ax-caption">{entry.blurb}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ax-editor-page mt-3">
        <section className="ax-editor-block">
          <header><div><h3>The offer</h3><p>What the customer sees at checkout.</p></div></header>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code"><input className="adm-input adm-mono uppercase" value={form.code} onChange={(event) => set("code", event.target.value.toUpperCase().replace(/\s/g, ""))} aria-label="Code" /></Field>
            <Field label="Discount type">
              <select className="adm-select" value={form.type} onChange={(event) => set("type", event.target.value)} aria-label="Discount type">
                <option value="percent">Percentage off</option><option value="flat">Fixed amount off</option><option value="shipping">Free delivery</option>
              </select>
            </Field>
          </div>
          <Field label="Customer-facing description"><input className="adm-input" value={form.label} placeholder="e.g. 10% off your order" onChange={(event) => set("label", event.target.value)} aria-label="Description" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            {form.type !== "shipping" && <Field label={form.type === "percent" ? "Percent" : "Amount ৳"}><input className="adm-input adm-num" inputMode="numeric" value={form.value} onChange={(event) => set("value", event.target.value.replace(/\D/g, ""))} aria-label="Discount value" /></Field>}
            <Field label="Minimum order ৳"><input className="adm-input adm-num" inputMode="numeric" value={form.minSubtotal} onChange={(event) => set("minSubtotal", event.target.value.replace(/\D/g, ""))} aria-label="Minimum order" /></Field>
            {form.type === "percent" && <Field label="Max discount ৳" hint="Optional cap"><input className="adm-input adm-num" inputMode="numeric" value={form.maxDiscount} onChange={(event) => set("maxDiscount", event.target.value.replace(/\D/g, ""))} aria-label="Maximum discount" /></Field>}
          </div>
        </section>

        <section className="ax-editor-block">
          <header><div><h3>Schedule & limits</h3><p>Leave blank for always-on and unlimited.</p></div></header>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Starts"><input className="adm-input" type="date" value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} aria-label="Start date" /></Field>
            <Field label="Ends"><input className="adm-input" type="date" value={form.endsAt} onChange={(event) => set("endsAt", event.target.value)} aria-label="End date" /></Field>
            <Field label="Usage limit" hint="Total orders"><input className="adm-input adm-num" inputMode="numeric" placeholder="Unlimited" value={form.maxUses} onChange={(event) => set("maxUses", event.target.value.replace(/\D/g, ""))} aria-label="Usage limit" /></Field>
          </div>
          <div className="ax-listing-switches">
            <div><span><b>Live now</b><small>Customers can redeem it as soon as you save.</small></span>
              <button type="button" role="switch" aria-checked={form.active} aria-label="Offer live" className="ax-switch-lg" data-on={form.active} onClick={() => set("active", !form.active)}><span /></button>
            </div>
          </div>
          {error && <p className="adm-field-error mt-2" role="alert">{error}</p>}
        </section>
      </div>
    </Drawer>
  );
}

function offerPreview(kind: Preset, type: Promo["type"], value: string) {
  if (type === "shipping") return <><Truck size={13} className="mr-1 inline" /> Free delivery</>;
  if (type === "percent") return `${value || 0}% off${kind === "volume" ? " · volume" : kind === "bundle" ? " · bundle" : ""}`;
  return `${formatBDT(Number(value) || 0)} off`;
}
