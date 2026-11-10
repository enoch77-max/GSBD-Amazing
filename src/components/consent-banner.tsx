"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, ShieldCheck, X } from "lucide-react";
import { ops } from "@/db/ops-store";
import { consentGranted, setConsent } from "@/lib/analytics";

/**
 * Consent gate for advertising pixels. Rendered only when the merchant requires
 * consent and the visitor has not answered yet; nothing fires until Accept.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [, force] = useState(0);

  useEffect(() => ops.subscribe(() => force((value) => value + 1)), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(ops.state.settings.marketing.consentRequired && ops.state.consent === "unset");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible || consentGranted()) return null;

  const decide = (value: "granted" | "denied") => {
    setConsent(value);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-2 bottom-2 z-[90] mx-auto max-w-2xl overflow-hidden rounded-2xl border border-line bg-cream/97 shadow-lift backdrop-blur-md sm:inset-x-4 sm:bottom-4"
      style={{ animation: "consent-in .34s cubic-bezier(.22,.68,.24,1) both" }}
    >
      <div className="flex items-start gap-3 p-3.5 sm:p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-volt/25 text-ink"><Cookie size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.85rem] font-semibold">We use cookies to run this shop</p>
          <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
            Essential cookies keep your bag and checkout working. With your permission we also measure which ads bring
            people here, so we can show you relevant offers instead of repeating the same one.
          </p>
          {expanded && (
            <ul className="mt-2 flex flex-col gap-1.5 rounded-xl bg-bone p-2.5 text-[0.72rem] text-muted">
              <li className="flex gap-2"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-[#3d7a2f]" /><span><b className="text-ink">Essential</b> — bag contents, checkout session, fraud checks. Always on.</span></li>
              <li className="flex gap-2"><Cookie size={13} className="mt-0.5 shrink-0" /><span><b className="text-ink">Advertising</b> — Meta Pixel, Google Analytics and TikTok, used to measure ad performance. Only with consent.</span></li>
              <li>Read the <Link href="/privacy" className="font-semibold text-ink underline">privacy policy</Link> for what is stored and for how long.</li>
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm min-h-10 px-4" onClick={() => decide("granted")}>Accept all</button>
            <button type="button" className="btn btn-outline btn-sm min-h-10 px-4" onClick={() => decide("denied")}>Essential only</button>
            <button type="button" className="min-h-10 px-1 text-[0.75rem] font-medium text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Hide details" : "What is stored?"}
            </button>
          </div>
        </div>
        <button type="button" onClick={() => decide("denied")} aria-label="Dismiss and use essential cookies only" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-bone hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <style>{`@keyframes consent-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
