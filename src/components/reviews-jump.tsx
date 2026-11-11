"use client";

import { Stars } from "@/components/ui";

export function ReviewsJump({
  rating,
  reviewCount,
}: {
  rating: number;
  reviewCount: number;
}) {
  return (
    <a
      href="#overview"
      onClick={(event) => {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("gsbd:open-reviews"));
        /* Scroll after the reviews tab has rendered so the target is measured in its final layout. */
        window.requestAnimationFrame(() => document.getElementById("overview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }}
      className="flex items-center gap-1.5"
      aria-label="Jump to reviews"
    >
      <Stars rating={rating} size={14} showValue count={reviewCount} />
    </a>
  );
}
