"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BatteryCharging, Boxes, Clock3, Search, ShieldCheck, Truck } from "lucide-react";
import { HELP_TOPICS, searchHelp } from "@/lib/help-content";
import { STORE } from "@/lib/commerce";

const ICONS = { battery: BatteryCharging, truck: Truck, shield: ShieldCheck, boxes: Boxes };

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const topics = useMemo(() => searchHelp(query), [query]);
  return (
    <div className="help-page">
      <section className="help-hero">
        <div className="shell py-8 text-center sm:py-12">
          <p className="eyebrow text-volt">Glowing Space help centre</p>
          <h1 className="mt-2 text-[2rem] sm:text-[2.8rem]">Straight answers.<br />Safer builds.</h1>
          <p className="mx-auto mt-3 max-w-xl text-[0.85rem] leading-relaxed text-cream/65">Practical guidance written by the workshop — from choosing a charger to returning a faulty pack.</p>
          <label className="help-search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search charging, courier, warranty, wholesale…" aria-label="Search help articles" />
            {query && <button type="button" onClick={() => setQuery("")} className="text-xs font-semibold">Clear</button>}
          </label>
        </div>
      </section>
      <div className="shell py-6 sm:py-9">
        <p className="mb-3 text-xs text-muted" aria-live="polite">{query ? `${topics.length} topic${topics.length === 1 ? "" : "s"} match “${query}”` : "Browse all workshop guides"}</p>
        {topics.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-cream p-8 text-center">
            <h2 className="text-lg">No guide matches that search</h2>
            <p className="mt-2 text-sm text-muted">Try “charger”, “refund”, “Dhaka” or “bulk”, or ask the bench directly.</p>
            <button type="button" className="btn btn-outline btn-sm mt-4" onClick={() => setQuery("")}>Show every guide</button>
          </div>
        ) : (
          <div className="help-topic-grid">
            {topics.map((topic) => {
              const Icon = ICONS[topic.icon];
              return (
                <Link key={topic.slug} href={`/help/${topic.slug}`} className="help-topic-card">
                  <span className="help-topic-icon"><Icon size={23} /></span>
                  <div className="min-w-0 flex-1">
                    <h2>{topic.title}</h2>
                    <p>{topic.summary}</p>
                    <span className="help-topic-meta"><Clock3 size={12} /> {topic.readMinutes} min read · {topic.sections.length} sections <ArrowRight size={13} /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <section className="help-contact">
          <div><p className="eyebrow text-volt">Still stuck?</p><h2>Talk to a person who builds these packs.</h2><p>Send your order number, product model and a photo of the wiring if relevant.</p></div>
          <div><a href={`https://wa.me/${STORE.whatsapp}`} target="_blank" rel="noreferrer" className="btn btn-volt">WhatsApp the bench <ArrowRight size={14} /></a><a href={`tel:${STORE.phone.replace(/\s/g, "")}`} className="btn btn-outline">Call {STORE.phone}</a></div>
        </section>
      </div>
    </div>
  );
}
