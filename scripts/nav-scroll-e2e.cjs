/**
 * Navigation, scroll and transition regression suite (headless Chrome).
 *
 *   BASE=http://127.0.0.1:3000 node scripts/nav-scroll-e2e.cjs
 *
 * Needs puppeteer resolvable via NODE_PATH (kept out of package.json so the
 * production install stays lean). Every check samples scrollY on each
 * animation frame, so a smooth "fling" (intermediate positions) fails even if
 * the final position is right.
 */
const puppeteer = require("puppeteer");

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const ROUTES = [
  "/", "/shop", "/shop?category=battery-cells", "/product/samsung-inr18650-30q", "/product/molicel-p42a-21700",
  "/pack-builder", "/checkout", "/track", "/about", "/support", "/help", "/help/battery-safety",
  "/privacy", "/terms", "/refunds", "/wishlist",
];
const VIEWPORTS = {
  desktop: { viewport: { width: 1366, height: 850 } },
  mobile: {
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  },
};

const results = [];
const fail = (name, detail) => results.push({ ok: false, name, detail });
const pass = (name) => results.push({ ok: true, name });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* In-page recorder: one sample per animation frame. */
const RECORDER = () => {
  window.__rec = { samples: [], t0: performance.now(), running: false };
  window.__shifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__shifts.push({ t: entry.startTime, value: entry.value, src: (entry.sources || []).map((source) => source.node ? `${source.node.tagName}.${String(source.node.className).split(" ")[0]}` : "?").join(",") });
      }
    }).observe({ type: "layout-shift", buffered: false });
  } catch { /* unsupported */ }
  window.__startRec = (ms) => {
    const rec = window.__rec;
    window.__shifts = [];
    rec.navStart = null;
    rec.clickAt = performance.now();
    rec.swapAt = null;
    const host = document.querySelector("[data-route-view]")?.parentElement;
    if (host) {
      const observer = new MutationObserver(() => {
        if (rec.swapAt === null && document.querySelector("[data-route-view]") && [...host.children].some((child) => child.hasAttribute("data-route-view"))) {
          rec.swapAt = performance.now();
          /* The swap's own layout shift is stamped at the first frame that paints it. */
          requestAnimationFrame(() => { rec.swapPaint = performance.now(); });
          observer.disconnect();
        }
      });
      observer.observe(host, { childList: true });
    }
    rec.samples = [];
    rec.t0 = performance.now();
    rec.running = true;
    const frame = () => {
      const view = document.querySelector("[data-route-view]") || document.querySelector(".route-view");
      const fixedBar = document.querySelector("[data-sticky-checkout]");
      if (rec.navStart === null && rec.samples.length && rec.samples[rec.samples.length - 1].path !== location.pathname + location.search) rec.navStart = performance.now();
      rec.samples.push({
        t: Math.round(performance.now() - rec.t0),
        y: Math.round(window.scrollY),
        path: location.pathname + location.search,
        opacity: view ? Number(getComputedStyle(view).opacity) : 1,
        viewTop: view ? Math.round(view.getBoundingClientRect().top + window.scrollY) : null,
        barBottom: fixedBar && getComputedStyle(fixedBar).display !== "none" ? Math.round(fixedBar.getBoundingClientRect().bottom) : null,
        innerH: window.innerHeight,
      });
      if (performance.now() - rec.t0 < ms) requestAnimationFrame(frame);
      else rec.running = false;
    };
    requestAnimationFrame(frame);
  };
};

async function setScroll(page, y) {
  await page.evaluate((target) => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, target);
    root.style.scrollBehavior = previous;
  }, y);
  await sleep(120);
  return page.evaluate(() => Math.round(window.scrollY));
}

async function maxScroll(page) {
  return page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
}

async function waitIdle(page) {
  await page.waitForFunction(() => !window.__rec || !window.__rec.running, { timeout: 5000 });
}

async function clickHref(page, href) {
  /* Prefer a real link already on the page; otherwise inject a plain anchor (exercises global interception). */
  return page.evaluate((target) => {
    const url = new URL(target, location.origin);
    let link = [...document.querySelectorAll("a[href]")].find((a) => {
      try {
        const candidate = new URL(a.getAttribute("href"), location.href);
        return candidate.pathname + candidate.search === url.pathname + url.search && !candidate.hash && candidate.origin === location.origin && !a.target;
      } catch { return false; }
    });
    let injected = false;
    if (!link) {
      link = document.createElement("a");
      link.href = target;
      link.textContent = "test";
      link.style.cssText = "position:fixed;left:0;top:0;opacity:0";
      document.body.appendChild(link);
      injected = true;
    }
    link.click();
    return injected;
  }, href);
}

function analyseRouteChange(samples, fromPath, toPath, extra = {}) {
  const problems = [];
  const after = samples.filter((sample) => sample.path === toPath);
  if (!after.length) return [`never reached ${toPath}`];
  const first = after[0];
  if (first.y !== 0) problems.push(`first frame on new route at y=${first.y} (expected 0)`);
  const moving = after.filter((sample) => sample.y !== 0);
  if (moving.length) problems.push(`scroll moved after arrival: ${moving.slice(0, 4).map((s) => s.y).join(",")}`);
  const fading = after.filter((sample) => sample.opacity < 0.999);
  if (fading.length) {
    const span = fading[fading.length - 1].t - first.t;
    let longestFrame = 0;
    for (let i = 1; i < after.length; i += 1) longestFrame = Math.max(longestFrame, after[i].t - after[i - 1].t);
    if (span > 200 + longestFrame) problems.push(`fade lasted ${span}ms (>200ms, longest frame ${longestFrame}ms)`);
  }
  if (extra.declaredMs !== undefined && extra.declaredMs > 200) problems.push(`declared transition ${extra.declaredMs}ms`);
  if (extra.shift !== undefined && extra.shift > 0.02) problems.push(`layout shift after arrival ${extra.shift.toFixed(3)} (${extra.shiftSrc})`);
  const tops = new Set(after.map((sample) => sample.viewTop).filter((value) => value !== null));
  if (tops.size > 1) problems.push(`route view shifted: ${[...tops].join("→")}`);
  const bars = after.filter((sample) => sample.barBottom !== null);
  const badBar = bars.find((sample) => Math.abs(sample.barBottom - sample.innerH) > 2);
  if (badBar) problems.push(`fixed checkout bar jumped (bottom ${badBar.barBottom} vs ${badBar.innerH})`);
  return problems;
}

async function freshPage(browser, kind) {
  const page = await browser.newPage();
  const view = VIEWPORTS[kind];
  if (view.userAgent) await page.setUserAgent(view.userAgent);
  await page.setViewport(view.viewport);
  await page.evaluateOnNewDocument(RECORDER);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.__errors = errors;
  return page;
}

async function seedBag(page) {
  await page.evaluate(() => sessionStorage.removeItem("gsbd.scroll.v1"));
  await page.evaluate(() => localStorage.setItem("gsbd-cart-v1", JSON.stringify([
    { id: 1, slug: "samsung-inr18650-30q", name: "Samsung 30Q", brand: "Samsung", price: 520, image: "", qty: 2, stock: 100 },
    { id: 2, slug: "molicel-p42a-21700", name: "Molicel P42A", brand: "Molicel", price: 880, image: "", qty: 2, stock: 100 },
  ])));
  /* The cart reads storage on mount: reload so the seeded bag is live. */
  await page.reload({ waitUntil: "networkidle0" });
}

/* ------------------------------------------------------------------ */

async function testInitialLoad(browser, kind) {
  const page = await freshPage(browser, kind);
  await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.__startRec(500));
  await sleep(600);
  const samples = await page.evaluate(() => window.__rec.samples);
  const dim = samples.filter((sample) => sample.opacity < 0.999);
  if (dim.length) fail(`${kind} initial load`, `content faded/flashed on first paint (${dim.length} frames)`);
  else pass(`${kind} initial load has no flash`);
  await page.close();
}

async function testAllRoutes(browser, kind) {
  const page = await freshPage(browser, kind);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await seedBag(page);
  let current = "/";
  const order = [...ROUTES.slice(1), "/"];
  for (const target of order) {
    const max = await maxScroll(page);
    const start = await setScroll(page, Math.min(700, Math.max(0, max - 10)));
    await page.evaluate(() => window.__startRec(650));
    const injected = await clickHref(page, target);
    await sleep(700);
    await waitIdle(page);
    const samples = await page.evaluate(() => window.__rec.samples);
    const navigationType = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type);
    const extra = await page.evaluate(() => {
      const view = document.querySelector("[data-route-view]");
      const declared = view ? parseFloat(getComputedStyle(view).animationDuration) * 1000 : 0;
      const rec = window.__rec;
      /* New page: ignore the swap frame itself (≤2 frames after the route view mounts).
         Same page (query change): content legitimately updates — use the CLS 500ms input window. */
      const cutoff = rec.swapAt !== null ? (rec.swapPaint ?? rec.swapAt) + 20 : rec.clickAt + 500;
      const late = window.__shifts.filter((entry) => entry.t > cutoff);
      return { declaredMs: declared, shift: late.reduce((sum, entry) => sum + entry.value, 0), shiftSrc: [...new Set(late.map((entry) => entry.src))].join(" ") };
    });
    const problems = analyseRouteChange(samples, current, target, extra);
    const reloaded = samples.length === 0 || (await page.evaluate(() => !window.__rec || window.__rec.samples.length === 0));
    if (reloaded) problems.push("full page reload instead of client navigation");
    if (problems.length) fail(`${kind} ${current} (y=${start}) → ${target}${injected ? " [plain <a>]" : ""}`, problems.join("; "));
    else pass(`${kind} ${current} → ${target}`);
    void navigationType;
    current = target;
  }
  if (page.__errors.length) fail(`${kind} route sweep page errors`, page.__errors.slice(0, 3).join(" | "));
  await page.close();
}

async function testHistory(browser, kind) {
  const page = await freshPage(browser, kind);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const stack = ["/", "/shop", "/product/samsung-inr18650-30q", "/about"];
  const positions = {};
  for (let index = 0; index < stack.length; index += 1) {
    if (index > 0) {
      await clickHref(page, stack[index]);
      await sleep(400);
    }
    const max = await maxScroll(page);
    const desired = Math.max(0, Math.min([900, 650, 480, 300][index], max - 5));
    positions[stack[index]] = await setScroll(page, desired);
  }
  /* back ×3, forward ×3, repeated — 10 back and 10 forward presses total. */
  let cursor = stack.length - 1;
  const presses = [];
  for (let round = 0; round < 4 && presses.length < 20; round += 1) {
    for (let i = 0; i < 3 && presses.length < 20; i += 1) presses.push("back");
    for (let i = 0; i < 3 && presses.length < 20; i += 1) presses.push("forward");
  }
  while (presses.filter((p) => p === "back").length < 10) presses.push("back");
  let backs = 0;
  let forwards = 0;
  let failures = 0;
  for (const press of presses) {
    const next = press === "back" ? cursor - 1 : cursor + 1;
    if (next < 0 || next >= stack.length) continue;
    await page.evaluate(() => window.__startRec(900));
    if (press === "back") { await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => page.evaluate(() => history.back())); backs += 1; }
    else { await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => page.evaluate(() => history.forward())); forwards += 1; }
    await sleep(950);
    cursor = next;
    const target = stack[cursor];
    const samples = await page.evaluate(() => window.__rec.samples);
    const arrived = samples.filter((sample) => sample.path === target);
    const finalY = await page.evaluate(() => Math.round(window.scrollY));
    const expected = positions[target];
    const problems = [];
    if (!arrived.length) problems.push(`did not arrive at ${target}`);
    if (Math.abs(finalY - expected) > 3) problems.push(`restored y=${finalY}, expected ${expected}`);
    /* A restore may wait a few frames for content height; it must never animate through other values. */
    const distinct = [...new Set(arrived.map((sample) => sample.y))];
    const intermediates = distinct.filter((y) => Math.abs(y - expected) > 3 && y !== arrived[0]?.y);
    if (intermediates.length > 1) problems.push(`animated through ${intermediates.slice(0, 5).join(",")}`);
    if (problems.length) { failures += 1; fail(`${kind} history ${press} → ${target}`, problems.join("; ")); }
  }
  if (!failures) pass(`${kind} back×${backs} / forward×${forwards} restore exact positions`);
  if (page.__errors.length) fail(`${kind} history page errors`, page.__errors.slice(0, 3).join(" | "));
  await page.close();
}

/* Links inside overlays that lock body scroll: mobile menu and cart drawer. */
async function testOverlayLinks(browser, kind) {
  const page = await freshPage(browser, kind);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await seedBag(page);
  const cases = [];
  if (kind === "mobile") cases.push({ open: '[aria-label="Open menu"]', within: '[aria-label="Shop menu"]', label: "mobile menu" });
  cases.push({ open: '[aria-label^="Open cart"]', within: '[aria-label="Shopping bag"]', label: "cart drawer", href: "/checkout" });
  for (const item of cases) {
    await page.goto(`${BASE}/shop`, { waitUntil: "networkidle0" });
    const start = await setScroll(page, 600);
    await page.evaluate((selector) => document.querySelector(selector)?.click(), item.open);
    await sleep(350);
    const target = await page.evaluate(({ within, href }) => {
      const scope = document.querySelector(within);
      if (!scope) return null;
      const links = [...scope.querySelectorAll("a[href^='/']")].filter((a) => !a.getAttribute("href").startsWith("/shop") && !a.getAttribute("href").includes("#"));
      const link = href ? links.find((a) => a.getAttribute("href") === href) : links[0];
      if (!link) return null;
      link.setAttribute("data-overlay-link", "1");
      return link.getAttribute("href");
    }, item);
    if (!target) { fail(`${kind} ${item.label}`, "no link found inside overlay"); continue; }
    await page.evaluate(() => window.__startRec(700));
    await page.evaluate(() => document.querySelector("[data-overlay-link]").click());
    await sleep(750);
    const samples = await page.evaluate(() => window.__rec.samples);
    const state = await page.evaluate((within) => ({ path: location.pathname, y: Math.round(scrollY), overlay: Boolean(document.querySelector(within)), overflow: document.body.style.overflow, scrollable: document.documentElement.scrollHeight > innerHeight }), item.within);
    const problems = analyseRouteChange(samples, "/shop", target.split("?")[0]);
    if (state.overlay) problems.push("overlay stayed open");
    if (state.overflow === "hidden") problems.push("body scroll left locked");
    if (problems.length) fail(`${kind} ${item.label} (y=${start}) → ${target}`, problems.join("; "));
    else pass(`${kind} ${item.label} → ${target} opens at top, scroll unlocked`);
  }
  await page.close();
}

/* Strict: 11 entries, then 10 consecutive backs and 10 consecutive forwards. */
async function testHistoryStreak(browser, kind) {
  const page = await freshPage(browser, kind);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const stack = ["/", "/shop", "/product/samsung-inr18650-30q", "/about", "/support", "/help", "/help/battery-safety", "/privacy", "/terms", "/refunds", "/track"];
  const positions = [];
  for (let index = 0; index < stack.length; index += 1) {
    if (index > 0) { await clickHref(page, stack[index]); await sleep(350); }
    const max = await maxScroll(page);
    positions.push(await setScroll(page, Math.max(0, Math.min(120 + index * 97, max - 4))));
  }
  let cursor = stack.length - 1;
  const failures = [];
  for (const direction of [...Array(10).fill("back"), ...Array(10).fill("forward")]) {
    cursor += direction === "back" ? -1 : 1;
    await page.evaluate(() => window.__startRec(700));
    await page.evaluate((dir) => (dir === "back" ? history.back() : history.forward()), direction);
    await sleep(750);
    const state = await page.evaluate(() => ({ path: location.pathname, y: Math.round(scrollY) }));
    const samples = await page.evaluate(() => window.__rec.samples);
    const arrived = samples.filter((sample) => sample.path === stack[cursor]);
    const wrong = [...new Set(arrived.map((sample) => sample.y))].filter((y) => Math.abs(y - positions[cursor]) > 3);
    if (state.path !== stack[cursor] || Math.abs(state.y - positions[cursor]) > 3 || wrong.length > 1) {
      failures.push(`${direction}→${stack[cursor]}: at ${state.path} y=${state.y} (want ${positions[cursor]})${wrong.length > 1 ? ` via ${wrong.slice(0, 4)}` : ""}`);
    }
  }
  if (failures.length) fail(`${kind} 10× back then 10× forward`, failures.join("; "));
  else pass(`${kind} 10× back then 10× forward across 11 pages, every position exact`);
  if (page.__errors.length) fail(`${kind} streak page errors`, page.__errors.slice(0, 3).join(" | "));
  await page.close();
}

async function testAnchors(browser, kind) {
  const page = await freshPage(browser, kind);
  for (const route of ["/privacy", "/help/battery-safety", "/support"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0" });
    await setScroll(page, 0);
    const anchor = await page.evaluate(() => {
      const links = [...document.querySelectorAll('main a[href^="#"], #content a[href^="#"], a[href^="#"]')]
        .filter((a) => a.getAttribute("href").length > 1 && a.getAttribute("href") !== "#content" && document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1))));
      const pick = links[links.length - 1];
      if (!pick) return null;
      pick.setAttribute("data-test-anchor", "1");
      return pick.getAttribute("href");
    });
    if (!anchor) { fail(`${kind} anchors ${route}`, "no same-page anchor found"); continue; }
    await page.evaluate(() => window.__startRec(1400));
    await page.evaluate(() => document.querySelector("[data-test-anchor]").click());
    await sleep(1500);
    const samples = await page.evaluate(() => window.__rec.samples);
    const info = await page.evaluate((hash) => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      return { top: Math.round(target.getBoundingClientRect().top), path: location.pathname, hash: location.hash };
    }, anchor);
    const ys = samples.map((sample) => sample.y);
    const distinct = [...new Set(ys)];
    const problems = [];
    if (info.path !== route) problems.push(`left the page (now ${info.path})`);
    if (distinct.length < 4) problems.push(`not smooth (${distinct.length} distinct positions)`);
    const atBottom = await page.evaluate(() => Math.abs(window.scrollY - (document.documentElement.scrollHeight - window.innerHeight)) <= 2);
    if (info.top < 0 || (info.top > 220 && !atBottom)) problems.push(`target ended at ${info.top}px from top`);
    for (let i = 1; i < ys.length; i += 1) if (ys[i] < ys[i - 1] - 1) { problems.push("scroll reversed direction"); break; }
    if (problems.length) fail(`${kind} anchor ${route}${anchor}`, problems.join("; "));
    else pass(`${kind} smooth anchor ${route}${anchor}`);
  }
  await page.close();
}

async function fillCheckout(page) {
  await page.evaluate(() => {
    const set = (selector, value) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`missing ${selector} on ${location.pathname}`);
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    };
    set("#name", "Test Buyer");
    set("#phone", "01712345678");
    set("#address", "House 1, Road 2, Mirpur DOHS, near mosque");
    set("#district", "Dhaka");
  });
}

async function submitButton(page) {
  return page.evaluateHandle(() => [...document.querySelectorAll("button[form=checkout-form]")]
    .find((button) => button.getBoundingClientRect().width > 0 && getComputedStyle(button).visibility !== "hidden"));
}

async function testCheckout(browser, kind, method) {
  const name = `${kind} checkout (${method})`;
  const page = await freshPage(browser, kind);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await seedBag(page);
  /* Step 1: bag → checkout via the real cart flow. */
  await clickHref(page, "/checkout");
  await sleep(500);
  if ((await page.evaluate(() => location.pathname)) !== "/checkout") { fail(name, "could not open checkout"); await page.close(); return; }
  if ((await page.evaluate(() => Math.round(scrollY))) !== 0) fail(name, "checkout did not open at top");

  /* Step 2: submit with a missing name → must focus the field without a long animated fling. */
  await fillCheckout(page);
  await page.evaluate(() => {
    const input = document.querySelector("#name");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  let button = await submitButton(page);
  await page.evaluate((element) => { document.documentElement.style.scrollBehavior = "auto"; element.scrollIntoView({ block: "center" }); document.documentElement.style.scrollBehavior = ""; }, button);
  await sleep(200);
  await page.evaluate(() => window.__startRec(900));
  await page.evaluate((element) => element.click(), button);
  await sleep(950);
  let samples = await page.evaluate(() => window.__rec.samples);
  let distinct = [...new Set(samples.map((sample) => sample.y))];
  const focused = await page.evaluate(() => document.activeElement?.id);
  const fieldTop = await page.evaluate(() => Math.round(document.querySelector("#name").getBoundingClientRect().top));
  const problems = [];
  if (distinct.length > 3) problems.push(`invalid submit animated across ${distinct.length} positions (${distinct.slice(0, 6).join(",")}…)`);
  if (focused !== "name") problems.push(`first invalid field not focused (active=${focused || "none"})`);
  if (fieldTop < 0 || fieldTop > (await page.evaluate(() => innerHeight))) problems.push(`invalid field off-screen (${fieldTop}px)`);
  if (problems.length) fail(`${name} validation`, problems.join("; ")); else pass(`${name} validation focuses field without fling`);

  /* Step 3: fix the field, pick payment, verify phone if required. */
  await fillCheckout(page);
  if (method === "cod") {
    await page.evaluate(() => [...document.querySelectorAll("input[name=payment]")].find((input) => /cash on delivery|COD/i.test(input.closest("label").textContent))?.click());
  }
  await sleep(150);
  if (method === "bkash") await page.evaluate(() => {
    const trx = document.querySelector("#trx");
    if (!trx) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(trx, "ABC123XYZ9");
    trx.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const needsOtp = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Send code"));
  if (needsOtp) {
    /* Step 3a: try to order without verifying → focus OTP block, no fling. */
    button = await submitButton(page);
    await page.evaluate((element) => { document.documentElement.style.scrollBehavior = "auto"; element.scrollIntoView({ block: "center" }); document.documentElement.style.scrollBehavior = ""; }, button);
    await sleep(150);
    await page.evaluate(() => window.__startRec(900));
    await page.evaluate((element) => element.click(), button);
    await sleep(950);
    samples = await page.evaluate(() => window.__rec.samples);
    distinct = [...new Set(samples.map((sample) => sample.y))];
    const otpVisible = await page.evaluate(() => { const r = document.querySelector("#otp-block").getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; });
    if (distinct.length > 3 || !otpVisible) fail(`${name} OTP prompt`, `positions=${distinct.length}, visible=${otpVisible}`);
    else pass(`${name} OTP prompt shown without fling`);
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send code").click());
    await sleep(200);
    const code = await page.evaluate(() => (document.querySelector("#otp-block").textContent.match(/code is (\d{6})/) || [])[1]);
    await page.evaluate((value) => {
      const input = document.querySelector('input[aria-label="Verification code"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, code);
    await sleep(50);
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Verify").click());
    await sleep(200);
  }

  /* Step 4: place the order → order page opens at top in one frame, no fling. */
  button = await submitButton(page);
  await page.evaluate((element) => { document.documentElement.style.scrollBehavior = "auto"; element.scrollIntoView({ block: "center" }); document.documentElement.style.scrollBehavior = ""; }, button);
  await sleep(200);
  const before = await page.evaluate(() => Math.round(scrollY));
  await page.evaluate(() => window.__startRec(4500));
  await page.evaluate((element) => element.click(), button);
  await page.waitForFunction(() => location.pathname.startsWith("/order/"), { timeout: 8000 }).catch(() => {});
  await sleep(700);
  samples = await page.evaluate(() => window.__rec.samples);
  const orderPath = await page.evaluate(() => location.pathname + location.search);
  if (!orderPath.startsWith("/order/")) {
    const error = await page.evaluate(() => [...document.querySelectorAll("p,[role=alert]")].map((e) => e.textContent.trim()).filter((t) => /error|could not|enter|please/i.test(t)).slice(0, 2).join(" | "));
    fail(`${name} place order`, `did not reach order page (${error})`);
  } else {
    const onCheckout = samples.filter((sample) => sample.path === "/checkout");
    const checkoutMoves = [...new Set(onCheckout.map((sample) => sample.y))].filter((y) => y !== before);
    const issues = analyseRouteChange(samples, "/checkout", orderPath);
    if (checkoutMoves.length) issues.push(`checkout scrolled before leaving: ${checkoutMoves.slice(0, 5).join(",")}`);
    if (issues.length) fail(`${name} place order (from y=${before})`, issues.join("; "));
    else pass(`${name} place order → ${orderPath.split("?")[0]} at top instantly`);
  }
  if (page.__errors.length) fail(`${name} page errors`, page.__errors.slice(0, 3).join(" | "));
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const kind of Object.keys(VIEWPORTS)) {
    await testInitialLoad(browser, kind);
    await testAllRoutes(browser, kind);
    await testHistory(browser, kind);
    await testHistoryStreak(browser, kind);
    await testOverlayLinks(browser, kind);
    await testAnchors(browser, kind);
    await testCheckout(browser, kind, "cod");
    await testCheckout(browser, kind, "bkash");
  }
  await browser.close();
  const failed = results.filter((result) => !result.ok);
  for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? `\n      ${result.detail}` : ""}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
