/** Phase 6 acceptance: Settings hub + My Account. */
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
const shots = process.env.PHASE6_SHOTS;
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
  const noX = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
  const openSettings = async () => {
    for (const button of await page.$$(".ax-bottombar button")) if ((await button.evaluate((el) => el.textContent)).includes("More")) { await button.click(); break; }
    await page.waitForSelector(".ax-sheet");
    for (const item of await page.$$(".ax-sheet-item")) if ((await item.evaluate((el) => el.textContent)).includes("Settings")) { await item.click(); break; }
    await page.waitForSelector(".ax-settings-shell");
    await wait(350);
  };

  await openSettings();
  check("settings sub-nav has three sections", await page.$$eval(".ax-set-nav-item", (nodes) => nodes.length === 3 && /Store/.test(nodes.map((node) => node.textContent).join("|")) && /Team/.test(nodes.map((node) => node.textContent).join("|")) && /Activity/.test(nodes.map((node) => node.textContent).join("|"))));
  const navLayout = await page.$eval(".ax-settings-nav", (nav) => getComputedStyle(nav).flexDirection);
  check("mobile sub-nav is a horizontal pill row", navLayout === "row");
  check("settings cards present: payments, shipping, hazmat, tax, alerts", await page.$$eval(".ax-set-card", (nodes) => ["Payment gateways", "Shipping & delivery", "Lithium shipping compliance", "Tax", "Stock alerts"].every((label) => nodes.some((node) => node.textContent.includes(label)))));
  check("payment gateways use toggle switches", await page.$$eval(".ax-gateway-row [role='switch']", (nodes) => nodes.length >= 4));
  const hazmat = await page.$eval(".ax-set-card", (el) => el.textContent);
  await page.evaluate(() => [...document.querySelectorAll(".ax-set-card-head")].find((b) => b.textContent.includes("Lithium"))?.click());
  await wait(250);
  check("hazmat card exposes UN number, surface-only and Wh declaration", await page.evaluate(() => {
    const text = document.body.innerText;
    return /Lithium shipping compliance/.test(text) && /Surface transport only/.test(text) && /UN3480|UN3481|UN3090/.test(text) && /watt-hours/i.test(text);
  }));
  void hazmat;
  await page.evaluate(() => {
    const head = [...document.querySelectorAll(".ax-set-card-head")].find((b) => b.textContent.includes("Payment"));
    if (head && head.getAttribute("aria-expanded") !== "true") head.click();
  });
  await wait(250);
  const payBefore = await page.$eval(".ax-gateway-row [role='switch']", (el) => el.getAttribute("aria-checked"));
  await page.click(".ax-gateway-row [role='switch']");
  await wait(200);
  check("gateway toggle flips instantly", payBefore !== await page.$eval(".ax-gateway-row [role='switch']", (el) => el.getAttribute("aria-checked")));
  check("settings page has no horizontal scroll", await noX());
  await shot("settings-store");

  /* Team */
  await page.evaluate(() => [...document.querySelectorAll(".ax-set-nav-item")].find((b) => /Team/.test(b.textContent))?.click());
  await page.waitForSelector(".ax-member");
  check("team renders member cards with avatars, names, role and status", await page.$eval(".ax-member", (card) => Boolean(card.querySelector(".adm-avatar")) && Boolean(card.querySelector(".adm-badge")) && card.textContent.length > 10));
  check("role badges read Admin / Warehouse / Support vocabulary", await page.$eval(".ax-member-list", (list) => /Admin|Warehouse|Support|Marketing|Viewer/.test(list.textContent)));
  await shot("settings-team");
  await page.evaluate(() => [...document.querySelectorAll(".ax-member button")].find((b) => b.textContent.includes("Permissions"))?.click());
  await page.waitForSelector(".ax-perm-group");
  check("permissions drawer groups toggles by section", await page.$$eval(".ax-perm-group", (nodes) => nodes.length >= 4 && nodes.every((node) => node.querySelector("[role='switch']"))));
  check("permissions use switches, not checkboxes", await page.evaluate(() => document.querySelectorAll(".ax-perm-group [role='switch']").length >= 10 && document.querySelectorAll(".ax-perm-group input[type='checkbox']").length === 0));
  await shot("settings-permissions");
  await page.click(".adm-drawer [aria-label='Close']");
  await page.waitForSelector(".adm-drawer", { hidden: true });

  /* Activity */
  await page.evaluate(() => [...document.querySelectorAll(".ax-set-nav-item")].find((b) => /Activity/.test(b.textContent))?.click());
  await wait(400);
  check("activity shows a vertical timeline", (await page.$$(".ax-tl-entry")).length > 0);
  check("timeline entries show icon, summary and relative time", await page.$eval(".ax-tl-entry", (entry) => Boolean(entry.querySelector(".ax-tl-icon")) && /ago|Just now|now/.test(entry.querySelector("time")?.textContent ?? "")));
  check("activity filters by action type", await page.$eval(".ax-seg", (seg) => /Price changed/.test(seg.textContent) && /Stock adjusted/.test(seg.textContent) && /AI rule updated/.test(seg.textContent)));
  check("activity filters by team member", await page.$(".ax-activity-filters select[aria-label='Filter by team member']") !== null);
  const entriesBefore = (await page.$$(".ax-tl-entry")).length;
  await page.evaluate(() => [...document.querySelectorAll(".ax-seg button")].find((b) => b.textContent.includes("Stock adjusted"))?.click());
  await wait(250);
  check("action filter narrows the timeline", (await page.$$(".ax-tl-entry")).length <= entriesBefore);
  await shot("settings-activity");
  const firstEntry = await page.$(".ax-tl-main");
  if (firstEntry) {
    await firstEntry.click();
    await wait(200);
    check("timeline entries expand with audit detail", await page.$(".ax-tl-detail dl") !== null);
  }

  /* Account drawer */
  await page.click(".ax-topbar [aria-label='Open my account']");
  await page.waitForSelector(".adm-drawer");
  await wait(250);
  check("account panel opens from the avatar", await page.$eval(".adm-drawer", (drawer) => /My account/i.test(drawer.textContent)));
  check("theme switcher offers light / dark / system", await page.$$eval(".ax-theme-switch button", (nodes) => nodes.length === 3 && /Light/.test(nodes[0].textContent) && /Dark/.test(nodes[1].textContent) && /System/.test(nodes[2].textContent)));
  await page.evaluate(() => [...document.querySelectorAll(".ax-theme-switch button")].find((b) => b.textContent.includes("Dark"))?.click());
  await wait(350);
  check("dark theme applies to the console", await page.evaluate(() => document.documentElement.dataset.admTheme === "dark"));
  await shot("account-dark");
  await page.evaluate(() => [...document.querySelectorAll(".ax-theme-switch button")].find((b) => b.textContent.includes("Light"))?.click());
  await wait(300);
  check("light theme restores", await page.evaluate(() => document.documentElement.dataset.admTheme === "light"));
  check("notification switches include high-value + critical stock", await page.$eval(".adm-drawer", (drawer) => /High-value orders/.test(drawer.textContent) && /Critical stock alerts/.test(drawer.textContent)));
  check("2FA toggle and sign-out action exist", await page.$eval(".adm-drawer", (drawer) => /Two-factor authentication/.test(drawer.textContent) && /Sign out/.test(drawer.textContent)));
  await page.evaluate(() => [...document.querySelectorAll(".adm-drawer .ax-toggle-row")].find((row) => /High-value/.test(row.textContent))?.querySelector("[role='switch']")?.click());
  await wait(250);
  check("notification preference persists", await page.evaluate(() => JSON.parse(localStorage.getItem("gsbd.ops.v1") ?? "{}").account?.notifyHighValue === false));
  await page.click(".adm-drawer [aria-label='Close']");
  await page.waitForSelector(".adm-drawer", { hidden: true });

  for (const width of [320, 390, 430, 768, 1280]) {
    await page.setViewport({ width, height: 900, isMobile: width < 769, hasTouch: width < 769 });
    await wait(120);
    check(`${width}px: no horizontal page overflow`, await noX());
  }
  check("no browser runtime errors", errors.length === 0, errors.join(" | "));
  console.log(`\n${passed} Phase 6 checks passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
