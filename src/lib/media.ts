/**
 * The storefront references a handful of art-directed photography paths
 * (`/images/col-*.jpg`, `/images/lab.jpg`, `/images/pack-service.jpg`) that the
 * upstream repository never shipped. They are resolved here:
 *
 *  - `col-cells.jpg` is a committed asset and is inlined into the single-file build.
 *  - Other workshop images are shipped in public/images, so the UI does not
 *    disappear when an external image host is slow or unavailable.
 *
 * Arena preview: only `dist/index.html` is served there, so a plain
 * `/images/*` URL has nothing behind it and would fall back to the placeholder
 * art. Every public image the UI actually references is therefore also imported
 * through Vite, which inlines it into the single-file build. The originals stay
 * in public/images untouched, so the backend / VPS deployment keeps serving them
 * as regular static files too.
 */
import colCells from "@/assets/images/col-cells.jpg";
import colCircuits from "../../public/images/col-circuits.jpg";
import colDiy from "../../public/images/col-diy.jpg";
import colPacks from "../../public/images/col-packs.jpg";
import colPower from "../../public/images/col-power.jpg";
import lab from "../../public/images/lab.jpg";
import packService from "../../public/images/pack-service.jpg";
import packSolarIllustration from "../../public/images/pack-solar-illustration.svg";
import packConverterIllustration from "../../public/images/pack-converter-illustration.svg";

export const MEDIA: Record<string, string> = {
  "/images/col-cells.jpg": colCells,
  "/images/col-circuits.jpg": colCircuits,
  "/images/col-diy.jpg": colDiy,
  "/images/col-packs.jpg": colPacks,
  "/images/col-power.jpg": colPower,
  "/images/lab.jpg": lab,
  "/images/pack-service.jpg": packService,
  // Pack-builder accessory art (src/components/pack-builder/pack-suggestions.tsx).
  "/images/pack-solar-illustration.svg": packSolarIllustration,
  "/images/pack-converter-illustration.svg": packConverterIllustration,
};

export function resolveAsset(src: string): string {
  if (!src) return src;
  const clean = src.split("?")[0];
  return MEDIA[clean] ?? src;
}

export function installAssetResolver() {
  globalThis.__gsbdAsset = resolveAsset;
}
