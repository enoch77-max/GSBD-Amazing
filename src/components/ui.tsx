import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { cn, formatBDT } from "@/lib/format";

export function Stars({
  rating,
  size = 14,
  className,
  showValue = false,
  count,
}: {
  rating: number;
  size?: number;
  className?: string;
  showValue?: boolean;
  count?: number;
}) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span className={cn("relative inline-flex shrink-0 items-center gap-1.5", className)}>
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((index) => {
          const fill = rounded >= index + 1 ? 1 : rounded >= index + 0.5 ? 0.5 : 0;
          return (
            <span key={index} className="relative inline-block" style={{ width: size, height: size }}>
              <Star size={size} className="absolute inset-0 text-line" strokeWidth={1.6} />
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star size={size} className="text-[#e6a63a]" fill="currentColor" strokeWidth={0} />
              </span>
            </span>
          );
        })}
      </span>
      {showValue && (
        <span className="text-xs font-semibold text-ink">
          {rating.toFixed(1)}
          {typeof count === "number" && (
            <span className="ml-1 font-normal text-muted">({count})</span>
          )}
        </span>
      )}
      <span className="sr-only">{rating.toFixed(1)} out of 5 stars</span>
    </span>
  );
}

export function Price({
  price,
  compareAt,
  size = "md",
  className,
}: {
  price: number;
  compareAt?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeMap = {
    sm: "text-sm",
    md: "text-[1.05rem]",
    lg: "text-3xl sm:text-[2.1rem]",
  };
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-2", className)}>
      <span className={cn("font-semibold tracking-tight text-ink", sizeMap[size])}>
        {formatBDT(price)}
      </span>
      {compareAt && compareAt > price ? (
        <span className="text-sm text-muted line-through">{formatBDT(compareAt)}</span>
      ) : null}
    </span>
  );
}

export function Badge({
  children,
  tone = "volt",
  className,
}: {
  children: ReactNode;
  tone?: "volt" | "ink" | "ember" | "outline" | "muted";
  className?: string;
}) {
  const tones = {
    volt: "bg-volt text-ink",
    ink: "bg-ink text-cream",
    ember: "bg-ember text-white",
    outline: "bg-cream/80 text-ink border border-line backdrop-blur",
    muted: "bg-[#eceadf] text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StockPill({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.72rem] font-medium text-muted">
        <span className="size-1.5 shrink-0 rounded-full bg-muted" />
        Out of stock
      </span>
    );
  }
  if (stock <= 10) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.72rem] font-medium text-ember">
        <span className="size-1.5 shrink-0 rounded-full bg-ember animate-pulse" />
        Only {stock} left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.72rem] font-medium text-[#3d7a2f]">
      <span className="size-1.5 shrink-0 rounded-full bg-[#61a83f]" />
      In stock
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  description,
  action,
  className,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && (
          <p className="eyebrow mb-1.5 flex items-center gap-2 text-muted">
            <span className="inline-block size-1.5 rounded-full bg-volt-deep" />
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl leading-tight sm:text-2xl">{title}</h2>
        {description && (
          <p className="mt-1.5 max-w-xl text-[0.8rem] leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
