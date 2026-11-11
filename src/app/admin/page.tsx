"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { hashMode } from "next/router-core.mjs";
import {
  Activity, AlertTriangle, ArrowLeft, Boxes, Check, Database, History, KeyRound, LayoutDashboard, Lock,
  LogOut, Megaphone, MessageSquareText, Package, Settings as SettingsIcon, ShieldCheck, Sparkles, Store,
  TicketPercent, Timer, UserCog, Users, Zap,
} from "lucide-react";
import { ops } from "@/db/ops-store";
import { useStoreVersion } from "@/lib/use-store";
import { readinessAudit } from "@/lib/settings";
import {
  adminLockRemaining, adminSessionExpiresAt, adminSignOut, adminSignedIn, adminUsers, attemptAdminSignIn,
  canOpenSection, currentAdmin, DEMO_ADMIN_PIN, listOrders, roleOf, usingDefaultAdminPin, type MerchantOrder,
} from "@/lib/ops";
import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminOrders } from "@/components/admin/admin-orders";
import { AdminCustomers, AdminInventory } from "@/components/admin/admin-inventory";
import { AdminGrowth } from "@/components/admin/admin-growth";
import { AdminSettings, SecurityPanel } from "@/components/admin/admin-settings";
import { AdminPackAI } from "@/components/admin/admin-pack-ai";
import { AdminCatalogue } from "@/components/admin/admin-catalogue";
import { AdminTeam } from "@/components/admin/admin-team";
import { AdminActivity } from "@/components/admin/admin-activity";
import { AdminPromotions } from "@/components/admin/admin-promotions";
import { AdminReviews } from "@/components/admin/admin-reviews";
import { Button, Empty } from "@/components/admin/admin-ui";
import "@/admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merchant console", robots: { index: false, follow: false } };

const NAV = [
  { group: "Sell", items: [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "orders", label: "Orders", icon: Package },
    { id: "customers", label: "Customers", icon: Users },
  ] },
  { group: "Catalogue", items: [
    { id: "catalogue", label: "Products", icon: Store },
    { id: "inventory", label: "Stock & prices", icon: Boxes },
    { id: "reviews", label: "Reviews", icon: MessageSquareText },
    { id: "pack-ai", label: "Pack Builder AI", icon: Sparkles },
  ] },
  { group: "Marketing", items: [
    { id: "promotions", label: "Promotions", icon: TicketPercent },
    { id: "growth", label: "Growth & ads", icon: Megaphone },
  ] },
  { group: "Administration", items: [
    { id: "team", label: "Team & roles", icon: UserCog },
    { id: "activity", label: "Activity log", icon: History },
    { id: "settings", label: "Settings", icon: SettingsIcon },
    { id: "account", label: "My account", icon: KeyRound },
  ] },
] as const;

type TabId = (typeof NAV)[number]["items"][number]["id"];
const ALL_TABS = NAV.flatMap((group) => group.items.map((item) => item.id)) as TabId[];
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export default function AdminPage() {
  useStoreVersion();
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [opsVersion, setOpsVersion] = useState(0);

  useEffect(() => {
    setAuthed(adminSignedIn() && Boolean(currentAdmin()));
    setChecked(true);
  }, []);
  useEffect(() => ops.subscribe(() => setOpsVersion((value) => value + 1)), []);
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (ALL_TABS.includes(hash as TabId)) setTab(hash as TabId);
  }, []);

  /* Expire sessions in place, and drop out if the account is deactivated. */
  useEffect(() => {
    if (!authed) return;
    const timer = window.setInterval(() => {
      if (!adminSignedIn() || !currentAdmin()) { adminSignOut(); setAuthed(false); }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [authed]);

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
      outbox: ops.state.outbox.filter((row) => row.status === "queued").length,
      blockers: readinessAudit(ops.state.settings).filter((issue) => issue.severity === "blocker").length,
    };
  }, [opsVersion]);

  const go = (next: string) => {
    setTab(next as TabId);
    setSelected(null);
    if (!hashMode) {
      try { window.history.replaceState(window.history.state, "", `#${next}`); } catch { /* locked-down embed */ }
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openOrder = (order: MerchantOrder) => { setTab("orders"); setSelected(order.orderNumber); };

  if (!checked) return <div className="adm-root" />;
  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  const user = currentAdmin();
  const role = roleOf(user);
  const visibleNav = NAV.map((group) => ({ ...group, items: group.items.filter((item) => canOpenSection(item.id)) })).filter((group) => group.items.length);
  const allowed = visibleNav.flatMap((group) => group.items.map((item) => item.id)) as TabId[];
  const active: TabId | null = allowed.includes(tab) ? tab : allowed[0] ?? null;
  const defaultPin = usingDefaultAdminPin() && user?.roleId === "owner";
  const expires = adminSessionExpiresAt();
  const signOut = () => { adminSignOut(); setAuthed(false); };

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
          {visibleNav.map((group) => (
            <div key={group.group} className="contents">
              <p className="adm-nav-group">{group.group}</p>
              {group.items.map((entry) => (
                <button key={entry.id} type="button" className="adm-nav-btn" data-active={active === entry.id}
                  onClick={() => go(entry.id)} aria-current={active === entry.id ? "page" : undefined}>
                  <entry.icon size={15} />
                  <span className="adm-nav-label">{entry.label}</span>
                  {entry.id === "orders" && counts.orders > 0 && <span className="adm-nav-count">{counts.orders}</span>}
                  {entry.id === "settings" && counts.blockers > 0 && <span className="adm-nav-count" data-alert="true">{counts.blockers}</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="adm-rail-foot mt-auto flex flex-col gap-2 pt-4">
            {user && (
              <div className="adm-user-chip">
                <span className="adm-avatar">{initials(user.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8rem] font-semibold">{user.name}</span>
                  <span className="block truncate text-[0.68rem] text-[#6e6e73]">{role?.name ?? "No role"}</span>
                </span>
                <button type="button" className="adm-icon-btn" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={13} /></button>
              </div>
            )}
            <Link href="/" className="adm-nav-btn"><ArrowLeft size={15} /> <span className="adm-nav-label">View storefront</span></Link>
          </div>
        </nav>

        <div className="min-w-0">
          <header className="adm-topbar">
            {canOpenSection("settings") && (
              <span className="adm-status-pill" data-tone={counts.blockers > 0 ? "warn" : "ok"}>
                <i /> {counts.blockers > 0 ? `${counts.blockers} launch blocker${counts.blockers === 1 ? "" : "s"}` : "Ready for live traffic"}
              </span>
            )}
            {canOpenSection("growth") && <span className="adm-status-pill"><Activity size={11} /> {ops.state.events.length} events tracked</span>}
            {ops.state.sampleData && canOpenSection("settings") && (
              <button type="button" className="adm-status-pill" data-tone="warn" title="Generated orders are included so reports are readable. Click to hide them."
                onClick={() => { ops.set({ sampleData: false }); toast("Sample history hidden — showing your orders only"); }}>
                <Database size={11} /> Sample history · hide
              </button>
            )}
            {counts.outbox > 0 && canOpenSection("growth") && <span className="adm-status-pill" data-tone="warn"><i /> {counts.outbox} message{counts.outbox === 1 ? "" : "s"} queued</span>}
            {defaultPin && (
              <button type="button" className="adm-status-pill" data-tone="warn" onClick={() => go("account")} title="Anyone who knows the default PIN can open this console">
                <KeyRound size={11} /> Default PIN in use · change it
              </button>
            )}
            {expires && <span className="adm-status-pill" title="Sessions end automatically for safety"><Timer size={11} /> Signed in until {expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
            <div className="ml-auto flex items-center gap-2">
              {user && <span className="adm-status-pill"><ShieldCheck size={11} /> {user.name} · {role?.name}</span>}
              <Link href="/" className="adm-btn" data-size="sm"><ArrowLeft size={12} /> Storefront</Link>
              <Button size="sm" variant="ghost" onClick={signOut}><LogOut size={12} /> Sign out</Button>
            </div>
          </header>

          <main className="adm-main">
            {!active && <Empty icon={<Lock size={20} />} title="No sections available" body="Your role does not include any console permissions. Ask the store owner to update your access." />}
            {active === "overview" && <AdminOverview onNavigate={(next) => go(allowed.includes(next as TabId) ? next : active)} onOpenOrder={openOrder} />}
            {active === "orders" && <AdminOrders selected={selected} onSelect={setSelected} toast={toast} />}
            {active === "customers" && <AdminCustomers toast={toast} />}
            {active === "catalogue" && <AdminCatalogue toast={toast} />}
            {active === "inventory" && <AdminInventory toast={toast} />}
            {active === "reviews" && <AdminReviews toast={toast} />}
            {active === "pack-ai" && <AdminPackAI toast={toast} />}
            {active === "promotions" && <AdminPromotions toast={toast} />}
            {active === "growth" && <AdminGrowth toast={toast} />}
            {active === "team" && <AdminTeam toast={toast} />}
            {active === "activity" && <AdminActivity />}
            {active === "account" && <><div className="adm-page-head"><div><h1 className="adm-page-title">My account</h1><p className="adm-page-sub">Your PIN and session. Every role can manage its own sign-in.</p></div></div><SecurityPanel toast={toast} /></>}
            {active === "settings" && <AdminSettings toast={toast} />}
          </main>
        </div>
      </div>

      {/* Every role can change its own PIN, even without the Settings permission. */}
      {toastMessage && <div className="adm-toast" role="status"><Check size={14} className="text-[#c8ff38]" /> {toastMessage}</div>}
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const users = adminUsers().filter((user) => user.active);
  const [userId, setUserId] = useState(users[0]?.id ?? "owner");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(() => adminLockRemaining());
  const defaultPin = usingDefaultAdminPin();

  useEffect(() => {
    if (locked <= 0) return;
    const timer = window.setInterval(() => setLocked(adminLockRemaining()), 1000);
    return () => window.clearInterval(timer);
  }, [locked]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = attemptAdminSignIn(pin, userId);
    if (result.ok) { onSuccess(); return; }
    setPin("");
    if (result.reason === "locked") { setLocked(result.remaining); setError(""); }
    else setError(`That PIN is not correct. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left before a short lockout.`);
  };

  return (
    <div className="adm-root">
      <div className="adm-login">
        <form className="adm-login-card" onSubmit={submit} noValidate>
          <span className="adm-brand-mark mb-4"><ShieldCheck size={18} strokeWidth={2.4} /></span>
          <h1 className="font-display text-[1.45rem] font-bold leading-tight tracking-[-0.03em]">Merchant console</h1>
          <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[#6e6e73]">Sign in to manage orders, products, stock and marketing for Glowing Space BD.</p>

          {users.length > 1 && (
            <label className="adm-field mt-5">
              <span className="adm-field-label">Staff account</span>
              <select className="adm-select" value={userId} onChange={(e) => { setUserId(e.target.value); setError(""); }} aria-label="Staff account">
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
          )}

          <label className="adm-field mt-4">
            <span className="adm-field-label">6-digit PIN</span>
            <input className="adm-input adm-num text-center text-lg tracking-[0.4em]" type="password" inputMode="numeric" autoComplete="current-password" autoFocus maxLength={6}
              disabled={locked > 0} value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
              aria-label="Access PIN" aria-invalid={Boolean(error)} aria-describedby="admin-pin-help" placeholder="••••••" />
          </label>
          <div id="admin-pin-help" aria-live="polite">
            {locked > 0 && <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] text-[#92400e]"><Timer size={12} /> Too many attempts. Try again in {locked}s.</p>}
            {error && <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] text-[#b42318]"><AlertTriangle size={12} /> {error}</p>}
          </div>

          <Button variant="primary" className="mt-4 w-full" type="submit" disabled={pin.length < 6 || locked > 0}><Lock size={14} /> Unlock console</Button>

          <div className="mt-4 rounded-xl border border-[#e3e3e8] bg-[#fafafb] p-3 text-[0.73rem] leading-relaxed text-[#6e6e73]">
            {defaultPin
              ? <p>First time here? The owner's preview PIN is <b className="adm-code">{DEMO_ADMIN_PIN}</b>. Change it under <b className="text-[#1d1d1f]">Settings → Security</b> after signing in.</p>
              : <p>Forgot your PIN? Ask the store owner to reset it under <b className="text-[#1d1d1f]">Team &amp; roles</b>.</p>}
            <p className="mt-1.5">This preview keeps data in the browser. The production server uses email + password accounts instead.</p>
          </div>

          <Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-[0.77rem] text-[#6e6e73] hover:text-[#1d1d1f]"><ArrowLeft size={12} /> Back to the storefront</Link>
        </form>
      </div>
    </div>
  );
}
