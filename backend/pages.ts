/**
 * Serves the built storefront: static assets, uploaded product images, and the
 * SPA shell with per-route SEO meta injected from the live catalogue.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { App, safeJoin, sendText, serveFile, type Ctx } from "./http";
import { camel, queryOne } from "./db";
import { config } from "./config";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let template: string | null = null;
let templateMissing = false;

function loadTemplate(): string | null {
  if (template !== null) return template;
  if (templateMissing) return null;
  try {
    template = readFileSync(path.join(config.frontendDir, "index.html"), "utf8");
    return template;
  } catch {
    templateMissing = true;
    return null;
  }
}

type Meta = { title: string; description: string; image: string; canonical: string; jsonLd: string | null };

const metaCache = new Map<string, { at: number; meta: Meta }>();

async function metaFor(pathname: string, query: URLSearchParams): Promise<Meta> {
  const fallback: Meta = {
    title: "Glowing Space BD — Batteries, UPS & DIY electronics",
    description: "Capacity-tested 18650 and LiFePO4 cells, hand-built battery packs, BMS boards, router UPS and DIY electronics.",
    image: "",
    canonical: config.siteUrl,
    jsonLd: null,
  };
  const match = /^\/product\/([^/]+)$/.exec(pathname);
  const category = query.get("category");
  if (!match && !category) return fallback;

  const key = match ? `p:${match[1]}` : `c:${category}`;
  const cached = metaCache.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.meta;

  let meta = fallback;
  try {
    if (match) {
      const row = await queryOne<Record<string, never>>("SELECT * FROM products WHERE slug = $1 AND visible = TRUE", [
        decodeURIComponent(match[1]),
      ]);
      if (row) {
        const product = camel<Record<string, unknown>>(row as unknown as Record<string, never>);
        const images = Array.isArray(product.images) ? (product.images as string[]) : [];
        const image = images[0]?.startsWith("http") ? (images[0] as string) : images[0] ? `${config.siteUrl}${images[0]}` : "";
        const name = String(product.name ?? "Product");
        const description = String(product.shortDescription ?? fallback.description).slice(0, 300);
        meta = {
          title: `${name} · Glowing Space BD`,
          description,
          image,
          canonical: `${config.siteUrl}/product/${product.slug}`,
          jsonLd: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name,
            image: images,
            description,
            sku: String(product.sku ?? ""),
            brand: { "@type": "Brand", name: String(product.brand ?? "") },
            offers: {
              "@type": "Offer",
              priceCurrency: "BDT",
              price: product.price,
              availability: Number(product.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            },
          }),
        };
      }
    } else if (category) {
      const row = await queryOne<{ name: string; description: string; slug: string }>(
        "SELECT name, description, slug FROM categories WHERE slug = $1", [category],
      );
      if (row) {
        meta = {
          title: `${row.name} · Glowing Space BD`,
          description: row.description.slice(0, 300) || fallback.description,
          image: "",
          canonical: `${config.siteUrl}/shop?category=${row.slug}`,
          jsonLd: null,
        };
      }
    }
  } catch {
    /* SEO must never break page serving — fall back to the default tags. */
  }
  metaCache.set(key, { at: Date.now(), meta });
  return meta;
}

function inject(html: string, meta: Meta): string {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : "",
    meta.jsonLd ? `<script type="application/ld+json">${meta.jsonLd.replace(/</g, "\\u003c")}</script>` : "",
    `<script>window.__GSBD_LIVE__=true;window.__GSBD_BUILD__=${JSON.stringify(config.buildId)};</script>`,
  ].join("\n    ");
  /* Replace the static title so crawlers and tabs see exactly one. */
  const withoutTitle = html.replace(/<title>[\s\S]*?<\/title>/, "");
  if (withoutTitle.includes("</head>")) return withoutTitle.replace("</head>", `    ${tags}\n  </head>`);
  return `${tags}\n${withoutTitle}`;
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 4) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  try {
    if (statSync(root).isDirectory()) visit(root, 0);
  } catch {
    /* frontend not built yet — API still serves */
  }
  return out;
}

export function mountPages(app: App): void {
  /* Uploaded product images. */
  app.get("/uploads/:y/:m/:file", async (ctx: Ctx) => {
    const rel = `${ctx.params.y}/${ctx.params.m}/${ctx.params.file}`;
    if (!/^\d{4}\/\d{2}\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(rel)) {
      sendText(ctx, "Not found.", "text/plain; charset=utf-8", 404);
      return;
    }
    const file = safeJoin(config.uploadDir, rel);
    if (!file || !(await serveFile(ctx, file, { maxAge: 604800 }))) {
      sendText(ctx, "Not found.", "text/plain; charset=utf-8", 404);
    }
  });

  /* Every other built asset (hashed JS/CSS, icon, …). */
  for (const rel of walkFiles(config.frontendDir)) {
    if (rel === "index.html" || rel === "sitemap.xml" || rel === "robots.txt") continue;
    app.get(`/${rel}`, async (ctx: Ctx) => {
      const file = safeJoin(config.frontendDir, rel);
      if (!file || !(await serveFile(ctx, file, { immutable: rel.startsWith("assets/") }))) {
        sendText(ctx, "Not found.", "text/plain; charset=utf-8", 404);
      }
    });
  }

  /* The SPA shell for every page, with live catalogue meta. */
  app.fallback(async (ctx: Ctx) => {
    if (ctx.pathname.startsWith("/api/")) {
      sendText(ctx, JSON.stringify({ error: "Not found." }), "application/json; charset=utf-8", 404);
      return;
    }
    const html = loadTemplate();
    if (!html) {
      sendText(
        ctx,
        "Storefront is not built yet. Run `npm run build` and restart the server.",
        "text/plain; charset=utf-8",
        503,
      );
      return;
    }
    const meta = await metaFor(ctx.pathname, ctx.query);
    sendText(ctx, inject(html, meta), "text/html; charset=utf-8", 200, { "cache-control": "no-store" });
  });
}
