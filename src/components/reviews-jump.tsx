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
        document.getElementById("overview")?.scrollIntoView({ behavior: "smooth" });
      }}
      className="flex items-center gap-1.5"
      aria-label="Jump to reviews"
    >
      <Stars rating={rating} size={14} showValue count={reviewCount} />
    </a>
  );
}
