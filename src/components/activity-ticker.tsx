"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Radio } from "lucide-react";

export type ActivityEntry = {
  id: string;
  customer: string;
  district: string;
  item: string;
  slug?: string;
  createdAt: string;
};

function timeAgo(value: string): string {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityTicker() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/activity")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("unavailable")))
      .then((data: { entries?: ActivityEntry[] }) => { if (!cancelled) setEntries((data.entries ?? []).slice(0, 8)); })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (paused || entries.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % entries.length), 4200);
    return () => window.clearInterval(timer);
  }, [entries.length, paused]);

  /* The strip always occupies its slot from the first paint. Rendering nothing
     until the fetch resolved inserted it later and pushed the page down 56px —
     a layout shift that also broke back/forward scroll restoration. */
  if (entries.length === 0) {
    return (
      <aside className="activity-ticker no-print" aria-label="Workshop status">
        <span className="activity-pulse"><Radio size={12} /></span>
        <span className="activity-label">From the bench</span>
        <div className="activity-copy">
          <CheckCircle2 size={13} className="shrink-0 text-[#3d7a2f]" />
          <p>Every pack is hand-built, capacity-tested and shipped across Bangladesh.</p>
        </div>
      </aside>
    );
  }
  const current = entries[index % entries.length];

  return (
    <aside
      className="activity-ticker no-print"
      aria-label="Recent verified shop activity"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="activity-pulse"><Radio size={12} /></span>
      <span className="activity-label">Live from the bench</span>
      <div className="activity-copy" key={current.id} aria-live="polite">
        <CheckCircle2 size={13} className="shrink-0 text-[#3d7a2f]" />
        <p><strong>{current.customer}</strong> in {current.district} ordered {current.slug ? <Link href={`/product/${current.slug}`} className="underline decoration-volt-deep/60 underline-offset-2">{current.item}</Link> : current.item}<span className="activity-time"> · {timeAgo(current.createdAt)}</span></p>
      </div>
      <div className="activity-dots" aria-hidden="true">{entries.map((entry, entryIndex) => <i key={entry.id} data-active={entryIndex === index % entries.length} />)}</div>
    </aside>
  );
}
