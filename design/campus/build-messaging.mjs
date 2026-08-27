/**
 * Builds the "Campus Messaging" canvas.
 *
 * Run:  node design/campus/build-messaging.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as M from './screens/messaging.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'messaging')

const PAGES = [
  { id: 'model', name: 'How it is addressed' },
  { id: 'parent', name: 'Parent' },
  { id: 'staff', name: 'Teacher' },
  { id: 'office', name: 'Office' },
  { id: 'broadcast', name: 'Pupil and broadcast' },
]

const LAYOUT = {
  model: [['Main.dc.html', 'A person, a child, a subject', M.Addressing, 1600, 1000]],
  parent: [
    ['ParentInbox.dc.html', 'One inbox, sorted by whose move', M.ParentInbox, 390, 844],
    ['ParentCompose.dc.html', 'Who should read this?', M.ParentCompose, 390, 844],
    ['ParentThread.dc.html', 'A conversation', M.ParentThread, 390, 844],
    ['ParentThreadClosed.dc.html', 'A conversation that is finished', M.ParentThreadClosed, 390, 844],
  ],
  staff: [
    ['TeacherInbox.dc.html', 'Need a reply', M.TeacherInbox, 1240, 880],
    ['TeacherThread.dc.html', 'A thread, with the child beside it', M.TeacherThread, 1240, 880],
    ['TeacherHandoff.dc.html', 'Passing it on', M.TeacherHandoff, 1240, 880],
  ],
  office: [['OfficeInbox.dc.html', 'The inbox that has no screen', M.OfficeInbox, 1600, 1000]],
  broadcast: [
    ['StudentFromSchool.dc.html', 'From school — renamed honestly', M.StudentFromSchool, 390, 844],
    ['NoticeOrMessage.dc.html', 'Notice or message', M.NoticeOrMessage, 1600, 1000],
  ],
}

const j = (...p) => p.join('\n\n')

const ANNOTATIONS = {
  model: [
    {
      id: 'model-band',
      x: 0,
      y: -460,
      w: 820,
      text: j(
        'MESSAGING — the model is better than the screens',
        'SchoolMessageThread already stores a named recipient (teacherProfileId, null meaning the office), a named child (studentId, null meaning a general enquiry), a subject, and closedAt. Whose move it is, is derived from the last sender. lib/schools/messages.ts even explains why unread is derived and never counted: "a counter and the messages it counts drift apart, and the badge is the thing people trust".',
        'None of it reaches a screen. The parent composes with two fields — a subject and a body — and is never asked who should read it. So the recipient is decided by something invisible, and the family cannot tell whether they are writing to a person or to a building.',
        'THE REDESIGN, in one line: every conversation is a named person, about a named child, on a named subject, and it always says whose move it is.',
      ),
    },
  ],
  parent: [
    {
      id: 'parent-band',
      x: 0,
      y: -460,
      w: 700,
      text: j(
        'PARENT — three changes',
        '1. COMPOSE ASKS WHO. A list of real people with what each of them handles and when they answer, plus "not sure? send it to the office and they will pass it on" — which is a promise the hand-off screen keeps.',
        '2. THE INBOX SAYS WHOSE MOVE. "Your reply" / "With the family" / "Finished", filterable. A parent waiting two days on the bursar can see that they are waiting, rather than wondering whether the message arrived.',
        '3. CLOSURE IS SHOWN, NOT DISCOVERED. Today a parent types a reply, presses Send, and is told the conversation was closed. Here the finished state is on the thread with who closed it and when, and the way forward is a button rather than a refusal.',
      ),
    },
    {
      id: 'parent-anchor',
      x: 1020,
      y: 904,
      w: 420,
      text: j(
        'THE ANCHOR CHIP',
        'Every conversation in a school is about something the system already knows — a child, and often a specific invoice, absence or mark.',
        'The chip under the thread header carries it and links to it. studentId is already on the thread; the rest is one nullable reference.',
      ),
    },
  ],
  staff: [
    {
      id: 'staff-band',
      x: 0,
      y: -460,
      w: 780,
      text: j(
        'TEACHER — an inbox is a to-do list, not a feed',
        'Unread tells a teacher what is new. WHOSE MOVE tells them what is theirs to do, which is the question they actually have between two lessons. It is the same derived value, relabelled, and it lets the list sort by how long a family has been waiting.',
        'PASSING IT ON is the missing verb. A parent writes to a Maths teacher about fees; today the teacher can answer outside their competence or ignore it. teacherProfileId is one mutable field — handing the conversation over is one update, and the family sees who has it rather than having to write again.',
        'The right-hand rail is the child. A message about an absence should not make a teacher open another screen to find out the pupil is at 68% and nine days down.',
      ),
    },
  ],
  office: [
    {
      id: 'office-band',
      x: 0,
      y: -460,
      w: 780,
      text: j(
        'OFFICE — the inbox that has no screen',
        'allThreads() and closeThread() are built, tested and exposed at /api/v2/schools/messages. Nothing in app/schools calls them, and there is no nav entry.',
        'So a thread with teacherProfileId = null — the "general enquiry to the office" the model was designed for — lands nowhere any person looks. That is the UNASSIGNED queue on this screen, and it is the most important missing surface in messaging.',
        'The office also owns closure, which is why a parent can read "The office closed it" about a conversation nobody in the office ever saw.',
      ),
    },
  ],
  broadcast: [
    {
      id: 'broadcast-band',
      x: 0,
      y: -460,
      w: 760,
      text: j(
        'PUPIL AND BROADCAST — two honesty fixes',
        "The pupil's screen is called MESSAGES and is a one-way notification feed. The pupil is not a party to a thread at all: the model is one guardian, one member of staff, and the child as the SUBJECT. Renaming it \"From school\" stops the title implying a conversation the product will not give them, and the footer says plainly where messages do happen.",
        'NOTICES AND MESSAGES are two systems a parent must know the difference between to find anything: a notice lands in News, a message under You. The last artboard states when each is right, and names three places a notice should become a conversation — starting with the fee reminder that goes to 842 families to reach 31.',
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
    JSON.stringify({ artboards, annotations, launch: { view: 'canvas', page: 'model' }, pages: PAGES }, null, 2),
    'utf8',
  )
  console.log(`${artboards.length} artboards across ${PAGES.length} pages, ${annotations.length} notes`)
}

main()
