/**
 * Verifies the mobile stock stepper and price field have real room for numbers.
 * Run: npm run build && node scripts/stepper-e2e.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
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
let passed = 0;
const check = (name, ok, detail = "") => { assert.ok(ok, `${name} ${detail}`); passed += 1; console.log(`PASS ${name}`); };
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  const page = await browser.newPage();
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#admin-pin");
  await page.type("#admin-pin", "246810");
  await page.click("button[type='submit']");
  await page.waitForSelector(".ax-bottombar");

  const openStock = async () => {
    const buttons = await page.$$(".ax-bottombar button");
    for (const button of buttons) {
      if ((await button.evaluate((el) => el.textContent)).includes("Stock")) { await button.click(); break; }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  };
  await openStock();
  await page.waitForSelector(".ax-stock-card .ax-stepper");

  /* Type a 6-digit quantity into the first stepper and confirm it is fully visible. */
  const measure = () => page.evaluate(() => {
    const input = document.querySelector(".ax-stock-card .ax-stepper > input");
    const box = input.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".ax-stock-card .ax-stepper > button")].map((b) => b.getBoundingClientRect());
    const style = getComputedStyle(input);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return {
      contentWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2,
      paddingLeft: parseFloat(style.paddingLeft),
      height: box.height,
      sixDigits: context.measureText("999999").width,
      buttonWidths: buttons.map((b) => b.width),
      textAlign: style.textAlign,
    };
  });

  for (const width of [320, 390, 430]) {
    await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await openStock();
    await page.waitForSelector(".ax-stock-card .ax-stepper");
    const metrics = await measure();
    check(`${width}px: input content fits a 6-digit quantity`, metrics.contentWidth >= metrics.sixDigits, `(content ${metrics.contentWidth.toFixed(0)}px vs text ${metrics.sixDigits.toFixed(0)}px)`);
    check(`${width}px: input keeps a generous padding`, metrics.paddingLeft >= 4 && metrics.paddingLeft <= 8, `(${metrics.paddingLeft}px)`);
    check(`${width}px: stepper is a 44px touch target`, metrics.height >= 44 && metrics.buttonWidths.every((w) => w >= 44));
    check(`${width}px: number is centred`, metrics.textAlign === "center");

    const price = await page.evaluate(() => {
      const input = document.querySelector(".ax-price > input");
      const box = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return { width: box.width, height: box.height, digits: context.measureText("4200000").width, content: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2 };
    });
    check(`${width}px: price field fits a 7-digit amount`, price.content >= price.digits && price.height >= 44);
  }

  /* The − button must still step the value down and the typed value must commit. */
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await new Promise((resolve) => setTimeout(resolve, 350));
  await openStock();
  const before = await page.$eval(".ax-stock-card .ax-stepper > input", (el) => el.value);
  await page.click(".ax-stock-card .ax-stepper > button");
  const after = await page.$eval(".ax-stock-card .ax-stepper > input", (el) => el.value);
  check(`− button decrements (${before} → ${after})`, Number(after) === Number(before) - 1);
  await page.focus(".ax-stock-card .ax-stepper > input");
  await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control");
  await page.keyboard.type("250");
  await page.keyboard.press("Enter");
  await new Promise((resolve) => setTimeout(resolve, 300));
  const staged = await page.$eval(".ax-stock-card .ax-stepper > input", (el) => el.value);
  check("typing a multi-digit quantity stages the new count", staged === "250", `(got ${staged})`);
  // Phase 3 made stock edits atomic: the floating bar commits the batch.
  await page.click(".ax-savebar-save");
  await new Promise((resolve) => setTimeout(resolve, 400));
  check("Save changes commits the staged count", await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("gsbd.storefront.v1") ?? "{}");
    return Object.values(saved.productPatches ?? {}).some((patch) => patch.stock === 250);
  }));
  console.log(`\n${passed} stepper checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
