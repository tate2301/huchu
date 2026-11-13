/**
 * `prisma generate`, skipped when nothing it reads has changed.
 *
 * Generating the client for this schema (395 models) writes a 101 MB
 * `index.d.ts` and takes four minutes of one core — on Vercel's 2-core build
 * machine it is the second-longest step of the deploy after the compile. The
 * output is a pure function of the schema and the Prisma version, and Vercel
 * restores `node_modules` from the previous build, so a deploy that did not
 * touch the schema already has the client it needs sitting on disk.
 *
 * The key is the schema, the Prisma config and both Prisma versions hashed
 * together, written next to the generated client after a successful run. A
 * different key, a missing marker or a missing client all mean "generate" —
 * there is no path on which a stale client is kept.
 *
 *   node scripts/prisma-generate-if-changed.mjs          # the build
 *   node scripts/prisma-generate-if-changed.mjs --force  # same as `prisma generate`
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(dirname(new URL(import.meta.url).pathname), "..");

// `@prisma/client` resolves to `<node_modules>/@prisma/client/default.js`, and
// the generated client lives beside it at `<node_modules>/.prisma/client` —
// the same path `default.js` itself requires.
const clientDir = join(dirname(require.resolve("@prisma/client")), "..", "..", ".prisma", "client");
const marker = join(clientDir, ".generated-from");

// Every file in the schema folder: core.prisma and, in a fork, its own file.
const schemaDir = join(root, "prisma", "schema");
const hash = createHash("sha256");
for (const name of readdirSync(schemaDir).filter((file) => file.endsWith(".prisma")).sort()) {
  hash.update(name).update(readFileSync(join(schemaDir, name)));
}
const key = hash
  .update(readFileSync(join(root, "prisma.config.ts")))
  .update(require("prisma/package.json").version)
  .update(require("@prisma/client/package.json").version)
  .digest("hex");

const force = process.argv.includes("--force");
const current =
  existsSync(marker) && existsSync(join(clientDir, "index.js")) && readFileSync(marker, "utf8") === key;

if (current && !force) {
  console.log("Prisma Client is up to date with prisma/schema; skipping generate.");
  process.exit(0);
}

const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "generate"], {
  cwd: root,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

writeFileSync(marker, key);
