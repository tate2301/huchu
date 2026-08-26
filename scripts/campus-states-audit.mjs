/**
 * Campus states audit.
 *
 * The canvas draws eight states — loading, empty, nothing-matched, nothing-left,
 * error, saving, denied, not-found — and `components/schools/common/states.tsx`
 * implements them. This walks every campus screen and reports which ones it
 * actually reaches for, so "does this screen handle its states?" is a command
 * rather than a reading exercise.
 *
 * Usage: node scripts/campus-states-audit.mjs [--gaps]
 *
 * A screen that renders a table or a list needs, at minimum:
 *   - TableRowsSkeleton  while the first page is in flight
 *   - LoadError          when the read fails
 *   - NothingYet         when the table is empty and unfiltered
 *   - NothingMatched     when filters emptied it
 *   - SaveError          when a write fails
 *
 * The check is textual and deliberately shallow — it catches a screen that
 * never imported an empty state, which is the failure that actually happens.
 * It cannot tell a well-placed skeleton from a badly placed one.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const DIRS = [path.join(ROOT, 'components', 'schools')]

/** What a screen must reach for, and how to spot it. */
const CHECKS = [
  ['skeleton', /TableRowsSkeleton|StatsSkeleton|CardsSkeleton|Skeleton\b/],
  ['loadError', /LoadError/],
  ['nothingYet', /NothingYet/],
  ['nothingMatched', /NothingMatched/],
  ['saveError', /SaveError|SavingOverlay/],
]

/** Only screens that actually list something need the full set. */
const LISTS = /DataTable|MobileList|\.map\(\(/

/**
 * Files that are not screens.
 *
 * Dialogs, sheets and form bodies report through their caller. A filter
 * control renders a dropdown of options, not a list of records — a skeleton
 * inside a `<Select>` would be furniture around furniture. Panels stay in,
 * because a panel that fetches its own rows owns its own states.
 */
const NOT_A_SCREEN =
  /-(dialog|dialogs|sheet|form|shell|context|state|data|views|tabs|caption|pickers|picker|filter|cell)\.tsx$|use-[a-z-]+\.tsx?$|common\/(class-filter|grade-picker|filter-select|table-controls)\.tsx$/

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const rows = []
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const file of walk(dir)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')
    if (NOT_A_SCREEN.test(rel)) continue
    const src = fs.readFileSync(file, 'utf8')
    if (!LISTS.test(src)) continue
    // A file that never fetches has no states to be in.
    if (!/useQuery|useSuspenseQuery/.test(src)) continue

    const has = Object.fromEntries(CHECKS.map(([name, re]) => [name, re.test(src)]))
    const missing = CHECKS.filter(([name]) => !has[name]).map(([name]) => name)
    rows.push({ rel, has, missing })
  }
}

const gapsOnly = process.argv.includes('--gaps')
const sorted = rows.sort((a, b) => b.missing.length - a.missing.length)

console.log('\n  SCREEN                                               SKEL  ERR  EMPTY  FILT  SAVE')
console.log('  ' + '─'.repeat(86))
for (const row of sorted) {
  if (gapsOnly && row.missing.length === 0) continue
  const mark = (ok) => (ok ? ' ok ' : ' -- ')
  const name = row.rel.replace('components/schools/', '')
  console.log(
    `${row.missing.length > 2 ? '!!' : row.missing.length ? ' !' : '  '} ${name.padEnd(50)}` +
      `${mark(row.has.skeleton)} ${mark(row.has.loadError)} ${mark(row.has.nothingYet)}` +
      ` ${mark(row.has.nothingMatched)} ${mark(row.has.saveError)}`,
  )
}

const clean = rows.filter((row) => row.missing.length === 0).length
console.log(
  `\n  ${rows.length} list screens · ${clean} complete · ${rows.length - clean} with gaps\n`,
)
