"use client";

import { useEffect, useRef } from "react";
import { Trash2, X } from "lucide-react";

export function ConfirmRemoveDialog({ name, onCancel, onConfirm }: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key !== "Tab") return;
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-remove-dialog] button"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4" data-remove-dialog role="presentation">
      <div className="absolute inset-0 bg-ink/55 backdrop-blur-[3px]" onClick={onCancel} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" aria-labelledby="remove-title" aria-describedby="remove-description" className="relative w-full max-w-sm rounded-2xl border border-line bg-cream p-5 shadow-lift">
        <button type="button" onClick={onCancel} aria-label="Close removal confirmation" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-muted hover:bg-bone"><X size={17} /></button>
        <span className="grid size-10 place-items-center rounded-xl bg-ember/10 text-ember"><Trash2 size={19} /></span>
        <h2 id="remove-title" className="mt-4 text-lg">Remove this product?</h2>
        <p id="remove-description" className="mt-1 text-sm leading-relaxed text-muted">Remove <strong className="font-semibold text-ink">{name}</strong> from your bag? You can add it again later.</p>
        <div className="mt-5 flex gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn btn-outline min-h-11 flex-1 px-3 text-sm">Keep product</button>
          <button type="button" onClick={onConfirm} className="btn min-h-11 flex-1 bg-ember px-3 text-sm text-white hover:bg-[#d94b2e]"><Trash2 size={15} /> Remove</button>
        </div>
      </div>
    </div>
  );
}