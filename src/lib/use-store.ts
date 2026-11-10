import { useSyncExternalStore } from "react";
import { store } from "@/db/local-store";

/**
 * Re-renders a page whenever the storefront tables change (new review,
 * new order, recalculated rating) — the client-side equivalent of the
 * `revalidatePath` / `router.refresh()` cycle used by the Next.js server.
 */
export function useStoreVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}
