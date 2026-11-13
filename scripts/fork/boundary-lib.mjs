/**
 * The paths an industry fork may change.
 *
 * A fork (e.g. corelith-milling) adds its vertical inside these paths and
 * nowhere else, so every core release merges into it without conflicts. A
 * change the fork needs anywhere else is a core change: it goes to
 * tate2301/huchu as a PR, ships in a core release, and arrives in the fork
 * through the sync.
 *
 * The list is derived from the fork's flavour, so it lives in core and every
 * fork picks up changes to it through the same sync.
 */
import { assertFlavour } from "../release/release-lib.mjs";

export function allowedPaths(flavour) {
  assertFlavour(flavour);
  const f = flavour.replace(/-/g, "\\-");
  return [
    { pattern: /^FORK\.md$/, label: "FORK.md" },
    { pattern: /^extensions\/index\.ts$/, label: "extensions/index.ts" },
    { pattern: new RegExp(`^extensions/${f}/`), label: `extensions/${flavour}/**` },
    { pattern: new RegExp(`^lib/${f}/`), label: `lib/${flavour}/**` },
    { pattern: new RegExp(`^app/${f}/`), label: `app/${flavour}/**` },
    { pattern: new RegExp(`^app/api/${f}/`), label: `app/api/${flavour}/**` },
    { pattern: new RegExp(`^components/${f}/`), label: `components/${flavour}/**` },
    { pattern: new RegExp(`^prisma/schema/${f}\\.prisma$`), label: `prisma/schema/${flavour}.prisma` },
    {
      pattern: new RegExp(`^prisma/migrations/\\d{14}_${f}_[a-z0-9_]+/migration\\.sql$`),
      label: `prisma/migrations/<timestamp>_${flavour}_<name>/migration.sql`,
    },
    { pattern: new RegExp(`^docs/${f}/`), label: `docs/${flavour}/**` },
  ];
}

/** Changed paths that fall outside the fork's allowlist. */
export function findViolations(changedPaths, flavour) {
  const allowed = allowedPaths(flavour);
  return changedPaths
    .map((path) => path.trim())
    .filter(Boolean)
    .filter((path) => !allowed.some(({ pattern }) => pattern.test(path)));
}
