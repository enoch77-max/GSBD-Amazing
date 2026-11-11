// Run after npm run build with Puppeteer available (npm install --no-save puppeteer).
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer";

const require = createRequire(path.resolve("package.json"));
const { build } = require("esbuild");
const output = await build({ stdin: { contents: 'export { buildProductSeeds, categorySeeds } from "./src/db/seed-data"; export { DEFAULT_SETTINGS } from "./src/lib/settings";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent", alias: { "@": path.resolve("src") } });
const { buildProductSeeds, categorySeeds, DEFAULT_SETTINGS } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const products = buildProductSeeds().map((p, i) => ({ ...p, id: i + 1 }));
let livePatches = {};
const html = fs.readFileSync("dist/index.html");
const server = http.createServer((request, response) => {
  if (request.url === "/api/catalog") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ categories: categorySeeds.map((c, i) => ({ ...c, id: i + 1 })), products: products.map((p) => ({ ...p, ...(livePatches[p.slug] ?? {}) })), promos: [], settings: DEFAULT_SETTINGS, currency: "BDT" }));
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const screenshots = process.env.PACK_SCREENSHOTS;
if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
const errors = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log(`PASS ${name}`); };
async function pageFor(patches = {}, query = "cell=18650&s=3&p=2&load=10&target=4", width = 1440, bag = []) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: width < 640 ? 844 : 1000 });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.evaluateOnNewDocument(() => { window.__QA_NATIVE_FETCH__ = window.fetch.bind(window); });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.evaluate(({ patches, bag }) => {
    localStorage.setItem("gsbd.storefront.v1", JSON.stringify({ productPatches: patches }));
    localStorage.setItem("gsbd-cart-v1", JSON.stringify(bag));
    localStorage.setItem("gsbd.ops.v1", JSON.stringify({ consent: "denied", sampleData: false }));
  }, { patches, bag });
  await page.goto(`${base}/pack-builder?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".builder-section");
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]));
  await wait(1300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Essential only")?.click());
  return page;
}
async function textClick(page, selector, text) {
  const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find((el) => el.textContent.includes(text) && el.offsetWidth && !el.disabled), { selector, text });
  assert.ok(handle.asElement(), `Visible control: ${text}`);
  await handle.asElement().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await wait(350);
  await handle.asElement().click();
  await wait(180);
}
async function screenshot(page, name, selector) {
  if (!screenshots) return;
  if (selector) {
    await page.$eval(selector, (el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await wait(300);
  }
  await page.screenshot({ path: path.join(screenshots, `${name}.png`) });
}

try {
  const page = await pageFor({ "samsung-inr18650-30q": { stock: 0 } });
  await page.waitForSelector("#pack-alternatives");
  check("compact recovery notice keeps the builder accessible", await page.$eval(".builder-recovery-notice a", (a) => a.hash === "#pack-alternatives"));
  await textClick(page, ".builder-recovery-notice a", "Compare alternatives");
  await wait(700);
  check("distinct alternatives shown", (await page.$$(".pack-match-option")).length === 2);
  await screenshot(page, "comparison-desktop", "#pack-alternatives");
  const first = await page.$eval(".pack-match-option h3", (el) => el.textContent);
  await page.select(".pack-match-controls select", "runtime");
  check("runtime preference changes leading option", await page.$eval(".pack-match-option h3", (el) => el.textContent) !== first);
  await page.select(".pack-match-controls select", "closest");
  await page.type('input[aria-label="Maximum pack price in BDT"]', "1000");
  await page.waitForSelector(".pack-match-empty");
  check("budget limits do not leak expensive matches", (await page.$$(".pack-match-option")).length === 0);
  await textClick(page, ".pack-match-empty button", "Clear budget limit");
  await page.waitForSelector(".pack-match-option");
  await textClick(page, ".pack-match-option button", "Review this build");
  await page.waitForSelector("dialog[open]");
  check("review includes before and after specifications", await page.$eval("dialog", (el) => /Current/.test(el.textContent) && /New build/.test(el.textContent) && /Dimensions/.test(el.textContent)));
  await screenshot(page, "review-desktop");
  await page.keyboard.press("Escape");
  check("Escape cancels without changing the chosen cells", await page.$eval(".builder-summary-heading h2", (el) => el.textContent.includes("18650")));
  await textClick(page, ".pack-match-option button", "Review this build");
  await textClick(page, "dialog button", "Apply this build");
  await page.waitForSelector(".builder-change-success");
  check("apply switches configuration and clears unavailable panel", !(await page.$("#pack-alternatives")) && await page.$eval(".builder-summary-heading h2", (el) => el.textContent.includes("21700")));
  await wait(250);
  check("applied state receives visible keyboard focus", await page.evaluate(() => document.activeElement?.id === "pack-change-notice"));
  await textClick(page, ".builder-change-success button", "Undo change");
  await page.waitForSelector("#pack-alternatives");
  check("Undo restores original configuration", await page.$eval(".builder-summary-heading h2", (el) => el.textContent.includes("18650")));
  check("load was never modified", await page.$eval("#pack-load", (el) => el.value === "10"));
  await page.close();

  const extras = await pageFor({ "5a-active-balancer": { stock: 0 } }, "cell=18650&s=3&p=2&load=10&extras=5a-active-balancer,lipo-safe-fireproof-bag");
  await textClick(extras, ".pack-match-option button", "Review this build");
  check("removing optional items requires acknowledgement", await extras.$eval("dialog .btn-buy", (b) => b.disabled));
  await extras.click(".pack-change-acknowledge input");
  await textClick(extras, "dialog button", "Apply this build");
  check("valid selected add-on survives substitution", await extras.$eval('input[aria-label="Include Battery storage bag"]', (input) => input.checked));
  check("unavailable named add-on is omitted after consent", await extras.$eval('input[aria-label="Include 5A active balancer"]', (input) => !input.checked));
  await extras.close();

  const ready = await pageFor({ "lifepo4-32700-6000": { stock: 0 } }, "cell=lifepo4-32700&s=4&p=2&load=10");
  check("ready-made tab selected when no custom option exists", await ready.$eval('.pack-match-tabs button[aria-pressed="true"]', (el) => el.textContent.includes("Ready-made")));
  check("documented ready pack is shown", await ready.$eval(".pack-match-option h3", (el) => el.textContent.includes("100Ah")));
  check("ready pack has a genuine product destination", await ready.$eval(".pack-match-option > a", (a) => a.getAttribute("href") === "/product/12v-100ah-lifepo4-solar-pack"));
  await screenshot(ready, "ready-made-desktop", "#pack-alternatives");
  await ready.close();

  const mobile = await pageFor({ "samsung-inr18650-30q": { stock: 0 } }, undefined, 390);
  await screenshot(mobile, "comparison-mobile", "#pack-alternatives");
  check("mobile matching page has no horizontal overflow", await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await textClick(mobile, ".pack-match-option button", "Review this build");
  await screenshot(mobile, "review-mobile");
  check("mobile dialog fits the viewport", await mobile.$eval("dialog", (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0; }));
  await mobile.keyboard.press("Escape");
  await mobile.close();

  const race = await pageFor({ "samsung-inr18650-30q": { stock: 0 } });
  await textClick(race, ".pack-match-option button", "Review this build");
  livePatches = { "samsung-inr18650-30q": { stock: 0 }, "molicel-p42a-21700": { stock: 0 } };
  await race.evaluate(() => { window.__GSBD_LIVE__ = true; window.fetch = window.__QA_NATIVE_FETCH__; });
  await textClick(race, "dialog button", "Apply this build");
  await race.waitForSelector("dialog [role=alert]");
  check("stock loss during confirmation is caught", await race.$eval("dialog [role=alert]", (el) => el.textContent.includes("no longer")));
  check("stale alternative does not overwrite original build", await race.$eval(".builder-summary-heading h2", (el) => el.textContent.includes("18650")));
  await race.close();

  const price = await pageFor({ "samsung-inr18650-30q": { stock: 0 } });
  await textClick(price, ".pack-match-option button", "Review this build");
  livePatches = { "samsung-inr18650-30q": { stock: 0 }, "molicel-p42a-21700": { price: 980 } };
  await price.evaluate(() => { window.__GSBD_LIVE__ = true; window.fetch = window.__QA_NATIVE_FETCH__; });
  await textClick(price, "dialog button", "Apply this build");
  await price.waitForSelector("dialog [role=alert]");
  check("price change requires fresh review", await price.$eval("dialog [role=alert]", (el) => el.textContent.includes("price or included parts changed")));
  await price.close();

  const bag = [{ id: 1, slug: "samsung-inr18650-30q", name: "Samsung 30Q", brand: "Samsung", price: 520, qty: 2, stock: 240, image: "/images/col-cells.jpg" }];
  const reserved = await pageFor({ "samsung-inr18650-30q": { stock: 7 } }, undefined, 1440, bag);
  check("parts already in bag reduce builder availability", !!(await reserved.$("#pack-alternatives")));
  check("bag allowance is explained", await reserved.$eval(".pack-match-result-note", (el) => el.textContent.includes("bag")));
  await reserved.close();
  for (const width of [320, 768, 1920]) {
    const responsive = await pageFor({ "samsung-inr18650-30q": { stock: 0 } }, undefined, width);
    check(`comparison has no overflow at ${width}px`, await responsive.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await responsive.close();
  }
  check("no browser runtime errors", errors.length === 0);
  console.log(`\nPack matching browser checks: ${passed} passed.`);
} catch (error) {
  console.error("Browser runtime errors:", errors);
  if (screenshots) {
    const pages = await browser.pages();
    await pages[pages.length - 1]?.screenshot({ path: path.join(screenshots, "failure.png") });
  }
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}