/**
 * Inventory accounting for made-to-order packs.
 *
 * A pack order reserves every real component it contains — cells, the matched
 * BMS, nickel and any ticked extras — inside the same transaction as the
 * order, using FOR UPDATE row locks so concurrent orders cannot oversell.
 */
import type { PoolClient } from "pg";
import { conflict } from "./http";
import { PACK_PRODUCT_SLUG, normalizePackConfiguration, type CellId } from "../src/lib/pack-builder";

type ResolvableComponent = { slug: string | null; qty: number; name: string; unitPrice?: number };

/** Locks and reserves every catalogue component used by one custom-pack line. */
export async function reservePackComponents(
  client: PoolClient,
  components: ResolvableComponent[],
  packQuantity: number,
): Promise<void> {
  for (const component of components) {
    if (!component.slug) continue;
    const required = component.qty * packQuantity;
    const found = await client.query<{ stock: number; visible: boolean; name: string; price: number }>(
      "SELECT stock, visible, name, price FROM products WHERE slug = $1 FOR UPDATE",
      [component.slug],
    );
    const product = found.rows[0];
    if (!product || !product.visible) {
      throw conflict(`${product ? "That component" : "A component for this pack"} is currently unavailable.`);
    }
    if (component.unitPrice !== undefined && product.price !== component.unitPrice) {
      throw conflict(`${product.name} changed price. Refresh your bag and review the updated total.`);
    }
    if (product.stock < required) {
      throw conflict(`${product.name}: this build needs ${required}, but only ${product.stock} are available. Adjust the configuration or contact the bench.`);
    }
    await client.query("UPDATE products SET stock = stock - $1 WHERE slug = $2", [required, component.slug]);
  }
}

/** Returns the real components of cancelled/expired packs to the shelf. */
export async function restorePackComponents(client: PoolClient, orderId: number): Promise<void> {
  const rows = await client.query<{ pack_spec: unknown; qty: number }>(
    "SELECT pack_spec, qty FROM order_items WHERE order_id = $1 AND pack_spec IS NOT NULL",
    [orderId],
  );
  const required = new Map<string, number>();
  for (const row of rows.rows) {
    const spec = typeof row.pack_spec === "string" ? JSON.parse(row.pack_spec) : row.pack_spec;
    const quantity = Math.max(1, Number(row.qty) || 1);
    const components: Array<{ slug?: string; qty?: number }> =
      spec && typeof spec === "object" && Array.isArray((spec as { components?: unknown }).components)
        ? ((spec as { components: Array<{ slug?: string; qty?: number }> }).components)
        : [];
    if (components.length) {
      for (const component of components) {
        if (typeof component.slug === "string") {
          required.set(component.slug, (required.get(component.slug) ?? 0) + Math.max(1, Number(component.qty) || 1) * quantity);
        }
      }
      continue;
    }
    /* Legacy rows without a component list: fall back to the cell count. */
    try {
      const config = normalizePackConfiguration(spec);
      const slug = PACK_PRODUCT_SLUG[config.cellId];
      required.set(slug, (required.get(slug) ?? 0) + config.series * config.parallel * quantity);
    } catch {
      /* A malformed historical row cannot be interpreted; leave stock unchanged. */
    }
  }
  for (const [slug, quantity] of required) {
    await client.query("UPDATE products SET stock = stock + $1 WHERE slug = $2", [quantity, slug]);
  }
}

export function packSourceSlug(cellId: CellId): string {
  return PACK_PRODUCT_SLUG[cellId];
}
