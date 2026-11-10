import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BatteryCharging, Boxes, Check, Clock3, ShieldCheck, Truck } from "lucide-react";
import { HELP_TOPICS, findHelpTopic } from "@/lib/help-content";
import { STORE } from "@/lib/commerce";

const ICONS = { battery: BatteryCharging, truck: Truck, shield: ShieldCheck, boxes: Boxes };

export default function HelpTopicPage() {
  const { topic: slug } = useParams<{ topic: string }>();
  const topic = findHelpTopic(slug ?? "");
  if (!topic) notFound();
  const Icon = ICONS[topic.icon];
  const currentIndex = HELP_TOPICS.findIndex((entry) => entry.slug === topic.slug);
  const next = HELP_TOPICS[(currentIndex + 1) % HELP_TOPICS.length];
  return (
    <div className="help-article-page">
      <div className="shell max-w-5xl py-5 sm:py-8">
        <Link href="/help" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"><ArrowLeft size={13} /> All help topics</Link>
        <header className="help-article-head">
          <span className="help-topic-icon"><Icon size={24} /></span>
          <div><p className="eyebrow text-muted">Workshop guide</p><h1>{topic.title}</h1><p>{topic.summary}</p><span><Clock3 size={12} /> {topic.readMinutes} minute read</span></div>
        </header>
        <div className="help-article-layout">
          <aside className="help-article-toc no-print">
            <p>In this guide</p>
            <ol>{topic.sections.map((section, index) => <li key={section.heading}><a href={`#section-${index + 1}`}>{String(index + 1).padStart(2, "0")} · {section.heading}</a></li>)}</ol>
            <Link href="/pack-builder" className="btn btn-primary btn-sm mt-4 w-full">Open pack builder <ArrowRight size={12} /></Link>
          </aside>
          <article className="help-article-body">
            {topic.sections.map((section, index) => (
              <section key={section.heading} id={`section-${index + 1}`}>
                <span className="help-section-number">{String(index + 1).padStart(2, "0")}</span>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}><Check size={14} /> <span>{bullet}</span></li>)}</ul>}
              </section>
            ))}
            <div className="help-article-support">
              <h2>Need an answer about your exact setup?</h2>
              <p>Include your cell model, series count, charger voltage and order number if you have one. Never send a damaged lithium battery before we agree on safe transport.</p>
              <a href={`https://wa.me/${STORE.whatsapp}`} target="_blank" rel="noreferrer" className="btn btn-primary">Ask the workshop <ArrowRight size={14} /></a>
            </div>
            <Link href={`/help/${next.slug}`} className="help-next-topic"><span>Next guide</span><strong>{next.title}</strong><ArrowRight size={17} /></Link>
          </article>
        </div>
      </div>
    </div>
  );
}
