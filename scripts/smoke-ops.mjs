/**
 * Production-readiness smoke test against the built preview.
 * Drives the merchant console and the hardened checkout end to end in headless Chrome.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const DIST = path.resolve("dist");
const SHOTS = "/tmp/ops-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(4176, resolve));

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });

const errors = [];
const failed = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${String(e).slice(0, 260)}`));
page.on("requestfailed", (r) => { const u = r.url(); if (!u.includes("pexels") && !u.includes("fonts.g")) failed.push(`${r.failure()?.errorText} ${u.slice(0, 80)}`); });

const results = [];
const step = async (name, fn) => {
  try { const info = await fn(); results.push(`PASS  ${name}${info ? ` — ${info}` : ""}`); }
  catch (error) { results.push(`FAIL  ${name} — ${String(error).slice(0, 240)}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => page.evaluate(() => document.body.innerText);
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const clickText = async (selector, pattern) => {
  const handle = await page.evaluateHandle((sel, src) => {
    const re = new RegExp(src, "i");
    return [...document.querySelectorAll(sel)].find((el) => re.test((el.textContent || "").trim()) && el.offsetParent !== null) ?? null;
  }, selector, pattern.source);
  const el = handle.asElement();
  if (!el) throw new Error(`no ${selector} matching ${pattern}`);
  await el.click();
  await wait(420);
};

/* ---------------- storefront + consent ---------------- */
await step("storefront renders", async () => {
  await page.goto("http://localhost:4176/", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("h1");
  return `${await page.$$eval("a[href^='/product/']", (e) => e.length)} product links`;
});

await step("consent banner appears and accepts", async () => {
  await wait(1600);
  await clickText("button", /^Accept all$/);
  const consent = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd.ops.v1") || "{}").consent);
  if (consent !== "granted") throw new Error(`consent=${consent}`);
  return "granted";
});

await step("legal pages render", async () => {
  const out = [];
  for (const [route, needle] of [["/privacy", "What we collect"], ["/terms", "Safe use of lithium"], ["/refunds", "Getting your money back"]]) {
    await page.goto(`http://localhost:4176${route}`, { waitUntil: "networkidle2" });
    await wait(400);
    const body = await text();
    if (!body.includes(needle)) throw new Error(`${route} missing "${needle}"`);
    out.push(route);
  }
  return out.join(", ");
});

await step("sitemap + robots served", async () => {
  const sm = await (await fetch("http://localhost:4176/sitemap.xml")).text();
  const rb = await (await fetch("http://localhost:4176/robots.txt")).text();
  const urls = (sm.match(/<loc>/g) || []).length;
  if (urls < 20) throw new Error(`only ${urls} sitemap URLs`);
  if (!rb.includes("Disallow: /admin")) throw new Error("robots does not block /admin");
  return `${urls} URLs, admin blocked`;
});

/* ---------------- checkout with OTP + payment verification ---------------- */
let orderNumber = "";
await step("add to bag and open checkout", async () => {
  await page.goto("http://localhost:4176/product/samsung-inr18650-30q", { waitUntil: "networkidle2" });
  await wait(600);
  await clickText("button", /add to bag/i);
  await page.goto("http://localhost:4176/checkout", { waitUntil: "networkidle2" });
  await page.waitForSelector("#name");
  return "checkout open";
});

await step("checkout blocks unverified phone", async () => {
  await page.type("#name", "Nusrat Jahan");
  await page.type("#phone", "01812345678");
  await page.type("#address", "House 7, Road 4, Banani, Dhaka 1213");
  await wait(300);
  await clickText("button[type=submit]", /place order|confirm order|pay/i);
  await wait(500);
  const body = await text();
  if (!body.includes("Please verify your mobile number before placing the order.")) throw new Error("OTP gate did not block submission");
  if (/\/order\/GSBD-/.test(page.url())) throw new Error("order created despite unverified phone");
  return "blocked until OTP";
});

await step("OTP send + verify", async () => {
  await clickText("button", /^Send code$/);
  await wait(400);
  const hint = await text();
  const code = hint.match(/your code is (\d{6})/)?.[1];
  if (!code) throw new Error("no preview OTP surfaced");
  await page.type("input[aria-label='Verification code']", code);
  await clickText("button", /^Verify$/);
  await wait(400);
  if (!(await text()).includes("Mobile number verified")) throw new Error("not verified");
  return `code ${code}`;
});

await step("declined payment is rejected", async () => {
  await page.type("#trx", "ABCDEF00");
  await clickText("button[type=submit]", /place order|confirm order|pay/i);
  await wait(2200);
  const body = await text();
  if (!body.includes("The provider declined this transaction.")) throw new Error("declined TrxID was not rejected");
  if (/\/order\/GSBD-/.test(page.url())) throw new Error("order created on a declined payment");
  return "ends-in-00 declined";
});

await step("valid payment places order", async () => {
  await page.click("#trx", { clickCount: 3 });
  await page.type("#trx", "9F7A2B1C4D");
  await clickText("button[type=submit]", /place order|confirm order|pay/i);
  await wait(3200);
  const url = page.url();
  orderNumber = url.match(/order\/(GSBD-\d+)/)?.[1] ?? "";
  if (!orderNumber) throw new Error(`no order created, url=${url}`);
  return orderNumber;
});

await step("Purchase event + stock decrement", async () => {
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd.ops.v1") || "{}"));
  const catalogue = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd.storefront.v1") || "{}"));
  const purchase = (state.events || []).find((e) => e.name === "Purchase");
  if (!purchase) throw new Error("no Purchase event");
  if (purchase.params.order_id !== orderNumber) throw new Error("Purchase order_id mismatch");
  const patch = catalogue.productPatches?.["samsung-inr18650-30q"];
  if (!patch || typeof patch.stock !== "number") throw new Error("stock not decremented");
  return `value ৳${purchase.params.value}, stock now ${patch.stock}`;
});

await step("order confirmation queued", async () => {
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd.ops.v1") || "{}"));
  const msg = (state.outbox || []).find((m) => m.orderNumber === orderNumber);
  if (!msg) throw new Error("no confirmation message");
  return `${msg.channel} → ${msg.to} (${msg.status})`;
});

/* ---------------- merchant console ---------------- */
await step("admin login gate", async () => {
  await page.goto("http://localhost:4176/admin", { waitUntil: "networkidle2" });
  await wait(600);
  if (!(await text()).includes("Merchant console")) throw new Error("no login screen");
  await page.type("input[aria-label='Access PIN']", "246810");
  await clickText("button", /Unlock console/i);
  await wait(700);
  if (!(await text()).includes("Trading overview")) throw new Error("login failed");
  return "signed in";
});

await step("overview KPIs and chart", async () => {
  const body = (await text()).toLowerCase();
  for (const needle of ["revenue", "roas", "cod share", "revenue against ad spend"]) {
    if (!body.includes(needle)) throw new Error(`missing ${needle}`);
  }
  const svg = await page.$$eval(".adm-chart svg path", (e) => e.length);
  if (svg < 2) throw new Error("chart not drawn");
  await shot("01-overview");
  return `${svg} chart paths`;
});

await step("launch checklist flags blockers", async () => {
  const body = await text();
  if (!/No live payment gateway|Meta Pixel not connected/i.test(body)) throw new Error("no readiness blockers shown");
  return "blockers surfaced";
});

await step("orders table + drawer + status advance", async () => {
  await clickText(".adm-nav-btn", /Orders/);
  await wait(600);
  await clickText(".adm-chip", /^All/);
  await wait(400);
  const found = await page.evaluateHandle((num) => {
    return [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === num) ?? null;
  }, orderNumber);
  const el = found.asElement();
  if (!el) throw new Error(`order ${orderNumber} not in table`);
  await el.click();
  await wait(700);
  await page.waitForSelector(".adm-drawer", { timeout: 5000 });
  const drawer = (await text()).toLowerCase();
  if (!drawer.includes("fulfilment timeline")) throw new Error("drawer did not open");
  await shot("02-order-drawer");
  await clickText(".adm-drawer-foot button", /Mark packing|Mark confirmed/i);
  await wait(600);
  if (!(await text()).toLowerCase().includes("packing")) throw new Error("status did not advance");
  return "advanced to packing";
});

await step("courier booking + internal note", async () => {
  await clickText(".adm-drawer-foot button", /Book courier/i);
  await wait(700);
  const body = await text();
  if (!/PT\d{6}|SF\d{6}/.test(body)) throw new Error("no consignment id");
  await page.type("input[aria-label='Add internal note']", "Called customer, confirmed address");
  await clickText(".adm-drawer-body button", /^Add$/);
  await wait(500);
  if (!(await text()).includes("Called customer")) throw new Error("note not saved");
  return "consignment + note saved";
});

await step("bulk select and CSV export", async () => {
  await page.keyboard.press("Escape");
  await wait(400);
  await page.click("input[aria-label='Select all orders']");
  await wait(400);
  const body = await text();
  if (!/selected ·/.test(body)) throw new Error("bulk bar missing");
  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp/ops-dl" });
  await clickText("button", /Orders CSV/i);
  await wait(900);
  const files = fs.existsSync("/tmp/ops-dl") ? fs.readdirSync("/tmp/ops-dl") : [];
  if (!files.some((f) => f.endsWith(".csv"))) throw new Error("no CSV downloaded");
  return files.find((f) => f.endsWith(".csv"));
});

await step("inventory inline stock edit", async () => {
  await clickText(".adm-nav-btn", /Stock/);
  await wait(700);
  const input = await page.$("input[aria-label^='Stock for']");
  if (!input) throw new Error("no stock input");
  await input.click({ clickCount: 3 });
  await input.type("42");
  await page.keyboard.press("Enter");
  await wait(600);
  const value = await page.$eval("input[aria-label^='Stock for']", (el) => el.value);
  if (value !== "42") throw new Error(`stock=${value}`);
  await shot("03-inventory");
  return "stock set to 42";
});

await step("growth: spend log updates ROAS", async () => {
  await clickText(".adm-nav-btn", /Growth/);
  await wait(700);
  const before = await text();
  await page.type("input[placeholder='1200']", "5000");
  await clickText("button", /Save spend/i);
  await wait(700);
  const after = await text();
  if (before === after) throw new Error("spend did not change the report");
  await shot("04-growth");
  return "spend logged, ROAS recalculated";
});

await step("pixel inspector shows real events", async () => {
  await clickText(".adm-chip", /Pixel inspector/i);
  await wait(600);
  const body = await text();
  if (!body.includes("Purchase")) throw new Error("Purchase not in event stream");
  if (!body.includes("Connections")) throw new Error("connections panel missing");
  await shot("05-events");
  return "event stream live";
});

await step("outbox holds generated messages", async () => {
  await clickText(".adm-chip", /Message outbox/i);
  await wait(600);
  const body = await text();
  if (!body.includes("Customer messages")) throw new Error("outbox missing");
  return `${(body.match(/order_confirmation/g) || []).length} confirmations`;
});

await step("settings: connect pixel clears blocker", async () => {
  await clickText(".adm-nav-btn", /Settings/);
  await wait(700);
  await clickText(".adm-chip", /Marketing/);
  await wait(500);
  await page.type("input[placeholder='123456789012345']", "123456789012345");
  await wait(500);
  await clickText(".adm-chip", /Business/);
  await wait(400);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd.ops.v1") || "{}"));
  if (state.settings?.marketing?.metaPixelId !== "123456789012345") throw new Error("pixel not persisted");
  await shot("06-settings");
  return "pixel saved";
});

await step("mobile console has no overflow", async () => {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto("http://localhost:4176/admin", { waitUntil: "networkidle2" });
  await wait(900);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`${overflow}px horizontal overflow`);
  await shot("07-mobile-admin");
  return "no overflow at 390px";
});

console.log("\n================ RESULTS ================");
console.log(results.join("\n"));
console.log(`\nConsole errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 8).join("\n"));
console.log(`Failed requests: ${failed.length}`);
if (failed.length) console.log(failed.slice(0, 5).join("\n"));

await browser.close();
server.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
