export interface ResponseCookies {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string): void;
}

export declare class NextResponse extends Response {
  readonly cookies: ResponseCookies;
  static json(body: unknown, init?: ResponseInit): NextResponse;
  static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
  static next(): NextResponse;
  static rewrite(destination: string | URL): NextResponse;
}
export declare class NextRequest extends Request {}
