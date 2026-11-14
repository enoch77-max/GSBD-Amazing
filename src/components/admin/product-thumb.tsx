"use client";

/**
 * Product thumbnail with guaranteed fallback.
 *
 * Admin lists mix three image sources: bundled `/images/*` art, remote
 * photography (Pexels/Unsplash) and operator-entered URLs. In a sandbox or an
 * offline shop any of them can fail, which used to show a broken-image glyph in
 * the packing queue. This renders the resolved asset and swaps to the bundled
 * cells photo on error, so a row always shows real art.
 */
import { useEffect, useState } from "react";
import { resolveAsset } from "@/lib/media";
import colCells from "@/assets/images/col-cells.jpg";

export function ProductThumb({ src, alt = "", size = "md" }: { src?: string | null; alt?: string; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const initial = src ? resolveAsset(src) : "";

  useEffect(() => { setFailed(false); }, [src]);

  const className = size === "lg" ? "ax-thumb lg" : size === "sm" ? "ax-thumb sm" : "ax-thumb";
  return (
    <span className={className}>
      {initial && !failed ? (
        <img src={initial} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <img src={colCells} alt="" aria-hidden="true" />
      )}
    </span>
  );
}
