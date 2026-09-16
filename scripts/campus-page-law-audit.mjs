#!/usr/bin/env node
/**
 * Does every admin screen obey the page law?
 *
 * The law is `docs/design-system/09-campus-canvas-law.md`. Four of its rules
 * are mechanically checkable, and this checks those four:
 *
 *   band     §2  no PageBand on a working page (overviews are exempt)
 *   card     §5  no <Card> wrapped around the screen's primary table
 *   subject  §1  one table per screen — a second is a second subject
 *   rows     §4  tabs and filters are two rows, which TableControls now
 *                guarantees, so this only flags screens that hand-roll it
 *
 * Read a finding as a QUESTION, not a defect. The exemptions below are real:
 * an overview dashboard SHOULD carry a band, and a screen with a genuine
 * parent/child pair of tables may have earned its second one. Check the file
 * before "fixing" it, and add it here with a reason rather than making the
 * number go down by hand.
 *
 *   node scripts/campus-page-law-audit.mjs           # summary
 *   node scripts/campus-page-law-audit.mjs --gaps    # one line per finding
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const AREAS = ["components/schools", "components/crm", "components/gold"];

/**
 * Screens that summarise for a living. A band is correct here — it is the
 * whole job of the page, and there is no table under it to disagree with.
 */
const OVERVIEWS = new Set([
  "components/schools/schools-dashboard-content.tsx",
  "components/schools/common/schools-page.tsx",
  "components/schools/common/page-band.tsx",
  "components/schools/reports/schools-reports-enhanced-content.tsx",
  "components/schools/fees/fees-grade-picker.tsx",
]);

/**
 * Record pages whose band carries IDENTITY, not a summary.
 *
 * "Class of 2019 · Consent: may contact" describes the one former pupil the
 * page is about. There is no table beneath it and no filter above it, so §2 —
 * which is about a tally sitting over rows it does not govern — has nothing to
 * say here. Deleting these would remove a record page's header, not a summary
 * band.
 *
 * Add to this list only after reading the band: if a chip counts anything, it
 * is a summary and belongs in the findings, however few rows it counts.
 */
const IDENTITY_BANDS = new Set([
  "components/schools/leavers/alumnus-record-page.tsx",
]);

/** Not screens: dialogs, panels, filter controls, cells, shared primitives. */
const NOT_A_SCREEN = /(-dialog|-sheet|-form|-panel|-picker|-cell|-filter|-tab|-switch|states|table-controls)\.tsx$/;

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
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const findings = [];
let screens = 0;

for (const area of AREAS) {
  for (const file of walk(join(ROOT, area))) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (NOT_A_SCREEN.test(rel)) continue;

    const src = readFileSync(file, "utf8");
    // A screen is something that renders a page title or a control row.
    const isScreen = /<PageChrome|<TableControls|<RecordListShell/.test(src);
    if (!isScreen) continue;
    screens += 1;

    const add = (rule, detail) => findings.push({ rel, rule, detail });

    // §2 bans a SUMMARY band: a tally of the rows below, above filters that do
    // not govern it. A RECORD page's band is a different thing wearing the same
    // component — "Class of 2019", "Consent: may contact" are facts about the
    // one person the page is about, and there is nothing underneath for them to
    // disagree with.
    //
    // Judged by hand, not by heuristic. Two automatic tells were tried and both
    // were wrong: "has no DataTable" exempted `pastoral-content.tsx`, whose band
    // counts "You may read: 7" over a `.map()`ed list; and "chips read off a
    // counts/summary object" exempted `fees-grade-picker.tsx`, whose band sums
    // Billed and Collected off `totals`. There are only ever a handful of these
    // — classify them here, with the reason, rather than tuning a regex against
    // eight files until it happens to agree.
    if (/<PageBand\b/.test(src) && !OVERVIEWS.has(rel) && !IDENTITY_BANDS.has(rel)) {
      add("band", "PageBand on a working page — §2, summaries are for overviews");
    }

    // A card wrapping the primary table. `<Card flush>` around a DataTable or
    // a *Panel is the shape the law names; a card elsewhere on the page (a
    // form, a tile) is fine and is not matched.
    if (/<Card[^>]*flush/.test(src) && /<DataTable|<RecordTable|Panel\s/.test(src)) {
      add("card", "<Card flush> around the primary table — §5");
    }

    const tables = (src.match(/<DataTable\b|<RecordTable\b/g) || []).length;
    if (tables > 1) {
      add("subject", `${tables} tables on one screen — §1, is the second one a second subject?`);
    }
  }
}

const byRule = {};
for (const f of findings) (byRule[f.rule] ||= []).push(f);

if (process.argv.includes("--gaps")) {
  for (const rule of Object.keys(byRule).sort()) {
    for (const f of byRule[rule]) console.log(`${rule.padEnd(8)} ${f.rel}\n         ${f.detail}`);
  }
  console.log("");
}

const clean = screens - new Set(findings.map((f) => f.rel)).size;
console.log(`page law: ${clean}/${screens} screens clean, ${findings.length} findings`);
for (const rule of Object.keys(byRule).sort()) {
  console.log(`  ${rule.padEnd(8)} ${byRule[rule].length}`);
}
process.exit(findings.length > 0 ? 1 : 0);
