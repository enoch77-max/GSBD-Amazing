// Run with: node scripts/pack-regression.mjs
// Bundles the shared TypeScript engine, then exercises the same functions used
// by the storefront, admin preview, order pricing and cart editor.
import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";

const source = `
export * from "./src/lib/pack-builder";
export * from "./src/lib/pack-planning";
export * from "./src/lib/pack-recommendations";
export { buildProductSeeds } from "./src/db/seed-data";
`;
const bundle = await build({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "pack-regression-entry.ts", loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
  alias: { "@": path.resolve("src") },
});
const engine = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const {
  buildProductSeeds, calculatePack, DEFAULT_PACK_RECOMMENDATIONS, optimizePack,
  PACK_OPTIONAL_EXTRAS, rankPackAddOns, simulateLoad, sizeParallel,
} = engine;
const products = buildProductSeeds().map((product, index) => ({ ...product, id: index + 1, images: product.images ?? [], stock: product.stock ?? 0 }));
let assertions = 0;
const check = (fn) => { fn(); assertions += 1; };
const base = { cellId: "18650", series: 4, parallel: 2, loadCurrentA: 10 };
const quoted = calculatePack(base, { products });
check(() => assert.equal(quoted.available, true));
check(() => assert.ok(quoted.components.find((part) => part.key === "technician")?.total >= 700));
check(() => assert.equal(quoted.price, quoted.components.reduce((sum, part) => sum + part.total, 0)));

// Reproduces the reported crash: editing a bagged pack from the cart and
// choosing a runtime target used to pass the bag into each trial configuration.
for (const cellId of ["18650", "21700", "lifepo4-32700"]) {
  for (const series of [3, 4, 8, 12]) {
    for (const parallel of [1, 2, 3, 4, 6, 8]) {
      const config = { cellId, series, parallel, loadCurrentA: 10, extras: ["lipo-safe-fireproof-bag"] };
      if (series * parallel > 120 || !PACK_OPTIONAL_EXTRAS.find((e) => e.code === "bag").fits(config)) continue;
      const result = calculatePack(config, { products });
      check(() => assert.ok(Number.isFinite(result.price)));
      for (const hours of [2, 4, 8, 12]) {
        const sized = sizeParallel(config, { mode: "A", amps: 10 }, hours, products);
        check(() => assert.ok(Number.isInteger(sized.parallel)));
        if (sized.reachable) {
          const candidate = calculatePack({ ...config, parallel: sized.parallel, extras: [] }, { products });
          check(() => assert.equal(candidate.available, true));
          check(() => assert.ok(simulateLoad(candidate, { mode: "A", amps: 10 }).runtimeH >= hours));
        }
      }
      check(() => assert.ok(Array.isArray(optimizePack(config, { mode: "A", amps: 10 }, 4, products))));
    }
  }
}

const balancer = "5a-active-balancer";
const recommended = [...rankPackAddOns(quoted, products, DEFAULT_PACK_RECOMMENDATIONS).values()];
check(() => assert.equal(recommended.find((item) => item.recommended)?.product.slug, balancer));
check(() => assert.equal([...rankPackAddOns(quoted, products, { ...DEFAULT_PACK_RECOMMENDATIONS, enabled: false }).values()].some((item) => item.recommended), false));
const noBalancer = products.map((product) => product.slug === balancer ? { ...product, stock: 0 } : product);
check(() => assert.equal(rankPackAddOns(calculatePack(base, { products: noBalancer }), noBalancer, DEFAULT_PACK_RECOMMENDATIONS).has(balancer), false));
const noCells = products.map((product) => product.slug === "samsung-inr18650-30q" ? { ...product, stock: 0 } : product);
const unavailable = calculatePack(base, { products: noCells });
check(() => assert.equal(unavailable.available, false));
check(() => assert.equal(rankPackAddOns(unavailable, noCells, DEFAULT_PACK_RECOMMENDATIONS).size, 0));
const withBag = calculatePack({ ...base, extras: ["lipo-safe-fireproof-bag"] }, { products });
check(() => assert.equal(withBag.price, quoted.price + products.find((product) => product.slug === "lipo-safe-fireproof-bag").price));
check(() => assert.notEqual(withBag.slug, quoted.slug));
const zeroBag = products.map((product) => product.slug === "lipo-safe-fireproof-bag" ? { ...product, stock: 0 } : product);
check(() => assert.equal(calculatePack({ ...base, extras: ["lipo-safe-fireproof-bag"] }, { products: zeroBag }).available, false));
check(() => assert.equal(calculatePack(base, { products: zeroBag }).available, true));
console.log(`Pack regression: ${assertions} assertions passed.`);
