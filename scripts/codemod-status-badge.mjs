/**
 * Point the school module's status badges at the marked wrapper.
 *
 * Rewrites IMPORT LINES ONLY. No JSX is touched: `<Badge tone="success">`
 * keeps its exact shape and simply resolves to
 * `components/schools/common/status-badge.tsx` instead of the design system,
 * which is what adds the mark.
 *
 *   node scripts/codemod-status-badge.mjs          # dry run, prints the plan
 *   node scripts/codemod-status-badge.mjs --write  # apply
 *
 * Skipped deliberately:
 *   - the wrapper itself, or it would import from itself
 *   - files with no `<Badge tone=` (an untoned badge has no state to mark)
 *   - files already importing from the wrapper (idempotent)
 *   - portal screens: the reader there is a pupil or a parent, and those
 *     surfaces get their own pass rather than inheriting an admin decision
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const WRITE = process.argv.includes("--write");
const WRAPPER = "@/components/schools/common/status-badge";

const files = execSync(
  'grep -rl "<Badge tone=" --include=*.tsx components/schools app/schools',
  { encoding: "utf8" },
)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => !f.includes("status-badge.tsx"))
  .filter((f) => !f.includes("/portal/"));

let changed = 0;
const skipped = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");

  if (src.includes(WRAPPER)) {
    skipped.push([file, "already on the wrapper"]);
    continue;
  }

  // The import that supplies Badge. `[^}]*` spans newlines, so this handles
  // the multi-line form too — two files in this tree had one, and both were
  // collapsed to a single line with every sibling preserved. Verified by
  // reading the diff rather than trusting the count.
  const re = /import \{([^}]*)\} from "@corelithzw\/react";/;
  const m = src.match(re);
  if (!m) {
    skipped.push([file, "Badge does not come from @corelithzw/react"]);
    continue;
  }

  const names = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.includes("Badge")) {
    skipped.push([file, "Badge not in the design-system import"]);
    continue;
  }

  const rest = names.filter((n) => n !== "Badge");
  const badgeImport = `import { Badge } from "${WRAPPER}";`;

  let next;
  if (rest.length === 0) {
    // Badge was the only thing imported: swap the whole line.
    next = src.replace(re, badgeImport);
  } else {
    // Keep the siblings where they are, add a second import directly below so
    // the diff stays one line of context.
    next = src.replace(
      re,
      `import { ${rest.join(", ")} } from "@corelithzw/react";\n${badgeImport}`,
    );
  }

  if (next === src) {
    skipped.push([file, "no change produced"]);
    continue;
  }

  changed += 1;
  if (WRITE) writeFileSync(file, next);
}

console.log(`${WRITE ? "rewrote" : "would rewrite"} ${changed} file(s)`);
if (skipped.length) {
  console.log(`\nskipped ${skipped.length}:`);
  for (const [f, why] of skipped) console.log(`  ${f}\n    ${why}`);
}
if (!WRITE) console.log("\ndry run — pass --write to apply");
