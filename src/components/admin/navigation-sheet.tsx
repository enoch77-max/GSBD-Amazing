"use client";

import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight, X } from "lucide-react";

export type NavigationSheetItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  badge?: ReactNode;
  accent?: boolean;
  href?: string;
  tone?: "danger";
  onAction?: () => void;
};

type NavigationSheetGroup = {
  id: string;
  label: string;
  items: NavigationSheetItem[];
};

/** Full-width, readable navigation with a fixed header and a scrollable list. */
export function NavigationSheet({ groups, currentId, onClose, onSelect }: {
  groups: NavigationSheetGroup[];
  currentId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const controls = [...sheetRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], [tabindex='0']",
      )].filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      const outside = !sheetRef.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey, true);

    // Do not leave a mobile overlay covering the desktop sidebar after resizing.
    const desktop = window.matchMedia("(min-width: 961px)");
    const closeOnDesktop = () => { if (desktop.matches) closeRef.current(); };
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop();

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKey, true);
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const contents = (item: NavigationSheetItem) => (
    <>
      <span className="ax-sheet-icon" aria-hidden="true"><item.icon size={19} strokeWidth={1.8} /></span>
      <span className="ax-sheet-label">{item.label}</span>
      <span className="ax-sheet-trailing">
        {item.badge}
        {currentId === item.id
          ? <Check size={16} className="ax-sheet-check" aria-hidden="true" />
          : !item.onAction && <ChevronRight size={16} className="ax-sheet-chevron" aria-hidden="true" />}
      </span>
    </>
  );

  return (
    <div className="ax-sheet-root">
      <button type="button" className="ax-sheet-scrim" tabIndex={-1} aria-label="Dismiss navigation" onClick={onClose} />
      <div ref={sheetRef} className="ax-sheet" role="dialog" aria-modal="true" aria-labelledby="all-sections-title" tabIndex={-1}>
        <header className="ax-sheet-header">
          <span className="ax-sheet-grip" aria-hidden="true" />
          <div className="ax-sheet-heading">
            <h2 id="all-sections-title" className="ax-title-sm">All sections</h2>
            <button ref={closeButtonRef} type="button" className="ax-icon-btn" onClick={onClose} aria-label="Close all sections"><X size={19} /></button>
          </div>
        </header>
        <nav className="ax-sheet-scroll" aria-label="All console sections">
          {groups.filter((group) => group.items.length > 0).map((group) => (
            <section key={group.id} className="ax-sheet-group" aria-labelledby={`sheet-group-${group.id}`}>
              <h3 id={`sheet-group-${group.id}`} className="ax-sheet-group-title">{group.label}</h3>
              <ul className="ax-sheet-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    {item.href ? (
                      <Link href={item.href} className="ax-sheet-item" onClick={onClose}>{contents(item)}</Link>
                    ) : (
                      <button type="button" className="ax-sheet-item"
                        data-active={currentId === item.id || undefined}
                        data-accent={item.accent || undefined}
                        data-tone={item.tone}
                        aria-current={currentId === item.id ? "page" : undefined}
                        onClick={() => { if (item.onAction) { onClose(); item.onAction(); } else onSelect(item.id); }}>
                        {contents(item)}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </div>
    </div>
  );
}
