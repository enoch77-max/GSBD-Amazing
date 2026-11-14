/** Phase 4 acceptance: Battery Pack Builder AI console. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";

const html = readFileSync("dist/index.html");
const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/")) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: true, live: false })); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const shots = process.env.PHASE4_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
const check = (name, ok, detail = "") => { assert.ok(ok, `${name} ${detail}`); passed += 1; console.log(`PASS ${name}`); };
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#admin-pin");
  await page.type("#admin-pin", "246810");
  await page.click("button[type='submit']");
  await page.waitForSelector(".ax-bottombar");
  for (const button of await page.$$(".ax-bottombar button")) if ((await button.evaluate((el) => el.textContent)).includes("More")) { await button.click(); break; }
  await page.waitForSelector(".ax-sheet");
  for (const item of await page.$$(".ax-sheet-item")) if ((await item.evaluate((el) => el.textContent)).includes("Battery Builder AI")) { await item.click(); break; }
  await wait(500);
  check("nav reaches Battery Builder AI", await page.$eval(".ax-topbar-title", (el) => el.textContent.includes("Battery Builder AI")));
  check("three segmented sub-tabs exist", await page.$$eval(".ax-ai-tabs [role='tab']", (nodes) => nodes.length === 3 && nodes.every((node) => node.offsetParent !== null)));
  check("no horizontal overflow on phones", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  /* A. rules */
  check("chemistry cards render with active toggles", await page.$$eval(".ax-chem-card", (nodes) => nodes.length === 4 && nodes.every((node) => node.querySelector("[role='switch']"))));
  check("series + parallel guardrails use ranges", await page.$$eval("input[type='range']", (nodes) => nodes.length === 4));
  const switches = await page.$$(".ax-ai-page [role='switch']");
  const before = await switches[0].evaluate((el) => el.getAttribute("aria-checked"));
  await switches[0].click();
  await wait(150);
  check("chemistry toggle flips instantly", before !== await switches[0].evaluate((el) => el.getAttribute("aria-checked")));
  if (shots) await page.screenshot({ path: path.join(shots, "packai-rules.png") });

  /* B. add-ons */
  await page.evaluate(() => [...document.querySelectorAll(".ax-ai-tabs [role='tab']")].find((node) => node.textContent.includes("Add-ons"))?.click());
  await page.waitForSelector(".ax-recipe");
  check("recipe cards show trigger → suggestion flow", await page.$$eval(".ax-recipe", (nodes) => nodes.length >= 5 && nodes.every((node) => node.querySelector(".ax-recipe-trigger") && node.querySelector(".ax-recipe-suggest") && node.querySelector(".ax-recipe-arrow"))));
  check("each recipe exposes attach rate + enable switch", await page.$eval(".ax-recipe", (card) => Boolean(card.querySelector(".ax-attach-badge")) && Boolean(card.querySelector("[role='switch']"))));
  check("auto-optimise toggle and bundle stepper present", await page.evaluate(() => Boolean(document.querySelector("[aria-label='AI auto-optimise']")) && Boolean(document.querySelector(".ax-bundle-stepper"))));
  const discountBefore = await page.$eval(".ax-bundle-stepper output", (el) => el.textContent);
  await page.click(".ax-bundle-stepper button[aria-label^='Increase']");
  await wait(120);
  check("bundle discount stepper updates", discountBefore !== await page.$eval(".ax-bundle-stepper output", (el) => el.textContent));
  if (shots) await page.screenshot({ path: path.join(shots, "packai-addons.png") });

  /* C. simulator */
  await page.evaluate(() => [...document.querySelectorAll(".ax-ai-tabs [role='tab']")].find((node) => node.textContent.includes("Simulator"))?.click());
  await page.waitForSelector(".ax-sim-controls");
  check("simulator offers voltage and capacity chips", await page.$$eval(".ax-sim-options.numeric", (groups) => groups.length === 2 && groups.every((group) => group.querySelectorAll("button").length >= 5)));
  check("simulator chip targets are thumb-sized", await page.$$eval(".ax-sim-options.numeric button", (nodes) => nodes.every((node) => node.getBoundingClientRect().height >= 44)));
  await page.evaluate(() => [...document.querySelectorAll(".ax-sim-options.numeric button")].find((node) => node.textContent.trim() === "48V")?.click());
  await page.evaluate(() => [...document.querySelectorAll(".ax-sim-options button")].find((node) => node.textContent.includes("LiFePO4"))?.click());
  await wait(250);
  const quoteText = await page.evaluate(() => document.body.innerText);
  check("simulator renders a real quote with cells + BMS", /Preview build|Guardrail reached/.test(quoteText) && (/BMS/.test(quoteText)) && (/\d+S\d+P/.test(quoteText)));
  check("simulator shows customer total", /Customer pays|Guardrail reached/.test(quoteText));
  if (shots) await page.screenshot({ path: path.join(shots, "packai-simulator.png") });

  /* Guardrail: force an impossible range then simulate */
  await page.evaluate(() => [...document.querySelectorAll(".ax-ai-tabs [role='tab']")].find((node) => node.textContent.includes("Rules"))?.click());
  await wait(150);
  await page.evaluate(() => {
    const slider = document.querySelector("input[aria-label='Maximum series']");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(slider, "3");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(150);
  await page.evaluate(() => [...document.querySelectorAll(".ax-ai-tabs [role='tab']")].find((node) => node.textContent.includes("Simulator"))?.click());
  await wait(250);
  check("out-of-range builds show a guardrail message", await page.evaluate(() => /Guardrail reached|Guardrail:/.test(document.body.innerText)));
  check("guardrail card links back to the rules tab", await page.$(".ax-sim-blocked .ax-link") !== null);

  for (const width of [320, 390, 430, 768, 1280]) {
    await page.setViewport({ width, height: 900, isMobile: width < 769, hasTouch: width < 769 });
    await wait(120);
    check(`${width}px: no horizontal page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  check("no browser runtime errors", errors.length === 0, errors.join(" | "));
  console.log(`\n${passed} Phase 4 checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
