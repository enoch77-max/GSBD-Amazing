/**
 * Regression for the mobile More / All sections sheet.
 * Run: npm run build && node scripts/navigation-sheet-e2e.mjs
 * Optional screenshots: NAV_SCREENSHOTS=/tmp/gsbd-navigation node scripts/navigation-sheet-e2e.mjs
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
const screenshotDir = process.env.NAV_SCREENSHOTS;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
const expected = ["Overview", "Orders", "Products", "Stock & Prices", "Customers", "Battery Builder AI", "Marketing", "Analytics", "Settings", "My Account", "Storefront", "Sign out"];
let browser;
let checks = 0;
const check = (name, condition) => { assert.ok(condition, name); checks += 1; console.log(`PASS ${name}`); };

try {
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(`${base}/admin#settings`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#admin-pin");
  await page.type("#admin-pin", "246810");
  await page.click("button[type='submit']");
  await page.waitForSelector(".ax-shell");

  const open = async () => {
    await page.click(".ax-bottombar [aria-haspopup='dialog']");
    await page.waitForSelector(".ax-sheet", { visible: true });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Close all sections");
  };
  const close = async () => {
    await page.click(".ax-sheet [aria-label='Close all sections']");
    await page.waitForSelector(".ax-sheet", { hidden: true });
  };
  const select = async (label) => {
    for (const handle of await page.$$(".ax-sheet-item")) {
      const text = await handle.$eval(".ax-sheet-label", (element) => element.textContent);
      if (text === label) { await handle.click(); return; }
    }
    assert.fail(`Missing navigation item ${label}`);
  };

  for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await open();
    const layout = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".ax-sheet-item")];
      const header = document.querySelector(".ax-sheet-header").getBoundingClientRect();
      const close = document.querySelector(".ax-sheet [aria-label='Close all sections']").getBoundingClientRect();
      return {
        labels: items.map((item) => item.querySelector(".ax-sheet-label").textContent),
        badLabels: items.filter((item) => {
          const label = item.querySelector(".ax-sheet-label");
          const rect = label.getBoundingClientRect();
          const box = item.getBoundingClientRect();
          const style = getComputedStyle(label);
          return label.scrollWidth > label.clientWidth + 1 || style.whiteSpace === "nowrap" || style.textOverflow === "ellipsis" || rect.left < box.left || rect.right > box.right;
        }).map((item) => item.textContent),
        rowHeights: items.map((item) => item.getBoundingClientRect().height),
        rowWidths: items.map((item) => item.getBoundingClientRect().width),
        badgeWidths: [...document.querySelectorAll(".ax-sheet-trailing > .ax-badge")].map((badge) => badge.getBoundingClientRect().width),
        noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth && document.querySelector(".ax-sheet-scroll").scrollWidth <= document.querySelector(".ax-sheet-scroll").clientWidth,
        headerTop: header.top,
        closeWidth: close.width,
        closeHeight: close.height,
        bodyLocked: document.body.style.overflow === "hidden",
        backgroundInert: document.querySelector(".ax-shell").inert && document.querySelector(".ax-bottombar").inert,
      };
    });
    assert.deepEqual(layout.labels, expected);
    check(`${width}px: all 12 full titles, without clipping`, layout.badLabels.length === 0);
    check(`${width}px: full-width rows, at least 52px tall`, layout.rowHeights.every((h) => h >= 52) && layout.rowWidths.every((w) => w >= Math.min(width - 40, 480)));
    check(`${width}px: intrinsic-sized badges`, layout.badgeWidths.every((w) => w >= 22 && w < 55));
    check(`${width}px: no horizontal scrolling`, layout.noHorizontalScroll);
    check(`${width}px: background locked and close target ≥44px`, layout.bodyLocked && layout.backgroundInert && layout.closeWidth >= 44 && layout.closeHeight >= 44);
    const afterScroll = await page.evaluate(() => {
      const list = document.querySelector(".ax-sheet-scroll");
      list.scrollTop = list.scrollHeight;
      const last = list.querySelector(".ax-sheet-group:last-child .ax-sheet-list li:last-child").getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      return { headerTop: document.querySelector(".ax-sheet-header").getBoundingClientRect().top, lastVisible: last.top >= bounds.top && last.bottom <= bounds.bottom + 1 };
    });
    check(`${width}px: fixed header and final action reachable`, Math.abs(afterScroll.headerTop - layout.headerTop) < 1 && afterScroll.lastVisible);
    await page.evaluate(() => { document.querySelector(".ax-sheet-scroll").scrollTop = 0; });
    if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `all-sections-${width}.png`) });
    await close();
  }

  await page.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true });
  await page.evaluate(() => document.querySelector(".adm-root").style.setProperty("--ax-body", "22px"));
  await open();
  check("320px: enlarged text wraps without truncating", await page.evaluate(() => [...document.querySelectorAll(".ax-sheet-label")].every((label) => label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1)));
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "all-sections-320-large-text.png") });
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  check("keyboard focus loops to the last action", await page.evaluate(() => document.activeElement?.textContent.includes("Sign out")));
  await page.keyboard.press("Tab");
  check("keyboard focus loops back to Close", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Close all sections"));
  await page.keyboard.press("Escape");
  await page.waitForSelector(".ax-sheet", { hidden: true });
  check("Escape restores scrolling, focus and background", await page.evaluate(() => document.body.style.overflow !== "hidden" && !document.querySelector(".ax-shell").inert && document.activeElement?.textContent.includes("More")));
  await page.evaluate(() => document.querySelector(".adm-root").style.removeProperty("--ax-body"));

  await open();
  await select("Stock & Prices");
  await page.waitForSelector(".ax-sheet", { hidden: true });
  check("Stock & Prices navigates and dismisses the sheet", await page.$eval(".ax-topbar-title", (element) => element.textContent.trim() === "Stock & Prices"));
  await open();
  await select("Battery Builder AI");
  await page.waitForSelector(".ax-sheet", { hidden: true });
  check("Battery Builder AI navigates correctly", await page.$eval(".ax-topbar-title", (element) => element.textContent.trim() === "Battery Builder AI"));
  await open();
  check("current destination has an accessible active state", await page.$eval(".ax-sheet-item[aria-current='page'] .ax-sheet-label", (element) => element.textContent === "Battery Builder AI"));
  await page.mouse.click(4, 4);
  await page.waitForSelector(".ax-sheet", { hidden: true });
  check("backdrop dismisses the sheet", await page.$(".ax-sheet") === null);
  await open();
  await page.setViewport({ width: 1280, height: 900, isMobile: true, hasTouch: true });
  await page.waitForSelector(".ax-sheet", { hidden: true });
  check("resizing to desktop closes the mobile sheet", await page.$eval(".ax-rail", (element) => getComputedStyle(element).display !== "none"));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await open();
  await select("Sign out");
  await page.waitForSelector("#admin-pin");
  check("Sign out still works and unlocks page scrolling", await page.evaluate(() => !document.querySelector(".ax-sheet") && document.body.style.overflow !== "hidden"));
  check("no browser runtime errors", errors.length === 0);
  console.log(`\n${checks} navigation sheet checks passed.`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
