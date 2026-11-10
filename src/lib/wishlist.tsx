"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "gsbd-wishlist";
const EVENT = "gsbd:wishlist-changed";

type WishlistValue = {
  slugs: string[];
  hydrated: boolean;
  count: number;
  isSaved: (slug: string) => boolean;
  toggle: (slug: string) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

const WishlistContext = createContext<WishlistValue | null>(null);

function readStored(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length < 140))].slice(0, 200);
  } catch {
    return [];
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSlugs(readStored());
    setHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setSlugs(readStored());
    };
    const onLocal = () => setSlugs(readStored());
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT, onLocal);
    };
  }, []);

  const write = useCallback((next: string[]) => {
    setSlugs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Keep the in-memory list when storage is blocked or full. */
    }
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);

  const toggle = useCallback((slug: string) => {
    const current = readStored();
    const next = current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug];
    write([...new Set(next)]);
  }, [write]);

  const remove = useCallback((slug: string) => write(readStored().filter((entry) => entry !== slug)), [write]);
  const clear = useCallback(() => write([]), [write]);
  const isSaved = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  const value = useMemo<WishlistValue>(() => ({
    slugs,
    hydrated,
    count: slugs.length,
    isSaved,
    toggle,
    remove,
    clear,
  }), [slugs, hydrated, isSaved, toggle, remove, clear]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistValue {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used inside WishlistProvider");
  return context;
}
