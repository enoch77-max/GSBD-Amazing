#!/usr/bin/env node
/**
 * Operator CLI. Usage (from the repo root, after `npm run server:build`):
 *
 *   node backend/dist/cli.mjs migrate
 *   node backend/dist/cli.mjs seed
 *   node backend/dist/cli.mjs create-admin --email=owner@shop.com --password='...' [--role=owner]
 *   node backend/dist/cli.mjs stats
 */
import { migrate, query, queryOne, closeDb } from "./db";
import { seedAll } from "./seed";
import { hashPassword } from "./auth";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function createAdmin(): Promise<void> {
  const email = flag("email")?.trim().toLowerCase();
  const password = flag("password") ?? "";
  const role = flag("role") ?? "owner";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage: create-admin --email=you@shop.com --password='at least 12 chars' [--role=owner|staff]");
    process.exitCode = 1;
    return;
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exitCode = 1;
    return;
  }
  if (role !== "owner" && role !== "staff") {
    console.error("Role must be owner or staff.");
    process.exitCode = 1;
    return;
  }
  await query(
    "INSERT INTO admin_users (email, password_hash, role) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $3, active = TRUE",
    [email, await hashPassword(password), role],
  );
  console.log(`Admin ${email} (${role}) is ready — sign in at /admin.`);
}

async function stats(): Promise<void> {
  const [orders, revenue, products, stock, users] = await Promise.all([
    queryOne<{ count: string }>("SELECT count(*)::text AS count FROM orders"),
    queryOne<{ total: string }>("SELECT COALESCE(SUM(total),0)::text AS total FROM orders WHERE status = ANY('{confirmed,packing,shipped,delivered}')"),
    queryOne<{ count: string }>("SELECT count(*)::text AS count FROM products WHERE visible = TRUE"),
    queryOne<{ stock: string }>("SELECT COALESCE(SUM(stock),0)::text AS stock FROM products"),
    queryOne<{ count: string }>("SELECT count(*)::text AS count FROM admin_users WHERE active = TRUE"),
  ]);
  console.log(JSON.stringify({
    orders: Number(orders?.count ?? 0),
    revenue: Number(revenue?.total ?? 0),
    products: Number(products?.count ?? 0),
    unitsInStock: Number(stock?.stock ?? 0),
    admins: Number(users?.count ?? 0),
  }, null, 2));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  try {
    if (command === "migrate") {
      const applied = await migrate();
      console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
    } else if (command === "seed") {
      console.log(JSON.stringify(await seedAll()));
    } else if (command === "create-admin") {
      await createAdmin();
    } else if (command === "stats") {
      await stats();
    } else {
      console.error("Commands: migrate | seed | create-admin | stats");
      process.exitCode = 1;
    }
  } finally {
    await closeDb();
  }
}

await main();
