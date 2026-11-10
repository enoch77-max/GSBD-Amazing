"use client";

import { Heart } from "lucide-react";
import { useWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/format";

export function WishlistButton({ slug, className, label = true }: { slug: string; className?: string; label?: boolean }) {
  const wishlist = useWishlist();
  const saved = wishlist.isSaved(slug);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        wishlist.toggle(slug);
      }}
      aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={saved}
      className={cn(
        "wishlist-toggle grid size-9 place-items-center rounded-full border transition-all",
        saved ? "border-ember/40 bg-ember/10 text-ember" : "border-line bg-cream/95 text-muted hover:border-ink/30 hover:text-ink",
        className,
      )}
    >
      <Heart size={label ? 17 : 16} fill={saved ? "currentColor" : "none"} strokeWidth={saved ? 2.3 : 1.9} />
    </button>
  );
}
