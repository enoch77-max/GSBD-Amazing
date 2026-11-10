/**
 * Server entry point: migrations → seed → listen.
 * The test suite imports `createApp` from `./app` instead, so importing this
 * module must remain the only way to boot (guarded below for clarity).
 */
import { mkdirSync } from "node:fs";
import { createApp } from "./app";
import { closeDb, migrate } from "./db";
import { config } from "./config";
import { seedAll } from "./seed";

export { createApp };

export async function boot(): Promise<ReturnType<ReturnType<typeof createApp>["listen"]>> {
  await migrate();
  const counts = await seedAll();
  const seeded = counts.categories + counts.products + counts.reviews + counts.promos;
  if (seeded > 0) console.log(`[app] seeded catalogue: ${JSON.stringify(counts)}`);
  mkdirSync(config.uploadDir, { recursive: true });
  return createApp().listen();
}

const server = await boot();

const shutdown = async (signal: string) => {
  console.log(`[app] ${signal} — draining`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
