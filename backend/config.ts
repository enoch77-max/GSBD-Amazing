/**
 * Backend configuration. Everything comes from the environment (Docker Compose
 * feeds it from `.env`); missing or weak values fail fast with a fix-it message
 * instead of booting into a broken or insecure state.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config();

function str(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`[config] ${key} is not set. Copy .env.example to .env or run deploy/make-env.sh.`);
  }
  return value;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`[config] ${key} must be a number, got ${JSON.stringify(raw)}.`);
  return value;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

const nodeEnv = process.env.NODE_ENV ?? "production";
const sessionSecret = str("SESSION_SECRET", nodeEnv === "production" ? undefined : "dev-only-insecure-secret");
if (nodeEnv === "production" && sessionSecret.length < 32) {
  throw new Error("[config] SESSION_SECRET must be at least 32 characters in production. Run deploy/make-env.sh.");
}

const root = process.cwd();

export const config = {
  env: nodeEnv,
  isProd: nodeEnv === "production",
  isTest: nodeEnv === "test",
  buildId: process.env.BUILD_ID ?? "dev",
  port: num("PORT", 3000),
  host: str("HOST", "0.0.0.0"),
  /* Off by default so direct deployments cannot spoof rate-limit IPs. Compose enables it behind Caddy. */
  trustProxy: bool("TRUST_PROXY", false),
  databaseUrl: str("DATABASE_URL"),
  sessionSecret,
  siteUrl: str("SITE_URL", "http://localhost:3000").replace(/\/+$/, ""),
  frontendDir: path.resolve(root, str("FRONTEND_DIR", "dist")),
  uploadDir: path.resolve(root, str("UPLOAD_DIR", "data/uploads")),
  migrationsDir: path.resolve(root, str("MIGRATIONS_DIR", "backend/migrations")),
  cronSecret: process.env.CRON_SECRET || null,
  /** In non-production the OTP endpoint reveals the code so the flow is testable. Never true in prod. */
  otpDebug: nodeEnv !== "production",
  cookieSecure: str("SITE_URL", "http://localhost:3000").startsWith("https://"),
};

export type Config = typeof config;
