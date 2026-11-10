"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Headphones, Loader2, MapPin, Package, Phone, Search, ShieldCheck, Truck } from "lucide-react";
import { OrderTimeline } from "@/components/order-timeline";
import { PAYMENT_METHODS, STORE } from "@/lib/commerce";
import { formatBDT, formatDate } from "@/lib/format";

type TrackedOrder = {
  orderNumber: string; customerName: string; status: string; createdAt: string;
  total: number; district: string; address: string; paymentMethod: string; deliveryMethod: string;
};
type TrackedItem = { id: number; name: string; qty: number; unitPrice: number; slug: string };
const statusTitles: Record<string, string> = {
  confirmed: "Order confirmed", packing: "Being packed", shipped: "With the courier", delivered: "Delivered",
};

export function TrackView({ initialOrder = "" }: { initialOrder?: string }) {
  const [number, setNumber] = useState(initialOrder);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order: TrackedOrder; items: TrackedItem[] } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && window.innerWidth < 1024) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    if (!number.trim()) { setError("Enter your order ID, e.g. GSBD-10482."); return; }
    if (!/^01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, ""))) { setError("Enter the 11-digit mobile number used at checkout."); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/track?number=${encodeURIComponent(number.trim())}&phone=${encodeURIComponent(phone.trim())}`, { cache: "no-store" });
      const data = (await response.json()) as { order?: TrackedOrder; items?: TrackedItem[]; error?: string };
      if (!response.ok || !data.order) throw new Error(data.error ?? "Order not found.");
      setResult({ order: data.order, items: data.items ?? [] });
    } catch (lookupError) {
      setResult(null);
      setError(lookupError instanceof Error ? lookupError.message : "Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-6">
      <div className="min-w-0">
        <form onSubmit={lookup} noValidate className="rounded-2xl border border-line bg-cream p-4 sm:p-5">
          <div className="space-y-3">
            <div><label className="label" htmlFor="order-number">Order ID</label><input id="order-number" value={number} onChange={event => setNumber(event.target.value.toUpperCase())} placeholder="GSBD-10482" autoComplete="off" className="field font-mono" /></div>
            <div><label className="label" htmlFor="order-phone">Mobile number</label><div className="relative"><Phone size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input id="order-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="01XXXXXXXXX" type="tel" autoComplete="tel" className="field pl-9" /></div></div>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg bg-ember/10 px-3 py-2 text-xs leading-relaxed text-[#af3e1a]">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary mt-4 min-h-11 w-full">{loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}{loading ? "Checking…" : "Track order"}</button>
          <details className="mt-2 text-xs text-muted">
            <summary className="flex min-h-9 cursor-pointer items-center gap-1.5">Try a demo order <ArrowRight size={11} /></summary>
            <button type="button" onClick={() => { setNumber("GSBD-10482"); setPhone("01712345678"); setError(null); }} className="mb-1 inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-medium text-ink">Use GSBD-10482</button>
          </details>
        </form>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-cream px-3 py-2.5 text-xs"><span className="flex items-center gap-1.5 text-muted"><Headphones size={14} /> Need help?</span><a href={`https://wa.me/${STORE.whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 font-semibold">WhatsApp us <ArrowRight size={12} /></a></div>
      </div>

      <div ref={resultRef} className="min-w-0 scroll-mt-3" aria-live="polite">
        {result ? (
          <div className="animate-fade-in space-y-3">
            <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-xs text-muted">{result.order.orderNumber}</p><h2 className="mt-1 text-xl">{statusTitles[result.order.status] ?? result.order.status}</h2></div><span className="rounded-full bg-volt/30 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider">{result.order.status}</span></div>
              <OrderTimeline status={result.order.status} className="mt-5" />
              <div className="mt-4 grid gap-2 rounded-xl bg-bone p-3 text-xs sm:grid-cols-2"><p className="flex items-start gap-1.5"><MapPin size={14} className="mt-0.5 shrink-0" /><span className="leading-relaxed text-muted">{result.order.address}, {result.order.district}</span></p><p className="text-muted">{PAYMENT_METHODS.find(method => method.id === result.order.paymentMethod)?.name} · <strong className="font-semibold text-ink">{formatBDT(result.order.total)}</strong></p></div>
            </section>
            <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-1"><h3 className="text-base">Order items</h3><span className="text-[0.7rem] text-muted">{formatDate(result.order.createdAt)}</span></div><ul className="mt-2 divide-y divide-line-soft">{result.items.map(item => <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[0.8rem]"><Link href={`/product/${item.slug}`} className="font-medium leading-snug hover:underline">{item.name}<span className="ml-1 text-muted">×{item.qty}</span></Link><span className="whitespace-nowrap font-semibold">{formatBDT(item.unitPrice * item.qty)}</span></li>)}</ul><Link href={`/order/${result.order.orderNumber}`} className="btn btn-outline btn-sm mt-3 min-h-10 w-full">Order details <ArrowRight size={13} /></Link></section>
          </div>
        ) : (
          <div className="hidden rounded-2xl border border-line bg-cream p-5 lg:block">
            <h2 className="text-base">Delivery estimates</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div className="flex items-center gap-3"><Truck size={18} className="text-muted" /><div><p className="font-medium">Dhaka: 1–2 days</p><p className="mt-0.5 text-xs text-muted">Same-day delivery available before 4 PM.</p></div></div>
              <div className="flex items-center gap-3"><Package size={18} className="text-muted" /><div><p className="font-medium">Outside Dhaka: 2–4 days</p><p className="mt-0.5 text-xs text-muted">Pathao or Steadfast courier.</p></div></div>
              <p className="flex items-start gap-2 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0" /> Your phone number is used to verify the order.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
