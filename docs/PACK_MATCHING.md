# Pack Availability Matching

The builder checks catalogue stock and the complete bill of materials, subtracts
parts already in the shopper's bag, and offers distinct alternatives rather than
three slightly different versions of the same build. Quantities held in the bag
are a local planning allowance, not a stock reservation. The order endpoint still
checks prices, stock, and pack configuration before accepting an order.

## Matching Rules

- Automatic custom replacements keep the same series count and chemistry.
- Every required component and retained optional add-on must be in stock for the
  requested number of packs. The line being edited is excluded from bag usage.
- A replacement must pass the continuous-current model and allow at least 20%
  BMS current headroom. The output estimate is capped by the cells, BMS and nickel
  interconnects. Watt-mode checks include current near discharge cutoff.
- Closest fit, lower price, and target runtime are separate ranking objectives.
  A budget filters candidates; it never relaxes electrical checks.
- Smaller-capacity and below-target options are explicitly labelled. Removed
  add-ons must be acknowledged before applying a change. Undo restores the
  previous configuration and target without modifying the bag.
- Applying or adding a build refreshes the catalogue when a live backend is
  connected. A changed quote or insufficient stock requires a new review.

## Ready-Made Catalogue Entries

Use the existing product editor's specifications list; no new database fields or
SKU-specific code are required. Add a physical, in-stock product to the
`battery-packs` category. The stock quantity must represent complete packs, not
future assembly slots. Products marked built-to-order, preorder, or service
deposits are excluded even if their stock value is positive.

For example, a product could publish these fields **only if its actual ratings
and test reports support them**:

| Specification | Example |
| --- | --- |
| Chemistry | Li-ion (NMC) |
| Configuration | 3S2P |
| Capacity | 6Ah (or 6000mAh) |
| Nominal voltage | 10.8V |
| Charge voltage | 12.6V |
| Cutoff voltage | 9V |
| Continuous discharge current | 20A |
| BMS | 20A with balance |
| Output connector | XT60 |
| Energy | 64.8Wh |

Chemistry, series, capacity, continuous discharge and built-in protection are
required for a complete match. A BMS rating or a burst/peak rating alone does not
prove the pack's continuous output. Missing or conflicting information places
the item in **Workshop check needed**, never in the complete-match list. Regulated
outputs require a separate device-level check. Unknown chemistry is not inferred
from a brand name in the product title.

Some legacy products have voltage only in their configuration text. In this case
standard chemistry profiles supply estimated voltage limits, disclosed in the
comparison. Explicit voltage, capacity, energy, and cell-model conflicts are
flagged for review rather than silently reconciled.

Ready-pack runtime uses 75% of nominal energy, plus DC/AC conversion assumptions.
Custom runtime uses the existing cell and pack model. Neither is a guaranteed
bench measurement. The workshop must confirm the device's full voltage range,
charger, connector, polarity, temperature and enclosure before assembly or use.

## Verification

Run `node scripts/pack-availability-regression.mjs` for matching, stock, budget,
catalogue data and safety scenarios. Run `node scripts/pack-regression.mjs` for
the original pack engine checks. `npm run build` produces the preview artifact.
With Puppeteer installed, `node scripts/pack-matching-e2e.mjs` checks comparisons,
confirmation, Undo, mobile layouts, and simulated stock/price changes during
confirmation. Set `PACK_SCREENSHOTS=qa/pack-matching` to save screenshots.