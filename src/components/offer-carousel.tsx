"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type TouchEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, CircuitBoard, Cpu, Package, ShieldCheck, Wifi } from "lucide-react";
import { CircuitDecoration } from "@/components/circuit-decoration";
import { cn } from "@/lib/format";

export type OfferSlide = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string;
  alt: string;
  icon: "wifi" | "pack" | "cell" | "bms" | "diy";
  accent: string;
};

const SLIDE_ICONS = {
  wifi: Wifi,
  pack: Package,
  cell: ShieldCheck,
  bms: Cpu,
  diy: CircuitBoard,
} as const;

const AUTOPLAY_MS = 6200;

export function OfferCarousel({ slides }: { slides: OfferSlide[] }) {
  const [active, setActive] = useState(0);
  const [outgoing, setOutgoing] = useState<{ index: number; direction: number } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const transitionTimer = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback((next: number, requestedDirection?: number) => {
    if (count < 2) return;
    const target = ((next % count) + count) % count;
    if (target === active) return;
    const travel = requestedDirection ?? (Math.abs(next - active) > count / 2 ? (next > active ? -1 : 1) : (next > active ? 1 : -1));
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    setOutgoing({ index: active, direction: travel });
    setDirection(travel);
    setHasMoved(true);
    setActive(target);
    transitionTimer.current = window.setTimeout(() => {
      setOutgoing(null);
      transitionTimer.current = null;
    }, 760);
  }, [active, count]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || !visible || count < 2) return;
    const timer = window.setTimeout(() => go(active + 1, 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, paused, reducedMotion, visible, count, go]);

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0];
    const start = touchStart.current;
    touchStart.current = null;
    if (!touch || !start) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      const swipeDirection = dx < 0 ? 1 : -1;
      go(active + swipeDirection, swipeDirection);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(active - 1, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(active + 1, 1);
    }
  }

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Store offers"
      className="offer-panel offer-carousel relative mb-3 overflow-hidden rounded-2xl text-cream sm:rounded-[1.4rem]"
      onPointerEnter={event => { if (event.pointerType === "mouse") setPaused(true); }}
      onPointerLeave={event => { if (event.pointerType === "mouse") setPaused(false); }}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={onKeyDown}
      style={{ touchAction: "pan-y" }}
    >
      {/* All slides share one grid cell: no layout shift, no change in panel height. */}
      <div className="offer-slides grid">
        {slides.map((slide, index) => {
          const Icon = SLIDE_ICONS[slide.icon];
          const current = index === active;
          const leaving = outgoing?.index === index && !current;
          return (
            <article
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
              aria-hidden={!current}
              className={cn("offer-slide relative col-start-1 row-start-1", current ? (hasMoved ? "is-entering" : "is-active") : leaving ? "is-exiting" : "is-inactive")}
              data-direction={current ? direction : outgoing?.direction ?? direction}
              style={{ "--slide-accent": slide.accent } as CSSProperties}
            >
              <CircuitDecoration className="offer-circuit" />
              <div className="offer-copy relative z-10 max-w-[68%] px-4 py-4 sm:max-w-[62%] sm:px-7 sm:py-6">
                <p className="offer-label mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.11em] text-volt sm:text-xs">
                  {slide.eyebrow}
                </p>
                <h2 className="whitespace-nowrap text-[1rem] leading-[1.12] min-[360px]:text-[1.24rem] sm:text-[2.1rem]">
                  {slide.title}
                </h2>
                <p className="mb-2.5 mt-1 truncate text-[0.72rem] text-cream/70 sm:mb-3 sm:mt-2 sm:text-sm">
                  {slide.subtitle}
                </p>
                <Link
                  href={slide.href}
                  tabIndex={current ? 0 : -1}
                  className="offer-cta inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[0.72rem] font-semibold text-ink transition-colors sm:min-h-10 sm:px-4 sm:text-sm"
                >
                  {slide.cta} <ArrowRight size={13} />
                </Link>
              </div>
              <div className="offer-media">
                <Image
                  src={slide.image}
                  alt={slide.alt}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 640px) 45vw, 45vw"
                  className="offer-image object-cover object-center"
                />
                <span className="offer-signal" aria-hidden="true"><Icon size={16} strokeWidth={1.7} /></span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Compact controls overlay the artwork, so they add zero height. */}
      <div className="offer-controls absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1 rounded-full border border-white/15 bg-ink/65 px-1 py-1 backdrop-blur-md sm:bottom-3 sm:right-3">
        <button
          type="button"
          onClick={() => go(active - 1, -1)}
          aria-label="Previous offer"
          className="hidden size-7 place-items-center rounded-full text-cream/80 transition-colors hover:bg-white/10 hover:text-volt sm:grid"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="flex items-center gap-1 px-0.5" role="group" aria-label="Choose offer">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-current={index === active ? "true" : undefined}
              aria-label={`Show ${slide.eyebrow}`}
              onClick={() => go(index)}
              className={cn("offer-dot relative grid h-4 place-items-center", index === active && "is-active")}
            >
              <span className="offer-dot-track" aria-hidden="true">
                {index === active && !reducedMotion && (
                  <span key={active} className={cn("offer-dot-fill", paused && "is-paused")} />
                )}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(active + 1, 1)}
          aria-label="Next offer"
          className="hidden size-7 place-items-center rounded-full text-cream/80 transition-colors hover:bg-white/10 hover:text-volt sm:grid"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </section>
  );
}
