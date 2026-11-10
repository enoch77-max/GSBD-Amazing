"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PackageSearch, ShoppingBag, Store } from "lucide-react";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/format";

export function MobileNav() {
  const pathname = usePathname();
  const cart = useCart();

  const hidden =
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/order/") ||
    pathname.startsWith("/product/");

  if (hidden) return null;

  const items = [
    { href: "/", label: "Home", icon: Home, active: pathname === "/" },
    {
      href: "/shop",
      label: "Shop",
      icon: Store,
      active: pathname === "/shop" || pathname.startsWith("/shop?"),
    },
    { href: "/track", label: "Track", icon: PackageSearch, active: pathname === "/track" },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="store-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bone lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "flex min-h-[3.4rem] flex-col items-center justify-center gap-0.5 text-[0.62rem] font-medium transition-colors",
              item.active ? "text-ink" : "text-muted",
            )}
          >
            <span className="store-nav-glyph relative">
              <item.icon size={20} strokeWidth={item.active ? 2.4 : 2} />

            </span>
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={cart.openCart}
          className="relative flex min-h-[3.4rem] flex-col items-center justify-center gap-0.5 text-[0.62rem] font-medium text-muted transition-colors"
          aria-label={`Open bag, ${cart.itemCount} items`}
        >
          <span className="store-nav-glyph relative">
            <ShoppingBag size={20} />
            {cart.hydrated && cart.itemCount > 0 && (
              <span
                key={`${cart.itemCount}-${cart.pulse}`}
                className="animate-badge-pop absolute -right-2 -top-1.5 grid min-w-[1.05rem] place-items-center rounded-full bg-volt px-1 font-mono text-[0.55rem] font-bold text-ink ring-2 ring-bone"
              >
                {cart.itemCount}
              </span>
            )}
          </span>
          Bag
        </button>
      </div>
    </nav>
  );
}
