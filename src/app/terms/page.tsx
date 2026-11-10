import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { ops } from "@/db/ops-store";

export const metadata: Metadata = {
  title: "Terms of sale",
  description: "The terms that apply when you buy batteries, packs, UPS units and components from Glowing Space BD.",
};

export default function TermsPage() {
  const { identity, shipping } = ops.state.settings;
  return (
    <LegalLayout
      title="Terms of sale"
      updated="1 February 2026"
      intro="Plain terms covering pricing, payment, delivery, warranty and safe use of lithium cells. Placing an order means you accept them."
      sections={[
        {
          id: "orders",
          heading: "Placing an order",
          body: (
            <>
              <p>An order is an offer to buy. The contract forms when we confirm the order by SMS, WhatsApp or on the confirmation page. We may decline an order if stock has run out, if the price was listed in error, or if fraud checks fail.</p>
              <p>You must give a working Bangladeshi mobile number and a complete delivery address. Orders with unreachable numbers may be cancelled after two contact attempts.</p>
            </>
          ),
        },
        {
          id: "pricing",
          heading: "Prices and payment",
          body: (
            <>
              <p>All prices are in Bangladeshi Taka and include VAT where applicable. Cell prices move with import costs; the price shown at checkout is the price you pay.</p>
              <p>We accept bKash, Nagad, card payments through SSLCommerz, and cash on delivery. Prepaid orders are confirmed once the provider verifies the transaction — a transaction ID typed into the site is a claim, not proof of payment.</p>
              <p>Cash on delivery is available up to ৳{shipping.codMaxOrder.toLocaleString("en-IN")}. Orders above ৳{shipping.codAdvanceAbove.toLocaleString("en-IN")} need a ৳{shipping.codAdvanceAmount} advance. Custom packs may need a deposit confirmed with your quote.</p>
            </>
          ),
        },
        {
          id: "delivery",
          heading: "Delivery",
          body: (
            <>
              <p>Standard courier is ৳{shipping.insideDhaka} inside Dhaka (1–2 days) and ৳{shipping.outsideDhaka} elsewhere (2–4 days). Express same-day inside Dhaka Metro is ৳{shipping.expressInside} for orders placed before 4 PM.</p>
              <p>Standard delivery is free over ৳{shipping.freeThreshold.toLocaleString("en-IN")}. Delivery estimates are working days and exclude Fridays and public holidays. Lithium cells travel by road only — air freight is not permitted for loose cells.</p>
              <p>Risk passes to you when the parcel is signed for. Check the pack for damage before signing; note any damage with the rider.</p>
            </>
          ),
        },
        {
          id: "warranty",
          heading: "Warranty",
          body: (
            <>
              <p>The warranty period is printed on each product page, typically 3–12 months. It covers manufacturing faults: cells that fail capacity testing, BMS boards that fail to protect, and packs with defective welds.</p>
              <p>It does <b className="text-ink">not</b> cover water damage, reversed polarity, over-discharge below the cut-off, physical damage, opened or modified packs, or use outside the stated current rating.</p>
              <p>Send your order number, a photo and a description of the fault. We inspect, then repair or replace. See <a className="font-semibold text-ink underline" href="/refunds">returns and refunds</a> for the process.</p>
            </>
          ),
        },
        {
          id: "safety",
          heading: "Safe use of lithium cells",
          body: (
            <>
              <p><b className="text-ink">Lithium cells are hazardous if mishandled.</b> By buying you confirm you understand how to charge, balance and protect them.</p>
              <p>Always use a correctly rated BMS and charger. Never charge unattended, never short the terminals, never spot-weld without training, and never use a swollen, dented or vented cell. Store at partial charge away from heat.</p>
              <p>We supply components for competent builders. We are not liable for damage or injury caused by incorrect assembly, missing protection or use beyond the published specification.</p>
            </>
          ),
        },
        {
          id: "custom",
          heading: "Custom packs",
          body: (
            <>
              <p>Custom packs are built to the voltage, capacity, dimensions and connector you specify in writing. You are responsible for the accuracy of that specification.</p>
              <p>Because they are made to order, custom packs can only be returned if faulty. Build time is confirmed with the quote and starts once the deposit clears.</p>
            </>
          ),
        },
        {
          id: "liability",
          heading: "Liability",
          body: (
            <>
              <p>Our total liability for any order is limited to the amount you paid for it. We are not liable for indirect losses such as lost profit or downtime.</p>
              <p>Nothing here limits your statutory rights under the Consumer Rights Protection Act 2009.</p>
            </>
          ),
        },
        {
          id: "law",
          heading: "Governing law",
          body: (
            <p>These terms are governed by the laws of Bangladesh. Disputes fall under the courts of Dhaka. We will always try to resolve a problem directly first — message {identity.phone}.</p>
          ),
        },
      ]}
    />
  );
}
