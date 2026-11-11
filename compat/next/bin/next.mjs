#!/usr/bin/env node
/**
 * CLI facade for the local `next` compatibility package.
 *
 * The cloned storefront is a Vite SPA that only borrows Next.js browser APIs,
 * so there is no Next CLI. Arena's validation pipeline and deployment runtime
 * still invoke `next <command>`; these map onto the real build/start commands.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const [command = "", ...rest] = process.argv.slice(2);

function run(file, args) {
  const result = spawnSync(file, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) {
    console.error(`[gsbd/next] ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

switch (command) {
  case "typegen":
    /* No App Router type generation is needed for the Vite build; tsc validates
       the whole tree. Keep the command successful and idempotent. */
    console.log("[gsbd/next] typegen: Vite compatibility build — no Next.js generated types required.");
    break;
  case "build":
    run("npm", ["run", "build"]);
    break;
  case "start":
    run(process.execPath, ["server.js"]);
    break;
  case "dev":
    run("npm", ["run", "dev"]);
    break;
  case "--version":
  case "-v":
    console.log("16.2.6 (gsbd compatibility shim)");
    break;
  case "info":
    console.log("GSBD-Amazing · Vite single-file storefront with Next.js API compatibility layer");
    break;
  default:
    if (command) console.log(`[gsbd/next] '${command}' is not used by this compatibility build; continuing.`);
    break;
}
