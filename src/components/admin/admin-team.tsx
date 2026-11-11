"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useStoreVersion } from "@/lib/use-store";
import { PERMISSIONS, type AdminRole, type Permission } from "@/lib/admin-access";
import { adminUsers, can, createStaff, currentAdmin, deleteRole, removeStaff, resetStaffPin, rolesList, saveRole, updateStaff } from "@/lib/ops";
import type { AdminUser } from "@/db/ops-store";
import { formatDate } from "@/lib/format";
import { Badge, Button, Drawer, Field, PageHead, Panel, ReadOnlyNote } from "./admin-ui";

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];
const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export function AdminTeam({ toast }: { toast: (message: string) => void }) {
  useStoreVersion();
  const [view, setView] = useState<"staff" | "roles" | "matrix">("staff");
  const [editingUser, setEditingUser] = useState<AdminUser | "new" | null>(null);
  const [editingRole, setEditingRole] = useState<{ role: AdminRole | null; copyOf?: AdminRole } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const manage = can("team.manage");
  const users = adminUsers();
  const roles = rolesList();
  const me = currentAdmin();
  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? "Unknown role";
  const report = (result: { ok: true } | { ok: false; error: string }, message: string) => { toast(result.ok ? message : result.error); return result.ok; };

  return (
    <>
      <PageHead
        title="Team & roles"
        subtitle="Give every staff member their own PIN and only the access their job needs."
        actions={manage && (view === "roles"
          ? <Button size="sm" variant="primary" onClick={() => setEditingRole({ role: null })}><Plus size={13} /> New role</Button>
          : <Button size="sm" variant="primary" onClick={() => setEditingUser("new")}><UserPlus size={13} /> Add staff</Button>)}
      />
      {!manage && <ReadOnlyNote />}

      <div className="adm-segmented" role="group" aria-label="Team view">
        {([["staff", `Staff · ${users.length}`], ["roles", `Roles · ${roles.length}`], ["matrix", "Permission matrix"]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {view === "staff" && (
        <Panel>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Staff member</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} data-hidden={!user.active}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="adm-avatar">{initials(user.name)}</span>
                        <div className="min-w-0">
                          <p className="font-medium">{user.name} {me?.id === user.id && <Badge tone="sky" className="ml-1">You</Badge>}</p>
                          <p className="text-[0.7rem] text-[#6e6e73]">{user.email || "No email"}</p>
                        </div>
                      </div>
                    </td>
                    <td><Badge tone={user.roleId === "owner" ? "volt" : "neutral"}>{roleName(user.roleId)}</Badge></td>
                    <td>{user.active ? <Badge tone="emerald">Active</Badge> : <Badge>Deactivated</Badge>}{user.pinHash === null && <Badge tone="amber" className="ml-1">Default PIN</Badge>}</td>
                    <td className="text-[0.75rem] text-[#6e6e73]">{user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}</td>
                    <td>
                      {confirmRemove === user.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[0.72rem] text-[#b42318]">Remove access?</span>
                          <Button size="sm" variant="danger" onClick={() => { if (report(removeStaff(user.id), "Staff member removed")) setConfirmRemove(null); }}>Remove</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button type="button" className="adm-icon-btn" disabled={!manage} aria-label={`Edit ${user.name}`} title="Edit" onClick={() => setEditingUser(user)}><Pencil size={13} /></button>
                          <button type="button" className="adm-icon-btn" disabled={!manage || me?.id === user.id} aria-label={`Remove ${user.name}`} title="Remove" onClick={() => setConfirmRemove(user.id)}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {view === "roles" && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => {
            const members = users.filter((user) => user.roleId === role.id).length;
            return (
              <article key={role.id} className="adm-role-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-1.5 font-display text-[0.98rem] font-semibold"><ShieldCheck size={15} className="text-[#65a30d]" /> {role.name}</h3>
                    <p className="mt-0.5 text-[0.74rem] leading-relaxed text-[#6e6e73]">{role.description || "Custom role"}</p>
                  </div>
                  {role.builtin ? <Badge>Built-in</Badge> : <Badge tone="violet">Custom</Badge>}
                </div>
                <p className="text-[0.72rem] text-[#3a3a3c]"><b>{role.id === "owner" ? PERMISSIONS.length : role.permissions.length}</b> of {PERMISSIONS.length} permissions · {members} member{members === 1 ? "" : "s"}</p>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {!role.builtin && <Button size="sm" disabled={!manage} onClick={() => setEditingRole({ role })}><Pencil size={12} /> Edit</Button>}
                  <Button size="sm" variant="ghost" disabled={!manage} onClick={() => setEditingRole({ role: null, copyOf: role })}><Copy size={12} /> Duplicate</Button>
                  {!role.builtin && <Button size="sm" variant="ghost" disabled={!manage} onClick={() => report(deleteRole(role.id), "Role deleted")}><Trash2 size={12} /> Delete</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {view === "matrix" && (
        <Panel title="Who can do what" subtitle="Owners always have full access. Built-in roles are fixed; duplicate one to customise it.">
          <div className="adm-table-wrap -m-4">
            <table className="adm-matrix">
              <thead><tr><th>Permission</th>{roles.map((role) => <th key={role.id}>{role.name}</th>)}</tr></thead>
              <tbody>
                {GROUPS.map((group) => (
                  <FragmentRows key={group} group={group} roles={roles} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {editingUser && <StaffEditor user={editingUser === "new" ? null : editingUser} roles={roles} onClose={() => setEditingUser(null)} toast={toast} />}
      {editingRole && <RoleEditor role={editingRole.role} copyOf={editingRole.copyOf} onClose={() => setEditingRole(null)} toast={toast} />}
    </>
  );
}

function FragmentRows({ group, roles }: { group: string; roles: AdminRole[] }) {
  return (
    <>
      <tr className="adm-group-row"><td colSpan={roles.length + 1}>{group}</td></tr>
      {PERMISSIONS.filter((p) => p.group === group).map((permission) => (
        <tr key={permission.id}>
          <td>{permission.label}</td>
          {roles.map((role) => (
            <td key={role.id}>{role.id === "owner" || role.permissions.includes(permission.id) ? <span className="adm-tick" aria-label="Allowed"><Check size={12} strokeWidth={3} /></span> : <span className="adm-dash" aria-label="Not allowed">—</span>}</td>
          ))}
        </tr>
      ))}
    </>
  );
}

function StaffEditor({ user, roles, onClose, toast }: { user: AdminUser | null; roles: AdminRole[]; onClose: () => void; toast: (m: string) => void }) {
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

  const role = roles.find((entry) => entry.id === roleId);
  return (
    <Drawer open onClose={onClose} title={user ? `Edit ${user.name}` : "Add staff member"} subtitle="Each person signs in with their own 6-digit PIN"
      footer={<><Button variant="primary" onClick={save}>{user ? "Save changes" : "Add staff member"}</Button><Button variant="ghost" onClick={onClose}>Cancel</Button>{error && <span className="adm-field-error" role="alert">{error}</span>}</>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><input className="adm-input" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} /></Field>
        <Field label="Email (optional)"><input className="adm-input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} /></Field>
      </div>
      <Field label="Role" hint={self ? "You cannot change your own role." : role?.description}>
        <select className="adm-select" value={roleId} disabled={self} onChange={(e) => setRoleId(e.target.value)} aria-label="Role">
          {roles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </Field>
      {role && (
        <div className="flex flex-wrap gap-1">
          {(role.id === "owner" ? PERMISSIONS : PERMISSIONS.filter((p) => role.permissions.includes(p.id))).map((p) => <Badge key={p.id} tone="volt">{p.label}</Badge>)}
        </div>
      )}
      <Field label={user ? "Set a new PIN (optional)" : "Starting PIN"} hint="6 digits. Avoid repeated or sequential numbers.">
        <input className="adm-input adm-num tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => { setPin(digits(e.target.value)); setError(""); }} aria-label={user ? "New PIN" : "Starting PIN"} />
      </Field>
      {user && !self && (
        <label className="inline-flex items-center gap-2 text-[0.8rem]"><input type="checkbox" className="adm-checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Account active (can sign in)</label>
      )}
      <p className="flex items-start gap-2 text-[0.72rem] text-[#6e6e73]"><KeyRound size={13} className="mt-0.5 shrink-0" /> Staff can change their own PIN in Settings → Security after signing in.</p>
    </Drawer>
  );
}

function RoleEditor({ role, copyOf, onClose, toast }: { role: AdminRole | null; copyOf?: AdminRole; onClose: () => void; toast: (m: string) => void }) {
  const base = role ?? copyOf;
  const [name, setName] = useState(role ? role.name : copyOf ? `${copyOf.name} (custom)` : "");
  const [description, setDescription] = useState(base?.description ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(base?.id === "owner" ? PERMISSIONS.map((p) => p.id) : [...(base?.permissions ?? [])]);
  const [error, setError] = useState("");
  const toggle = (id: Permission) => setPermissions((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));
  const toggleGroup = (group: string, on: boolean) => {
    const ids = PERMISSIONS.filter((p) => p.group === group).map((p) => p.id);
    setPermissions((current) => (on ? [...new Set([...current, ...ids])] : current.filter((p) => !ids.includes(p))));
  };
  const save = () => {
    const result = saveRole({ id: role?.id, name, description, permissions });
    if (!result.ok) { setError(result.error); return; }
    toast(role ? "Role updated" : "Role created");
    onClose();
  };
  return (
    <Drawer open wide onClose={onClose} title={role ? `Edit ${role.name}` : "New custom role"} subtitle="Changes apply the next time staff with this role load the console"
      footer={<><Button variant="primary" onClick={save}>{role ? "Save role" : "Create role"}</Button><Button variant="ghost" onClick={onClose}>Cancel</Button><span className="text-[0.74rem] text-[#6e6e73]">{permissions.length} selected</span>{error && <span className="adm-field-error" role="alert">{error}</span>}</>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role name"><input className="adm-input" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} /></Field>
        <Field label="Description"><input className="adm-input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      {GROUPS.map((group) => {
        const ids = PERMISSIONS.filter((p) => p.group === group);
        const all = ids.every((p) => permissions.includes(p.id));
        return (
          <section key={group} className="adm-form-section">
            <div className="flex items-center justify-between gap-2">
              <h3>{group}</h3>
              <button type="button" className="text-[0.72rem] font-semibold text-[#4d7c0f] hover:underline" onClick={() => toggleGroup(group, !all)}>{all ? "Clear all" : "Select all"}</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ids.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded-lg border border-[#e3e3e8] px-3 py-2 text-[0.79rem]">
                  <input type="checkbox" className="adm-checkbox" checked={permissions.includes(p.id)} onChange={() => toggle(p.id)} /> {p.label}
                </label>
              ))}
            </div>
          </section>
        );
      })}
      <p className="flex items-start gap-2 text-[0.72rem] text-[#6e6e73]"><Users size={13} className="mt-0.5 shrink-0" /> Staff and role management stays limited to roles that include “Manage staff & roles”.</p>
    </Drawer>
  );
}
