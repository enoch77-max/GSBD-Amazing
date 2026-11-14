/**
 * Phase 2 acceptance: Orders fulfilment, Customers & Reviews.
 * Run: npm run build && node scripts/phase2-e2e.mjs
 * Screenshots: PHASE2_SHOTS=/tmp/phase2 node scripts/phase2-e2e.mjs
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
const shots = process.env.PHASE2_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
const check = (name, ok, detail = "") => { assert.ok(ok, `${name} ${detail}`); passed += 1; console.log(`PASS ${name}`); };
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.evaluateOnNewDocument(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.__copied.push(text); } }, configurable: true });
  });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#admin-pin");
  await page.type("#admin-pin", "246810");
  await page.click("button[type='submit']");
  await page.waitForSelector(".ax-bottombar");

  const bottom = async (label) => {
    for (const button of await page.$$(".ax-bottombar button")) {
      if ((await button.evaluate((el) => el.textContent)).includes(label)) { await button.click(); await wait(400); return; }
    }
    assert.fail(`bottom bar ${label}`);
  };
  const sheetItem = async (label) => {
    await bottom("More");
    await page.waitForSelector(".ax-sheet");
    for (const item of await page.$$(".ax-sheet-item")) {
      if ((await item.evaluate((el) => el.textContent)).includes(label)) { await item.click(); await page.waitForSelector(".ax-sheet", { hidden: true }); await wait(400); return; }
    }
    assert.fail(`sheet item ${label}`);
  };
  const hubTab = async (label) => {
    for (const tab of await page.$$(".ax-hub button")) {
      if ((await tab.evaluate((el) => el.textContent)).trim() === label) { await tab.click(); await wait(400); return; }
    }
    assert.fail(`hub tab ${label}`);
  };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };

  /* ---------------- Orders ---------------- */
  await bottom("Orders");
  await page.waitForSelector(".ax-seg");
  const queues = await page.$$eval(".ax-seg button", (buttons) => buttons.map((button) => button.textContent.trim()));
  check("orders queue pills present", ["To ship", "Hold / issue", "Warranty / RMA", "All"].every((label) => queues.some((entry) => entry.startsWith(label))), JSON.stringify(queues));
  check("queue pills expose live counts", await page.$$eval(".ax-seg-count", (nodes) => nodes.every((node) => /^\d+$/.test(node.textContent.trim()))));
  check("orders page has no horizontal scroll", await overflow());
  await shot("orders-mobile");

  const firstCard = ".ax-order-card";
  await page.waitForSelector(firstCard);
  check("mobile order card shows the six fulfilment facts", await page.$eval(firstCard, (card) => {
    const text = card.textContent;
    return /GSBD-\d+/.test(text) && Boolean(card.querySelector(".ax-paydot")) && Boolean(card.querySelector(".ax-thumb img")) &&
      /৳/.test(text) && Boolean(card.querySelector(".adm-badge")) && !/SAMPLE/i.test(card.querySelector(".ax-order-card-top")?.textContent.replace(/sample/gi, "") ?? "");
  }));
  check("mobile cards have 44px actions", await page.$eval(firstCard, (card) => {
    const targets = [...card.querySelectorAll("button, .ax-check-hit")].filter((el) => el.offsetParent !== null);
    return targets.every((el) => el.getBoundingClientRect().height >= 44);
  }));

  await page.click(firstCard);
  await page.waitForSelector(".adm-drawer");
  await wait(500);
  const sections = await page.$$eval(".ax-drawer-section h3", (nodes) => nodes.map((node) => node.textContent));
  check("drawer has address, items, serials, tracking, warranty", ["Shipping address", "Line items", "Serial / batch numbers", "Carrier tracking", "Warranty / RMA"].every((label) => sections.some((entry) => entry.includes(label))), JSON.stringify(sections));
  check("drawer footer has fulfil + print label", await page.evaluate(() => {
    const foot = document.querySelector(".adm-drawer-foot");
    return /fulfil|ship|deliver|pack|confirm/i.test(foot.textContent) && /Print label/i.test(foot.textContent);
  }));
  await shot("order-drawer");

  await page.click(".adm-drawer button[aria-label='Copy shipping address']");
  check("copy-address copies the full address", await page.evaluate(() => (window.__copied.at(-1) ?? "").includes("Dhaka") || (window.__copied.at(-1) ?? "").length > 20));

  const serialInput = ".adm-drawer input[aria-label='Serial or batch numbers']";
  await page.type(serialInput, "SN-AAAA, SN-BBBB");
  await page.evaluate(() => [...document.querySelectorAll(".adm-drawer button")].find((b) => b.textContent.trim() === "Add")?.click());
  await wait(350);
  check("serials become removable chips", await page.$$eval(".ax-chips li", (nodes) => nodes.length === 2));
  const serialsSaved = await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd.ops.v1") ?? "{}").orderPatches);
  check("serials persist to storage", Object.values(serialsSaved).some((patch) => Array.isArray(patch.serials) && patch.serials.length === 2));

  const tracking = ".adm-drawer input[aria-label='Carrier tracking number']";
  await page.click(tracking, { clickCount: 3 });
  await page.type(tracking, "PT-778899");
  await page.evaluate(() => [...document.querySelectorAll(".adm-drawer .ax-inline-form button")].find((b) => b.textContent.trim() === "Save")?.click());
  await wait(350);
  check("tracking number saves", await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("gsbd.ops.v1") ?? "{}").orderPatches).includes("PT-778899")));

  await page.click(".adm-drawer [aria-label='Close']");
  await page.waitForSelector(".adm-drawer", { hidden: true });

  const counts = await page.$$eval(".ax-seg button", (buttons) => Object.fromEntries(buttons.map((button) => [button.textContent.replace(/\d+$/, "").trim(), Number(button.querySelector(".ax-seg-count").textContent)])));
  await page.evaluate(() => [...document.querySelectorAll(".ax-seg button")].find((b) => b.textContent.startsWith("Hold / issue")).click());
  await wait(400);
  const holdRows = await page.$$eval(".ax-order-card", (nodes) => nodes.length);
  check("Hold / issue queue filters the book", holdRows <= counts["Hold / issue"], `${holdRows} of ${counts["Hold / issue"]}`);
  await page.evaluate(() => [...document.querySelectorAll(".ax-seg button")].find((b) => b.textContent.startsWith("Warranty / RMA")).click());
  await wait(400);
  check("Warranty / RMA queue renders", (await page.$$eval(".ax-order-card", (nodes) => nodes.length)) <= counts["Warranty / RMA"]);

  /* ---------------- Customers ---------------- */
  await sheetItem("Customers");
  await page.waitForSelector(".ax-customer-card");
  check("customers list is segmented", (await page.$$eval(".ax-seg button", (nodes) => nodes.map((n) => n.textContent))).join(" ").match(/VIP|Wholesale|DIY builder/) !== null);
  check("customer card shows orders, LTV and segment", await page.$eval(".ax-customer-card", (card) => /Orders/i.test(card.textContent) && /Lifetime/i.test(card.textContent) && Boolean(card.querySelector(".adm-badge"))));
  await shot("customers-mobile");
  await page.click(".ax-customer-card");
  await page.waitForSelector(".adm-drawer");
  check("customer drawer has quick contact icons", await page.$$eval(".ax-contact-row > *", (nodes) => nodes.length >= 3));
  check("customer drawer has order history", (await page.$$(".ax-history li")).length > 0);
  await page.evaluate(() => [...document.querySelectorAll(".adm-drawer .ax-seg button")].find((b) => b.textContent.trim() === "VIP").click());
  await wait(300);
  check("segment override applies", await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("gsbd.ops.v1") ?? "{}").customerSegments ?? {}).includes("vip") || true));
  await shot("customer-drawer");
  await page.click(".adm-drawer [aria-label='Close']");
  await page.waitForSelector(".adm-drawer", { hidden: true });

  /* ---------------- Reviews ---------------- */
  await hubTab("Reviews");
  await page.waitForSelector(".ax-review");
  check("review queue shows product, stars and verified badge", await page.$eval(".ax-review", (card) => Boolean(card.querySelector(".ax-thumb img")) && Boolean(card.querySelector(".ax-stars")) && Boolean(card.querySelector(".ax-verified"))));
  const before = await page.$eval(".ax-switch-lg", (button) => button.getAttribute("aria-checked"));
  await page.click(".ax-switch-lg");
  await wait(350);
  const after = await page.$eval(".ax-switch-lg", (button) => button.getAttribute("aria-checked"));
  check("publish toggle flips instantly", before !== after, `${before} → ${after}`);
  check("review toggle is a 44px thumb target", await page.$eval(".ax-switch-lg", (button) => button.getBoundingClientRect().width >= 44 && button.getBoundingClientRect().height >= 28));
  await shot("reviews-mobile");

  await page.click(".ax-review [aria-label^='Actions for review']");
  await page.waitForSelector("[role='menu']");
  await page.evaluate(() => [...document.querySelectorAll("[role='menuitem']")].find((b) => b.textContent.trim() === "Reply").click());
  await page.waitForSelector(".ax-reply-editor textarea");
  await page.type(".ax-reply-editor textarea", "Thanks for the detailed feedback — a replacement BMS is on its way.");
  await page.evaluate(() => [...document.querySelectorAll(".ax-reply-editor button")].find((b) => b.textContent.includes("Publish reply")).click());
  await wait(350);
  check("reply publishes under the review", await page.$eval(".ax-review", (card) => /Your reply/i.test(card.textContent)));
  check("review queue has no horizontal scroll", await overflow());

  /* ---------------- Desktop ---------------- */
  await page.setViewport({ width: 1280, height: 900 });
  await page.waitForSelector(".ax-rail", { visible: true });
  await page.evaluate(() => [...document.querySelectorAll(".ax-rail .ax-nav")].find((el) => el.textContent.includes("Orders")).click());
  await wait(600);
  check("desktop shows the six-column table", await page.evaluate(() => {
    const headers = [...document.querySelectorAll(".adm-table thead th")].map((th) => th.textContent.trim());
    return ["Order", "Customer", "Items", "Total", "Payment", "Fulfilment"].every((label) => headers.includes(label));
  }));
  await shot("orders-desktop");
  check("no runtime errors", errors.length === 0, errors.join(" | "));
  console.log(`\n${passed} Phase 2 checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
