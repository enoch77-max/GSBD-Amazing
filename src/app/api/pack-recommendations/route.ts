/**
 * App Router counterpart of the arena preview endpoint. Keeps the original
 * Next.js + Drizzle deployment in sync with the Vite preview server.
 */
import { db } from "@/db";
import { packRecommendationSettings } from "@/db/schema";
import { DEFAULT_PACK_RECOMMENDATIONS, sanitizePackRecommendations } from "@/lib/pack-recommendations";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function ensureTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS pack_recommendation_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

export async function GET() {
  try {
    await ensureTable();
    const [row] = await db.select().from(packRecommendationSettings).where(eq(packRecommendationSettings.id, 1)).limit(1);
    return Response.json({ ok: true, settings: sanitizePackRecommendations(row?.settings ?? DEFAULT_PACK_RECOMMENDATIONS), persisted: "postgres" });
  } catch {
    return Response.json({ ok: true, settings: DEFAULT_PACK_RECOMMENDATIONS, persisted: "memory" });
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body && typeof body === "object" && "settings" in body ? (body as { settings: unknown }).settings : body;
  const settings = sanitizePackRecommendations(input);
  try {
    await ensureTable();
    await db
      .insert(packRecommendationSettings)
      .values({ id: 1, settings, updatedAt: new Date() })
      .onConflictDoUpdate({ target: packRecommendationSettings.id, set: { settings, updatedAt: new Date() } });
    return Response.json({ ok: true, settings, persisted: "postgres" });
  } catch {
    return Response.json({ ok: true, settings, persisted: "memory" });
  }
}
