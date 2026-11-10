import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { ops } from "@/db/ops-store";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Glowing Space BD collects when you order, why we collect it, who we share it with and how to have it removed.",
};

export default function PrivacyPage() {
  const { identity } = ops.state.settings;
  return (
    <LegalLayout
      title="Privacy policy"
      updated="1 February 2026"
      intro="We collect the minimum needed to take your order, deliver it and honour the warranty. We do not sell your data. This page explains exactly what is stored and how to have it deleted."
      sections={[
        {
          id: "collect",
          heading: "What we collect",
          body: (
            <>
              <p><b className="text-ink">Order details you give us:</b> name, mobile number, delivery address, district, optional email and any delivery note. We need these to hand your parcel to a courier.</p>
              <p><b className="text-ink">Payment references:</b> the transaction ID and payment method. Card numbers are entered on the payment provider's own secure page and never reach our servers.</p>
              <p><b className="text-ink">Technical data:</b> pages viewed, the ad or link that brought you here, device type and an approximate location derived from your IP address. Advertising cookies are only set after you accept them.</p>
              <p><b className="text-ink">Bag contents:</b> stored in your own browser so your bag survives a refresh. Clearing your browser data removes it.</p>
            </>
          ),
        },
        {
          id: "why",
          heading: "Why we use it",
          body: (
            <>
              <p>To process and deliver your order, confirm it by SMS or WhatsApp, handle warranty claims and prevent fraudulent cash-on-delivery orders.</p>
              <p>With your consent, to measure which advertising works and to show relevant offers. You can withdraw consent at any time using the cookie banner or by writing to us.</p>
              <p>We rely on <i>performance of a contract</i> for order data, <i>legitimate interest</i> for fraud prevention, and <i>consent</i> for advertising measurement.</p>
            </>
          ),
        },
        {
          id: "sharing",
          heading: "Who we share it with",
          body: (
            <>
              <p><b className="text-ink">Couriers</b> (Pathao, Steadfast) receive your name, phone and address so they can deliver and collect cash.</p>
              <p><b className="text-ink">Payment providers</b> (bKash, Nagad, SSLCommerz) process the transaction under their own privacy terms.</p>
              <p><b className="text-ink">SMS gateway</b> receives your number to send order updates.</p>
              <p><b className="text-ink">Advertising platforms</b> (Meta, Google, TikTok) receive hashed contact details and purchase events only if you accepted advertising cookies.</p>
              <p>We never sell your personal data, and we do not share it with anyone else.</p>
            </>
          ),
        },
        {
          id: "retention",
          heading: "How long we keep it",
          body: (
            <>
              <p>Order records are kept for <b className="text-ink">six years</b> because Bangladeshi tax law requires it. Warranty records are kept for the warranty period plus one year.</p>
              <p>Abandoned bag records are deleted after 90 days. Analytics events are retained for 14 months. Marketing consent records are kept until you withdraw consent.</p>
            </>
          ),
        },
        {
          id: "rights",
          heading: "Your rights",
          body: (
            <>
              <p>You can ask for a copy of your data, ask us to correct it, ask us to delete it where the law allows, or object to advertising measurement.</p>
              <p>Email <a className="font-semibold text-ink underline" href={`mailto:${identity.email}`}>{identity.email}</a> from the address on your order, or message {identity.phone} from the number you ordered with. We respond within 30 days, usually much sooner.</p>
            </>
          ),
        },
        {
          id: "cookies",
          heading: "Cookies",
          body: (
            <>
              <p><b className="text-ink">Essential</b> — bag contents and checkout session. These cannot be switched off because the shop will not work without them.</p>
              <p><b className="text-ink">Advertising</b> — Meta Pixel, Google Analytics 4 and TikTok Pixel. Off until you accept. Rejecting them does not change your prices or your ability to order.</p>
            </>
          ),
        },
        {
          id: "security",
          heading: "Security",
          body: (
            <>
              <p>All traffic is encrypted with TLS. Payment credentials and API keys are held server-side and are never exposed to the browser. Admin access requires authentication and every order change is logged with the operator and timestamp.</p>
              <p>If a breach ever affects your data, we will tell you and the relevant authority without undue delay.</p>
            </>
          ),
        },
        {
          id: "contact",
          heading: "Who is responsible",
          body: (
            <p>{identity.legalName}, {identity.address}. Trade licence {identity.tradeLicence}, BIN {identity.binNumber}. Contact {identity.email} or {identity.phone}.</p>
          ),
        },
      ]}
    />
  );
}
