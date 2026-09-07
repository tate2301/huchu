/**
 * Run the dev server against the end-to-end database.
 *
 *   pnpm dev:e2e
 *
 * Next reads `.env` on its own and there is no `--env-file` that composes with
 * it, so this loads `.env.e2e` into the environment first and then hands over.
 * Variables already set in the environment win over a `.env` file in Next, so
 * everything named in `.env.e2e` overrides its `.env` counterpart and
 * everything absent falls through — which is what we want: the e2e file carries
 * the database and the hosts, `.env` keeps the rest.
 *
 * The alternative was `dotenv-cli`, which is not a dependency of this repo and
 * is not worth becoming one for six lines.
 */

import { spawn } from "node:child_process";
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

console.log("dev server on the e2e database:");
console.log(`  ${target.replace(/:[^:@]*@/, ":***@")}`);

const port = loaded.PORT ?? "300";

// Derived, not typed. This line read `:3000` while the server listened on
// 3100 — a hardcoded port in a message whose only job is to say where to go.
const rootDomain = loaded.PLATFORM_ROOT_DOMAIN ?? "apps.pagka.local";
console.log(`  sign in at http://acme.${rootDomain}:${port}/login`);
console.log("");

/*
  A bigger heap, because the e2e run asks this server to compile most of the
  application in one session.

  On 2026-09-01 a full Phase 3 run died partway through: every remaining test
  failed identically at `page.goto("/login")` with "Target page, context or
  browser has been closed", and nothing was listening on 3100 afterwards — the
  port the suite used at the time. 125
  failures, one cause. `next dev` compiles each route on first request and holds
  the result, and ninety-odd routes plus a large generated Prisma client is more
  than the default heap.

  The repo already sets `--max-old-space-size=7168` for `pnpm typecheck` for the
  same reason, so this is the established shape rather than a new idea.
*/
const NODE_OPTIONS = [process.env.NODE_OPTIONS, "--max-old-space-size=8192"]
  .filter(Boolean)
  .join(" ");

const child = spawn("npx", ["next", "dev", "-p", port], {
  env: { ...process.env, ...loaded, NODE_OPTIONS },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
