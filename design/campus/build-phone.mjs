/**
 * Builds the "Campus Student and Parent Portals" canvas — the two phone
 * surfaces, 390x844.
 *
 * Run:  node design/campus/build-phone.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as P from './screens/phone.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'phone')

const PAGES = [
  { id: 'student', name: 'Student' },
  { id: 'parent', name: 'Parent' },
]

const LAYOUT = {
  student: [
    ['Main.dc.html', 'Home', P.StudentHome, 390, 844],
    ['StudentTimetable.dc.html', 'My timetable', P.StudentTimetable, 390, 844],
    ['StudentMarks.dc.html', 'My marks', P.StudentMarks, 390, 844],
    ['StudentHomework.dc.html', 'Homework', P.StudentHomework, 390, 844],
    ['StudentHomeworkSheet.dc.html', 'Handing work in', P.StudentHomeworkSheet, 390, 844],
    ['StudentGoals.dc.html', 'My goals', P.StudentGoals, 390, 844],
    ['StudentLibrary.dc.html', 'Library', P.StudentLibrary, 390, 844],
    ['StudentAttendance.dc.html', 'My attendance', P.StudentAttendance, 390, 844],
    ['StudentMessages.dc.html', 'Messages', P.StudentMessages, 390, 844],
    ['StudentProfile.dc.html', 'My profile', P.StudentProfile, 390, 844],
    ['StudentSettings.dc.html', 'Settings', P.StudentSettings, 390, 844],
    ['StudentHelp.dc.html', 'Help', P.StudentHelp, 390, 844],
    ['StudentLogin.dc.html', 'Student Portal — sign in', P.StudentLogin, 390, 844],
  ],
  parent: [
    ['ParentHome.dc.html', 'Home', P.ParentHome, 390, 844],
    ['ParentFees.dc.html', 'School fees', P.ParentFees, 390, 844],
    ['ParentAttendance.dc.html', 'Attendance', P.ParentAttendance, 390, 844],
    ['ParentMarks.dc.html', 'Marks', P.ParentMarks, 390, 844],
    ['ParentNotices.dc.html', 'School news', P.ParentNotices, 390, 844],
    ['ParentMessages.dc.html', 'Messages', P.ParentMessages, 390, 844],
    ['ParentChildSwitcher.dc.html', 'Switch child', P.ParentChildSwitcher, 390, 844],
    ['ParentProfile.dc.html', 'Your details', P.ParentProfile, 390, 844],
    ['ParentHelp.dc.html', 'Help', P.ParentHelp, 390, 844],
    ['ParentLogin.dc.html', 'Guardian Portal — sign in', P.ParentLogin, 390, 844],
  ],
}

const ANNOTATIONS = {
  student: [
    {
      id: 'student-shell',
      x: 0,
      y: -430,
      w: 760,
      text: [
        'STUDENT PORTAL — a phone app, not a dashboard',
        'A 52px header carrying the screen name and nothing else, one screen at a time, and four bottom tabs at 64px. There is no caption line: Home does the greeting, so the bar does not repeat it.',
        "Every other title is possessive — My marks, My timetable — because on a pupil's phone every screen is about them.",
        "The orange is the pupil's own identity and appears in exactly two places: the goals hero and the ID card. The portal does not re-point --brand; everything else is the platform blue.",
        'CORRECTION: the previous canvas drew this portal violet with a caption line. Violet belongs to the teacher.',
      ].join('\n\n'),
    },
    {
      id: 'student-attendance-gap',
      x: 7140,
      y: -430,
      w: 480,
      text: [
        'THE ONE MISSING SCREEN',
        "PERMISSIONS_BY_PERSONA.STUDENT grants view-own-attendance. There is no attendance screen and no attendance figure anywhere in the pupil's portal.",
        'The parent has a full one for the same child, reading the same registers. The child cannot see their own.',
        "That artboard is drawn from the parent's version, including its best decision: a register the teacher has not submitted is labelled as such rather than counted as an absence.",
      ].join('\n\n'),
    },
  ],
  parent: [
    {
      id: 'parent-shell',
      x: 0,
      y: -430,
      w: 780,
      text: [
        "PARENT PORTAL — four tabs, in the parent's words",
        'Home, Fees, News, You — "News, not Notices; You, not Profile — while the routes keep the names the code uses". A 52px bar, title only, and the child switcher as one 26px avatar chip rather than a row of chips eating a line on all seven screens.',
        'Two rules worth keeping. A figure a parent may not see is never shown as zero: a guardian without financial access gets no fee hero at all, because "0.00 owed" is a wrong answer where "not shown to you" is a true one. And attendance never reports off a register the teacher has not submitted.',
        'THE PRODUCT GAP: there is no payment flow. The sticky bar says Statement, not Pay now — honest, and the largest single hole in campus. A parent can see USD 310.00 owed and cannot pay it.',
      ].join('\n\n'),
    },
    {
      id: 'parent-drift',
      x: 8160,
      y: -430,
      w: 460,
      text: [
        'COPY DRIFT TO FIX',
        'The Help answer to "I have two children here but only see one" says: "Use the row of names at the top of the screen to switch."',
        'There is no row of names. The shipped shell has a single avatar chip that opens a bottom sheet — the Switch child artboard. The help text describes a screen that was replaced.',
      ].join('\n\n'),
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
    JSON.stringify({ artboards, annotations, launch: { view: 'canvas', page: 'student' }, pages: PAGES }, null, 2),
    'utf8',
  )
  console.log(`${artboards.length} artboards across ${PAGES.length} pages, ${annotations.length} notes`)
}

main()
