"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowLeft, Boxes, Check, Database, LayoutDashboard, Lock,
  LogOut, Megaphone, Package, Settings as SettingsIcon, ShieldCheck, Sparkles, Users, Zap,
} from "lucide-react";
import { ops } from "@/db/ops-store";
import { useStoreVersion } from "@/lib/use-store";
import { readinessAudit } from "@/lib/settings";
import { adminSignIn, adminSignOut, adminSignedIn, DEMO_ADMIN_PIN, findOrder, listOrders, type MerchantOrder } from "@/lib/ops";
import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminOrders } from "@/components/admin/admin-orders";
import { AdminCustomers, AdminInventory } from "@/components/admin/admin-inventory";
import { AdminGrowth } from "@/components/admin/admin-growth";
import { AdminSettings } from "@/components/admin/admin-settings";
import { AdminPackAI } from "@/components/admin/admin-pack-ai";
import { Button } from "@/components/admin/admin-ui";
import "@/admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merchant console", robots: { index: false, follow: false } };

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: Package },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "customers", label: "Customers", icon: Users },
  { id: "growth", label: "Growth", icon: Megaphone },
  { id: "pack-ai", label: "Pack AI", icon: Sparkles },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  useStoreVersion();
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [opsVersion, setOpsVersion] = useState(0);

  useEffect(() => {
    setAuthed(adminSignedIn());
    setChecked(true);
  }, []);

  useEffect(() => ops.subscribe(() => setOpsVersion((value) => value + 1)), []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (TABS.some((entry) => entry.id === hash)) setTab(hash as TabId);
  }, []);

  const toast = useCallback((message: string) => {
    if (!message) return;
    setToastMessage(message);
    window.setTimeout(() => setToastMessage((current) => (current === message ? null : current)), 2600);
  }, []);

  const counts = useMemo(() => {
    void opsVersion;
    const orders = listOrders();
    return {
      orders: orders.filter((order) => !["delivered", "cancelled", "returned"].includes(order.status)).length,
      inventory: ops.state.settings ? undefined : undefined,
      outbox: ops.state.outbox.filter((row) => row.status === "queued").length,
      blockers: readinessAudit(ops.state.settings).filter((issue) => issue.severity === "blocker").length,
    };
  }, [opsVersion]);

  const go = (next: string) => {
    setTab(next as TabId);
    setSelected(null);
    /* Keep the router's history state (scroll key) — only the hash changes. */
    window.history.replaceState(window.history.state, "", `#${next}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const openOrder = (order: MerchantOrder) => {
    setTab("orders");
    setSelected(order.orderNumber);
  };

  if (!checked) return <div className="adm-root" />;
  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  const blockers = counts.blockers;

  return (
    <div className="adm-root">
      <div className="adm-shell">
        <nav className="adm-rail" aria-label="Console sections">
          <div className="adm-brand">
            <span className="adm-brand-mark"><Zap size={18} strokeWidth={2.4} /></span>
            <span className="adm-brand-text">
              <span className="adm-brand-name block">Glowing Space</span>
              <span className="adm-brand-sub">Merchant console</span>
            </span>
          </div>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="adm-nav-btn"
              data-active={tab === entry.id}
              onClick={() => go(entry.id)}
              aria-current={tab === entry.id ? "page" : undefined}
            >
              <entry.icon size={15} />
              <span className="adm-nav-label">{entry.label}</span>
              {entry.id === "orders" && counts.orders > 0 && <span className="adm-nav-count">{counts.orders}</span>}
              {entry.id === "settings" && blockers > 0 && <span className="adm-nav-count" data-alert="true">{blockers}</span>}
            </button>
          ))}
          <div className="adm-rail-foot mt-auto flex flex-col gap-2 pt-4">
            <Link href="/" className="adm-nav-btn"><ArrowLeft size={15} /> <span className="adm-nav-label">View storefront</span></Link>
            <button type="button" className="adm-nav-btn" onClick={() => { adminSignOut(); setAuthed(false); }}>
              <LogOut size={15} /> <span className="adm-nav-label">Sign out</span>
            </button>
          </div>
        </nav>

        <div className="min-w-0">
          <header className="adm-topbar">
            <span className="adm-status-pill" data-tone={blockers > 0 ? "warn" : "ok"}>
              <i /> {blockers > 0 ? `${blockers} launch blocker${blockers === 1 ? "" : "s"}` : "Ready for live traffic"}
            </span>
            <span className="adm-status-pill"><Activity size={11} /> {ops.state.events.length} events tracked</span>
            {ops.state.sampleData && (
              <button
                type="button"
                className="adm-status-pill"
                data-tone="warn"
                title="Six weeks of generated orders are included so the reports are readable. Click to hide them."
                onClick={() => { ops.set({ sampleData: false }); toast("Sample history hidden — showing your orders only"); }}
              >
                <Database size={11} /> Sample history · hide
              </button>
            )}
            {counts.outbox > 0 && <span className="adm-status-pill" data-tone="warn"><i /> {counts.outbox} message{counts.outbox === 1 ? "" : "s"} queued</span>}
            <div className="ml-auto flex items-center gap-2">
              <Link href="/" className="adm-btn" data-size="sm"><ArrowLeft size={12} /> Storefront</Link>
              <Button size="sm" variant="ghost" onClick={() => { adminSignOut(); setAuthed(false); }}><LogOut size={12} /> Sign out</Button>
            </div>
          </header>

          <main className="adm-main">
            {tab === "overview" && <AdminOverview onNavigate={go} onOpenOrder={openOrder} />}
            {tab === "orders" && <AdminOrders selected={selected} onSelect={setSelected} toast={toast} />}
            {tab === "inventory" && <AdminInventory toast={toast} />}
            {tab === "customers" && <AdminCustomers toast={toast} />}
            {tab === "growth" && <AdminGrowth toast={toast} />}
            {tab === "pack-ai" && <AdminPackAI toast={toast} />}
            {tab === "settings" && <AdminSettings toast={toast} />}
          </main>
        </div>
      </div>

      {toastMessage && (
        <div className="adm-toast" role="status">
          <Check size={14} className="text-[#c9f16b]" /> {toastMessage}
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (adminSignIn(pin)) onSuccess();
    else { setError(true); setPin(""); }
  };

  return (
    <div className="adm-root">
      <div className="adm-login">
        <form className="adm-login-card" onSubmit={submit}>
          <span className="adm-brand-mark mb-4"><ShieldCheck size={18} strokeWidth={2.4} /></span>
          <h1 className="font-display text-[1.35rem] font-bold leading-tight">Merchant console</h1>
          <p className="mt-1.5 text-[0.79rem] leading-relaxed text-[#8aa697]">
            Orders, inventory, payments and ad performance for Glowing Space BD.
          </p>

          <label className="adm-field mt-5">
            <span className="adm-field-label">Access PIN</span>
            <input
              className="adm-input adm-num text-center text-lg tracking-[0.4em]"
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(false); }}
              aria-label="Access PIN"
              placeholder="••••••"
            />
          </label>
          {error && <p className="mt-2 flex items-center gap-1.5 text-[0.74rem] text-[#fda4af]"><AlertTriangle size={12} /> That PIN is not recognised.</p>}

          <Button variant="primary" className="mt-4 w-full" type="submit" disabled={pin.length < 6}>
            <Lock size={14} /> Unlock console
          </Button>

          <div className="mt-4 rounded-xl border border-[#1d3529] bg-[#0b1712] p-3">
            <p className="text-[0.72rem] leading-relaxed text-[#8aa697]">
              Preview PIN <b className="adm-mono text-[#c9f16b]">{DEMO_ADMIN_PIN}</b>. In production this screen is replaced by
              email + password with a signed httpOnly session cookie, enforced server-side in
              <code className="adm-mono text-[#a5e0fb]"> /api/admin/login</code>.
            </p>
          </div>

          <Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-[0.76rem] text-[#8aa697] hover:text-[#c9f16b]">
            <ArrowLeft size={12} /> Back to the storefront
          </Link>
        </form>
      </div>
    </div>
  );
}
