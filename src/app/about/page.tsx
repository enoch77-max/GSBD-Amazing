import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Battery, Clock3, Headphones, MapPin, ShieldCheck, Wrench } from "lucide-react";
import { STORE } from "@/lib/commerce";

export const metadata: Metadata = { title: "About & location", description: "Glowing Space BD: batteries and electronics in Mirpur DOHS, Dhaka. Workshop services, opening hours and directions." };

export default function AboutPage() {
  return (
    <div className="shell pb-8 pt-4 sm:pb-10 sm:pt-6">
      <h1 className="text-[1.45rem] sm:text-[1.85rem]">About Glowing Space BD</h1>
      <p className="mt-1 text-[0.8rem] text-muted">Batteries & electronics · Mirpur DOHS, Dhaka</p>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-cream">
          <div className="relative h-44 sm:h-60"><Image src="/images/lab.jpg" alt="Battery-pack assembly at the Glowing Space workshop" fill priority sizes="(max-width:1024px) 100vw, 50vw" className="object-cover object-[center_40%]" /></div>
          <div className="p-4 sm:p-5"><h2 className="text-lg">What we do</h2><p className="mt-2 text-[0.85rem] leading-relaxed text-muted">We sell tested cells, battery packs, BMS boards, UPS units and DIY parts. Our Dhaka workshop also builds custom packs and helps with repairs and installation.</p><p className="mt-2 text-[0.85rem] leading-relaxed text-muted">Order online for nationwide delivery, or contact us to confirm stock before visiting.</p><Link href="/shop" className="mt-3 inline-flex min-h-10 items-center gap-1 text-[0.8rem] font-semibold">Browse products <ArrowRight size={13} /></Link></div>
        </section>
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg"><MapPin size={18} /> Visit the shop</h2><p className="mt-2 text-[0.85rem] leading-relaxed text-muted">{STORE.address}</p><p className="mt-3 flex items-center gap-2 text-[0.8rem]"><Clock3 size={15} className="text-muted" /> Sat–Thu · 10 AM–8 PM</p><div className="mt-4 grid grid-cols-2 gap-2"><a href="https://maps.google.com/?q=Mirpur+DOHS+Shopping+Complex+Dhaka" target="_blank" rel="noreferrer" className="btn btn-primary btn-sm min-h-11">Directions <ArrowRight size={13} /></a><a href={`https://wa.me/${STORE.whatsapp}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm min-h-11">Contact us <Headphones size={13} /></a></div></section>
          <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5"><h2 className="text-lg">Workshop services</h2><ul className="mt-2 divide-y divide-line-soft">{[{ icon:Battery, title:"Custom battery packs", text:"Specify voltage, capacity, size and connector." }, {icon:ShieldCheck,title:"Cell & BMS testing",text:"Capacity, internal resistance and protection checks."}, {icon:Wrench,title:"Repairs & installation",text:"Pack rebuilds, BMS replacement and wiring."}].map(item => <li key={item.title} className="flex items-start gap-2.5 py-3"><item.icon size={17} className="mt-0.5 shrink-0 text-muted" /><div><p className="text-[0.83rem] font-medium">{item.title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted">{item.text}</p></div></li>)}</ul><Link href="/support#warranty" className="inline-flex min-h-10 items-center gap-1 text-[0.78rem] font-semibold">Warranty & returns <ArrowRight size={12} /></Link></section>
        </div>
      </div>
    </div>
  );
}
