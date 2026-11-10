/**
 * The storefront references a handful of art-directed photography paths
 * (`/images/col-*.jpg`, `/images/lab.jpg`, `/images/pack-service.jpg`) that the
 * upstream repository never shipped. They are resolved here:
 *
 *  - `col-cells.jpg` is a committed asset and is inlined into the single-file build.
 *  - Other workshop images are shipped in public/images, so the UI does not
 *    disappear when an external image host is slow or unavailable.
 */
import colCells from "@/assets/images/col-cells.jpg";

export const MEDIA: Record<string, string> = {
  "/images/col-cells.jpg": colCells,
  "/images/col-circuits.jpg": "/images/col-circuits.jpg",
  "/images/col-diy.jpg": "/images/col-diy.jpg",
  "/images/col-packs.jpg": "/images/col-packs.jpg",
  "/images/col-power.jpg": "/images/col-power.jpg",
  "/images/lab.jpg": "/images/lab.jpg",
  "/images/pack-service.jpg": "/images/pack-service.jpg",
};

export function resolveAsset(src: string): string {
  if (!src) return src;
  const clean = src.split("?")[0];
  return MEDIA[clean] ?? src;
}

export function installAssetResolver() {
  globalThis.__gsbdAsset = resolveAsset;
}
