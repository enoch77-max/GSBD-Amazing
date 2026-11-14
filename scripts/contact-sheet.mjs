/** Compose audit screenshots into labelled contact sheets: node scripts/contact-sheet.mjs <dir> <out> name1 name2 … */
import { writeFileSync, existsSync } from "node:fs";
import puppeteer from "puppeteer";
const [dir, out, ...names] = process.argv.slice(2);
const files = names.filter((name) => existsSync(`${dir}/${name}.png`));
const cells = files.map((name) => `<figure><img src="file://${dir}/${name}.png"><figcaption>${name}</figcaption></figure>`).join("");
const mobile = files.every((name) => name.endsWith("-m"));
writeFileSync("/tmp/sheet.html", `<style>body{margin:0;background:#444;display:flex;gap:10px;padding:10px;font:12px system-ui;color:#fff}figure{margin:0}img{display:block;width:${mobile ? 390 : 720}px;border:1px solid #666}figcaption{padding:4px 2px}</style>${cells}`);
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: mobile ? files.length * 400 + 20 : files.length * 730 + 20, height: 900 });
await page.goto("file:///tmp/sheet.html");
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`sheet ${out}: ${files.join(", ")}`);
