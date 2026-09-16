#!/usr/bin/env node
/**
 * Student → Pupil, in COPY ONLY.
 *
 * Zimbabwean schools say "pupil". The codebase already half-agrees with itself
 * — "Pupil ID card" shipped next to "New student" — so this is as much a
 * consistency fix as a translation.
 *
 * ## What it will not touch, and why that matters more than what it will
 *
 * `studentNo`, `studentId`, `student.firstName`, `/api/v2/schools/students`,
 * `["schools", "students"]`, the `schools.students` grant, Prisma models and
 * every route under `/schools/students` stay exactly as they are. Renaming an
 * identifier buys the reader nothing and costs an API surface; the word a
 * school uses and the word the database uses are allowed to differ.
 *
 * So this only rewrites the inside of a double-quoted string, and only when
 * the string looks like a sentence rather than a key: it must contain a space
 * or start with a capital, and must not look like a path, a dotted grant, a
 * camelCase field or a lone lowercase token.
 *
 *   node scripts/codemod-pupil.mjs --dry     # print the diff it would make
 *   node scripts/codemod-pupil.mjs           # write it
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry");

/**
 * The admin dashboard. The student portal is deliberately excluded: there the
 * reader IS the child, and the fix for "your student record" is the second
 * person ("your record"), not a different noun for them. That is a copy pass
 * with a different rule and it gets its own round.
 */
const AREAS = ["components/schools", "app/schools"];
const EXCLUDE = /[/\\]portal[/\\]/;

/** A string that is a key, a path or a field — never copy. */
function isIdentifier(s) {
  return (
    s.startsWith("/") ||
    /^[a-z][a-zA-Z]*$/.test(s) ||          // camelCase / lone lowercase token
    /^[a-z][a-z0-9.-]*$/.test(s) ||        // dotted grant, kebab id
    /student(No|Id|s?\.)/.test(s) ||       // field access
    /\.(tsx?|json|css)$/.test(s) ||
    /^@\//.test(s)
  );
}

/** Replace the word only, preserving case and plural. */
function swap(text) {
  return text
    .replace(/\bStudents\b/g, "Pupils")
    .replace(/\bStudent\b/g, "Pupil")
    .replace(/\bstudents\b/g, "pupils")
    .replace(/\bstudent\b/g, "pupil");
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

let filesChanged = 0;
let stringsChanged = 0;
const preview = [];

for (const area of AREAS) {
  for (const file of walk(join(ROOT, area))) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (EXCLUDE.test(rel)) continue;

    const src = readFileSync(file, "utf8");
    let touched = 0;

    // Only ever inside a double-quoted string literal.
    const next = src.replace(/"([^"\\\n]*)"/g, (whole, inner) => {
      if (!/\b[Ss]tudents?\b/.test(inner)) return whole;
      if (isIdentifier(inner)) return whole;
      const swapped = swap(inner);
      if (swapped === inner) return whole;
      touched += 1;
      preview.push(`${rel}\n  - "${inner}"\n  + "${swapped}"`);
      return `"${swapped}"`;
    });

    if (touched > 0) {
      filesChanged += 1;
      stringsChanged += touched;
      if (!DRY) writeFileSync(file, next, "utf8");
    }
  }
}

if (DRY) {
  for (const p of preview) console.log(p);
  console.log("");
}
console.log(
  `${DRY ? "would change" : "changed"}: ${stringsChanged} strings in ${filesChanged} files`,
);
