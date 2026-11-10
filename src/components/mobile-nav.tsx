"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BatteryCharging, Heart, Home, ShoppingBag, Store } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/format";

export function MobileNav() {
  const pathname = usePathname();
  const cart = useCart();
  const wishlist = useWishlist();
  const hidden = pathname.startsWith("/checkout") || pathname.startsWith("/order/");
  if (hidden) return null;

  const items = [
    { href: "/", label: "Home", icon: Home, active: pathname === "/" },
    { href: "/shop", label: "Shop", icon: Store, active: pathname === "/shop" || pathname.startsWith("/product/") },
    { href: "/pack-builder", label: "Pack Builder", icon: BatteryCharging, active: pathname === "/pack-builder" },
    { href: "/wishlist", label: "Wishlist", icon: Heart, active: pathname === "/wishlist", count: wishlist.hydrated ? wishlist.count : 0 },
  ];

  return (
    <nav aria-label="Mobile navigation" className="store-mobile-nav no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bone lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="grid grid-cols-5">
        {items.map((item) => (
          <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={cn("flex min-h-[3.6rem] flex-col items-center justify-center gap-0.5 px-0.5 text-[0.56rem] font-medium transition-colors", item.active ? "text-ink" : "text-muted")}>
            <span className="store-nav-glyph relative">
              <item.icon size={19} strokeWidth={item.active ? 2.4 : 1.9} />
              {Boolean(item.count) && <span className="animate-badge-pop absolute -right-2 -top-1.5 grid min-w-[1rem] place-items-center rounded-full bg-ember px-1 font-mono text-[0.52rem] font-bold text-white ring-2 ring-bone">{item.count}</span>}
            </span>
            {item.label}
          </Link>
        ))}
        <button type="button" onClick={cart.openCart} className="relative flex min-h-[3.6rem] flex-col items-center justify-center gap-0.5 text-[0.56rem] font-medium text-muted" aria-label={`Open cart, ${cart.itemCount} items`}>
          <span className="store-nav-glyph relative">
            <ShoppingBag size={19} />
            {cart.hydrated && cart.itemCount > 0 && <span key={`${cart.itemCount}-${cart.pulse}`} className="animate-badge-pop absolute -right-2 -top-1.5 grid min-w-[1rem] place-items-center rounded-full bg-volt px-1 font-mono text-[0.52rem] font-bold text-ink ring-2 ring-bone">{cart.itemCount}</span>}
          </span>
          Cart
        </button>
      </div>
    </nav>
  );
}
