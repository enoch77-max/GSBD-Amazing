import type { Metadata } from "next";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Headphones, Share2 } from "lucide-react";
import { ProductGallery } from "@/components/product-gallery";
import { QualityRail, SpecChipRow } from "@/components/store/quality-modules";
import { categoryTone, qualityIndicators } from "@/lib/product-quality";
import { CategoryGlyph } from "@/components/store/store-visuals";
import { ReviewsJump } from "@/components/reviews-jump";
import { ProductActions } from "@/components/product-actions";
import { ProductTabs } from "@/components/product-tabs";
import { ProductCard } from "@/components/product-card";
import { Price, StockPill } from "@/components/ui";
import { formatBDT } from "@/lib/format";
import { STORE } from "@/lib/commerce";
import { getProductBySlug, readCategories, readProductBySlug, readProductReviews, readRelatedProducts } from "@/lib/queries";
import { useStoreVersion } from "@/lib/use-store";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return product ? { title: product.name, description: product.shortDescription, openGraph: { title: product.name, description: product.shortDescription, images: product.images.slice(0,1) } } : { title: "Product not found" };
}

export default function ProductPage() {
  useStoreVersion();
  const { slug } = useParams<{ slug: string }>();
  const product = readProductBySlug(slug ?? "");
  if (!product) notFound();
  const reviews = readProductReviews(product.slug);
  const related = readRelatedProducts(product.categorySlug, product.slug, 4);
  const categories = readCategories();
  const category = categories.find(item => item.slug === product.categorySlug);
  const saved = product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice - product.price : 0;
  const jsonLd = { "@context":"https://schema.org", "@type":"Product", name:product.name, image:product.images, description:product.shortDescription, sku:product.sku, brand:{"@type":"Brand", name:product.brand}, offers:{"@type":"Offer",priceCurrency:"BDT",price:product.price,availability:product.stock>0?"https://schema.org/InStock":"https://schema.org/OutOfStock"} };

  const tone = categoryTone(product.categorySlug);

  return (
    <div className="shell pq pq-page pb-24 pt-1 sm:pb-10" data-cat={product.categorySlug}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,"\\u003c")}} />
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Link href={`/shop?category=${product.categorySlug}`} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"><ArrowLeft size={14} />{category?.name ?? "Products"}</Link>
        <span className="pq-badge" style={{ ["--pq-cat" as string]: tone.ink, ["--pq-tint" as string]: tone.tint, ["--pq-catline" as string]: tone.line }}>
          <CategoryGlyph slug={product.categorySlug} size={12} />{category?.name ?? "Component"}
        </span>
        {product.stock > 0 && product.stock <= 10 && <span className="text-[0.66rem] font-semibold text-[#9a3412]">{product.stock} left in stock</span>}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0 lg:sticky lg:top-40">
          <ProductGallery images={product.images} name={product.name} badge={product.badge} price={product.price} compareAt={product.compareAtPrice} sku={product.sku} categorySlug={product.categorySlug} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.65rem] text-muted"><Link href={`/shop?brand=${encodeURIComponent(product.brand)}`} className="font-medium hover:underline">{product.brand}</Link><span>·</span><span>{product.sku}</span></div>
          <h1 className="mt-1.5 text-[1.45rem] leading-[1.16] sm:text-[1.9rem]">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5"><ReviewsJump rating={product.rating} reviewCount={product.reviewCount} /><StockPill stock={product.stock} /></div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"><Price price={product.price} compareAt={product.compareAtPrice} size="lg" />{saved>0 && <span className="text-xs font-medium text-[#b24725]">Save {formatBDT(saved)}</span>}</div>
          <div className="mt-3 grid gap-3">
            <QualityRail product={product} />
            <SpecChipRow product={product} />
          </div>
          <ProductActions product={product} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {qualityIndicators(product).some((indicator) => indicator.id === "tested") && (
              <a href={`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(`Hi, can you share the test report for ${product.name} (${product.sku})?`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-cream px-3 font-medium text-muted hover:text-ink"><Share2 size={13} /> Request test report</a>
            )}
            <a href={`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(`Hi, I have a question about ${product.name} (${product.sku}).`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-cream px-3 font-medium hover:border-ink"><Headphones size={14} /> Ask a question</a>
          </div>
        </div>
      </div>
      <section className="mt-6"><ProductTabs product={product} reviews={reviews} categoryName={category?.name} /></section>
      {related.length>0 && <section className="mt-4 border-t border-line pt-4"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-xl">More in {category?.name ?? "this category"}</h2><Link href={`/shop?category=${product.categorySlug}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold">View all <ArrowRight size={13} /></Link></div><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">{related.map(item => <ProductCard key={item.id} product={item} />)}</div></section>}
    </div>
  );
}
