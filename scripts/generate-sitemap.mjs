/**
 * Generates public/sitemap.xml from the catalogue source so search and shopping
 * crawlers always see current URLs. Runs as part of `npm run build`.
 *
 * Slugs are read straight out of the seed module with a pattern match — the
 * catalogue is authored as TypeScript, and this keeps the script dependency-free.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const domain = process.env.STORE_DOMAIN ?? "glowingspacebd.com";
const base = `https://${domain}`;
const today = new Date().toISOString().slice(0, 10);
const source = readFileSync("src/db/seed-data.ts", "utf8");

const productSlugs = [...source.matchAll(/^\s{4}slug:\s*"([a-z0-9-]+)"/gm)].map((match) => match[1]);
const categorySlugs = [...source.matchAll(/^\s{4}slug:\s*"([a-z0-9-]+)",\n\s{4}name:/gm)].map((match) => match[1]);
const uniqueProducts = [...new Set(productSlugs)];
const uniqueCategories = [...new Set(categorySlugs)].filter((slug) => !uniqueProducts.includes(slug));

const statics = [
  { path: "/", priority: "1.0", freq: "daily" },
  { path: "/shop", priority: "0.9", freq: "daily" },
  { path: "/about", priority: "0.5", freq: "monthly" },
  { path: "/support", priority: "0.6", freq: "monthly" },
  { path: "/track", priority: "0.4", freq: "monthly" },
  { path: "/privacy", priority: "0.3", freq: "yearly" },
  { path: "/terms", priority: "0.3", freq: "yearly" },
  { path: "/refunds", priority: "0.4", freq: "yearly" },
  { path: "/pack-builder", priority: "0.8", freq: "monthly" },
  { path: "/help", priority: "0.6", freq: "monthly" },
  { path: "/help/battery-safety", priority: "0.7", freq: "monthly" },
  { path: "/help/shipping", priority: "0.7", freq: "monthly" },
  { path: "/help/warranty-returns", priority: "0.7", freq: "monthly" },
  { path: "/help/wholesale", priority: "0.6", freq: "monthly" },
];

const urls = [
  ...statics.map((entry) => ({ loc: `${base}${entry.path}`, priority: entry.priority, freq: entry.freq })),
  ...uniqueCategories.map((slug) => ({ loc: `${base}/shop?category=${slug}`, priority: "0.8", freq: "daily" })),
  ...uniqueProducts.map((slug) => ({ loc: `${base}/product/${slug}`, priority: "0.7", freq: "weekly" })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) =>
      `  <url>\n    <loc>${url.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${url.freq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

mkdirSync("public", { recursive: true });
writeFileSync("public/sitemap.xml", xml);
console.log(`sitemap.xml — ${uniqueProducts.length} products, ${uniqueCategories.length} categories, ${urls.length} URLs`);
