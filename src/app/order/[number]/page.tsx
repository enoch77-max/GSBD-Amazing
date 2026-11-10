import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  Headphones,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { OrderTimeline } from "@/components/order-timeline";
import { CopyOrderButton } from "@/components/copy-button";
import { PAYMENT_METHODS, STORE } from "@/lib/commerce";
import { formatBDT, formatDate } from "@/lib/format";
import { readOrderByNumber } from "@/lib/queries";
import { useEffect, useState } from "react";
import { useStoreVersion } from "@/lib/use-store";
import { isLive, liveFetchOrder, readClaim } from "@/lib/live";
import type { Order, OrderItem } from "@/db/schema";
import { PrintInvoice } from "@/components/print-invoice";
import { PackBreakdown, packBuilderUrl } from "@/components/pack-breakdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order confirmed",
  description: "Your Glowing Space BD order confirmation and live status.",
};

type PageProps = {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ new?: string }>;
};

export default function OrderPage() {
  useStoreVersion();
  const { number } = useParams<{ number: string }>();
  const isNew = useSearchParams().get("new") ?? undefined;
  const [liveResult, setLiveResult] = useState<{ order: Order; items: OrderItem[] } | null | "missing">(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  useEffect(() => {
    if (!isLive()) return;
    setPaymentFailed(new URLSearchParams(window.location.search).get("payment") === "failed");
    const token = readClaim(number ?? "");
    void liveFetchOrder(number ?? "", token ? { token } : {})
      .then((payload) => setLiveResult({ order: payload.order, items: payload.items }))
      .catch(() => setLiveResult("missing"));
  }, [number]);
  const localResult = readOrderByNumber(number ?? "");
  const result = isLive() ? (liveResult === "missing" ? null : liveResult) : localResult;
  if (isLive() && liveResult === null) {
    return (
      <div className="shell py-20">
        <div className="mx-auto max-w-lg rounded-2xl border border-line bg-cream p-6 text-center">
          <p className="text-sm text-muted">Loading your order…</p>
        </div>
      </div>
    );
  }
  if (!result) notFound();

  const { order, items } = result;
  const payment = PAYMENT_METHODS.find((method) => method.id === order.paymentMethod);
  const express = order.deliveryMethod === "express";
  const etaDays = order.district === "Dhaka" ? (express ? 0 : 2) : 4;
  const eta = new Date(order.createdAt.getTime() + etaDays * 86400000);
  const isPaid = isLive() ? (order as Order & { paymentStatus?: string }).paymentStatus === "paid" : order.paymentMethod === "bkash" || order.paymentMethod === "nagad" || order.paymentMethod === "card";

  return (
    <div>
      {paymentFailed && (
        <div className="shell pt-4">
          <div className="rounded-2xl border border-ember/40 bg-[#fff4ec] p-4 text-[0.82rem] leading-relaxed">
            <p className="font-semibold">Payment was not completed.</p>
            <p className="mt-1 text-muted">No money was taken. Your order is on hold for 24 hours — message us on WhatsApp and we will send you a fresh payment link.</p>
          </div>
        </div>
      )}
      <section className="relative overflow-hidden bg-ink text-cream">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 size-[26rem] rounded-full bg-volt/[0.14] blur-[110px]" />
          <div className="absolute -left-20 bottom-0 size-[20rem] rounded-full bg-[#1d4a35]/70 blur-[100px]" />
          {isNew === "1" && (
            <div className="absolute inset-0">
              {[12, 28, 44, 61, 76, 88].map((left, index) => (
                <span
                  key={left}
                  className="absolute size-1.5 rounded-full bg-volt/60"
                  style={{
                    left: `${left}%`,
                    top: `${18 + ((index * 13) % 50)}%`,
                    animation: `float-y ${4 + index}s ease-in-out ${index * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="shell relative py-10 sm:py-12">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[0.7rem] text-cream/45">
            <Link href="/" className="inline-flex items-center py-2 hover:text-cream">Home</Link>
            <ChevronRight size={11} />
            <Link href="/track" className="inline-flex items-center py-2 hover:text-cream">Orders</Link>
            <ChevronRight size={11} />
            <span className="inline-flex items-center py-2 text-cream/80">{order.orderNumber}</span>
          </nav>

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="animate-scale-in relative grid size-14 shrink-0 place-items-center rounded-full bg-volt text-ink">
              <span className="absolute inset-0 animate-ping rounded-full bg-volt/30" aria-hidden />
              <Check size={26} strokeWidth={3} />
            </span>
            <div>
              <p className="eyebrow flex items-center gap-2 text-volt">
                <Sparkles size={12} /> {isNew === "1" ? "Order placed" : "Order details"}
              </p>
              <h1 className="mt-1.5 text-balance text-[1.9rem] font-semibold leading-tight sm:text-[2.5rem]">
                Thanks, {order.customerName.split(" ")[0]}{" "}— it&rsquo;s on the bench.
              </h1>
              <p className="mt-2 text-[0.86rem] text-cream/60">
                Order <span className="font-mono text-cream">{order.orderNumber}</span> · placed{" "}
                {formatDate(order.createdAt)} · confirmation sent to {order.phone}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="shell grid gap-5 py-7 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[1rem] font-semibold">Live status</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-volt/20 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#4a6b1f]">
                <span className="size-1.5 animate-pulse rounded-full bg-[#4a6b1f]" />
                {order.status.replace(/^\w/, (char) => char.toUpperCase())}
              </span>
            </div>
            <OrderTimeline status={order.status} className="mt-5" />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bone p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-lg bg-white text-ink">
                  <CalendarClock size={16} />
                </span>
                <div>
                  <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted">Estimated delivery</p>
                  <p className="text-[0.86rem] font-semibold">
                    {etaDays === 0 ? "Today, before 9 PM" : formatDate(eta)}
                    <span className="ml-1.5 font-normal text-muted">
                      · {express && order.district === "Dhaka" ? "Express rider" : `${order.district === "Dhaka" ? "1–2" : "2–4"} days`}
                    </span>
                  </p>
                </div>
              </div>
              <Link href={`/track?order=${order.orderNumber}`} className="btn btn-outline btn-sm">
                Track parcel <ArrowRight size={13} />
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[1rem] font-semibold">In this parcel</h2>
              <span className="font-mono text-[0.66rem] uppercase tracking-[0.1em] text-muted">
                {items.reduce((sum, item) => sum + item.qty, 0)} items
              </span>
            </div>
            <ul className="mt-3 divide-y divide-line-soft">
              {items.map((item) => {
                const isPack = String(item.slug).startsWith("custom-pack-");
                const spec = item.packSpec;
                const href = isPack
                  ? spec?.cellId ? packBuilderUrl(spec) : "/pack-builder"
                  : `/product/${item.slug}`;
                return (
                  <li key={item.id} className="py-2.5">
                    <div className="flex items-center gap-3">
                      <Link href={href} className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-line-soft bg-bone">
                        <Image src={item.image} alt={item.name} fill sizes="56px" className="object-cover" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={href} className="line-clamp-2 text-[0.84rem] font-medium hover:underline">{item.name}</Link>
                        <p className="mt-0.5 text-[0.7rem] text-muted">{formatBDT(item.unitPrice)} × {item.qty}</p>
                      </div>
                      <p className="text-[0.84rem] font-semibold">{formatBDT(item.unitPrice * item.qty)}</p>
                    </div>
                    {spec && <PackBreakdown editable={false} line={{ id: item.productId ?? 0, slug: item.slug, name: item.name, brand: "Glowing Space Lab", price: item.unitPrice, qty: item.qty, stock: 0, image: item.image, customPack: spec, packComponents: spec.components }} />}
                  </li>
                );
              })}
            </ul>

            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[0.82rem]">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatBDT(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd>{order.shipping === 0 ? "Free" : formatBDT(order.shipping)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-[#3d7a2f]">
                  <dt>Discount {order.promoCode ? `(${order.promoCode})` : ""}</dt>
                  <dd>−{formatBDT(order.discount)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-semibold">Total {isPaid ? "paid" : "due on delivery"}</dt>
                <dd className="text-lg font-semibold">{formatBDT(order.total)}</dd>
              </div>
            </dl>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border border-line bg-cream p-4">
              <p className="flex items-center gap-2 text-[0.84rem] font-semibold">
                <MapPin size={14} /> Delivery address
              </p>
              <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">
                {order.customerName}
                <br />
                {order.address}
                <br />
                {order.district}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[0.78rem]">
                <Phone size={12} /> {order.phone}
              </p>
              {order.notes && (
                <p className="mt-2 rounded-lg bg-bone px-2 py-1.5 text-[0.7rem] text-muted">
                  Note: {order.notes}
                </p>
              )}
            </section>
            <section className="rounded-2xl border border-line bg-cream p-4">
              <p className="flex items-center gap-2 text-[0.84rem] font-semibold">
                <CreditCard size={14} /> Payment
              </p>
              <p className="mt-2 flex items-center gap-2 text-[0.84rem]">
                <span
                  className="grid size-7 place-items-center rounded-md text-[0.6rem] font-bold text-white"
                  style={{ backgroundColor: payment?.accent ?? "#132A21" }}
                >
                  {payment?.id === "cod" ? <Package size={13} /> : payment?.name.slice(0, 2)}
                </span>
                {payment?.name ?? "Cash on delivery"}
              </p>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">{payment?.detail}</p>
              <p className="mt-2 inline-flex items-center gap-1 text-[0.7rem] font-medium text-[#3d7a2f]">
                <ShieldCheck size={11} /> {isPaid ? "Payment recorded" : "Pay the rider in cash"}
              </p>
            </section>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-ink p-4 text-cream sm:p-5">
            <p className="eyebrow text-volt">What happens next</p>
            <ol className="mt-3 space-y-3">
              {[
                { icon: Package, title: "We pack it", copy: "Cells checked again, then foam and a fire-safe outer box." },
                { icon: Truck, title: "Courier pickup", copy: "Pathao or Steadfast — you get an SMS with the tracking link." },
                { icon: Headphones, title: "Build support", copy: "Message the bench any time if the install gets tricky." },
              ].map((step) => (
                <li key={step.title} className="flex gap-2.5">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-cream/10 text-volt">
                    <step.icon size={13} />
                  </span>
                  <div>
                    <p className="text-[0.8rem] font-semibold">{step.title}</p>
                    <p className="mt-0.5 text-[0.72rem] leading-relaxed text-cream/55">{step.copy}</p>
                  </div>
                </li>
              ))}
            </ol>
            <a
              href={`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(`Hi, about order ${order.orderNumber}`)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-volt btn-sm mt-4 w-full"
            >
              Message about this order
            </a>
          </section>

          <section className="rounded-2xl border border-line bg-cream p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[0.84rem] font-semibold">Keep this number</p>
                <p className="mt-1 font-mono text-lg">{order.orderNumber}</p>
              </div>
              <CopyOrderButton value={order.orderNumber} />
            </div>
            <p className="mt-1 text-[0.72rem] text-muted">
              Track with the order number plus your mobile number, any time.
            </p>
            <Link href={`/track?order=${order.orderNumber}`} className="btn btn-outline btn-sm mt-3 w-full">
              Open order tracking
            </Link>
            <Link href="/shop" className="mt-2 flex items-center justify-center gap-1 text-[0.76rem] font-medium text-muted hover:text-ink">
              Continue shopping <ChevronRight size={12} />
            </Link>
            <PrintInvoice order={order} items={items} paid={isPaid} />
          </section>
        </aside>
      </div>
    </div>
  );
}
