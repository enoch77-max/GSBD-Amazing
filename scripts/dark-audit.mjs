/**
 * Theme contrast auditor.
 *
 *   THEME=light node scripts/dark-audit.mjs     → writes the baseline
 *   THEME=dark  node scripts/dark-audit.mjs     → audits dark, compares to baseline
 *
 * For every visible text node, input and icon in the console it computes the
 * effective background (walking ancestors, blending alpha and gradients) and
 * the WCAG contrast ratio. In dark mode it also flags large light surfaces,
 * which are the classic "forgot to theme this card" mismatch.
 *
 * Exit code 1 when dark mode has failures that light mode does not.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";

const THEME = process.env.THEME === "light" ? "light" : "dark";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const SHOTS = process.env.AUDIT_SHOTS ?? `/tmp/audit-${THEME}`;
mkdirSync(SHOTS, { recursive: true });

const html = readFileSync("dist/index.html");
const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/")) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: true })); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------------- in-page auditor ---------------- */
const auditInPage = (theme) => {
  const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
  const parse = (s) => {
    if (!s) return null;
    let m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    m = s.match(/^color\(srgb ([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s\/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
    return null;
  };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
  const csCache = new WeakMap();
  const cs = (el) => { let v = csCache.get(el); if (!v) { v = getComputedStyle(el); csCache.set(el, v); } return v; };

  const bgOf = (el) => {
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = cs(node);
      const image = style.backgroundImage;
      if (image && image !== "none" && /gradient/.test(image)) {
        const stops = [...image.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter(Boolean);
        if (stops.length) {
          const avg = stops.reduce((acc, c) => ({ r: acc.r + c.r / stops.length, g: acc.g + c.g / stops.length, b: acc.b + c.b / stops.length, a: acc.a + c.a / stops.length }), { r: 0, g: 0, b: 0, a: 0 });
          if (avg.a > 0) layers.push(avg);
        }
      }
      const color = parse(style.backgroundColor);
      if (color && color.a > 0) layers.push(color);
      if (layers.length && layers[layers.length - 1].a >= 0.99) break;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) base = blend(layers[i], base);
    return base;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(cs(n).opacity || 1); return o; };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = cs(n); if (s.display === "none" || s.visibility === "hidden") return false; }
    return opacityOf(el) > 0.05;
  };
  const sig = (el) => {
    const own = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter((c) => c && !/^(flex|grid|min-|max-|w-|h-|mt-|mb-|px-|py-|gap-|items-|justify-|text-\[|font-|truncate|block|inline|shrink|rounded|border|bg-|p-|m-)/.test(c)).slice(0, 2);
    const parent = el.parentElement && typeof el.parentElement.className === "string" ? el.parentElement.className.split(/\s+/).filter((c) => /^(ax-|adm-)/.test(c)).slice(0, 1) : [];
    return `${el.tagName.toLowerCase()}.${own.join(".") || "-"}${parent.length ? ` ‹${parent[0]}` : ""}`;
  };

  const out = [];
  const root = document.querySelector(".adm-root") ?? document.body;
  const all = [...root.querySelectorAll("*")];
  const seen = new Set();
  for (const el of all) {
    if (["SCRIPT", "STYLE", "OPTION", "TITLE", "PATH", "CIRCLE", "LINE", "RECT", "G", "DEFS", "LINEARGRADIENT", "STOP", "POLYGON", "POLYLINE"].includes(el.tagName.toUpperCase())) continue;
    const tag = el.tagName.toLowerCase();
    const isField = tag === "input" || tag === "textarea" || tag === "select";
    const hasText = !isField && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!hasText && !isField && tag !== "svg") {
      // large light surfaces (dark mode only)
      if (theme === "dark") {
        const style = cs(el);
        const own = parse(style.backgroundColor);
        const r = el.getBoundingClientRect();
        if (own && own.a > 0.9 && lum(own) > 0.55 && r.width * r.height > 1500 && visible(el) && !el.closest("svg, img, picture, .ax-thumb, .adm-avatar, .ax-switch-lg, .ax-ring, [role='progressbar'], [data-active='true'], [aria-pressed='true'], [aria-checked='true'], .adm-btn[data-variant='primary'], .ax-savebar-save")) {
          const key = `surface|${sig(el)}|${hex(own)}`;
          if (!seen.has(key)) { seen.add(key); out.push({ kind: "light-surface", sig: sig(el), text: `${Math.round(r.width)}×${Math.round(r.height)}`, fg: "—", bg: hex(own), ratio: 0, size: 0 }); }
        }
      }
      continue;
    }
    if (!visible(el)) continue;
    if (el.closest("button:disabled, [disabled], [aria-disabled='true'], fieldset:disabled")) continue;
    const style = cs(el);
    const fgRaw = tag === "svg" ? parse(style.color) : parse(style.color);
    if (!fgRaw) continue;
    const bg = bgOf(el);
    const o = opacityOf(el) * fgRaw.a;
    const fg = blend({ ...fgRaw, a: o }, bg);
    const size = parseFloat(style.fontSize) || 0;
    const bold = Number(style.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const r = ratio(fg, bg);
    const need = tag === "svg" ? 3 : large ? 3 : 4.5;
    if (tag === "svg") {
      const rect = el.getBoundingClientRect();
      if (rect.width < 11) continue;
      const sw = el.getAttribute("stroke");
      if (sw !== "currentColor" && el.getAttribute("fill") !== "currentColor" && !el.querySelector("[stroke='currentColor'], [fill='currentColor']") && sw === null) continue;
    }
    if (r < need) {
      const text = isField ? (el.value || el.getAttribute("placeholder") || "").slice(0, 28) : el.textContent.trim().replace(/\s+/g, " ").slice(0, 34);
      const key = `${tag}|${sig(el)}|${hex(fg)}|${hex(bg)}|${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: tag === "svg" ? "icon" : isField ? "field" : "text", sig: sig(el), text: tag === "svg" ? (el.getAttribute("class") ?? "icon").slice(0, 30) : text, fg: hex(fg), bg: hex(bg), ratio: Math.round(r * 100) / 100, size: Math.round(size) });
    }
    if (isField) {
      const ph = parse(getComputedStyle(el, "::placeholder").color);
      if (ph && el.getAttribute("placeholder") && !el.value) {
        const pf = blend({ ...ph, a: ph.a * opacityOf(el) }, bg);
        const pr = ratio(pf, bg);
        if (pr < 3) { const key = `ph|${sig(el)}|${hex(pf)}|${hex(bg)}`; if (!seen.has(key)) { seen.add(key); out.push({ kind: "placeholder", sig: sig(el), text: el.getAttribute("placeholder").slice(0, 28), fg: hex(pf), bg: hex(bg), ratio: Math.round(pr * 100) / 100, size: 13 }); } }
      }
    }
  }
  return out;
};

/* ---------------- targets ---------------- */
async function clickText(page, selector, text, { exact = false } = {}) {
  return page.evaluate(({ selector, text, exact }) => {
    const nodes = [...document.querySelectorAll(selector)].filter((n) => n.offsetParent !== null || getComputedStyle(n).position === "fixed");
    const hit = nodes.find((n) => (exact ? n.textContent.trim() === text : n.textContent.includes(text)));
    hit?.click();
    return Boolean(hit);
  }, { selector, text, exact });
}
const settle = () => wait(500);
const clickVisible = (page, selector) => page.evaluate((selector) => {
  const node = [...document.querySelectorAll(selector)].find((n) => n.offsetParent !== null || getComputedStyle(n).position === "fixed");
  node?.click();
  return Boolean(node);
}, selector);

const TARGETS = [
  { id: "login", login: true },
  { id: "overview", hash: "overview" },
  { id: "analytics", hash: "analytics" },
  { id: "analytics-advanced", hash: "analytics", steps: async (p) => { await clickText(p, ".ax-advanced", "Advanced"); await settle(); } },
  { id: "orders", hash: "orders" },
  { id: "order-drawer", hash: "orders", steps: async (p) => { await clickVisible(p, ".ax-order-card-body, .ax-order-id"); await p.waitForSelector(".adm-drawer", { timeout: 4000 }); await settle(); } },
  { id: "products", hash: "catalogue" },
  { id: "product-editor", hash: "catalogue", steps: async (p) => { await clickVisible(p, "[aria-haspopup='menu']"); await wait(200); await clickText(p, "[role='menuitem']", "Edit"); await p.waitForSelector(".adm-drawer", { timeout: 4000 }); await settle(); } },
  { id: "product-editor-tech", hash: "catalogue", steps: async (p) => { await clickVisible(p, "[aria-haspopup='menu']"); await wait(200); await clickText(p, "[role='menuitem']", "Edit"); await p.waitForSelector(".adm-drawer", { timeout: 4000 }); await clickText(p, ".ax-editor-tabs [role='tab']", "Tech"); await settle(); } },
  { id: "product-editor-compat", hash: "catalogue", steps: async (p) => { await clickVisible(p, "[aria-haspopup='menu']"); await wait(200); await clickText(p, "[role='menuitem']", "Edit"); await p.waitForSelector(".adm-drawer", { timeout: 4000 }); await clickText(p, ".ax-editor-tabs [role='tab']", "Compat"); await settle(); } },
  { id: "stock", hash: "inventory" },
  { id: "stock-tier", hash: "inventory", steps: async (p) => { await p.evaluate(() => document.querySelector(".ax-tier-indicator")?.click()); await settle(); } },
  { id: "stock-pending", hash: "inventory", steps: async (p) => { await p.evaluate(() => document.querySelector(".ax-stepper button[aria-label^='Increase']")?.click()); await settle(); } },
  { id: "customers", hash: "customers" },
  { id: "customer-drawer", hash: "customers", steps: async (p) => { await clickVisible(p, ".ax-customer-card, .adm-table tbody button"); await p.waitForSelector(".adm-drawer", { timeout: 4000 }); await settle(); } },
  { id: "reviews", hash: "reviews" },
  { id: "reviews-reply", hash: "reviews", steps: async (p) => { await clickVisible(p, ".ax-review [aria-haspopup='menu']"); await wait(200); await clickText(p, "[role='menuitem']", "Reply"); await settle(); } },
  { id: "packai-rules", hash: "pack-ai" },
  { id: "packai-addons", hash: "pack-ai", steps: async (p) => { await clickText(p, ".ax-ai-tabs [role='tab']", "Add-ons"); await settle(); } },
  { id: "packai-sim", hash: "pack-ai", steps: async (p) => { await clickText(p, ".ax-ai-tabs [role='tab']", "Simulator"); await settle(); } },
  { id: "promotions", hash: "promotions" },
  { id: "promo-editor", hash: "promotions", steps: async (p) => { await clickText(p, "button", "New offer"); await p.waitForSelector(".adm-drawer", { timeout: 4000 }); await settle(); } },
  { id: "growth", hash: "growth" },
  { id: "growth-panels", hash: "growth", steps: async (p) => { await clickText(p, ".ax-channel-more-row button", "Pixel"); await settle(); } },
  { id: "settings-store", hash: "settings", steps: async (p) => { await p.evaluate(() => document.querySelectorAll(".ax-set-card-head").forEach((h) => { if (h.getAttribute("aria-expanded") !== "true") h.click(); })); await settle(); } },
  { id: "settings-team", hash: "team" },
  { id: "settings-permissions", hash: "team", steps: async (p) => { await clickText(p, ".ax-member button", "Permissions"); await p.waitForSelector(".adm-drawer", { timeout: 4000 }); await settle(); } },
  { id: "settings-activity", hash: "activity" },
  { id: "account-drawer", hash: "overview", steps: async (p) => { await p.evaluate(() => document.querySelector("[aria-label='Open my account']")?.click()); await p.waitForSelector(".adm-drawer", { timeout: 4000 }); await settle(); } },
  { id: "palette", hash: "overview", steps: async (p) => { await p.keyboard.down("Control"); await p.keyboard.press("k"); await p.keyboard.up("Control"); await p.waitForSelector(".ax-cmd", { timeout: 4000 }); await p.keyboard.type("GSBD"); await settle(); } },
  { id: "nav-sheet", hash: "overview", mobileOnly: true, steps: async (p) => { await p.evaluate(() => document.querySelector(".ax-bottombar [aria-haspopup='dialog']")?.click()); await p.waitForSelector(".ax-sheet", { timeout: 4000 }); await settle(); } },
];
const VIEWPORTS = [
  { id: "m", width: 390, height: 844, isMobile: true, hasTouch: true },
  { id: "d", width: 1280, height: 900, isMobile: false, hasTouch: false },
];

/* ---------------- run ---------------- */
const baselinePath = "/tmp/audit-light.json";
const baseline = THEME === "dark" && existsSync(baselinePath) ? new Map(Object.entries(JSON.parse(readFileSync(baselinePath, "utf8")))) : new Map();
const record = {};
const groups = new Map();
let total = 0;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.evaluateOnNewDocument((theme) => {
      if (localStorage.getItem("gsbd.ops.v1") === null) localStorage.setItem("gsbd.ops.v1", JSON.stringify({ consent: "denied", account: { theme } }));
    }, THEME);

    for (const target of TARGETS) {
      if (target.mobileOnly && !viewport.isMobile) continue;
      if (ONLY && !ONLY.includes(target.id)) continue;
      const name = `${target.id}-${viewport.id}`;
      try {
        if (target.login) {
          const context = await browser.createBrowserContext();
          const fresh = await context.newPage();
          await fresh.setViewport({ width: viewport.width, height: viewport.height, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch });
          await fresh.evaluateOnNewDocument((theme) => { localStorage.setItem("gsbd.ops.v1", JSON.stringify({ consent: "denied", account: { theme } })); }, THEME);
          await fresh.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
          await fresh.waitForSelector("#admin-pin");
          await wait(400);
          const loginRows = await fresh.evaluate(auditInPage, THEME);
          await fresh.screenshot({ path: path.join(SHOTS, `${name}.png`) });
          record[name] = loginRows;
          console.log(`${name.padEnd(30)} ${String(loginRows.length).padStart(3)} issues  [theme:${await fresh.evaluate(() => document.documentElement.dataset.admTheme ?? "unset")}]`);
          for (const row of loginRows) {
            const key = `${row.kind}|${row.sig}|${row.fg}|${row.bg}`;
            const entry = groups.get(key) ?? { ...row, count: 0, targets: new Set(), light: undefined };
            entry.count += 1; entry.targets.add(name); entry.ratio = Math.min(entry.ratio, row.ratio);
            const lr = baseline.get(`${name}|${row.kind}|${row.sig}|${row.text}`);
            if (lr !== undefined) entry.light = entry.light === undefined ? lr : Math.min(entry.light, lr);
            groups.set(key, entry);
          }
          await context.close();
          continue;
        } else {
          if (!page.url().includes("/admin")) {
            await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
          }
          const needsLogin = await page.$("#admin-pin");
          await page.goto(`${base}/admin#${target.hash}`, { waitUntil: "domcontentloaded" });
          await page.reload({ waitUntil: "domcontentloaded" });
          await wait(300);
          if (await page.$("#admin-pin") || needsLogin) {
            if (await page.$("#admin-pin")) {
              await page.type("#admin-pin", "246810");
              await page.click("button[type='submit']");
              await page.waitForSelector(".ax-shell, .ax-bottombar", { timeout: 6000 });
            }
          }
          await page.waitForSelector(".ax-shell", { timeout: 6000 });
          await wait(450);
          if (target.steps) await target.steps(page);
        }
        const applied = await page.evaluate(() => document.documentElement.dataset.admTheme ?? "unset");
        const rows = await page.evaluate(auditInPage, THEME);
        await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
        record[name] = rows;
        const failing = rows.filter((row) => {
          if (THEME !== "dark") return true;
          const base = baseline.get(`${name}|${row.kind}|${row.sig}|${row.text}`);
          return base === undefined || base < 4.5 === false || row.kind === "light-surface";
        });
        total += failing.length;
        const label = `${name.padEnd(30)} ${String(rows.length).padStart(3)} issues  [theme:${applied}]`;
        console.log(label);
        for (const row of rows) {
          const key = `${row.kind}|${row.sig}|${row.fg}|${row.bg}`;
          const entry = groups.get(key) ?? { ...row, count: 0, targets: new Set(), light: undefined };
          entry.count += 1;
          entry.targets.add(name);
          entry.ratio = Math.min(entry.ratio, row.ratio);
          const lightRatio = baseline.get(`${name}|${row.kind}|${row.sig}|${row.text}`);
          if (lightRatio !== undefined) entry.light = entry.light === undefined ? lightRatio : Math.min(entry.light, lightRatio);
          groups.set(key, entry);
        }
      } catch (error) {
        console.log(`${name.padEnd(30)} ERROR ${String(error).split("\n")[0].slice(0, 90)}`);
        try { await page.screenshot({ path: path.join(SHOTS, `ERR-${name}.png`) }); } catch { /* ignore */ }
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (THEME === "light") {
  const flat = {};
  for (const [name, rows] of Object.entries(record)) for (const row of rows) flat[`${name}|${row.kind}|${row.sig}|${row.text}`] = row.ratio;
  writeFileSync(baselinePath, JSON.stringify(flat));
  console.log(`\nLight baseline written (${Object.keys(flat).length} known low-contrast items).`);
} else {
  const list = [...groups.values()].sort((a, b) => (a.kind === "light-surface" ? -1 : 0) - (b.kind === "light-surface" ? -1 : 0) || a.ratio - b.ratio);
  const regress = list.filter((g) => g.light === undefined || g.light >= 4.5 || g.kind === "light-surface");
  writeFileSync("/tmp/dark-audit.json", JSON.stringify(list.map((g) => ({ ...g, targets: [...g.targets] })), null, 2));
  console.log(`\n${list.length} distinct dark issues (${regress.length} not present in light mode):\n`);
  for (const g of regress.slice(0, Number(process.env.TOP ?? 70))) {
    console.log(`${g.kind.padEnd(13)} ${String(g.ratio).padStart(5)}  ${g.fg}/${g.bg}  ×${String(g.count).padEnd(3)} ${g.sig.padEnd(34)} “${g.text}”  ${[...g.targets].slice(0, 2).join(",")}`);
  }
  process.exitCode = regress.length ? 1 : 0;
}
