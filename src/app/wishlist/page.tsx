"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, ShoppingBag, Trash2 } from "lucide-react";
import { useWishlist } from "@/lib/wishlist";
import { readAllProducts } from "@/lib/queries";
import { useCart } from "@/lib/cart";
import { useStoreVersion } from "@/lib/use-store";
import { formatBDT } from "@/lib/format";
import { WishlistButton } from "@/components/wishlist-button";

export default function WishlistPage() {
  useStoreVersion();
  const wishlist = useWishlist();
  const cart = useCart();
  const products = readAllProducts();
  const saved = wishlist.slugs.map((slug) => products.find((product) => product.slug === slug)).filter((product) => product !== undefined);

  function moveToCart(slug: string) {
    const product = products.find((entry) => entry.slug === slug);
    if (!product || product.stock <= 0) return;
    cart.addItem({ id: product.id, slug: product.slug, name: product.name, brand: product.brand, price: product.price, image: product.images[0] ?? "/images/col-cells.jpg", stock: product.stock });
    wishlist.remove(slug);
  }

  return (
    <div className="shell py-6 sm:py-9">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="eyebrow text-muted">Saved for another build</p>
          <h1 className="mt-1 text-[1.8rem] sm:text-[2.2rem]">Your wishlist</h1>
          <p className="mt-1 text-[0.8rem] text-muted">{wishlist.hydrated ? `${saved.length} ${saved.length === 1 ? "product" : "products"} saved on this device` : "Loading saved products…"}</p>
        </div>
        {saved.length > 0 && <Link href="/shop" className="inline-flex items-center gap-1 text-xs font-semibold">Keep browsing <ArrowRight size={13} /></Link>}
      </div>

      {!wishlist.hydrated ? <div className="py-16 text-center text-sm text-muted">Loading your wishlist…</div> : saved.length === 0 ? (
        <section className="wishlist-empty">
          <span><Heart size={30} /></span>
          <h2>Your next build starts here</h2>
          <p>Tap the heart on any cell, BMS or tool. Saved products stay on this device, even after you close the browser.</p>
          <Link href="/shop" className="btn btn-primary">Explore the catalogue <ArrowRight size={14} /></Link>
        </section>
      ) : (
        <div className="wishlist-list">
          {saved.map((product) => {
            const soldOut = product.stock <= 0;
            const inCart = cart.lines.some((line) => line.slug === product.slug);
            return (
              <article key={product.slug} className="wishlist-row">
                <Link href={`/product/${product.slug}`} className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-line-soft bg-bone sm:size-32">
                  <Image src={product.images[0] ?? "/images/col-cells.jpg"} alt={product.name} fill sizes="128px" className="object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">{product.brand}</p>
                  <Link href={`/product/${product.slug}`} className="mt-1 block text-[0.9rem] font-semibold leading-snug hover:underline sm:text-base">{product.name}</Link>
                  <p className="mt-1.5 text-[1rem] font-bold">{formatBDT(product.price)}</p>
                  <p className={`mt-1 text-[0.68rem] ${soldOut ? "text-ember" : "text-[#3d7a2f]"}`}>{soldOut ? "Currently out of stock" : `${product.stock} in stock`}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={soldOut} onClick={() => moveToCart(product.slug)} className="btn btn-primary btn-sm gap-1.5 disabled:opacity-45">
                      <ShoppingBag size={13} /> {inCart ? "Add another to cart" : "Move to cart"}
                    </button>
                    <button type="button" onClick={() => wishlist.remove(product.slug)} className="btn btn-outline btn-sm gap-1.5"><Trash2 size={13} /> Remove</button>
                  </div>
                </div>
                <WishlistButton slug={product.slug} className="shrink-0" />
              </article>
            );
          })}
          <div className="flex justify-end border-t border-line pt-3">
            <button type="button" className="text-xs font-medium text-muted hover:text-ember" onClick={wishlist.clear}>Clear wishlist</button>
          </div>
        </div>
      )}
    </div>
  );
}
