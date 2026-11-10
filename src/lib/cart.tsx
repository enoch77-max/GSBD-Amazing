"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { normalizePackConfiguration, packSlug, type PackComponent, type PackConfiguration } from "@/lib/pack-builder";

export type CartLine = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  qty: number;
  stock: number;
  /** Present only for made-to-order packs. The server recalculates its price. */
  customPack?: PackConfiguration;
  /** Display snapshot only; the backend always rebuilds its own quote. */
  packComponents?: PackComponent[];
};

type ToastData = { title: string; subtitle?: string; image?: string; id: number } | null;

type CartContextValue = {
  lines: CartLine[];
  hydrated: boolean;
  isOpen: boolean;
  itemCount: number;
  lineCount: number;
  subtotal: number;
  pulse: number;
  toast: ToastData;
  lastAddedSlug: string | null;
  addItem: (line: Omit<CartLine, "qty">, qty?: number) => void;
  replaceItem: (slug: string, line: Omit<CartLine, "qty">) => void;
  removeItem: (slug: string) => void;
  updateQty: (slug: string, qty: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  dismissToast: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "gsbd-cart-v1";

function maxQtyFor(line: { stock: number }) {
  if (line.stock <= 0) return 99;
  return Math.max(1, Math.min(line.stock, 20));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [toast, setToast] = useState<ToastData>(null);
  const [lastAddedSlug, setLastAddedSlug] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) {
          setLines(
            parsed
              .filter((line) => line && typeof line.slug === "string" && typeof line.price === "number")
              .map((line) => {
                if (!line.customPack) return { ...line, qty: Math.max(1, Math.min(20, Number(line.qty) || 1)) };
                try {
                  const config = normalizePackConfiguration(line.customPack);
                  return { ...line, slug: packSlug(config), customPack: config, qty: Math.max(1, Math.min(20, Number(line.qty) || 1)) };
                } catch {
                  // Preserve old or malformed cart data so the shopper can remove it.
                  return { ...line, qty: Math.max(1, Math.min(20, Number(line.qty) || 1)) };
                }
              }),
          );
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage may be unavailable
    }
  }, [lines, hydrated]);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const scheduleDismiss = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const addItem = useCallback(
    (line: Omit<CartLine, "qty">, qty = 1) => {
      setLines((current) => {
        const existing = current.find((entry) => entry.slug === line.slug);
        if (existing) {
          return current.map((entry) =>
            entry.slug === line.slug
              ? { ...entry, ...line, qty: Math.min(maxQtyFor(line), entry.qty + qty) }
              : entry,
          );
        }
        return [...current, { ...line, qty: Math.max(1, Math.min(qty, maxQtyFor(line))) }];
      });
      void import("@/lib/analytics").then(({ track }) =>
        track("AddToCart", {
          content_ids: [line.slug],
          content_name: line.name,
          content_type: "product",
          value: line.price * qty,
          num_items: qty,
          contents: [{ id: line.slug, quantity: qty, item_price: line.price }],
        }),
      );
      setPulse((value) => value + 1);
      setLastAddedSlug(line.slug);
      setToast({ title: `${line.name}`, subtitle: "Added to your bag", image: line.image, id: Date.now() });
      scheduleDismiss();
      setTimeout(() => setLastAddedSlug(null), 2200);
    },
    [scheduleDismiss],
  );

  const removeItem = useCallback((slug: string) => {
    setLines((current) => current.filter((line) => line.slug !== slug));
  }, []);

  const replaceItem = useCallback((slug: string, next: Omit<CartLine, "qty">) => {
    setLines((current) => {
      const original = current.find((line) => line.slug === slug);
      if (!original) return current;
      const duplicate = current.find((line) => line.slug === next.slug && line.slug !== slug);
      if (duplicate) {
        return current.filter((line) => line.slug !== slug).map((line) =>
          line.slug === next.slug ? { ...line, ...next, qty: Math.min(maxQtyFor(next), line.qty + original.qty) } : line,
        );
      }
      return current.map((line) => line.slug === slug ? { ...next, qty: Math.min(maxQtyFor(next), original.qty) } : line);
    });
    setLastAddedSlug(next.slug);
  }, []);

  const updateQty = useCallback((slug: string, qty: number) => {
    setLines((current) =>
      current.map((line) =>
        line.slug === slug
          ? { ...line, qty: Math.max(1, Math.min(maxQtyFor(line), Number(qty) || 1)) }
          : line,
      ),
    );
  }, []);

  const clearCart = useCallback(() => setLines([]), []);
  const openCart = useCallback(() => {
    setIsOpen(true);
    setToast(null);
  }, []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
    return {
      lines,
      hydrated,
      isOpen,
      itemCount,
      lineCount: lines.length,
      subtotal,
      pulse,
      toast,
      lastAddedSlug,
      addItem,
      replaceItem,
      removeItem,
      updateQty,
      clearCart,
      openCart,
      closeCart,
      dismissToast,
    };
  }, [
    lines,
    hydrated,
    isOpen,
    pulse,
    toast,
    lastAddedSlug,
    addItem,
    replaceItem,
    removeItem,
    updateQty,
    clearCart,
    openCart,
    closeCart,
    dismissToast,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
