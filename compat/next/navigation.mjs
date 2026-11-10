import { useMemo } from "react";
import { navigate, refresh, splitUrl, useRouteParams, useRouteSnapshot } from "./router-core.mjs";

export const NOT_FOUND = Symbol.for("gsbd.notFound");
export const REDIRECT = Symbol.for("gsbd.redirect");

export function useRouter() {
  return useMemo(
    () => ({
      push: (href, options) => navigate(href, { ...options, replace: false }),
      replace: (href, options) => navigate(href, { ...options, replace: true }),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => refresh(),
      prefetch: () => Promise.resolve(),
    }),
    [],
  );
}

export function usePathname() {
  const snapshot = useRouteSnapshot();
  return splitUrl(snapshot.url).pathname;
}

export function useSearchParams() {
  const snapshot = useRouteSnapshot();
  return useMemo(() => new URLSearchParams(splitUrl(snapshot.url).search), [snapshot.url]);
}

export function useParams() {
  return useRouteParams();
}

export function useSelectedLayoutSegment() {
  const pathname = usePathname();
  return pathname.split("/").filter(Boolean)[0] ?? null;
}

export function useSelectedLayoutSegments() {
  const pathname = usePathname();
  return pathname.split("/").filter(Boolean);
}

export function notFound() {
  const error = new Error("NEXT_NOT_FOUND");
  error.digest = NOT_FOUND;
  throw error;
}

export function redirect(href, type = "push") {
  const error = new Error("NEXT_REDIRECT");
  error.digest = REDIRECT;
  error.destination = href;
  error.replace = type === "replace";
  throw error;
}

export const permanentRedirect = (href) => redirect(href, "replace");
