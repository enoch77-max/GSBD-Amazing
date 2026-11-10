/**
 * PostgreSQL access: one pooled client, a transaction helper and the
 * migration runner. Every query is parameterised — string-interpolated SQL
 * must never appear anywhere else in the backend.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: /sslmode=require/i.test(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", (error) => console.error("[db] pool error", error));
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

type Row = QueryResultRow;

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const started = Date.now();
  const result = await getPool().query(text, params as never[]);
  const elapsed = Date.now() - started;
  if (elapsed > 500) console.warn(`[db] slow query ${elapsed}ms: ${text.slice(0, 120)}`);
  return result.rows as T[];
}

export async function queryOne<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs `fn` inside a transaction on a single dedicated client. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection is already broken — nothing left to roll back */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Applies every *.sql file in the migrations directory, exactly once each. */
export async function migrate(migrationsDir = config.migrationsDir): Promise<string[]> {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const applied = new Set((await query<{ name: string }>("SELECT name FROM schema_migrations")).map((row) => row.name));
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  const fresh: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      fresh.push(file);
      console.log(`[db] applied migration ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return fresh;
}

/** snake_case row → camelCase object (shallow), matching the storefront types. */
export function camel<T = Record<string, unknown>>(row: Row): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return out as T;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export function isCheckViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23514";
}
