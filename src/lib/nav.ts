export const NAV_CATEGORIES = [
  { slug: "battery-cells", name: "Battery cells", icon: "battery", tagline: "18650 · 21700 · LiFePO4" },
  { slug: "battery-packs", name: "Battery packs", icon: "package", tagline: "12V · 24V · 48V packs" },
  { slug: "bms-circuits", name: "BMS & circuits", icon: "cpu", tagline: "Daly · JK · JBD" },
  { slug: "ups-power", name: "UPS & power", icon: "zap", tagline: "Router UPS · inverters" },
  { slug: "diy-prototyping", name: "DIY & prototyping", icon: "circuit-board", tagline: "ESP32 · Arduino · modules" },
  { slug: "tools-safety", name: "Tools & safety", icon: "flame", tagline: "Welders · soldering · safety" },
] as const;

export const SUPPORT_LINKS = [
  { href: "/track", label: "Track order" },
  { href: "/support", label: "Help & support" },
  { href: "/support#shipping", label: "Delivery & returns" },
  { href: "/about", label: "About & location" },
] as const;
