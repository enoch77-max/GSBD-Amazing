import Link from "next/link";
import { ArrowUpRight, Headphones, MapPin, Phone, Zap } from "lucide-react";
import { STORE } from "@/lib/commerce";
import { CircuitDecoration } from "@/components/circuit-decoration";

const links = [
  { href: "/track", label: "Track order" },
  { href: "/support#shipping", label: "Delivery charges" },
  { href: "/support#returns", label: "Returns" },
  { href: "/support#warranty", label: "Warranty" },
  { href: "/support#bulk", label: "Wholesale" },
  { href: "/about", label: "About & location" },
];

export function SiteFooter() {
  return (
    <footer className="store-footer border-t border-cream/10 bg-ink pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-cream lg:pb-0">
      <CircuitDecoration className="footer-circuit" />
      <div className="shell">
        <div className="grid gap-5 py-6 sm:grid-cols-[1.25fr_1fr_1fr] sm:gap-8 sm:py-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-volt text-ink"><Zap size={17} fill="currentColor" /></span><span className="font-display text-lg font-semibold tracking-tight">glowing space <span className="text-sm text-volt">BD</span></span></Link>
            <p className="mt-2 text-xs text-cream/55">Batteries, power backup & DIY electronics.</p>
            <a href="https://maps.google.com/?q=Mirpur+DOHS+Shopping+Complex+Dhaka" target="_blank" rel="noreferrer" className="mt-2.5 flex max-w-sm items-start gap-1.5 text-xs leading-relaxed text-cream/65 hover:text-volt"><MapPin size={13} className="mt-0.5 shrink-0" />{STORE.address}</a>
            <p className="mt-1.5 text-[0.68rem] text-cream/45">Sat–Thu · 10 AM–8 PM</p>
          </div>
          <nav aria-label="Footer links" className="grid grid-cols-2 gap-x-5 gap-y-0.5 sm:content-start">
            {links.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-9 items-center text-[0.78rem] text-cream/70 transition-colors hover:text-volt">{link.label}</Link>)}
          </nav>
          <div>
            <p className="mb-2 text-sm font-semibold">Questions about an order?</p>
            <div className="flex flex-wrap gap-2">
              <a href={`https://wa.me/${STORE.whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-volt px-3.5 text-xs font-semibold text-ink"><Headphones size={13} /> WhatsApp <ArrowUpRight size={12} /></a>
              <a href={`tel:${STORE.phone.replace(/\s/g, "")}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-cream/20 px-3.5 text-xs text-cream"><Phone size={12} /> Call us</a>
            </div>
            <a href={`mailto:${STORE.email}`} className="mt-2 inline-flex min-h-8 items-center text-xs text-cream/55 hover:text-volt">{STORE.email}</a>
          </div>
        </div>
        <nav aria-label="Policies" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-cream/10 pt-3 text-[0.7rem]">
          <Link href="/privacy" className="inline-flex min-h-8 items-center text-cream/60 hover:text-volt">Privacy policy</Link>
          <Link href="/terms" className="inline-flex min-h-8 items-center text-cream/60 hover:text-volt">Terms of sale</Link>
          <Link href="/refunds" className="inline-flex min-h-8 items-center text-cream/60 hover:text-volt">Returns &amp; refunds</Link>
          <Link href="/support#warranty" className="inline-flex min-h-8 items-center text-cream/60 hover:text-volt">Warranty</Link>
          <Link href="/admin" className="ml-auto inline-flex min-h-8 items-center gap-1 text-cream/40 hover:text-volt">Merchant console <ArrowUpRight size={10} /></Link>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-cream/10 py-3 text-[0.65rem] text-cream/45">
          <p>© {new Date().getFullYear()} Glowing Space BD · Prices in BDT · Trade licence TRAD/DNCC/042187/2023</p>
          <span className="text-cream/65">bKash · Nagad · Card · Cash on delivery</span>
        </div>
      </div>
    </footer>
  );
}
