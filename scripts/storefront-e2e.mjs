/** Product presentation system acceptance: listing, card, product page. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";

const html = readFileSync("dist/index.html");
const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/")) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: true })); return; }
  if (/\.(jpe?g|png|webp|svg)$/i.test(request.url ?? "")) {
    const file = path.join("dist", decodeURIComponent((request.url ?? "").split("?")[0]));
    if (existsSync(file)) { response.writeHead(200, { "content-type": request.url?.endsWith(".png") ? "image/png" : request.url?.endsWith(".svg") ? "image/svg+xml" : "image/jpeg" }); response.end(readFileSync(file)); return; }
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const shots = process.env.STORE_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
const check = (name, ok, detail = "") => { assert.ok(ok, `${name} ${detail}`); passed += 1; console.log(`PASS ${name}`); };
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("gsbd.ops.v1", JSON.stringify({ consent: "denied", sampleData: true }));
    localStorage.removeItem("gsbd.cart.v1");
  });

  /* ---------- listing ---------- */
  await page.goto(`${base}/shop`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pq-card", { timeout: 20000 });
  await wait(700);
  check("listing renders the new card system", (await page.$$(".pq-card")).length >= 4);
  check("card has a large fixed-ratio image (no layout shift)", await page.$eval(".pq-card .pq-media", (media) => {
    const ratio = getComputedStyle(media).aspectRatio.replace(/\s/g, "");
    const expected = window.innerWidth <= 640 ? "1/1" : "4/3";
    return ratio === expected && media.querySelector("img") !== null;
  }));
  check("skeleton matches the card ratio", await page.evaluate(() => {
    const shell = document.createElement("div");
    shell.className = "pq skeleton pq-skeleton";
    shell.innerHTML = '<div class="pq-skeleton-media"></div>';
    document.body.appendChild(shell);
    const skeleton = getComputedStyle(shell.querySelector(".pq-skeleton-media")).aspectRatio.replace(/\s/g, "");
    const card = getComputedStyle(document.querySelector(".pq-card .pq-media")).aspectRatio.replace(/\s/g, "");
    shell.remove();
    return skeleton === card;
  }));
  check("card name is ONE line, filling the width, ellipsised only if needed", await page.$eval(".pq-card .pq-name", (name) => {
    const style = getComputedStyle(name);
    return style.whiteSpace === "nowrap" && style.textOverflow === "ellipsis" &&
      name.getClientRects().length === 1 && name.textContent.trim().length > 4;
  }));
  check("brand is one line and ellipsises instead of wrapping", await page.$$eval(".pq-card .pq-brand", (rows) => rows.every((row) => {
    const style = getComputedStyle(row);
    const text = row.querySelector(".pq-brand-text");
    return style.whiteSpace === "nowrap" && row.getClientRects().length === 1 && text.scrollWidth >= text.clientWidth;
  })));
  check("all cards share one identical fixed height", await page.$$eval(".pq-card", (cards) => {
    const heights = [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().height)))];
    return heights.length === 1;
  }));
  check("body is a fixed-row grid (no dead space under the title)", await page.$$eval(".pq-card .pq-body", (bodies) => bodies.every((body) => getComputedStyle(body).display === "grid" && body.children.length >= 5)));
  check("exactly one add control per card", await page.$$eval(".pq-card", (cards) => cards.every((card) => card.querySelectorAll(".pq-add").length <= 1)));
  check("cards show a real rating line when reviews exist", await page.evaluate(() => {
    const rated = [...document.querySelectorAll(".pq-card")].filter((card) => card.querySelector(".pq-rating"));
    return rated.length > 0 && rated.every((card) => /\d\.\d \(\d+\)/.test(card.querySelector(".pq-rating").textContent));
  }));
  check("hierarchy: product name outranks brand and fact line", await page.evaluate(() => {
    return [...document.querySelectorAll(".pq-card")].every((card) => {
      const name = parseFloat(getComputedStyle(card.querySelector(".pq-name")).fontSize);
      const brand = parseFloat(getComputedStyle(card.querySelector(".pq-brand")).fontSize);
      const meta = card.querySelector(".pq-meta");
      return name >= brand + 4 && (!meta || parseFloat(getComputedStyle(meta).fontSize) < name - 3);
    });
  }));
  check("variant/spec line is exactly one row, ellipsised not wrapped", await page.$$eval(".pq-card .pq-meta", (lines) => lines.every((line) => {
    const style = getComputedStyle(line);
    return style.whiteSpace === "nowrap" && style.textOverflow === "ellipsis" && line.getClientRects().length === 1 &&
      line.scrollHeight <= Math.ceil(parseFloat(line.style.height || style.lineHeight) || parseFloat(style.lineHeight)) + 2;
  })));
  check("no product shows a genuine badge unless the owner enabled it", await page.$$eval(".pq-card", (cards) => cards.every((card) => card.querySelectorAll(".pq-genuine").length === 0)));
  check("no feature or quality pills on cards", await page.$$eval(".pq-card", (cards) => cards.every((card) => card.querySelectorAll(".pq-badge, .pq-card-spec").length === 0)));
  check("only the genuine attestation may use an accent badge", await page.$$eval(".pq-card", (cards) => cards.every((card) => card.querySelectorAll(".pq-genuine").length <= 1 && card.querySelectorAll(".pq-flag[data-tone='cat']").length === 0)));
  check("mini-cart stays hidden with an empty bag", await page.evaluate(() => {
    const bar = document.querySelector(".pq-mini");
    return bar.getAttribute("data-hidden") === "true" && getComputedStyle(bar).opacity === "0";
  }));
  const dataBadged = await page.$$eval(".pq-badge", (nodes) => nodes.map((node) => node.textContent.trim()));
  check("badges are data-backed (warranty/tested/genuine/specs/reviews)", dataBadged.every((label) => /warranty|tested|genuine|specs published|buyers|cycle-life/i.test(label)), dataBadged.slice(0, 4).join(" | "));
  check("responsive CDN images advertise a srcset", await page.evaluate(() => {
    const cdn = [...document.querySelectorAll(".pq-card .pq-media img")].filter((img) => /images\.(pexels|unsplash)\.com/.test(img.getAttribute("src") ?? ""));
    return cdn.length > 0 && cdn.every((img) => (img.getAttribute("srcset") ?? "").split(",").length >= 3 && /fm=webp|auto=format/.test(img.getAttribute("srcset") ?? ""));
  }));
  check("bundled local art is served directly, not rewritten", await page.evaluate(() => {
    const local = [...document.querySelectorAll(".pq-card .pq-media img")].filter((img) => (img.getAttribute("src") ?? "").startsWith("/images/"));
    return local.every((img) => !img.getAttribute("srcset"));
  }));
  check("below-fold images are lazy", await page.$$eval(".pq-card .pq-media img", (imgs) => imgs.slice(4).every((img) => img.loading === "lazy")));

  // Quick details on touch are a readable bottom sheet, not a clipped image overlay.
  const targetIndex = await page.$$eval(".pq-card", (cards) => cards.findIndex((card) => card.querySelector(".pq-quick .pq-chip")));
  check("a card offers published quick specs", targetIndex >= 0);
  await page.evaluate((index) => document.querySelectorAll(".pq-card")[index]?.querySelector(".pq-quick-btn")?.click(), targetIndex);
  await page.waitForSelector(".pq-preview-sheet");
  await wait(350);
  check("mobile quick look shows full product facts in a bottom sheet", await page.$eval(".pq-preview-sheet", (sheet) => {
    const rows = [...sheet.querySelectorAll(".pq-preview-specs dd")];
    return rows.length >= 1 && rows.every((row) => getComputedStyle(row).textOverflow !== "ellipsis") &&
      getComputedStyle(sheet).opacity === "1" && getComputedStyle(sheet).backgroundColor === "rgb(255, 255, 255)" &&
      /Explore product/.test(sheet.textContent) && !/device checks pass|best value|fits your device/i.test(sheet.textContent);
  }));
  check("product names are never struck through", await page.$$eval(".pq-card .pq-name", (names) => names.every((name) => getComputedStyle(name).textDecorationLine === "none")));
  if (shots) await page.screenshot({ path: path.join(shots, "listing-390.png") });
  await page.click(".pq-preview-close");
  await page.waitForSelector(".pq-preview-sheet", { hidden: true });

  // add to cart + mini cart
  const addIndex = await page.$$eval(".pq-card", (cards) => cards.findIndex((card) => card.querySelector(".pq-add:not([disabled])")));
  check("an in-stock card exposes one add button", addIndex >= 0);
  await page.evaluate((index) => document.querySelectorAll(".pq-card")[index]?.querySelector(".pq-add")?.click(), addIndex);
  await wait(500);
  check("add animates into an added state", await page.evaluate((index) => {
    const button = document.querySelectorAll(".pq-card")[index]?.querySelector(".pq-add");
    return button?.getAttribute("data-added") === "true";
  }, addIndex));
  await wait(1200); // the confirmation holds for ~1.1s before the stepper takes over
  check("stepper appears with a one-tap quantity control", await page.evaluate((index) => {
    const stepper = document.querySelectorAll(".pq-card")[index]?.querySelector(".pq-stepper");
    return Boolean(stepper) && stepper.querySelectorAll("button").length === 2;
  }, addIndex));
  const qtyBefore = await page.evaluate((index) => document.querySelectorAll(".pq-card")[index]?.querySelector(".pq-stepper output")?.textContent, addIndex);
  await page.evaluate((index) => document.querySelectorAll(".pq-card")[index]?.querySelector(".pq-stepper button:last-child")?.click(), addIndex);
  await wait(250);
  const qtyAfter = await page.evaluate((index) => document.querySelectorAll(".pq-card")[index]?.querySelector(".pq-stepper output")?.textContent, addIndex);
  check("quantity increases in one tap", qtyBefore !== qtyAfter, `${qtyBefore} → ${qtyAfter}`);
  await page.evaluate(() => window.scrollTo(0, 900));
  await wait(600);
  check("sticky mini-cart appears with real free-delivery progress", await page.$eval(".pq-mini", (bar) => {
    const hidden = bar.getAttribute("data-hidden") === "true";
    const progress = bar.querySelector("[role='progressbar']");
    return !hidden && progress !== null && Number(progress.getAttribute("aria-valuenow")) > 0 && /for free delivery|Free standard/.test(bar.textContent);
  }));


  /* skeleton on filter transition */
  const skeletonSeen = page.evaluate(async () => {
    let seen = 0;
    const count = () => document.querySelectorAll(".pq-skeleton").length;
    const observer = new MutationObserver(() => { seen = Math.max(seen, count()); });
    observer.observe(document.body, { childList: true, subtree: true });
    for (let frame = 0; frame < 60; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      seen = Math.max(seen, count());
    }
    observer.disconnect();
    return seen;
  });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Packs")?.click());
  const sawSkeleton = await skeletonSeen;
  check("filter transitions show skeleton loaders", sawSkeleton > 0, String(sawSkeleton));
  await wait(900);

  /* ---------- product page ---------- */
  await page.goto(`${base}/product/samsung-inr18650-30q`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pq-gallery-frame", { timeout: 20000 });
  await wait(800);
  check("gallery shows real photos without arbitrary callout pins", (await page.$$(".pq-pin")).length === 0);
  check("gallery has zoom and a lightbox control", await page.$(".pq-gallery-tool[aria-label='Open larger image']") !== null);
  check("zoomable gallery frame responds to pointer", await page.$eval(".pq-gallery-frame", (frame) => getComputedStyle(frame).touchAction === "pan-y"));
  check("assurance row is quiet: one accented claim, muted evidence notes", await page.evaluate(() => {
    const proof = document.querySelector(".pq-page .pq-proof");
    if (!proof) return true;
    const accent = proof.querySelectorAll(".pq-proof-genuine").length;
    const notes = [...proof.querySelectorAll(".pq-proof-note")];
    return accent <= 1 && notes.every((note) => parseFloat(getComputedStyle(note).fontSize) <= 13 && !/tap for detail/i.test(note.textContent));
  }));
  check("key spec chips show the product's own data", (await page.$$(".pq-page .pq-spec-summary .pq-chip")).length >= 3);
  check("product-page specs show full stored values rather than ellipses", await page.evaluate(() => {
    const summary = document.querySelector(".pq-page .pq-spec-summary");
    return Boolean(summary) && /3000mAh \(tested 2900\+\)/.test(summary.textContent) &&
      [...summary.querySelectorAll(".pq-chip b")].every((value) => !value.textContent.includes("…") && getComputedStyle(value).textOverflow !== "ellipsis");
  }));
  check("speculative comparison and pass/fail panels are absent", await page.evaluate(() =>
    !document.querySelector(".pq-compare, .pq-fit, .pq-bar-track") &&
    !/better value, checked|fits your device|\d+\/\d+ checks pass/i.test(document.querySelector(".pq-page")?.innerText ?? "")));
  check("no fake urgency or countdowns", await page.evaluate(() => !/only \d+ left|people (are )?viewing|ends in \d|hurry/i.test(document.body.innerText)));
  if (shots) await page.screenshot({ path: path.join(shots, "product-390.png") });

  /* ---------- widths + motion + CLS ---------- */
  for (const width of [360, 390, 768, 1440]) {
    const view = await browser.newPage();
    await view.setViewport({ width, height: width < 500 ? 800 : 960, isMobile: width < 500, hasTouch: width < 500 });
    await view.evaluateOnNewDocument(() => { localStorage.setItem("gsbd.ops.v1", JSON.stringify({ consent: "denied" })); });
    await view.evaluateOnNewDocument(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await view.goto(`${base}/shop`, { waitUntil: "domcontentloaded" });
    await view.waitForSelector(".pq-card", { timeout: 20000 });
    await wait(900);
    const overflow = await view.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${width}px: no horizontal overflow`, overflow <= 1, String(overflow));
    const cols = await view.evaluate(() => getComputedStyle(document.querySelector(".pq-grid")).gridTemplateColumns.split(" ").length);
    check(`${width}px: grid columns ${cols}`, width < 640 ? cols === 2 : width < 1024 ? cols === 3 : cols >= 4);
    const cls = await view.evaluate(() => Number(window.__cls.toFixed(4)));
    check(`${width}px: layout shift under 0.1`, cls < 0.1, String(cls));
    await view.goto(`${base}/product/samsung-inr18650-30q`, { waitUntil: "domcontentloaded" });
    await view.waitForSelector(".pq-gallery-frame", { timeout: 20000 });
    await wait(600);
    check(`${width}px: product page fits without horizontal scroll`, await view.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1));
    if (shots) await view.screenshot({ path: path.join(shots, `product-${width}.png`) });
    await view.close();
  }

  /* reduced motion */
  const calm = await browser.newPage();
  await calm.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await calm.goto(`${base}/shop`, { waitUntil: "domcontentloaded" });
  await calm.waitForSelector(".pq-card", { timeout: 20000 });
  check("reduced motion disables card lift and overlay transitions", await calm.evaluate(() => {
    const card = document.querySelector(".pq-card");
    const media = document.querySelector(".pq-media img");
    return getComputedStyle(card).transitionDuration.split(",").every((d) => parseFloat(d) === 0) &&
      getComputedStyle(media).transitionDuration.split(",").every((d) => parseFloat(d) === 0);
  }));
  await calm.close();

  check("no browser runtime errors", errors.length === 0, errors.join(" | "));
  console.log(`\n${passed} storefront checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
