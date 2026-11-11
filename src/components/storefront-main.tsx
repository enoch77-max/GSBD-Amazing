"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DesktopCategorySidebar } from "@/components/desktop-category-sidebar";

const SIDEBAR_PATHS = new Set(["/", "/shop", "/wishlist", "/track", "/support", "/about", "/help", "/privacy", "/terms", "/refunds"]);

/** Adds the desktop category rail without changing mobile or focused flows. */
export function StorefrontMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const withSidebar = SIDEBAR_PATHS.has(pathname) || pathname.startsWith("/product/") || pathname.startsWith("/help/");

  if (!withSidebar) return <main id="content">{children}</main>;

  return (
    <div className="storefront-with-sidebar shell lg:flex lg:items-start lg:gap-5 xl:gap-6">
      <DesktopCategorySidebar />
      <main id="content" className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
