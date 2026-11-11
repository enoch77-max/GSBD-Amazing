"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle, Plug, Plus } from "lucide-react";
import type { PackResult, PackSuggestion } from "@/lib/pack-builder";
import { useCart } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { STORE } from "@/lib/commerce";

const ART: Record<string, string> = {
  "30a-mppt-solar-charge-controller": "/images/pack-solar-illustration.svg",
  "dc-dc-60v-12v-10a": "/images/pack-converter-illustration.svg",
  "pure-sine-inverter-1kva-24v": "/images/col-power.jpg",
};
const LABEL: Record<PackSuggestion["kind"], string> = { bms: "PROTECTION", balance: "BALANCING", charger: "POWER", assembly: "ASSEMBLY", safety: "STORAGE" };

/** Separate accessories (not pack add-ons) plus the exact charger this pack needs. */
export function PackSuggestions({ result, suggestions }: { result: PackResult; suggestions: PackSuggestion[] }) {
  const cart = useCart();
  const charger = result.physics.charger;
  const ask = `Hi, I need a ${charger.voltage}V ${charger.currentA}A ${result.bms.chemistry === "lifepo4" ? "LiFePO4" : "Li-ion"} charger for a ${result.config.series}S${result.config.parallel}P pack.`;
  return (
    <section className="builder-recommendations" aria-labelledby="pack-suggestions-title">
      <div className="builder-recommendations-head">
        <div><p className="builder-step">FOR YOUR {result.config.series}S{result.config.parallel}P BUILD</p><h2 id="pack-suggestions-title">Pairs well with</h2></div>
        <Link href="/shop" className="builder-browse">Shop <ArrowRight size={15} /></Link>
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
                <Image src={image} alt="" fill sizes="(max-width:640px) 75vw, (max-width:1024px) 40vw, 280px" className="object-cover" />
                <span>{LABEL[kind]}</span>
              </Link>
              <div className="builder-rec-body">
                <Link href={`/product/${product.slug}`} className="builder-rec-name">{product.name}</Link>
                <p>{reason}</p>
                <div className="builder-rec-foot"><div><span>PRICE</span><strong>{formatBDT(product.price)}</strong></div>
                  <button type="button" onClick={() => cart.addItem({ id: product.id ?? 0, slug: product.slug, name: product.name, brand: product.brand ?? "Glowing Space", price: product.price, image: actualImage || image, stock: product.stock })} aria-label={`Add ${product.name} to bag`}>
                    {inBag > 0 ? <><Check size={14} /> {inBag}</> : <><Plus size={15} /> Add</>}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        <a className="builder-rec-advice" href={`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(ask)}`} target="_blank" rel="noreferrer">
          <span className="builder-rec-advice-icon"><Plug size={19} /></span>
          <span className="builder-rec-advice-label">MATCHING CHARGER</span>
          <strong>{charger.voltage}V · {charger.currentA}A</strong>
          <p>CC/CV {result.bms.chemistry === "lifepo4" ? "LiFePO4" : "Li-ion"} · full in ~{charger.hours}h · 0.5C for long life</p>
          <span className="builder-rec-advice-link"><MessageCircle size={14} /> Get one</span>
        </a>
      </div>
    </section>
  );
}
