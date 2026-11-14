/**
 * Responsive image URLs for product photography.
 * Pexels and Unsplash serve transformable CDN URLs, so the card can request a
 * modern format at the exact width it renders. Local/bundled art is returned
 * untouched. Every consumer pairs this with a fixed aspect-ratio box, so images
 * never shift layout.
 */
const WIDTHS = [320, 480, 640, 960, 1280];

const isTransformable = (url: string) => /images\.(pexels|unsplash)\.com/.test(url);

/** Bundled `/images/*` art is inlined by the single-file build; keep that path. */
function local(src: string): string {
  const resolver = (globalThis as { __gsbdAsset?: (value: string) => string }).__gsbdAsset;
  return typeof resolver === "function" ? resolver(src) : src;
}

function withWidth(url: string, width: number, ratio = 4 / 3): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("w", String(width));
    if (/pexels/.test(parsed.hostname)) {
      parsed.searchParams.set("auto", "compress");
      parsed.searchParams.set("cs", "tinysrgb");
      parsed.searchParams.set("fm", "webp");
      parsed.searchParams.set("fit", "crop");
      parsed.searchParams.set("h", String(Math.round(width / ratio)));
    } else {
      parsed.searchParams.set("auto", "format");
      parsed.searchParams.set("fit", "crop");
      parsed.searchParams.set("h", String(Math.round(width / ratio)));
      parsed.searchParams.set("q", "78");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export type ResponsiveImage = { src: string; srcSet?: string; width: number; height: number; placeholder: boolean };

/** Returns a 4:3 image descriptor. `width` is the rendered width to request. */
export function productImage(url: string | null | undefined, width = 640, ratio = 4 / 3): ResponsiveImage {
  const raw = url?.trim() || "/images/col-cells.jpg";
  const src = local(raw);
  const height = Math.round(width / ratio);
  if (!isTransformable(src)) return { src, width, height, placeholder: !url };
  return {
    src: withWidth(src, width, ratio),
    srcSet: WIDTHS.map((w) => `${withWidth(src, w, ratio)} ${w}w`).join(", "),
    width,
    height,
    placeholder: false,
  };
}

export const productImageSizes = {
  card: "(max-width: 639px) 47vw, (max-width: 1023px) 31vw, (max-width: 1439px) 23vw, 300px",
  gallery: "(max-width: 1023px) 92vw, 560px",
  thumb: "72px",
  compare: "96px",
} as const;
