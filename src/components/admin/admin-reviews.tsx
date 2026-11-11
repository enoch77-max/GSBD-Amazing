"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, MessageSquareText, Search, Star } from "lucide-react";
import { store } from "@/db/local-store";
import { useStoreVersion } from "@/lib/use-store";
import { audit, can } from "@/lib/ops";
import { Badge, Button, Empty, PageHead, Panel, ReadOnlyNote, Stat } from "./admin-ui";

export function AdminReviews({ toast }: { toast: (message: string) => void }) {
  useStoreVersion();
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<"all" | "low" | "5">("all");
  const [visibility, setVisibility] = useState<"all" | "visible" | "hidden">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const manage = can("reviews.moderate");
  const reviews = store.allReviews();
  const productName = (slug: string) => store.findAnyProduct(slug)?.name ?? slug;

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return reviews
      .filter((r) => rating === "all" || (rating === "low" ? r.rating <= 3 : r.rating === 5))
      .filter((r) => visibility === "all" || (visibility === "visible" ? r.visible : !r.visible))
      .filter((r) => !term || `${r.title} ${r.body} ${r.author} ${productName(r.productSlug)}`.toLowerCase().includes(term))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, query, rating, visibility]);

  const setVisible = (keys: string[], visible: boolean) => {
    keys.forEach((key) => store.setReviewVisible(key, visible));
    audit(visible ? "Published reviews" : "Hid reviews", `${keys.length} review${keys.length === 1 ? "" : "s"}`);
    setSelected([]);
    toast(visible ? "Reviews published" : "Reviews hidden from the storefront");
  };
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <>
      <PageHead title="Reviews" subtitle="Moderate what customers see. Hidden reviews stay on record and can be published again." />
      {!manage && <ReadOnlyNote />}
      <div className="adm-kpis">
        <Stat label="Average rating" value={avg.toFixed(2)} hint={`${reviews.length} reviews`} icon={<Star size={16} />} tone="amber" />
        <Stat label="Needs attention" value={String(reviews.filter((r) => r.rating <= 3 && r.visible).length)} hint="3★ or lower, visible" tone="rose" />
        <Stat label="Hidden" value={String(reviews.filter((r) => !r.visible).length)} hint="not shown to customers" />
      </div>
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
            <input className="adm-input pl-8" placeholder="Search reviews, authors or products…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search reviews" />
          </div>
          <div className="adm-segmented" role="group" aria-label="Rating filter">
            {([["all", "All ratings"], ["low", "≤ 3★"], ["5", "5★"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={rating === id} onClick={() => setRating(id)}>{label}</button>)}
          </div>
          <div className="adm-segmented" role="group" aria-label="Visibility filter">
            {([["all", "All"], ["visible", "Published"], ["hidden", "Hidden"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={visibility === id} onClick={() => setVisibility(id)}>{label}</button>)}
          </div>
        </div>
      </Panel>
      <Panel>
        {rows.length === 0 ? <Empty icon={<MessageSquareText size={20} />} title="No reviews match" /> : (
          <ul className="flex flex-col divide-y divide-[#efeff3]">
            {rows.map((review) => (
              <li key={review.key} className="flex gap-3 py-3 first:pt-0 last:pb-0" data-hidden={!review.visible}>
                {manage && <input type="checkbox" className="adm-checkbox mt-1" checked={selected.includes(review.key)} aria-label={`Select review by ${review.author}`} onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, review.key] : cur.filter((k) => k !== review.key)))} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#f59e0b]" aria-label={`${review.rating} stars`}>{"★".repeat(review.rating)}<span className="text-[#d1d1d6]">{"★".repeat(5 - review.rating)}</span></span>
                    <b className="text-[0.84rem]">{review.title}</b>
                    {!review.visible && <Badge>Hidden</Badge>}
                    {review.verified && <Badge tone="emerald">Verified</Badge>}
                  </div>
                  <p className="mt-1 text-[0.78rem] leading-relaxed text-[#3a3a3c]">{review.body}</p>
                  <p className="mt-1 text-[0.7rem] text-[#6e6e73]">{review.author} · {review.location} · {productName(review.productSlug)} · {new Date(review.createdAt).toLocaleDateString()}</p>
                </div>
                <Button size="sm" variant={review.visible ? "default" : "accent"} disabled={!manage} onClick={() => setVisible([review.key], !review.visible)}>
                  {review.visible ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Publish</>}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {selected.length > 0 && (
        <div className="adm-bulkbar" role="region" aria-label="Bulk review actions">
          <span className="text-[0.8rem] font-semibold">{selected.length} selected</span>
          <Button size="sm" onClick={() => setVisible(selected, false)}><EyeOff size={12} /> Hide</Button>
          <Button size="sm" variant="accent" onClick={() => setVisible(selected, true)}><Eye size={12} /> Publish</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}
    </>
  );
}
