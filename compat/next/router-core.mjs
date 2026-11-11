/**
 * History-backed router core shared by next/link and next/navigation.
 * Falls back to hash routing when the embedding sandbox blocks pushState.
 *
 * Scroll contract (mirrors the Next.js App Router):
 *   - push/replace to a new URL      → new page opens at the top, instantly
 *   - back/forward (popstate)        → the position that entry was left at, instantly
 *   - same-page "#anchor"            → smooth scroll to the anchor
 *   - cross-page "/page#anchor"      → new page opens at the anchor, instantly
 * Scrolling is *requested* during navigation and *applied* by the app shell in
 * a layout effect after the new route has committed, so the browser never
 * scrolls the outgoing page and never measures a half-rendered one.
 */
import { createContext, useContext, useSyncExternalStore } from "react";

const listeners = new Set();
const KNOWN_ROUTE = /^\/(?:$|shop\/|product\/|checkout|track|order\/|about|support|privacy|terms|refunds|admin|pack-builder|wishlist|help)/;

function stripIndex(pathname) {
  return pathname.endsWith("/index.html") ? pathname.slice(0, -"index.html".length) : pathname;
}

/* Documents whose URL carries no real path (about:srcdoc, blob:, data:) are a
   common way to mount a single-file preview inside an iframe. Their pathname is
   not a route ("srcdoc") and pushState is refused, so they start straight in
   hash mode ("#/shop") and resolve links against a stand-in origin. http(s) and
   file:// documents are unaffected. */
const OPAQUE_URL = typeof window !== "undefined" && !/^(https?|file):$/.test(window.location.protocol);
const LOCAL_ORIGIN = "http://gsbd.local";

function detectBase() {
  if (typeof window === "undefined" || OPAQUE_URL) return "";
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
export let hashMode = OPAQUE_URL;

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

/* ------------------------------------------------------------------ */
/* Scroll memory                                                       */
/* ------------------------------------------------------------------ */

const STORE_KEY = "gsbd.scroll.v1";
const MAX_ENTRIES = 80;
let positions = new Map();
let currentKey = "";
let restoring = false;
/** What the shell should do after the next commit. */
let pending = null;

function newKey() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function loadPositions() {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (raw) positions = new Map(JSON.parse(raw));
  } catch {
    positions = new Map();
  }
}

function persistPositions() {
  try {
    const entries = [...positions.entries()].slice(-MAX_ENTRIES);
    positions = new Map(entries);
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable (private mode) — in-memory memory still works */
  }
}

function keyFromState(state) {
  if (hashMode) return `url:${computeUrl()}`;
  return state && typeof state === "object" && typeof state.__gsbdKey === "string" ? state.__gsbdKey : "";
}

function saveCurrentPosition() {
  if (!currentKey || restoring) return;
  positions.set(currentKey, Math.round(window.scrollY));
}

/** Instant scroll that ignores any CSS scroll-behavior (spec: "instant" always wins). */
function jumpTo(top) {
  try {
    window.scrollTo({ top, left: 0, behavior: "instant" });
  } catch {
    window.scrollTo(0, top);
  }
}

function locationKey() {
  return `${window.location.pathname}${window.location.search}`;
}

let lastLocation = "";

if (typeof window !== "undefined") {
  loadPositions();
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    /* very old browsers: the shell still re-applies positions itself */
  }
  currentKey = keyFromState(window.history.state);
  if (!currentKey) {
    currentKey = newKey();
    try {
      window.history.replaceState({ ...(window.history.state || {}), __gsbdKey: currentKey }, "");
    } catch {
      hashMode = hashMode || false;
    }
  }
  lastLocation = locationKey();
  /* A reload of a page the shopper had scrolled restores that position too. */
  if (positions.has(currentKey)) pending = { type: "restore", top: positions.get(currentKey) };

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        saveCurrentPosition();
      });
    },
    { passive: true },
  );
  window.addEventListener("pagehide", () => {
    saveCurrentPosition();
    persistPositions();
  });
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

function onPopState(event) {
  /* The outgoing entry's position was saved continuously by the scroll listener. */
  const nextLocation = locationKey();
  const hashOnly = !hashMode && nextLocation === lastLocation;
  const key = keyFromState(event.state) || (hashMode ? `url:${computeUrl()}` : newKey());
  currentKey = key;
  lastLocation = nextLocation;
  if (hashOnly) {
    const known = positions.get(key);
    pending = known !== undefined ? { type: "smooth-to", top: known } : { type: "hash", hash: window.location.hash.slice(1), smooth: true };
  } else {
    pending = { type: "restore", top: positions.get(key) ?? 0 };
  }
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", onPopState);
  window.addEventListener("hashchange", () => {
    if (hashMode) onPopState({ state: null });
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

function findAnchor(hash) {
  if (!hash) return null;
  let id = hash;
  try {
    id = decodeURIComponent(hash);
  } catch {
    /* keep raw */
  }
  return document.getElementById(id) || document.getElementsByName(id)[0] || null;
}

/** Smooth scroll to an in-page anchor. Returns false when it is not mounted yet. */
export function scrollToHash(hash, smooth = true) {
  if (typeof window === "undefined") return false;
  const target = findAnchor(hash);
  if (!target) return false;
  target.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "start" });
  /* Skip links and landmark targets receive focus, as with native anchors. */
  if (target.tagName === "MAIN" || target.hasAttribute("tabindex")) {
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Applying the requested scroll after commit                          */
/* ------------------------------------------------------------------ */

let cancelRestore = null;

function restoreTo(top) {
  if (cancelRestore) cancelRestore();
  const root = document.documentElement;
  const reachable = () => root.scrollHeight - window.innerHeight >= top - 1;
  jumpTo(top);
  if (top === 0 || reachable()) return;
  /* Content (images, async data) may still be growing: re-apply on each frame
     until the page is tall enough, the shopper takes over, or 1.5s passes. */
  restoring = true;
  let frame = 0;
  const started = performance.now();
  const stop = () => {
    restoring = false;
    window.cancelAnimationFrame(frame);
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((type) => window.removeEventListener(type, stop, true));
    cancelRestore = null;
    saveCurrentPosition();
  };
  ["wheel", "touchstart", "keydown", "pointerdown"].forEach((type) => window.addEventListener(type, stop, { capture: true, passive: true }));
  const tick = () => {
    jumpTo(top);
    if (reachable() || performance.now() - started > 1500) {
      stop();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  cancelRestore = stop;
}

function scrollToHashWhenReady(hash, smooth) {
  let attempts = 0;
  const attempt = () => {
    attempts += 1;
    if (scrollToHash(hash, smooth)) return;
    if (attempts < 20) window.requestAnimationFrame(attempt);
  };
  attempt();
}

/** Called by the app shell in a layout effect, after the new route has committed. */
export function applyPendingScroll() {
  if (typeof window === "undefined" || !pending) return;
  const request = pending;
  pending = null;
  switch (request.type) {
    case "top":
      if (cancelRestore) cancelRestore();
      jumpTo(0);
      break;
    case "restore":
      restoreTo(request.top);
      break;
    case "smooth-to":
      window.scrollTo({ top: request.top, left: 0, behavior: "smooth" });
      break;
    case "hash":
      if (!request.smooth) jumpTo(0);
      scrollToHashWhenReady(request.hash, request.smooth);
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export function navigate(href, options = {}) {
  if (typeof window === "undefined") return;
  const { replace = false, scroll = true } = options;
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
  if (absolute) {
    window.location.assign(href);
    return;
  }

  /* "#id" and "?q" are relative to the current page, as in a browser. */
  const current = splitUrl(computeUrl());
  let resolved = href;
  if (href.startsWith("#")) resolved = `${current.pathname}${current.search}${href}`;
  else if (href.startsWith("?")) resolved = `${current.pathname}${href}`;
  else if (!href.startsWith("/")) resolved = `/${href}`;

  const { pathname, search, hash } = splitUrl(resolved);
  const route = `${pathname}${search}${hash ? `#${hash}` : ""}`;
  const samePage = `${pathname}${search}` === `${current.pathname}${current.search}`;
  const currentHash = hashMode ? "" : window.location.hash.slice(1);

  /* Same page, same (or no) hash: nothing to load. Scroll back to the top/anchor smoothly. */
  if (samePage && (hash === currentHash || (!hash && !currentHash))) {
    if (hash) scrollToHash(hash, true);
    else if (scroll) window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    return;
  }

  saveCurrentPosition();
  const key = replace ? currentKey || newKey() : newKey();

  if (hashMode) {
    const nextHash = `#${route}`;
    /* Absolute URL: a relative one would resolve against the embedder's base URL
       inside an about:srcdoc document and navigate the frame away. */
    if (replace) window.location.replace(`${window.location.href.split("#")[0]}${nextHash}`);
    else window.location.hash = nextHash;
  } else {
    try {
      const target = `${BASE}${route}` || "/";
      const state = { __gsbdKey: key };
      if (replace) window.history.replaceState(state, "", target);
      else window.history.pushState(state, "", target);
    } catch {
      hashMode = true;
      window.location.hash = `#${route}`;
    }
  }
  currentKey = hashMode ? `url:${route}` : key;
  lastLocation = locationKey();

  if (samePage && hash) pending = { type: "hash", hash, smooth: true };
  else if (hash) pending = { type: "hash", hash, smooth: false };
  else if (scroll) pending = { type: "top" };
  else pending = null;
  /* Seed the new entry: a top-of-page navigation starts at 0; a scroll:false
     navigation (filters, pagination) keeps — and must remember — the current offset. */
  positions.set(currentKey, pending && pending.type === "top" ? 0 : Math.round(window.scrollY));

  emit();
}

export function refresh() {
  emit();
}

/* ------------------------------------------------------------------ */
/* Plain <a href="/…"> and <a href="#…"> become client navigations     */
/* ------------------------------------------------------------------ */

function interceptAnchors(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor) return;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download") || anchor.dataset.native !== undefined) return;
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return;
  let url;
  try {
    /* about:srcdoc / blob: cannot act as a URL base: resolve against the current route instead. */
    url = OPAQUE_URL ? new URL(raw, `${LOCAL_ORIGIN}${computeUrl()}`) : new URL(raw, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== (OPAQUE_URL ? LOCAL_ORIGIN : window.location.origin)) return;
  let path = url.pathname;
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length) || "/";
  /* Static files (images, sitemap, robots) must load normally. */
  if (/\.[a-z0-9]{2,5}$/i.test(path) && !path.endsWith(".html")) return;
  event.preventDefault();
  navigate(`${path}${url.search}${url.hash}`);
}

if (typeof document !== "undefined") document.addEventListener("click", interceptAnchors);

export const RouteParamsContext = createContext({});

export function useRouteParams() {
  return useContext(RouteParamsContext);
}

export function currentUrl() {
  return computeUrl();
}
