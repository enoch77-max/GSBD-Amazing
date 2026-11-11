import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Battery, CircuitBoard, Cpu, Flame, Headphones, Package, Quote, ShieldCheck, Sparkles, Star, Truck, Wrench, Zap } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { OfferCarousel, type OfferSlide } from "@/components/offer-carousel";
import { ActivityTicker } from "@/components/activity-ticker";
import { Stars } from "@/components/ui";
import { STORE } from "@/lib/commerce";
import { formatBDT, initials } from "@/lib/format";
import { readCategories, readFeaturedProducts, readLatestReviews, readNewArrivals, readProductBySlug } from "@/lib/queries";
import { useStoreVersion } from "@/lib/use-store";

export const dynamic = "force-dynamic";
const categoryLabels: Record<string, { label: string; icon: typeof Battery }> = {
  "battery-cells": { label: "Cells", icon: Battery },
  "battery-packs": { label: "Packs", icon: Package },
  "bms-circuits": { label: "BMS", icon: Cpu },
  "ups-power": { label: "UPS", icon: Zap },
  "diy-prototyping": { label: "DIY parts", icon: CircuitBoard },
  "tools-safety": { label: "Tools", icon: Wrench },
};

function ShelfTitle({ title, href, kind = "popular" }: { title: string; href: string; kind?: "popular" | "new" }) {
  const Icon = kind === "new" ? Sparkles : Flame;
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="shelf-heading">
        <span className="shelf-glyph" data-kind={kind} aria-hidden="true"><Icon size={16} strokeWidth={1.7} /></span>
        <h2 className="text-xl leading-tight sm:text-[1.6rem]">{title}</h2>
      </div>
      <Link href={href} className="shelf-link inline-flex min-h-10 shrink-0 items-center gap-1 text-[0.78rem] font-semibold text-ink/80 hover:text-ink">View all <ArrowRight size={14} /></Link>
    </div>
  );
}

export default function HomePage() {
  useStoreVersion();
  const categories = readCategories();
  const featured = readFeaturedProducts(12);
  const newArrivals = readNewArrivals(8);
  const reviews = readLatestReviews(3);
  const miniUps = readProductBySlug("mini-ups-router-8800mah");
  const customPack = readProductBySlug("custom-battery-pack-service");
  const cell = readProductBySlug("samsung-inr18650-30q");
  const bms = readProductBySlug("daly-smart-bms-4s-40a");
  const esp32 = readProductBySlug("esp32-wroom-devkit-v1");
  const bestsellers = featured.filter(product => product.slug !== "custom-battery-pack-service" && product.stock > 0).slice(0, 12);

  const slides: OfferSlide[] = [
    {
      id: "router-ups",
      eyebrow: "Router backup",
      title: `Mini UPS · ${formatBDT(miniUps?.price ?? 1950)}`,
      subtitle: "6–8 hours of Wi-Fi backup.",
      cta: "Shop UPS",
      href: miniUps ? `/product/${miniUps.slug}` : "/shop?category=ups-power",
      image: "/images/col-power.jpg",
      alt: "Mini UPS and power backup units",
      icon: "wifi",
      accent: "#b4d69c",
    },
    {
      id: "custom-packs",
      eyebrow: "Built to order",
      title: `Pack build · ${formatBDT(customPack?.price ?? 1500)}`,
      subtitle: "Built to your spec.",
      cta: "Get a quote",
      href: customPack ? `/product/${customPack.slug}` : "/shop?category=battery-packs",
      image: "/images/col-packs.jpg",
      alt: "Hand-built battery pack with a BMS board",
      icon: "pack",
      accent: "#a8d8ff",
    },
    {
      id: "tested-cells",
      eyebrow: "Tested cells",
      title: `18650 cells · ${formatBDT(cell?.price ?? 520)}`,
      subtitle: "Capacity & IR checked.",
      cta: "Shop cells",
      href: cell ? `/product/${cell.slug}` : "/shop?category=battery-cells",
      image: "/images/col-cells.jpg",
      alt: "Capacity-tested 18650 cells",
      icon: "cell",
      accent: "#c9f16b",
    },
    {
      id: "smart-bms",
      eyebrow: "Protection",
      title: `Smart BMS · ${formatBDT(bms?.price ?? 1350)}`,
      subtitle: "Balance & protect packs.",
      cta: "Shop BMS",
      href: bms ? `/product/${bms.slug}` : "/shop?category=bms-circuits",
      image: "/images/col-circuits.jpg",
      alt: "Battery management circuit boards",
      icon: "bms",
      accent: "#dfc4ff",
    },
    {
      id: "diy-boards",
      eyebrow: "DIY & prototyping",
      title: `ESP32 boards · ${formatBDT(esp32?.price ?? 650)}`,
      subtitle: "Boards, sensors & modules.",
      cta: "Shop DIY",
      href: esp32 ? `/product/${esp32.slug}` : "/shop?category=diy-prototyping",
      image: "/images/col-diy.jpg",
      alt: "Arduino, ESP32, breadboard and electronics tools",
      icon: "diy",
      accent: "#ffd6a3",
    },
  ];

  return (
    <div className="shell pb-7 pt-3 sm:pb-10 sm:pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-[1.25rem] leading-tight sm:text-[1.65rem]">Batteries & <span className="store-heading-accent">electronics</span></h1>
        <Link href="/shop" className="shelf-link inline-flex min-h-9 shrink-0 items-center gap-1 text-[0.75rem] font-semibold">Shop all <ArrowRight size={13} /></Link>
      </div>

      <nav aria-label="Shop categories" className="mb-4 grid grid-cols-6 gap-1.5 sm:gap-3">
        {categories.map(category => {
          const { icon: Icon, label } = categoryLabels[category.slug] ?? { icon: Battery, label: category.name };
          return (
            <Link key={category.slug} href={`/shop?category=${category.slug}`} data-tone={category.slug} aria-label={`Shop ${category.name}`} className="category-tile group flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-1.5 text-center sm:flex-row sm:justify-center sm:gap-2.5 sm:border sm:px-2 sm:py-3">
              <span className="category-glyph grid size-11 shrink-0 place-items-center rounded-[0.9rem] sm:size-10"><Icon size={22} strokeWidth={1.65} /></span>
              <span className="category-name whitespace-nowrap text-[0.67rem] font-medium sm:text-[0.83rem]">{label}</span>
            </Link>
          );
        })}
      </nav>

      <OfferCarousel slides={slides} />
      <ActivityTicker />

      <div className="store-promises mb-4 flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[0.64rem] text-muted sm:mb-5 sm:justify-center sm:gap-8 sm:text-xs">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Truck size={13} /> Delivery ৳80–130</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><ShieldCheck size={13} /> Tested cells</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Package size={13} /> COD available</span>
      </div>

      <section aria-label="Bestsellers">
        <ShelfTitle title="Bestsellers" href="/shop?sort=rating" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {bestsellers.map((product, index) => <ProductCard key={product.id} product={product} priority={index < 4} />)}
        </div>
      </section>

      <section aria-label="Custom packs and wholesale" className="my-6 grid gap-3 sm:my-8 sm:grid-cols-2">
        <Link href="/product/custom-battery-pack-service" data-service="packs" className="service-tile group flex items-center gap-3 rounded-2xl border p-3.5 transition-colors sm:p-4">
          <span className="relative size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-ink/5 sm:size-20"><Image src="/images/col-packs.jpg" alt="Custom battery pack" fill sizes="80px" className="object-cover" /></span>
          <span className="min-w-0 flex-1"><span className="block font-display text-base font-semibold">Custom battery packs</span><span className="mt-0.5 block text-xs leading-relaxed text-muted">Send voltage, capacity & dimensions.</span><span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold">Get a quote <ArrowRight size={12} /></span></span>
        </Link>
        <Link href="/support#bulk" data-service="bulk" className="service-tile group flex items-center gap-3 rounded-2xl border p-3.5 transition-colors sm:p-4">
          <span className="service-icon grid size-16 shrink-0 place-items-center rounded-xl sm:size-20"><Package size={29} strokeWidth={1.4} /></span>
          <span className="min-w-0 flex-1"><span className="block font-display text-base font-semibold">Buying in bulk?</span><span className="mt-0.5 block text-xs leading-relaxed text-muted">Cell, BMS & nickel-strip trade prices.</span><span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold">Request prices <ArrowRight size={12} /></span></span>
        </Link>
      </section>

      <section aria-label="New arrivals">
        <ShelfTitle title="New arrivals" href="/shop?sort=newest" kind="new" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {newArrivals.filter(product => product.slug !== "custom-battery-pack-service").slice(0, 5).map(product => <ProductCard key={product.id} product={product} />)}
        </div>
      </section>

      <section className="reviews-panel mt-6 rounded-2xl border p-4 sm:mt-8 sm:p-5" aria-label="Customer reviews">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2"><Quote size={17} className="text-[#65864c]" aria-hidden="true" /><h2 className="text-lg sm:text-xl">Customer reviews</h2></div>
          <Link href="/shop?sort=rating" className="inline-flex min-h-9 shrink-0 items-center gap-1 text-xs font-semibold">Top rated <Star size={12} className="text-[#ba7c20]" /></Link>
        </div>
        <div className="scrollbar-none relative flex min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
          {reviews.map(review => (
            <article key={review.id} className="w-[90%] shrink-0 snap-start border-t border-line-soft pt-3 md:w-auto">
              <div className="flex items-center gap-2"><Stars rating={review.rating} size={11} /><span className="text-[0.65rem] text-[#3d7a2f]">{review.verified ? "Verified purchase" : "Customer review"}</span></div>
              <p className="mt-2 text-[0.83rem] font-semibold leading-snug">{review.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{review.body}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-muted"><span className="review-avatar grid size-5 shrink-0 place-items-center rounded-full text-[0.55rem] font-semibold">{initials(review.author)}</span><span>{review.author}</span><Link href={`/product/${review.productSlug}`} className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 text-ink">View product <ArrowRight size={11} /></Link></div>
            </article>
          ))}
        </div>
      </section>

      <div className="help-strip mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl px-4 py-2.5">
        <span className="flex items-center gap-2 text-[0.8rem] font-medium"><Headphones size={15} /> Need help choosing a part?</span>
        <a href={`https://wa.me/${STORE.whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-[0.8rem] font-semibold">WhatsApp us <ArrowRight size={13} /></a>
      </div>
    </div>
  );
}
