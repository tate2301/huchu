#!/usr/bin/env node
/**
 * Does the admin dashboard still say "pupil"?
 *
 * Zimbabwean schools say pupil, and the product says so back. This guards the
 * copy pass from drifting: a new screen written with "Student" in a heading is
 * the thing that quietly undoes it, and nothing else in the repo would notice.
 *
 * ## Read a finding as a question
 *
 * IDENTIFIERS ARE NOT COPY and are deliberately invisible here. `studentNo`,
 * `studentId`, `/api/v2/schools/students`, `["schools","students"]` and the
 * `schools.students` grant are correct as they are — the word a school uses
 * and the word the database uses are allowed to differ, and renaming the
 * second buys nothing and costs an API surface.
 *
 * The STUDENT PORTAL is excluded on purpose. There the reader is the child,
 * and the fix for "your student record" is the second person — "your record" —
 * not a different noun. That is a separate copy rule.
 *
 *   node scripts/campus-copy-audit.mjs          # summary
 *   node scripts/campus-copy-audit.mjs --gaps   # one line per finding
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const AREAS = ["components/schools", "app/schools"];
const EXCLUDE = /[/\\]portal[/\\]/;

function isIdentifier(s) {
  return (
    s.startsWith("/") ||
    /^[a-z][a-zA-Z]*$/.test(s) ||
    /^[a-z][a-z0-9.-]*$/.test(s) ||
    /student(No|Id|s?\.)/.test(s) ||
    /\.(tsx?|json|css)$/.test(s) ||
    /^@\//.test(s)
  );
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const findings = [];

for (const area of AREAS) {
  for (const file of walk(join(ROOT, area))) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (EXCLUDE.test(rel)) continue;

    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/"([^"\\\n]*)"/g)) {
        const inner = m[1];
        if (!/\b[Ss]tudents?\b/.test(inner)) continue;
        if (isIdentifier(inner)) continue;
        findings.push({ rel, line: i + 1, text: inner });
      }
    });
  }
}

if (process.argv.includes("--gaps")) {
  for (const f of findings) console.log(`${f.rel}:${f.line}\n  "${f.text}"`);
  if (findings.length) console.log("");
}

const files = new Set(findings.map((f) => f.rel)).size;
console.log(
  findings.length === 0
    ? 'copy: clean — the admin dashboard says "pupil"'
    : `copy: ${findings.length} strings still say "student", in ${files} files`,
);
process.exit(findings.length > 0 ? 1 : 0);
