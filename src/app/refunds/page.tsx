import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";
import { ops } from "@/db/ops-store";

export const metadata: Metadata = {
  title: "Returns, refunds & warranty",
  description: "How to return an item, claim warranty and get your money back from Glowing Space BD, with the exact timelines.",
};

export default function RefundsPage() {
  const { identity } = ops.state.settings;
  return (
    <LegalLayout
      title="Returns, refunds & warranty"
      updated="1 February 2026"
      intro="Changed your mind, or something arrived faulty? Both are covered. Here is exactly what to do and how long each step takes."
      sections={[
        {
          id: "window",
          heading: "The short version",
          body: (
            <>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="w-full text-left text-[0.8rem]">
                  <thead className="bg-bone text-[0.68rem] uppercase tracking-[0.08em] text-muted">
                    <tr><th className="px-3 py-2 font-medium">Situation</th><th className="px-3 py-2 font-medium">Window</th><th className="px-3 py-2 font-medium">You get</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-line-soft"><td className="px-3 py-2">Unopened, changed mind</td><td className="px-3 py-2">14 days</td><td className="px-3 py-2 font-medium text-ink">Full refund</td></tr>
                    <tr className="border-t border-line-soft"><td className="px-3 py-2">Damaged in transit</td><td className="px-3 py-2">48 hours</td><td className="px-3 py-2 font-medium text-ink">Replacement or refund</td></tr>
                    <tr className="border-t border-line-soft"><td className="px-3 py-2">Wrong item sent</td><td className="px-3 py-2">7 days</td><td className="px-3 py-2 font-medium text-ink">Correct item, we pay courier</td></tr>
                    <tr className="border-t border-line-soft"><td className="px-3 py-2">Manufacturing fault</td><td className="px-3 py-2">Warranty period</td><td className="px-3 py-2 font-medium text-ink">Repair or replacement</td></tr>
                    <tr className="border-t border-line-soft"><td className="px-3 py-2">Custom pack, not faulty</td><td className="px-3 py-2">—</td><td className="px-3 py-2 text-muted">Not returnable</td></tr>
                  </tbody>
                </table>
              </div>
              <p>Return courier costs are on us when the fault is ours. For a change of mind, you pay the return leg.</p>
            </>
          ),
        },
        {
          id: "how",
          heading: "How to start a return",
          body: (
            <>
              <p><b className="text-ink">1.</b> Find your order number — it is on the confirmation page and in your SMS, and you can look it up any time on the <Link href="/track" className="font-semibold text-ink underline">track order</Link> page.</p>
              <p><b className="text-ink">2.</b> Message us on WhatsApp at {identity.phone} with the order number, a photo of the item and a short description of the problem.</p>
              <p><b className="text-ink">3.</b> We reply within one working day with a return authorisation and the address to send it to.</p>
              <p><b className="text-ink">4.</b> Pack it safely — cells must have taped terminals and be cushioned. Send it by any courier and share the tracking number.</p>
            </>
          ),
        },
        {
          id: "refunds",
          heading: "Getting your money back",
          body: (
            <>
              <p>Once the item reaches us we inspect it within 2 working days and tell you the outcome the same day.</p>
              <p><b className="text-ink">bKash / Nagad:</b> refunded to the same number within 3 working days of approval.</p>
              <p><b className="text-ink">Card (SSLCommerz):</b> refunded to the original card; your bank takes a further 5–10 working days to post it.</p>
              <p><b className="text-ink">Cash on delivery:</b> we send by bKash or Nagad to the number you give us, within 3 working days.</p>
              <p>Delivery charges are refunded when the fault is ours. Promo discounts are refunded at the amount you actually paid.</p>
            </>
          ),
        },
        {
          id: "warranty",
          heading: "Warranty claims",
          body: (
            <>
              <p>Every product page lists its warranty period. We capacity-test cells before dispatch and keep the batch record, so we can compare your returned cells against the batch they came from.</p>
              <p>We repair or replace at our discretion. If a replacement is unavailable we refund the purchase price, reduced only where the item has clearly been used well beyond normal testing.</p>
            </>
          ),
        },
        {
          id: "exclusions",
          heading: "What is not covered",
          body: (
            <>
              <p>Water or corrosion damage, reversed polarity, over-discharge below the cut-off voltage, physical damage, swollen or vented cells caused by misuse, opened or re-wrapped cells, modified packs, and use above the rated continuous current.</p>
              <p>Cells sold as tested pulls or graded stock carry the shorter warranty stated on their product page.</p>
            </>
          ),
        },
        {
          id: "cancellations",
          heading: "Cancelling before dispatch",
          body: (
            <>
              <p>Cancel free of charge any time before the parcel is handed to the courier — message us with the order number and we stop it.</p>
              <p>After dispatch, refuse the parcel and it comes back to us; we refund the item value less the return courier charge. Repeated refusals may mean future orders need prepayment.</p>
            </>
          ),
        },
      ]}
    />
  );
}
