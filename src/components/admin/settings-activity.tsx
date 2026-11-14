"use client";

/**
 * Settings → Activity log.
 * A vertical security timeline: icon, one-line summary, relative time, and an
 * expandable detail for the before/after payload.
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Activity, ChevronDown, CircleDollarSign, Download, History, Package, Search, ShieldCheck,
  Sparkles, Tag, UserCog,
} from "lucide-react";
import { ops } from "@/db/ops-store";
import { download, rolesList, toCsv } from "@/lib/ops";
import { timeAgo } from "@/lib/format";
import { Badge, Button, Empty } from "./admin-ui";

type ActionFilter = "all" | "price" | "stock" | "ai" | "access" | "security";
const ACTION_FILTERS: Array<{ id: ActionFilter; label: string; icon: React.ReactNode; match: RegExp }> = [
  { id: "all", label: "All actions", icon: <Activity size={13} />, match: /.*/ },
  { id: "price", label: "Price changed", icon: <CircleDollarSign size={13} />, match: /price|promo|discount|tier/i },
  { id: "stock", label: "Stock adjusted", icon: <Package size={13} />, match: /stock|product|featured|bestseller|restock/i },
  { id: "ai", label: "AI rule updated", icon: <Sparkles size={13} />, match: /pack|builder|ai|recommend/i },
  { id: "access", label: "Access & roles", icon: <UserCog size={13} />, match: /staff|role|pin|permission|account|team/i },
  { id: "security", label: "Security", icon: <ShieldCheck size={13} />, match: /sign-in|signed|locked|session|security/i },
];
const RANGES = [
  { id: "1", label: "24h", ms: 86400000 },
  { id: "7", label: "7d", ms: 7 * 86400000 },
  { id: "30", label: "30d", ms: 30 * 86400000 },
  { id: "all", label: "All", ms: Infinity },
] as const;

const iconFor = (action: string) => {
  if (/price|promo|discount|tier/i.test(action)) return <CircleDollarSign size={14} />;
  if (/stock|product|bestseller|featured/i.test(action)) return <Package size={14} />;
  if (/pack|ai|builder|recommend/i.test(action)) return <Sparkles size={14} />;
  if (/staff|role|pin|permission|team/i.test(action)) return <UserCog size={14} />;
  if (/sign-in|signed|locked|session/i.test(action)) return <ShieldCheck size={14} />;
  return <Tag size={14} />;
};
const severity = (action: string) =>
  /deleted|removed|locked|failed|cancel|refund/i.test(action) ? "rose"
    : /stock|price|settings|promo/i.test(action) ? "amber"
      : /sign/i.test(action) ? "sky" : "neutral";

export function ActivityTimeline() {
  useSyncExternalStore(ops.subscribe, ops.getVersion, ops.getVersion);
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("all");
  const [action, setAction] = useState<ActionFilter>("all");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("7");
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const entries = ops.state.audit;
  const roles = rolesList();
  const people = [...new Map(entries.map((entry) => [entry.userId, entry.userName])).entries()];

  const rows = useMemo(() => {
    const limit = RANGES.find((entry) => entry.id === range)!.ms;
    const term = query.trim().toLowerCase();
    const matcher = ACTION_FILTERS.find((entry) => entry.id === action)!.match;
    return entries
      .filter((entry) => Date.now() - new Date(entry.at).getTime() <= limit)
      .filter((entry) => person === "all" || entry.userId === person)
      .filter((entry) => matcher.test(entry.action))
      .filter((entry) => !term || `${entry.action} ${entry.target} ${entry.detail ?? ""} ${entry.userName}`.toLowerCase().includes(term));
  }, [entries, query, person, action, range]);

  const exportCsv = () => download(`activity-log-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((entry) => ({
    time: entry.at, staff: entry.userName, role: roles.find((role) => role.id === entry.roleId)?.name ?? entry.roleId,
    action: entry.action, target: entry.target, detail: entry.detail ?? "",
  }))));

  return (
    <div className="ax-set-stack">
      <section className="ax-card">
        <div className="ax-card-body flex flex-col gap-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--adm-faint)]" />
            <input className="adm-input pl-9" placeholder="Search action, order, product or staff…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search activity" />
          </div>
          <div className="ax-seg wrap ax-activity-actions" role="tablist" aria-label="Action type">
            {ACTION_FILTERS.map((entry) => (
              <button key={entry.id} type="button" role="tab" aria-selected={action === entry.id} data-active={action === entry.id} onClick={() => setAction(entry.id)}>{entry.icon}{entry.label}</button>
            ))}
          </div>
          <div className="ax-activity-filters">
            <select className="adm-select" value={person} onChange={(event) => setPerson(event.target.value)} aria-label="Filter by team member">
              <option value="all">All team members</option>
              {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <div className="ax-seg" role="radiogroup" aria-label="Time range">
              {RANGES.map((entry) => <button key={entry.id} type="button" role="radio" aria-checked={range === entry.id} data-active={range === entry.id} onClick={() => setRange(entry.id)}>{entry.label}</button>)}
            </div>
            <Button size="sm" variant="ghost" disabled={!rows.length} onClick={exportCsv}><Download size={13} /> Export</Button>
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <section className="ax-card"><Empty icon={<History size={22} />}
          title={entries.length === 0 ? "No staff activity yet" : "Nothing matches this view"}
          body={entries.length === 0
            ? "Every price change, stock adjustment, AI rule update and sign-in is recorded here. Make a change anywhere in the console and it appears instantly."
            : "Try a wider time range, another team member, or clear the action filter."}
        /></section>
      ) : (
        <ol className="ax-timeline-list">
          {rows.map((entry) => {
            const open = openEntry === entry.id;
            return (
              <li key={entry.id} className="ax-tl-entry" data-severity={severity(entry.action)}>
                <span className="ax-tl-icon">{iconFor(entry.action)}</span>
                <div className="min-w-0 flex-1">
                  <button type="button" className="ax-tl-main" aria-expanded={open} onClick={() => setOpenEntry(open ? null : entry.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="ax-body block">
                        <b className="font-semibold">{entry.userName}</b> <span className="text-[var(--adm-muted)]">{entry.action.toLowerCase()}</span> {entry.target !== entry.userName && <span className="font-medium">{entry.target}</span>}
                      </span>
                      <span className="ax-caption block">{entry.detail ?? roles.find((role) => role.id === entry.roleId)?.name ?? entry.roleId}</span>
                    </span>
                    <time className="ax-caption whitespace-nowrap" dateTime={entry.at}>{timeAgo(entry.at)}</time>
                    <ChevronDown size={14} className="ax-tl-chevron" data-open={open || undefined} />
                  </button>
                  {open && (
                    <div className="ax-tl-detail">
                      <dl>
                        <div><dt>When</dt><dd>{new Date(entry.at).toLocaleString()}</dd></div>
                        <div><dt>Staff</dt><dd>{entry.userName}</dd></div>
                        <div><dt>Role</dt><dd>{roles.find((role) => role.id === entry.roleId)?.name ?? entry.roleId}</dd></div>
                        <div><dt>Action</dt><dd>{entry.action}</dd></div>
                        <div><dt>Target</dt><dd>{entry.target}</dd></div>
                        {entry.detail && <div><dt>Detail</dt><dd>{entry.detail}</dd></div>}
                      </dl>
                      <Badge tone={severity(entry.action)}>audit entry</Badge>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
