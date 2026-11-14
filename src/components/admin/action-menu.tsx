"use client";

/**
 * Clean dropdown / popover menu for row-level actions (the single `⋮` menu).
 * Replaces multi-button clutter across mobile cards and table rows.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

export type ActionMenuItem = {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
};

export function ActionMenu({
  items,
  label = "Actions",
  className,
}: {
  items: ActionMenuItem[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`relative inline-block ${className ?? ""}`} ref={menuRef}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="adm-icon-btn min-h-[44px] min-w-[44px] size-11 rounded-lg border border-[var(--ax-border)] bg-white text-neutral-700 hover:bg-neutral-100 hover:text-black"
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-[var(--ax-border)] bg-white p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, idx) => {
            const classes = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[0.82rem] font-medium transition-colors ${
              item.tone === "danger"
                ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                : "text-neutral-800 hover:bg-neutral-100"
            } ${item.disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`;

            if (item.href) {
              return (
                <a
                  key={idx}
                  href={item.href}
                  role="menuitem"
                  className={classes}
                  onClick={() => setOpen(false)}
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  <span>{item.label}</span>
                </a>
              );
            }

            return (
              <button
                key={idx}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={classes}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
