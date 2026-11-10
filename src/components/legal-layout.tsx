import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { ops } from "@/db/ops-store";

export type LegalSection = { id: string; heading: string; body: ReactNode };

/** Shared shell for the policy pages ad platforms and gateways require. */
export function LegalLayout({ title, intro, updated, sections }: {
  title: string; intro: string; updated: string; sections: LegalSection[];
}) {
  const { identity } = ops.state.settings;
  return (
    <div className="shell pb-10 pt-4 sm:pt-6">
      <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={14} /> Back to the shop
      </Link>

      <header className="mt-2 rounded-2xl border border-line bg-cream p-4 sm:p-6">
        <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
          <FileText size={13} /> Legal
        </p>
        <h1 className="mt-1.5 text-[1.5rem] leading-tight sm:text-[2rem]">{title}</h1>
        <p className="mt-2 max-w-2xl text-[0.85rem] leading-relaxed text-muted">{intro}</p>
        <p className="mt-3 text-[0.7rem] text-muted">Last updated {updated} · {identity.legalName} · Trade licence {identity.tradeLicence} · BIN {identity.binNumber}</p>
      </header>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,0.26fr)_minmax(0,0.74fr)] lg:gap-6">
        <nav aria-label="On this page" className="rounded-2xl border border-line bg-cream p-3 lg:sticky lg:top-28">
          <p className="px-1 pb-2 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted">On this page</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="block rounded-lg px-2 py-1.5 text-[0.78rem] text-muted transition-colors hover:bg-bone hover:text-ink">
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-3">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-28 rounded-2xl border border-line bg-cream p-4 sm:p-5">
              <h2 className="flex items-baseline gap-2 text-lg">
                <span className="font-mono text-[0.7rem] text-muted">{String(index + 1).padStart(2, "0")}</span>
                {section.heading}
              </h2>
              <div className="legal-body mt-2 flex flex-col gap-2.5 text-[0.84rem] leading-relaxed text-muted">{section.body}</div>
            </section>
          ))}

          <section className="rounded-2xl bg-ink p-4 text-cream sm:p-5">
            <h2 className="text-lg">Questions about this policy?</h2>
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-cream/70">
              Write to <a className="font-semibold text-volt underline" href={`mailto:${identity.email}`}>{identity.email}</a> or
              message us on WhatsApp at {identity.phone}. We answer within one working day.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/privacy" className="btn btn-outline btn-sm min-h-10 border-cream/25 text-cream">Privacy</Link>
              <Link href="/terms" className="btn btn-outline btn-sm min-h-10 border-cream/25 text-cream">Terms</Link>
              <Link href="/refunds" className="btn btn-outline btn-sm min-h-10 border-cream/25 text-cream">Returns & refunds</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
