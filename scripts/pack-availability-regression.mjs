// Catalogue-driven tests for ranking, inventory, electrical checks, and spec confidence.
import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";

const bundle = await build({
  stdin: {
    contents: `export * from "./src/lib/pack-availability"; export * from "./src/lib/ready-pack-specs"; export * from "./src/lib/pack-builder"; export { withLoad, optimizePack, equivalentSeries } from "./src/lib/pack-planning"; export { buildProductSeeds } from "./src/db/seed-data";`,
    resolveDir: process.cwd(), sourcefile: "pack-availability-entry.ts", loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent", alias: { "@": path.resolve("src") },
});
const engine = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const { buildProductSeeds, calculatePack, findPackAvailability, readReadyPackSpecs, isStockedReadyPack, inventoryForBuild, assessPackLoad, withLoad, equivalentSeries, optimizePack } = engine;
const products = buildProductSeeds().map((item, index) => ({ ...item, id: index + 1 }));
const zero = (...slugs) => products.map((item) => slugs.includes(item.slug) ? { ...item, stock: 0 } : item);
const base = { cellId: "18650", series: 3, parallel: 2, loadCurrentA: 10, extras: [] };
const load = { mode: "A", amps: 10 };
const advise = (config = base, catalog = products, demand = load, target = 4, options = {}) => findPackAvailability(calculatePack(withLoad(config, demand), { products: catalog }), demand, target, catalog, options);
const fixture = (patch = {}) => ({
  id: 101, slug: "ready-3s-6ah", name: "Workshop 3S 6Ah ready pack", brand: "Glowing Space Lab", categorySlug: "battery-packs", price: 3600, stock: 12, images: [], badge: "Ready to ship",
  shortDescription: "Assembled, tested and in stock.",
  specs: [
    { label: "Chemistry", value: "Li-ion (NMC)" }, { label: "Configuration", value: "3S2P" },
    { label: "Capacity", value: "6Ah" }, { label: "Nominal voltage", value: "10.8V" },
    { label: "Charge voltage", value: "12.6V" }, { label: "Cutoff voltage", value: "9V" },
    { label: "Continuous discharge current", value: "20A" }, { label: "BMS", value: "20A with balance" },
    { label: "Connector", value: "XT60" },
  ], ...patch,
});
const changeSpec = (product, label, value) => ({ ...product, specs: [...product.specs.filter((s) => s.label !== label), { label, value }] });
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };

const noCells = zero("samsung-inr18650-30q");
const missing = advise(base, noCells);
test("healthy build does not need recovery", () => assert.equal(advise().triggered, false));
test("stock reason includes required quantity", () => assert.match(missing.unavailable.join(" "), /need 6, 0 available/));
test("same-voltage alternative is found", () => assert.equal(missing.custom[0].config.cellId, "21700"));
test("options are distinct rather than three consecutive parallel counts", () => {
  assert.ok(missing.custom.length >= 2 && missing.custom.length <= 3);
  assert.equal(new Set(missing.custom.map((item) => item.result.slug)).size, missing.custom.length);
  assert.ok(missing.custom.some((item) => item.meetsTarget));
});
test("all custom suggestions pass stock, current and chemistry checks", () => {
  for (const option of missing.custom) {
    assert.ok(option.result.available && assessPackLoad(option.result, load).safe);
    assert.equal(option.config.series, base.series);
    assert.equal(option.result.bms.chemistry, "li-ion");
    assert.equal(option.result.chargeVoltage, 12.6);
    assert.ok(option.score >= 0 && option.score <= 100);
  }
});
test("runtime priority ranks the cheapest target-meeting build first", () => {
  const ranked = advise(base, noCells, load, 4, { priority: "runtime" });
  assert.ok(ranked.custom[0].meetsTarget);
  assert.ok(ranked.custom[0].runtimeH >= 4);
  assert.notEqual(ranked.custom[0].result.slug, missing.custom[0].result.slug);
});
test("lower-price priority preserves capacity when possible", () => {
  const ranked = advise(base, noCells, load, 4, { priority: "price" });
  assert.ok(ranked.custom[0].meetsCapacity);
  assert.equal(ranked.custom[0].label, "Lower price");
});
test("strict budget never silently leaks expensive options", () => {
  const ranked = advise(base, noCells, load, 4, { maxBudget: 1000 });
  assert.equal(ranked.custom.length, 0); assert.equal(ranked.ready.length, 0);
  assert.ok(ranked.counts.overBudget > 0);
});
test("budget can admit the closest match while hiding oversized upgrades", () => {
  const budget = missing.custom[0].result.price;
  const ranked = advise(base, noCells, load, 4, { maxBudget: budget });
  assert.ok(ranked.custom.length > 0 && ranked.custom.every((o) => o.result.price <= budget));
});
test("invalid budget is ignored, not treated as free inventory", () => assert.equal(advise(base, noCells, load, 4, { maxBudget: NaN }).maxBudget, null));
test("score ranking is deterministic when input catalogue order changes", () => {
  const reversed = advise(base, [...noCells].reverse());
  assert.deepEqual(reversed.custom.map((o) => o.result.slug), missing.custom.map((o) => o.result.slug));
});
test("available extras are retained and unavailable extras are named", () => {
  const selected = { ...base, extras: ["5a-active-balancer", "lipo-safe-fireproof-bag"] };
  const advice = advise(selected, zero("5a-active-balancer"));
  const same = advice.custom.find((o) => o.config.cellId === base.cellId && o.config.parallel === base.parallel);
  assert.ok(same); assert.deepEqual(same.config.extras, ["lipo-safe-fireproof-bag"]);
  assert.match(same.removedExtras.join(" "), /balancer/i);
});
test("stock for the full build quantity is required", () => {
  const scarce = products.map((p) => p.slug === "samsung-inr18650-30q" ? { ...p, stock: 8 } : p);
  const advice = advise(base, scarce, load, 4, { quantity: 2 });
  assert.ok(advice.triggered); assert.match(advice.unavailable.join(" "), /need 12, 8 available/);
  assert.ok(advice.custom.every((o) => o.result.maxPacks >= 2));
});
test("loose products in bag reduce stock without mutating catalogue", () => {
  const original = products.find((p) => p.slug === "samsung-inr18650-30q").stock;
  const adjusted = inventoryForBuild(products, [{ slug: "samsung-inr18650-30q", qty: 235 }]);
  assert.equal(adjusted.find((p) => p.slug === "samsung-inr18650-30q").stock, 5);
  assert.equal(products.find((p) => p.slug === "samsung-inr18650-30q").stock, original);
  assert.ok(advise(base, adjusted).triggered);
});
test("bagged custom packs reserve every BOM component locally", () => {
  const built = calculatePack(base, { products });
  const adjusted = inventoryForBuild(products, [{ slug: built.slug, qty: 2, customPack: base }]);
  for (const part of built.components.filter((p) => p.slug)) {
    assert.equal(adjusted.find((p) => p.slug === part.slug).stock, Math.max(0, products.find((p) => p.slug === part.slug).stock - part.qty * 2));
  }
  assert.deepEqual(inventoryForBuild(products, [{ slug: built.slug, qty: 2, customPack: base }], built.slug), products);
});
test("hidden stock is not eligible", () => {
  const hidden = products.map((p) => p.slug === "molicel-p42a-21700" ? { ...p, visible: false } : p);
  const adjusted = inventoryForBuild(hidden, []);
  assert.equal(adjusted.find((p) => p.slug === "molicel-p42a-21700").stock, 0);
});
test("matcher refreshes a stale quote against current stock", () => {
  const previous = calculatePack(base, { products });
  const fresh = findPackAvailability(previous, load, 4, noCells);
  assert.ok(fresh.triggered && fresh.custom.length > 0);
});
test("hidden components are rejected without relying on caller filtering", () => {
  const hidden = products.map((p) => p.slug === "samsung-inr18650-30q" ? { ...p, visible: false } : p);
  assert.ok(advise(base, hidden).triggered);
  assert.ok(advise(base, hidden).custom.every((o) => o.config.cellId !== "18650"));
});
test("missing BMS cannot be solved by changing series voltage", () => {
  const advice = advise(base, zero("3s-20a-bms-balance"));
  assert.equal(advice.custom.length, 0);
});
test("missing interconnect material cannot produce a buildable quote", () => assert.equal(advise(base, zero("pure-nickel-strip-015-8mm")).custom.length, 0));
test("price delta is withheld when the original quote is incomplete", () => {
  const stock = [...zero("3s-20a-bms-balance"), fixture()];
  const result = advise(base, stock);
  assert.ok(result.ready.length); // The old zero-price BMS is still known, but the missing board is not a complete build quote.
  const missingBoard = advise(base, stock.filter((p) => p.slug !== "3s-20a-bms-balance"));
  assert.equal(missingBoard.ready[0].priceDelta, null);
});
test("BMS margin uses real watts near cutoff instead of just nominal/clamped amps", () => {
  const watts = { mode: "W", watts: 200 };
  const pack = calculatePack(withLoad({ ...base, parallel: 8 }, watts), { products });
  assert.equal(assessPackLoad(pack, watts).safe, false);
  assert.ok(assessPackLoad(pack, watts).requiredA > pack.config.loadCurrentA);
});
test("continuous output is limited by nickel interconnects too", () => {
  const pack = calculatePack({cellId:"21700",series:4,parallel:1,loadCurrentA:20}, { products });
  assert.ok(pack.physics.continuousA <= pack.physics.nickelLayers * 4.5 * pack.config.parallel);
  assert.equal(assessPackLoad(pack, {mode:"A",amps:20}).safe, false);
});
test("invalid loads cannot generate recommendations", () => {
  const quote = calculatePack(base, { products: noCells });
  for (const demand of [{ mode: "A", amps: 0 }, { mode: "A", amps: Infinity }, { mode: "W", watts: NaN }]) {
    const result = findPackAvailability(quote, demand, 4, noCells);
    assert.equal(result.custom.length, 0); assert.equal(result.ready.length, 0);
  }
});
test("same-chemistry optimizer does not change 6S into 7S", () => assert.equal(equivalentSeries("18650", 6, "21700"), 6));
test("other optimizer does not silently cross chemistry", () => assert.ok(optimizePack(base, load, 1, products).every((o) => o.config.cellId !== "lifepo4-32700")));

const goodPack = fixture();
test("new ready-made SKU is discovered without hardcoded slug", () => {
  assert.deepEqual(readReadyPackSpecs(goodPack).issues, []);
  assert.ok(advise(base, [...noCells, goodPack]).ready.some((o) => o.product.slug === goodPack.slug));
});
test("mAh is normalized correctly", () => assert.equal(readReadyPackSpecs(changeSpec(goodPack, "Capacity", "6000mAh")).capacityAh, 6));
test("case and spacing in labels are normalized", () => {
  const item = { ...goodPack, specs: goodPack.specs.map((s) => ({label:` ${s.label.toUpperCase()} `,value:s.value})) };
  assert.deepEqual(readReadyPackSpecs(item).issues, []);
});
test("malformed imported spec lists fail closed without crashing", () => {
  for (const specs of [null, {}, [null, {label:5,value:10}]]) {
    const item = fixture({ specs });
    assert.ok(readReadyPackSpecs(item).issues.length > 0);
    assert.equal(advise(base, [...noCells, item]).ready.some((o) => o.product.slug === item.slug), false);
  }
});
test("BMS amps alone do not establish complete-pack output", () => {
  const item = { ...goodPack, specs: goodPack.specs.filter((s) => s.label !== "Continuous discharge current") };
  const advice = advise(base, [...noCells, item]);
  assert.equal(advice.ready.some((o) => o.product.slug === item.slug), false);
  assert.match(advice.review.find((o) => o.product.slug === item.slug).reasons.join(" "), /continuous discharge rating is missing/i);
});
test("peak current is not promoted to continuous current", () => {
  const item = changeSpec(goodPack, "Continuous discharge current", "100A peak, 10A continuous");
  assert.equal(readReadyPackSpecs(item).continuousA, 10);
  assert.equal(advise(base, [...noCells, item]).ready.some((o) => o.product.slug === item.slug), false);
});
test("continuous-first mixed ratings are understood", () => assert.equal(readReadyPackSpecs(changeSpec(goodPack, "Continuous discharge current", "continuous: 20A; peak: 100A")).continuousA, 20));
test("peak-only and malformed ratings are unverified", () => {
  for (const text of ["100A peak", "10-50A", "-20A", "1e3A", "Unknown"]) assert.equal(readReadyPackSpecs(changeSpec(goodPack, "Continuous discharge current", text)).continuousA, null, text);
});
test("continuous rating is capped by the BMS", () => assert.equal(advise(base, [...noCells, changeSpec(goodPack, "BMS", "8A with balance")]).ready.some((o) => o.product.slug === goodPack.slug), false));
test("different full-charge voltage is not a direct replacement", () => assert.equal(advise(base, [...noCells, changeSpec(goodPack, "Charge voltage", "14.6V")]).ready.some((o) => o.product.slug === goodPack.slug), false));
test("ambiguous published voltage is not silently replaced with a guess", () => assert.match(readReadyPackSpecs(changeSpec(goodPack, "Charge voltage", "10-20V")).issues.join(" "), /charge voltage field could not be validated/));
test("different chemistry never becomes an automatic substitute", () => assert.equal(advise(base, [...noCells, changeSpec(goodPack, "Chemistry", "LiFePO4")]).ready.some((o) => o.product.slug === goodPack.slug), false));
test("mixed chemistry needs review", () => assert.equal(readReadyPackSpecs(changeSpec(goodPack, "Chemistry", "Li-ion / LiFePO4")).chemistry, null));
test("a brand in the title alone does not establish chemistry", () => {
  const item = { ...goodPack, name:"Samsung 3S pack", specs:goodPack.specs.filter((s) => s.label !== "Chemistry") };
  assert.equal(readReadyPackSpecs(item).chemistry, null);
});
test("inconsistent capacity from cell model and parallel count is flagged", () => {
  const item = changeSpec(changeSpec(goodPack, "Cells", "Samsung 30Q"), "Capacity", "12Ah");
  assert.match(readReadyPackSpecs(item).issues.join(" "), /parallel count/);
});
test("conflicting published capacities are flagged", () => assert.match(readReadyPackSpecs(changeSpec(goodPack, "Configuration", "3S2P 10.8V 9Ah")).issues.join(" "), /Capacity fields disagree/));
test("conflicting energy is flagged", () => assert.match(readReadyPackSpecs(changeSpec(goodPack, "Energy", "1.28kWh")).issues.join(" "), /Energy and capacity/));
test("regulated output requires device-level review", () => assert.match(readReadyPackSpecs(changeSpec(goodPack, "Output", "Regulated 12V 2A")).issues.join(" "), /Regulated output/));
test("bad or missing protection cannot be marked compatible", () => assert.match(readReadyPackSpecs(changeSpec(goodPack, "BMS", "Not included")).issues.join(" "), /protection/));
test("custom-order language is excluded regardless of badge", () => {
  for (const patch of [{badge:"Built to order"},{description:"A made-to-order battery."},{shortDescription:"Pre-order delivery in two weeks."},{name:"Custom build service deposit"}]) assert.equal(isStockedReadyPack(fixture(patch)), false);
});
test("out-of-stock, hidden, free, and non-finite listings are excluded", () => {
  for (const patch of [{stock:0},{visible:false},{price:NaN},{price:0},{stock:Infinity}]) assert.equal(isStockedReadyPack(fixture(patch)), false);
});
test("future pack without enough stock for quantity is excluded", () => assert.equal(advise(base, [...noCells, fixture({stock:1})],load,4,{quantity:2}).ready.length, 0));
test("ready-pack runtime is conservative and lower targets are explicit", () => {
  const option = advise(base, [...noCells, goodPack]).ready.find((o) => o.product.slug === goodPack.slug);
  assert.ok(Math.abs(option.estimatedRuntimeH - .45) < 1e-9); assert.equal(option.meetsTarget,false);
  assert.match(option.warnings.join(" "), /Below your 4h/);
});
test("watt load is evaluated at cutoff for ready-made current margin", () => {
  const result = advise(base, [...noCells, goodPack], {mode:"W",watts:160});
  assert.equal(result.ready.some((o) => o.product.slug === goodPack.slug), false);
});
test("LFP shortage uses documented prebuilt LFP rather than another chemistry", () => {
  const result = advise({cellId:"lifepo4-32700",series:4,parallel:2,loadCurrentA:10},zero("lifepo4-32700-6000"));
  assert.equal(result.custom.length,0);
  assert.equal(result.ready[0]?.product.slug,"12v-100ah-lifepo4-solar-pack");
});
test("no stock anywhere gives an honest empty state", () => {
  const result = advise(base, products.map((p) => ({...p,stock:0})));
  assert.equal(result.custom.length,0); assert.equal(result.ready.length,0); assert.equal(result.review.length,0);
});
test("availability invariants hold across chemistry, layout, load, and shortage cases", () => {
  const slugs = { "18650": "samsung-inr18650-30q", "21700": "molicel-p42a-21700", "lifepo4-32700": "lifepo4-32700-6000" };
  for (const cellId of Object.keys(slugs)) for (const series of [3, 4, 8, 13]) for (const parallel of [1, 3]) {
    for (const demand of [{mode:"A",amps:10},{mode:"W",watts:90,ac:true}]) {
      const stock = zero(slugs[cellId]);
      const advice = advise({cellId,series,parallel}, stock, demand, 2);
      for (const option of advice.custom) {
        assert.ok(option.result.available && assessPackLoad(option.result,demand).safe);
        assert.equal(option.config.series, series);
        assert.equal(option.config.cellId === "lifepo4-32700", cellId === "lifepo4-32700");
        assert.ok(option.result.components.every((part) => part.available));
      }
    }
  }
});
console.log(`\nPack availability: ${passed} scenario tests passed.`);
