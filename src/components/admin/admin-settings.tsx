"use client";

/**
 * Settings hub — three sub-tabs, one source of truth.
 * Desktop: vertical sub-nav. Mobile: horizontally scrollable pill tabs.
 */
import { Activity, AlertTriangle, Check, ShieldCheck, Store } from "lucide-react";
import { ops } from "@/db/ops-store";
import { readinessAudit } from "@/lib/settings";
import { PageHead } from "./admin-ui";
import { StoreCheckout } from "./settings-store";
import { TeamRoles, TeamSummary } from "./settings-team";
import { ActivityTimeline } from "./settings-activity";

const SECTIONS = [
  { id: "store", label: "Store & checkout", short: "Store", icon: Store },
  { id: "team", label: "Team & roles", short: "Team", icon: ShieldCheck },
  { id: "activity", label: "Activity log", short: "Activity", icon: Activity },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function AdminSettings({ toast, section, onSection }: {
  toast: (message: string) => void;
  section: SectionId;
  onSection: (next: SectionId) => void;
}) {
  const issues = readinessAudit(ops.state.settings);
  const blockers = issues.filter((issue) => issue.severity === "blocker").length;

  return (
    <>
      <PageHead title="Settings" subtitle="Store, team and security in one place — every change is audited." />

      {blockers > 0 ? (
        <div className="ax-set-banner" data-tone="warn">
          <AlertTriangle size={15} />
          <span><b>{blockers} launch blocker{blockers === 1 ? "" : "s"}</b>{issues[0] ? ` — ${issues[0].label}` : ""}</span>
        </div>
      ) : (
        <div className="ax-set-banner" data-tone="ok"><Check size={15} /> All launch checks passed — ready for live traffic.</div>
      )}

      <div className="ax-settings-shell">
        <nav className="ax-settings-nav" aria-label="Settings sections">
          {SECTIONS.map((entry) => (
            <button key={entry.id} type="button" className="ax-set-nav-item" data-active={section === entry.id} aria-current={section === entry.id ? "page" : undefined} onClick={() => onSection(entry.id)}>
              <entry.icon size={16} /><span>{entry.label}</span>
            </button>
          ))}
        </nav>
        <div className="ax-settings-body">
          {section === "store" && <StoreCheckout toast={toast} />}
          {section === "team" && <TeamRoles toast={toast} />}
          {section === "activity" && <ActivityTimeline />}
        </div>
      </div>
    </>
  );
}

export { TeamSummary };
