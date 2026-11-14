/**
 * Verifies that no card carries a coloured left-edge strip.
 * Run: npm run build && node scripts/no-strips-e2e.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import puppeteer from "puppeteer";

const html = readFileSync("dist/index.html");
const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed += 1; console.log(`PASS ${name}`); };
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#admin-pin");
  await page.type("#admin-pin", "246810");
  await page.click("button[type='submit']");
  await page.waitForSelector(".ax-shell");

  /* A strip is: a wide left border, a coloured ::before/::after bar, or a coloured inset bar. */
  const scan = (selectors) => page.evaluate((list) => {
    const offenders = [];
    for (const selector of list) {
      for (const el of document.querySelectorAll(selector)) {
        const styles = getComputedStyle(el);
        const borders = [styles.borderLeftWidth, styles.borderRightWidth];
        for (const width of borders) {
          const px = parseFloat(width) || 0;
          const colour = styles.borderLeftColor || "";
          if (px > 1 && !colour.includes("rgba(0, 0, 0, 0)")) offenders.push(`${selector} border ${width}`);
        }
        for (const pseudo of ["::before", "::after"]) {
          const p = getComputedStyle(el, pseudo);
          if (p.content === "none" || p.content === '""') continue;
          const w = parseFloat(p.width) || 0;
          const h = parseFloat(p.height) || 0;
          const background = p.backgroundColor || "";
          const isBar = w <= 8 && h > 8;
          const coloured = background && !background.includes("0, 0, 0, 0") && background !== "rgba(0, 0, 0, 0)";
          if (isBar && coloured) offenders.push(`${selector}${pseudo} ${w}x${h} ${background}`);
        }
        /* Computed shadows serialise colour-first ("rgb(…) 3px 0px 0px 0px inset"), so parse
           the numbers instead of pattern-matching author order. A hard, un-blurred inset
           shadow offset on one axis is an edge strip. */
        const parts = (styles.boxShadow || "").split(/,(?![^(]*\))/);
        for (const part of parts) {
          if (!/inset/.test(part)) continue;
          const nums = (part.match(/-?\d+(?:\.\d+)?px/g) || []).map((n) => parseFloat(n));
          if (nums.length >= 4 && nums[2] === 0 && nums[3] === 0 && ((Math.abs(nums[0]) >= 2 && nums[1] === 0) || (Math.abs(nums[1]) >= 2 && nums[0] === 0))) {
            offenders.push(`${selector} inset strip ${part.trim()}`);
          }
        }
      }
    }
    return offenders;
  }, selectors);

  const targets = [".adm-stat", ".ax-kpi", ".ax-card", ".an-insight", ".ax-task", ".ax-sheet-item", ".adm-panel", ".ax-stock-card", ".ax-product-card", ".ax-promo-card", ".ax-channel-card", ".ax-order-card", ".ax-review", ".ax-recipe", ".ax-chem-card", ".ax-set-card", ".ax-member", ".ax-customer-card", ".ax-stock-table tr"];
  await page.click(".ax-bottombar [aria-haspopup='dialog']");
  await page.waitForSelector(".ax-sheet");
  check("navigation sheet has no coloured strips", (await scan(targets)).length === 0);
  await page.click(".ax-sheet [aria-label='Close all sections']");
  await page.waitForSelector(".ax-sheet", { hidden: true });

  for (const destination of ["Stock & Prices", "Marketing", "Battery Builder AI", "Analytics"]) {
    await page.click(".ax-bottombar [aria-haspopup='dialog']");
    await page.waitForSelector(".ax-sheet");
    for (const handle of await page.$$(".ax-sheet-item")) {
      if ((await handle.$eval(".ax-sheet-label", (el) => el.textContent)) === destination) { await handle.click(); break; }
    }
    await page.waitForSelector(".ax-sheet", { hidden: true });
    if (destination === "Stock & Prices") {
      // an edited row is the state that used to grow a lime edge strip
      await page.evaluate(() => document.querySelector(".ax-stock-card .ax-stepper button[aria-label^='Increase']")?.click());
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const found = await scan(targets);
    check(`${destination}: no coloured strips on any card`, found.length === 0);
  }

  /* Storefront pack builder advisor rows use the same pattern. */
  await page.goto(`${base}/pack-builder`, { waitUntil: "domcontentloaded" });
  await new Promise((resolve) => setTimeout(resolve, 700));
  check("pack builder advisor rows have no coloured strips", (await scan([".builder-advisor li"])).length === 0);
  console.log(`\n${passed} strip checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
