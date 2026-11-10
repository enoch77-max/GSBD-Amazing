/** Minimal cookie jar so server-only helpers typecheck and run in the preview. */
function attachCookies(response) {
  const jar = new Map();
  Object.defineProperty(response, "cookies", {
    value: {
      get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name, value) => { jar.set(name, value); },
      delete: (name) => { jar.delete(name); },
    },
    enumerable: false,
  });
  return response;
}

export class NextResponse extends Response {
  constructor(body, init) {
    super(body, init);
    attachCookies(this);
  }
  static json(body, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }
  static redirect(url, init = 307) {
    const status = typeof init === "number" ? init : (init.status ?? 307);
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
  static next() {
    return new NextResponse(null, { status: 200 });
  }
  static rewrite(destination) {
    return new NextResponse(null, { status: 200, headers: { "x-middleware-rewrite": String(destination) } });
  }
}
export class NextRequest extends Request {}
