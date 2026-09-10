/**
 * Build once, then serve — the fast way to run the e2e suite.
 *
 *   pnpm start:e2e            # build, then start on 300
 *   pnpm start:e2e --no-build # start an existing build
 *
 * ## Why this exists alongside `dev:e2e`
 *
 * `next dev` compiles each route the first time it is requested. That is right
 * for development and wrong for a suite that visits about a hundred routes
 * once each: the compile *is* the test time. Measured on this repo, a cold
 * route cost 20 seconds to two minutes, and the 17-test gold suite took 2.6
 * hours of which the assertions were a few minutes.
 *
 * A production build pays that cost once, up front, and then serves every route
 * in milliseconds. It is also closer to what the suite is meant to be testing —
 * `next dev` has different error overlays, different hydration timing and an
 * extra client runtime that production does not ship.
 *
 * `dev:e2e` is still the right thing when you are changing app code and want
 * hot reload between runs. This is the right thing for a full sweep.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

if (!existsSync(".env.e2e")) {
  console.error("No .env.e2e — see docs/testing/e2e-plan-2026-09-01.md step 0.4.");
  process.exit(1);
}

const loaded = {};
for (const line of readFileSync(".env.e2e", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  loaded[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^"|"$/g, "");
}

const target = loaded.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(target)) {
  console.error(
    `.env.e2e points DATABASE_URL at ${target.replace(/:[^:@]*@/, ":***@")}, which is not local. Refusing.`,
  );
  process.exit(1);
}

const port = loaded.PORT ?? "300";
const env = {
  ...process.env,
  ...loaded,
  NODE_ENV: "production",
  // The build compiles the whole app at once, which wants more headroom than
  // the default. `pnpm typecheck` already sets 7168 for the same reason.
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=8192"].filter(Boolean).join(" "),
};

if (!process.argv.includes("--no-build")) {
  console.log("Building for the e2e database. This takes a few minutes, once.\n");
  const build = spawnSync("npx", ["next", "build"], {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) {
    console.error("\nBuild failed. Run `pnpm dev:e2e` instead, or fix the build.");
    process.exit(build.status ?? 1);
  }
}

console.log(`\nServing the e2e build on ${port}.`);
console.log(`  sign in at http://acme.${loaded.PLATFORM_ROOT_DOMAIN ?? "apps.pagka.local"}:${port}/login\n`);

const child = spawn("npx", ["next", "start", "-p", port], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 0));
