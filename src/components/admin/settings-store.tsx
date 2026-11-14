"use client";

/**
 * Settings → Store & Checkout.
 * Grouped cards, each an expandable block: payments, delivery, lithium hazmat
 * compliance, tax and stock alerts. Toggles are the primary control.
 */
import { useState } from "react";
import {
  BatteryWarning, ChevronDown, CreditCard, Package, Percent, Receipt, Truck, Wallet,
} from "lucide-react";
import { ops } from "@/db/ops-store";
import { DEFAULT_SETTINGS, gatewayReady, type GatewayId, type StoreSettings } from "@/lib/settings";
import { GATEWAY_LABEL } from "@/lib/payments";
import { audit } from "@/lib/ops";
import { formatBDT } from "@/lib/format";
import { ConfirmButton, Field, Toggle } from "./admin-ui";

const GATEWAYS: Array<{ id: GatewayId; label: string; blurb: string }> = [
  { id: "bkash", label: "bKash", blurb: "Most-used wallet in Bangladesh" },
  { id: "nagad", label: "Nagad", blurb: "Wallet with lower merchant fees" },
  { id: "sslcommerz", label: "Card / SSLCommerz", blurb: "Visa, Mastercard, Amex" },
  { id: "cod", label: "Cash on delivery", blurb: "Pay the courier at the door" },
];

const lastSettingsAudit = new Map<string, number>();
function auditArea(area: string) {
  const now = Date.now();
  if (now - (lastSettingsAudit.get(area) ?? 0) < 60_000) return;
  lastSettingsAudit.set(area, now);
  audit("Changed settings", area);
}

export function useSettingsEditor() {
  const [revision, setRevision] = useState(0);
  const settings = ops.state.settings;
  const edit = <K extends keyof StoreSettings>(key: K, patch: Partial<StoreSettings[K]>) => {
    ops.updateSettings((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    auditArea(String(key));
    setRevision((value) => value + 1);
  };
  const editGateway = (id: GatewayId, patch: Partial<StoreSettings["payments"][GatewayId]>) => {
    ops.updateSettings((current) => ({ ...current, payments: { ...current.payments, [id]: { ...current.payments[id], ...patch } } }));
    auditArea(`payments · ${id}`);
    setRevision((value) => value + 1);
  };
  const restore = () => {
    ops.updateSettings(() => structuredClone(DEFAULT_SETTINGS));
    audit("Restored default settings", "All settings");
    setRevision((value) => value + 1);
  };
  return { settings, edit, editGateway, restore, revision };
}

export function SettingsCard({ id, title, blurb, icon, summary, defaultOpen = false, children }: {
  id: string; title: string; blurb: string; icon: React.ReactNode; summary?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="ax-set-card" data-open={open || undefined}>
      <button type="button" className="ax-set-card-head" aria-expanded={open} aria-controls={`set-${id}`} onClick={() => setOpen((value) => !value)}>
        <span className="ax-set-icon">{icon}</span>
        <span className="min-w-0 flex-1 text-left"><span className="ax-body block font-semibold">{title}</span><span className="ax-caption block">{blurb}</span></span>
        {summary && <span className="ax-set-summary">{summary}</span>}
        <ChevronDown size={16} className="ax-set-chevron" />
      </button>
      {open && <div id={`set-${id}`} className="ax-set-body">{children}</div>}
    </section>
  );
}

export function StoreCheckout({ toast }: { toast: (message: string) => void }) {
  const { settings, edit, editGateway, restore, revision } = useSettingsEditor();
  void revision; void toast;

  return (
    <div className="ax-set-stack">
      <SettingsCard id="payments" title="Payment gateways" icon={<Wallet size={16} />} defaultOpen
        blurb="What customers can pay with at checkout"
        summary={<>{GATEWAYS.filter((gateway) => gatewayReady(gateway.id, settings)).length}/{GATEWAYS.length} ready</>}>
        <ul className="ax-gateway-list">
          {GATEWAYS.map((gateway) => {
            const config = settings.payments[gateway.id];
            const ready = gatewayReady(gateway.id, settings);
            const enabled = gateway.id === "cod" ? settings.shipping.codEnabled : Boolean(config.enabled);
            return (
              <li key={gateway.id}>
                <div className="ax-gateway-row">
                  <span className="ax-set-icon" data-tone={enabled ? "on" : "off"}><CreditCard size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="ax-body block font-medium">{gateway.label}</span><span className="ax-caption block">{ready ? "Configured and live" : config.publicKey || config.secretKey ? "Needs one more credential" : `Sandbox · ${gateway.id === "cod" ? "no keys needed" : "no keys yet"}`}</span></span>
                  <span className={`ax-set-state`} data-on={enabled}>{enabled ? "On" : "Off"}</span>
                  <button type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? "Disable" : "Enable"} ${gateway.label}`} className="ax-switch-lg" data-on={enabled}
                    onClick={() => {
                      if (gateway.id === "cod") edit("shipping", { codEnabled: !settings.shipping.codEnabled });
                      else editGateway(gateway.id, { enabled: !config.enabled });
                    }}><span /></button>
                </div>
              </li>
            );
          })}
        </ul>
        <details className="ax-set-details">
          <summary><span>Gateway credentials</span><span className="ax-caption">Advanced</span></summary>
          <div className="grid gap-3 pt-3 sm:grid-cols-2">
            {GATEWAYS.filter((gateway) => gateway.id !== "cod").map((gateway) => {
              const config = settings.payments[gateway.id];
              return (
                <div key={gateway.id} className="ax-gateway-credentials">
                  <p className="ax-caption font-semibold">{GATEWAY_LABEL[gateway.id] ?? gateway.label}</p>
                  <Field label="Public / merchant key"><input className="adm-input adm-mono" value={config.publicKey} onChange={(event) => editGateway(gateway.id, { publicKey: event.target.value })} /></Field>
                  <Field label="Secret key"><input className="adm-input adm-mono" type="password" value={config.secretKey} onChange={(event) => editGateway(gateway.id, { secretKey: event.target.value })} /></Field>
                  <Field label="Send-money number" hint="bKash / Nagad manual fallback"><input className="adm-input adm-mono" value={config.merchantNumber} onChange={(event) => editGateway(gateway.id, { merchantNumber: event.target.value })} /></Field>
                </div>
              );
            })}
          </div>
        </details>
      </SettingsCard>

      <SettingsCard id="shipping" title="Shipping & delivery" icon={<Truck size={16} />}
        blurb="Rates, free-shipping threshold and cash-on-delivery limits"
        summary={<>{settings.shipping.codEnabled ? "COD on" : "COD off"} · free over {formatBDT(settings.shipping.freeThreshold)}</>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Free delivery over ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.freeThreshold} onChange={(event) => edit("shipping", { freeThreshold: Number(event.target.value) || 0 })} /></Field>
          <Field label="Inside Dhaka ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.insideDhaka} onChange={(event) => edit("shipping", { insideDhaka: Number(event.target.value) || 0 })} /></Field>
          <Field label="Outside Dhaka ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.outsideDhaka} onChange={(event) => edit("shipping", { outsideDhaka: Number(event.target.value) || 0 })} /></Field>
          <Field label="Express inside ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.expressInside} onChange={(event) => edit("shipping", { expressInside: Number(event.target.value) || 0 })} /></Field>
          <Field label="Express outside ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.expressOutside} onChange={(event) => edit("shipping", { expressOutside: Number(event.target.value) || 0 })} /></Field>
          <Field label="COD ceiling ৳" hint="Prepayment required above this"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.codMaxOrder} onChange={(event) => edit("shipping", { codMaxOrder: Number(event.target.value) || 0 })} /></Field>
        </div>
        <Toggle label="Accept cash on delivery" hint="COD drives most orders but carries refusal risk." checked={settings.shipping.codEnabled} onChange={(value) => edit("shipping", { codEnabled: value })} />
      </SettingsCard>

      <SettingsCard id="hazmat" title="Lithium shipping compliance" icon={<BatteryWarning size={16} />}
        blurb="Class 9 dangerous goods rules for cells and packs"
        summary={<>{settings.compliance.unNumber} · {settings.compliance.surfaceOnly ? "surface only" : "air allowed"}</>}>
        <Toggle label="Enabled · declare lithium batteries" hint="Adds the UN number and watt-hour declaration to parcels and courier manifests." checked={settings.compliance.hazmatEnabled} onChange={(value) => edit("compliance", { hazmatEnabled: value })} />
        <Toggle label="Surface transport only" hint="Never ship lithium by air. Required for most couriers in Bangladesh." checked={settings.compliance.surfaceOnly} onChange={(value) => edit("compliance", { surfaceOnly: value })} />
        <Toggle label="Declare watt-hours" hint="Print the Wh rating beside every pack line for courier acceptance." checked={settings.compliance.declareWattHours} onChange={(value) => edit("compliance", { declareWattHours: value })} />
        <Toggle label="Require consignment note" hint="Block fulfilment until a dangerous-goods note is attached." checked={settings.compliance.requireConsignmentNote} onChange={(value) => edit("compliance", { requireConsignmentNote: value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="UN number" hint="UN3480 loose cells · UN3481 packed in equipment">
            <select className="adm-select" value={settings.compliance.unNumber} onChange={(event) => edit("compliance", { unNumber: event.target.value })}>
              <option value="UN3480">UN3480 — lithium-ion cells</option>
              <option value="UN3481">UN3481 — with / in equipment</option>
              <option value="UN3090">UN3090 — lithium metal</option>
            </select>
          </Field>
          <Field label="Max cells per parcel" hint="Above this, split the shipment">
            <input className="adm-input adm-num" inputMode="numeric" value={settings.compliance.maxCellsPerParcel} onChange={(event) => edit("compliance", { maxCellsPerParcel: Number(event.target.value) || 0 })} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard id="tax" title="Tax" icon={<Receipt size={16} />} blurb="VAT rules applied at checkout"
        summary={<>{settings.compliance.taxEnabled ? `${settings.compliance.taxLabel} ${settings.compliance.taxPercent}%` : "Not applied"}</>}>
        <Toggle label="Charge tax at checkout" hint="Off while you are not VAT-registered." checked={settings.compliance.taxEnabled} onChange={(value) => edit("compliance", { taxEnabled: value })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tax label"><input className="adm-input" value={settings.compliance.taxLabel} onChange={(event) => edit("compliance", { taxLabel: event.target.value })} /></Field>
          <Field label="Rate %"><input className="adm-input adm-num" inputMode="decimal" value={settings.compliance.taxPercent} onChange={(event) => edit("compliance", { taxPercent: Math.min(30, Number(event.target.value) || 0) })} /></Field>
          <Field label="Pricing"><select className="adm-select" value={settings.compliance.taxInclusive ? "inclusive" : "exclusive"} onChange={(event) => edit("compliance", { taxInclusive: event.target.value === "inclusive" })}><option value="inclusive">Prices include tax</option><option value="exclusive">Add tax at checkout</option></select></Field>
        </div>
      </SettingsCard>

      <SettingsCard id="alerts" title="Stock alerts" icon={<Package size={16} />} blurb="When the console, and warehouse, should warn"
        summary={<>≤ {settings.compliance.lowStockThreshold} units</>}>
        <Field label="Low-stock threshold" hint="SKUs at or below this count appear in Overview and Stock.">
          <input className="adm-input adm-num" inputMode="numeric" value={settings.compliance.lowStockThreshold} onChange={(event) => edit("compliance", { lowStockThreshold: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
        <Toggle label="Daily stock digest" hint="Summarise every low SKU once a day instead of per order." checked={settings.compliance.lowStockDailyDigest} onChange={(value) => edit("compliance", { lowStockDailyDigest: value })} />
        <Toggle label="Cart reminders on" hint="Send recovery messages after the delay below." checked={settings.notifications.abandonedCart} onChange={(value) => edit("notifications", { abandonedCart: value })} />
        <Field label="Cart reminder after (minutes)">
          <input className="adm-input adm-num" inputMode="numeric" value={settings.notifications.abandonedCartAfterMinutes} onChange={(event) => edit("notifications", { abandonedCartAfterMinutes: Number(event.target.value) || 0 })} />
        </Field>
      </SettingsCard>

      <SettingsCard id="identity" title="Business identity" icon={<Percent size={16} />} blurb="Invoices, legal pages and gateway onboarding">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Trading name"><input className="adm-input" value={settings.identity.name} onChange={(event) => edit("identity", { name: event.target.value })} /></Field>
          <Field label="Legal name"><input className="adm-input" value={settings.identity.legalName} onChange={(event) => edit("identity", { legalName: event.target.value })} /></Field>
          <Field label="Support phone"><input className="adm-input" value={settings.identity.phone} onChange={(event) => edit("identity", { phone: event.target.value })} /></Field>
          <Field label="Email"><input className="adm-input" value={settings.identity.email} onChange={(event) => edit("identity", { email: event.target.value })} /></Field>
          <Field label="Trade licence"><input className="adm-input" value={settings.identity.tradeLicence} onChange={(event) => edit("identity", { tradeLicence: event.target.value })} /></Field>
          <Field label="BIN / VAT"><input className="adm-input" value={settings.identity.binNumber} onChange={(event) => edit("identity", { binNumber: event.target.value })} /></Field>
        </div>
      </SettingsCard>

      <div className="ax-set-footer">
        <ConfirmButton variant="ghost" confirmLabel="Replace all settings?" onConfirm={restore}>Restore defaults</ConfirmButton>
        <p className="ax-caption">Every change saves instantly and is recorded in the activity log.</p>
      </div>
    </div>
  );
}
