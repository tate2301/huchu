/**
 * Builds the "Campus Module" canvas — the Foundation sheet, the States sheet,
 * and every screen of the campus admin app.
 *
 * Writes .dc.html artboards plus canvas.json into ./module, which
 * seed-canvas.mjs then seeds into a copy of the design payload.
 *
 * The artboards extracted from the published canvas (Main, Overview, Students,
 * StudentRecord, Attendance, Results, Fees) are left on disk exactly as they
 * were and are only laid out here — nothing regenerates them.
 *
 * Run:  node design/campus/build-module.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as States from './screens/states.mjs'
import * as Office from './screens/office.mjs'
import * as Records from './screens/records.mjs'
import * as Academics from './screens/academics.mjs'
import * as Results from './screens/results.mjs'
import * as Fees from './screens/fees.mjs'
import * as Services from './screens/services.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'module')

/* The three portal artboards move to their own canvases. */
const RETIRED = ['TeacherRegister.dc.html', 'StudentPortal.dc.html', 'ParentPortal.dc.html']

const PAGES = [
  { id: 'foundation', name: 'Foundation' },
  { id: 'states', name: 'States' },
  { id: 'office', name: 'Office' },
  { id: 'records', name: 'Records' },
  { id: 'academics', name: 'Academics' },
  { id: 'results', name: 'Results' },
  { id: 'fees', name: 'Fees' },
  { id: 'services', name: 'Boarding and services' },
]

/** page → [file, title, render|null (null = kept from the published canvas), w, h] */
const LAYOUT = {
  foundation: [['Main.dc.html', 'Heading law — a page is named once', null, 1180, 1300]],
  states: [
    ['StateLoading.dc.html', 'Loading', States.StateLoading, 1600, 1000],
    ['StateEmpty.dc.html', 'Empty', States.StateEmpty, 1600, 1000],
    ['StateError.dc.html', 'Error', States.StateError, 1600, 1000],
    ['StateDenied.dc.html', 'Not your job — permission', States.StateDenied, 1600, 1000],
    ['StateNotFound.dc.html', 'Not found', States.StateNotFound, 1600, 1000],
    ['StateOffline.dc.html', 'Offline', States.StateOffline, 1600, 1000],
    ['StateSaving.dc.html', 'Saving, and what “Done” says', States.StateSaving, 1600, 1000],
    ['StateDialog.dc.html', 'Dialog anatomy', States.StateDialog, 1600, 1000],
    ['AccessBlocked.dc.html', 'Access blocked', States.AccessBlocked, 1100, 700],
    ['OfflinePage.dc.html', 'app/offline — as built and proposed', States.OfflinePage, 1100, 600],
    ['ClaimAccount.dc.html', 'Claim a portal account', States.ClaimAccount, 900, 700],
  ],
  office: [
    ['Overview.dc.html', 'School overview', Office.Overview, 1600, 1000],
    ['OverviewAsBuilt.dc.html', '/schools as it ships today', Office.OverviewAsBuilt, 1600, 1000],
    ['Attendance.dc.html', 'Attendance — the register board', Office.Attendance, 1600, 1000],
    ['Notices.dc.html', 'School notices', Office.Notices, 1600, 1000],
    ['Documents.dc.html', 'School documents', Office.Documents, 1600, 1000],
    ['Reports.dc.html', 'School reports — collections', Office.Reports, 1600, 1000],
    ['ReportsArrears.dc.html', 'School reports — arrears aging', Office.ReportsArrears, 1600, 1000],
    ['Meetings.dc.html', 'Parent meetings and the calendar', Office.Meetings, 1600, 1000],
    ['Timetable.dc.html', 'Timetable', Office.Timetable, 1600, 1000],
    ['Homework.dc.html', 'Homework oversight', Office.Homework, 1600, 1000],
    ['Goals.dc.html', 'Subject targets', Office.Goals, 1600, 1000],
  ],
  records: [
    ['Students.dc.html', 'All students', null, 1600, 1000],
    ['StudentsClass.dc.html', 'A year group’s roll', Records.StudentsClass, 1600, 1000],
    ['StudentRecord.dc.html', 'Student record — Tanaka Mutasa', null, 1600, 1000],
    ['StudentRollUp.dc.html', 'Roll up the year', Records.StudentRollUp, 1600, 1000],
    ['Admissions.dc.html', 'Admissions', Records.Admissions, 1600, 1000],
    ['Imports.dc.html', 'Import records', Records.Imports, 1600, 1000],
    ['Guardians.dc.html', 'Guardians', Records.Guardians, 1600, 1000],
    ['GuardianRecord.dc.html', 'Guardian record — Grace Mutasa', Records.GuardianRecord, 1600, 1000],
    ['Teachers.dc.html', 'Teachers', Records.Teachers, 1600, 1000],
    ['TeacherRecord.dc.html', 'Teacher record — Priscilla Nyathi', Records.TeacherRecord, 1600, 1000],
    ['Identity.dc.html', 'Identity and records', Records.Identity, 1600, 1000],
  ],
  academics: [
    ['Academics.dc.html', 'Years and terms', Academics.Academics, 1600, 1000],
    ['Classes.dc.html', 'Classes and streams', Academics.Classes, 1600, 1000],
    ['ClassRecord.dc.html', 'Class record — Form 2', Academics.ClassRecord, 1600, 1000],
    ['Subjects.dc.html', 'Subjects', Academics.Subjects, 1600, 1000],
    ['SubjectRecord.dc.html', 'Subject record — Mathematics', Academics.SubjectRecord, 1600, 1000],
    ['Syllabus.dc.html', 'Scheme of work', Academics.Syllabus, 1600, 1000],
  ],
  results: [
    ['Results.dc.html', 'Results overview', null, 1600, 1000],
    ['ResultsClass.dc.html', 'A year group’s mark sheets', Results.ResultsClass, 1600, 1000],
    ['ResultsModeration.dc.html', 'Moderation queue', Results.ResultsModeration, 1600, 1000],
    ['ResultsPublish.dc.html', 'Publishing', Results.ResultsPublish, 1600, 1000],
  ],
  fees: [
    ['Fees.dc.html', 'Fees by year group', null, 1600, 1000],
    ['FeesClass.dc.html', 'A year group’s invoices', Fees.FeesClass, 1600, 1000],
    ['LedgerInvoices.dc.html', 'Ledger — invoices', Fees.LedgerInvoices, 1600, 1000],
    ['LedgerReceipts.dc.html', 'Ledger — receipts', Fees.LedgerReceipts, 1600, 1000],
    ['LedgerCredits.dc.html', 'Ledger — credit on account', Fees.LedgerCredits, 1600, 1000],
    ['LedgerRefunds.dc.html', 'Ledger — refunds', Fees.LedgerRefunds, 1600, 1000],
    ['LedgerWaivers.dc.html', 'Ledger — waivers', Fees.LedgerWaivers, 1600, 1000],
    ['LedgerStructures.dc.html', 'Ledger — fee structures', Fees.LedgerStructures, 1600, 1000],
    ['FeeBulkGenerate.dc.html', 'Bulk generate invoices', Fees.FeeBulkGenerate, 1600, 1000],
    ['FeeDialogs.dc.html', 'The fee dialogs', Fees.FeeDialogs, 1600, 1000],
  ],
  services: [
    ['Boarding.dc.html', 'Bed board', Services.Boarding, 1600, 1000],
    ['BoardingHostel.dc.html', 'Hostel record — Chishawasha House', Services.BoardingHostel, 1600, 1000],
    ['BoardingWelfare.dc.html', 'Health and welfare', Services.BoardingWelfare, 1600, 1000],
    ['Library.dc.html', 'Library — shelves', Services.Library, 1600, 1000],
    ['LibraryOut.dc.html', 'Library — what is out', Services.LibraryOut, 1600, 1000],
    ['Transport.dc.html', 'Transport — routes', Services.Transport, 1600, 1000],
    ['TransportRegister.dc.html', 'Transport — this morning', Services.TransportRegister, 1600, 1000],
  ],
}

const ANNOTATIONS = {
  foundation: [
    {
      id: 'foundation-intro',
      x: 1280,
      y: 0,
      w: 420,
      text: 'START HERE\n\nThis sheet is the rule the other pages are held to.\n\nThe short version: the module screens name a page in the app bar, again in the rail, and a third time in the page band — then spend a caption line explaining a word nobody misread.\n\nOne name, in the app bar. The band takes the state instead. The caption survives only where it carries something that changes.',
    },
    {
      id: 'foundation-precedent',
      x: 1280,
      y: 380,
      w: 420,
      text: 'NOT AN INVENTION\n\nThe teacher portal already does this. Its shell has a comment saying the old category line "repeated what the rail already says", and it now spends the caption on the term and the class in view.\n\nPageIntro already throws away its `purpose` and `nextStep` props — the caption text is being computed and discarded today.\n\nSo this is less a redesign than finishing something already started in two places.',
    },
    {
      id: 'foundation-carry',
      x: 1280,
      y: 800,
      w: 420,
      text: 'WHAT CARRIES ACROSS THIS CANVAS\n\nEvery admin artboard here is emitted from one shared shell — the same 280px sidebar, 48px app bar, 200px rail and page band, byte for byte, sliced out of the original Overview artboard.\n\nThe rail is lib/navigation.ts verbatim, including its voice: "Roll up the year", "Bed board", "Fees by year group". Nothing is renamed to suit the drawing.\n\nSo when the rule changes it changes in one place, and forty screens cannot drift apart the way forty hand-drawn lookalikes would.',
    },
  ],
  states: [
    {
      id: 'states-band',
      x: 0,
      y: -320,
      w: 760,
      text: "STATES — the law, once\n\nCampus has no error.tsx, no not-found.tsx and no loading.tsx anywhere. Repo-wide there are three such files and all three are in the platform-admin portal. There is no global-error.tsx either.\n\nSo a 404 on a student record is Next's default black-on-white page, an uncaught render error is unstyled, and every list \"loads\" by swapping a sentence into an empty table.\n\nEach artboard is labelled AS BUILT or PROPOSED. The rules stated here are what every other page on this canvas follows, so a state never has to be invented twice.",
    },
    {
      id: 'states-entry',
      x: 8020,
      y: -320,
      w: 480,
      text: 'THE THREE SHARED ENTRY SCREENS\n\nAccess blocked is reproduced verbatim — including that it is the only campus-adjacent screen written in US product English ("organization", "Retry Access") while every portal screen is British sentence-case prose. Worth settling which voice wins.\n\napp/offline is drawn as it ships, which is a spinner and nothing else, beside what it should say.\n\n/c/[token] is the portal invite. Its already-claimed state is the one nobody has drawn, and it is the one a parent hits.',
    },
  ],
  office: [
    {
      id: 'office-band',
      x: 0,
      y: -380,
      w: 760,
      text: 'OFFICE — the ten screens a head opens across a term\n\nOverview, the register board, notices, documents, the two fee reports, parent meetings, the timetable, homework and subject targets. Copy is the source verbatim; the shell is the same 280px sidebar, 48px app bar and 200px rail as every other artboard on this canvas.\n\nThe first two are the same route. "School overview" is the screen a deputy head wants at 07:30 — what is missing a register, what is waiting on somebody, what is owed. "/schools as it ships today" is what is actually there: a fourteen-row key/value table with a search box, identical for all six personas.\n\nWhere a screen is read-only and obviously wants a verb — homework, subject targets, attendance, arrears — the artboard draws it and the panel beside it says it is a proposal, rather than letting a button smuggle itself in as fact.',
    },
    {
      id: 'office-filters',
      x: 0,
      y: 1060,
      w: 700,
      text: 'FILTERING, THE SAME WAY EVERYWHERE\n\nEvery screen here carries the module\'s own FilterBar: labelled dropdowns whose closed state names what they filter, with an allLabel — "Every year group", "Every subject", "Anything set" — standing in for no filter.\n\nFour of these screens have no filters at all today. Reports renders whatever the API returns with no term or year-group control; the Documents "Class Lists" and "Attendance Registers" tabs keep a search state and never render the box, so they print all 842 pupils; Notices lists every notice ever sent; attendance filters only by date.\n\nThat is why the year-group filter appears on all ten. A school is organised by year group, and a screen that cannot narrow to one is a screen somebody exports to a spreadsheet.',
    },
    {
      id: 'office-meetings',
      x: 12040,
      y: 1060,
      w: 440,
      text: 'Parent meetings carries the best sentence in the module, on the release dialog: "Nobody is told automatically — ring them."\n\nIt is honest, and it is a gap. The school has a notices system that reaches every parent\'s portal in one send, and a cancelled meeting does not use it.\n\nThe month grid beside the evenings is new. The term is the window the office thinks in, but "which nights are open" is a calendar question and the list of teachers cannot answer it.',
    },
  ],
  records: [
    {
      id: 'records-band',
      x: 0,
      y: -300,
      w: 720,
      text: 'RECORDS — the people the school keeps\n\nEleven screens: the roll, one pupil, the roll-up, admissions, imports, guardians and teachers with their record pages, and the identity settings.\n\nTwo things run through all of them. There is no way to add a pupil, a guardian, a stream, or a teacher-portal invite from where you would look for it. And every record type has a Files tab with no upload control anywhere in the module.',
    },
    {
      id: 'records-imports',
      x: 8600,
      y: 1060,
      w: 440,
      text: 'Import records is the best-designed screen in the module and worth reading as the standard: it explains the order records must be loaded in and why, it refuses to guess silently ("A wrong guess waved through is worse than no guess"), it shows what it would do before doing it, and it is the only thing in campus that can be undone.',
    },
    {
      id: 'records-identity',
      x: 17200,
      y: -300,
      w: 440,
      text: "Identity and records is the ONLY route in campus with a visible role gate — controls disable and the save button is not rendered below SCHOOL_ADMIN.\n\nEverywhere else a bursar sees a head's buttons and learns the answer as a red alert after clicking. This screen already knows how to do it right; nothing copies it. That is what the Denied artboard on the States page is arguing.",
    },
  ],
  academics: [
    {
      id: 'academics-band',
      x: 0,
      y: -300,
      w: 700,
      text: 'ACADEMICS — the ladder everything hangs off\n\nYears, terms, the calendar, classes, streams, subjects, and the scheme of work.\n\nThree gaps sit in here and each breaks a screen further down: no periods UI (the timetable tells you to come here for it), no way to create a stream (every roll and mark sheet filters by one), and three separate subject lists with two different create dialogs.',
    },
  ],
  results: [
    {
      id: 'results-band',
      x: 0,
      y: -300,
      w: 760,
      text: 'RESULTS — the widest gap in the module\n\nThe API has five transition endpoints: submit, hod-approve, hod-request-changes, publish, unpublish. Each is permission-gated, each is tested, and each has ZERO call sites in the app.\n\nSo the moderation queue and the publishing screen are read-only tables. HOD_APPROVED is a state no human being can reach through the interface, and a publish window can only be created with a REST client.\n\nThe HOD page on the Leadership canvas draws this queue with its verbs.',
    },
    {
      id: 'results-vocab',
      x: 1720,
      y: 1060,
      w: 420,
      text: 'One enum, two vocabularies: the class page says Approved / Sent back, the moderation queue says HOD Approved / HOD Rejected, for the same sheet in the same state.\n\nPick one. "Sent back" is the better pair for "Approved" — it says what happened to the sheet rather than who did it.',
    },
  ],
  fees: [
    {
      id: 'fees-band',
      x: 0,
      y: -300,
      w: 760,
      text: "FEES — the module's workhorse, and its worst dialogs\n\nThe ledger is one 1367-line component behind six segments. Refunds are the only fully wired state machine in campus. Invoices, receipts, waivers and fee structures are all tables with their verbs missing: issue, void, write off, void a receipt, fiscalise, approve a waiver, activate a draft structure — every one has an endpoint and no control.\n\nAnd four dialogs ask a bursar to type a UUID into a box labelled \"Student ID\", \"Term ID\" or \"Invoice ID\". That is the single worst thing in the module.",
    },
    {
      id: 'fees-deadends',
      x: 10320,
      y: 1060,
      w: 440,
      text: 'Three sidebar entries — Receipts, Refunds, Waivers — point at routes that redirect to the fees YEAR-GROUP PICKER rather than to their own ledger tab. A bursar clicking "Waivers" lands on a grid of class cards.\n\nThe artboards here are drawn on the correct tab; the Leadership canvas draws them as the screens the nav promises.',
    },
  ],
  services: [
    {
      id: 'services-band',
      x: 0,
      y: -300,
      w: 740,
      text: 'BOARDING AND SERVICES — where the writing is best and the verbs are fewest\n\n"A route with no stops is a bus with nowhere to pull in." "This is the combination a school cannot be caught by. Ring home before anything else on this page." "Write the sentence a nurse needs, not a list of words."\n\nAnd: boarding has no approve on a leave request, no allocate, no add hostel; transport has no create for routes or stops; the library cannot catalogue a book. A complete bed-allocation board exists in the tree and no route renders it.',
    },
  ],
}

/* ── layout ─────────────────────────────────────────────────────────── */
const GAP = 120

function buildPage(pageId) {
  const entries = LAYOUT[pageId]
  const artboards = []
  let x = 0
  for (const [file, title, render, w, h] of entries) {
    if (render) {
      fs.writeFileSync(path.join(OUT, file), render(), 'utf8')
    } else if (!fs.existsSync(path.join(OUT, file))) {
      throw new Error(`${file} is kept from the published canvas but is not on disk`)
    }
    artboards.push({ file, title, page: pageId, x, y: 0, w, h, expand: 'fit' })
    x += w + GAP
  }
  return artboards
}

function main() {
  if (!fs.existsSync(OUT)) throw new Error(`missing ${OUT}`)

  for (const f of RETIRED) {
    const p = path.join(OUT, f)
    if (fs.existsSync(p)) fs.rmSync(p)
  }

  const artboards = []
  const annotations = []
  for (const { id } of PAGES) {
    artboards.push(...buildPage(id))
    for (const a of ANNOTATIONS[id] ?? []) annotations.push({ ...a, page: id })
  }

  /* Main stays the entry file, and prints as a flowing document. */
  artboards.find((a) => a.file === 'Main.dc.html').print = 'flow'

  const canvas = {
    artboards,
    annotations,
    launch: { view: 'canvas', page: 'office' },
    pages: PAGES,
  }
  fs.writeFileSync(path.join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf8')

  const onDisk = fs.readdirSync(OUT).filter((f) => f.endsWith('.dc.html'))
  const listed = new Set(artboards.map((a) => a.file))
  const orphans = onDisk.filter((f) => !listed.has(f))
  if (orphans.length) throw new Error(`artboards on disk but not in canvas.json: ${orphans.join(', ')}`)

  console.log(`${artboards.length} artboards across ${PAGES.length} pages, ${annotations.length} notes`)
  for (const { id, name } of PAGES) {
    console.log(`  ${name}: ${artboards.filter((a) => a.page === id).length}`)
  }
}

main()
