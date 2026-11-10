export type Metadata = {
  title?: string | { default?: string; template?: string };
  description?: string;
  keywords?: string[];
  openGraph?: Record<string, unknown>;
  [key: string]: unknown;
};
export type NextConfig = Record<string, any>;
export type Viewport = Record<string, unknown>;
declare const _default: { __shim: string };
export default _default;
