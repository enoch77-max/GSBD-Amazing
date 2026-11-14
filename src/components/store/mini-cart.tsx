"use client";

/**
 * Sticky mini-cart. Shows the real bag contents and the real free-delivery
 * threshold from STORE. Quantity changes are one tap each, using the existing
 * cart API — no new cart behaviour.
 */
import { useCart } from "@/lib/cart";
import { STORE } from "@/lib/commerce";
import { formatBDT } from "@/lib/format";
import { Glyph } from "./store-visuals";

export function MiniCart({ hidden = false }: { hidden?: boolean }) {
  const cart = useCart();
  const remaining = Math.max(0, STORE.freeShippingThreshold - cart.subtotal);
  const progress = Math.min(1, cart.subtotal / STORE.freeShippingThreshold);
  const show = cart.hydrated && cart.itemCount > 0 && !cart.isOpen && !hidden;

  return (
    <div className="pq pq-mini" data-hidden={show ? undefined : "true"} aria-hidden={show ? undefined : true}>
      <span className="pq-mini-stack" aria-hidden="true">
        {cart.lines.slice(0, 3).map((line, index) => (
          <img key={line.slug} src={line.image} alt="" width={32} height={32} loading="lazy" style={{ zIndex: 3 - index }} />
        ))}
      </span>
      <span className="pq-mini-body">
        <span className="pq-mini-line">
          <b>{cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</b>
          <span className="text-white/60">·</span>
          <b>{formatBDT(cart.subtotal)}</b>
        </span>
        <span className="pq-mini-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progress to free delivery">
          <i style={{ transform: `scaleX(${progress.toFixed(3)})` }} />
        </span>
        <span className="pq-mini-note">
          {remaining > 0 ? `${formatBDT(remaining)} more for free delivery` : "Free standard delivery unlocked"}
        </span>
      </span>
      <button type="button" className="pq-mini-cta" onClick={cart.openCart}>
        <Glyph name="bag" size={15} /> View bag
      </button>
    </div>
  );
}
