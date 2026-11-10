/**
 * A tiny HTTP framework: router with :params, JSON/form bodies, cookies,
 * rate limiting, CSRF checks, static files and a uniform error envelope.
 * Deliberately dependency-free so the production image stays small.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";

export type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  url: URL;
  pathname: string;
  params: Record<string, string>;
  query: URLSearchParams;
  cookies: Record<string, string>;
  ip: string;
  body: unknown;
  rawBody: Buffer | null;
  admin: { email: string; role: string } | null;
  state: Record<string, unknown>;
};

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
export type Middleware = (ctx: Ctx, next: () => Promise<void>) => unknown | Promise<unknown>;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message = "Sign in to continue.") => new HttpError(401, message);
export const forbidden = (message = "Not allowed.") => new HttpError(403, message);
export const notFound = (message = "Not found.") => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

/** 429 with a Retry-After header, for abuse-shaped rejections. */
export class RateLimited extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[name] = part.slice(index + 1).trim();
    }
  }
  return out;
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  options: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None"; path?: string } = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  const existing = res.getHeader("Set-Cookie");
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  res.setHeader("Set-Cookie", [...list, parts.join("; ")]);
}

export function sendJson(ctx: Ctx, data: unknown, status = 200, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(data);
  ctx.res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...headers,
  });
  ctx.res.end(payload);
}

export function sendText(ctx: Ctx, text: string, contentType: string, status = 200, headers: Record<string, string> = {}): void {
  ctx.res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(text),
    ...headers,
  });
  ctx.res.end(text);
}

export function redirect(ctx: Ctx, location: string, status = 303): void {
  ctx.res.writeHead(status, { location });
  ctx.res.end();
}

export function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    if (first?.trim()) return first.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

const MAX_BODY = 2_000_000;

async function readBody(
  ctx: Ctx,
  limit = ctx.pathname === "/api/admin/uploads" ? 6_000_000 : MAX_BODY,
): Promise<{ body: unknown; raw: Buffer | null }> {
  if (ctx.method === "GET" || ctx.method === "HEAD" || ctx.method === "OPTIONS") return { body: undefined, raw: null };
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of ctx.req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new HttpError(413, "Request body is too large.");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks);
  if (raw.length === 0) return { body: undefined, raw };
  const type = ctx.req.headers["content-type"] ?? "";
  try {
    if (type.includes("application/x-www-form-urlencoded")) {
      return { body: Object.fromEntries(new URLSearchParams(raw.toString("utf8"))), raw };
    }
    return { body: JSON.parse(raw.toString("utf8")), raw };
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
}

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

export function logger(): Middleware {
  return async (ctx, next) => {
    const started = Date.now();
    await next();
    if (ctx.pathname === "/api/health") return;
    console.log(`${ctx.method} ${ctx.pathname} ${ctx.res.statusCode} ${Date.now() - started}ms ${ctx.ip}`);
  };
}

export function securityHeaders(): Middleware {
  return async (ctx, next) => {
    ctx.res.setHeader("x-content-type-options", "nosniff");
    ctx.res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    ctx.res.setHeader("x-frame-options", "DENY");
    ctx.res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), usb=()");
    ctx.res.setHeader("cross-origin-opener-policy", "same-origin-allow-popups");
    ctx.res.setHeader("x-permitted-cross-domain-policies", "none");
    ctx.res.setHeader(
      "content-security-policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        /* The production storefront is a single inline bundle, hence inline script/style. */
        "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.googletagmanager.com https://analytics.tiktok.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: https: http:",
        "connect-src 'self' https://graph.facebook.com https://www.google-analytics.com https://analytics.tiktok.com",
        "frame-src 'none'",
        "upgrade-insecure-requests",
      ].join("; "),
    );
    ctx.res.removeHeader("x-powered-by");
    await next();
  };
}

/**
 * Mutations must carry the fetch marker header. Browsers cannot send custom
 * headers cross-site without a preflight, so this blocks CSRF while staying
 * stateless. Webhooks and cron are exempt — they authenticate differently.
 */
export function csrf(): Middleware {
  return async (ctx, next) => {
    const mutating = ctx.method === "POST" || ctx.method === "PUT" || ctx.method === "PATCH" || ctx.method === "DELETE";
    const exempt = ctx.pathname.startsWith("/api/webhooks/") || ctx.pathname.startsWith("/api/cron/");
    if (mutating && !exempt && ctx.req.headers["x-requested-with"] !== "fetch") {
      throw new HttpError(403, "Missing request header. Please use the storefront to place this request.");
    }
    await next();
  };
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 60_000).unref();

export function rateLimit(options: { limit: number; windowMs: number; key?: (ctx: Ctx) => string; message?: string }): Middleware {
  return async (ctx, next) => {
    const key = options.key ? options.key(ctx) : `${ctx.ip}:${ctx.method}:${ctx.pathname}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      await next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      ctx.res.setHeader("retry-after", String(retryAfter));
      throw new HttpError(429, options.message ?? "Too many attempts. Please wait a moment and try again.");
    }
    await next();
  };
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

type Segment = { literal: string } | { param: string };
type Route = { method: string; segments: Segment[]; handlers: Array<Middleware | Handler> };

function splitPath(pathname: string): string[] {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return clean.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

function compile(pattern: string): Segment[] {
  return splitPath(pattern).map((segment) =>
    segment.startsWith(":") ? { param: segment.slice(1) } : { literal: segment },
  );
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
};

export async function serveFile(ctx: Ctx, filePath: string, options: { maxAge?: number; immutable?: boolean } = {}): Promise<boolean> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  if (ctx.req.headers["if-none-match"] === etag) {
    ctx.res.writeHead(304);
    ctx.res.end();
    return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  ctx.res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "content-length": stat.size,
    etag,
    "cache-control": options.immutable ? "public, max-age=31536000, immutable" : `public, max-age=${options.maxAge ?? 3600}`,
  });
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    ctx.res.on("close", () => resolve());
    stream.pipe(ctx.res);
  });
  return true;
}

/** Joins a URL path onto a root directory, refusing anything that escapes it. */
export function safeJoin(root: string, requestPath: string): string | null {
  const resolved = path.resolve(root, `.${path.sep}${requestPath}`);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export class App {
  private global: Middleware[] = [];
  private routes: Route[] = [];
  private fallbackHandlers: Array<Middleware | Handler> = [];

  use(middleware: Middleware): this {
    this.global.push(middleware);
    return this;
  }

  /** Handles any GET that matched no route (the SPA shell, for example). */
  fallback(...handlers: Array<Middleware | Handler>): this {
    this.fallbackHandlers.push(...handlers);
    return this;
  }

  add(method: string, pattern: string, ...handlers: Array<Middleware | Handler>): this {
    this.routes.push({ method: method.toUpperCase(), segments: compile(pattern), handlers });
    return this;
  }

  get(pattern: string, ...handlers: Array<Middleware | Handler>): this { return this.add("GET", pattern, ...handlers); }
  post(pattern: string, ...handlers: Array<Middleware | Handler>): this { return this.add("POST", pattern, ...handlers); }
  put(pattern: string, ...handlers: Array<Middleware | Handler>): this { return this.add("PUT", pattern, ...handlers); }
  patch(pattern: string, ...handlers: Array<Middleware | Handler>): this { return this.add("PATCH", pattern, ...handlers); }
  delete(pattern: string, ...handlers: Array<Middleware | Handler>): this { return this.add("DELETE", pattern, ...handlers); }

  private match(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
    const parts = splitPath(pathname);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        const segment = route.segments[index];
        if ("param" in segment) params[segment.param] = parts[index];
        else if (segment.literal !== parts[index]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  handler(): (req: IncomingMessage, res: ServerResponse) => void {
    return (req, res) => {
      void this.dispatch(req, res).catch((error: unknown) => {
        console.error("[http] fatal dispatch error", error);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Something went wrong. Please try again." }));
        } else {
          res.end();
        }
      });
    };
  }

  private async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host ?? `127.0.0.1:${config.port}`;
    const rawUrl = req.url ?? "/";
    if (rawUrl.length > 4096) {
      sendJson({ req, res, pathname: "/request" } as Ctx, { error: "Request URL is too long." }, 414);
      return;
    }
    const url = new URL(rawUrl, `http://${host}`);
    const ctx: Ctx = {
      req,
      res,
      method: (req.method ?? "GET").toUpperCase(),
      url,
      pathname: url.pathname,
      params: {},
      query: url.searchParams,
      cookies: parseCookies(req.headers.cookie),
      ip: clientIp(req),
      body: undefined,
      rawBody: null,
      admin: null,
      state: {},
    };

    try {
      const found = this.match(ctx.method, ctx.pathname);
      let handlers: Array<Middleware | Handler>;
      if (!found) {
        if (ctx.method === "HEAD") {
          const get = this.match("GET", ctx.pathname);
          if (get) {
            res.writeHead(200);
            res.end();
            return;
          }
        }
        if (ctx.method === "GET" && this.fallbackHandlers.length > 0) {
          handlers = this.fallbackHandlers;
        } else {
          throw new HttpError(404, "Not found.");
        }
      } else {
        ctx.params = found.params;
        handlers = found.route.handlers;
      }
      const { body, raw } = await readBody(ctx);
      ctx.body = body;
      ctx.rawBody = raw;

      const chain = [...this.global, ...handlers];
      let index = 0;
      const next = async (): Promise<void> => {
        const current = chain[index++];
        if (!current) return;
        if (current.length >= 2) await (current as Middleware)(ctx, next);
        else await (current as Handler)(ctx);
      };
      await next();

      if (!res.writableEnded) {
        res.writeHead(204);
        res.end();
      }
    } catch (error) {
      if (res.writableEnded) return;
      if (error instanceof RateLimited) {
        ctx.res.setHeader("retry-after", String(error.retryAfter));
        sendJson(ctx, { error: error.message }, 429);
      } else if (error instanceof HttpError) {
        sendJson(ctx, { error: error.message }, error.status);
      } else {
        console.error(`[http] ${ctx.method} ${ctx.pathname}`, error);
        sendJson(ctx, { error: "Something went wrong. Please try again." }, 500);
      }
    }
  }

  listen(): Server {
    const server = createServer(this.handler());
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.maxHeadersCount = 100;
    server.listen(config.port, config.host, () => {
      console.log(`[app] listening on http://${config.host}:${config.port} (${config.env})`);
    });
    return server;
  }
}
