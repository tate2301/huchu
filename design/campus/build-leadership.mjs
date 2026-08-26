/**
 * Builds the "Campus Leadership" canvas — head, bursar, HOD and warden.
 *
 * Run:  node design/campus/build-leadership.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as L from './screens/leadership.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'leadership')

const PAGES = [
  { id: 'roles', name: 'Who lands where' },
  { id: 'bursar', name: 'Bursar' },
  { id: 'hod', name: 'Head of department' },
  { id: 'warden', name: 'Warden' },
]

const LAYOUT = {
  roles: [
    ['Main.dc.html', 'Six roles, one landing', L.RoleLanding, 1600, 1000],
    ['HeadDashboard.dc.html', 'The head', L.HeadDashboard, 1600, 1000],
  ],
  bursar: [
    ['BursarDashboard.dc.html', 'The bursar', L.BursarDashboard, 1600, 1000],
    ['BursarReceipts.dc.html', 'Receipts', L.BursarReceipts, 1600, 1000],
    ['BursarWaivers.dc.html', 'Waivers', L.BursarWaivers, 1600, 1000],
    ['BursarInvoiceActions.dc.html', 'Invoice actions', L.BursarInvoiceActions, 1600, 1000],
  ],
  hod: [
    ['HodModeration.dc.html', 'Moderation, with its verbs', L.HodModeration, 1600, 1000],
    ['HodPublishWindows.dc.html', 'Publish windows', L.HodPublishWindows, 1600, 1000],
  ],
  warden: [
    ['WardenDashboard.dc.html', 'The warden', L.WardenDashboard, 1600, 1000],
    ['WardenBedAllocate.dc.html', 'The bed board', L.WardenBedAllocate, 1600, 1000],
  ],
}

const j = (...p) => p.join('\n\n')

const ANNOTATIONS = {
  roles: [
    {
      id: 'roles-band',
      x: 0,
      y: -400,
      w: 800,
      text: j(
        'EVERYTHING ON THIS CANVAS IS PROPOSED',
        'Six school roles sign in and all six land on /schools, which is a fourteen-row key/value table with a search box. ROLE_ROUTE_ALLOWLIST in lib/auth-core/role-routes.ts has exactly one entry, and it is SALES_REP.',
        'Meanwhile lib/platform/personas.ts grants each of them a different set of verbs — the bursar can issue, receive, waive, write off, void and refund; the HOD can moderate, request changes and approve; the warden can allocate a bed, approve leave and check a boarder in and out.',
        'Almost none of those verbs has a control anywhere in the product. The API routes exist and are permission-gated; nothing calls them. This canvas draws the screens that would.',
      ),
    },
  ],
  bursar: [
    {
      id: 'bursar-band',
      x: 0,
      y: -400,
      w: 760,
      text: j(
        'BURSAR — the verbs that exist in the API and nowhere else',
        'invoices/[id]/issue · invoices/[id]/write-off · receipts/[id]/void · receipts/[id]/fiscalise · waivers/[id]/apply. Every one is built, tested and gated. None has a call site.',
        'So VOIDED and WRITEOFF render as badges and filter options no screen can reach, four of the five waiver states are unreachable, and the ZIMRA fiscalisation path in lib/schools/fiscalisation.ts has no campus screen at all.',
        'The nav also promises three screens that do not exist: Receipts, Refunds and Waivers all redirect to the fees year-group picker. Two of them are drawn here as what the nav says they are.',
      ),
    },
    {
      id: 'bursar-chase',
      x: 5160,
      y: -400,
      w: 460,
      text: j(
        'THE CHASE LIST IS THE MISSING PRODUCT',
        'The arrears report names 188 families and offers no way to contact any of them, while the notices system can reach every parent portal in one send. The two features are three clicks apart and do not know about each other.',
        'A reminder run that reads the arrears report and posts to the portal is those two systems, joined.',
      ),
    },
  ],
  hod: [
    {
      id: 'hod-band',
      x: 0,
      y: -400,
      w: 780,
      text: j(
        'HEAD OF DEPARTMENT — the widest gap in the module',
        'Five transition endpoints exist for a mark sheet: submit, hod-approve, hod-request-changes, publish, unpublish. Each is permission-gated and each has ZERO call sites. HOD_APPROVED is a state no human being can reach through the interface.',
        'portal-isolation.ts routes an HOD to /portal/teacher "with additional permissions", and the teacher shell has no HOD affordance at all — see the Teacher canvas.',
        'A publish window can only be created with a REST client, and the teacher portal explains the mechanism to teachers in plain words: "The office opens a window per term."',
      ),
    },
    {
      id: 'hod-schemes',
      x: 3440,
      y: -400,
      w: 460,
      text: j(
        'THE SAME HOD SIGNS THE SCHEMES',
        'A ZIMSEC scheme-cum-plan is checked and signed by the head of department before it is taught, a fortnight ahead of delivery. That queue is on the Teacher canvas under Planning.',
        'One person, two kinds of approval, and neither has a screen today.',
      ),
    },
  ],
  warden: [
    {
      id: 'warden-band',
      x: 0,
      y: -400,
      w: 760,
      text: j(
        'WARDEN — a complete screen that no route renders',
        'components/schools/boarding/bed-board-content.tsx is a finished bed-allocation board: rooms, beds, "Free the bed", "Give it to somebody", an inline boarder picker, and a warning for boarders with no bed. Nothing imports it, even though the sidebar calls /schools/boarding "Bed board".',
        'What ships instead is three read-only tables with statuses printed as raw enums — APPROVED, CHECKED_IN, CANCELED — and no approve or reject on a leave request.',
        'The roll call is new: the warden persona is granted check-in and check-out and there is no screen for either, which is the one thing a boarding school does every night.',
      ),
    },
  ],
}

const GAP = 120

function main() {
  fs.mkdirSync(OUT, { recursive: true })
  for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f))

  const artboards = []
  const annotations = []
  for (const { id } of PAGES) {
    let x = 0
    for (const [file, title, render, w, h] of LAYOUT[id]) {
      fs.writeFileSync(path.join(OUT, file), render(), 'utf8')
      artboards.push({ file, title, page: id, x, y: 0, w, h, expand: 'fit' })
      x += w + GAP
    }
    for (const a of ANNOTATIONS[id] ?? []) annotations.push({ ...a, page: id })
  }

  fs.writeFileSync(
    path.join(OUT, 'canvas.json'),
    JSON.stringify({ artboards, annotations, launch: { view: 'canvas', page: 'roles' }, pages: PAGES }, null, 2),
    'utf8',
  )
  console.log(`${artboards.length} artboards across ${PAGES.length} pages, ${annotations.length} notes`)
}

main()
