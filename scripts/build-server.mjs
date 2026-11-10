/**
 * Bundles the backend with esbuild (already a transitive dependency via Vite).
 * One file per entry point, node builtins + `pg` left external.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("backend/dist", { recursive: true });

const entries = [
  ["backend/index.ts", "backend/dist/server.mjs"],
  ["backend/cli.ts", "backend/dist/cli.mjs"],
  ["backend/tests/api.test.ts", "backend/dist/api.test.mjs"],
  ["backend/tests/features.test.ts", "backend/dist/features.test.mjs"],
  ["backend/tests/production-security.test.ts", "backend/dist/production-security.test.mjs"],
];

for (const [input, output] of entries) {
  execFileSync(
    "node_modules/.bin/esbuild",
    [input, "--bundle", "--platform=node", "--format=esm", `--outfile=${output}`, "--external:pg", "--external:dotenv", "--sourcemap", "--log-level=warning"],
    { stdio: "inherit" },
  );
}
console.log("backend built → backend/dist/{server,cli,api.test}.mjs");
