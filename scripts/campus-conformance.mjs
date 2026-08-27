/**
 * Campus canvas conformance report.
 *
 * The canvas in `design/campus/` ships a machine-readable spec per screen:
 * `checklist/<Screen>.json` lists every filter, column, card, stat, band chip
 * and button drawn on that artboard, plus `allCopy` — every string on it.
 *
 * This walks that spec against the implementation and prints what is missing,
 * so "does this match the design?" is a command rather than an opinion.
 *
 * Usage:
 *   node scripts/campus-conformance.mjs            # every mapped screen
 *   node scripts/campus-conformance.mjs Fees       # one screen
 *   node scripts/campus-conformance.mjs --missing  # only unmapped/absent
 *
 * A screen is mapped to the route that renders it and the components that
 * route pulls in. Coverage is the share of the canvas's own copy that appears
 * somewhere in those files — crude, deliberately: it catches a column nobody
 * implemented and a heading somebody reworded, which is most of the drift.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const CHECKLIST = path.join(ROOT, 'design', 'campus', 'checklist')

/**
 * Canvas screen -> the route that should render it.
 *
 * `null` means the canvas draws it but nothing is expected to (states, the
 * foundation sheet, the as-built comparisons). Anything else is a promise:
 * that route exists and shows that screen.
 */
const SCREENS = {
  // Office
  Overview: '/schools',
  OverviewAsBuilt: null,
  Attendance: '/schools/attendance',
  AttendanceFollowUp: '/schools/attendance/follow-up',
  Notices: '/schools/notices',
  Documents: '/schools/documents',
  Reports: '/schools/reports',
  ReportsArrears: '/schools/finance/arrears',
  Meetings: '/schools/meetings',
  Timetable: '/schools/timetable',
  Homework: '/schools/homework',
  Goals: '/schools/goals',

  // Records
  Students: '/schools/students',
  StudentsClass: '/schools/students/class/[classId]',
  StudentRecord: '/schools/students/[id]',
  StudentRollUp: '/schools/students/roll-up',
  Admissions: '/schools/admissions',
  Imports: '/schools/imports',
  Guardians: '/schools/guardians',
  GuardianRecord: '/schools/guardians/[id]',
  Teachers: '/schools/teachers',
  TeacherRecord: '/schools/teachers/[id]',
  Identity: '/management/master-data/schools/identity',

  // Academics
  Academics: '/management/master-data/schools/years',
  Classes: '/management/master-data/schools/classes',
  ClassRecord: '/management/master-data/schools/classes/[id]',
  Subjects: '/management/master-data/schools/subjects',
  SubjectRecord: '/management/master-data/schools/subjects/[id]',
  Syllabus: '/schools/academics/syllabus',

  // Results
  Results: '/schools/results',
  ResultsClass: '/schools/results/class/[classId]',
  ResultsModeration: '/schools/results/moderation',
  ResultsPublish: '/schools/results/publish',

  // Fees
  Fees: '/schools/finance',
  FeesClass: '/schools/finance/class/[classId]',
  LedgerInvoices: '/schools/finance/ledger',
  LedgerReceipts: '/schools/finance/ledger',
  LedgerCredits: '/schools/finance/ledger',
  LedgerRefunds: '/schools/finance/ledger',
  LedgerWaivers: '/schools/finance/ledger',
  LedgerStructures: '/schools/finance/ledger',
  FeeBulkGenerate: '/schools/finance/ledger',
  FeeDialogs: '/schools/finance/ledger',

  // Services
  Boarding: '/schools/boarding/allocations',
  BoardingHostel: '/schools/boarding/hostels',
  BoardingWelfare: '/schools/boarding/welfare',
  Library: '/schools/library',
  LibraryOut: '/schools/library/loans',
  Transport: '/schools/transport',
  TransportRegister: '/schools/transport',

  // States and foundation — drawn, not routed.
  Main: null,
  StateLoading: null,
  StateEmpty: null,
  StateError: null,
  StateDenied: null,
  StateNotFound: null,
  StateOffline: null,
  StateSaving: null,
  StateDialog: null,
  AccessBlocked: '/access-blocked',
  OfflinePage: '/offline',
  ClaimAccount: '/schools/portal/claim',
}

/** Strings that carry no design intent — sample data, numbers, glyphs. */
const NOISE =
  /^(?:[\d\s.,%/:+-]+|[A-Z]{2,3}|Form \d[A-Z]?|Term \d|USD|—|·|✓|&\w+;|\d+d|\d+%)$/

/**
 * The canvas is drawn over a specimen school — Chishawasha High, Rudo Makoni,
 * pupil CHS-1219 — and every artboard is populated with its records so the
 * shapes can be judged at a glance. None of that is copy a screen implements:
 * a real page reads those names out of the database, and a page that DID carry
 * "Tanaka Mutasa" in its source would be a bug.
 *
 * The same is true of anything the screen works out at runtime — "21 of 32",
 * "74% of the slots taken", "$1,240.00". A count in the checklist is the
 * specimen's count, not a string to match.
 *
 * Scoring these against source made the report demand the impossible: a third
 * of the "missing copy" could only be satisfied by hardcoding demo data into
 * production. What is left after this filter is the copy a screen genuinely
 * owns — its labels, headings, empty states, button verbs — and that is what
 * the coverage number now means.
 */
const SPECIMEN = [
  /\bCHS-\d+/i, // pupil numbers
  /\b(?:GRD|EMP|INV|RCT|REF|WVR)-\d+/i, // the specimen's record numbers
  /@example\.(?:com|co\.zw)/i, // specimen email addresses
  /\b0\d{2}\s?\d{3}\s?\d{4}\b/, // phone numbers
  /^\d{1,2}:\d{2}\s*[–-]/, // appointment slots
  /\b(?:Mrs|Mr|Ms|Miss)\.?\s+[A-Z]\.?\s*[A-Z][a-z]+/, // "Mrs P. Nyathi"
  /^[A-Z][a-z]+,\s+[A-Z][a-z]+$/, // "Chikwanda, Rutendo"
  /^[A-Z]\.\s*[A-Z][a-z]+$/, // "L. Gwenzi" — a staff initial
  /^[A-Z][a-z]+ [A-Z][a-z]+$/, // "Chiedza Ncube" — the specimen roster
  /^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/, // "21 Aug"
  /\bForm \d[A-Z]\b/, // a specific stream
  /^\$?[\d,]+\.\d{2}$/, // money literals
]

/** Values a screen computes from data it has just fetched. */
const DERIVED = [
  /^\d[\d,]*$/,
  /^\d+%/,
  /\b\d+ of \d+\b/,
  /\b\d+ (?:slots?|booked|free|in|out|late|marked|pupils?|students?|beds?|rooms?|days?)\b/i,
  /·.*\d/,
  /^(?:Term|Week) \d/,
  /\b20\d\d\b/,
]

const isSpecimen = (s) =>
  SPECIMEN.some((r) => r.test(s)) || DERIVED.some((r) => r.test(s))

const isNoise = (s) =>
  !s || s.length < 3 || s.length > 60 || NOISE.test(s.trim()) || isSpecimen(s)

function readChecklist(name) {
  const file = path.join(CHECKLIST, `${name}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** Decode the HTML entities the canvas emits, so copy compares like for like. */
const decode = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&middot;/g, '·')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&#10003;/g, '✓')
    .trim()

/** The page file for a route, if it exists. */
function pageFile(route) {
  if (!route) return null
  const p = path.join(ROOT, 'app', route.replace(/^\//, ''), 'page.tsx')
  return fs.existsSync(p) ? p : null
}

/**
 * Follow a route whose page is nothing but a `redirect()`.
 *
 * Several campus paths are aliases — `/schools/academics/syllabus` sends you to
 * the teacher portal, the old academic-setup paths send you to master data. A
 * report that scored the stub would say 0% for a screen that is fully built one
 * hop away, so the hop is taken here and noted in the result.
 */
function resolveRoute(route, hops = 3) {
  let current = route
  const trail = []
  for (let i = 0; i < hops; i += 1) {
    const file = pageFile(current)
    if (!file) return { route: current, trail }
    const src = fs.readFileSync(file, 'utf8')
    // A redirect stub is a file whose only real statement is the redirect.
    const target = src.match(/redirect\(\s*["'`]([^"'`]+)["'`]\s*\)/)
    const isStub =
      target && !/export default async/.test(src) && src.split('\n').length < 20
    if (!isStub) return { route: current, trail }
    trail.push(current)
    current = target[1].split('?')[0]
  }
  return { route: current, trail }
}

/**
 * Every local file a page pulls in, one level deep plus the components those
 * components import — enough to reach the screen's own content component and
 * its dialogs without walking the whole tree.
 */
function sourceFor(route, depth = 2) {
  const entry = pageFile(route)
  if (!entry) return { files: [], text: '' }
  const seen = new Set()
  const queue = [[entry, 0]]
  const files = []
  while (queue.length) {
    const [file, d] = queue.shift()
    if (seen.has(file) || d > depth) continue
    seen.add(file)
    files.push(file)
    let src
    try {
      src = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    // Both import shapes. A screen split across sibling files — the content
    // component beside its dialogs and its column definitions — imports them
    // as './boarding-views', and following only '@/' made every one of those
    // files invisible. The report then scored a screen as missing structure
    // that was implemented one file away.
    for (const m of src.matchAll(/from\s+["'](@\/[^"']+|\.\.?\/[^"']+)["']/g)) {
      const spec = m[1]
      const base = spec.startsWith('@/')
        ? path.join(ROOT, spec.slice(2))
        : path.resolve(path.dirname(file), spec)
      for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
        const cand = base + ext
        if (fs.existsSync(cand)) queue.push([cand, d + 1])
      }
    }
  }
  const text = files
    .map((f) => {
      try {
        return fs.readFileSync(f, 'utf8')
      } catch {
        return ''
      }
    })
    .join('\n')
  return { files, text }
}

function analyse(name) {
  const declared = SCREENS[name]
  const spec = readChecklist(name)
  if (!spec) return { name, status: 'no-checklist' }
  if (declared === null) return { name, status: 'not-routed' }

  const { route, trail } = resolveRoute(declared)
  const file = pageFile(route)
  if (!file) return { name, status: 'no-page', route: declared }

  const { files, text } = sourceFor(route)
  const haystack = text.toLowerCase()

  const want = [
    ...(spec.columns ?? []).map((v) => ['column', v]),
    ...(spec.filters ?? []).map((v) => ['filter', v]),
    ...(spec.cards ?? []).map((v) => ['card', v]),
    ...(spec.stats ?? []).map((v) => ['stat', v]),
    ...(spec.bandChips ?? []).map((v) => ['chip', v]),
    ...(spec.buttons ?? []).map((v) => ['button', v]),
  ]
    .map(([kind, v]) => [kind, decode(v)])
    .filter(([, v]) => !isNoise(v))

  const copy = [...new Set((spec.allCopy ?? []).map(decode))].filter(
    (v) => !isNoise(v),
  )

  const missing = want.filter(([, v]) => !haystack.includes(v.toLowerCase()))
  const missingCopy = copy.filter((v) => !haystack.includes(v.toLowerCase()))

  return {
    name,
    status: 'ok',
    route,
    declared,
    trail,
    files: files.length,
    want: want.length,
    missing,
    copyTotal: copy.length,
    copyMissing: missingCopy.length,
    missingCopy: missingCopy.slice(0, 12),
    coverage: copy.length
      ? Math.round(((copy.length - missingCopy.length) / copy.length) * 100)
      : 100,
  }
}

/* ── report ─────────────────────────────────────────────────────────── */

const args = process.argv.slice(2)
const onlyMissing = args.includes('--missing')
const picked = args.filter((a) => !a.startsWith('--'))

const names = picked.length ? picked : Object.keys(SCREENS)
const results = names.map(analyse)

const routed = results.filter((r) => r.status === 'ok')
const noPage = results.filter((r) => r.status === 'no-page')

if (!onlyMissing) {
  console.log('\n  SCREEN                ROUTE                                    COV   MISSING')
  console.log('  ' + '─'.repeat(88))
  for (const r of routed.sort((a, b) => a.coverage - b.coverage)) {
    const bar = r.coverage >= 80 ? '  ' : r.coverage >= 50 ? ' !' : '!!'
    console.log(
      `${bar} ${r.name.padEnd(20)} ${String(r.route).padEnd(40)} ${String(r.coverage + '%').padStart(4)}   ${r.missing.length} of ${r.want}`,
    )
  }
}

if (noPage.length) {
  console.log('\n  NO PAGE — the canvas draws it, nothing renders it')
  console.log('  ' + '─'.repeat(88))
  for (const r of noPage) console.log(`     ${r.name.padEnd(20)} ${r.route}`)
}

if (picked.length) {
  for (const r of routed) {
    console.log(`\n  ── ${r.name}  (${r.route})`)
    console.log(`     files scanned: ${r.files}   copy coverage: ${r.coverage}%`)
    if (r.missing.length) {
      console.log('\n     MISSING STRUCTURE')
      for (const [kind, v] of r.missing) console.log(`       ${kind.padEnd(7)} ${v}`)
    }
    if (r.missingCopy.length) {
      console.log('\n     MISSING COPY (first 12)')
      for (const v of r.missingCopy) console.log(`       ${v}`)
    }
  }
}

const avg = routed.length
  ? Math.round(routed.reduce((s, r) => s + r.coverage, 0) / routed.length)
  : 0
console.log(
  `\n  ${routed.length} screens routed · ${noPage.length} without a page · mean copy coverage ${avg}%\n`,
)
