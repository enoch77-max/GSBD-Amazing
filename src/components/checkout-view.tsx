"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { productLabel } from "@/lib/product-copy";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Headphones,
  Loader2,
  Lock,
  MapPin,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Truck,
  User,
  Wallet,
  X,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import {
  DELIVERY_METHODS,
  DISTRICTS,
  PAYMENT_METHODS,
  PROMOS,
  STORE,
  deliveryPrice,
  findPromo,
  promoDiscount,
  type DeliveryMethod,
  type PaymentMethodId,
  type Promo,
} from "@/lib/commerce";
import { cn, formatBDT } from "@/lib/format";

type FormState = {
  name: string;
  phone: string;
  email: string;
  district: string;
  address: string;
  notes: string;
};



export function CheckoutView() {
  const cart = useCart();
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    email: "",
    district: "Dhaka",
    address: "",
    notes: "",
  });
  const [delivery, setDelivery] = useState<DeliveryMethod>("standard");
  const [payment, setPayment] = useState<PaymentMethodId>("bkash");
  const [trx, setTrx] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);

  const subtotal = cart.subtotal;
  const baseShipping = deliveryPrice(delivery, form.district);
  const freeStandard = delivery === "standard" && subtotal >= STORE.freeShippingThreshold;
  const promoOff = promoDiscount(promo ?? undefined, subtotal);
  const shipping = freeStandard || promo?.type === "shipping" ? 0 : baseShipping;
  const total = Math.max(0, subtotal + shipping - promoOff);
  const remainingForFree = Math.max(0, STORE.freeShippingThreshold - subtotal);

  const deliveryOptions = useMemo(
    () =>
      DELIVERY_METHODS.filter(method => method.id === "standard" || form.district === "Dhaka").map((method) => ({
        ...method,
        price: form.district === "Dhaka" ? method.priceInside : method.priceOutside,
      })),
    [form.district],
  );

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "district" && value !== "Dhaka" && delivery === "express") setDelivery("standard");
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function applyPromo() {
    const found = findPromo(promoInput);
    if (!found) {
      setPromoError("That code is not valid. Try GLOW10.");
      setPromo(null);
      return;
    }
    if (subtotal < found.minSubtotal) {
      setPromoError(`Spend ${formatBDT(found.minSubtotal)} to use ${found.code}.`);
      setPromo(null);
      return;
    }
    setPromo(found);
    setPromoError(null);
    setPromoInput(found.code);
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.name.trim().length < 3) next.name = "Please enter your full name.";
    if (!/^01[3-9]\d{8}$/.test(form.phone.replace(/[\s-]/g, "")))
      next.phone = "Use a valid 11-digit number, like 01712345678.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = "That email does not look right.";
    if (form.address.trim().length < 10)
      next.address = "Add house, road, area and a landmark for the rider.";
    if (!DISTRICTS.includes(form.district as (typeof DISTRICTS)[number]))
      next.district = "Choose your district.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstError = Object.keys(next)[0];
      document.getElementById(`field-${firstError}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    if (cart.lines.length === 0) {
      setSubmitError("Your bag is empty.");
      return;
    }
    if (!validate()) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name,
          phone: form.phone,
          email: form.email,
          district: form.district,
          address: form.address,
          notes: [form.notes, trx ? `TrxID: ${trx}` : ""].filter(Boolean).join(" · "),
          paymentMethod: payment,
          deliveryMethod: delivery,
          promoCode: promo?.code,
          items: cart.lines.map((line) => ({ slug: line.slug, qty: line.qty })),
        }),
      });
      const data = (await response.json()) as { orderNumber?: string; error?: string };
      if (!response.ok || !data.orderNumber) {
        throw new Error(data.error ?? "Could not place your order.");
      }
      cart.clearCart();
      router.push(`/order/${data.orderNumber}?new=1`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (cart.hydrated && cart.lines.length === 0 && !submitting) {
    return (
      <div className="shell py-20">
        <div className="mx-auto max-w-md rounded-[1.75rem] border border-line bg-cream p-8 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-bone">
            <ShoppingBag size={26} className="text-muted" />
          </span>
          <h1 className="mt-5 text-2xl">Your bag is empty</h1>
          <p className="mt-2 text-[0.88rem] text-muted">
            Add products to your bag to continue.
          </p>
          <Link href="/shop" className="btn btn-primary mt-6 w-full">
            Browse the catalogue <ArrowRight size={15} />
          </Link>
          <Link href="/track" className="mt-3 inline-flex items-center gap-1 text-[0.8rem] font-medium text-muted hover:text-ink">
            Track an order <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    );
  }

  if (!cart.hydrated) {
    return <div className="shell py-6"><h1 className="text-2xl">Checkout</h1><p className="mt-4 flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Loading your bag…</p></div>;
  }

  return (
    <div className="shell pb-6 pt-4 sm:pb-8 sm:pt-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[1.45rem] sm:text-[1.85rem]">Checkout</h1>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Lock size={12} /> Guest checkout</span>

      </div>

      {/* Mobile collapsible order summary + promo */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-cream lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSummaryOpen((value) => !value)}
          aria-expanded={mobileSummaryOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-[0.82rem] font-semibold">
            <ShoppingBag size={15} className="text-ink" />
            <span>
              {mobileSummaryOpen ? "Hide" : "Show"} order summary ({cart.itemCount})
            </span>
            <ChevronDown
              size={14}
              className={cn("text-muted transition-transform", mobileSummaryOpen && "rotate-180")}
            />
          </span>
          <span className="text-[0.95rem] font-semibold">{formatBDT(total)}</span>
        </button>
        {mobileSummaryOpen && (
          <div className="border-t border-line-soft px-4 py-3">
            <ul className="space-y-2">
              {cart.lines.map((line) => (
                <li key={line.slug} className="flex items-center gap-2.5 text-[0.78rem]">
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-bone">
                    <Image src={line.image} alt="" fill sizes="40px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1 leading-snug font-medium">
                    {productLabel(line.slug, line.name)} <span className="text-muted">×{line.qty}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatBDT(line.price * line.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input
                value={promoInput}
                onChange={(event) => {
                  setPromoInput(event.target.value.toUpperCase());
                  setPromoError(null);
                }}
                placeholder="Promo code (GLOW10)"
                aria-label="Mobile promo code"
                className="field py-2 text-[0.8rem]"
              />
              <button type="button" onClick={applyPromo} className="btn btn-outline btn-sm shrink-0">
                Apply
              </button>
            </div>
            {promoError && <p className="mt-1 text-[0.68rem] text-ember">{promoError}</p>}
            {promo && (
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[0.7rem] font-medium text-[#3d7a2f]">
                <span>{promo.code} applied</span>
                <button type="button" onClick={() => {setPromo(null);setPromoInput("");}} aria-label="Remove mobile promo code" className="grid size-8 place-items-center rounded-full text-muted"><X size={13} /></button>
              </div>
            )}
            <dl className="mt-3 space-y-1.5 border-t border-line-soft pt-3 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-muted">Subtotal</dt><dd>{formatBDT(subtotal)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Delivery</dt><dd>{shipping === 0 ? "Free" : formatBDT(shipping)}</dd></div>
              {promoOff > 0 && <div className="flex justify-between gap-2 text-[#3d7a2f]"><dt>Discount</dt><dd>−{formatBDT(promoOff)}</dd></div>}
              <div className="flex justify-between gap-2 border-t border-line-soft pt-2 font-semibold"><dt>Total</dt><dd>{formatBDT(total)}</dd></div>
            </dl>
          </div>
        )}
      </div>

      <div className="mt-4 grid min-w-0 gap-5 lg:mt-5 lg:grid-cols-[1.2fr_0.8fr] lg:gap-7">
        <form id="checkout-form" onSubmit={placeOrder} className="min-w-0 space-y-4" noValidate>
          <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-full bg-ink font-mono text-[0.68rem] text-volt">1</span>
              <div>
                <h2 className="text-[1rem] font-semibold leading-tight">Delivery details</h2>
                <p className="text-[0.72rem] text-muted">We’ll call before delivery.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div id="field-name">
                <label className="label" htmlFor="name">Full name</label>
                <div className="relative">
                  <User size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="name"
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    placeholder="e.g. Tanvir Ahmed"
                    autoComplete="name"
                    className={cn("field pl-9", errors.name && "field-error")}
                  />
                </div>
                {errors.name && <p className="mt-1 text-[0.7rem] text-ember">{errors.name}</p>}
              </div>
              <div id="field-phone">
                <label className="label" htmlFor="phone">Mobile number</label>
                <div className="relative">
                  <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="phone"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="01XXXXXXXXX"
                    inputMode="tel"
                    autoComplete="tel"
                    className={cn("field pl-9", errors.phone && "field-error")}
                  />
                </div>
                {errors.phone && <p className="mt-1 text-[0.7rem] text-ember">{errors.phone}</p>}
              </div>
              <div id="field-email">
                <label className="label" htmlFor="email">Email <span className="font-normal normal-case tracking-normal text-muted">(optional)</span></label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                  placeholder="for the receipt"
                  autoComplete="email"
                  className={cn("field", errors.email && "field-error")}
                />
                {errors.email && <p className="mt-1 text-[0.7rem] text-ember">{errors.email}</p>}
              </div>
              <div id="field-district">
                <label className="label" htmlFor="district">District</label>
                <div className="relative">
                  <MapPin size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <select
                    id="district"
                    value={form.district}
                    onChange={(event) => update("district", event.target.value)}
                    className="field appearance-none pl-9 pr-9"
                  >
                    {DISTRICTS.map((district) => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                </div>
              </div>
              <div className="sm:col-span-2" id="field-address">
                <label className="label" htmlFor="address">Full delivery address</label>
                <textarea
                  id="address"
                  rows={2}
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                  placeholder="House / flat, road, area, thana, postcode — plus a landmark"
                  autoComplete="street-address"
                  className={cn("field resize-none", errors.address && "field-error")}
                />
                {errors.address && <p className="mt-1 text-[0.7rem] text-ember">{errors.address}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="notes">Order notes <span className="font-normal normal-case tracking-normal text-muted">(optional)</span></label>
                <input
                  id="notes"
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  placeholder="Pack it with extra foam, call after 6 PM…"
                  className="field"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-full bg-ink font-mono text-[0.68rem] text-volt">2</span>
              <div>
                <h2 className="text-[1rem] font-semibold leading-tight">Delivery method</h2>
                <p className="text-[0.72rem] text-muted">Prices for {form.district}. Free standard delivery over ৳2,500.</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {deliveryOptions.map((option) => {
                const selected = delivery === option.id;
                const waived = option.id === "standard" && subtotal >= STORE.freeShippingThreshold;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 transition-all",
                      selected ? "border-ink shadow-[0_0_0_3px_rgba(201,241,107,0.35)]" : "border-line hover:border-ink/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="delivery"
                      checked={selected}
                      onChange={() => setDelivery(option.id)}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2",
                        selected ? "border-ink bg-ink text-volt" : "border-line",
                      )}
                    >
                      {selected && <Check size={9} strokeWidth={4} />}
                    </span>
                    <span className="flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[0.86rem] font-semibold">
                          <Truck size={14} /> {option.name}
                        </span>
                        <span className="text-[0.8rem] font-semibold">
                          {waived ? (
                            <span className="text-[#3d7a2f]">Free</span>
                          ) : (
                            formatBDT(option.price)
                          )}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[0.74rem] text-muted">{option.id === "express" ? "Dhaka Metro · order before 4 PM" : form.district === "Dhaka" ? "1–2 working days" : "2–4 working days"}</span>
                      
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-cream p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-full bg-ink font-mono text-[0.68rem] text-volt">3</span>
              <div>
                <h2 className="text-[1rem] font-semibold leading-tight">Payment method</h2>
                <p className="text-[0.72rem] text-muted">Sandbox store — no real payment is captured.</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {PAYMENT_METHODS.map((method) => {
                const selected = payment === method.id;
                return (
                  <label
                    key={method.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-xl border bg-white p-3 transition-all",
                      selected ? "border-ink shadow-[0_0_0_3px_rgba(201,241,107,0.35)]" : "border-line hover:border-ink/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="payment"
                      checked={selected}
                      onChange={() => setPayment(method.id)}
                      className="sr-only"
                    />
                    <span
                      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-white"
                      style={{ backgroundColor: method.accent }}
                    >
                      {method.id === "cod" ? (
                        <Wallet size={14} />
                      ) : method.id === "card" ? (
                        <CreditCard size={14} />
                      ) : (
                        <span className="font-mono text-[0.6rem] font-bold">
                          {method.name.slice(0, 2)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[0.84rem] font-semibold">
                        {method.name}
                        {selected && <Check size={12} className="text-[#3d7a2f]" strokeWidth={3} />}
                      </span>
                      <span className="mt-0.5 block text-[0.68rem] leading-snug text-muted">
                        {method.detail}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {(payment === "bkash" || payment === "nagad") && (
              <div className="animate-slide-up mt-3 rounded-xl border border-line bg-white p-3">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bone px-3 py-2">
                  <div>
                    <p className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted">
                      {payment === "bkash" ? "bKash" : "Nagad"} demo recipient
                    </p>
                    <p className="font-mono text-[0.88rem] font-semibold">01712345678</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText("01712345678");
                      setCopiedWallet(true);
                      setTimeout(() => setCopiedWallet(false), 2000);
                    }}
                    className="btn btn-outline btn-sm min-h-[2.25rem]"
                  >
                    {copiedWallet ? (
                      <>
                        <Check size={12} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy number
                      </>
                    )}
                  </button>
                </div>
                <label className="label" htmlFor="trx">Transaction ID <span className="font-normal normal-case tracking-normal text-muted">(optional for sandbox)</span></label>
                <input
                  id="trx"
                  value={trx}
                  onChange={(event) => setTrx(event.target.value)}
                  placeholder="e.g. 9F7A2B1C4D"
                  className="field"
                />
                <p className="mt-1.5 text-[0.7rem] text-muted">
                  Demo checkout — do not send real money.
                </p>
              </div>
            )}
          </section>

          {submitError && (
            <p className="flex items-center gap-2 rounded-xl border border-ember/30 bg-ember/5 p-3 text-[0.8rem] text-ember">
              <X size={14} /> {submitError}
            </p>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-line bg-cream p-3 text-[0.72rem] text-muted">
            <Lock size={13} className="shrink-0 text-ink" />
            Your details are used only for this order.
          </div>
        </form>

        {/* mobile sticky order bar */}
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bone/95 px-3 py-2.5 backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Total · {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}</p>
              <p className="text-[1.05rem] font-semibold leading-tight">{formatBDT(total)}</p>
            </div>
            <button
              type="submit"
              form="checkout-form"
              disabled={submitting}
              className="btn btn-primary min-h-[2.9rem] flex-1 max-w-[13rem]"
            >
              {submitting ? (
                <><Loader2 size={15} className="animate-spin" /> Placing…</>
              ) : (
                <><ShieldCheck size={15} /> Place order</>
              )}
            </button>
          </div>
        </div>

        <aside className="hidden min-w-0 lg:sticky lg:top-28 lg:block lg:self-start">
          <div className="rounded-2xl border border-line bg-cream p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[1rem] font-semibold">Order summary</h2>
              <span className="rounded-full bg-bone px-2 py-0.5 font-mono text-[0.62rem] text-muted">
                {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {cart.lines.map((line) => (
                <li key={line.slug} className="flex items-center gap-2.5">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-line-soft bg-bone">
                    <Image src={line.image} alt="" fill sizes="48px" className="object-cover" />
                    <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-ink font-mono text-[0.55rem] text-cream">
                      {line.qty}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.78rem] font-medium leading-snug">{line.name}</span>
                    <span className="block text-[0.68rem] text-muted">
                      {formatBDT(line.price)} × {line.qty}
                    </span>
                  </span>
                  <span className="text-[0.78rem] font-semibold">{formatBDT(line.price * line.qty)}</span>
                </li>
              ))}
            </ul>

            {remainingForFree > 0 ? (
              <div className="mt-3 rounded-xl bg-bone p-2.5">
                <p className="flex items-center gap-1.5 text-[0.72rem]">
                  <Truck size={12} /> Add {formatBDT(remainingForFree)} for free standard delivery
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-volt-deep transition-all duration-700"
                    style={{ width: `${Math.min(100, (subtotal / STORE.freeShippingThreshold) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-volt/20 p-2.5 text-[0.72rem] font-medium text-[#3d7a2f]">
                <BadgeCheck size={13} /> Free standard delivery unlocked
              </p>
            )}

            <div className="mt-3">
              <label className="label" htmlFor="promo">Promo code</label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Tag size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="promo"
                    value={promoInput}
                    onChange={(event) => {
                      setPromoInput(event.target.value.toUpperCase());
                      setPromoError(null);
                    }}
                    placeholder="GLOW10"
                    className="field py-2 pl-8 text-[0.82rem]"
                  />
                </div>
                <button type="button" onClick={applyPromo} className="btn btn-outline btn-sm">
                  Apply
                </button>
              </div>
              {promoError && <p className="mt-1 text-[0.68rem] text-ember">{promoError}</p>}
              {promo && (
                <p className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-volt/15 px-2.5 py-1.5 text-[0.7rem] font-medium text-[#3d7a2f]">
                  <span className="flex items-center gap-1"><Check size={11} /> {promo.code} applied — {promo.label}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPromo(null);
                      setPromoInput("");
                    }}
                    className="text-muted hover:text-ink"
                    aria-label="Remove promo code"
                  >
                    <X size={12} />
                  </button>
                </p>
              )}
              {!promo && (
                <p className="mt-1.5 text-[0.66rem] text-muted">
                  Try {PROMOS[0].code} for 10% off orders over ৳1,000.
                </p>
              )}
            </div>

            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[0.82rem]">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="font-medium">{formatBDT(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="font-medium">{shipping === 0 ? "Free" : formatBDT(shipping)}</dd>
              </div>
              {promoOff > 0 && (
                <div className="flex justify-between text-[#3d7a2f]">
                  <dt>Discount ({promo?.code})</dt>
                  <dd className="font-medium">−{formatBDT(promoOff)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="text-[0.9rem] font-semibold">Total</dt>
                <dd className="text-lg font-semibold">{formatBDT(total)}</dd>
              </div>
            </dl>

            <button
              type="submit"
              form="checkout-form"
              disabled={submitting}
              className="btn btn-primary mt-3 hidden w-full justify-between lg:flex"
            >
              {submitting ? (
                <>
                  <span className="flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Placing order…</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-2"><ShieldCheck size={15} /> Place order</span>
                  <span>{formatBDT(total)}</span>
                </>
              )}
            </button>
            <p className="mt-2 text-center text-[0.66rem] leading-relaxed text-muted">
              By placing the order you agree to our returns and warranty terms. You&rsquo;ll get an
              order number instantly.
            </p>

            <div className="mt-3 flex items-center justify-center gap-2 border-t border-line-soft pt-3 text-[0.64rem] uppercase tracking-[0.12em] text-muted">
              <Lock size={10} /> Secure · bKash · Nagad · COD
            </div>

            <a
              href={`https://wa.me/${STORE.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center gap-2 rounded-xl bg-bone p-2.5 text-[0.74rem]"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-ink text-volt">
                <Headphones size={13} />
              </span>
              <span>
                <span className="block font-semibold">Need help ordering?</span>
                <span className="text-muted">Order on WhatsApp.</span>
              </span>
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
