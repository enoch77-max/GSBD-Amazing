import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";
import { ShopBrowser } from "@/components/shop-browser";
import { isSortId, PRICE_RANGES, type SortId } from "@/lib/catalog";
import { getCategories, getShopProducts } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shop batteries, UPS & electronics",
  description: "Browse cells, battery packs, BMS, UPS and DIY components. Filter by category, brand and price. Delivery across Bangladesh.",
};

type PageProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const many = (value: string | string[] | undefined) => value ? Array.isArray(value) ? value : [value] : [];

export default async function ShopPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const category = first(params.category);
  const brand = many(params.brand).filter(Boolean);
  const price = many(params.price).filter(key => key in PRICE_RANGES);
  const q = first(params.q)?.trim();
  const sortParam = first(params.sort);
  const sort: SortId = isSortId(sortParam) ? sortParam : "featured";
  const pageNumber = Number(first(params.page) ?? 1);
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? Math.floor(pageNumber) : 1;
  const inStock = first(params.stock) === "1";
  const [result, categories] = await Promise.all([
    getShopProducts({ category, brand, price, q, sort, page, inStock }),
    getCategories(),
  ]);
  const activeCategory = categories.find(entry => entry.slug === category);
  const facets = categories.map(entry => ({
    slug: entry.slug,
    name: entry.name,
    count: result.categoryCounts.find(row => row.slug === entry.slug)?.count ?? 0,
  })).filter(entry => entry.count > 0);

  return (
    <>
      <div className="shell flex items-center justify-between gap-3 pb-3 pt-4 sm:pb-4 sm:pt-5">
        <div className="min-w-0">
          <h1 className="catalogue-title text-[1.45rem] leading-tight sm:text-[1.85rem]">
            {q ? <>Results for “{q}”</> : activeCategory?.name ?? "All products"}
            <span className="ml-2 inline-block align-middle font-sans text-xs font-normal tracking-normal text-muted">{result.total} {result.total === 1 ? "item" : "items"}</span>
          </h1>
        </div>
        {category || q ? (
          <Link href="/shop" className="inline-flex min-h-10 shrink-0 items-center gap-1 text-xs font-medium text-muted hover:text-ink"><ArrowLeft size={13} /> All products</Link>
        ) : (
          <Link href="/support#shipping" className="hidden shrink-0 items-center gap-1.5 text-xs text-muted sm:flex"><Truck size={14} /> Free delivery over ৳2,500</Link>
        )}
      </div>
      <ShopBrowser items={result.items} total={result.total} page={result.page} pageCount={result.pageCount} categories={facets} brands={result.brandCounts} query={{ category, brand, price, q, sort, inStock }} />
    </>
  );
}
