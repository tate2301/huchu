#!/usr/bin/env node
/**
 * Fail when a fork change touches a core file.
 *
 *   FORK_FLAVOUR=milling node scripts/fork/boundary.mjs <base-ref>
 *
 * Compares <base-ref>...HEAD (the PR's merge base) and lists every changed
 * path outside the allowlist in `boundary-lib.mjs`. Run by
 * `.github/workflows/fork-checks.yml` on every fork PR except the sync PRs,
 * which carry core changes by design.
 */
import { execFileSync } from "node:child_process";

import { allowedPaths, findViolations } from "./boundary-lib.mjs";

const flavour = process.env.FORK_FLAVOUR;
const base = process.argv[2];
if (!flavour || !base) {
  console.error("Usage: FORK_FLAVOUR=<flavour> node scripts/fork/boundary.mjs <base-ref>");
  process.exit(2);
}

const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n");
const violations = findViolations(changed, flavour);

if (violations.length === 0) {
  console.log(`✓ Every change is inside the ${flavour} fork boundary.`);
  process.exit(0);
}

console.error(`✗ ${violations.length} file(s) outside the ${flavour} fork boundary:\n`);
for (const path of violations) console.error(`    ${path}`);
console.error("\nA fork may only change:\n");
for (const { label } of allowedPaths(flavour)) console.error(`    ${label}`);
console.error(
  "\nMake the change in tate2301/huchu instead; it reaches this fork with the next core sync." +
    "\nIn an emergency, a maintainer can add the `core-hotfix-approved` label (see FORK.md).",
);
process.exit(1);
