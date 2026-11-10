/**
 * Local test database: runs a real PostgreSQL 16 cluster as the current user
 * (no sudo, no service manager). Used for the backend test suites in
 * sandboxes without a system Postgres.
 *
 *   node scripts/dev-db.mjs            # starts on 127.0.0.1:5433
 *   EBPG_PORT=5434 node scripts/dev-db.mjs
 *
 * Credentials: user "postgres", password "gsbd". Databases
 * gsbd_features / gsbd_prod_test / gsbd_browser are created up front.
 */
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.EBPG_PORT ?? 5433);
const pg = new EmbeddedPostgres({
  port,
  password: "gsbd",
  databaseDir: process.env.EBPG_DATA_DIR ?? "data/db",
  persistent: false,
  initdbFlags: ["--encoding=UTF8"],
});

await pg.initialise();
await pg.start();
for (const database of ["gsbd_features", "gsbd_prod_test", "gsbd_browser"]) {
  try {
    await pg.createDatabase(database);
  } catch {
    /* already exists from a previous run */
  }
}
console.log(`embedded postgres listening on 127.0.0.1:${port} (user postgres, password gsbd)`);

const stop = () => {
  console.log("stopping embedded postgres…");
  void pg.stop().finally(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setInterval(() => {}, 1 << 30);
