/**
 * Customer feature endpoints: real social proof, idempotent helpful votes and
 * authoritative custom-pack pricing.
 */
import { createHmac } from "node:crypto";
import { App, badRequest, notFound, rateLimit, sendJson, type Ctx } from "./http";
import { query, queryOne, tx } from "./db";
import { config } from "./config";
import { calculatePack, PACK_PRODUCT_SLUG, type CellId } from "../src/lib/pack-builder";

export function mountFeatures(app: App): void {
  app.get(
    "/api/activity",
    rateLimit({ limit: 60, windowMs: 60_000, key: (ctx) => `activity:${ctx.ip}` }),
    async (ctx: Ctx) => {
      /* Deliberately exposes only a first name, district and purchased item. */
      const rows = await query<{
        id: string;
        customer: string;
        district: string;
        item: string;
        slug: string | null;
        created_at: Date;
      }>(
        `SELECT o.order_number || '-' || i.id::text AS id,
          split_part(o.customer_name, ' ', 1) AS customer,
          o.district, i.name AS item, i.slug, o.created_at
         FROM orders o
         JOIN LATERAL (
           SELECT id, name, slug FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1
         ) i ON TRUE
         WHERE o.status IN ('confirmed','packing','shipped','delivered')
         ORDER BY o.created_at DESC LIMIT 12`,
      );
      sendJson(ctx, {
        entries: rows.map((row) => ({
          id: row.id,
          customer: row.customer,
          district: row.district,
          item: row.item,
          slug: row.slug?.startsWith("custom-pack-") ? null : row.slug,
          createdAt: row.created_at,
        })),
      });
    },
  );

  app.post(
    "/api/reviews/:id/helpful",
    rateLimit({ limit: 60, windowMs: 60 * 60_000, key: (ctx) => `vote:${ctx.ip}` }),
    async (ctx: Ctx) => {
      const reviewId = Number(ctx.params.id);
      if (!Number.isInteger(reviewId) || reviewId < 1) throw badRequest("Invalid review.");
      const body = (ctx.body && typeof ctx.body === "object" ? ctx.body : {}) as Record<string, unknown>;
      const voterKey = String(body.voterKey ?? "");
      if (voterKey.length < 20 || voterKey.length > 120) throw badRequest("Could not verify this browser. Reload and try again.");
      const review = await queryOne<{ id: number }>("SELECT id FROM reviews WHERE id = $1 AND visible = TRUE", [reviewId]);
      if (!review) throw notFound("Review not found.");

      /* Store an HMAC, never the browser identifier itself. */
      const voterHash = createHmac("sha256", config.sessionSecret).update(`review-vote:${voterKey}`).digest("hex");
      const helpfulCount = await tx(async (client) => {
        const inserted = await client.query(
          "INSERT INTO review_votes (review_id, voter_hash) VALUES ($1,$2) ON CONFLICT (review_id, voter_hash) DO NOTHING RETURNING id",
          [reviewId, voterHash],
        );
        if (inserted.rowCount === 1) {
          await client.query("UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1", [reviewId]);
        }
        const current = await client.query<{ helpful_count: number }>(
          "SELECT helpful_count FROM reviews WHERE id = $1",
          [reviewId],
        );
        return current.rows[0]?.helpful_count ?? 0;
      });
      sendJson(ctx, { ok: true, voted: true, helpfulCount });
    },
  );

  app.post(
    "/api/packs/price",
    rateLimit({ limit: 60, windowMs: 60_000, key: (ctx) => `pack-price:${ctx.ip}` }),
    async (ctx: Ctx) => {
      const body = (ctx.body && typeof ctx.body === "object" ? ctx.body : {}) as Record<string, unknown>;
      try {
        const rows = await query<{ slug: string; name: string; price: number; stock: number; images: unknown; category_slug: string }>(
          "SELECT slug, name, price, stock, images, category_slug FROM products WHERE visible = TRUE",
        );
        const products = rows.map((row) => ({
          slug: row.slug,
          name: row.name,
          price: row.price,
          stock: row.stock,
          images: Array.isArray(row.images) ? row.images : [],
          categorySlug: row.category_slug,
        }));
        const result = calculatePack(body.configuration ?? body, { products });
        sendJson(ctx, { ok: true, pack: result, currency: "BDT", pricedBy: "server" });
      } catch (error) {
        throw badRequest(error instanceof Error ? error.message : "Invalid pack configuration.");
      }
    },
  );
}
