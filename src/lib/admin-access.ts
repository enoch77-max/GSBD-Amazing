/**
 * Role-based access control for the merchant console. Pure data + helpers so
 * the UI, the data layer and tests all share one definition.
 */

export const PERMISSIONS = [
  { id: "dashboard.view", group: "Overview", label: "View dashboard & KPIs" },
  { id: "orders.view", group: "Orders", label: "View orders" },
  { id: "orders.manage", group: "Orders", label: "Update status, notes & courier" },
  { id: "orders.payments", group: "Orders", label: "Record payments & refunds" },
  { id: "orders.export", group: "Orders", label: "Export orders & manifests" },
  { id: "customers.view", group: "Customers", label: "View customers & contact details" },
  { id: "catalogue.view", group: "Catalogue", label: "View products" },
  { id: "catalogue.edit", group: "Catalogue", label: "Create & edit products" },
  { id: "catalogue.delete", group: "Catalogue", label: "Delete products" },
  { id: "stock.edit", group: "Catalogue", label: "Adjust stock levels" },
  { id: "pricing.edit", group: "Catalogue", label: "Change prices" },
  { id: "reviews.moderate", group: "Catalogue", label: "Moderate reviews" },
  { id: "packai.manage", group: "Catalogue", label: "Configure Pack Builder AI" },
  { id: "promotions.manage", group: "Marketing", label: "Manage discount codes" },
  { id: "marketing.manage", group: "Marketing", label: "Ad spend, carts & messaging" },
  { id: "settings.manage", group: "Administration", label: "Store, payment & shipping settings" },
  { id: "team.manage", group: "Administration", label: "Manage staff & roles" },
  { id: "audit.view", group: "Administration", label: "View activity log" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["id"];
export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.id) as Permission[];

export type AdminRole = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  builtin: boolean;
};

export const BUILTIN_ROLES: AdminRole[] = [
  {
    id: "owner", name: "Owner", builtin: true,
    description: "Full access, including staff, roles and billing settings.",
    permissions: [...ALL_PERMISSIONS],
  },
  {
    id: "manager", name: "Store manager", builtin: true,
    description: "Runs the store day to day. Cannot manage staff or core settings.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "team.manage" && p !== "settings.manage"),
  },
  {
    id: "sales", name: "Sales & support", builtin: true,
    description: "Handles orders, payments and customers.",
    permissions: ["dashboard.view", "orders.view", "orders.manage", "orders.payments", "orders.export", "customers.view", "catalogue.view", "reviews.moderate"],
  },
  {
    id: "warehouse", name: "Warehouse", builtin: true,
    description: "Packs orders and keeps stock accurate. No prices or payments.",
    permissions: ["orders.view", "orders.manage", "orders.export", "catalogue.view", "stock.edit"],
  },
  {
    id: "marketing", name: "Marketing", builtin: true,
    description: "Promotions, campaigns and product content.",
    permissions: ["dashboard.view", "catalogue.view", "catalogue.edit", "reviews.moderate", "promotions.manage", "marketing.manage"],
  },
  {
    id: "viewer", name: "Viewer", builtin: true,
    description: "Read-only access to reports, orders and products.",
    permissions: ["dashboard.view", "orders.view", "catalogue.view", "audit.view"],
  },
];

export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission)))];
}

export function allRoles(custom: AdminRole[] = []): AdminRole[] {
  const builtinIds = new Set(BUILTIN_ROLES.map((r) => r.id));
  return [...BUILTIN_ROLES, ...custom.filter((r) => !builtinIds.has(r.id))];
}

export function findRole(roleId: string, custom: AdminRole[] = []): AdminRole | undefined {
  return allRoles(custom).find((r) => r.id === roleId);
}

export function roleHas(role: AdminRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role.id === "owner") return true;
  return role.permissions.includes(permission);
}

/** Console sections and the permission required to open each. */
export const SECTION_ACCESS: Record<string, Permission> = {
  overview: "dashboard.view",
  orders: "orders.view",
  customers: "customers.view",
  catalogue: "catalogue.view",
  inventory: "catalogue.view",
  reviews: "reviews.moderate",
  "pack-ai": "packai.manage",
  promotions: "promotions.manage",
  growth: "marketing.manage",
  team: "team.manage",
  activity: "audit.view",
  settings: "settings.manage",
};
