/// <reference types="vite/client" />

declare global {
  // Installed by src/main.tsx so the next/image shim can resolve bundled assets.
  var __gsbdAsset: ((src: string) => string) | undefined;
}

export {};
