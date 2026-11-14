"use client";

/**
 * Reviews — a moderation queue, not a report. Each row carries only what a
 * decision needs: the product, the rating, the snippet, whether the buyer is
 * verified, and a publish switch you can thumb on a phone.
 */
import { useMemo, useState } from "react";
import { BadgeCheck, Flag, MessageSquareText, Search, Star } from "lucide-react";
import { store } from "@/db/local-store";
import { useStoreVersion } from "@/lib/use-store";
import { audit, can, flagReview, replyToReview, reviewMeta } from "@/lib/ops";
import { ActionMenu } from "./action-menu";
import { ProductThumb } from "./product-thumb";
import { Badge, Empty, PageHead, Panel, ReadOnlyNote } from "./admin-ui";

export function AdminReviews({ toast }: { toast: (message: string) => void }) {
  useStoreVersion();
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "hidden" | "flagged">("all");
  const [replyKey, setReplyKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const manage = can("reviews.moderate");

  const reviews = useMemo(() => { void version; return store.allReviews(); }, [version]);
  const bump = () => setVersion((value) => value + 1);
  const product = (slug: string) => store.findAnyProduct(slug);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return reviews
      .filter((review) => {
        const meta = opsMeta(review.key);
        if (filter === "published" && !review.visible) return false;
        if (filter === "hidden" && review.visible) return false;
        if (filter === "flagged" && !meta.flagged) return false;
        return !term || `${review.title} ${review.body} ${review.author} ${product(review.productSlug)?.name ?? ""}`.toLowerCase().includes(term);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, query, filter]);

  const pending = rows.filter((review) => !review.visible).length;
  const avg = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;

  const toggle = (key: string, visible: boolean, name: string) => {
    store.setReviewVisible(key, visible);
    audit(visible ? "Published review" : "Hid review", key, name);
    bump();
    toast(visible ? "Review published to the storefront" : "Review hidden from the storefront");
  };

  const saveReply = (key: string) => {
    replyToReview(key, draft);
    setReplyKey(null);
    setDraft("");
    bump();
    toast(draft.trim() ? "Reply published under the review" : "Reply removed");
  };

  return (
    <>
      <PageHead
        title="Reviews"
        subtitle={`${reviews.length} reviews · ${avg.toFixed(2)}★ average${pending ? ` · ${pending} awaiting a decision` : ""}`}
      />
      {!manage && <ReadOnlyNote />}

      <Panel>
        <div className="flex flex-col gap-3">
          <div className="ax-seg wrap" role="tablist" aria-label="Review filter">
            {([["all", `All · ${reviews.length}`], ["published", `Published · ${reviews.filter((review) => review.visible).length}`], ["hidden", `Hidden · ${reviews.filter((review) => !review.visible).length}`], ["flagged", "Flagged"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} data-active={filter === id} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--adm-faint)]" />
            <input className="adm-input pl-9" placeholder="Search reviews, authors or products…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search reviews" />
          </div>
        </div>
      </Panel>

      {rows.length === 0 ? (
        <Panel><Empty icon={<MessageSquareText size={22} />} title="Nothing in this queue" body="Reviews appear here the moment a customer posts one." /></Panel>
      ) : (
        <ul className="ax-review-list">
          {rows.map((review) => {
            const meta = opsMeta(review.key);
            const item = product(review.productSlug);
            const open = replyKey === review.key;
            return (
              <li key={review.key} className="ax-review" data-hidden={!review.visible} data-flagged={meta.flagged || undefined}>
                <div className="ax-review-main">
                  <ProductThumb src={item?.images?.[0] ?? null} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="ax-caption truncate">{item?.name ?? review.productSlug}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="ax-stars" aria-label={`${review.rating} out of 5 stars`}>
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star key={index} size={13} className={index < review.rating ? "is-on" : "is-off"} fill={index < review.rating ? "currentColor" : "none"} />
                        ))}
                      </span>
                      {review.verified && <span className="ax-verified" title="Verified buyer"><BadgeCheck size={13} /> Verified</span>}
                      {meta.flagged && <Badge tone="rose">Flagged</Badge>}
                    </div>
                    <p className="ax-body mt-1 font-medium leading-snug">{review.title}</p>
                    <p className="ax-caption line-clamp-2">{review.body}</p>
                    <p className="ax-caption mt-1">— {review.author}, {review.location} · {new Date(review.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                    {meta.reply && (
                      <p className="ax-reply"><b>Your reply</b>{meta.reply}</p>
                    )}
                  </div>
                </div>

                <div className="ax-review-actions">
                  <label className="ax-publish">
                    <span className="ax-caption">{review.visible ? "Published" : "Hidden"}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={review.visible}
                      aria-label={`${review.visible ? "Hide" : "Publish"} review by ${review.author}`}
                      className="ax-switch-lg"
                      data-on={review.visible}
                      disabled={!manage}
                      onClick={() => toggle(review.key, !review.visible, review.author)}
                    >
                      <span />
                    </button>
                  </label>
                  <ActionMenu
                    label={`Actions for review by ${review.author}`}
                    items={[
                      { label: meta.reply ? "Edit reply" : "Reply", icon: <MessageSquareText size={15} />, disabled: !manage, onClick: () => { setReplyKey(open ? null : review.key); setDraft(meta.reply ?? ""); } },
                      { label: meta.flagged ? "Clear flag" : "Flag for review", icon: <Flag size={15} />, disabled: !manage, onClick: () => { flagReview(review.key, !meta.flagged); bump(); toast(meta.flagged ? "Flag cleared" : "Review flagged"); } },
                      { label: review.visible ? "Hide from storefront" : "Publish to storefront", icon: <BadgeCheck size={15} />, disabled: !manage, onClick: () => toggle(review.key, !review.visible, review.author) },
                    ]}
                  />
                </div>

                {open && (
                  <div className="ax-reply-editor">
                    <textarea className="adm-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={400} rows={3}
                      placeholder="Thanks for the detailed feedback — we are sending a replacement BMS today…" aria-label="Reply to review" />
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="adm-btn" data-variant="primary" data-size="sm" onClick={() => saveReply(review.key)}>Publish reply</button>
                      <button type="button" className="adm-btn" data-size="sm" onClick={() => { setReplyKey(null); setDraft(""); }}>Cancel</button>
                      <span className="ax-caption ml-auto">{draft.length}/400</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Metadata lives in ops; read it without re-subscribing for every card. */
function opsMeta(key: string) {
  return reviewMeta(key);
}
