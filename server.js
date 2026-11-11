/**
 * Arena preview server for the GSBD-Amazing storefront.
 *
 * The repository ships a Vite single-file SPA plus a standalone Node backend.
 * This lightweight server serves the built SPA, answers the platform health
 * check, and persists the admin-controlled pack recommendation rules in
 * PostgreSQL through Drizzle ORM. It intentionally has no dependency on the
 * full production backend (sessions, migrations, cron) so the preview boots in
 * any sandbox, with an in-memory fallback if PostgreSQL is unavailable.
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config();

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const DEFAULT_SETTINGS = {
  enabled: true,
  strategy: "smart",
  featuredSlug: "5a-active-balancer",
  badgeLabel: "RECOMMENDED",
  headline: "+{gain}% backup · +{life}% lifespan",
  detail: "Keeps all {series} groups matched while the pack works, so the weakest group stops cutting backup short and the pack ages evenly.",
  gainPct: 18,
  minSeries: 2,
  minParallel: 1,
  minEnergyWh: 30,
  chemistry: "any",
  scoreThreshold: 55,
  balanceWeight: 100,
  backupWeight: 100,
  protectionWeight: 100,
  pinnedBoost: 10,
  boostSlugs: [],
  hiddenSlugs: [],
  allowAddToPack: true,
  showScore: true,
};

const STRATEGIES = ["smart", "pinned", "off"];
const CHEMISTRIES = ["any", "li-ion", "lifepo4"];
const SLUGS = [
  "5a-active-balancer",
  "lipo-safe-fireproof-bag",
  "tp4056-type-c-charger-module",
  "30a-mppt-solar-charge-controller",
  "dc-dc-60v-12v-10a",
  "pure-sine-inverter-1kva-24v",
  "3s-20a-bms-balance",
  "daly-smart-bms-4s-40a",
  "jk-smart-bms-24s-200a",
];

function clamp(value, min, max, fallback) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
function text(value, fallback, max = 240) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}
function slugList(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((entry) => typeof entry === "string" && SLUGS.includes(entry)))].slice(0, 12);
}

/** Strict allow-list sanitizer — the browser and the Next.js route use the same rules. */
export function sanitizePackRecommendations(input) {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const d = DEFAULT_SETTINGS;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : d.enabled,
    strategy: STRATEGIES.includes(raw.strategy) ? raw.strategy : d.strategy,
    featuredSlug: SLUGS.includes(raw.featuredSlug) ? raw.featuredSlug : d.featuredSlug,
    badgeLabel: text(raw.badgeLabel, d.badgeLabel, 40),
    headline: text(raw.headline, d.headline, 180),
    detail: text(raw.detail, d.detail, 420),
    gainPct: clamp(raw.gainPct, 0, 60, d.gainPct),
    minSeries: clamp(raw.minSeries, 1, 24, d.minSeries),
    minParallel: clamp(raw.minParallel, 1, 12, d.minParallel),
    minEnergyWh: clamp(raw.minEnergyWh, 0, 10000, d.minEnergyWh),
    chemistry: CHEMISTRIES.includes(raw.chemistry) ? raw.chemistry : d.chemistry,
    scoreThreshold: clamp(raw.scoreThreshold, 0, 150, d.scoreThreshold),
    balanceWeight: clamp(raw.balanceWeight, 0, 200, d.balanceWeight),
    backupWeight: clamp(raw.backupWeight, 0, 200, d.backupWeight),
    protectionWeight: clamp(raw.protectionWeight, 0, 200, d.protectionWeight),
    pinnedBoost: clamp(raw.pinnedBoost, 0, 100, d.pinnedBoost),
    boostSlugs: slugList(raw.boostSlugs, d.boostSlugs),
    hiddenSlugs: slugList(raw.hiddenSlugs, d.hiddenSlugs),
    allowAddToPack: typeof raw.allowAddToPack === "boolean" ? raw.allowAddToPack : d.allowAddToPack,
    showScore: typeof raw.showScore === "boolean" ? raw.showScore : d.showScore,
  };
}

/* -------------------------------------------------------------------------- */
/* PostgreSQL via Drizzle ORM                                                 */
/* -------------------------------------------------------------------------- */
const packRecommendationSettings = pgTable("pack_recommendation_settings", {
  id: integer("id").primaryKey(),
  settings: jsonb("settings").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

let orm = null;
let pool = null;
let memorySettings = { ...DEFAULT_SETTINGS };

async function database() {
  if (orm) return orm;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    pool = new pg.Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 4000 });
    const candidate = drizzle(pool);
    await candidate.execute(sql`CREATE TABLE IF NOT EXISTS pack_recommendation_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      settings JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    orm = candidate;
    return orm;
  } catch (error) {
    console.warn("[gsbd] PostgreSQL unavailable, using in-memory recommendation rules:", error.message);
    orm = null;
    return null;
  }
}

async function readSettings() {
  const client = await database();
  if (!client) return { settings: memorySettings, persisted: "memory" };
  const rows = await client.select().from(packRecommendationSettings).where(eq(packRecommendationSettings.id, 1)).limit(1);
  return { settings: sanitizePackRecommendations(rows[0]?.settings ?? DEFAULT_SETTINGS), persisted: "postgres" };
}

async function writeSettings(input) {
  const settings = sanitizePackRecommendations(input);
  const client = await database();
  if (!client) {
    memorySettings = settings;
    return { settings, persisted: "memory" };
  }
  await client
    .insert(packRecommendationSettings)
    .values({ id: 1, settings, updatedAt: new Date() })
    .onConflictDoUpdate({ target: packRecommendationSettings.id, set: { settings, updatedAt: new Date() } });
  memorySettings = settings;
  return { settings, persisted: "postgres" };
}

/* -------------------------------------------------------------------------- */
/* Static files + JSON API                                                    */
/* -------------------------------------------------------------------------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2", ".map": "application/json; charset=utf-8",
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function bodyJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 100_000) throw new Error("Payload too large");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function serveStatic(req, res, pathname) {
  let html = null;
  const sendShell = async (status = 200) => {
    if (!html) {
      try {
        html = await readFile(path.join(DIST, "index.html"));
      } catch {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        res.end("Storefront build missing — run `npm run build`.");
        return;
      }
    }
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(html);
  };

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendShell(200);
  }
  const relative = decoded.replace(/^\/+/, "");
  const target = path.resolve(DIST, relative);
  if (relative && target.startsWith(DIST + path.sep)) {
    try {
      const info = await stat(target);
      if (info.isFile()) {
        const data = await readFile(target);
        res.writeHead(200, {
          "content-type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
          "content-length": data.length,
          "cache-control": path.extname(target) === ".html" ? "no-cache" : "public, max-age=3600",
        });
        res.end(data);
        return;
      }
    } catch {
      /* fall through to the SPA shell */
    }
  }
  return sendShell(200);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (pathname === "/api/health") {
    return json(res, 200, { ok: true, live: false, service: "gsbd-arena-preview", time: new Date().toISOString() });
  }

  if (pathname === "/api/pack-recommendations") {
    try {
      if (req.method === "GET") {
        const result = await readSettings();
        return json(res, 200, { ok: true, ...result });
      }
      if (req.method === "PUT" || req.method === "POST" || req.method === "PATCH") {
        const body = await bodyJson(req);
        const result = await writeSettings(body.settings ?? body);
        return json(res, 200, { ok: true, ...result });
      }
      res.setHeader("allow", "GET, PUT");
      return json(res, 405, { ok: false, error: "Method not allowed" });
    } catch (error) {
      return json(res, 400, { ok: false, error: error instanceof Error ? error.message : "Could not save settings" });
    }
  }

  if (pathname.startsWith("/api/")) return json(res, 404, { ok: false, error: "Not found" });
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    await serveStatic(req, res, pathname);
  } catch (error) {
    console.error("[gsbd] static error", error);
    if (!res.headersSent) json(res, 500, { ok: false, error: "Internal error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[gsbd] arena preview listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(async () => {
      if (pool) await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
