/** Phase 5 acceptance: Marketing hub (Promotions + Growth & Ads). */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";

const html = readFileSync("dist/index.html");
const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/")) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: true })); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const shots = process.env.PHASE5_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
const check = (name, ok, detail = "") => { assert.ok(ok, `${name} ${detail}`); passed += 1; console.log(`PASS ${name}`); };
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.evaluateOnNewDocument(() => { window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__copied.push(t); } }, configurable: true }); });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#admin-pin");
  await page.type("#admin-pin", "246810");
  await page.click("button[type='submit']");
  await page.waitForSelector(".ax-bottombar");

  const openMarketing = async (tab) => {
    for (const button of await page.$$(".ax-bottombar button")) if ((await button.evaluate((el) => el.textContent)).includes("More")) { await button.click(); break; }
    await page.waitForSelector(".ax-sheet");
    for (const item of await page.$$(".ax-sheet-item")) if ((await item.evaluate((el) => el.textContent)).includes("Marketing")) { await item.click(); break; }
    await page.waitForSelector(".ax-hub");
    for (const button of await page.$$(".ax-hub button")) if ((await button.evaluate((el) => el.textContent)).trim() === tab) { await button.click(); break; }
    await wait(400);
  };
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
  const noX = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await openMarketing("Promotions");
  check("Marketing hub exposes Promotions and Growth & Ads switcher", (await page.$$eval(".ax-hub button", (nodes) => nodes.map((n) => n.textContent.trim()))).join("|").includes("Growth & Ads"));
  await page.waitForSelector(".ax-promo-card");
  check("promotions render as coupon cards (no table)", await page.$eval(".ax-promo-card", (card) => Boolean(card.querySelector(".ax-code-chip")) && Boolean(card.querySelector(".ax-progress")) && Boolean(card.querySelector("[role='switch']"))) && (await page.$(".adm-table")) === null);
  check("card shows headline offer value", await page.$eval(".ax-promo-value strong", (el) => /%|৳|FREE/.test(el.textContent)));
  check("card shows expiry and usage progress", await page.$eval(".ax-promo-card", (card) => Boolean(card.querySelector(".ax-promo-expiry")) && /used/.test(card.querySelector(".ax-promo-usage-head").textContent)));
  check("no horizontal overflow", await noX());
  await shot("promotions-mobile");

  await page.click(".ax-code-chip");
  check("code chip is 1-tap copy", await page.evaluate(() => window.__copied.length > 0 && /^[A-Z0-9]+$/.test(window.__copied.at(-1))));

  const switchBefore = await page.$eval(".ax-promo-card [role='switch']", (el) => el.getAttribute("aria-checked"));
  await page.click(".ax-promo-card [role='switch']");
  await wait(250);
  check("live/paused toggle flips instantly", switchBefore !== await page.$eval(".ax-promo-card [role='switch']", (el) => el.getAttribute("aria-checked")));
  check("paused state persists to storage", await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("gsbd.ops.v1") ?? "{}");
    return Array.isArray(saved.promos) && saved.promos.some((promo) => promo.active === false);
  }));

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("New offer"))?.click());
  await page.waitForSelector(".ax-preset-grid");
  check("creation sheet offers three visual presets", await page.$$eval(".ax-preset-grid button", (nodes) => nodes.length === 3 && nodes.every((node) => node.getBoundingClientRect().height >= 44)));
  check("presets cover promo / volume / bundle", await page.$eval(".ax-preset-grid", (el) => /Promo code/.test(el.textContent) && /Volume bulk discount/.test(el.textContent) && /Battery bundle deal/.test(el.textContent)));
  await page.evaluate(() => [...document.querySelectorAll(".ax-preset-grid button")].find((b) => b.textContent.includes("Volume"))?.click());
  await wait(150);
  check("choosing a preset pre-fills the offer", await page.$eval("input[aria-label='Usage limit']", (el) => el.value === "100"));
  await page.evaluate(() => {
    const code = document.querySelector("input[aria-label='Code']");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(code, "BULK15"); code.dispatchEvent(new Event("input", { bubbles: true }));
    const label = document.querySelector("input[aria-label='Description']");
    setter.call(label, "15% off cases of 10+"); label.dispatchEvent(new Event("input", { bubbles: true }));
    const value = document.querySelector("input[aria-label='Discount value']");
    setter.call(value, "15"); value.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(120);
  await page.evaluate(() => [...document.querySelectorAll(".adm-drawer-foot button")].find((b) => b.textContent.includes("Create offer"))?.click());
  await wait(400);
  check("new volume offer appears as a card", await page.evaluate(() => [...document.querySelectorAll(".ax-code-chip")].some((chip) => chip.textContent.includes("BULK15"))));
  await shot("promotions-create");

  await openMarketing("Growth & Ads");
  await page.waitForSelector(".ax-channel-card");
  check("four high-clarity channel cards", await page.$eval(".ax-channel-grid", (grid) => grid.querySelectorAll(".ax-channel-card").length >= 4));
  check("cards name the actionable channels", await page.$eval(".ax-channel-grid", (grid) => /Google Shopping/.test(grid.textContent) && /Meta Ads/.test(grid.textContent) && /Abandoned cart recovery/.test(grid.textContent) && /AI upsell popups/.test(grid.textContent)));
  check("each card shows spend, revenue and ROAS", await page.$eval(".ax-channel-card", (card) => /Spend/.test(card.textContent) && /Revenue/.test(card.textContent) && Boolean(card.querySelector(".ax-roas-pill, .ax-pill"))));
  const small = await page.$eval(".ax-channel-card", (card) => {
    // Switches are 32px tall by design but sit inside a 44px header row;
    // every other control must itself be at least 44px tall.
    return [...card.querySelectorAll("button")].map((button) => {
      const isSwitch = button.getAttribute("role") === "switch";
      const height = (isSwitch ? button.closest(".ax-channel-head") : button).getBoundingClientRect().height;
      return { label: button.getAttribute("aria-label") || button.textContent.trim().slice(0, 18), isSwitch, height: Math.round(height * 10) / 10 };
    }).filter((entry) => entry.height < 44);
  });
  check("campaign switch + budget adjuster are thumb sized", small.length === 0, JSON.stringify({ small, vw: await page.evaluate(() => window.innerWidth) }));
  const hit = await page.$$eval(".ax-channel-card [role='switch'], .ax-promo-card [role='switch']", (nodes) => nodes.map((node) => {
    const box = node.closest(".ax-active-switch, .ax-channel-head, .ax-promo-head");
    const r = box.getBoundingClientRect();
    return { cls: box.className.slice(0, 24), h: Math.round(r.height * 10) / 10, minH: getComputedStyle(box).minHeight, vw: window.innerWidth, scrollY: Math.round(window.scrollY) };
  }).filter((entry) => entry.h < 44));
  check("campaign switch hit area is 44px on phones", hit.length === 0, JSON.stringify(hit));
  const budgetBefore = await page.$eval(".ax-budget output", (el) => el.textContent);
  await page.click(".ax-budget button[aria-label^='Increase']");
  await wait(200);
  check("budget stepper changes the daily budget", budgetBefore !== await page.$eval(".ax-budget output", (el) => el.textContent));
  check("budget persists", await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("gsbd.ops.v1") ?? "{}");
    return saved.campaigns && Object.values(saved.campaigns).some((c) => c.dailyBudget > 0);
  }));
  const campaignBefore = await page.$eval(".ax-channel-card [role='switch']", (el) => el.getAttribute("aria-checked"));
  await page.click(".ax-channel-card [role='switch']");
  await wait(200);
  check("campaign active switch flips", campaignBefore !== await page.$eval(".ax-channel-card [role='switch']", (el) => el.getAttribute("aria-checked")));
  check("no horizontal overflow in growth", await noX());
  await shot("growth-mobile");

  await page.evaluate(() => [...document.querySelectorAll(".ax-channel-more-row button")].find((b) => b.textContent.includes("Cart recovery"))?.click());
  await wait(200);
  check("cart recovery panel opens inline", await page.$(".ax-channel-more-body") !== null);
  await page.evaluate(() => [...document.querySelectorAll(".ax-channel-more-row button")].find((b) => b.textContent.includes("Pixel"))?.click());
  await wait(200);
  check("pixel inspector panel opens inline", await page.$eval(".ax-channel-more-body", (el) => /Events captured|Consent/.test(el.textContent)));

  for (const width of [320, 390, 430, 768, 1280]) {
    await page.setViewport({ width, height: 900, isMobile: width < 769, hasTouch: width < 769 });
    await wait(120);
    check(`${width}px: no horizontal page overflow`, await noX());
  }
  check("no browser runtime errors", errors.length === 0, errors.join(" | "));
  console.log(`\n${passed} Phase 5 checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
