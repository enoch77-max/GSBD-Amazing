"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, Boxes, Check, LayoutDashboard, Lock, LogOut,
  Megaphone, Package, Settings as SettingsIcon, ShieldCheck, Users, Zap,
} from "lucide-react";
import { api, ApiError } from "@/lib/live";
import { Button } from "@/components/admin/admin-ui";
import { OwnerOverview } from "./Overview";
import { OwnerOrders } from "./Orders";
import { OwnerProducts } from "./Products";
import { OwnerCustomers } from "./Customers";
import { OwnerGrowth } from "./Growth";
import { OwnerSettings } from "./Settings";
import "@/admin.css";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: Package },
  { id: "products", label: "Products", icon: Boxes },
  { id: "customers", label: "Customers", icon: Users },
  { id: "growth", label: "Growth", icon: Megaphone },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];
type Session = { email: string; role: string };

export default function OwnerApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [orderFocus, setOrderFocus] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    api<Session>("/api/admin/me")
      .then((me) => setSession(me))
      .catch(() => setSession(null))
      .finally(() => setChecked(true));
  }, []);

  const toast = useCallback((message: string) => {
    if (!message) return;
    setToastMessage(message);
    window.setTimeout(() => setToastMessage((current) => (current === message ? null : current)), 2600);
  }, []);

  const openOrder = useCallback((orderNumber: string) => {
    setOrderFocus(orderNumber);
    setTab("orders");
    window.scrollTo({ top: 0 });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch {
      /* session is already gone */
    }
    setSession(null);
  }, []);

  if (!checked) return <div className="adm-root" />;
  if (!session) return <LoginScreen onSuccess={setSession} />;

  return (
    <div className="adm-root">
      <div className="adm-shell">
        <nav className="adm-rail" aria-label="Console sections">
          <div className="adm-brand">
            <span className="adm-brand-mark"><Zap size={18} strokeWidth={2.4} /></span>
            <span className="adm-brand-text">
              <span className="adm-brand-name block">Glowing Space</span>
              <span className="adm-brand-sub">Owner console · live</span>
            </span>
          </div>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="adm-nav-btn"
              data-active={tab === entry.id}
              onClick={() => { setTab(entry.id); setOrderFocus(null); window.scrollTo({ top: 0 }); }}
              aria-current={tab === entry.id ? "page" : undefined}
            >
              <entry.icon size={15} />
              <span className="adm-nav-label">{entry.label}</span>
            </button>
          ))}
          <div className="adm-rail-foot mt-auto flex flex-col gap-2 pt-4">
            <Link href="/" className="adm-nav-btn"><ArrowLeft size={15} /> <span className="adm-nav-label">View storefront</span></Link>
            <button type="button" className="adm-nav-btn" onClick={() => void signOut()}>
              <LogOut size={15} /> <span className="adm-nav-label">Sign out</span>
            </button>
          </div>
        </nav>

        <div className="min-w-0">
          <header className="adm-topbar">
            <span className="adm-status-pill"><i /> Live database</span>
            <span className="adm-status-pill">{session.email} · {session.role}</span>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/" className="adm-btn" data-size="sm"><ArrowLeft size={12} /> Storefront</Link>
              <Button size="sm" variant="ghost" onClick={() => void signOut()}><LogOut size={12} /> Sign out</Button>
            </div>
          </header>

          <main className="adm-main">
            {tab === "overview" && <OwnerOverview onOpenOrder={openOrder} />}
            {tab === "orders" && <OwnerOrders focus={orderFocus} onFocusDone={() => setOrderFocus(null)} toast={toast} />}
            {tab === "products" && <OwnerProducts toast={toast} />}
            {tab === "customers" && <OwnerCustomers />}
            {tab === "growth" && <OwnerGrowth toast={toast} />}
            {tab === "settings" && <OwnerSettings session={session} toast={toast} />}
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

function LoginScreen({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api<Session>("/api/admin/login", { method: "POST", body: { email, password } });
      onSuccess(session);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Could not sign in.");
      setBusy(false);
    }
  };

  return (
    <div className="adm-root">
      <div className="adm-login">
        <form className="adm-login-card" onSubmit={(event) => void submit(event)}>
          <span className="adm-brand-mark mb-4"><ShieldCheck size={18} strokeWidth={2.4} /></span>
          <h1 className="font-display text-[1.35rem] font-bold leading-tight">Owner console</h1>
          <p className="mt-1.5 text-[0.79rem] leading-relaxed text-[#8aa697]">
            Live orders, inventory, payments and ad performance for your store.
          </p>
          <label className="adm-field mt-5">
            <span className="adm-field-label">Email</span>
            <input className="adm-input" type="email" autoComplete="username" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="adm-field mt-3">
            <span className="adm-field-label">Password</span>
            <input className="adm-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="mt-2 flex items-center gap-1.5 text-[0.74rem] text-[#fda4af]"><AlertTriangle size={12} /> {error}</p>}
          <Button variant="primary" className="mt-4 w-full" type="submit" disabled={busy || !email || !password}>
            <Lock size={14} /> {busy ? "Checking…" : "Sign in"}
          </Button>
          <Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-[0.76rem] text-[#8aa697] hover:text-[#c9f16b]">
            <ArrowLeft size={12} /> Back to the storefront
          </Link>
        </form>
      </div>
    </div>
  );
}
