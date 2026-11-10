/**
 * Measures vertical seams in the hero carousel during a slide transition.
 * For each captured frame, every pixel column gets a score: the median (over rows)
 * of the luminance jump to its left neighbour. A seam spans the full height, so it
 * shows up as a spike; text and photo detail only touch some rows and stay low.
 *
 * Usage: node scripts/carousel-seam.mjs <label>
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const label = process.argv[2] ?? "run";
const DIST = path.resolve("dist");
const OUT = `/tmp/seam-${label}`;
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200);
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4174, r));

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
await page.goto("http://localhost:4174/", { waitUntil: "networkidle2" });
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 800));

const panel = await page.$(".offer-carousel");
const box = await panel.boundingBox();

async function score(buffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const lum = (x, y) => {
      const i = (y * width + x) * 4;
      return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    };
    // Skip rounded corners/borders and the bottom controls pill.
    const y0 = Math.round(height * 0.08);
    const y1 = Math.round(height * 0.68);
    const x0 = 12;
    const x1 = width - 12;
    let best = { x: 0, v: 0 };
    let band = 0;
    const b0 = Math.round(width * 0.38);
    const b1 = Math.round(width * 0.62);
    for (let x = x0; x < x1; x += 1) {
      const diffs = [];
      for (let y = y0; y < y1; y += 2) diffs.push(Math.abs(lum(x, y) - lum(x - 1, y)));
      diffs.sort((a, b) => a - b);
      const median = diffs[Math.floor(diffs.length / 2)];
      if (median > best.v) best = { x, v: median };
      if (x >= b0 && x <= b1 && median > band) band = median;
    }
    return { x: best.x, pct: Math.round((best.x / width) * 100), v: Math.round(best.v * 100) / 100, band: Math.round(band * 100) / 100 };
  }, buffer.toString("base64"));
}

const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
const rows = [];

// Rest frame before any transition.
let shot = await page.screenshot({ clip });
rows.push({ t: "rest", ...(await score(shot)) });
fs.writeFileSync(`${OUT}/rest.png`, shot);

for (let transition = 0; transition < 3; transition += 1) {
  await page.click("button[aria-label='Next offer']");
  const start = Date.now();
  for (let i = 0; i < 8; i += 1) {
    shot = await page.screenshot({ clip });
    const t = Date.now() - start;
    rows.push({ t: `T${transition + 1}+${t}ms`, ...(await score(shot)) });
    if (transition === 0) fs.writeFileSync(`${OUT}/t1-${String(i).padStart(2, "0")}.png`, shot);
  }
  await new Promise((r) => setTimeout(r, 1200));
}

// Rapid dot clicks: interrupting fades mid-flight.
const dots = await page.$$(".offer-dot");
for (const index of [2, 4, 1]) {
  await dots[index].click();
  await new Promise((r) => setTimeout(r, 140));
  shot = await page.screenshot({ clip });
  rows.push({ t: `rapid→${index}`, ...(await score(shot)) });
}

const transitionRows = rows.filter((r) => r.t !== "rest");
const worst = transitionRows.reduce((a, b) => (b.v > a.v ? b : a));
console.log(`\n=== ${label} ===`);
rows.forEach((r) => console.log(`${r.t.padEnd(16)} centre-band seam ${String(r.band).padStart(6)}   (global max ${r.v} at ${r.pct}%)`));
const bandWorst = transitionRows.reduce((a, b) => (b.band > a.band ? b : a));
const settled = rows.filter((r) => /\+(1[6-9]|2\d)\d\dms$/.test(r.t));
const settledBand = settled.length ? Math.max(...settled.map((r) => r.band)) : 0;
console.log(`CENTRE BAND worst during transitions: ${bandWorst.band} (${bandWorst.t}) · worst once settled: ${settledBand}`);

await browser.close();
server.close();
