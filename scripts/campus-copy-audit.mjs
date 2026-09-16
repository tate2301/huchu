#!/usr/bin/env node
/**
 * Does the admin dashboard still say "pupil", and has "year group" stayed out?
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
 * The STUDENT PORTAL is excluded from the pupil rule on purpose. There the
 * reader is the child, and the fix for "your student record" is the second
 * person — "your record" — not a different noun.
 *
 * ## The second rule: "year group"
 *
 * A Zimbabwean secondary school says Form 1–6 and a primary says Grade 1–7.
 * "Year group" is a British import that is wrong for both, and it had reached
 * 400-odd strings before anything noticed. The word is derived per tenant now
 * — `useClassVocabulary` on a screen, `classVocabularyOf` where the classes
 * are already to hand, and plain "class" for copy with no class list to read.
 * A new screen typing the literal is how that quietly comes undone.
 *
 * This rule covers the portals too: the pupil reading their own timetable is
 * no more British than the registrar.
 *
 *   node scripts/campus-copy-audit.mjs          # summary
 *   node scripts/campus-copy-audit.mjs --gaps   # one line per finding
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const AREAS = ["components/schools", "app/schools"];
const PORTAL = /[/\\]portal[/\\]/;

const RULES = [
  {
    word: "student",
    test: (s) => /\b[Ss]tudents?\b/.test(s),
    skipPortal: true,
    clean: 'the admin dashboard says "pupil"',
    fail: (n, f) => `${n} strings still say "student", in ${f} files`,
  },
  {
    word: "year group",
    test: (s) => /\byear groups?\b/i.test(s),
    skipPortal: false,
    clean: '"year group" is gone',
    fail: (n, f) => `${n} strings still say "year group", in ${f} files`,
  },
];

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
    const inPortal = PORTAL.test(rel);
    const src = readFileSync(file, "utf8");

    src.split("\n").forEach((line, i) => {
      // A comment is not copy. The word appears in several describing what a
      // screen used to say, which is the opposite of a regression.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

      for (const m of line.matchAll(/"([^"\\\n]*)"/g)) {
        const inner = m[1];
        if (isIdentifier(inner)) continue;
        for (const rule of RULES) {
          if (rule.skipPortal && inPortal) continue;
          if (!rule.test(inner)) continue;
          findings.push({ rel, line: i + 1, text: inner, rule: rule.word });
        }
      }
    });
  }
}

if (process.argv.includes("--gaps")) {
  for (const f of findings) console.log(`${f.rel}:${f.line}  [${f.rule}]\n  "${f.text}"`);
  if (findings.length) console.log("");
}

for (const rule of RULES) {
  const mine = findings.filter((f) => f.rule === rule.word);
  const files = new Set(mine.map((f) => f.rel)).size;
  console.log(
    mine.length === 0 ? `copy: clean — ${rule.clean}` : `copy: ${rule.fail(mine.length, files)}`,
  );
}
process.exit(findings.length > 0 ? 1 : 0);
