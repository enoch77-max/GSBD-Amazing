"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle, Plus } from "lucide-react";
import type { PackResult, PackSuggestion } from "@/lib/pack-builder";
import { useCart } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { STORE } from "@/lib/commerce";

const ART: Record<string, string> = {
  "5a-active-balancer": "/images/pack-balancer.jpg",
  "lipo-safe-fireproof-bag": "/images/pack-safety-illustration.svg",
  "tp4056-type-c-charger-module": "/images/pack-charger-illustration.svg",
  "30a-mppt-solar-charge-controller": "/images/pack-solar-illustration.svg",
  "dc-dc-60v-12v-10a": "/images/pack-converter-illustration.svg",
  "pure-sine-inverter-1kva-24v": "/images/col-power.jpg",
};
const LABEL: Record<PackSuggestion["kind"], string> = { bms: "PROTECTION", balance: "BALANCING", charger: "POWER", assembly: "ASSEMBLY", safety: "STORAGE" };

export function PackSuggestions({ result, suggestions }: { result: PackResult; suggestions: PackSuggestion[] }) {
  const cart = useCart();
  return (
    <section className="builder-recommendations" aria-labelledby="pack-suggestions-title">
      <div className="builder-recommendations-head">
        <div><p className="builder-step">FOR YOUR {result.config.series}S{result.config.parallel}P BUILD</p><h2 id="pack-suggestions-title">Useful additions</h2><p>Optional extras for charging, storage and getting more from your pack.</p></div>
        <Link href="/shop" className="builder-browse">Browse the shop <ArrowRight size={15} /></Link>
      </div>
      <div className="builder-recommendation-grid" data-count={suggestions.length}>
        {suggestions.map(({ product, reason, kind }) => {
          const inBag = cart.lines.find((line) => line.slug === product.slug)?.qty ?? 0;
          const actualImage = product.images[0] ?? "";
          const useIllustration = Boolean(ART[product.slug]) && (!actualImage || actualImage.includes("pexels.com") || actualImage.startsWith("/images/"));
          const image = useIllustration ? ART[product.slug] : actualImage || "/images/col-circuits.jpg";
          return (
            <article className="builder-rec-card" key={product.slug}>
              <Link href={`/product/${product.slug}`} className="builder-rec-image" aria-label={`View ${product.name}`}>
                <Image src={image} alt="" fill priority sizes="(max-width:640px) 75vw, (max-width:1024px) 40vw, 280px" className="object-cover" />
                <span>{LABEL[kind]}</span>
                {useIllustration && <small>Illustrative image</small>}
              </Link>
              <div className="builder-rec-body">
                <Link href={`/product/${product.slug}`} className="builder-rec-name">{product.name}</Link>
                <p>{reason}</p>
                <div className="builder-rec-foot"><div><span>PRICE</span><strong>{formatBDT(product.price)}</strong></div>
                  <button type="button" onClick={() => cart.addItem({ id: product.id ?? 0, slug: product.slug, name: product.name, brand: product.brand ?? "Glowing Space", price: product.price, image: actualImage || image, stock: product.stock })} aria-label={`Add ${product.name} to bag`}>
                    {inBag > 0 ? <><Check size={14} /> {inBag} in bag</> : <><Plus size={15} /> Add</>}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {suggestions.length < 3 && (
          <a
            className="builder-rec-advice"
            href={`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(`Hi, I need advice on a charger for a ${result.config.series}S ${result.cell.label} pack (maximum charge voltage ${result.chargeVoltage}V).`)}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="builder-rec-advice-icon"><MessageCircle size={19} /></span>
            <span className="builder-rec-advice-label">NEED A CHARGER?</span>
            <strong>Let’s find the right match.</strong>
            <p>Your {result.config.series}S pack needs a {result.chargeVoltage}V charge ceiling. Ask the workshop before choosing a charger.</p>
            <span className="builder-rec-advice-link">Ask the workshop <ArrowRight size={14} /></span>
          </a>
        )}
      </div>
      <p className="builder-rec-note">Your selected cells, BMS, assembly and testing are already included. These products are not added unless you choose them.</p>
    </section>
  );
}
