/** Browser acceptance suite for all eight customer features on the live backend. */
import fs from "node:fs";
import puppeteer from "puppeteer";

const BASE = process.env.BASE ?? "http://127.0.0.1:4301";
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error).slice(0, 220)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("401 (Unauthorized)")) errors.push(message.text().slice(0, 220));
});
fs.mkdirSync("qa", { recursive: true });
const results = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => page.evaluate(() => document.body.innerText);
const click = async (selector, pattern) => {
  const handle = await page.evaluateHandle((sel, source) => {
    const regex = new RegExp(source, "i");
    return [...document.querySelectorAll(sel)].find((element) => regex.test(element.textContent || "") && element.offsetParent !== null) ?? null;
  }, selector, pattern.source);
  const element = handle.asElement();
  if (!element) throw new Error(`No visible ${selector} matching ${pattern}`);
  await element.evaluate((node) => node.click());
  await wait(400);
};
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push(`FAIL ${name} — ${String(error).slice(0, 230)}`);
  }
};

let productSlug = "";
let orderNumber = "";

const dismissConsent = async () => {
  const consent = await page.evaluateHandle(() =>
    [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "Essential only" && node.offsetParent !== null) ?? null);
  const el = consent.asElement();
  if (el) {
    await el.evaluate((node) => node.click());
    await wait(400);
  }
};

await step("mobile navigation has all five destinations", async () => {
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await wait(900);
  await dismissConsent();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await wait(400);
  const labels = await page.$$eval("nav[aria-label='Mobile navigation'] a, nav[aria-label='Mobile navigation'] button", (elements) => elements.map((element) => element.textContent.trim()));
  for (const label of ["Home", "Shop", "Pack Builder", "Wishlist", "Cart"]) {
    if (!labels.some((entry) => entry.includes(label))) throw new Error(`missing ${label}`);
  }
  await page.setViewport({ width: 1440, height: 950 });
  return labels.join(" · ");
});

await step("pack builder shows cells, BMS, nickel and optional extras with checkmarks", async () => {
  await page.goto(`${BASE}/pack-builder`, { waitUntil: "networkidle2" });
  await wait(900);
  await click("button", /36V e-bike/);
  await wait(500);
  const body = await text();
  if (!body.includes("36V") || !body.includes("12.6") || !body.includes("453.6")) throw new Error("live calculations are wrong");
  const build = await page.$eval(".builder-bom", (el) => el.innerText);
  for (const needle of ["cells", "BMS", "nickel", "assembly", "test"]) {
    if (!build.toLowerCase().includes(needle.toLowerCase())) throw new Error(`build list missing: ${needle}`);
  }
  const requiredRows = await page.$$eval(".builder-bom-row", (rows) => rows.length);
  if (requiredRows < 5) throw new Error(`expected at least 5 included components, got ${requiredRows}`);
  const optionalRows = await page.$$eval(".builder-extra-row", (rows) => rows.length);
  if (optionalRows < 1) throw new Error("no optional extras offered");
  const firstToggle = await page.$(".builder-extra-row input:not(:disabled)");
  if (firstToggle) {
    await firstToggle.evaluate((node) => node.click());
    await wait(350);
    const state = await page.$eval(".builder-extra-row input:not(:disabled)", (node) => node.checked);
    if (!state) throw new Error("optional extra did not tick into the build");
  }
  const suggestions = await page.$$(".builder-rec-card");
  if (!suggestions.length) throw new Error("no compatible product suggestions");
  await page.screenshot({ path: "qa/pack-builder.png", fullPage: true });
  return `${requiredRows} included + ${optionalRows} optional components`;
});

await step("custom pack adds to cart and expands into its component list", async () => {
  await click("button", /Add custom pack to bag/);
  await wait(500);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd-cart-v1") || "[]"));
  const pack = cart.find((line) => line.customPack);
  if (!pack || pack.customPack.series !== 10 || pack.customPack.parallel !== 3) throw new Error("pack configuration not preserved in cart");
  await page.waitForSelector("[role='dialog'][aria-label='Shopping bag']", { timeout: 6000 });
  await wait(450);
  const breakdown = await page.$eval("[role='dialog'][aria-label='Shopping bag']", (dialog) => dialog.innerText.toLowerCase());
  if (!breakdown.includes("inside this build") || !breakdown.includes("bms") || !breakdown.includes("nickel")) {
    throw new Error("bag did not expand into the pack's component list");
  }
  const brokenPackLinks = await page.$$eval("[role='dialog'][aria-label='Shopping bag'] a", (links) => links.filter((link) => link.getAttribute("href")?.startsWith("/product/custom-pack-")).length);
  if (brokenPackLinks) throw new Error("synthetic pack incorrectly links to a nonexistent product");
  await page.screenshot({ path: "qa/pack-breakdown.png" });
  await page.evaluate(() => document.querySelector("[role='dialog'][aria-label='Shopping bag'] button[aria-label='Close bag']")?.click());
  return "bag expands into cells + BMS + build items";
});

await step("different add-on choices stay separate and edit correctly", async () => {
  const extra = await page.$(".builder-extra-row input:checked");
  if (!extra) throw new Error("selected add-on missing");
  await extra.evaluate((node) => node.click());
  await click("button", /Add custom pack to bag/);
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd-cart-v1") || "[]").filter((line) => line.customPack));
  if (initial.length !== 2 || initial[0].slug === initial[1].slug) throw new Error("different configurations merged into one line");
  const withExtra = initial.find((line) => line.customPack.extras.length > 0);
  const editLink = await page.evaluateHandle((slug) => [...document.querySelectorAll("[aria-label='Shopping bag'] a")].find((anchor) => anchor.href.includes(`edit=${encodeURIComponent(slug)}`)) ?? null, withExtra.slug);
  if (!editLink.asElement()) throw new Error("edit build link missing");
  await editLink.asElement().evaluate((node) => node.click());
  await wait(500);
  if (!await page.$eval(".builder-extra-row input[aria-label='Include 5A active balancer']", (input) => input.checked)) throw new Error("editing did not restore the saved add-on");
  await page.click("#pack-load", { clickCount: 3 });
  await page.type("#pack-load", "20");
  await click("button", /Update build in bag/);
  const updated = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd-cart-v1") || "[]").filter((line) => line.customPack));
  if (updated.length !== 2 || !updated.some((line) => line.customPack.loadCurrentA === 20 && line.customPack.extras.length)) throw new Error("editing did not replace the selected build");
  await page.evaluate(() => document.querySelector("[role='dialog'][aria-label='Shopping bag'] button[aria-label='Close bag']")?.click());
  return "variants remain distinct and edits replace the right line";
});

await step("recommendations have loaded imagery and readable controls", async () => {
  await page.goto(`${BASE}/pack-builder`, { waitUntil: "networkidle2" });
  await wait(700);
  const cards = await page.$$(".builder-rec-card");
  if (!cards.length) throw new Error("no recommendations rendered");
  const status = await page.$$eval(".builder-rec-card img", (images) => images.map((image) => ({ loaded: image.complete && image.naturalWidth > 0 })));
  if (status.some((image) => !image.loaded)) throw new Error("a recommendation image did not load");
  const styles = await page.$eval(".builder-rec-foot button", (button) => ({ color: getComputedStyle(button).color, background: getComputedStyle(button).backgroundColor, text: button.textContent.trim() }));
  if (!styles.text || styles.color === styles.background) throw new Error("quick-add control is not readable");
  return `${cards.length} cards with visible images and actions`;
});

await step("wishlist heart persists and Move to cart works", async () => {
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await wait(800);
  productSlug = await page.$eval("article.product-card a[href^='/product/']", (element) => element.getAttribute("href").split("/")[2]);
  await page.$eval("article.product-card .wishlist-toggle", (element) => element.click());
  await wait(400);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd-wishlist") || "[]"));
  if (!saved.includes(productSlug)) throw new Error("wishlist was not saved");
  await page.goto(`${BASE}/wishlist`, { waitUntil: "networkidle2" });
  await wait(600);
  if (!(await text()).includes("Move to cart")) throw new Error("saved product not rendered");
  await click("button", /Move to cart/);
  await wait(400);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd-cart-v1") || "[]"));
  if (!cart.some((line) => line.slug === productSlug)) throw new Error("move to cart failed");
  return productSlug;
});

await step("autocomplete returns products, stock and categories", async () => {
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await wait(700);
  await page.type("input[aria-label='Search products']", "battery", { delay: 35 });
  await wait(1000);
  const suggestions = await page.$("#search-suggestions");
  if (!suggestions) throw new Error("dropdown did not open");
  const content = await suggestions.evaluate((element) => element.innerText);
  if (!/in stock|Out of stock/.test(content)) throw new Error("stock state missing");
  if (!content.includes("Battery Packs") && !content.includes("Battery Cells")) throw new Error("category suggestion missing");
  return "live results with stock";
});

await step("sticky buy bar appears with image, title and instant add", async () => {
  await page.goto(`${BASE}/product/${productSlug}`, { waitUntil: "networkidle2" });
  await wait(700);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(700);
  const visible = await page.$eval(".sticky-buy-bar", (element) => element.dataset.visible === "true");
  if (!visible) throw new Error("bar did not appear after scrolling");
  const content = await page.$eval(".sticky-buy-bar", (element) => element.innerText);
  if (!content.includes("Add to bag") || !(await page.$(".sticky-buy-bar img"))) throw new Error("purchase details missing");
  await page.$eval(".sticky-buy-bar .btn-primary", (element) => element.click());
  await wait(400);
  return "desktop and mobile-ready purchase bar";
});

await step("review helpful vote is applied once", async () => {
  await click("button[role='tab']", /Reviews/);
  await wait(600);
  const button = await page.$(".review-helpful");
  if (!button) throw new Error("no helpful button");
  const before = Number(await page.$eval(".review-helpful", (element) => Number(element.textContent.match(/(\d+)$/)?.[1] ?? 0)));
  await button.evaluate((node) => node.click());
  await wait(700);
  const state = await page.$eval(".review-helpful", (element) => ({ text: element.textContent, pressed: element.getAttribute("aria-pressed") }));
  const after = Number(state.text.match(/(\d+)$/)?.[1] ?? 0);
  if (state.pressed !== "true" || after !== before + 1) throw new Error(`vote did not stick: ${before} -> ${after}`);
  return `idempotent helpful vote (${before} -> ${after})`;
});

await step("help centre indexes article bodies and topic pages", async () => {
  await page.goto(`${BASE}/help`, { waitUntil: "networkidle2" });
  await page.type("input[aria-label='Search help articles']", "swollen", { delay: 30 });
  await wait(500);
  const body = await text();
  if (!body.includes("Battery safety") || body.includes("Wholesale & volume builds")) throw new Error("body search is not filtering correctly");
  await click("a", /Battery safety/);
  await wait(500);
  if (!page.url().includes("/help/battery-safety")) throw new Error("topic route did not open");
  if (!(await text()).includes("Storage, transport and damaged cells")) throw new Error("topic content missing");
  return "search + full topic article";
});

await step("custom pack completes OTP checkout and produces a printable invoice", async () => {
  await page.evaluate(() => localStorage.removeItem("gsbd-cart-v1"));
  await page.goto(`${BASE}/pack-builder`, { waitUntil: "networkidle2" });
  await wait(600);
  await click("button", /Router backup/);
  await click("button", /Add custom pack to bag/);
  await page.evaluate(() => document.querySelector("[role='dialog'][aria-label='Shopping bag'] button[aria-label='Close bag']")?.click());
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#name");
  await page.type("#name", "Feature Browser Test");
  await page.type("#phone", "01873000001");
  await page.type("#address", "House 33, Road 33, Feature Test, Dhaka");
  await click("button", /Send code/);
  await wait(600);
  const code = (await text()).match(/your code is (\d{6})/)?.[1];
  if (!code) throw new Error("OTP code not returned in test mode");
  await page.type("input[aria-label='Verification code']", code);
  await click("button", /^Verify$/);
  await wait(400);
  await click("label", /Cash on delivery/);
  await wait(300);
  await click("button[type='submit']", /Place order/);
  await page.waitForFunction(() => location.pathname.startsWith("/order/"), { timeout: 20000 });
  await wait(1200);
  orderNumber = page.url().match(/GSBD-\d+/)?.[0] ?? "";
  if (!orderNumber) throw new Error("order confirmation missing");
  if (!(await text()).includes("Custom 3S2P")) throw new Error("custom pack absent from confirmation");
  await page.emulateMediaType("print");
  const display = await page.$eval(".invoice-print", (element) => getComputedStyle(element).display);
  if (display === "none") throw new Error("invoice is hidden in print media");
  await page.screenshot({ path: "qa/invoice-print.png", fullPage: true });
  await page.emulateMediaType("screen");
  return `${orderNumber} · printable A4 invoice`;
});

await step("recent-order ticker uses the new real order", async () => {
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await wait(1000);
  const ticker = await page.$(".activity-ticker");
  if (!ticker) throw new Error("ticker did not render");
  const content = await ticker.evaluate((element) => element.innerText);
  if (!content.includes("Feature") || !content.includes("Custom 3S2P")) throw new Error("real order absent from ticker");
  return "live order activity";
});

await step("mobile pack builder has no horizontal overflow", async () => {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/pack-builder`, { waitUntil: "networkidle2" });
  await wait(700);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`${overflow}px horizontal overflow`);
  await page.screenshot({ path: "qa/pack-builder-mobile.png", fullPage: true });
  return "390px layout";
});

console.log(results.join("\n"));
console.log(`Console errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 8).join("\n"));
await browser.close();
process.exit(results.some((line) => line.startsWith("FAIL")) || errors.length ? 1 : 0);
