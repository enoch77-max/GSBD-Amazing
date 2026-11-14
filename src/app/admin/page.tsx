"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { hashMode } from "next/router-core.mjs";
import {
  AlertTriangle, ArrowLeft, Boxes, Check, Eye, EyeOff, KeyRound, LayoutDashboard, LineChart, Lock,
  LogOut, Megaphone, MoreHorizontal, Package, Search, Settings as SettingsIcon, ShieldCheck, Store, Timer, Users, Zap,
} from "lucide-react";
import { ops } from "@/db/ops-store";
import { useStoreVersion } from "@/lib/use-store";
import { readinessAudit } from "@/lib/settings";
import {
  adminLockRemaining, adminSessionExpiresAt, adminSignOut, adminSignedIn, adminUsers, attemptAdminSignIn,
  canOpenSection, currentAdmin, DEMO_ADMIN_PIN, roleOf, usingDefaultAdminPin, type MerchantOrder,
} from "@/lib/ops";
import { shellCounts } from "@/lib/admin-metrics";
import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminAnalytics } from "@/components/admin/admin-analytics";
import { AdminOrders } from "@/components/admin/admin-orders";
import { AdminInventory } from "@/components/admin/admin-inventory";
import { AdminCustomers } from "@/components/admin/admin-customers";
import { AdminGrowth } from "@/components/admin/admin-growth";
import { AdminSettings } from "@/components/admin/admin-settings";
import { AccountPanel, useConsoleTheme } from "@/components/admin/account-panel";
import { AdminPackAI } from "@/components/admin/admin-pack-ai";
import { AdminCatalogue } from "@/components/admin/admin-catalogue";
import { AdminPromotions } from "@/components/admin/admin-promotions";
import { AdminReviews } from "@/components/admin/admin-reviews";
import { CommandPalette } from "@/components/admin/command-palette";
import { NavigationSheet } from "@/components/admin/navigation-sheet";
import { Button, Empty } from "@/components/admin/admin-ui";
import "@/admin.css";
import "@/admin-shell.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Merchant console", robots: { index: false, follow: false } };

/* ------------------------------------------------------------------ */
/* Information architecture                                            */
/* Ten destinations instead of fourteen. Hubs fold related sections    */
/* into one page with a segmented switch; each sub-section keeps its   */
/* own permission so roles still see exactly what they may open.       */
/* ------------------------------------------------------------------ */

type Sub = { id: string; label: string };
type Dest = { id: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; subs: Sub[]; accent?: boolean };

const GROUPS: Array<{ id: string; label: string; items: Dest[] }> = [
  { id: "ops", label: "Daily ops", items: [
    { id: "overview", label: "Overview", icon: LayoutDashboard, subs: [{ id: "overview", label: "Overview" }] },
    { id: "orders", label: "Orders", icon: Package, subs: [{ id: "orders", label: "Orders" }] },
    { id: "products", label: "Products", icon: Store, subs: [{ id: "catalogue", label: "Products" }] },
    { id: "inventory", label: "Stock & Prices", icon: Boxes, subs: [{ id: "inventory", label: "Stock & Prices" }] },
    { id: "customers", label: "Customers", icon: Users, subs: [{ id: "customers", label: "Customers" }, { id: "reviews", label: "Reviews" }] },
  ] },
  { id: "smart", label: "Smart tools", items: [
    { id: "pack-ai", label: "Battery Builder AI", icon: Zap, accent: true, subs: [{ id: "pack-ai", label: "Battery Builder AI" }] },
  ] },
  { id: "revenue", label: "Revenue", items: [
    { id: "marketing", label: "Marketing", icon: Megaphone, subs: [{ id: "promotions", label: "Promotions" }, { id: "growth", label: "Growth & Ads" }] },
    { id: "analytics", label: "Analytics", icon: LineChart, subs: [{ id: "analytics", label: "Analytics" }] },
  ] },
];
const SETTINGS_DEST: Dest = {
  id: "settings", label: "Settings", icon: SettingsIcon,
  subs: [{ id: "settings", label: "Store" }, { id: "team", label: "Team & Roles" }, { id: "activity", label: "Activity Log" }],
};
const ACCOUNT_DEST: Dest = { id: "account", label: "My Account", icon: KeyRound, subs: [{ id: "account", label: "My Account" }] };
const ALL_DESTS = [...GROUPS.flatMap((group) => group.items), SETTINGS_DEST, ACCOUNT_DEST];
const MOBILE_PRIMARY = ["overview", "orders", "inventory"];

/** Old deep links (#reviews, #team …) still land on the right hub tab. */
function resolveHash(hash: string): { dest: string; sub: string } | null {
  for (const dest of ALL_DESTS) {
    if (dest.id === hash) return { dest: dest.id, sub: dest.subs[0].id };
    const sub = dest.subs.find((entry) => entry.id === hash);
    if (sub) return { dest: dest.id, sub: sub.id };
  }
  return null;
}

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const sectionAllowed = (id: string) => id === "account" || canOpenSection(id);

export default function AdminPage() {
  useStoreVersion();
  useConsoleTheme();
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [dest, setDest] = useState("overview");
  const [subByDest, setSubByDest] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [opsVersion, setOpsVersion] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setAuthed(adminSignedIn() && Boolean(currentAdmin()));
    setChecked(true);
  }, []);
  useEffect(() => ops.subscribe(() => setOpsVersion((value) => value + 1)), []);
  useEffect(() => {
    const target = resolveHash(window.location.hash.replace("#", ""));
    if (target) { setDest(target.dest); setSubByDest((current) => ({ ...current, [target.dest]: target.sub })); }
  }, []);

  /* ⌘K / Ctrl+K opens search from anywhere; "/" too when not typing. */
  useEffect(() => {
    if (!authed || moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((event.target as HTMLElement)?.tagName ?? "");
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authed, moreOpen]);

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
    return {
      ...shellCounts(),
      outbox: ops.state.outbox.filter((row) => row.status === "queued").length,
      blockers: readinessAudit(ops.state.settings).filter((issue) => issue.severity === "blocker").length,
    };
  }, [opsVersion]);

  if (!checked) return <div className="adm-root" />;
  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  const user = currentAdmin();
  const role = roleOf(user);
  const visible = (entry: Dest) => entry.subs.some((sub) => sectionAllowed(sub.id));
  const groups = GROUPS.map((group) => ({ ...group, items: group.items.filter(visible) })).filter((group) => group.items.length);
  const settingsVisible = visible(SETTINGS_DEST);
  const allowedDests = [...groups.flatMap((group) => group.items), ...(settingsVisible ? [SETTINGS_DEST] : []), ACCOUNT_DEST];
  const current = allowedDests.find((entry) => entry.id === dest) ?? allowedDests[0];
  const subs = current.subs.filter((sub) => sectionAllowed(sub.id));
  const sub = subs.find((entry) => entry.id === subByDest[current.id])?.id ?? subs[0]?.id;

  const go = (next: string, nextSub?: string) => {
    const target = resolveHash(nextSub ?? next) ?? { dest: next, sub: nextSub ?? "" };
    setDest(target.dest);
    if (target.sub) setSubByDest((value) => ({ ...value, [target.dest]: target.sub }));
    setSelected(null);
    setMoreOpen(false);
    if (!hashMode) {
      try { window.history.replaceState(window.history.state, "", `#${target.sub || target.dest}`); } catch { /* locked-down embed */ }
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openOrder = (order: MerchantOrder | string) => {
    go("orders");
    setSelected(typeof order === "string" ? order : order.orderNumber);
  };
  const signOut = () => { adminSignOut(); setAuthed(false); };

  const defaultPin = usingDefaultAdminPin() && user?.roleId === "owner";
  const expires = adminSessionExpiresAt();
  const notices = [
    counts.blockers > 0 && canOpenSection("settings") && { id: "blockers", tone: "rose", label: `${counts.blockers} launch blocker${counts.blockers === 1 ? "" : "s"}`, action: () => go("settings", "settings") },
    defaultPin && { id: "pin", tone: "amber", label: "Default PIN in use — change it", action: () => go("account") },
    counts.outbox > 0 && canOpenSection("growth") && { id: "outbox", tone: "amber", label: `${counts.outbox} message${counts.outbox === 1 ? "" : "s"} queued`, action: () => go("marketing", "growth") },
    ops.state.sampleData && canOpenSection("settings") && { id: "sample", tone: "sky", label: "Sample history is shown — hide it", action: () => { ops.set({ sampleData: false }); toast("Sample history hidden — showing your orders only"); } },
  ].filter(Boolean) as Array<{ id: string; tone: string; label: string; action: () => void }>;

  const badge = (id: string) => {
    if (id === "orders" && counts.pending > 0) return <span className="ax-badge" data-tone="live" aria-label={`${counts.pending} pending`}>{counts.pending}</span>;
    if (id === "inventory" && counts.lowStock > 0) return <span className="ax-badge" data-tone="warn" aria-label={`${counts.lowStock} low stock`}>{counts.lowStock}</span>;
    if (id === "pack-ai") return <span className="ax-badge" data-tone="accent">AI</span>;
    if (id === "settings" && counts.blockers > 0) return <span className="ax-badge" data-tone="alert">{counts.blockers}</span>;
    return null;
  };

  const navButton = (entry: Dest) => (
    <button key={entry.id} type="button" className="ax-nav" data-active={current.id === entry.id} data-accent={entry.accent || undefined}
      aria-current={current.id === entry.id ? "page" : undefined} onClick={() => go(entry.id)}>
      <entry.icon size={16} strokeWidth={1.9} />
      <span className="ax-nav-label">{entry.label}</span>
      {badge(entry.id)}
    </button>
  );

  return (
    <div className="adm-root">
      <div className="ax-shell" inert={moreOpen || undefined}>
        {/* ---------- desktop sidebar ---------- */}
        <aside className="ax-rail" aria-label="Console navigation">
          <div className="ax-brand">
            <span className="ax-brand-mark"><Zap size={16} strokeWidth={2.4} /></span>
            <span className="min-w-0">
              <span className="ax-brand-name">Glowing Space</span>
              <span className="ax-caption block">Merchant console</span>
            </span>
          </div>
          <button type="button" className="ax-search-trigger" onClick={() => setSearchOpen(true)}>
            <Search size={14} /> <span>Search</span> <kbd>⌘K</kbd>
          </button>
          <nav className="ax-rail-scroll">
            {groups.map((group) => (
              <div key={group.id} className="ax-group">
                <p className="ax-group-label">{group.label}</p>
                {group.items.map((entry) => navButton(entry))}
              </div>
            ))}
          </nav>
          <div className="ax-rail-foot">
            {settingsVisible && navButton(SETTINGS_DEST)}
            {user && (
              <button type="button" className="ax-profile" data-active={current.id === "account"} onClick={() => setAccountOpen(true)} aria-haspopup="dialog" aria-label="Open my account">
                <span className="adm-avatar">{initials(user.name)}</span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="ax-body block truncate font-semibold">{user.name}</span>
                  <span className="ax-caption block truncate">{role?.name ?? "No role"}</span>
                </span>
              </button>
            )}
          </div>
        </aside>

        <div className="min-w-0">
          {/* ---------- top bar ---------- */}
          <header className="ax-topbar">
            <div className="ax-topbar-title">
              <span className="ax-brand-mark ax-only-mobile"><Zap size={14} strokeWidth={2.4} /></span>
              <span className="ax-body font-semibold">{current.label}</span>
            </div>
            <div className="ax-topbar-actions">
              <button type="button" className="ax-icon-btn ax-only-mobile" onClick={() => setSearchOpen(true)} aria-label="Search orders, products and customers"><Search size={18} /></button>
              <div className="ax-notices">
                <button type="button" className="ax-icon-btn" onClick={() => setNoticesOpen((value) => !value)} aria-expanded={noticesOpen} aria-label={`${notices.length} notices`}>
                  <ShieldCheck size={17} />
                  {notices.length > 0 && <i className="ax-dot" data-tone={notices.some((n) => n.tone === "rose") ? "rose" : "amber"} />}
                </button>
                {noticesOpen && (
                  <>
                    <button type="button" className="ax-popover-scrim" aria-label="Close notices" onClick={() => setNoticesOpen(false)} />
                    <div className="ax-popover" role="dialog" aria-label="Store notices">
                      <p className="ax-caption px-3 pb-1 pt-2">Store status</p>
                      {notices.length === 0 && <p className="ax-body flex items-center gap-2 px-3 py-3"><i className="ax-dot is-static" data-tone="emerald" /> All clear — ready for live traffic</p>}
                      {notices.map((notice) => (
                        <button key={notice.id} type="button" className="ax-menu-item" onClick={() => { notice.action(); setNoticesOpen(false); }}>
                          <i className="ax-dot is-static" data-tone={notice.tone} /> {notice.label}
                        </button>
                      ))}
                      {expires && <p className="ax-caption flex items-center gap-1.5 border-t border-[var(--adm-line-soft)] px-3 py-2.5"><Timer size={11} /> Session ends {expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
                    </div>
                  </>
                )}
              </div>
              <button type="button" className="ax-icon-btn" onClick={() => setAccountOpen(true)} aria-label="Open my account" title="My account"><KeyRound size={17} /></button>
              <Link href="/" className="ax-icon-btn ax-only-desktop" aria-label="View storefront" title="View storefront"><ArrowLeft size={17} /></Link>
              <button type="button" className="ax-icon-btn ax-only-desktop" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
            </div>
          </header>

          <main className="adm-main ax-main">
            {subs.length > 1 && current.id !== "settings" && (
              <div className="ax-hub" role="tablist" aria-label={`${current.label} sections`}>
                {subs.map((entry) => (
                  <button key={entry.id} type="button" role="tab" aria-selected={sub === entry.id} data-active={sub === entry.id} onClick={() => go(current.id, entry.id)}>
                    {entry.label}
                  </button>
                ))}
              </div>
            )}
            {!sub && <Empty icon={<Lock size={20} />} title="No sections available" body="Your role does not include any console permissions. Ask the store owner to update your access." />}
            {sub === "overview" && <AdminOverview onNavigate={(next) => go(next)} onOpenOrder={openOrder} toast={toast} />}
            {sub === "analytics" && <AdminAnalytics />}
            {sub === "orders" && <AdminOrders selected={selected} onSelect={setSelected} toast={toast} />}
            {sub === "customers" && <AdminCustomers toast={toast} onOpenOrder={openOrder} />}
            {sub === "catalogue" && <AdminCatalogue toast={toast} />}
            {sub === "inventory" && <AdminInventory toast={toast} />}
            {sub === "reviews" && <AdminReviews toast={toast} />}
            {sub === "pack-ai" && <AdminPackAI toast={toast} />}
            {sub === "promotions" && <AdminPromotions toast={toast} />}
            {sub === "growth" && <AdminGrowth toast={toast} />}
            {(sub === "settings" || sub === "team" || sub === "activity") && (
              <AdminSettings
                toast={toast}
                section={sub === "team" ? "team" : sub === "activity" ? "activity" : "store"}
                onSection={(next) => go("settings", next === "store" ? "settings" : next)}
              />
            )}
            {sub === "account" && <AccountPanel bare onSignOut={signOut} />}
          </main>
        </div>
      </div>

      {/* ---------- mobile bottom bar ---------- */}
      <nav className="ax-bottombar" aria-label="Primary" inert={moreOpen || undefined}>
        {MOBILE_PRIMARY.map((id) => allowedDests.find((entry) => entry.id === id)).filter((entry): entry is Dest => Boolean(entry)).map((entry) => (
          <button key={entry.id} type="button" data-active={current.id === entry.id && !moreOpen} onClick={() => go(entry.id)}
            aria-current={current.id === entry.id ? "page" : undefined}>
            <span className="ax-bottom-icon"><entry.icon size={20} strokeWidth={1.9} />{badge(entry.id)}</span>
            <span>{entry.id === "inventory" ? "Stock" : entry.label}</span>
          </button>
        ))}
        <button type="button" data-active={moreOpen || !MOBILE_PRIMARY.includes(current.id)} onClick={() => { setNoticesOpen(false); setMoreOpen(true); }} aria-haspopup="dialog" aria-expanded={moreOpen}>
          <span className="ax-bottom-icon"><MoreHorizontal size={20} /></span>
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <NavigationSheet
          currentId={current.id}
          onClose={() => setMoreOpen(false)}
          onSelect={(id) => go(id)}
          groups={[
            ...groups.map((group) => ({
              id: group.id,
              label: group.label,
              items: group.items.map((entry) => ({ ...entry, badge: badge(entry.id) })),
            })),
            {
              id: "account",
              label: "Account",
              items: [
                ...(settingsVisible ? [{ ...SETTINGS_DEST, badge: badge("settings") }] : []),
                ACCOUNT_DEST,
                { id: "storefront", label: "Storefront", icon: ArrowLeft, href: "/" },
                { id: "sign-out", label: "Sign out", icon: LogOut, tone: "danger", onAction: signOut },
              ],
            },
          ]}
        />
      )}

      {accountOpen && <AccountPanel open onClose={() => setAccountOpen(false)} onSignOut={signOut} />}

      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        destinations={allowedDests.flatMap((entry) => entry.subs.filter((s) => sectionAllowed(s.id)).map((s) => ({ dest: entry.id, sub: s.id, label: entry.subs.length > 1 ? `${entry.label} · ${s.label}` : entry.label })))}
        onNavigate={(nextDest, nextSub) => go(nextDest, nextSub)}
        onOpenOrder={(orderNumber) => openOrder(orderNumber)}
      />

      {toastMessage && <div className="adm-toast" role="status"><Check size={14} className="text-[#c8ff38]" /> {toastMessage}</div>}
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const users = adminUsers().filter((user) => user.active);
  const [userId, setUserId] = useState(users[0]?.id ?? "owner");
  const [pin, setPin] = useState("");
  const [revealPin, setRevealPin] = useState(false);
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

          <div className="adm-field mt-4">
            <label className="adm-field-label" htmlFor="admin-pin">6-digit PIN</label>
            <div className="adm-pin-wrap">
              <input id="admin-pin" className="adm-input adm-num text-center text-lg tracking-[0.4em]" type={revealPin ? "text" : "password"} inputMode="numeric" autoComplete="current-password" autoFocus maxLength={6}
                disabled={locked > 0} value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
                aria-invalid={Boolean(error)} aria-describedby="admin-pin-help" placeholder="••••••" />
              <button type="button" className="adm-pin-reveal" onClick={() => setRevealPin((v) => !v)}
                aria-label={revealPin ? "Hide PIN" : "Show PIN"} aria-pressed={revealPin} tabIndex={0}>
                {revealPin ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
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

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#efeff3] pt-3">
            <Link href="/" className="inline-flex items-center gap-1.5 text-[0.77rem] text-[#6e6e73] hover:text-[#1d1d1f]"><ArrowLeft size={12} /> Back to storefront</Link>
            <span className="flex items-center gap-1.5 text-[0.68rem] text-[#8e8e93]"><ShieldCheck size={11} /> PIN is hashed locally</span>
          </div>
        </form>
      </div>
    </div>
  );
}
