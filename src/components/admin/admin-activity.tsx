"use client";

import { useMemo, useState } from "react";
import { Download, History, Search } from "lucide-react";
import { useSyncExternalStore } from "react";
import { ops } from "@/db/ops-store";
import { download, rolesList, toCsv } from "@/lib/ops";
import { Badge, Button, Empty, PageHead, Panel } from "./admin-ui";

const RANGES = [
  { id: "1", label: "24 hours", ms: 86400000 },
  { id: "7", label: "7 days", ms: 7 * 86400000 },
  { id: "30", label: "30 days", ms: 30 * 86400000 },
  { id: "all", label: "All", ms: Infinity },
] as const;

function tone(action: string) {
  if (/sign-in locked|deleted|removed|refund|cancel/i.test(action)) return "rose";
  if (/signed in|signed out/i.test(action)) return "sky";
  if (/role|staff|pin/i.test(action)) return "violet";
  if (/price|stock|product|bestseller|review|promo/i.test(action)) return "volt";
  return "neutral";
}

export function AdminActivity() {
  useSyncExternalStore(ops.subscribe, ops.getVersion, ops.getVersion);
  const [query, setQuery] = useState("");
  const [user, setUser] = useState("all");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("7");
  const entries = ops.state.audit;
  const people = [...new Map(entries.map((entry) => [entry.userId, entry.userName])).entries()];
  const roles = rolesList();

  const rows = useMemo(() => {
    const limit = RANGES.find((r) => r.id === range)!.ms;
    const term = query.trim().toLowerCase();
    return entries.filter((entry) => Date.now() - new Date(entry.at).getTime() <= limit)
      .filter((entry) => user === "all" || entry.userId === user)
      .filter((entry) => !term || `${entry.action} ${entry.target} ${entry.detail ?? ""} ${entry.userName}`.toLowerCase().includes(term));
  }, [entries, query, user, range]);

  const exportCsv = () => download(`activity-log-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((entry) => ({
    time: entry.at, staff: entry.userName, role: roles.find((r) => r.id === entry.roleId)?.name ?? entry.roleId,
    action: entry.action, target: entry.target, detail: entry.detail ?? "",
  }))));

  return (
    <>
      <PageHead title="Activity log" subtitle="Every staff change to orders, products, prices, promotions, settings and access." actions={<Button size="sm" disabled={!rows.length} onClick={exportCsv}><Download size={13} /> Export CSV</Button>} />
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
            <input className="adm-input pl-8" placeholder="Search action, order, product…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search activity" />
          </div>
          <select className="adm-select w-auto" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Filter by staff member">
            <option value="all">All staff</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <div className="adm-segmented" role="group" aria-label="Time range">
            {RANGES.map((r) => <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>)}
          </div>
        </div>
      </Panel>
      <Panel title={`${rows.length} event${rows.length === 1 ? "" : "s"}`} subtitle="Kept for the most recent 600 actions in this browser">
        {rows.length === 0 ? <Empty icon={<History size={20} />} title="No activity yet" body="Staff actions appear here as soon as they happen." /> : (
          <ul className="adm-activity -m-4">
            {rows.map((entry) => (
              <li key={entry.id}>
                <span className="adm-avatar">{entry.userName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="text-[0.82rem]"><b>{entry.userName}</b> <span className="text-[#6e6e73]">·</span> <Badge tone={tone(entry.action)}>{entry.action}</Badge> <span className="font-medium">{entry.target}</span></p>
                  {entry.detail && <p className="mt-0.5 text-[0.74rem] text-[#6e6e73]">{entry.detail}</p>}
                </div>
                <time className="whitespace-nowrap text-[0.7rem] text-[#8e8e93]" dateTime={entry.at}>{new Date(entry.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
