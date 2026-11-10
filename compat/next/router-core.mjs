/**
 * History-backed router core shared by next/link and next/navigation.
 * Falls back to hash routing when the embedding sandbox blocks pushState.
 */
import { createContext, useContext, useSyncExternalStore } from "react";

const listeners = new Set();
const KNOWN_ROUTE = /^\/(?:$|shop\/|product\/|checkout|track|order\/|about|support)/;

function stripIndex(pathname) {
  return pathname.endsWith("/index.html") ? pathname.slice(0, -"index.html".length) : pathname;
}

function detectBase() {
  if (typeof window === "undefined") return "";
  const raw = window.location.pathname;
  // Only directory-style mount points ("/preview/id/", "/preview/id/index.html")
  // are treated as a base path; an unknown file-style path is a real 404.
  const isDirectory = raw.endsWith("/") || raw.endsWith("/index.html");
  const path = stripIndex(raw).replace(/\/+$/, "");
  if (!path) return "";
  if (KNOWN_ROUTE.test(`${path}/`)) return "";
  return isDirectory ? path : "";
}

export const BASE = detectBase();
export let hashMode = false;

function computeUrl() {
  if (typeof window === "undefined") return "/";
  if (hashMode) {
    const raw = window.location.hash.replace(/^#/, "");
    return raw.startsWith("/") ? raw : "/";
  }
  let path = stripIndex(window.location.pathname);
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length);
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return `${path || "/"}${window.location.search}`;
}

let snapshot = { url: computeUrl(), version: 0 };

function emit() {
  snapshot = { url: computeUrl(), version: snapshot.version + 1 };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", emit);
  window.addEventListener("hashchange", () => {
    if (hashMode) emit();
  });
}

export function useRouteSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function splitUrl(url) {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const searchIndex = withoutHash.indexOf("?");
  const search = searchIndex >= 0 ? withoutHash.slice(searchIndex) : "";
  const pathname = (searchIndex >= 0 ? withoutHash.slice(0, searchIndex) : withoutHash) || "/";
  return { pathname: pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname, search, hash };
}

export function scrollToHash(hash) {
  if (typeof window === "undefined") return;
  const target = hash ? document.getElementById(decodeURIComponent(hash)) : null;
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function hardScroll(top) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, top);
  root.style.scrollBehavior = previous;
}

export function navigate(href, options = {}) {
  if (typeof window === "undefined") return;
  const { replace = false, scroll = true } = options;
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
  if (absolute) {
    window.location.assign(href);
    return;
  }

  const { pathname, search, hash } = splitUrl(href.startsWith("/") ? href : `/${href}`);
  const route = `${pathname}${search}${hash ? `#${hash}` : ""}`;
  const sameRoute = route === computeUrl();

  if (hashMode) {
    const nextHash = `#${route}`;
    if (replace) window.location.replace(`${window.location.pathname}${window.location.search}${nextHash}`);
    else window.location.hash = nextHash;
  } else {
    try {
      const target = `${BASE}${route}` || "/";
      if (replace) window.history.replaceState({ idx: Date.now() }, "", target);
      else window.history.pushState({ idx: Date.now() }, "", target);
    } catch {
      hashMode = true;
      window.location.hash = `#${route}`;
    }
  }

  emit();

  if (hash) {
    let attempts = 0;
    const tryScroll = () => {
      attempts += 1;
      if (!scrollToHash(hash) && attempts < 12) window.setTimeout(tryScroll, 60);
    };
    window.setTimeout(tryScroll, 40);
  } else if (scroll && !sameRoute) {
    hardScroll(0);
  }
}

export function refresh() {
  emit();
}

export const RouteParamsContext = createContext({});

export function useRouteParams() {
  return useContext(RouteParamsContext);
}

export function currentUrl() {
  return computeUrl();
}
