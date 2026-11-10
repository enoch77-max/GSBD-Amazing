/**
 * Live end-to-end suite: drives the REAL stack (backend + Postgres + built
 * storefront + owner console) in headless Chrome. The server must already be
 * running — pass BASE=http://127.0.0.1:4300.
 *
 * Covers: catalogue sync → search → product → review → OTP → checkout →
 * claim-token confirmation → tracking → owner login → overview → fulfilment →
 * courier → inventory edit → image upload → promo → settings → blocklist.
 */
import fs from "node:fs";
import puppeteer from "puppeteer";

const BASE = process.env.BASE ?? "http://127.0.0.1:4300";
const SHOTS = "e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });
fs.writeFileSync("/tmp/pixel.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });

const errors = [];
const failed = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${String(e).slice(0, 240)}`));
page.on("requestfailed", (r) => {
  const url = r.url();
  if (url.includes("pexels") || url.includes("fonts.g") || url.includes("analytics")) return;
  failed.push(`${r.failure()?.errorText} ${url.slice(0, 90)}`);
});

const results = [];
const step = async (name, fn) => {
  try {
    const info = await fn();
    results.push(`PASS  ${name}${info ? ` — ${info}` : ""}`);
    console.log(`ok - ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name} — ${String(error).slice(0, 240)}`);
    console.log(`FAIL - ${name}: ${String(error).slice(0, 240)}`);
  }
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
  await el.evaluate((node) => node.click());
  await wait(450);
};

let orderNumber = "";
let slug = "";

/* 1 — home renders the live catalogue */
await step("home renders live catalogue", async () => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("h1");
  await wait(1700);
  const consent = await page.evaluateHandle(() =>
    [...document.querySelectorAll("button")].find((el) => /Accept all/.test(el.textContent || "") && el.offsetParent !== null) ?? null);
  if (consent.asElement()) {
    await consent.asElement().evaluate((node) => node.click());
    await wait(400);
  }
  const live = await page.evaluate(() => window.__GSBD_LIVE__ === true);
  if (!live) throw new Error("live flag missing");
  const cards = await page.$$eval("a[href^='/product/']", (els) => els.length);
  if (cards < 5) throw new Error(`only ${cards} product links`);
  slug = await page.$eval("a[href^='/product/']", (el) => el.getAttribute("href").split("/")[2]);
  return `${cards} product links`;
});

/* 2 — search suggests from the live index */
await step("header search suggests", async () => {
  const box = await page.$("input[type='search'], input[placeholder*='earch' i]");
  if (!box) throw new Error("no search box");
  await box.click();
  await box.type("18650", { delay: 60 });
  await wait(900);
  const body = await text();
  if (!/18650/.test(body)) throw new Error("no suggestions");
  await page.keyboard.press("Escape");
  return "suggestions shown";
});

/* 3 — product detail + review persists across reload */
await step("product detail + review persists", async () => {
  await page.goto(`${BASE}/product/${slug}`, { waitUntil: "networkidle2" });
  await wait(700);
  await clickText("button", /Reviews/);
  await wait(400);
  await clickText("button", /Write a review/);
  await wait(400);
  await page.type("input[aria-label='Your name']", "Live Buyer");
  await page.type("input[aria-label='Review title']", "Solid cells");
  await page.type("textarea[aria-label='Review details']", "Capacity tested and matched, exactly as advertised in live mode.");
  const submitHandle = await page.evaluateHandle(() => {
    const area = document.querySelector("textarea[aria-label='Review details']");
    return area?.closest("form")?.querySelector("button[type='submit']") ?? null;
  });
  const submit = submitHandle.asElement();
  if (!submit) throw new Error("review submit not found");
  await submit.evaluate((node) => node.click());
  await wait(2000);
  if (!(await text()).includes("Solid cells")) throw new Error("review not listed after post");
  await page.reload({ waitUntil: "networkidle2" });
  await wait(700);
  await clickText("button", /Reviews/);
  await wait(500);
  if (!(await text()).includes("Solid cells")) throw new Error("review did not survive reload");
  return "review persisted server-side";
});

/* 4 — bag + OTP handshake */
await step("bag + OTP handshake", async () => {
  await page.goto(`${BASE}/product/${slug}`, { waitUntil: "networkidle2" });
  await wait(700);
  await clickText("button", /add to bag/i);
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#name");
  await page.type("#name", "Live Customer");
  await page.type("#phone", "01810000001");
  await page.type("#address", "House 1, Road 1, Dhanmondi, Dhaka 1205");
  await clickText("button", /^Send code$/);
  await wait(600);
  const hint = await text();
  const code = hint.match(/your code is (\d{6})/)?.[1];
  if (!code) throw new Error("no OTP code surfaced");
  await page.type("input[aria-label='Verification code']", code);
  await clickText("button", /^Verify$/);
  await wait(500);
  if (!(await text()).includes("Mobile number verified")) throw new Error("OTP not verified");
  return `verified ${code}`;
});

/* 5 — checkout places a real order, confirmation via claim token */
await step("checkout places order", async () => {
  await page.type("#trx", "LIVE01ABCD");
  await clickText("button[type=submit]", /place order|confirm order|pay/i);
  await page.waitForFunction(() => location.pathname.startsWith("/order/"), { timeout: 25000 });
  await wait(1200);
  orderNumber = page.url().match(/order\/(GSBD-\d+)/)?.[1] ?? "";
  if (!orderNumber) throw new Error("no order page");
  const body = await text();
  if (!body.includes(orderNumber) || !body.includes("Live status") && !body.includes("In this parcel")) {
    throw new Error("confirmation missing order details");
  }
  return orderNumber;
});

/* 6 — public tracking with phone */
await step("order tracking works", async () => {
  await page.goto(`${BASE}/track`, { waitUntil: "networkidle2" });
  await wait(600);
  const inputs = await page.$$("input[type='text'], input:not([type]), input[type='tel']");
  if (inputs.length < 2) throw new Error(`track form not found (${inputs.length} inputs)`);
  await inputs[0].type(orderNumber);
  await inputs[1].type("01810000001");
  await clickText("button", /track|search|find/i);
  await wait(1500);
  const body = await text();
  if (!body.includes(orderNumber)) throw new Error("tracking did not resolve the order");
  return `tracked ${orderNumber}`;
});

/* 7 — owner login + live overview */
await step("owner login + overview KPIs", async () => {
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle2" });
  await wait(800);
  await page.type("input[type='email']", "owner@shop.test");
  await page.type("input[type='password']", "owner-password-123");
  await clickText("button", /sign in/i);
  await wait(1200);
  const body = await text();
  if (!body.includes("Trading overview")) throw new Error("overview did not load");
  if (!body.includes("Revenue")) throw new Error("KPIs missing");
  await shot("e2e-overview");
  return "signed in, KPIs live";
});

/* 8 — fulfil the order: pack + note + courier */
await step("fulfil order + courier booking", async () => {
  await clickText(".adm-nav-btn", /Orders/);
  await wait(900);
  const handle = await page.evaluateHandle((num) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === num) ?? null, orderNumber);
  const el = handle.asElement();
  if (!el) throw new Error(`order ${orderNumber} not in table`);
  await el.click();
  await page.waitForSelector(".adm-drawer", { timeout: 5000 });
  await wait(500);
  await shot("e2e-order-panel");
  await clickText(".adm-drawer-foot button", /Mark packing/i);
  await wait(700);
  await clickText(".adm-drawer-foot button", /Book courier/i);
  await wait(900);
  await page.type("input[aria-label='Add internal note']", "E2E: confirmed address by phone");
  await clickText(".adm-drawer-body button", /^Add$/);
  await wait(700);
  const body = await text();
  if (!body.includes("Packing")) throw new Error("status did not advance");
  if (!/PT\d{6}|SF\d{6}/.test(body)) throw new Error("no consignment id");
  if (!body.includes("E2E: confirmed address")) throw new Error("note not saved");
  await page.keyboard.press("Escape");
  return "packed + booked + noted";
});

/* 9 — inline stock edit sticks */
await step("inventory stock edit persists", async () => {
  await page.keyboard.press("Escape");
  await wait(300);
  await clickText(".adm-nav-btn", /Products/);
  await wait(900);
  const target = await page.evaluate(() => fetch("/api/catalog").then((r) => r.json()).then((c) => c.products[2]));
  const handle = await page.evaluateHandle((name) =>
    [...document.querySelectorAll("input[aria-label^='Stock for']")].find((el) => el.getAttribute("aria-label") === `Stock for ${name}`) ?? null,
    target.name);
  const input = handle.asElement();
  if (!input) throw new Error("stock input not found");
  await input.click({ clickCount: 3 });
  await input.type("42");
  await page.keyboard.press("Enter");
  await wait(800);
  const check = await page.evaluate((slug) => fetch(`/api/products/${slug}`).then((r) => r.json()).then((j) => j.product.stock), target.slug);
  if (check !== 42) throw new Error(`stock is ${check}, expected 42`);
  return `${target.slug} → 42 units`;
});

/* 10 — image upload through the product drawer */
await step("image upload attaches to product", async () => {
  await clickText("button", /^Edit$/);
  await page.waitForSelector(".adm-drawer", { timeout: 5000 });
  await wait(500);
  const fileInput = await page.$(".adm-drawer input[type='file']");
  if (!fileInput) throw new Error("no file input in drawer");
  await fileInput.uploadFile("/tmp/pixel.png");
  await wait(2000);
  const attached = await page.evaluate(() => [...document.querySelectorAll(".adm-drawer input")].some((el) => el.value.includes("/uploads/")));
  if (!attached) {
    const toast = await page.evaluate(() => document.querySelector(".adm-toast")?.textContent ?? "no toast");
    throw new Error(`upload did not attach (${toast})`);
  }
  await clickText(".adm-drawer-foot button", /Save changes/i);
  await wait(1000);
  const body = await text();
  if (/Could not save|must be/i.test(body)) throw new Error("save failed after upload");
  await page.keyboard.press("Escape");
  return "upload saved on product";
});

/* 11 — promo created in console applies at checkout */
await step("promo create + checkout discount", async () => {
  await page.keyboard.press("Escape");
  await wait(300);
  await clickText(".adm-nav-btn", /Growth/);
  await wait(900);
  await clickText(".adm-chip", /Promos/i);
  await wait(700);
  const panel = await page.evaluateHandle(() =>
    [...document.querySelectorAll("section")].find((s) => /New promo/.test(s.querySelector("h2")?.textContent ?? "")) ?? null);
  const panelEl = panel.asElement();
  if (!panelEl) throw new Error("promo form not found");
  const fields = await panelEl.$$("input");
  if (fields.length < 5) throw new Error(`only ${fields.length} promo fields`);
  const fill = async (index, value) => {
    await fields[index].click({ clickCount: 3 });
    await fields[index].type(value);
  };
  await fill(0, "E2E50");
  await fill(1, "E2E fifty off");
  await fill(2, "50");
  await fill(3, "100");
  await clickText("button", /^Create$/);
  await wait(900);
  if (!(await text()).includes("E2E50")) throw new Error("promo not listed");

  /* Spend it from the storefront on a fresh number. */
  await page.goto(`${BASE}/product/${slug}`, { waitUntil: "networkidle2" });
  await wait(700);
  await clickText("button", /add to bag/i);
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#name");
  await page.type("#name", "Promo Buyer");
  await page.type("#phone", "01810000002");
  await page.type("#address", "House 2, Road 2, Banani, Dhaka 1213");
  await page.type("#promo", "E2E50");
  await wait(300);
  await clickText("button", /^Apply$/);
  await wait(800);
  const summary = await text();
  if (!/E2E50 applied|Discount/.test(summary)) throw new Error("promo did not apply");
  return "E2E50 applied live";
});

/* 12 — blocklist + settings round-trip */
await step("blocklist blocks, settings apply", async () => {
  await page.keyboard.press("Escape");
  await wait(300);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle2" });
  await wait(1000);
  await clickText(".adm-nav-btn", /Settings/);
  await wait(1000);
  await clickText(".adm-chip", /Blocklist/i);
  await wait(600);
  await page.type("input[aria-label='Phone to block']", "01810000009");
  await clickText("button", /^Block$/);
  await wait(800);
  if (!(await text()).includes("01810000009")) throw new Error("blocklist entry missing");

  await clickText(".adm-chip", /Shipping/i);
  await wait(600);
  const panel = await page.evaluateHandle(() =>
    [...document.querySelectorAll("section")].find((s) => /Delivery & cash on delivery/.test(s.querySelector("h2")?.textContent ?? "")) ?? null);
  const panelEl = panel.asElement();
  if (!panelEl) throw new Error("shipping panel not found");
  const nums = await panelEl.$$("input");
  await nums[1].click({ clickCount: 3 });
  await nums[1].type("99");
  await panelEl.$eval("button", (b) => b.click());
  await wait(900);
  const catalog = await page.evaluate(() => fetch("/api/catalog").then((r) => r.json()));
  if (catalog.settings.shipping.insideDhaka !== 99) throw new Error("setting did not reach the storefront");
  return "blocked + ৳99 Dhaka rate live";
});

console.log("\n================ RESULTS ================");
console.log(results.join("\n"));
console.log(`\nConsole errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 8).join("\n"));
console.log(`Failed requests: ${failed.length}`);
if (failed.length) console.log(failed.slice(0, 6).join("\n"));

await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
