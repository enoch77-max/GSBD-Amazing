"use client";

/**
 * My Account — personal panel opened from the avatar or profile pill.
 * Profile, appearance, notifications, security. Everything is per-browser
 * staff account; no other person's settings are ever shown.
 */
import { useEffect, useState } from "react";
import { Bell, Check, Laptop, LogOut, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { ops, type AccountPrefs } from "@/db/ops-store";
import { ADMIN_SESSION_HOURS, adminSessionExpiresAt, changeAdminPin, currentAdmin, roleOf, usingDefaultAdminPin } from "@/lib/ops";
import { audit } from "@/lib/ops";
import { Badge, Drawer, PageHead } from "./admin-ui";

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const THEMES: Array<{ id: AccountPrefs["theme"]; label: string; icon: React.ReactNode }> = [
  { id: "light", label: "Light", icon: <Sun size={15} /> },
  { id: "dark", label: "Dark", icon: <Moon size={15} /> },
  { id: "system", label: "System", icon: <Laptop size={15} /> },
];

/**
 * Applies the saved theme to the console. The attribute lives on <html> so it
 * survives the login → shell remount, and it is removed on unmount so the
 * storefront never inherits dark form controls or scrollbars.
 */
export function useConsoleTheme() {
  const theme = ops.state.account.theme;
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      root.dataset.admTheme = dark ? "dark" : "light";
      root.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      delete root.dataset.admTheme;
      root.style.removeProperty("color-scheme");
    };
  }, [theme]);
  return theme;
}

export function AccountPanel({ open, onClose, onSignOut, bare = false }: {
  open?: boolean;
  onClose?: () => void;
  onSignOut: () => void;
  bare?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const [pinForm, setPinForm] = useState({ current: "", next: "", confirm: "" });
  const [pinMessage, setPinMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const user = currentAdmin();
  const role = roleOf(user);
  const prefs = ops.state.account;
  const expires = adminSessionExpiresAt();
  const setPrefs = (patch: Partial<AccountPrefs>) => {
    ops.set({ account: { ...ops.state.account, ...patch } });
    setRevision((value) => value + 1);
  };

  const body = (
    <div className="ax-drawer-stack">
      <section className="ax-account-head">
        <span className="adm-avatar ax-account-avatar">{user ? initials(user.name) : "GS"}</span>
        <div className="min-w-0 flex-1">
          <p className="ax-body font-semibold">{user?.name ?? "Signed in"}</p>
          <p className="ax-caption truncate">{user?.email || "No email on file"}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {role && <Badge tone={user?.roleId === "owner" ? "volt" : "neutral"}>{role.name}</Badge>}
            {usingDefaultAdminPin() && <Badge tone="amber">Default PIN</Badge>}
            <Badge tone="emerald">Active</Badge>
          </div>
        </div>
      </section>

      <section className="ax-drawer-section">
        <header className="ax-drawer-section-head"><h3><Sun size={14} /> Appearance</h3></header>
        <div className="ax-theme-switch" role="radiogroup" aria-label="Console theme">
          {THEMES.map((theme) => (
            <button key={theme.id} type="button" role="radio" aria-checked={prefs.theme === theme.id} data-active={prefs.theme === theme.id}
              onClick={() => { setPrefs({ theme: theme.id }); audit("Changed console theme", theme.id); }}>
              {theme.icon}<span>{theme.label}</span>
            </button>
          ))}
        </div>
        <p className="ax-caption mt-2">Applies to this console only. The storefront keeps its own palette.</p>
      </section>

      <section className="ax-drawer-section">
        <header className="ax-drawer-section-head"><h3><Bell size={14} /> Notifications</h3></header>
        <div className="ax-toggle-stack">
          <PrefRow label="High-value orders" hint="Alert me when an order exceeds the risk threshold." checked={prefs.notifyHighValue} onChange={(value) => setPrefs({ notifyHighValue: value })} />
          <PrefRow label="Critical stock alerts" hint="Alert me when an SKU hits zero or the reorder line." checked={prefs.notifyLowStock} onChange={(value) => setPrefs({ notifyLowStock: value })} />
          <PrefRow label="New order received" hint="Ping me the moment checkout completes." checked={prefs.notifyNewOrder} onChange={(value) => setPrefs({ notifyNewOrder: value })} />
          <PrefRow label="Weekly trading summary" hint="Monday morning digest of revenue, ROAS and stock." checked={prefs.notifyWeeklySummary} onChange={(value) => setPrefs({ notifyWeeklySummary: value })} />
          <PrefRow label="Sound on alerts" hint="Play a short tone for push notifications." checked={prefs.notifySound} onChange={(value) => setPrefs({ notifySound: value })} />
        </div>
      </section>

      <section className="ax-drawer-section">
        <header className="ax-drawer-section-head"><h3><ShieldCheck size={14} /> Security</h3><span className="ax-caption">Session {ADMIN_SESSION_HOURS}h</span></header>
        <PrefRow label="Two-factor authentication" hint="Ask for a second code when signing in from a new device." checked={prefs.twoFactor} onChange={(value) => { setPrefs({ twoFactor: value }); audit(value ? "Enabled two-factor alerts" : "Disabled two-factor alerts", user?.name ?? "Account"); }} />
        {expires && <p className="ax-caption mt-2">This session ends at {expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>}
        <form className="ax-pin-form" onSubmit={(event) => {
          event.preventDefault();
          if (pinForm.next !== pinForm.confirm) { setPinMessage({ ok: false, text: "The new PIN and confirmation do not match." }); return; }
          const result = changeAdminPin(pinForm.current, pinForm.next, pinForm.confirm);
          setPinMessage({ ok: result.ok, text: result.ok ? "PIN updated — use it next time you sign in." : result.error });
          if (result.ok) setPinForm({ current: "", next: "", confirm: "" });
        }}>
          <p className="ax-body font-medium">Change your PIN</p>
          <div className="ax-pin-grid">
            <label><span className="ax-caption">Current</span><input className="adm-input adm-num" type="password" inputMode="numeric" maxLength={6} autoComplete="current-password" value={pinForm.current} aria-label="Current PIN" onChange={(event) => setPinForm({ ...pinForm, current: event.target.value.replace(/\D/g, "") })} /></label>
            <label><span className="ax-caption">New</span><input className="adm-input adm-num" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pinForm.next} aria-label="New PIN" onChange={(event) => setPinForm({ ...pinForm, next: event.target.value.replace(/\D/g, "") })} /></label>
            <label><span className="ax-caption">Confirm</span><input className="adm-input adm-num" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pinForm.confirm} aria-label="Confirm new PIN" onChange={(event) => setPinForm({ ...pinForm, confirm: event.target.value.replace(/\D/g, "") })} /></label>
          </div>
          {pinMessage && <p className={`ax-caption ${pinMessage.ok ? "text-[#3f6212]" : "text-[#b42318]"}`} role="status">{pinMessage.ok && <Check size={12} className="mr-1 inline" />}{pinMessage.text}</p>}
          <button type="submit" className="adm-btn" data-variant="primary" disabled={pinForm.current.length < 6 || pinForm.next.length < 6 || pinForm.confirm.length < 6}>Update PIN</button>
        </form>
      </section>

      <button type="button" className="adm-btn ax-signout" data-variant="danger" onClick={onSignOut}><LogOut size={15} /> Sign out of the console</button>
      <p className="ax-caption text-center" aria-hidden="true">Preferences are stored in this browser · revision {revision + 1}</p>
    </div>
  );

  if (bare) return body;
  return (
    <Drawer open={Boolean(open)} onClose={onClose ?? (() => undefined)} title="My account" subtitle="Profile, appearance, notifications and security">
      {body}
    </Drawer>
  );
}

export function AccountSection({ onSignOut }: { onSignOut: () => void }) {
  return (
    <>
      <PageHead title="My account" subtitle="Your profile, appearance, notifications and sign-in security." />
      <AccountPanel bare onSignOut={onSignOut} />
    </>
  );
}

function PrefRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="ax-toggle-row">
      <div className="min-w-0"><p className="ax-body font-medium">{label}</p><p className="ax-caption mt-0.5">{hint}</p></div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="ax-switch-lg" data-on={checked} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}

/** Small avatar button that opens the account drawer from the shell. */
export function AccountTrigger({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <button type="button" className="ax-icon-btn" onClick={onOpen} aria-label="Open my account" title="My account">
      <span className="adm-avatar size-7 text-[0.6rem]">{initials(name)}</span>
      <UserRound size={0} className="sr-only" />
    </button>
  );
}
