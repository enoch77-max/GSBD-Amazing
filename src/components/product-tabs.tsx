"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Loader2,
  Package,
  ShieldCheck,
  Star,
  Truck,
  Wrench,
} from "lucide-react";
import type { Product, Review } from "@/db/schema";
import { cn, formatDate, initials } from "@/lib/format";
import { Stars } from "@/components/ui";
import { isLive, liveFetchProduct } from "@/lib/live";
import { STORE } from "@/lib/commerce";
import { ReviewVotes } from "@/components/review-votes";
import { visibleHighlights } from "@/lib/compatibility-tags";

const TABS = [
  { id: "overview", label: "Details" },
  { id: "specs", label: "Specs" },
  { id: "reviews", label: "Reviews" },
  { id: "delivery", label: "Delivery" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ProductTabs({
  product,
  reviews,
  categoryName,
}: {
  product: Product;
  reviews: Review[];
  categoryName?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  const [liveReviews, setLiveReviews] = useState<Review[] | null>(null);
  const shownReviews = isLive() ? (liveReviews ?? []) : reviews;

  useEffect(() => {
    if (!isLive()) return;
    let cancelled = false;
    void liveFetchProduct(product.slug)
      .then((payload) => { if (!cancelled) setLiveReviews(payload.reviews); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product.slug]);

  useEffect(() => {
    const openReviews = () => setTab("reviews");
    window.addEventListener("gsbd:open-reviews", openReviews);
    return () => window.removeEventListener("gsbd:open-reviews", openReviews);
  }, []);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ author: "", location: "", rating: 5, title: "", body: "" });
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const average = useMemo(() => {
    if (shownReviews.length === 0) return product.rating;
    return shownReviews.reduce((sum, review) => sum + review.rating, 0) / shownReviews.length;
  }, [shownReviews, product.rating]);

  const breakdown = useMemo(() => {
    return [5, 4, 3, 2, 1].map((star) => {
      const count = shownReviews.filter((review) => review.rating === star).length;
      return { star, count, percent: shownReviews.length ? Math.round((count / shownReviews.length) * 100) : 0 };
    });
  }, [shownReviews]);

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.author.trim() || !form.title.trim() || form.body.trim().length < 12) {
      setError("Add your name, a title and at least a sentence about the product.");
      return;
    }
    setStatus("saving");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, productSlug: product.slug }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
      setStatus("done");
      setFormOpen(false);
      setForm({ author: "", location: "", rating: 5, title: "", body: "" });
      if (isLive()) {
        try {
          const payload = await liveFetchProduct(product.slug);
          setLiveReviews(payload.reviews);
        } catch {
          /* the list refreshes on the next visit */
        }
      }
      router.refresh();
      setTab("reviews");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save your review.");
      setStatus("idle");
    }
  }

  return (
    <div id="overview" className="scroll-mt-3">
      <div role="tablist" aria-label="Product information" className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-cream p-1">
        {TABS.map((entry) => {
          const count =
            entry.id === "reviews" ? (product.reviewCount > 0 ? product.reviewCount : shownReviews.length) : null;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-selected={tab === entry.id}
              role="tab"
              className={cn(
                "tab-pill relative min-h-10 px-1 py-2 text-[0.76rem] font-medium sm:px-4 sm:text-[0.82rem]",
                tab === entry.id && "is-active",
              )}
            >
              {entry.label}
              {count ? <span className="ml-1 text-[0.6rem] opacity-60">{count}</span> : null}
              {tab === entry.id && (
                <span className="sr-only">Selected</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="py-4">
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h3 className="text-lg">Description</h3>
              <p className="mt-2 whitespace-pre-line text-[0.83rem] leading-relaxed text-muted">
                {product.description}
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {visibleHighlights(product.highlights).map((highlight) => (
                  <li
                    key={highlight}
                    className="flex items-start gap-2 rounded-xl border border-line-soft bg-cream px-3 py-2.5 text-[0.82rem]"
                  >
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-volt text-ink">
                      <Check size={10} strokeWidth={3} />
                    </span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
            <details className="self-start rounded-2xl border border-line bg-cream px-4">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[0.85rem] font-semibold">Product info <ChevronRight size={14} className="text-muted" /></summary>
              <dl className="mb-4 space-y-2.5 text-[0.82rem]">
                {[
                  ["SKU", product.sku],
                  ["Collection", categoryName ?? product.categorySlug],
                  ["Brand", product.brand],
                  ["Warranty", product.warrantyMonths > 0 ? `${product.warrantyMonths} month${product.warrantyMonths > 1 ? "s" : ""}` : "No warranty"],
                  ["Stock", product.stock > 0 ? `${product.stock} units on shelf` : "Restocking"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 border-b border-line-soft pb-2 last:border-0 last:pb-0">
                    <dt className="text-muted">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        )}

        {tab === "specs" && (
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full border-collapse text-left text-[0.85rem]">
              <caption className="sr-only">Technical specifications for {product.name}</caption>
              <tbody>
                {product.specs.map((spec, index) => (
                  <tr key={spec.label} className={index % 2 === 0 ? "bg-cream" : "bg-white"}>
                    <th scope="row" className="w-1/2 border-b border-line-soft px-4 py-3 font-medium text-muted">
                      {spec.label}
                    </th>
                    <td className="border-b border-line-soft px-4 py-3 font-medium">{spec.value}</td>
                  </tr>
                ))}
                <tr className="bg-cream">
                  <th scope="row" className="px-4 py-3 font-medium text-muted">Tested by</th>
                  <td className="px-4 py-3 font-medium">Glowing Space bench, Mirpur</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {tab === "reviews" && (
          <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <div className="rounded-2xl border border-line bg-cream p-4">
                <div className="flex items-end gap-3">
                  <p className="font-display text-4xl font-semibold leading-none">
                    {average.toFixed(1)}
                  </p>
                  <div className="pb-0.5">
                    <Stars rating={average} size={14} />
                    <p className="mt-1 text-[0.7rem] text-muted">
                      {shownReviews.length} review{shownReviews.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {breakdown.map((row) => (
                    <li key={row.star} className="flex items-center gap-2 text-[0.7rem] text-muted">
                      <span className="flex w-7 items-center gap-0.5">
                        {row.star}
                        <Star size={9} className="text-[#e6a63a]" fill="currentColor" strokeWidth={0} />
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <span
                          className="block h-full rounded-full bg-[#e6a63a]"
                          style={{ width: `${row.percent}%` }}
                        />
                      </span>
                      <span className="w-5 text-right font-mono text-[0.62rem]">{row.count}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setFormOpen((value) => !value)}
                  className="btn btn-outline btn-sm mt-4 w-full"
                >
                  {formOpen ? "Close review form" : "Write a review"}
                </button>
              </div>

              {formOpen && (
                <form
                  onSubmit={submitReview}
                  className="animate-slide-up mt-3 rounded-2xl border border-line bg-cream p-4"
                >
                  <p className="text-[0.85rem] font-semibold">Write a review</p>
                  <div className="mt-2 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setForm((value) => ({ ...value, rating: star }))}
                        aria-label={`${star} star${star > 1 ? "s" : ""}`}
                        className="p-1.5"
                      >
                        <Star
                          size={24}
                          className={star <= form.rating ? "text-[#e6a63a]" : "text-line"}
                          fill={star <= form.rating ? "currentColor" : "none"}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    <input
                      value={form.author}
                      onChange={(event) => setForm((value) => ({ ...value, author: event.target.value }))}
                      placeholder="Your name"
                      aria-label="Your name"
                      className="field py-2 text-[0.82rem]"
                    />
                    <input
                      value={form.location}
                      onChange={(event) => setForm((value) => ({ ...value, location: event.target.value }))}
                      placeholder="City / area (optional)"
                      aria-label="City or area"
                      className="field py-2 text-[0.82rem]"
                    />
                  </div>
                  <input
                    value={form.title}
                    onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                    placeholder="Review title"
                    aria-label="Review title"
                    className="field mt-2 py-2 text-[0.82rem]"
                  />
                  <textarea
                    value={form.body}
                    onChange={(event) => setForm((value) => ({ ...value, body: event.target.value }))}
                    placeholder="What did you build with it? How did it test?"
                    aria-label="Review details"
                    rows={3}
                    className="field mt-2 resize-none text-[0.82rem]"
                  />
                  {error && <p className="mt-2 text-[0.72rem] text-ember">{error}</p>}
                  {status === "done" && (
                    <p className="mt-2 flex items-center gap-1 text-[0.72rem] text-[#3d7a2f]">
                      <Check size={12} /> Thanks — your review is live.
                    </p>
                  )}
                  <button type="submit" disabled={status === "saving"} className="btn btn-primary btn-sm mt-3 w-full">
                    {status === "saving" ? <Loader2 size={14} className="animate-spin" /> : "Publish review"}
                  </button>
                </form>
              )}
            </div>

            <ul className="space-y-3">
              {shownReviews.length === 0 && (
                <li className="rounded-2xl border border-dashed border-line bg-cream px-5 py-10 text-center">
                  <p className="text-[0.9rem] font-semibold">No reviews yet</p>
                  <p className="mt-1 text-[0.8rem] text-muted">Be the first to review this product.</p>
                </li>
              )}
              {shownReviews.map((review) => (
                <li key={review.id} className="rounded-2xl border border-line-soft bg-cream p-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-9 place-items-center rounded-full bg-ink font-mono text-[0.65rem] text-volt">
                        {initials(review.author)}
                      </span>
                      <div>
                        <p className="text-[0.82rem] font-semibold">{review.author}</p>
                        <p className="text-[0.68rem] text-muted">
                          {review.location} · {formatDate(review.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Stars rating={review.rating} size={12} />
                  </div>
                  <p className="mt-3 text-[0.86rem] font-semibold">{review.title}</p>
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{review.body}</p>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    {review.verified ? (
                      <p className="inline-flex items-center gap-1 rounded-full bg-volt/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-[#4a6b1f]">
                        <BadgeCheck size={10} /> Verified buyer
                      </p>
                    ) : <span />}
                    <ReviewVotes reviewId={review.id} initialCount={(review as Review & { helpfulCount?: number }).helpfulCount ?? 0} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "delivery" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: Truck,
                title: "Delivery",
                points: [
                  "Dhaka: ৳80 · 1–2 days. Same-day: ৳150.",
                  "Outside Dhaka: ৳130 · 2–4 days.",
                  "Free standard delivery over ৳2,500.",
                  "Protective packaging for cells and packs.",
                ],
              },
              {
                icon: ShieldCheck,
                title: "Warranty",
                points: [
                  product.warrantyMonths > 0
                    ? `${product.warrantyMonths}-month workshop warranty covering manufacturing faults.`
                    : "Consumables and modules are not covered by warranty.",
                  "Eligible faults are repaired or replaced.",
                  "Excludes water, physical damage and modifications.",
                  "Contact us with your order ID before returning an item.",
                ],
              },
              {
                icon: Package,
                title: "Returns",
                points: [
                  "14 days to return unopened cells, modules and tools.",
                  "Custom-built packs are made to order and cannot be returned unless faulty.",
                  "Refunds go back to bKash, Nagad or your card within 3–5 working days.",
                ],
              },
              {
                icon: Wrench,
                title: "Product support",
                points: [
                  "Wiring and BMS advice on WhatsApp.",
                  "Walk-in testing for cells and packs at our Mirpur counter.",
                  "Wholesale prices available on request.",
                ],
              },
            ].map((block) => (
              <div key={block.title} className="rounded-2xl border border-line bg-cream p-4">
                <p className="flex items-center gap-2 text-[0.9rem] font-semibold">
                  <span className="grid size-8 place-items-center rounded-lg bg-ink text-volt">
                    <block.icon size={15} />
                  </span>
                  {block.title}
                </p>
                <ul className="mt-3 space-y-2">
                  {block.points.map((point) => (
                    <li key={point} className="flex gap-2 text-[0.8rem] leading-relaxed text-muted">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-volt-deep" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
