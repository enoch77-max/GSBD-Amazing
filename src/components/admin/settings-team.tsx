"use client";

/**
 * Settings → Team & Roles.
 * Member cards (avatar, name, role badge, status) with a permissions drawer
 * that uses grouped toggle switches rather than a checkbox matrix.
 */
import { useState } from "react";
import { KeyRound, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useStoreVersion } from "@/lib/use-store";
import { PERMISSIONS, type AdminRole, type Permission } from "@/lib/admin-access";
import {
  adminUsers, can, createStaff, currentAdmin, deleteRole, removeStaff, resetStaffPin, rolesList,
  saveRole, updateStaff,
} from "@/lib/ops";
import type { AdminUser } from "@/db/ops-store";
import { formatDate, timeAgo } from "@/lib/format";
import { Badge, Button, Drawer, Field, ReadOnlyNote } from "./admin-ui";

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const GROUPS = [...new Set(PERMISSIONS.map((permission) => permission.group))];
const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

/** Friendly names for the built-in roles, matching the Phase 6 brief. */
const ROLE_TAG: Record<string, { label: string; tone: string }> = {
  owner: { label: "Admin", tone: "volt" },
  manager: { label: "Admin", tone: "volt" },
  warehouse: { label: "Warehouse", tone: "sky" },
  sales: { label: "Support", tone: "violet" },
  marketing: { label: "Marketing", tone: "amber" },
  viewer: { label: "Viewer", tone: "neutral" },
};

export function TeamRoles({ toast }: { toast: (message: string) => void }) {
  useStoreVersion();
  const [editingUser, setEditingUser] = useState<AdminUser | "new" | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<{ role: AdminRole } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [showRoles, setShowRoles] = useState(false);
  const manage = can("team.manage");
  const users = adminUsers();
  const roles = rolesList();
  const me = currentAdmin();
  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? id;
  const tag = (id: string) => ROLE_TAG[id] ?? { label: roleName(id), tone: "neutral" };
  const report = (result: { ok: true } | { ok: false; error: string }, message: string) => { toast(result.ok ? message : result.error); return result.ok; };

  return (
    <>
      {!manage && <ReadOnlyNote />}
      <div className="ax-set-stack">
        <section className="ax-card">
          <header className="ax-card-head">
            <div><h2 className="ax-title-sm">Team members</h2><p className="ax-caption mt-0.5">{users.filter((user) => user.active).length} active of {users.length} · each signs in with a personal PIN</p></div>
            {manage && <Button size="sm" variant="primary" onClick={() => setEditingUser("new")}><UserPlus size={13} /> Add</Button>}
          </header>
          <ul className="ax-member-list">
            {users.map((user) => {
              const badge = tag(user.roleId);
              return (
                <li key={user.id} className="ax-member" data-inactive={!user.active || undefined}>
                  <span className="adm-avatar ax-member-avatar">{initials(user.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="ax-body flex flex-wrap items-center gap-1.5 font-semibold">{user.name}{me?.id === user.id && <Badge tone="sky">You</Badge>}</p>
                    <p className="ax-caption truncate">{user.email || "No email"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      {user.active ? <Badge tone="emerald">Active</Badge> : <Badge tone="neutral">Deactivated</Badge>}
                      {user.pinHash === null && <Badge tone="amber">Default PIN</Badge>}
                    </div>
                  </div>
                  <div className="ax-member-actions">
                    <span className="ax-caption ax-member-last">{user.lastLoginAt ? `Seen ${timeAgo(user.lastLoginAt)}` : "Never signed in"}</span>
                    {manage && <>
                      <Button size="sm" variant="ghost" onClick={() => setPermissionsFor({ role: roles.find((role) => role.id === user.roleId) ?? roles[0] })}><ShieldCheck size={13} /> Permissions</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingUser(user)}>Edit</Button>
                      {me?.id !== user.id && (confirmRemove === user.id
                        ? <><Button size="sm" variant="danger" onClick={() => { if (report(removeStaff(user.id), "Staff member removed")) setConfirmRemove(null); }}>Remove</Button><Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Button></>
                        : <button type="button" className="adm-icon-btn" aria-label={`Remove ${user.name}`} onClick={() => setConfirmRemove(user.id)}><Trash2 size={15} /></button>)}
                    </>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="ax-card">
          <header className="ax-card-head">
            <div><h2 className="ax-title-sm">Roles</h2><p className="ax-caption mt-0.5">Built-in roles stay fixed; duplicate one to customise it.</p></div>
            <Button size="sm" variant="ghost" onClick={() => setShowRoles((value) => !value)}>{showRoles ? "Hide" : "Manage roles"}</Button>
          </header>
          {showRoles && (
            <ul className="ax-role-list">
              {roles.map((role) => {
                const members = users.filter((user) => user.roleId === role.id).length;
                return (
                  <li key={role.id}>
                    <span className="ax-set-icon"><ShieldCheck size={15} /></span>
                    <div className="min-w-0 flex-1"><p className="ax-body font-semibold">{role.name}</p><p className="ax-caption">{role.description || "Custom role"} · {members} member{members === 1 ? "" : "s"}</p></div>
                    <span className="ax-caption">{role.id === "owner" ? PERMISSIONS.length : role.permissions.length}/{PERMISSIONS.length}</span>
                    <Button size="sm" variant="ghost" onClick={() => setPermissionsFor({ role })}><ShieldCheck size={13} /> Permissions</Button>
                    {manage && role.id !== "owner" && <Button size="sm" variant="ghost" onClick={() => report(deleteRole(role.id), "Role deleted")}><Trash2 size={13} /></Button>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {editingUser && <StaffEditor user={editingUser === "new" ? null : editingUser} roles={roles} onClose={() => setEditingUser(null)} toast={toast} />}
      {permissionsFor && <PermissionsDrawer role={permissionsFor.role} users={users} onClose={() => setPermissionsFor(null)} toast={toast} canManage={manage} />}
    </>
  );
}

function PermissionsDrawer({ role, users, onClose, toast, canManage }: {
  role: AdminRole;
  users: AdminUser[];
  onClose: () => void;
  toast: (message: string) => void;
  canManage: boolean;
}) {
  const locked = role.id === "owner";
  const [draft, setDraft] = useState<Permission[]>(locked ? PERMISSIONS.map((permission) => permission.id) : [...role.permissions]);
  const members = users.filter((user) => user.roleId === role.id);
  const toggle = (id: Permission) => setDraft((current) => (current.includes(id) ? current.filter((permission) => permission !== id) : [...current, id]));
  const groupIds = (group: string) => PERMISSIONS.filter((permission) => permission.group === group).map((permission) => permission.id);
  const groupOn = (group: string) => groupIds(group).every((id) => draft.includes(id));

  const save = () => {
    const result = saveRole({ id: role.id, name: role.name, description: role.description, permissions: draft });
    toast(result.ok ? `${role.name} permissions updated` : result.error);
    if (result.ok) onClose();
  };

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={`${role.name} permissions`}
      subtitle={`${draft.length} of ${PERMISSIONS.length} enabled · ${members.length} member${members.length === 1 ? "" : "s"}`}
      footer={
        <div className="ax-editor-footer">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <span className="ax-editor-footer-note">{locked ? "Owners always have full access" : "Applies the next time staff load the console"}</span>
          <Button variant="primary" disabled={!canManage || locked} onClick={save}>Save permissions</Button>
        </div>
      }
    >
      <div className="ax-perm-groups">
        {GROUPS.map((group) => (
          <section key={group} className="ax-perm-group">
            <header className="ax-perm-head">
              <div className="min-w-0"><p className="ax-body font-semibold">{group}</p><p className="ax-caption">{groupIds(group).filter((id) => draft.includes(id)).length} of {groupIds(group).length} enabled</p></div>
              <button type="button" role="switch" aria-checked={groupOn(group)} aria-label={`All ${group} permissions`} className="ax-switch-lg" data-on={groupOn(group)} disabled={!canManage || locked}
                onClick={() => setDraft((current) => groupOn(group) ? current.filter((id) => !groupIds(group).includes(id)) : [...new Set([...current, ...groupIds(group)])])}><span /></button>
            </header>
            <div className="ax-toggle-stack">
              {PERMISSIONS.filter((permission) => permission.group === group).map((permission) => (
                <div key={permission.id} className="ax-toggle-row">
                  <div className="min-w-0"><p className="ax-body font-medium">{permission.label}</p></div>
                  <button type="button" role="switch" aria-checked={draft.includes(permission.id)} aria-label={permission.label} className="ax-switch-lg" data-on={draft.includes(permission.id)} disabled={!canManage || locked} onClick={() => toggle(permission.id)}><span /></button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Drawer>
  );
}

function StaffEditor({ user, roles, onClose, toast }: { user: AdminUser | null; roles: AdminRole[]; onClose: () => void; toast: (message: string) => void }) {
  const me = currentAdmin();
  const self = me?.id === user?.id;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [roleId, setRoleId] = useState(user?.roleId ?? "sales");
  const [active, setActive] = useState(user?.active ?? true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const save = () => {
    if (!user) {
      const result = createStaff({ name, email, roleId, pin });
      if (!result.ok) { setError(result.error); return; }
      toast(`${name.trim()} added — share their PIN privately`);
      onClose();
      return;
    }
    const result = updateStaff(user.id, { name, email, roleId, active });
    if (!result.ok) { setError(result.error); return; }
    if (pin) {
      const reset = resetStaffPin(user.id, pin);
      if (!reset.ok) { setError(reset.error); return; }
    }
    toast("Staff member updated");
    onClose();
  };

  return (
    <Drawer open onClose={onClose} title={user ? `Edit ${user.name}` : "Add staff member"} subtitle="Each person signs in with their own 6-digit PIN"
      footer={<div className="ax-editor-footer"><Button variant="ghost" onClick={onClose}>Discard</Button><span className="ax-editor-footer-note">{error}</span><Button variant="primary" onClick={save}>{user ? "Save member" : "Add member"}</Button></div>}>
      <div className="ax-editor-page">
        <section className="ax-editor-block">
          <header><div><h3>Profile</h3><p>Shown in the activity log against every action.</p></div></header>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><input className="adm-input" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} /></Field>
            <Field label="Email (optional)"><input className="adm-input" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} /></Field>
          </div>
        </section>
        <section className="ax-editor-block">
          <header><div><h3>Access</h3><p>Role decides which sections they can open.</p></div></header>
          <Field label="Role" hint={self ? "You cannot change your own role." : roles.find((role) => role.id === roleId)?.description}>
            <select className="adm-select" value={roleId} disabled={self} onChange={(event) => setRoleId(event.target.value)} aria-label="Role">
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </Field>
          <Field label={user ? "Set a new PIN (optional)" : "Starting PIN"} hint="6 digits. Avoid repeated or sequential numbers.">
            <input className="adm-input adm-num tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => { setPin(digits(event.target.value)); setError(""); }} aria-label={user ? "New PIN" : "Starting PIN"} />
          </Field>
          {user && !self && (
            <div className="ax-toggle-row">
              <div className="min-w-0"><p className="ax-body font-medium">Account active</p><p className="ax-caption">Deactivated staff keep their history but cannot sign in.</p></div>
              <button type="button" role="switch" aria-checked={active} aria-label="Account active" className="ax-switch-lg" data-on={active} onClick={() => setActive(!active)}><span /></button>
            </div>
          )}
          <p className="ax-caption mt-2 flex items-start gap-2"><KeyRound size={13} className="mt-0.5 shrink-0" /> Staff can change their own PIN under My account.</p>
        </section>
      </div>
    </Drawer>
  );
}

/** Compact summary used by the settings hub header. */
export function TeamSummary() {
  const users = adminUsers();
  return <span className="ax-set-summary"><Users size={12} /> {users.filter((user) => user.active).length} active</span>;
}

export function teamLastSeen(user: AdminUser) {
  return user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never";
}

export { Plus };
