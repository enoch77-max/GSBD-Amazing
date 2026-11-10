import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown, Clock3, Headphones, Mail, MapPin, Package, Phone, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { STORE } from "@/lib/commerce";

export const metadata: Metadata = { title: "Help & support", description: "Delivery charges, returns, warranty and contact details for Glowing Space BD." };
const faqs = [
  { q: "Are the cells capacity-tested?", a: "Each batch is discharge-tested and checked for internal resistance. Ask us for your batch’s test report before ordering." },
  { q: "Can you build a custom battery pack?", a: "Yes. Send the voltage, capacity, maximum load, dimensions and connector type on WhatsApp. We’ll confirm the price and build time before starting." },
  { q: "Is cash on delivery available?", a: "Yes, across Bangladesh. Orders over ৳15,000 require a ৳100 advance. Custom packs may need a deposit, confirmed with your quote." },
  { q: "How do I claim warranty?", a: "Send your order ID, a photo and a description of the fault on WhatsApp. We’ll arrange inspection, then repair or replace eligible items." },
  { q: "Can I collect an order?", a: "Yes. Contact us to reserve the items and confirm collection at our Mirpur DOHS counter. Open Saturday–Thursday, 10 AM–8 PM." },
  { q: "Can you source a part not listed?", a: "Send the part number or a clear photo. We’ll confirm availability, price and estimated lead time." },
];
const shipping = [
  { area: "Dhaka", charge: "৳80", time: "1–2 days" },
  { area: "Outside Dhaka", charge: "৳130", time: "2–4 days" },
  { area: "Dhaka same-day", charge: "৳150", time: "Order before 4 PM" },
];

export default function SupportPage() {
  return (
    <div className="shell pb-7 pt-4 sm:pb-10 sm:pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[1.45rem] sm:text-[1.85rem]">Help & support</h1><p className="mt-1 text-[0.78rem] text-muted">Sat–Thu · 10 AM–8 PM</p></div><Link href="/track" className="inline-flex min-h-10 items-center gap-1.5 text-[0.8rem] font-semibold"><Package size={15} /> Track order <ArrowRight size={12} /></Link></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
        <a href={`https://wa.me/${STORE.whatsapp}`} target="_blank" rel="noreferrer" className="btn btn-primary min-h-11 px-3 py-3 text-[0.82rem]"><Headphones size={16} /> WhatsApp us</a>
        <a href={`tel:${STORE.phone.replace(/\s/g, "")}`} className="btn btn-outline min-h-11 px-3 py-3 text-[0.82rem]"><Phone size={15} /> Call shop</a>
      </div>
      <nav aria-label="Help topics" className="scrollbar-none my-4 flex gap-2 overflow-x-auto pb-1">
        {[["Delivery", "shipping"], ["Warranty", "warranty"], ["Returns", "returns"], ["Wholesale", "bulk"], ["FAQ", "faq"]].map(([label,id]) => <a key={id} href={`#${id}`} className="chip min-h-10">{label}</a>)}
      </nav>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)] lg:gap-6">
        <div className="min-w-0 space-y-4">
          <section id="shipping" className="scroll-mt-3 overflow-hidden rounded-2xl border border-line bg-cream">
            <h2 className="flex items-center gap-2 px-4 pb-3 pt-4 text-lg"><Truck size={17} /> Delivery charges</h2>
            <table className="w-full text-left text-[0.79rem]"><caption className="sr-only">Delivery charges and estimates</caption><thead className="border-y border-line-soft bg-bone/70 text-[0.67rem] text-muted"><tr><th scope="col" className="px-4 py-2 font-medium">Area</th><th scope="col" className="px-2 py-2 font-medium">Charge</th><th scope="col" className="px-4 py-2 font-medium">Time</th></tr></thead><tbody>{shipping.map(row => <tr key={row.area} className="border-b border-line-soft last:border-0"><th scope="row" className="px-4 py-3 font-medium">{row.area}</th><td className="whitespace-nowrap px-2 py-3 font-semibold">{row.charge}</td><td className="px-4 py-3 text-muted">{row.time}</td></tr>)}</tbody></table>
            <p className="border-t border-line-soft px-4 py-3 text-xs leading-relaxed text-muted"><span className="font-semibold text-ink">Free standard delivery over ৳2,500.</span> Heavy packs may need special delivery; contact us before ordering.</p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section id="warranty" className="scroll-mt-3 rounded-2xl border border-line bg-cream p-4"><h2 className="flex items-center gap-2 text-lg"><ShieldCheck size={17} /> Warranty</h2><p className="mt-2 text-[0.8rem] leading-relaxed text-muted">The warranty period is listed on each product. Manufacturing faults qualify for repair or replacement.</p><p className="mt-2 text-xs leading-relaxed text-muted">Excludes water damage, reversed polarity, physical damage and modified packs.</p><a href={`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent("Hi, I need help with a warranty claim. My order ID is ")}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs font-semibold">Start a claim <ArrowRight size={12} /></a></section>
            <section id="returns" className="scroll-mt-3 rounded-2xl border border-line bg-cream p-4"><h2 className="flex items-center gap-2 text-lg"><RotateCcw size={17} /> Returns</h2><p className="mt-2 text-[0.8rem] leading-relaxed text-muted">Return unopened items within 14 days. Custom packs can be returned only if faulty.</p><p className="mt-2 text-xs leading-relaxed text-muted">Refunds take 3–5 working days after inspection.</p><a href={`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent("Hi, I would like to request a return. My order ID is ")}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs font-semibold">Request a return <ArrowRight size={12} /></a></section>
          </div>

          <section id="bulk" className="flex scroll-mt-3 flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-4 text-cream"><div><h2 className="text-lg">Wholesale prices</h2><p className="mt-1 text-xs leading-relaxed text-cream/65">Cells, BMS & supplies for repair shops and resellers.</p></div><a href={`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent("Hi, please send me your wholesale rate card.")}`} target="_blank" rel="noreferrer" className="btn btn-volt btn-sm min-h-10">Request price list <ArrowRight size={13} /></a></section>

          <section id="faq" className="scroll-mt-3 rounded-2xl border border-line bg-cream px-4"><h2 className="py-4 text-lg">Common questions</h2><div className="divide-y divide-line-soft border-t border-line-soft">{faqs.map(faq => <details key={faq.q} className="group"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[0.83rem] font-medium">{faq.q}<ChevronDown size={15} className="shrink-0 text-muted transition-transform group-open:rotate-180" /></summary><p className="pb-4 pr-3 text-[0.8rem] leading-relaxed text-muted">{faq.a}</p></details>)}</div></section>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-28">
          <section id="visit" className="scroll-mt-3 rounded-2xl border border-line bg-cream p-4"><h2 className="flex items-center gap-2 text-lg"><MapPin size={17} /> Visit or collect</h2><p className="mt-2 text-[0.8rem] leading-relaxed text-muted">{STORE.address}</p><p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Clock3 size={13} /> Sat–Thu · 10 AM–8 PM</p><a href="https://maps.google.com/?q=Mirpur+DOHS+Shopping+Complex+Dhaka" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm mt-3 min-h-10 w-full">Get directions <ArrowRight size={13} /></a><p className="mt-2 text-[0.7rem] text-muted">Call first to confirm stock or book a repair.</p></section>
          <section className="rounded-2xl border border-line bg-cream p-4"><h2 className="flex items-center gap-2 text-base"><Mail size={16} /> Invoices & enquiries</h2><a href={`mailto:${STORE.email}`} className="mt-2 inline-flex min-h-9 break-all text-[0.8rem] font-medium text-ink">{STORE.email}</a></section>
        </aside>
      </div>
    </div>
  );
}
