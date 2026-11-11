import type { Context, ReactNode } from "react";
export declare const BASE: string;
export declare const hashMode: boolean;
export declare const RouteParamsContext: Context<Record<string, string>>;
export declare function useRouteSnapshot(): { url: string; version: number };
export declare function useRouteParams(): Record<string, string>;
export declare function splitUrl(url: string): { pathname: string; search: string; hash: string };
export declare function scrollToHash(hash: string, smooth?: boolean): boolean;
/** Applies the scroll requested by the last navigation; call from a layout effect after the route commits. */
export declare function applyPendingScroll(): void;
export declare function navigate(href: string, options?: { replace?: boolean; scroll?: boolean }): void;
export declare function refresh(): void;
export declare function currentUrl(): string;
export type { ReactNode };
