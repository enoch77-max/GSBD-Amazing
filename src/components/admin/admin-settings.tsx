"use client";

import { useState } from "react";
import { AlertTriangle, Building2, Check, CreditCard, Eye, EyeOff, KeyRound, Megaphone, RotateCcw, Send, ShieldCheck, Truck } from "lucide-react";
import { ADMIN_SESSION_HOURS, adminSessionExpiresAt, adminSignOut, audit, changeAdminPin, currentAdmin, usingDefaultAdminPin } from "@/lib/ops";

/* One activity entry per settings area per minute, not one per keystroke. */
const lastSettingsAudit = new Map<string, number>();
function auditSettings(area: string) {
  const now = Date.now();
  if (now - (lastSettingsAudit.get(area) ?? 0) < 60_000) return;
  lastSettingsAudit.set(area, now);
  audit("Changed settings", area);
}
import { ops } from "@/db/ops-store";
import { DEFAULT_SETTINGS, gatewayReady, readinessAudit, type GatewayId, type StoreSettings } from "@/lib/settings";
import { GATEWAY_LABEL } from "@/lib/payments";
import { Badge, Button, Field, Panel, Toggle } from "./admin-ui";

const SECTIONS = [
  { id: "identity", label: "Business", icon: Building2 },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "shipping", label: "Shipping & COD", icon: Truck },
  { id: "risk", label: "Fraud rules", icon: ShieldCheck },
  { id: "notifications", label: "Messaging", icon: Send },
  { id: "courier", label: "Courier", icon: Truck },
  { id: "security", label: "Security", icon: KeyRound },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function AdminSettings({ toast, initialSection }: { toast: (message: string) => void; initialSection?: SectionId }) {
  const [section, setSection] = useState<SectionId>(initialSection ?? "identity");
  const [revision, setRevision] = useState(0);
  const settings = ops.state.settings;
  const issues = readinessAudit(settings);
  void revision;

  const edit = <K extends keyof StoreSettings>(key: K, patch: Partial<StoreSettings[K]>) => {
    ops.updateSettings((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    auditSettings(String(key));
    setRevision((value) => value + 1);
  };

  const editGateway = (id: GatewayId, patch: Partial<StoreSettings["payments"][GatewayId]>) => {
    ops.updateSettings((current) => ({ ...current, payments: { ...current.payments, [id]: { ...current.payments[id], ...patch } } }));
    auditSettings(`payments · ${id}`);
    setRevision((value) => value + 1);
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="adm-page-title">Settings</h1>
          <p className="text-[0.78rem] text-[#6e6e73]">Everything needed to switch this store from demo to live trading.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { ops.updateSettings(() => structuredClone(DEFAULT_SETTINGS)); audit("Restored default settings", "All settings"); setRevision((v) => v + 1); toast("Settings restored to defaults"); }}>
          <RotateCcw size={12} /> Restore defaults
        </Button>
      </div>

      {issues.length > 0 && (
        <div className="rounded-xl border border-[#f3d38a] bg-[#fffbeb] p-3">
          <p className="flex items-center gap-2 text-[0.82rem] font-semibold text-[#92400e]"><AlertTriangle size={14} /> {issues.filter((i) => i.severity === "blocker").length} blockers, {issues.filter((i) => i.severity === "warning").length} warnings</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {issues.map((issue) => (
              <li key={issue.id}><Badge tone={issue.severity === "blocker" ? "rose" : "amber"}>{issue.label}</Badge></li>
            ))}
          </ul>
        </div>
      )}
      {issues.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-[0.82rem] text-[#15803d]">
          <Check size={15} /> All launch checks passed — the store is configured for live trading.
        </div>
      )}

      <div className="adm-scroll flex gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((entry) => (
          <button key={entry.id} type="button" className="adm-chip inline-flex items-center gap-1.5" data-active={section === entry.id} onClick={() => setSection(entry.id)}>
            <entry.icon size={12} /> {entry.label}
          </button>
        ))}
      </div>

      {section === "security" && <SecurityPanel toast={toast} />}

      {section === "identity" && (
        <Panel title="Business identity" subtitle="Shown on invoices, legal pages and required for gateway onboarding">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trading name"><input className="adm-input" value={settings.identity.name} onChange={(e) => edit("identity", { name: e.target.value })} /></Field>
            <Field label="Registered legal name"><input className="adm-input" value={settings.identity.legalName} onChange={(e) => edit("identity", { legalName: e.target.value })} /></Field>
            <Field label="Domain" hint="Used in receipts, sitemap and recovery links"><input className="adm-input" value={settings.identity.domain} onChange={(e) => edit("identity", { domain: e.target.value })} /></Field>
            <Field label="Support phone"><input className="adm-input" value={settings.identity.phone} onChange={(e) => edit("identity", { phone: e.target.value })} /></Field>
            <Field label="WhatsApp number" hint="Digits only, with country code"><input className="adm-input" value={settings.identity.whatsapp} onChange={(e) => edit("identity", { whatsapp: e.target.value })} /></Field>
            <Field label="Email"><input className="adm-input" value={settings.identity.email} onChange={(e) => edit("identity", { email: e.target.value })} /></Field>
            <Field label="Trade licence" hint="Mandatory for bKash / SSLCommerz merchant accounts"><input className="adm-input" value={settings.identity.tradeLicence} onChange={(e) => edit("identity", { tradeLicence: e.target.value })} /></Field>
            <Field label="BIN / VAT number"><input className="adm-input" value={settings.identity.binNumber} onChange={(e) => edit("identity", { binNumber: e.target.value })} /></Field>
            <Field label="Shop address"><input className="adm-input" value={settings.identity.address} onChange={(e) => edit("identity", { address: e.target.value })} /></Field>
            <Field label="Opening hours"><input className="adm-input" value={settings.identity.hours} onChange={(e) => edit("identity", { hours: e.target.value })} /></Field>
          </div>
        </Panel>
      )}

      {section === "payments" && (
        <>
          <Panel title="Payment gateways" subtitle="Sandbox runs the full funnel with test credentials. Live requires both keys.">
            <div className="flex flex-col gap-3">
              {(["bkash", "nagad", "sslcommerz", "cod"] as GatewayId[]).map((id) => (
                <GatewayCard key={id} id={id} settings={settings} onChange={(patch) => editGateway(id, patch)} />
              ))}
            </div>
          </Panel>
          <Panel title="How money is confirmed" subtitle="Never trust a customer-entered transaction ID">
            <ol className="flex flex-col gap-2 text-[0.78rem] leading-relaxed text-[#3a3a3c]">
              <li><b className="text-[#1d1d1f]">1.</b> Checkout creates a payment intent with a unique reference tied to the order number.</li>
              <li><b className="text-[#1d1d1f]">2.</b> The customer pays on the provider's own page — card data never touches this store.</li>
              <li><b className="text-[#1d1d1f]">3.</b> The provider calls <code className="adm-mono text-[#4d7c0f]">/api/webhooks/payments</code>; the signature is verified and the amount matched against the order before it is marked paid.</li>
              <li><b className="text-[#1d1d1f]">4.</b> A manual TrxID only ever sets the order to <i>Claimed</i> until you confirm it in the order drawer.</li>
            </ol>
          </Panel>
        </>
      )}

      {section === "marketing" && (
        <Panel title="Pixels & measurement" subtitle="Nothing fires until the visitor consents">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Meta Pixel ID" hint="Events Manager → Data sources"><input className="adm-input" placeholder="123456789012345" value={settings.marketing.metaPixelId} onChange={(e) => edit("marketing", { metaPixelId: e.target.value })} /></Field>
            <Field label="Meta test event code" hint="Optional, for Test Events verification"><input className="adm-input" placeholder="TEST12345" value={settings.marketing.metaTestEventCode} onChange={(e) => edit("marketing", { metaTestEventCode: e.target.value })} /></Field>
            <Field label="GA4 measurement ID"><input className="adm-input" placeholder="G-XXXXXXXXXX" value={settings.marketing.ga4MeasurementId} onChange={(e) => edit("marketing", { ga4MeasurementId: e.target.value })} /></Field>
            <Field label="TikTok Pixel ID"><input className="adm-input" placeholder="CXXXXXXXXXXXXXXXXX" value={settings.marketing.tiktokPixelId} onChange={(e) => edit("marketing", { tiktokPixelId: e.target.value })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Server-side Conversions API" hint="Sends a duplicate event from the server with the same event_id. Recovers conversions lost to ad blockers and iOS." checked={settings.marketing.conversionsApi} onChange={(value) => edit("marketing", { conversionsApi: value })} />
            <Toggle label="Require consent before tracking" hint="Shows the cookie banner and withholds all pixels until accepted." checked={settings.marketing.consentRequired} onChange={(value) => edit("marketing", { consentRequired: value })} />
          </div>
        </Panel>
      )}

      {section === "shipping" && (
        <Panel title="Delivery & cash on delivery" subtitle="Rates apply instantly at checkout">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Free delivery over ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.freeThreshold} onChange={(e) => edit("shipping", { freeThreshold: Number(e.target.value) || 0 })} /></Field>
            <Field label="Inside Dhaka ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.insideDhaka} onChange={(e) => edit("shipping", { insideDhaka: Number(e.target.value) || 0 })} /></Field>
            <Field label="Outside Dhaka ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.outsideDhaka} onChange={(e) => edit("shipping", { outsideDhaka: Number(e.target.value) || 0 })} /></Field>
            <Field label="Express inside ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.expressInside} onChange={(e) => edit("shipping", { expressInside: Number(e.target.value) || 0 })} /></Field>
            <Field label="Express outside ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.expressOutside} onChange={(e) => edit("shipping", { expressOutside: Number(e.target.value) || 0 })} /></Field>
            <Field label="COD ceiling ৳" hint="Above this, prepayment is required"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.codMaxOrder} onChange={(e) => edit("shipping", { codMaxOrder: Number(e.target.value) || 0 })} /></Field>
            <Field label="Advance above ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.codAdvanceAbove} onChange={(e) => edit("shipping", { codAdvanceAbove: Number(e.target.value) || 0 })} /></Field>
            <Field label="Advance amount ৳"><input className="adm-input adm-num" inputMode="numeric" value={settings.shipping.codAdvanceAmount} onChange={(e) => edit("shipping", { codAdvanceAmount: Number(e.target.value) || 0 })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Accept cash on delivery" hint="COD drives most Bangladeshi orders but carries refusal risk." checked={settings.shipping.codEnabled} onChange={(value) => edit("shipping", { codEnabled: value })} />
          </div>
        </Panel>
      )}

      {section === "risk" && (
        <Panel title="Fraud & abuse rules" subtitle="Applied to every order before it reaches your packing bench">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="COD refusal limit" hint="Flag a number after this many cancelled or returned parcels"><input className="adm-input adm-num" inputMode="numeric" value={settings.risk.codStrikeLimit} onChange={(e) => edit("risk", { codStrikeLimit: Number(e.target.value) || 0 })} /></Field>
            <Field label="Max orders per number / 24h"><input className="adm-input adm-num" inputMode="numeric" value={settings.risk.maxOrdersPerPhonePerDay} onChange={(e) => edit("risk", { maxOrdersPerPhonePerDay: Number(e.target.value) || 0 })} /></Field>
            <Field label="High-value alert ৳" hint="Orders above this are flagged for a confirmation call"><input className="adm-input adm-num" inputMode="numeric" value={settings.risk.maxOrderValue} onChange={(e) => edit("risk", { maxOrderValue: Number(e.target.value) || 0 })} /></Field>
            <Field label="Promo uses per number"><input className="adm-input adm-num" inputMode="numeric" value={settings.risk.promoPerPhoneLimit} onChange={(e) => edit("risk", { promoPerPhoneLimit: Number(e.target.value) || 0 })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Verify phone by OTP at checkout" hint="Cuts fake numbers and refused parcels dramatically. Needs an SMS provider." checked={settings.risk.requirePhoneOtp} onChange={(value) => edit("risk", { requirePhoneOtp: value })} />
          </div>
        </Panel>
      )}

      {section === "notifications" && (
        <Panel title="Customer messaging" subtitle="Confirmations, courier updates and cart recovery">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="SMS provider">
              <select className="adm-select" value={settings.notifications.smsProvider} onChange={(e) => edit("notifications", { smsProvider: e.target.value as StoreSettings["notifications"]["smsProvider"] })}>
                <option value="none">Not configured (queue only)</option>
                <option value="bulksmsbd">BulkSMSBD</option>
                <option value="greenweb">GreenWeb SMS</option>
              </select>
            </Field>
            <Field label="API key"><input className="adm-input" type="password" value={settings.notifications.smsApiKey} onChange={(e) => edit("notifications", { smsApiKey: e.target.value })} /></Field>
            <Field label="Sender ID"><input className="adm-input" value={settings.notifications.smsSenderId} onChange={(e) => edit("notifications", { smsSenderId: e.target.value })} /></Field>
            <Field label="Low stock alert at"><input className="adm-input adm-num" inputMode="numeric" value={settings.notifications.lowStockThreshold} onChange={(e) => edit("notifications", { lowStockThreshold: Number(e.target.value) || 0 })} /></Field>
            <Field label="Cart reminder after (min)"><input className="adm-input adm-num" inputMode="numeric" value={settings.notifications.abandonedCartAfterMinutes} onChange={(e) => edit("notifications", { abandonedCartAfterMinutes: Number(e.target.value) || 0 })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Order confirmation message" checked={settings.notifications.orderConfirmation} onChange={(value) => edit("notifications", { orderConfirmation: value })} />
            <Toggle label="Status update messages" hint="Sent on every fulfilment step change." checked={settings.notifications.statusUpdates} onChange={(value) => edit("notifications", { statusUpdates: value })} />
            <Toggle label="Abandoned cart recovery" checked={settings.notifications.abandonedCart} onChange={(value) => edit("notifications", { abandonedCart: value })} />
          </div>
        </Panel>
      )}

      {section === "courier" && (
        <Panel title="Courier integration" subtitle="Auto-book parcels when an order is marked shipped">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Provider">
              <select className="adm-select" value={settings.courier.provider} onChange={(e) => edit("courier", { provider: e.target.value as StoreSettings["courier"]["provider"] })}>
                <option value="manual">Manual entry</option>
                <option value="pathao">Pathao Courier API</option>
                <option value="steadfast">Steadfast API</option>
              </select>
            </Field>
            <Field label="API key"><input className="adm-input" type="password" value={settings.courier.apiKey} onChange={(e) => edit("courier", { apiKey: e.target.value })} /></Field>
            <Field label="API secret"><input className="adm-input" type="password" value={settings.courier.apiSecret} onChange={(e) => edit("courier", { apiSecret: e.target.value })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Auto-book on shipment" hint="Creates the consignment the moment an order moves to Shipped." checked={settings.courier.autoBook} onChange={(value) => edit("courier", { autoBook: value })} />
          </div>
        </Panel>
      )}

      <Panel title="Sample history" subtitle="Six weeks of generated orders so every report is readable before your first real sale">
        <Toggle
          label="Include sample orders and ad spend"
          hint="Sample rows are labelled, never mix with real orders, and are excluded from stock movements. Turn this off the day you go live."
          checked={ops.state.sampleData}
          onChange={(value) => { ops.set({ sampleData: value }); setRevision((v) => v + 1); toast(value ? "Sample history restored" : "Showing your orders only"); }}
        />
      </Panel>

      <Panel title="Danger zone" subtitle="Preview data only — never touches a production database">
        <Button variant="danger" onClick={() => { ops.resetTrading(); setRevision((v) => v + 1); toast("Trading history cleared"); }}>
          <RotateCcw size={13} /> Clear orders, events and messages
        </Button>
      </Panel>
    </>
  );
}

function GatewayCard({ id, settings, onChange }: {
  id: GatewayId;
  settings: StoreSettings;
  onChange: (patch: Partial<StoreSettings["payments"][GatewayId]>) => void;
}) {
  const config = settings.payments[id];
  const [reveal, setReveal] = useState(false);
  const ready = gatewayReady(id, settings);

  return (
    <div className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.86rem] font-semibold">{GATEWAY_LABEL[id]}</span>
        <Badge tone={ready ? "emerald" : "rose"}>{ready ? (config.mode === "live" ? "live" : "sandbox") : "disabled"}</Badge>
        <div className="ml-auto flex items-center gap-2">
          {id !== "cod" && (
            <select className="adm-select w-auto" data-size="sm" value={config.mode} onChange={(e) => onChange({ mode: e.target.value as "sandbox" | "live" })} aria-label={`${GATEWAY_LABEL[id]} mode`}>
              <option value="sandbox">Sandbox</option>
              <option value="live">Live</option>
            </select>
          )}
          <button type="button" className="adm-switch" data-on={config.enabled} role="switch" aria-checked={config.enabled} aria-label={`Enable ${GATEWAY_LABEL[id]}`} onClick={() => onChange({ enabled: !config.enabled })}><span /></button>
        </div>
      </div>

      {id === "cod" ? (
        <p className="mt-2 text-[0.74rem] leading-relaxed text-[#6e6e73]">
          Cash collected by the rider. Ceiling ৳{settings.shipping.codMaxOrder.toLocaleString("en-IN")}; advance of ৳{settings.shipping.codAdvanceAmount} above ৳{settings.shipping.codAdvanceAbove.toLocaleString("en-IN")}.
        </p>
      ) : (
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
          <Field label={id === "sslcommerz" ? "Store ID" : "App key"}>
            <input className="adm-input" value={config.publicKey} placeholder={config.mode === "live" ? "required" : "optional in sandbox"} onChange={(e) => onChange({ publicKey: e.target.value })} />
          </Field>
          <Field label={id === "sslcommerz" ? "Store password" : "App secret"}>
            <div className="relative">
              <input className="adm-input pr-9" type={reveal ? "text" : "password"} value={config.secretKey} placeholder={config.mode === "live" ? "required" : "optional in sandbox"} onChange={(e) => onChange({ secretKey: e.target.value })} />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6e6e73] hover:text-[#4d7c0f]" onClick={() => setReveal((value) => !value)} aria-label={reveal ? "Hide secret" : "Show secret"}>
                {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </Field>
          {id !== "sslcommerz" && (
            <Field label="Send-money number"><input className="adm-input" value={config.merchantNumber} onChange={(e) => onChange({ merchantNumber: e.target.value })} /></Field>
          )}
        </div>
      )}
      {config.mode === "live" && !ready && id !== "cod" && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.72rem] text-[#b42318]"><AlertTriangle size={12} /> Live mode needs both credentials — this method is hidden from checkout until they are set.</p>
      )}
    </div>
  );
}

export function SecurityPanel({ toast }: { toast: (message: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  void revision;
  const me = currentAdmin();
  const defaultPin = usingDefaultAdminPin() && me?.roleId === "owner";
  const expires = adminSessionExpiresAt();
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = changeAdminPin(current, next, confirm);
    if (!result.ok) { setError(result.error); return; }
    setCurrent(""); setNext(""); setConfirm(""); setError("");
    setRevision((value) => value + 1);
    toast("Console PIN changed — use the new PIN next time");
  };

  return (
    <div className="adm-grid lg:grid-cols-2">
      <Panel title="Your PIN" subtitle={me ? `${me.name} · ${defaultPin ? "still using the default preview PIN" : "custom PIN set"}` : ""}>
        {defaultPin && (
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-[#f3d38a] bg-[#fffbeb] p-2.5 text-[0.75rem] text-[#92400e]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> The default PIN is shown on the sign-in screen. Set your own PIN before sharing this store.
          </p>
        )}
        <form className="grid gap-3" onSubmit={submit} noValidate>
          <Field label={defaultPin ? "Current PIN (default 246810)" : "Current PIN"}>
            <input className="adm-input adm-num tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(digits(e.target.value)); setError(""); }} aria-label="Current PIN" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New 6-digit PIN" hint="Avoid repeated or sequential digits">
              <input className="adm-input adm-num tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="new-password" value={next} onChange={(e) => { setNext(digits(e.target.value)); setError(""); }} aria-label="New PIN" />
            </Field>
            <Field label="Confirm new PIN">
              <input className="adm-input adm-num tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(digits(e.target.value)); setError(""); }} aria-label="Confirm new PIN" />
            </Field>
          </div>
          {error && <p className="adm-field-error" role="alert">{error}</p>}
          <div><Button type="submit" variant="primary" disabled={current.length < 6 || next.length < 6 || confirm.length < 6}><KeyRound size={13} /> Change PIN</Button></div>
        </form>
      </Panel>

      <Panel title="Access & sessions" subtitle="How you and your team open this console">
        <div className="adm-help-card text-[0.78rem] leading-relaxed text-[#3a3a3c]">
          <p>Open <code>/admin</code> on your store, or use <b className="text-[#1d1d1f]">Menu → Merchant console</b> and the footer link.</p>
          <p>Sessions end after {ADMIN_SESSION_HOURS} hours. Five wrong PINs lock sign-in for one minute.</p>
          {expires && <p>This session ends at <b className="text-[#1d1d1f]">{expires.toLocaleString()}</b>.</p>}
          <p className="text-[#6e6e73]">This preview stores data and the PIN hash in this browser only. On the production server, owners sign in with email and password, and sessions are enforced server-side.</p>
          <div><Button size="sm" variant="ghost" onClick={() => { adminSignOut(); window.location.reload(); }}>Sign out now</Button></div>
        </div>
      </Panel>
    </div>
  );
}
