/**
 * Runtime smoke test for the built preview (dist/index.html).
 * Serves the build with SPA fallback and drives the full storefront loop
 * in headless Chrome: browse → filter → product → bag → checkout → order → tracking → review.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const DIST = path.resolve("dist");
const SHOTS = "/tmp/shots";
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(4173, resolve));

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });

const errors = [];
const failed = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text().slice(0, 220)); });
page.on("pageerror", (err) => errors.push(`PAGEERROR: ${String(err).slice(0, 300)}`));
page.on("requestfailed", (req) => failed.push(`${req.failure()?.errorText} ${req.url().slice(0, 90)}`));

const results = [];
const step = async (name, fn) => {
  try {
    const info = await fn();
    results.push(`PASS  ${name}${info ? ` — ${info}` : ""}`);
  } catch (error) {
    results.push(`FAIL  ${name} — ${String(error).slice(0, 260)}`);
  }
};

const clickText = async (selector, pattern) => {
  const handle = await page.evaluateHandle(
    (sel, source) => {
      const re = new RegExp(source, "i");
      return [...document.querySelectorAll(sel)].find((el) => re.test((el.textContent || "").trim()) && el.offsetParent !== null) ?? null;
    },
    selector,
    pattern.source,
  );
  const element = handle.asElement();
  if (!element) throw new Error(`no element ${selector} matching ${pattern}`);
  await element.click();
  await new Promise((r) => setTimeout(r, 450));
};

const text = () => page.evaluate(() => document.body.innerText);
const shot = (name, fullPage = false) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });

await step("home renders", async () => {
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("h1");
  const h1 = await page.$eval("h1", (el) => el.textContent);
  const cards = await page.$$eval("a[href^='/product/']", (els) => els.length);
  if (cards < 5) throw new Error(`only ${cards} product links`);
  await shot("01-home");
  return `${h1} · ${cards} product links · title="${await page.title()}"`;
});

await step("images loaded", async () => {
  const stats = await page.evaluate(() => {
    const imgs = [...document.images];
    return { total: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc.slice(0, 70)) };
  });
  if (stats.broken.length) throw new Error(`broken: ${stats.broken.join(", ")}`);
  return `${stats.total} images ok`;
});

await step("category tile → shop", async () => {
  await clickText("a[href='/shop?category=battery-cells']", /cells/i);
  await page.waitForFunction(() => location.pathname === "/shop");
  const heading = await page.$eval("h1", (el) => el.textContent);
  return heading.trim().slice(0, 60);
});

await step("sort price ascending", async () => {
  await page.select("select[aria-label='Sort products']", "price-asc");
  await new Promise((r) => setTimeout(r, 500));
  const list = await page.$$eval("article.product-card", (cards) =>
    cards.map((card) => {
      const m = card.innerText.match(/\u09f3([\d,]+)/);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    }).filter((v) => v !== null),
  );
  const sorted = [...list].sort((a, b) => a - b);
  if (list.length < 3) throw new Error(`only ${list.length} card prices`);
  if (JSON.stringify(list) !== JSON.stringify(sorted)) throw new Error(`not ascending: ${list.join(",")}`);
  return `${list.length} cards ascending: ${list.slice(0, 4).join(", ")}`;
});

await step("pagination", async () => {
  await page.goto("http://localhost:4173/shop", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 400));
  const first = await page.$eval("article.product-card", (el) => el.innerText.split("\n").slice(0, 3).join(" "));
  await clickText("a,button", /^2$|next/);
  await new Promise((r) => setTimeout(r, 600));
  const second = await page.$eval("article.product-card", (el) => el.innerText.split("\n").slice(0, 3).join(" "));
  if (first === second) throw new Error("page 2 shows same first product");
  if (!/page=2/.test(page.url())) throw new Error(`url ${page.url()}`);
  return `page 2 differs · ${new URL(page.url()).search}`;
});

await step("brand facet filter", async () => {
  const before = await page.$$eval("a[href^='/product/']", (e) => e.length);
  await page.evaluate(() => {
    const box = [...document.querySelectorAll("aside input[type=checkbox]")][0];
    box?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const url = page.url();
  if (!/brand=|price=/.test(url)) throw new Error(`url unchanged: ${url}`);
  const after = await page.$$eval("a[href^='/product/']", (e) => e.length);
  return `${before} → ${after} cards`;
});

await step("header search suggestions", async () => {
  const input = await page.$("header input[type='search'], header input[placeholder*='Search'], header input");
  if (!input) throw new Error("no header search input");
  await input.click();
  await input.type("18650", { delay: 40 });
  await new Promise((r) => setTimeout(r, 900));
  const body = await text();
  if (!/18650/i.test(body)) throw new Error("no suggestions");
  await shot("02-search");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 700));
  return `search url ${new URL(page.url()).search}`;
});

await step("product detail", async () => {
  await page.goto("http://localhost:4173/product/samsung-inr18650-30q", { waitUntil: "networkidle2" });
  await page.waitForSelector("h1");
  const h1 = await page.$eval("h1", (el) => el.textContent);
  await shot("03-product");
  return h1;
});

await step("add to bag + drawer", async () => {
  const labels = await page.$$eval("button", (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
  await clickText("button", /add to bag|add to cart|add \d|buy now/);
  await new Promise((r) => setTimeout(r, 700));
  const body = await text();
  if (!/bag|subtotal/i.test(body)) throw new Error(`no bag feedback: ${labels.slice(0, 12).join(" | ")}`);
  await shot("04-cart");
  return "item added";
});

await step("checkout flow", async () => {
  await page.goto("http://localhost:4173/checkout", { waitUntil: "networkidle2" });
  await page.waitForSelector("#name", { timeout: 10000 });
  await page.type("#name", "Nafis Rahman");
  await page.type("#phone", "01712345678");
  await page.select("#district", "Dhaka");
  await page.type("#address", "House 9, Road 4, Mirpur DOHS, Dhaka 1216");
  await page.type("#promo", "GLOW10");

  /* Checkout now requires a verified phone and a provider-confirmed payment. */
  await clickText("button", /^Send code$/);
  const otpHint = await text();
  const code = otpHint.match(/your code is (\d{6})/)?.[1];
  if (!code) throw new Error("no verification code issued");
  await page.type("input[aria-label='Verification code']", code);
  await clickText("button", /^Verify$/);
  await page.type("#trx", "9F7A2B1C4D");
  await shot("05-checkout");
  await clickText("button", /place order|confirm order|pay|complete order/);
  await page.waitForFunction(() => location.pathname.startsWith("/order/"), { timeout: 25000 });
  await new Promise((r) => setTimeout(r, 900));
  await shot("06-order", true);
  const body = await text();
  const number = (body.match(/GSBD-\d+/) ?? ["?"])[0];
  globalThis.__orderNumber = number;
  return `order ${number} at ${new URL(page.url()).pathname}`;
});

await step("order tracking", async () => {
  await page.goto("http://localhost:4173/track", { waitUntil: "networkidle2" });
  await page.waitForSelector("#order-number");
  await page.type("#order-number", globalThis.__orderNumber ?? "GSBD-10482");
  await page.type("#order-phone", "01712345678");
  await clickText("button[type='submit']", /track order/);
  await page.waitForFunction(() => /confirmed|packing|shipped|delivered/i.test(document.body.innerText), { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 600));
  await shot("07-track");
  const body = await text();
  return `tracked ${globalThis.__orderNumber} · ${/Order items/.test(body) ? "items listed" : "no items"}`;
});

await step("wrong phone rejected", async () => {
  await page.goto("http://localhost:4173/track", { waitUntil: "networkidle2" });
  await page.type("#order-number", "GSBD-10482");
  await page.type("#order-phone", "01911111111");
  await clickText("button[type='submit']", /track order/);
  await new Promise((r) => setTimeout(r, 1000));
  const body = await text();
  if (!/do not match/i.test(body)) throw new Error("mismatch not reported");
  return "403 surfaced correctly";
});

await step("post a review", async () => {
  await page.goto("http://localhost:4173/product/molicel-p42a-21700", { waitUntil: "networkidle2" });
  await clickText("button[role='tab']", /review/);
  await new Promise((r) => setTimeout(r, 400));
  await clickText("button", /write a review/);
  await new Promise((r) => setTimeout(r, 400));
  await page.type("input[placeholder='Your name']", "Test Reviewer");
  await page.type("input[placeholder='City / area (optional)']", "Dhaka");
  await page.type("input[placeholder='Review title']", "Solid cells for a 6S pack");
  await page.type("textarea", "Bench tested at 4.1Ah, arrived in two days, well packed and matched.");
  await shot("08-review-form");
  await clickText("form button[type='submit']", /submit|post|publish|send/);
  await page.waitForFunction(() => document.body.innerText.includes("Test Reviewer"), { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 700));
  await shot("09-review-posted");
  return "review persisted";
});

await step("reload keeps review (localStorage)", async () => {
  await page.reload({ waitUntil: "networkidle2" });
  await clickText("button[role='tab']", /review/);
  await new Promise((r) => setTimeout(r, 600));
  const body = await text();
  if (!/Test Reviewer/.test(body)) throw new Error("review lost after reload");
  return "persisted";
});

await step("about + support + 404", async () => {
  await page.goto("http://localhost:4173/about", { waitUntil: "networkidle2" });
  const about = await text();
  await page.goto("http://localhost:4173/support", { waitUntil: "networkidle2" });
  const support = await text();
  await page.goto("http://localhost:4173/does-not-exist", { waitUntil: "networkidle2" });
  const missing = await text();
  if (!/404|not found/i.test(missing)) throw new Error("404 page missing");
  return `about ${about.length}b · support ${support.length}b · 404 ok`;
});

await step("unknown product → not found", async () => {
  await page.goto("http://localhost:4173/product/nope-not-real", { waitUntil: "networkidle2" });
  const body = await text();
  if (!/404|not found/i.test(body)) throw new Error(body.slice(0, 120));
  return "handled";
});

await step("taka glyph renders", async () => {
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle2" });
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check('16px "Noto Sans Bengali"', "\u09f3"));
  if (!ok) throw new Error("Noto Sans Bengali not available for \u09f3");
  return "BDT sign has a real glyph";
});

await step("cart quantity + remove", async () => {
  await page.goto("http://localhost:4173/product/tp4056-type-c-charger-module", { waitUntil: "networkidle2" });
  await clickText("button", /add to bag|add to cart/);
  await new Promise((r) => setTimeout(r, 800));
  const before = await text();
  await clickText("button[aria-label='Increase quantity']", /.*/);
  await new Promise((r) => setTimeout(r, 500));
  const after = await text();
  if (before === after) throw new Error("quantity did not change totals");
  await shot("13-cart-qty");
  return "quantity steppers live";
});

await step("browser back / forward", async () => {
  await page.goto("http://localhost:4173/shop", { waitUntil: "networkidle2" });
  await clickText("a[href^='/product/']", /.*/);
  await new Promise((r) => setTimeout(r, 500));
  const product = new URL(page.url()).pathname;
  await page.goBack();
  await new Promise((r) => setTimeout(r, 600));
  if (new URL(page.url()).pathname !== "/shop") throw new Error(`back went to ${page.url()}`);
  await page.goForward();
  await new Promise((r) => setTimeout(r, 600));
  if (new URL(page.url()).pathname !== product) throw new Error("forward failed");
  return "history works";
});

await step("mobile layout", async () => {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 700));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await shot("10-mobile-home");
  await page.goto("http://localhost:4173/shop", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 500));
  await shot("11-mobile-shop");
  const shopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2 || shopOverflow > 2) throw new Error(`horizontal overflow home=${overflow} shop=${shopOverflow}`);
  return "no horizontal overflow";
});

await step("mobile nav + bag", async () => {
  await page.goto("http://localhost:4173/product/eve-lf280k-lifepo4", { waitUntil: "networkidle2" });
  await clickText("button", /add to bag|add to cart/);
  await new Promise((r) => setTimeout(r, 800));
  await shot("12-mobile-product");
  const body = await text();
  if (!/subtotal|bag/i.test(body)) throw new Error("no cart feedback on mobile");
  return "mobile add-to-bag works";
});

console.log("\n================ RESULTS ================");
results.forEach((line) => console.log(line));
console.log("\nConsole errors:", errors.length);
[...new Set(errors)].slice(0, 12).forEach((e) => console.log("  •", e));
console.log("Failed requests:", failed.length);
[...new Set(failed)].slice(0, 8).forEach((e) => console.log("  •", e));

await browser.close();
server.close();
