import { Check, Home, Package, ShieldCheck, Truck } from "lucide-react";
import { ORDER_STEPS, statusIndex } from "@/lib/commerce";
import { cn } from "@/lib/format";

const icons = [ShieldCheck, Package, Truck, Home];

export function OrderTimeline({ status, className }: { status: string; className?: string }) {
  const current = statusIndex(status);
  const percent = (current / (ORDER_STEPS.length - 1)) * 100;

  return (
    <div className={cn("relative", className)}>
      <div
        className="absolute bottom-4 left-[1.15rem] top-4 w-0.5 rounded-full bg-line sm:inset-x-0 sm:bottom-auto sm:left-0 sm:top-[1.15rem] sm:h-0.5 sm:w-auto"
        aria-hidden
      />
      <div
        className="absolute left-[1.15rem] top-4 w-0.5 overflow-hidden rounded-full sm:inset-x-0 sm:top-[1.15rem] sm:h-0.5 sm:w-auto"
        aria-hidden
      >
        <span
          className="block w-full bg-gradient-to-b from-volt-deep to-volt transition-[height] duration-1000 ease-out sm:hidden"
          style={{ height: `${percent}%` }}
        />
        <span
          className="hidden h-full bg-gradient-to-r from-volt-deep to-volt transition-[width] duration-1000 ease-out sm:block"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="relative grid gap-5 sm:grid-cols-4 sm:gap-3">
        {ORDER_STEPS.map((step, index) => {
          const Icon = icons[index] ?? Package;
          const complete = index < current;
          const active = index === current;
          return (
            <li key={step.id} className="flex items-start gap-3 sm:flex-col sm:gap-2">
              <span
                className={cn(
                  "relative z-10 grid size-9 shrink-0 place-items-center rounded-full border-2 transition-colors duration-500",
                  complete && "border-volt-deep bg-volt-deep text-ink",
                  active && "animate-track-pulse border-ink bg-ink text-volt",
                  !complete && !active && "border-line bg-cream text-muted",
                )}
              >
                {complete ? <Check size={15} strokeWidth={3} /> : <Icon size={15} />}
              </span>
              <div className="min-w-0 pt-0.5 sm:pt-0">
                <p
                  className={cn(
                    "text-[0.8rem] font-semibold leading-tight",
                    active ? "text-ink" : complete ? "text-ink/80" : "text-muted",
                  )}
                >
                  {step.label}
                </p>
                <p className="mt-1 hidden text-[0.7rem] leading-snug text-muted sm:block">
                  {step.description}
                </p>
                <p
                  className={cn(
                    "mt-1 font-mono text-[0.56rem] uppercase tracking-[0.12em]",
                    active ? "text-volt-deep" : "text-muted/70",
                  )}
                >
                  {active ? "In progress" : complete ? "Done" : step.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
