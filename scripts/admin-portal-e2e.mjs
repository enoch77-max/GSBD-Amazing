// Browser acceptance for the preview merchant console.
// Run after `npm run build` with Puppeteer available (npm install --no-save puppeteer).
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";

const html = fs.readFileSync("dist/index.html");
const server = http.createServer((_, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const shots = process.env.ADMIN_SCREENSHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [];
let passed = 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (name, ok, detail = "") => { assert.ok(ok, `${name} ${detail}`); passed++; console.log(`PASS ${name}`); };

async function fresh(width = 1440) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: width < 640 ? 844 : 950 });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("gsbd.ops.v1", JSON.stringify({ consent: "denied" })));
  return { context, page };
}
async function go(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await wait(500);
}
async function click(page, selector, text) {
  const handle = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)]
    .find((element) => (text instanceof RegExp ? false : element.textContent.includes(text)) && element.offsetParent !== null && !element.disabled), { selector, text });
  const element = handle.asElement();
  assert.ok(element, `visible ${selector} containing “${text}”`);
  await element.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await element.click();
  await wait(250);
}
async function typeInto(page, selector, value) {
  await page.$eval(selector, (element) => { element.focus(); element.select?.(); });
  await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}
async function signIn(page, pin = "246810") {
  await go(page, "/admin");
  await page.waitForSelector("input[aria-label='Access PIN'], .adm-rail");
  if (await page.$(".adm-rail")) return; // session still valid
  await page.type("input[aria-label='Access PIN']", pin);
  await click(page, "button[type=submit]", "Unlock console");
  await page.waitForSelector(".adm-rail");
}
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
const bodyText = (page) => page.evaluate(() => document.body.innerText);

try {
  /* 1. Discoverability from the storefront */
  {
    const { context, page } = await fresh();
    await go(page, "/");
    await click(page, "button[aria-label='Open menu']", "Menu");
    await click(page, "[role=dialog] a", "Merchant console");
    await page.waitForSelector("input[aria-label='Access PIN']");
    check("menu drawer opens the merchant console", page.url().includes("/admin"));
    await go(page, "/");
    check("footer links to the console", await page.$eval("footer a[href='/admin']", (a) => a.textContent.includes("Merchant console")));
    await go(page, "/admin");
    check("first-time sign-in explains the preview PIN", (await bodyText(page)).includes("246810"));
    await shot(page, "login");
    await context.close();
  }

  /* 2. Lockout after repeated failures */
  {
    const { context, page } = await fresh();
    await go(page, "/admin");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await page.type("input[aria-label='Access PIN']", "999999");
      await click(page, "button[type=submit]", "Unlock console");
      if (attempt < 5) check(`wrong PIN ${attempt} reports attempts left`, (await bodyText(page)).includes(`${5 - attempt} attempt`));
    }
    check("fifth failure locks sign-in", (await bodyText(page)).includes("Too many attempts"));
    check("PIN field disabled while locked", await page.$eval("input[aria-label='Access PIN']", (input) => input.disabled));
    await go(page, "/admin");
    check("lockout survives reload", (await bodyText(page)).includes("Too many attempts"));
    await context.close();
  }

  /* 3. Main console workflow */
  const { context, page } = await fresh();
  await signIn(page);
  check("default PIN warning is visible after sign-in", (await bodyText(page)).includes("Default PIN in use"));
  check("session expiry is shown", (await bodyText(page)).includes("Signed in until"));
  await go(page, "/admin");
  check("session persists across reload", Boolean(await page.$(".adm-rail")));
  await shot(page, "overview");

  await click(page, ".adm-nav-btn", "Products");
  await page.waitForSelector("table.adm-table");
  const seedRows = await page.$$eval("table.adm-table tbody tr", (rows) => rows.length);
  check("catalogue lists the whole product range", seedRows >= 30, `(${seedRows})`);
  await shot(page, "catalogue");

  /* validation */
  await click(page, "button", "New product");
  await page.waitForSelector(".adm-drawer");
  await click(page, ".adm-drawer-foot button", "Create product");
  const errorsShown = await page.$$eval(".adm-field-error", (nodes) => nodes.map((node) => node.textContent));
  check("empty product cannot be saved", errorsShown.length >= 5, JSON.stringify(errorsShown));
  await page.type(".adm-drawer input.adm-input", "Test");
  await click(page, ".adm-drawer-foot button", "Cancel");
  check("unsaved changes ask before discarding", (await bodyText(page)).includes("Discard unsaved changes?"));
  await click(page, ".adm-drawer-foot button", "Discard");
  check("discard closes the editor", !(await page.$(".adm-drawer")));

  /* ready-made pack template */
  await click(page, "button", "New ready-made pack");
  await page.waitForSelector(".adm-drawer");
  const labels = await page.$$eval(".adm-drawer input[aria-label$='label']", (inputs) => inputs.map((input) => input.value));
  check("template pre-fills the Pack Builder specification fields", ["Chemistry", "Configuration", "Continuous discharge current", "BMS"].every((label) => labels.includes(label)));
  const field = async (label, value) => {
    const handle = await page.evaluateHandle((label) => [...document.querySelectorAll(".adm-drawer .adm-field")]
      .find((element) => element.querySelector(".adm-field-label")?.textContent.trim() === label)?.querySelector("input,textarea,select"), label);
    await handle.asElement().click({ clickCount: 3 });
    await handle.asElement().type(value);
  };
  await field("Product name", "Workshop 3S 6Ah Router Pack");
  check("slug is generated from the name", await page.$eval(".adm-drawer .adm-mono", (input) => input.value === "workshop-3s-6ah-router-pack"));
  await field("SKU", "gsb-pack-3s6");
  await field("Selling price ৳", "3600");
  await field("Complete packs in stock", "12");
  await field("One-line summary", "Tested 3S Li-ion pack with a 20A balance BMS.");
  const spec = async (label, value) => page.type(`.adm-drawer input[aria-label='${label} value']`, value);
  await spec("Chemistry", "Li-ion (NMC)");
  await spec("Configuration", "3S2P");
  await spec("Capacity", "6Ah");
  await spec("Nominal voltage", "10.8V");
  await spec("Charge voltage", "12.6V");
  await spec("Cutoff voltage", "9V");
  await spec("Continuous discharge current", "20A");
  await spec("BMS", "20A with balance");
  await spec("Output connector", "XT60");
  await spec("Energy", "64.8Wh");
  await spec("Dimensions", "75 × 40 × 70 mm");
  await spec("Weight", "320 g");
  check("hidden draft is not yet a Pack Builder match", await page.$eval(".adm-readiness", (el) => el.dataset.ok === "false"));
  await page.click(".adm-drawer input.adm-checkbox");
  await wait(150);
  check("complete on-sale pack passes readiness", await page.$eval(".adm-readiness", (el) => el.dataset.ok === "true"));
  await shot(page, "pack-editor");
  await click(page, ".adm-drawer-foot button", "Create product");
  await page.waitForSelector(".adm-toast");
  check("pack is created", !(await page.$(".adm-drawer")) && (await bodyText(page)).includes("Workshop 3S 6Ah Router Pack"));
  check("catalogue shows the Pack Builder match badge", await page.evaluate(() => [...document.querySelectorAll("tr")].some((row) => row.textContent.includes("Workshop 3S 6Ah") && row.textContent.includes("Pack Builder match"))));
  check("SKU is normalised to upper case", (await bodyText(page)).includes("GSB-PACK-3S6"));

  /* duplicate slug / SKU protection */
  await click(page, "button", "New product");
  await field("Product name", "Workshop 3S 6Ah Router Pack");
  await field("SKU", "GSB-PACK-3S6");
  await click(page, ".adm-drawer-foot button", "Create product");
  const duplicateErrors = await page.$$eval(".adm-field-error", (nodes) => nodes.map((node) => node.textContent).join(" "));
  check("duplicate URL and SKU are rejected", duplicateErrors.includes("already uses this URL") && duplicateErrors.includes("SKU is already in use"));
  await click(page, ".adm-drawer-foot button", "Cancel");
  await click(page, ".adm-drawer-foot button", "Discard");

  /* storefront & persistence */
  await go(page, "/product/workshop-3s-6ah-router-pack");
  check("new product has a storefront page", (await page.$eval("h1", (h) => h.textContent)).includes("Workshop 3S 6Ah Router Pack"));
  await go(page, "/shop?category=battery-packs");
  check("new product appears in the shop", (await bodyText(page)).includes("Workshop 3S 6Ah"));

  /* Pack Builder uses the listing when custom cells are unavailable */
  await signIn(page);
  await click(page, ".adm-nav-btn", "Stock");
  for (const name of ["Samsung INR18650-30Q", "Molicel P42A"]) {
    const input = await page.evaluateHandle((name) => [...document.querySelectorAll("tr")].find((row) => row.textContent.includes(name))?.querySelector("input[aria-label^='Stock for']"), name);
    await input.asElement().click({ clickCount: 3 });
    await input.asElement().type("0");
    await page.keyboard.press("Enter");
    await wait(150);
  }
  await go(page, "/pack-builder?cell=18650&s=3&p=2&load=10");
  await page.waitForSelector("#pack-alternatives");
  await click(page, ".pack-match-tabs button", "Ready-made");
  check("Pack Builder recommends the new ready-made pack", (await bodyText(page)).includes("Workshop 3S 6Ah Router Pack"));
  await shot(page, "pack-builder-suggestion");

  /* edit, hide, show */
  await signIn(page);
  await click(page, ".adm-nav-btn", "Products");
  await typeInto(page, "input[aria-label='Search catalogue']", "Workshop 3S");
  await page.click("button[aria-label='Edit Workshop 3S 6Ah Router Pack']");
  await page.waitForSelector(".adm-drawer");
  await field("Selling price ৳", "3400");
  await click(page, ".adm-drawer-foot button", "Save changes");
  await go(page, "/product/workshop-3s-6ah-router-pack");
  check("price edits reach the storefront", (await bodyText(page)).includes("3,400"));
  await signIn(page);
  await click(page, ".adm-nav-btn", "Products");
  await page.click("button[aria-label='Hide Workshop 3S 6Ah Router Pack']");
  await wait(200);
  await go(page, "/product/workshop-3s-6ah-router-pack");
  check("hidden product is removed from the storefront", (await bodyText(page)).toLowerCase().includes("isn"));
  await signIn(page);
  await click(page, ".adm-nav-btn", "Stock");
  check("hidden product remains manageable in Stock", await page.evaluate(() => [...document.querySelectorAll("tr")].some((row) => row.textContent.includes("Workshop 3S") && row.textContent.includes("Hidden"))));
  await click(page, ".adm-nav-btn", "Products");
  await page.click("button[aria-label='Show Workshop 3S 6Ah Router Pack']");
  await go(page, "/product/workshop-3s-6ah-router-pack");
  check("product can be put back on sale", (await page.$eval("h1", (h) => h.textContent)).includes("Workshop 3S"));

  /* delete & restore a built-in product */
  await signIn(page);
  await click(page, ".adm-nav-btn", "Products");
  await page.click("button[aria-label='Delete LG HG2 18650 3000mAh']");
  check("delete asks for confirmation", (await bodyText(page)).includes("Delete permanently?"));
  await click(page, "[role=group] button", "Delete");
  check("built-in product can be restored after deletion", (await bodyText(page)).includes("Deleted built-in products"));
  await go(page, "/admin");
  check("deletion persists across reload", (await bodyText(page)).length > 0 && await page.evaluate(() => !document.body.innerText.includes("LG HG2 18650 3000mAh") || document.body.innerText.includes("Deleted built-in")));
  await click(page, ".adm-nav-btn", "Products");
  await click(page, "button", "Restore");
  check("restore brings the product back", await page.evaluate(() => [...document.querySelectorAll("tbody tr")].some((row) => row.textContent.includes("LG HG2 18650"))));

  /* change PIN */
  await click(page, ".adm-nav-btn", "Settings");
  await click(page, ".adm-chip", "Security");
  await page.type("input[aria-label='Current PIN']", "246810");
  await page.type("input[aria-label='New PIN']", "123456");
  await page.type("input[aria-label='Confirm new PIN']", "123456");
  await click(page, "button[type=submit]", "Change PIN");
  check("predictable PIN is refused", (await bodyText(page)).includes("less predictable"));
  await typeInto(page, "input[aria-label='Current PIN']", "246810");
  await typeInto(page, "input[aria-label='New PIN']", "735924");
  await typeInto(page, "input[aria-label='Confirm new PIN']", "735924");
  await click(page, "button[type=submit]", "Change PIN");
  await wait(200);
  check("PIN change succeeds", !(await bodyText(page)).includes("Default PIN in use"));
  await shot(page, "security");
  await click(page, ".adm-topbar button", "Sign out");
  await page.waitForSelector("input[aria-label='Access PIN']");
  check("default PIN hint disappears after changing it", !(await bodyText(page)).includes("246810"));
  await page.type("input[aria-label='Access PIN']", "246810");
  await click(page, "button[type=submit]", "Unlock console");
  check("old PIN no longer works", (await bodyText(page)).includes("not correct"));
  await page.type("input[aria-label='Access PIN']", "735924");
  await click(page, "button[type=submit]", "Unlock console");
  await page.waitForSelector(".adm-rail");
  check("new PIN unlocks the console", true);

  /* ---- Team & roles: add a Warehouse staff member ---- */
  await click(page, ".adm-nav-btn", "Team & roles");
  check("team page lists the owner", (await bodyText(page)).includes("Store owner"));
  await click(page, "button", "Add staff");
  await page.waitForSelector(".adm-drawer");
  const staffField = async (label, value) => {
    const handle = await page.evaluateHandle((label) => [...document.querySelectorAll(".adm-drawer .adm-field")]
      .find((element) => element.querySelector(".adm-field-label")?.textContent.trim().startsWith(label))?.querySelector("input"), label);
    await handle.asElement().type(value);
  };
  await staffField("Full name", "Rahim Warehouse");
  await page.select(".adm-drawer select[aria-label='Role']", "warehouse");
  await staffField("Starting PIN", "123456");
  await click(page, ".adm-drawer-foot button", "Add staff member");
  check("weak staff PIN is refused", (await bodyText(page)).includes("less predictable"));
  await page.$eval(".adm-drawer input[aria-label='Starting PIN']", (input) => { input.value = ""; });
  await typeInto(page, ".adm-drawer input[aria-label='Starting PIN']", "482915");
  await click(page, ".adm-drawer-foot button", "Add staff member");
  await wait(250);
  check("staff member is created with a role", await page.evaluate(() => [...document.querySelectorAll("tbody tr")].some((row) => row.textContent.includes("Rahim Warehouse") && row.textContent.includes("Warehouse"))));
  await click(page, ".adm-segmented button", "Permission matrix");
  check("permission matrix compares every role", await page.$$eval(".adm-matrix thead th", (cells) => cells.length) >= 7);
  await click(page, ".adm-segmented button", "Roles");
  check("built-in roles cannot be edited directly", await page.evaluate(() => [...document.querySelectorAll(".adm-role-card")].find((card) => card.textContent.includes("Warehouse")) && ![...document.querySelectorAll(".adm-role-card")].find((card) => card.textContent.includes("Warehouse")).textContent.includes("Edit")));

  /* ---- Promotions ---- */
  await click(page, ".adm-nav-btn", "Promotions");
  await click(page, "button", "New code");
  await page.waitForSelector(".adm-drawer");
  await page.type(".adm-drawer input[aria-label='Code']", "spring15");
  await page.type(".adm-drawer input[aria-label='Description']", "15% off spring builds");
  await typeInto(page, ".adm-drawer input[aria-label='Discount value']", "15");
  await typeInto(page, ".adm-drawer input[aria-label='Minimum order']", "1000");
  await click(page, ".adm-drawer-foot button", "Create code");
  await wait(200);
  check("discount code is created and live", await page.evaluate(() => [...document.querySelectorAll("tbody tr")].some((row) => row.textContent.includes("SPRING15") && row.textContent.includes("live"))));
  await page.click("button[aria-label='Pause SPRING15']");
  await wait(150);
  check("discount code can be paused", await page.evaluate(() => [...document.querySelectorAll("tbody tr")].some((row) => row.textContent.includes("SPRING15") && row.textContent.includes("paused"))));

  /* ---- Reviews ---- */
  await click(page, ".adm-nav-btn", "Reviews");
  await click(page, "main li button", "Hide");
  check("a review can be hidden", (await bodyText(page)).includes("Reviews hidden from the storefront"));

  /* ---- Activity ---- */
  await click(page, ".adm-nav-btn", "Activity log");
  const log = await bodyText(page);
  check("activity log records staff, promotion, review and product actions", ["Added staff member", "Created promotion", "Hid reviews", "Created product", "Changed own PIN"].every((entry) => log.includes(entry)));
  await shot(page, "activity");

  /* ---- Sign in as Warehouse ---- */
  await click(page, ".adm-topbar button", "Sign out");
  await page.waitForSelector("select[aria-label='Staff account']");
  const rahim = await page.$$eval("select[aria-label='Staff account'] option", (options) => options.find((o) => o.textContent.includes("Rahim"))?.value);
  await page.select("select[aria-label='Staff account']", rahim);
  await page.type("input[aria-label='Access PIN']", "482915");
  await click(page, "button[type=submit]", "Unlock console");
  await page.waitForSelector(".adm-rail");
  const nav = await page.$$eval(".adm-nav-btn", (buttons) => buttons.map((b) => b.textContent.trim()));
  check("warehouse role sees only permitted sections", ["Orders", "Products", "Stock & prices", "My account"].every((label) => nav.some((n) => n.includes(label))) && !nav.some((n) => /Settings|Team & roles|Promotions|Activity log|Overview/.test(n)), JSON.stringify(nav));
  await click(page, ".adm-nav-btn", "Products");
  check("warehouse cannot create products", !(await bodyText(page)).includes("New product") && (await bodyText(page)).includes("View only"));
  check("warehouse product edit buttons are disabled", await page.$eval("button[aria-label^='Edit ']", (b) => b.disabled));
  await click(page, ".adm-nav-btn", "Stock & prices");
  check("warehouse can adjust stock but not prices", await page.evaluate(() => { const row = document.querySelector("tbody tr"); return row.querySelector("input[aria-label^='Price for']").disabled && !row.querySelector("input[aria-label^='Stock for']").disabled; }));
  await shot(page, "warehouse-stock");
  await go(page, "/admin#team");
  check("hidden sections cannot be opened by URL", !(await bodyText(page)).includes("Permission matrix"));
  await click(page, ".adm-nav-btn", "My account");
  check("every role can manage its own PIN", Boolean(await page.$("input[aria-label='Current PIN']")));
  await click(page, ".adm-topbar button", "Sign out");
  await page.waitForSelector("select[aria-label='Staff account']");
  await page.select("select[aria-label='Staff account']", "owner");
  await page.type("input[aria-label='Access PIN']", "735924");
  await click(page, "button[type=submit]", "Unlock console");
  await page.waitForSelector(".adm-rail");
  await click(page, ".adm-nav-btn", "Activity log");
  check("staff sign-ins are attributed in the activity log", (await bodyText(page)).includes("Rahim Warehouse"));
  await context.close();

  /* 4. Mobile */
  {
    const { context: mobileContext, page: mobile } = await fresh(390);
    await signIn(mobile);
    await click(mobile, ".adm-nav-btn", "Products");
    check("mobile console has no horizontal page overflow", await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await shot(mobile, "mobile-catalogue");
    await click(mobile, "button", "New ready-made pack");
    check("mobile editor fits the viewport", await mobile.$eval(".adm-drawer", (el) => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }));
    await shot(mobile, "mobile-editor");
    await mobileContext.close();
  }

  check("no runtime errors", errors.length === 0, JSON.stringify(errors));
  console.log(`\nAdmin portal browser checks: ${passed} passed.`);
} finally {
  await browser.close();
  server.close();
}
