import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartDrawer, CartToast } from "@/components/cart-drawer";
import { MobileNav } from "@/components/mobile-nav";
import { StorefrontMain } from "@/components/storefront-main";
import { ConsentBanner } from "@/components/consent-banner";
import { WishlistProvider } from "@/lib/wishlist";
import "./features.css";

export const metadata: Metadata = {
  title: {
    default: "Glowing Space BD — Batteries, UPS & DIY electronics",
    template: "%s · Glowing Space BD",
  },
  description:
    "Shop 18650 and LiFePO4 cells, battery packs, BMS, UPS and DIY electronics. Prices in BDT, nationwide delivery and cash on delivery.",
  keywords: [
    "18650 Bangladesh",
    "LiFePO4 battery Dhaka",
    "battery pack builder BD",
    "BMS board Bangladesh",
    "electronics components Dhaka",
    "mini UPS router BD",
  ],
  openGraph: {
    title: "Glowing Space BD — Batteries, UPS & DIY electronics",
    description:
      "Capacity-tested cells, hand-built battery packs, BMS boards, UPS systems and maker parts. Built in Mirpur, shipped across Bangladesh.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap"
      />
      <CartProvider>
        <WishlistProvider>
          <a href="#content" className="sr-only z-[100] rounded-lg bg-volt px-4 py-3 font-semibold text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
          <SiteHeader />
          <StorefrontMain>{children}</StorefrontMain>
          <SiteFooter />
          <MobileNav />
          <CartDrawer />
          <CartToast />
          <ConsentBanner />
        </WishlistProvider>
      </CartProvider>
    </>
  );
}
