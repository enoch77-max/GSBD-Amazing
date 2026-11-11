"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowRight, Battery, BatteryCharging, CircuitBoard, Cpu, Headphones, Heart,
  LayoutGrid, MapPin, Package, ShieldCheck, Store, Truck, Wrench, Zap,
} from "lucide-react";
import { NAV_CATEGORIES, SUPPORT_LINKS } from "@/lib/nav";
import { STORE } from "@/lib/commerce";
import { cn } from "@/lib/format";

const categoryIcons = [Battery, Package, Cpu, Zap, CircuitBoard, Wrench];
const quickIcons = [Truck, Headphones, ShieldCheck, MapPin];

/** Desktop category rail shared by the storefront pages. */
export function DesktopCategorySidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = pathname === "/shop" ? searchParams.get("category") : null;

  return (
    <aside className="desktop-category-sidebar no-print sticky top-40 mt-3 hidden max-h-[calc(100dvh-11rem)] w-60 shrink-0 self-start overflow-y-auto pb-3 sm:mt-5 lg:block xl:w-64" aria-label="Categories and quick links">
      <section className="rounded-2xl border border-line bg-cream p-3 shadow-[var(--shadow-card)]">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-1.5 text-[0.82rem] font-semibold"><LayoutGrid size={15} /> Shop by category</h2>
          <Link href="/shop" className="text-[0.65rem] font-semibold text-muted hover:text-ink">View all</Link>
        </div>
        <nav aria-label="Product categories" className="space-y-0.5">
          <Link href="/shop" className={cn("flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 text-[0.78rem] font-semibold", pathname === "/shop" && !activeCategory ? "bg-ink text-cream" : "hover:bg-bone")}>
            <Store size={16} className="shrink-0" /> All products <ArrowRight size={13} className="ml-auto opacity-60" />
          </Link>
          {NAV_CATEGORIES.map((category, index) => {
            const Icon = categoryIcons[index];
            const active = activeCategory === category.slug;
            return (
              <Link key={category.slug} href={`/shop?category=${category.slug}`} data-tone={category.slug} aria-current={active ? "page" : undefined} className={cn("category-sidebar-link group flex items-center gap-2.5 rounded-xl p-2", active ? "bg-ink text-cream" : "hover:bg-bone")}>
                <span className={cn("category-glyph grid size-9 shrink-0 place-items-center rounded-[0.65rem]", active && "bg-volt text-ink")}><Icon size={17} strokeWidth={1.7} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.76rem] font-semibold">{category.name}</span>
                  <span className={cn("mt-0.5 block truncate text-[0.58rem]", active ? "text-cream/65" : "text-muted")}>{category.tagline}</span>
                </span>
                <ArrowRight size={12} className="ml-auto shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </nav>
      </section>

      <section className="mt-3 rounded-2xl bg-ink p-4 text-cream">
        <BatteryCharging size={21} className="text-volt" />
        <h2 className="mt-2 text-[0.95rem]">Need a custom pack?</h2>
        <p className="mt-1 text-[0.68rem] leading-relaxed text-cream/65">Choose the cells, voltage and capacity. We calculate the rest.</p>
        <Link href="/pack-builder" className="mt-3 flex min-h-9 items-center justify-between rounded-lg bg-volt px-3 text-[0.7rem] font-bold text-ink hover:bg-volt-deep">Open pack builder <ArrowRight size={13} /></Link>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-cream p-3">
        <h2 className="px-1 pb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted">Quick links</h2>
        <nav aria-label="Customer quick links">
          <Link href="/wishlist" className="flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-[0.72rem] font-medium hover:bg-bone"><Heart size={14} className="text-muted" /> Wishlist <ArrowRight size={12} className="ml-auto text-muted" /></Link>
          {SUPPORT_LINKS.map((link, index) => {
            const Icon = quickIcons[index];
            return <Link key={link.href} href={link.href} className="flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-[0.72rem] font-medium hover:bg-bone"><Icon size={14} className="text-muted" /> {link.label}<ArrowRight size={12} className="ml-auto text-muted" /></Link>;
          })}
          <Link href="/help" className="flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-[0.72rem] font-medium hover:bg-bone"><Headphones size={14} className="text-muted" /> Help centre <ArrowRight size={12} className="ml-auto text-muted" /></Link>
        </nav>
        <a href={`tel:${STORE.phone.replace(/\s/g, "")}`} className="mt-2 flex items-center gap-2 border-t border-line-soft px-2 pt-3 text-[0.7rem] font-semibold"><Headphones size={14} className="text-muted" /> {STORE.phone}</a>
        <p className="px-2 pt-1 text-[0.6rem] text-muted">Mirpur DOHS, Dhaka · {STORE.hours}</p>
      </section>
    </aside>
  );
}
