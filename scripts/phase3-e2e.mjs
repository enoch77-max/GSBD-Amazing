/**
 * Phase 3 browser acceptance: Products + Stock & Prices.
 * Run: npm run build && node scripts/phase3-e2e.mjs
 * Screenshots: PHASE3_SHOTS=/tmp/phase3 node scripts/phase3-e2e.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";

const html = readFileSync("dist/index.html");
const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, live: false }));
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const shots = process.env.PHASE3_SHOTS;
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
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#admin-pin");
  await page.type("#admin-pin", "246810");
  await page.click("button[type='submit']");
  await page.waitForSelector(".ax-bottombar");

  const bottom = async (label) => {
    for (const button of await page.$$(".ax-bottombar button")) {
      if ((await button.evaluate((el) => el.textContent)).includes(label)) { await button.click(); await wait(350); return; }
    }
    assert.fail(`bottom navigation ${label}`);
  };
  const openSheet = async (label) => {
    await bottom("More");
    await page.waitForSelector(".ax-sheet");
    for (const item of await page.$$(".ax-sheet-item")) {
      if ((await item.evaluate((el) => el.textContent)).includes(label)) { await item.click(); await page.waitForSelector(".ax-sheet", { hidden: true }); await wait(350); return; }
    }
    assert.fail(`All sections item ${label}`);
  };
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
  const noXScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("gsbd.storefront.v1") ?? "{}"));

  /* ---------------- Products ---------------- */
  await openSheet("Products");
  await page.waitForSelector(".ax-product-card");
  check("mobile product cards: one-line title with ellipsis and SKU underneath", await page.$eval(".ax-product-card", (card) => {
    const name = card.querySelector(".ax-product-name");
    const sku = card.querySelector(".ax-product-sku");
    return getComputedStyle(name).whiteSpace === "nowrap" && getComputedStyle(name).textOverflow === "ellipsis" && Boolean(sku?.textContent.trim());
  }));
  check("product card exposes category, price, stock status and listing switch", await page.$eval(".ax-product-card", (card) => Boolean(card.querySelector(".ax-category-pill")) && Boolean(card.querySelector(".ax-price-pill")) && Boolean(card.querySelector(".ax-stock-pill")) && /Activate|Move to draft/.test(card.querySelector("[role='switch']")?.getAttribute("aria-label") ?? "")));
  check("no horizontal overflow at 390px", await noXScroll());
  await shot("products-mobile");

  const initialVisible = await page.$eval(".ax-product-card [role='switch']", (button) => button.getAttribute("aria-checked"));
  await page.click(".ax-product-card [role='switch']");
  await wait(200);
  const nextVisible = await page.$eval(".ax-product-card [role='switch']", (button) => button.getAttribute("aria-checked"));
  check("Active / Draft switch updates instantly", initialVisible !== nextVisible);
  check("Active / Draft state persists", await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("gsbd.storefront.v1") ?? "{}");
    return Array.isArray(saved.hiddenSlugs);
  }));

  await page.click(".ax-product-card [aria-haspopup='menu']");
  await page.waitForSelector("[role='menu']");
  await page.click("[role='menuitem']", { clickCount: 1 });
  // The first menu item is Edit product.
  await page.waitForSelector(".adm-drawer");
  await wait(250);
  check("product editor opens as a drawer", await page.$(".adm-drawer") !== null);
  const tabs = await page.$$eval(".ax-editor-tabs [role='tab']", (nodes) => nodes.map((node) => node.textContent.trim()));
  check("editor is split into Basics, Tech specs and Compatibility", ["Basics", "Tech specs", "Compatibility"].every((label) => tabs.some((tab) => tab.includes(label))), tabs.join(" / "));
  check("mobile editor has sticky Discard / Save Product actions", await page.evaluate(() => {
    const footer = document.querySelector(".adm-drawer-foot");
    return footer && /Discard/.test(footer.textContent) && /Save Product/.test(footer.textContent) && getComputedStyle(footer).position === "sticky";
  }));

  await page.click(".ax-editor-tabs [role='tab']", { offset: { x: 210, y: 20 } }).catch(() => {});
  for (const tab of await page.$$('[role="tab"]')) if ((await tab.evaluate((el) => el.textContent)).includes("Compatibility")) await tab.click();
  await wait(150);
  const has24 = await page.$eval(".ax-compat-tags", (root) => Boolean([...root.querySelectorAll("button")].find((node) => node.textContent.includes("24V"))));
  assert.ok(has24, "24V compatibility preset exists");
  await page.evaluate(() => [...document.querySelectorAll(".ax-compat-tags button")].find((node) => node.textContent.includes("24V"))?.click());
  await page.evaluate(() => [...document.querySelectorAll(".adm-drawer-foot button")].find((button) => button.textContent.includes("Save Product"))?.click());
  await wait(400);
  check("compatibility tags persist in product highlights metadata", await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("gsbd.storefront.v1") ?? "{}");
    const patches = saved.productPatches ?? {};
    return Object.values(patches).some((patch) => patch.highlights?.includes("__builder_compat__:24V"));
  }));

  /* ---------------- Stock & Prices ---------------- */
  await bottom("Stock");
  await page.waitForSelector(".ax-stock-card");
  check("stock editor has Low, Out of stock and Margin alert quick filters", await page.$$eval(".ax-seg button", (nodes) => ["Low stock", "Out of stock", "Margin alert"].every((label) => nodes.some((node) => node.textContent.includes(label)))));
  check("barcode / SKU scanner search is present", await page.$("input[aria-label='Barcode, SKU or product search']") !== null);
  check("regular and sale price are separate tap-to-edit pills", await page.$eval(".ax-stock-card", (card) => card.querySelectorAll(".ax-price-pill").length === 2));
  check("stock card has count stepper and bulk tier indicator", await page.$eval(".ax-stock-card", (card) => Boolean(card.querySelector(".ax-stepper")) && Boolean(card.querySelector(".ax-tier-indicator"))));
  await shot("stock-mobile");

  const card = ".ax-stock-card";
  const before = Number(await page.$eval(`${card} .ax-stepper input`, (input) => input.value));
  await page.click(`${card} .ax-stepper button[aria-label^='Increase']`);
  await wait(150);
  check("stepper stages count and shows floating Save changes bar", await page.$eval(".ax-savebar", (bar) => /Save 1 change/i.test(bar.textContent)));
  check("stock has not persisted before explicit save", await page.evaluate((before) => {
    const saved = JSON.parse(localStorage.getItem("gsbd.storefront.v1") ?? "{}");
    const products = saved.productPatches ?? {};
    const stockPatch = Object.values(products).find((patch) => patch.stock === before + 1);
    return !stockPatch;
  }, before));
  const pendingValue = Number(await page.$eval(`${card} .ax-stepper input`, (input) => input.value));
  await page.click(".ax-savebar-save");
  await wait(350);
  check("Save changes persists the staged stock count", await page.evaluate((value) => {
    const saved = JSON.parse(localStorage.getItem("gsbd.storefront.v1") ?? "{}");
    return Object.values(saved.productPatches ?? {}).some((patch) => patch.stock === value);
  }, pendingValue));
  check("Save bar disappears after commit", await page.$(".ax-savebar") === null);

  await page.click(`${card} .ax-price-pill[data-field='sale']`);
  const saleField = await page.$(`${card} input[aria-label^='Sale price']`);
  check("tap-to-edit sale-price pill opens inline input", saleField !== null);
  if (saleField) {
    await saleField.click({ clickCount: 3 });
    await page.keyboard.type("700");
    await page.keyboard.press("Enter");
    await wait(150);
    check("price edit stages one more row change", await page.$eval(".ax-savebar", (bar) => /Save 1 change/i.test(bar.textContent)));
    await page.click(".ax-savebar-discard");
  }

  await page.evaluate(() => document.querySelector(".ax-stock-card .ax-tier-indicator")?.click());
  await wait(400);
  check("bulk-tier editor state reached", await page.$(".ax-tier-editor input") !== null, String(await page.evaluate(() => document.querySelector(".ax-stock-card .ax-tier-indicator")?.disabled)));
  await page.type(".ax-tier-editor input", "৳7,900 for 10+");
  await page.evaluate(() => document.querySelector(".ax-tier-editor button[type='submit']")?.click());
  await wait(300);
  check("bulk tier price saves to the product record", await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("gsbd.storefront.v1") ?? "{}");
    return Object.values(saved.productPatches ?? {}).some((patch) => Array.isArray(patch.specs) && patch.specs.some((spec) => /bulk/i.test(spec.label) && spec.value.includes("7,900")));
  }));
  if (shots) await page.screenshot({ path: path.join(shots, "stock-tier-editor.png") });

  for (const width of [320, 390, 430, 768]) {
    await page.setViewport({ width, height: 844, isMobile: width < 769, hasTouch: width < 769 });
    await wait(120);
    check(`${width}px: no horizontal page overflow`, await noXScroll());
  }
  check("no browser runtime errors", errors.length === 0, errors.join(" | "));
  console.log(`\n${passed} Phase 3 checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
