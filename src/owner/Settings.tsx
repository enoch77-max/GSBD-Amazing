"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Building2, Check, CreditCard, Eye, EyeOff, Megaphone,
  ScrollText, Send, ShieldCheck, Trash2, Truck, Users,
} from "lucide-react";
import { api, ApiError } from "@/lib/live";
import type { GatewayId, StoreSettings } from "@/lib/settings";
import { Badge, Button, Empty, Field, Panel, Toggle } from "@/components/admin/admin-ui";

const SECTIONS = [
  { id: "identity", label: "Business", icon: Building2 },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "shipping", label: "Shipping & COD", icon: Truck },
  { id: "risk", label: "Fraud rules", icon: ShieldCheck },
  { id: "notifications", label: "Messaging", icon: Send },
  { id: "courier", label: "Courier", icon: Truck },
  { id: "blocklist", label: "Blocklist", icon: ShieldCheck },
  { id: "users", label: "Team", icon: Users },
  { id: "audit", label: "Audit log", icon: ScrollText },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const GATEWAY_LABEL: Record<GatewayId, string> = {
  bkash: "bKash", nagad: "Nagad", sslcommerz: "Card / SSLCommerz", cod: "Cash on delivery",
};

export function OwnerSettings({ session, toast }: { session: { email: string; role: string }; toast: (message: string) => void }) {
  const [section, setSection] = useState<SectionId>("identity");
  const [draft, setDraft] = useState<StoreSettings | null>(null);
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await api<{ settings: StoreSettings }>("/api/admin/settings");
      setDraft(payload.settings);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setDenied(true);
      else toast(error instanceof ApiError ? error.message : "Could not load settings.");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (denied || session.role !== "owner") {
    return (
      <Panel title="Settings">
        <p className="flex items-center gap-2 text-[0.82rem] text-[#92400e]"><AlertTriangle size={15} /> Only the store owner can view or change settings.</p>
      </Panel>
    );
  }
  if (!draft) return <Panel title="Settings" subtitle="Loading…"><p className="text-[0.78rem] text-[#6e6e73]">Loading settings…</p></Panel>;

  const edit = <K extends keyof StoreSettings>(key: K, patch: Partial<StoreSettings[K]>) => {
    setDraft((current) => (current ? { ...current, [key]: { ...current[key], ...patch } } : current));
  };

  const editGateway = (id: GatewayId, patch: Partial<StoreSettings["payments"][GatewayId]>) => {
    setDraft((current) =>
      current ? { ...current, payments: { ...current.payments, [id]: { ...current.payments[id], ...patch } } } : current,
    );
  };

  const save = async (key: keyof StoreSettings) => {
    if (!draft) return;
    setSaving(true);
    try {
      const payload = await api<{ settings: StoreSettings }>("/api/admin/settings", { method: "PATCH", body: { [key]: draft[key] } });
      setDraft(payload.settings);
      toast("Settings saved — the storefront picks them up on its next visit");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const num = (value: string) => Math.max(0, Math.round(Number(value) || 0));

  return (
    <>
      <div>
        <h1 className="font-display text-[1.5rem] font-bold leading-tight">Settings</h1>
        <p className="text-[0.78rem] text-[#6e6e73]">Everything that controls live trading. Each section saves separately.</p>
      </div>

      <div className="adm-scroll flex gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((entry) => (
          <button key={entry.id} type="button" className="adm-chip inline-flex items-center gap-1.5" data-active={section === entry.id} onClick={() => setSection(entry.id)}>
            <entry.icon size={12} /> {entry.label}
          </button>
        ))}
      </div>

      {section === "identity" && (
        <Panel title="Business identity" subtitle="Shown on receipts and policy pages; required for gateway onboarding"
          action={<Button size="sm" variant="primary" disabled={saving} onClick={() => void save("identity")}><Check size={13} /> Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trading name"><input className="adm-input" value={draft.identity.name} onChange={(e) => edit("identity", { name: e.target.value })} /></Field>
            <Field label="Registered legal name"><input className="adm-input" value={draft.identity.legalName} onChange={(e) => edit("identity", { legalName: e.target.value })} /></Field>
            <Field label="Domain"><input className="adm-input" value={draft.identity.domain} onChange={(e) => edit("identity", { domain: e.target.value })} /></Field>
            <Field label="Support phone"><input className="adm-input" value={draft.identity.phone} onChange={(e) => edit("identity", { phone: e.target.value })} /></Field>
            <Field label="WhatsApp number"><input className="adm-input" value={draft.identity.whatsapp} onChange={(e) => edit("identity", { whatsapp: e.target.value })} /></Field>
            <Field label="Email"><input className="adm-input" value={draft.identity.email} onChange={(e) => edit("identity", { email: e.target.value })} /></Field>
            <Field label="Trade licence"><input className="adm-input" value={draft.identity.tradeLicence} onChange={(e) => edit("identity", { tradeLicence: e.target.value })} /></Field>
            <Field label="BIN / VAT number"><input className="adm-input" value={draft.identity.binNumber} onChange={(e) => edit("identity", { binNumber: e.target.value })} /></Field>
            <Field label="Shop address"><input className="adm-input" value={draft.identity.address} onChange={(e) => edit("identity", { address: e.target.value })} /></Field>
            <Field label="Opening hours"><input className="adm-input" value={draft.identity.hours} onChange={(e) => edit("identity", { hours: e.target.value })} /></Field>
          </div>
        </Panel>
      )}

      {section === "payments" && (
        <Panel title="Payment gateways" subtitle="Sandbox runs the full funnel with test money. Live requires both keys — and the method stays hidden from checkout until they are set."
          action={<Button size="sm" variant="primary" disabled={saving} onClick={() => void save("payments")}><Check size={13} /> Save</Button>}>
          <div className="flex flex-col gap-3">
            {(["bkash", "nagad", "sslcommerz", "cod"] as GatewayId[]).map((id) => {
              const gateway = draft.payments[id];
              const ready = id === "cod"
                ? gateway.enabled && draft.shipping.codEnabled
                : gateway.enabled && (gateway.mode === "sandbox" || Boolean(gateway.publicKey && gateway.secretKey));
              return (
                <div key={id} className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.86rem] font-semibold">{GATEWAY_LABEL[id]}</span>
                    <Badge tone={ready ? "emerald" : "rose"}>{ready ? (gateway.mode === "live" ? "live" : "sandbox") : "disabled"}</Badge>
                    <div className="ml-auto flex items-center gap-2">
                      {id !== "cod" && (
                        <select className="adm-select w-auto" value={gateway.mode} onChange={(e) => editGateway(id, { mode: e.target.value as "sandbox" | "live" })} aria-label={`${GATEWAY_LABEL[id]} mode`}>
                          <option value="sandbox">Sandbox</option>
                          <option value="live">Live</option>
                        </select>
                      )}
                      <button type="button" className="adm-switch" data-on={gateway.enabled} role="switch" aria-checked={gateway.enabled} aria-label={`Enable ${GATEWAY_LABEL[id]}`} onClick={() => editGateway(id, { enabled: !gateway.enabled })}><span /></button>
                    </div>
                  </div>
                  {id === "cod" ? (
                    <p className="mt-2 text-[0.74rem] leading-relaxed text-[#6e6e73]">
                      Cash collected by the rider. Ceiling ৳{draft.shipping.codMaxOrder.toLocaleString("en-IN")}; advance of ৳{draft.shipping.codAdvanceAmount} above ৳{draft.shipping.codAdvanceAbove.toLocaleString("en-IN")}.
                    </p>
                  ) : (
                    <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                      <Field label={id === "sslcommerz" ? "Store ID" : "App key"}>
                        <input className="adm-input" value={gateway.publicKey} onChange={(e) => editGateway(id, { publicKey: e.target.value })} />
                      </Field>
                      <Field label={id === "sslcommerz" ? "Store password" : "App secret"}>
                        <div className="relative">
                          <input className="adm-input pr-9" type={reveal ? "text" : "password"} value={gateway.secretKey} onChange={(e) => editGateway(id, { secretKey: e.target.value })} />
                          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6e6e73] hover:text-[#4d7c0f]" onClick={() => setReveal((value) => !value)} aria-label={reveal ? "Hide secrets" : "Show secrets"}>
                            {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </Field>
                      {id === "bkash" ? (
                        <Field label="API username"><input className="adm-input" value={gateway.username} onChange={(e) => editGateway(id, { username: e.target.value })} /></Field>
                      ) : id === "nagad" ? (
                        <Field label="Send-money number"><input className="adm-input" value={gateway.merchantNumber} onChange={(e) => editGateway(id, { merchantNumber: e.target.value })} /></Field>
                      ) : <span />}
                      {id === "bkash" && (
                        <>
                          <Field label="API password">
                            <input className="adm-input" type={reveal ? "text" : "password"} value={gateway.password} onChange={(e) => editGateway(id, { password: e.target.value })} />
                          </Field>
                          <Field label="Send-money number (manual fallback)"><input className="adm-input" value={gateway.merchantNumber} onChange={(e) => editGateway(id, { merchantNumber: e.target.value })} /></Field>
                        </>
                      )}
                    </div>
                  )}
                  {id === "bkash" && (
                    <p className="mt-2 text-[0.72rem] text-[#6e6e73]">With API credentials set, live bKash pays on a hosted page. Without them, customers send money manually and you confirm each TrxID.</p>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {section === "marketing" && (
        <Panel title="Pixels & measurement" subtitle="Nothing fires until the visitor consents"
          action={<Button size="sm" variant="primary" disabled={saving} onClick={() => void save("marketing")}><Check size={13} /> Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Meta Pixel ID"><input className="adm-input" placeholder="123456789012345" value={draft.marketing.metaPixelId} onChange={(e) => edit("marketing", { metaPixelId: e.target.value })} /></Field>
            <Field label="Meta Conversions API token"><input className="adm-input" type={reveal ? "text" : "password"} value={draft.marketing.metaAccessToken} onChange={(e) => edit("marketing", { metaAccessToken: e.target.value })} /></Field>
            <Field label="Meta test event code" hint="Only while verifying in Test Events"><input className="adm-input" value={draft.marketing.metaTestEventCode} onChange={(e) => edit("marketing", { metaTestEventCode: e.target.value })} /></Field>
            <Field label="GA4 measurement ID"><input className="adm-input" placeholder="G-XXXXXXXXXX" value={draft.marketing.ga4MeasurementId} onChange={(e) => edit("marketing", { ga4MeasurementId: e.target.value })} /></Field>
            <Field label="TikTok Pixel ID"><input className="adm-input" value={draft.marketing.tiktokPixelId} onChange={(e) => edit("marketing", { tiktokPixelId: e.target.value })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Server-side Conversions API" hint="Recovers conversions lost to ad blockers and iOS." checked={draft.marketing.conversionsApi} onChange={(value) => edit("marketing", { conversionsApi: value })} />
            <Toggle label="Require consent before tracking" checked={draft.marketing.consentRequired} onChange={(value) => edit("marketing", { consentRequired: value })} />
          </div>
        </Panel>
      )}

      {section === "shipping" && (
        <Panel title="Delivery & cash on delivery" subtitle="Rates apply instantly at checkout"
          action={<Button size="sm" variant="primary" disabled={saving} onClick={() => void save("shipping")}><Check size={13} /> Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Free delivery over ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.shipping.freeThreshold} onChange={(e) => edit("shipping", { freeThreshold: num(e.target.value) })} /></Field>
            <Field label="Inside Dhaka ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.shipping.insideDhaka} onChange={(e) => edit("shipping", { insideDhaka: num(e.target.value) })} /></Field>
            <Field label="Outside Dhaka ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.shipping.outsideDhaka} onChange={(e) => edit("shipping", { outsideDhaka: num(e.target.value) })} /></Field>
            <Field label="Express inside ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.shipping.expressInside} onChange={(e) => edit("shipping", { expressInside: num(e.target.value) })} /></Field>
            <Field label="Express outside ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.shipping.expressOutside} onChange={(e) => edit("shipping", { expressOutside: num(e.target.value) })} /></Field>
            <Field label="COD ceiling ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.shipping.codMaxOrder} onChange={(e) => edit("shipping", { codMaxOrder: num(e.target.value) })} /></Field>
            <Field label="Advance above ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.shipping.codAdvanceAbove} onChange={(e) => edit("shipping", { codAdvanceAbove: num(e.target.value) })} /></Field>
            <Field label="Advance amount ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.shipping.codAdvanceAmount} onChange={(e) => edit("shipping", { codAdvanceAmount: num(e.target.value) })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Accept cash on delivery" checked={draft.shipping.codEnabled} onChange={(value) => edit("shipping", { codEnabled: value })} />
          </div>
        </Panel>
      )}

      {section === "risk" && (
        <Panel title="Fraud & abuse rules" subtitle="Applied to every order before it reaches your packing bench"
          action={<Button size="sm" variant="primary" disabled={saving} onClick={() => void save("risk")}><Check size={13} /> Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="COD refusal limit" hint="Flag a number after this many cancelled or returned parcels"><input className="adm-input adm-num" inputMode="numeric" value={draft.risk.codStrikeLimit} onChange={(e) => edit("risk", { codStrikeLimit: num(e.target.value) })} /></Field>
            <Field label="Max orders per number / 24h"><input className="adm-input adm-num" inputMode="numeric" value={draft.risk.maxOrdersPerPhonePerDay} onChange={(e) => edit("risk", { maxOrdersPerPhonePerDay: num(e.target.value) })} /></Field>
            <Field label="High-value alert ৳"><input className="adm-input adm-num" inputMode="numeric" value={draft.risk.maxOrderValue} onChange={(e) => edit("risk", { maxOrderValue: num(e.target.value) })} /></Field>
            <Field label="Promo uses per number"><input className="adm-input adm-num" inputMode="numeric" value={draft.risk.promoPerPhoneLimit} onChange={(e) => edit("risk", { promoPerPhoneLimit: num(e.target.value) })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Verify phone by OTP at checkout" hint="Cuts fake numbers and refused parcels. Needs an SMS provider." checked={draft.risk.requirePhoneOtp} onChange={(value) => edit("risk", { requirePhoneOtp: value })} />
          </div>
        </Panel>
      )}

      {section === "notifications" && (
        <Panel title="Customer messaging" subtitle="Confirmations, courier updates and cart recovery"
          action={<Button size="sm" variant="primary" disabled={saving} onClick={() => void save("notifications")}><Check size={13} /> Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="SMS provider">
              <select className="adm-select" value={draft.notifications.smsProvider} onChange={(e) => edit("notifications", { smsProvider: e.target.value as StoreSettings["notifications"]["smsProvider"] })}>
                <option value="none">Not configured (queue only)</option>
                <option value="bulksmsbd">BulkSMSBD</option>
                <option value="greenweb">GreenWeb SMS</option>
              </select>
            </Field>
            <Field label="API key"><input className="adm-input" type={reveal ? "text" : "password"} value={draft.notifications.smsApiKey} onChange={(e) => edit("notifications", { smsApiKey: e.target.value })} /></Field>
            <Field label="Sender ID"><input className="adm-input" value={draft.notifications.smsSenderId} onChange={(e) => edit("notifications", { smsSenderId: e.target.value })} /></Field>
            <Field label="Low stock alert at"><input className="adm-input adm-num" inputMode="numeric" value={draft.notifications.lowStockThreshold} onChange={(e) => edit("notifications", { lowStockThreshold: num(e.target.value) })} /></Field>
            <Field label="Cart reminder after (min)"><input className="adm-input adm-num" inputMode="numeric" value={draft.notifications.abandonedCartAfterMinutes} onChange={(e) => edit("notifications", { abandonedCartAfterMinutes: num(e.target.value) })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Order confirmation message" checked={draft.notifications.orderConfirmation} onChange={(value) => edit("notifications", { orderConfirmation: value })} />
            <Toggle label="Status update messages" checked={draft.notifications.statusUpdates} onChange={(value) => edit("notifications", { statusUpdates: value })} />
            <Toggle label="Abandoned cart recovery" checked={draft.notifications.abandonedCart} onChange={(value) => edit("notifications", { abandonedCart: value })} />
          </div>
        </Panel>
      )}

      {section === "courier" && (
        <Panel title="Courier integration" subtitle="Auto-book parcels when an order is marked shipped"
          action={<Button size="sm" variant="primary" disabled={saving} onClick={() => void save("courier")}><Check size={13} /> Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Provider">
              <select className="adm-select" value={draft.courier.provider} onChange={(e) => edit("courier", { provider: e.target.value as StoreSettings["courier"]["provider"] })}>
                <option value="manual">Manual entry</option>
                <option value="pathao">Pathao Courier API</option>
                <option value="steadfast">Steadfast API</option>
              </select>
            </Field>
            <Field label="API key"><input className="adm-input" type={reveal ? "text" : "password"} value={draft.courier.apiKey} onChange={(e) => edit("courier", { apiKey: e.target.value })} /></Field>
            <Field label="API secret"><input className="adm-input" type={reveal ? "text" : "password"} value={draft.courier.apiSecret} onChange={(e) => edit("courier", { apiSecret: e.target.value })} /></Field>
          </div>
          <div className="mt-3">
            <Toggle label="Auto-book on shipment" checked={draft.courier.autoBook} onChange={(value) => edit("courier", { autoBook: value })} />
          </div>
        </Panel>
      )}

      {section === "blocklist" && <Blocklist toast={toast} />}
      {section === "users" && <Team toast={toast} />}
      {section === "audit" && <AuditLog />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Blocklist({ toast }: { toast: (message: string) => void }) {
  const [rows, setRows] = useState<Array<{ phone: string; reason: string; createdAt: string }>>([]);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const payload = await api<{ blocklist: Array<{ phone: string; reason: string; createdAt: string }> }>("/api/admin/blocklist");
    setRows(payload.blocklist);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  return (
    <Panel title="Blocked numbers" subtitle="Blocked numbers cannot place orders — checkout stops them with your phone number">
      <div className="flex flex-wrap gap-2">
        <input className="adm-input min-w-[160px] flex-1" placeholder="01XXXXXXXXX" value={phone} onChange={(event) => setPhone(event.target.value)} aria-label="Phone to block" />
        <input className="adm-input min-w-[200px] flex-[2]" placeholder="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Block reason" />
        <Button variant="primary" onClick={() => {
          void api("/api/admin/blocklist", { method: "POST", body: { phone, reason } })
            .then(() => { setPhone(""); setReason(""); toast("Number blocked"); return load(); })
            .catch((error: unknown) => toast(error instanceof ApiError ? error.message : "Could not block."));
        }}>Block</Button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((entry) => (
          <li key={entry.phone} className="flex items-center gap-3 rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-2.5">
            <span className="adm-num text-[0.82rem]">{entry.phone}</span>
            <span className="min-w-0 flex-1 truncate text-[0.74rem] text-[#6e6e73]">{entry.reason || "No reason given"}</span>
            <Button size="sm" variant="ghost" onClick={() => {
              void api(`/api/admin/blocklist/${encodeURIComponent(entry.phone)}`, { method: "DELETE" })
                .then(() => { toast("Number unblocked"); return load(); })
                .catch((error: unknown) => toast(error instanceof ApiError ? error.message : "Could not unblock."));
            }} aria-label={`Unblock ${entry.phone}`}><Trash2 size={12} /></Button>
          </li>
        ))}
        {rows.length === 0 && <Empty title="Nobody blocked" />}
      </ul>
    </Panel>
  );
}

function Team({ toast }: { toast: (message: string) => void }) {
  const [rows, setRows] = useState<Array<{ id: number; email: string; role: string; active: boolean }>>([]);
  const [form, setForm] = useState({ email: "", password: "", role: "staff" });

  const load = useCallback(async () => {
    const payload = await api<{ users: Array<{ id: number; email: string; role: string; active: boolean }> }>("/api/admin/users");
    setRows(payload.users);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const fail = (error: unknown) => toast(error instanceof ApiError ? error.message : "That did not work. Try again.");

  return (
    <div className="adm-grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Team accounts" subtitle="Staff can fulfil orders and edit the catalogue. Only owners see settings.">
        <ul className="flex flex-col gap-2">
          {rows.map((user) => (
            <li key={user.id} className="flex items-center gap-2 rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.82rem] font-medium">{user.email}</p>
                <p className="text-[0.68rem] text-[#6e6e73]">{user.role}{user.active ? "" : " · deactivated"}</p>
              </div>
              <select
                className="adm-select w-auto" value={user.role} aria-label={`Role for ${user.email}`}
                onChange={(event) => {
                  void api(`/api/admin/users/${user.id}`, { method: "PATCH", body: { role: event.target.value } })
                    .then(() => { toast("Role updated"); return load(); }).catch(fail);
                }}
              >
                <option value="staff">Staff</option>
                <option value="owner">Owner</option>
              </select>
              <Button size="sm" variant="ghost" onClick={() => {
                void api(`/api/admin/users/${user.id}`, { method: "PATCH", body: { active: !user.active } })
                  .then(() => { toast(user.active ? "Account deactivated" : "Account activated"); return load(); }).catch(fail);
              }}>
                {user.active ? "Deactivate" : "Activate"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                void api(`/api/admin/users/${user.id}`, { method: "DELETE" })
                  .then(() => { toast("Account deleted"); return load(); }).catch(fail);
              }} aria-label={`Delete ${user.email}`}><Trash2 size={12} /></Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Invite teammate" subtitle="Passwords need 12+ characters">
        <div className="grid gap-2.5">
          <Field label="Email"><input className="adm-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Temporary password"><input className="adm-input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
          <Field label="Role">
            <select className="adm-select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </Field>
          <Button variant="primary" onClick={() => {
            void api("/api/admin/users", { method: "POST", body: form })
              .then(() => { setForm({ email: "", password: "", role: "staff" }); toast("Teammate added"); return load(); })
              .catch(fail);
          }}>Create account</Button>
        </div>
      </Panel>
    </div>
  );
}

function AuditLog() {
  const [rows, setRows] = useState<Array<{ id: number; actor: string; action: string; target: string | null; createdAt: string }>>([]);

  useEffect(() => {
    void api<{ entries: Array<{ id: number; actor: string; action: string; target: string | null; createdAt: string }> }>("/api/admin/audit?limit=100")
      .then((payload) => setRows(payload.entries))
      .catch(() => {});
  }, []);

  return (
    <Panel title="Audit log" subtitle="Who changed what, and when — newest first">
      {rows.length === 0 ? (
        <Empty title="No privileged changes yet" />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td className="text-[0.72rem] text-[#6e6e73]">{new Date(entry.createdAt).toLocaleString("en-GB")}</td>
                  <td className="text-[0.76rem]">{entry.actor}</td>
                  <td><Badge>{entry.action}</Badge></td>
                  <td className="adm-num text-[0.72rem]">{entry.target ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
