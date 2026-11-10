/**
 * Authentication: scrypt passwords, signed stateless admin sessions,
 * phone OTP with brute-force guards, and order claim tokens.
 */
import { createHmac, randomInt, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { query } from "./db";
import { setCookie, unauthorized, forbidden, type Ctx, type Middleware } from "./http";
import { normalizePhone } from "../src/lib/phone";

function scryptAsync(password: string, salt: string, keylen: number, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Passwords                                                           */
/* ------------------------------------------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("Use at least 12 characters for an admin password.");
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `v1$16384$8$1$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [version, n, r, p, salt, hash] = stored.split("$");
    if (version !== "v1" || !salt || !hash) return false;
    const derived = await scryptAsync(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) });
    const expected = Buffer.from(hash, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Signed tokens (sessions, OTP proofs, order claims)                  */
/* ------------------------------------------------------------------ */

function sign(purpose: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, purpose })).toString("base64url");
  const signature = createHmac("sha256", config.sessionSecret).update(`${purpose}.${body}`).digest("base64url");
  return `${body}.${signature}`;
}

function verify<T extends Record<string, unknown>>(purpose: string, token: string): T | null {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = createHmac("sha256", config.sessionSecret).update(`${purpose}.${body}`).digest("base64url");
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { purpose?: string; exp?: number };
    if (parsed.purpose !== purpose) return null;
    if (typeof parsed.exp === "number" && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "gsbd_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function issueSession(ctx: Ctx, email: string, role: string): void {
  const token = sign("admin-session", { email, role, exp: Date.now() + SESSION_TTL_MS });
  setCookie(ctx.res, SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_MS / 1000,
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
  });
}

export function clearSession(ctx: Ctx): void {
  setCookie(ctx.res, SESSION_COOKIE, "", { maxAge: 0, path: "/" });
}

export function readSession(ctx: Ctx): { email: string; role: string } | null {
  const raw = ctx.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const parsed = verify<{ email: string; role: string }>("admin-session", raw);
  if (!parsed || typeof parsed.email !== "string") return null;
  return { email: parsed.email, role: parsed.role === "owner" ? "owner" : "staff" };
}

export function requireAdmin(): Middleware {
  return async (ctx, next) => {
    const session = readSession(ctx);
    if (!session) throw unauthorized();
    const row = await query<{ role: string; active: boolean }>(
      "SELECT role, active FROM admin_users WHERE lower(email) = lower($1)",
      [session.email],
    ).then((rows) => rows[0] ?? null).catch(() => null);
    /* A deleted or deactivated account loses access immediately. */
    if (!row || row.active === false) throw unauthorized();
    ctx.admin = { email: session.email, role: row.role === "owner" ? "owner" : "staff" };
    await next();
  };
}

export function requireOwner(): Middleware {
  return async (ctx, next) => {
    if (!ctx.admin) throw unauthorized();
    if (ctx.admin.role !== "owner") throw forbidden("Only the store owner can change this.");
    await next();
  };
}

/* ------------------------------------------------------------------ */
/* Phone OTP                                                           */
/* ------------------------------------------------------------------ */

type OtpEntry = { code: string; exp: number; attempts: number; sentAt: number; dayKey: string; dayCount: number };
const otps = new Map<string, OtpEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of otps) {
    if (now > entry.exp + 3_600_000) otps.delete(phone);
  }
}, 300_000).unref();

export type OtpRequest = { ok: true; code: string } | { ok: false; retryAfter: number; reason: string };

export function requestOtp(rawPhone: string): OtpRequest {
  const phone = normalizePhone(rawPhone);
  const now = Date.now();
  const dayKey = new Date().toISOString().slice(0, 10);
  const entry = otps.get(phone);
  const dayCount = entry && entry.dayKey === dayKey ? entry.dayCount : 0;

  if (dayCount >= 5) {
    return { ok: false, retryAfter: 3600, reason: "Too many codes sent to this number today. Please call us instead." };
  }
  if (entry && now - entry.sentAt < 60_000) {
    return { ok: false, retryAfter: Math.ceil((60_000 - (now - entry.sentAt)) / 1000), reason: "A code was just sent. Please wait before requesting another." };
  }

  const code = String(randomInt(100_000, 1_000_000));
  otps.set(phone, { code, exp: now + 10 * 60_000, attempts: 0, sentAt: now, dayKey, dayCount: dayCount + 1 });
  return { ok: true, code };
}

export type OtpVerify = { ok: true; proof: string } | { ok: false; reason: string };

export function verifyOtp(rawPhone: string, code: string): OtpVerify {
  const phone = normalizePhone(rawPhone);
  const entry = otps.get(phone);
  if (!entry) return { ok: false, reason: "No code was requested for this number. Please request one first." };
  if (Date.now() > entry.exp) {
    otps.delete(phone);
    return { ok: false, reason: "That code has expired. Please request a new one." };
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    otps.delete(phone);
    return { ok: false, reason: "Too many wrong attempts. Please request a new code." };
  }
  const clean = String(code ?? "").trim();
  if (clean.length !== 6 || !timingSafeEqual(Buffer.from(clean.padEnd(6, " ")), Buffer.from(entry.code))) {
    return { ok: false, reason: "That code does not match. Check the SMS and try again." };
  }
  otps.delete(phone);
  return { ok: true, proof: sign("otp-proof", { phone, exp: Date.now() + 30 * 60_000 }) };
}

export function verifyOtpProof(proof: string, rawPhone: string): boolean {
  const parsed = verify<{ phone: string }>("otp-proof", proof);
  return Boolean(parsed && parsed.phone === normalizePhone(rawPhone));
}

/* ------------------------------------------------------------------ */
/* Order claim tokens (for the confirmation page, without leaking      */
/* customer data to anyone who guesses an order number)                */
/* ------------------------------------------------------------------ */

export function claimToken(orderNumber: string): string {
  return sign("order-claim", { order: orderNumber.toUpperCase(), exp: Date.now() + 24 * 60 * 60_000 });
}

export function verifyClaimToken(token: string, orderNumber: string): boolean {
  const parsed = verify<{ order: string }>("order-claim", token);
  return Boolean(parsed && parsed.order === orderNumber.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

const SECRET_KEYS = new Set([
  "password", "secret", "secretKey", "appSecret", "apiSecret", "apiKey", "smsApiKey",
  "storePassword", "accessToken", "metaAccessToken", "privateKey", "clientSecret",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.has(key) ? "[redacted]" : redact(entry);
    }
    return out;
  }
  return value;
}

export async function audit(input: { actor: string; action: string; target?: string | null; payload?: unknown; ip?: string }): Promise<void> {
  try {
    await query("INSERT INTO audit_log (actor, action, target, payload, ip) VALUES ($1, $2, $3, $4, $5)", [
      input.actor,
      input.action,
      input.target ?? null,
      input.payload === undefined ? null : JSON.stringify(redact(input.payload)),
      input.ip ?? null,
    ]);
  } catch (error) {
    console.error("[audit] failed to write audit row", error);
  }
}
