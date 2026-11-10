// Short display labels; original product names, specifications and order records stay intact.
const names: Record<string, string> = {
  "samsung-inr18650-30q": "Samsung 30Q 18650 · 3000mAh",
  "molicel-p42a-21700": "Molicel P42A 21700 · 4200mAh",
  "lg-hg2-18650": "LG HG2 18650 · 3000mAh",
  "eve-lf280k-lifepo4": "EVE LF280K LiFePO4 · 280Ah",
  "lifepo4-32700-6000": "LiFePO4 32700 · 6000mAh",
  "panasonic-ncr18650b": "Panasonic 18650 · 3400mAh",
  "12v-100ah-lifepo4-solar-pack": "12V 100Ah LiFePO4 pack",
  "48v-20ah-ebike-pack": "48V 20Ah e-bike pack",
  "12v-6ah-3s4p-pack": "12V 6Ah pack + BMS",
  "12v-9ah-ups-replacement-pack": "12V 9Ah UPS battery pack",
  "24v-10ah-router-pack": "24V 10Ah router pack",
  "custom-battery-pack-service": "Custom battery pack service",
  "daly-smart-bms-4s-40a": "Daly smart BMS · 4S 40A",
  "jk-smart-bms-24s-200a": "JK smart BMS · 24S 200A",
  "3s-20a-bms-balance": "3S 20A BMS + balance",
  "5a-active-balancer": "5A active balancer · 1–24S",
  "tp4056-type-c-charger-module": "TP4056 Type-C charger · 1A",
  "dc-dc-60v-12v-10a": "60V to 12V converter · 10A",
  "mini-ups-router-8800mah": "Router mini UPS · 8800mAh",
  "1200va-line-interactive-ups": "1200VA UPS · LiFePO4",
  "pure-sine-inverter-1kva-24v": "24V 1kVA sine-wave inverter",
  "30a-mppt-solar-charge-controller": "EPEver MPPT controller · 30A",
  "65w-gan-charger-3-port": "65W GaN charger · 3 ports",
  "esp32-wroom-devkit-v1": "ESP32 WROOM DevKit V1",
  "arduino-nano-v3-ch340": "Arduino Nano V3 · CH340",
  "4-channel-relay-module-5v": "4-channel relay · 5V",
  "737g-battery-spot-welder": "SUNKKO 737G spot welder",
  "2in1-hot-air-soldering-station": "Yihua 8586 soldering station",
  "pure-nickel-strip-015-8mm": "Nickel strip 0.15 × 8mm · 1m",
  "lipo-safe-fireproof-bag": "Fireproof battery storage bag",
};

export function productLabel(slug: string, fallback: string): string {
  return names[slug] ?? fallback;
}

const categories: Record<string, string> = {
  "battery-cells": "Cells",
  "battery-packs": "Packs",
  "bms-circuits": "BMS & circuits",
  "ups-power": "UPS & power",
  "diy-prototyping": "DIY parts",
  "tools-safety": "Tools",
};

export function categoryLabel(slug: string, fallback: string): string {
  return categories[slug] ?? fallback;
}

// Compact brand labels for card eyebrows, so long names never truncate with an ellipsis.
const brands: Record<string, string> = {
  "Glowing Space Lab": "GS Lab",
  "Glowing Space": "Glowing Space",
  "Arduino Compatible": "Arduino",
  "LG Energy": "LG",
  "Samsung SDI": "Samsung",
  "JK BMS": "JK",
};

export function brandLabel(brand: string): string {
  return brands[brand] ?? brand;
}
