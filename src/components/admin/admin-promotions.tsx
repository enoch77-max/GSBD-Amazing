"use client";

import { useState, useSyncExternalStore } from "react";
import { Copy, Pause, Pencil, Play, Plus, RotateCcw, TicketPercent, Trash2 } from "lucide-react";
import { ops } from "@/db/ops-store";
import { DEFAULT_PROMOS, PROMOS, type Promo } from "@/lib/commerce";
import { audit, can, listOrders } from "@/lib/ops";
import { formatBDT } from "@/lib/format";
import { Badge, Button, Drawer, Empty, Field, PageHead, Panel, ReadOnlyNote, Stat } from "./admin-ui";

type Status = "live" | "paused" | "scheduled" | "expired" | "used up";

export function promoStatus(promo: Promo, uses: number, now = Date.now()): Status {
  if (promo.active === false) return "paused";
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return "scheduled";
  if (promo.endsAt && new Date(promo.endsAt).getTime() < now) return "expired";
  if (promo.maxUses && uses >= promo.maxUses) return "used up";
  return "live";
}
const TONE: Record<Status, string> = { live: "emerald", paused: "neutral", scheduled: "sky", expired: "rose", "used up": "amber" };

function describe(promo: Promo) {
  const value = promo.type === "percent" ? `${promo.value}% off${promo.maxDiscount ? ` (max ${formatBDT(promo.maxDiscount)})` : ""}`
    : promo.type === "flat" ? `${formatBDT(promo.value)} off` : "Free delivery";
  return `${value}${promo.minSubtotal ? ` · min ${formatBDT(promo.minSubtotal)}` : ""}`;
}

export function AdminPromotions({ toast }: { toast: (message: string) => void }) {
  useSyncExternalStore(ops.subscribe, ops.getVersion, ops.getVersion);
  const [editing, setEditing] = useState<{ promo: Promo | null } | null>(null);
  const manage = can("promotions.manage");
  const promos = [...PROMOS];
  const orders = listOrders();
  const usage = (code: string) => orders.filter((order) => order.promoCode === code).length;
  const discountGiven = (code: string) => orders.filter((order) => order.promoCode === code).reduce((sum, order) => sum + (order.discount ?? 0), 0);
  const save = (next: Promo[], message: string, action: string, target: string) => {
    ops.setPromos(next);
    audit(action, target);
    toast(message);
  };
  const live = promos.filter((promo) => promoStatus(promo, usage(promo.code)) === "live").length;

  return (
    <>
      <PageHead title="Promotions" subtitle="Discount codes customers can apply at checkout. Changes take effect immediately."
        actions={manage && <>
          <Button size="sm" variant="ghost" onClick={() => save(DEFAULT_PROMOS.map((p) => ({ ...p })), "Default codes restored", "Restored default promotions", "All codes")}><RotateCcw size={12} /> Restore defaults</Button>
          <Button size="sm" variant="primary" onClick={() => setEditing({ promo: null })}><Plus size={13} /> New code</Button>
        </>} />
      {!manage && <ReadOnlyNote />}
      <div className="adm-kpis">
        <Stat label="Live codes" value={String(live)} hint={`${promos.length} total`} tone="emerald" icon={<TicketPercent size={16} />} />
        <Stat label="Orders with a code" value={String(orders.filter((o) => o.promoCode).length)} hint="all time" />
        <Stat label="Discount given" value={formatBDT(orders.reduce((s, o) => s + (o.promoCode ? o.discount ?? 0 : 0), 0))} hint="all time" tone="amber" />
      </div>
      <Panel>
        {promos.length === 0 ? <Empty icon={<TicketPercent size={20} />} title="No discount codes" body="Create a code to run a promotion." /> : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Code</th><th>Offer</th><th>Status</th><th>Schedule</th><th className="text-right">Uses</th><th className="text-right">Discount</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {promos.map((promo) => {
                  const uses = usage(promo.code);
                  const status = promoStatus(promo, uses);
                  return (
                    <tr key={promo.code}>
                      <td><span className="adm-code text-[0.8rem] font-semibold">{promo.code}</span><p className="mt-1 text-[0.7rem] text-[#6e6e73]">{promo.label}</p></td>
                      <td className="text-[0.76rem]">{describe(promo)}</td>
                      <td><Badge tone={TONE[status]}>{status}</Badge></td>
                      <td className="text-[0.72rem] text-[#6e6e73]">{promo.startsAt ? new Date(promo.startsAt).toLocaleDateString() : "Now"} → {promo.endsAt ? new Date(promo.endsAt).toLocaleDateString() : "No end"}</td>
                      <td className="adm-num text-right">{uses}{promo.maxUses ? ` / ${promo.maxUses}` : ""}</td>
                      <td className="adm-num text-right">{formatBDT(discountGiven(promo.code))}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button type="button" className="adm-icon-btn" disabled={!manage} title={promo.active === false ? "Resume" : "Pause"} aria-label={`${promo.active === false ? "Resume" : "Pause"} ${promo.code}`}
                            onClick={() => save(promos.map((p) => (p.code === promo.code ? { ...p, active: p.active === false } : p)), promo.active === false ? `${promo.code} resumed` : `${promo.code} paused`, promo.active === false ? "Resumed promotion" : "Paused promotion", promo.code)}>
                            {promo.active === false ? <Play size={13} /> : <Pause size={13} />}
                          </button>
                          <button type="button" className="adm-icon-btn" disabled={!manage} title="Edit" aria-label={`Edit ${promo.code}`} onClick={() => setEditing({ promo })}><Pencil size={13} /></button>
                          <button type="button" className="adm-icon-btn" disabled={!manage} title="Copy code" aria-label={`Copy ${promo.code}`} onClick={() => { void navigator.clipboard?.writeText(promo.code); toast("Code copied"); }}><Copy size={13} /></button>
                          <button type="button" className="adm-icon-btn" disabled={!manage} title="Delete" aria-label={`Delete ${promo.code}`} onClick={() => save(promos.filter((p) => p.code !== promo.code), `${promo.code} deleted`, "Deleted promotion", promo.code)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && <PromoEditor promo={editing.promo} existing={promos} onClose={() => setEditing(null)} onSave={(next, isNew) => { save(next, isNew ? "Discount code created" : "Discount code saved", isNew ? "Created promotion" : "Updated promotion", next.find((p) => !promos.some((o) => JSON.stringify(o) === JSON.stringify(p)))?.code ?? "Code"); setEditing(null); }} />}
    </>
  );
}

const toLocal = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

function PromoEditor({ promo, existing, onClose, onSave }: { promo: Promo | null; existing: Promo[]; onClose: () => void; onSave: (next: Promo[], isNew: boolean) => void }) {
  const [form, setForm] = useState({
    code: promo?.code ?? "", label: promo?.label ?? "", type: promo?.type ?? "percent" as Promo["type"],
    value: String(promo?.value ?? 10), minSubtotal: String(promo?.minSubtotal ?? 0), maxDiscount: promo?.maxDiscount ? String(promo.maxDiscount) : "",
    startsAt: toLocal(promo?.startsAt), endsAt: toLocal(promo?.endsAt), maxUses: promo?.maxUses ? String(promo.maxUses) : "", active: promo?.active !== false,
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | boolean) => { setForm((f) => ({ ...f, [key]: value })); setError(""); };
  const submit = () => {
    const code = form.code.trim().toUpperCase();
    const n = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
    if (!/^[A-Z0-9]{3,20}$/.test(code)) return setError("Codes use 3–20 letters or numbers, no spaces.");
    if (existing.some((p) => p.code === code && p.code !== promo?.code)) return setError("That code already exists.");
    if (form.label.trim().length < 3) return setError("Add a short customer-facing description.");
    const value = form.type === "shipping" ? 0 : n(form.value);
    if (form.type !== "shipping" && (!Number.isFinite(value) || value <= 0 || (form.type === "percent" && value > 90))) return setError(form.type === "percent" ? "Percent discounts must be between 1 and 90." : "Enter a discount amount above 0.");
    const minSubtotal = form.minSubtotal.trim() ? n(form.minSubtotal) : 0;
    if (!Number.isFinite(minSubtotal)) return setError("Minimum order must be a whole number.");
    if (form.type === "flat" && minSubtotal && value >= minSubtotal) return setError("A flat discount must be smaller than the minimum order.");
    const maxDiscount = form.maxDiscount.trim() ? n(form.maxDiscount) : undefined;
    if (maxDiscount !== undefined && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) return setError("Maximum discount must be a positive whole number.");
    const maxUses = form.maxUses.trim() ? n(form.maxUses) : null;
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) return setError("Usage limit must be at least 1.");
    const startsAt = form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null;
    const endsAt = form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null;
    if (startsAt && endsAt && startsAt > endsAt) return setError("The end date must be after the start date.");
    const next: Promo = { code, label: form.label.trim(), type: form.type, value, minSubtotal, ...(form.type === "percent" && maxDiscount ? { maxDiscount } : {}), startsAt, endsAt, maxUses, active: form.active };
    onSave(promo ? existing.map((p) => (p.code === promo.code ? next : p)) : [...existing, next], !promo);
  };
  return (
    <Drawer open onClose={onClose} title={promo ? `Edit ${promo.code}` : "New discount code"} subtitle="Customers enter this code at checkout"
      footer={<><Button variant="primary" onClick={submit}>{promo ? "Save code" : "Create code"}</Button><Button variant="ghost" onClick={onClose}>Cancel</Button>{error && <span className="adm-field-error" role="alert">{error}</span>}</>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code"><input className="adm-input adm-mono uppercase" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))} aria-label="Code" /></Field>
        <Field label="Type">
          <select className="adm-select" value={form.type} onChange={(e) => set("type", e.target.value)} aria-label="Discount type">
            <option value="percent">Percentage off</option><option value="flat">Fixed amount off</option><option value="shipping">Free delivery</option>
          </select>
        </Field>
      </div>
      <Field label="Customer-facing description"><input className="adm-input" value={form.label} placeholder="e.g. 10% off your order" onChange={(e) => set("label", e.target.value)} aria-label="Description" /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        {form.type !== "shipping" && <Field label={form.type === "percent" ? "Percent" : "Amount ৳"}><input className="adm-input adm-num" inputMode="numeric" value={form.value} onChange={(e) => set("value", e.target.value.replace(/\D/g, ""))} aria-label="Discount value" /></Field>}
        <Field label="Minimum order ৳"><input className="adm-input adm-num" inputMode="numeric" value={form.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value.replace(/\D/g, ""))} aria-label="Minimum order" /></Field>
        {form.type === "percent" && <Field label="Max discount ৳" hint="Optional cap"><input className="adm-input adm-num" inputMode="numeric" value={form.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value.replace(/\D/g, ""))} aria-label="Maximum discount" /></Field>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Starts"><input className="adm-input" type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} aria-label="Start date" /></Field>
        <Field label="Ends"><input className="adm-input" type="date" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} aria-label="End date" /></Field>
        <Field label="Usage limit" hint="Total orders"><input className="adm-input adm-num" inputMode="numeric" placeholder="Unlimited" value={form.maxUses} onChange={(e) => set("maxUses", e.target.value.replace(/\D/g, ""))} aria-label="Usage limit" /></Field>
      </div>
      <label className="inline-flex items-center gap-2 text-[0.8rem]"><input type="checkbox" className="adm-checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>
    </Drawer>
  );
}
