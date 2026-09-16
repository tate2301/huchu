/**
 * Leavers and alumni — Iteration 13, finishing something already half-built.
 *
 * S-1.5 promotes, repeats, graduates and transfers a pupil at the end of a
 * year. Graduating currently leads nowhere: the record stops being listed and
 * that is the whole of it. A pupil who has left is a record, not a deletion.
 *
 * WHAT THESE FOUR ARTBOARDS DECIDE
 *
 * 1. Leaving is a checklist, not an action. A school does not lose a pupil in
 *    one click — there is a book out, a fee outstanding, a bed to free, a
 *    portal account to close and a certificate to raise. So the queue draws
 *    five marks per leaver in one column group, and the row's verb names the
 *    next undone one rather than saying "Edit". A partial leaver is the one
 *    that costs money, so partials have to be readable at a glance and the
 *    count beside the marks is what makes them so.
 *
 * 2. A mark that cannot apply is a dash, not a failure. A day pupil has no
 *    bed. Drawing that as an outstanding step would teach the office to ignore
 *    the column, so it is drawn as a dash and the count says "3 of 4".
 *
 * 3. Consent is a column, not a policy document. A school may not keep writing
 *    to someone who never agreed to be written to, and "Not asked" is not the
 *    same answer as "No". Both facts belong on the row of the person they
 *    govern, and the three counts belong in the table that counts the register.
 *
 * 4. History is closed; contact is open. On an alumnus the school record —
 *    years, results, prizes, conduct — cannot be edited here, because a
 *    testimonial rests on it. That boundary is drawn, not written: a closed
 *    value has no dashed underline and carries a lock, an open one is pressable
 *    and opens its editor. No sentence on the artboard says which is which.
 *
 * WHAT THE SECOND DRAWING CHANGED
 *
 * The first pass drew seventeen cards across four screens and put a sentence
 * of prose under nearly every list row. Both are gone; not one card is left.
 *
 *   Leavers — the card that explained what each of the five clearance marks
 *     means and who makes it was the legend for a column. The column header
 *     already names the five in order; the legend went. Two sections remain,
 *     because "who is still in the queue" and "who has already gone owing
 *     money" are two populations with two totals, not one question split up.
 *
 *   Alumni — consent counts and destination coverage are one question asked
 *     two ways: how much of this register is actually usable. They are one
 *     table with two group headers and a total. The three stats above it
 *     repeated the same figures a second time and came off.
 *
 *   AlumniRecord — seven cards, a five-field contact form and an alert
 *     explaining the closed record, replaced by one property block and two
 *     sections. The document register and the life timeline were one
 *     chronology drawn twice, so they are now one table.
 *
 *   LeavingDocuments — the policy card and the "what each document says"
 *     card were both columns of the document table: what holds this document,
 *     and who signs it. The certificate keeps its bespoke drawing because it
 *     is the artefact the page exists to produce, and it sits on the page
 *     ground rather than inside a card, because the paper already floats.
 *
 * Called by build-expansion.mjs.
 */
import {
  C, I, esc, icon, page, grid, stack, rowFlex, table, section, badge, mono, txt,
  alert, ghostBtn, filterSelect, searchField, segments, avatar,
  tinyBtn, defineScreen,
} from '../lib/expansion-kit.mjs'

const SCOPE = { group: 'Chishawasha Trust', campus: 'Borrowdale campus' }
const USER = { name: 'Rudo Makoni', role: 'Deputy Head' }

const ini = (n) => {
  const [last, first] = n.split(', ')
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

const pupilCell = (name, no) =>
  `${avatar(ini(name))}<span style="min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(no, { size: 10.5 })}</span>`

const stackCell = (name, sub) =>
  `<span style="min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>`

const TONE_FG = { ok: C.ok, warn: C.warn, bad: C.bad, brand: C.brandStrong }

/* ── the five clearance marks ────────────────────────────────────────────
   Composed locally: the kit has no primitive for a group of small states read
   as one thing. Built from `icon`, `mono` and `C` so it cannot drift.
   States: done · todo · na — a day pupil has no bed, and a dash is honest
   where a warning would be a lie.
 */
const MARKS = [
  [I.money, 'Fees settled'],
  [I.books, 'Library returned'],
  [I.bed, 'Bed freed'],
  [I.lock, 'Portal closed'],
  [I.file, 'Documents raised'],
]

const mark = (glyph, state, title) => {
  const bg = state === 'done' ? C.okBg : state === 'na' ? C.hair : C.warnBg
  const bd = state === 'done' ? C.okBd : state === 'na' ? C.borderSubtle : C.warnBd
  const fg = state === 'done' ? C.ok : C.warn
  return `<span title="${esc(title)}" style="width: 22px; height: 22px; border-radius: 5px; background: ${bg}; border: 1px solid ${bd}; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0">${state === 'na' ? `<span style="width: 8px; height: 1.5px; border-radius: 1px; background: ${C.faint}"></span>` : icon(glyph, { size: 12, stroke: fg })}</span>`
}

const clearance = (states) => {
  const applies = states.filter((s) => s !== 'na').length
  const done = states.filter((s) => s === 'done').length
  const whole = done === applies
  return `<span style="display: flex; align-items: center; gap: 4px">${MARKS.map(([g, t], i) => mark(g, states[i], t)).join('')}<span style="width: 3px"></span>${mono(`${done} of ${applies}`, { size: 11, color: whole ? C.ok : C.warn, weight: 700 })}</span>`
}

/* ── a proportion, as a bar and a figure ────────────────────────────────
   One table cell, two marks. The kit has no bar; this is the same shape
   group.mjs draws, sized to fill whatever column it is put in.
 */
const share = (pct, tone) => {
  const fg = TONE_FG[tone] ?? C.mid
  return `<span style="display: block; flex: 1; min-width: 0; height: 6px; border-radius: 999px; background: ${C.muted}; overflow: hidden"><span style="display: block; width: ${pct}; height: 6px; border-radius: 999px; background: ${fg}"></span></span>${mono(pct, { size: 11.5, color: fg, weight: 700, width: 38 })}`
}

/* ── a property block with one state the kit's has not got ──────────────
   `properties()` draws every value pressable, which is right for a record
   somebody may edit. An alumnus has two halves — a school record that is
   closed because a testimonial rests on it, and a contact record that is the
   only part still true about a living person — and the whole point of the
   screen is that a reader can see which is which without being told. So a
   closed row loses the dashed underline and the pointer, and carries a lock.
   Same metrics, same tokens, one extra state.
 */
const facts = (rows, { cols = 2, labelW = 150 } = {}) =>
  `<div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 0 32px">${rows
    .map(([label, value, opt = {}]) => {
      const open = !opt.locked
      return `<div style="display: flex; align-items: baseline; gap: 10px; min-height: 30px; padding: 5px 0; border-bottom: 1px solid ${C.hair}">
        <span style="width: ${labelW}px; flex-shrink: 0; font-size: 11.5px; color: ${C.subtle}; line-height: 1.4">${esc(label)}</span>
        <span style="flex: 1; min-width: 0; font-size: 12.5px; color: ${C.body}; line-height: 1.4;${opt.mono ? " font-family: 'Atkinson Hyperlegible Mono', monospace; font-variant-numeric: tabular-nums;" : ''}${open ? ` border-bottom: 1px dashed ${C.border}; cursor: pointer;` : ''}">${value}</span>
        ${open ? '' : `<span style="flex-shrink: 0">${icon(I.lock, { size: 11, stroke: C.faint })}</span>`}
      </div>`
    })
    .join('')}</div>`

/* ── /schools/leavers ───────────────────────────────────────────────────
   Pupil, year group, reason, last day, the five marks, and a verb that names
   the next undone step. The row order of the marks is the order the school
   works them, so "the next undone one" is a rule and not a guess.
 */
const QUEUE = [
  ['Zimuto, Nyasha', 'CHS-1240', 'Form 4A', 'Completed Form 4', '27 Nov 2026', ['todo', 'done', 'done', 'todo', 'todo'], 'Chase $210.00', 'bad'],
  ['Nyathi, Kudzai', 'CHS-1233', 'Form 4A', 'Completed Form 4', '27 Nov 2026', ['todo', 'todo', 'done', 'done', 'todo'], 'Chase $620.00', 'bad'],
  ['Gwatidzo, Rufaro', 'CHS-1277', 'Form 1B', 'Fees', '10 Sep 2026', ['todo', 'done', 'na', 'todo', 'todo'], 'Chase $410.00', 'bad'],
  ['Marange, Tadiwa', 'CHS-1288', 'Form 3B', 'Transferred to another school', '10 Sep 2026', ['done', 'done', 'done', 'done', 'todo'], 'Raise the documents', 'brand'],
  ['Chikwanda, Rutendo', 'CHS-1180', 'Form 2A', 'Moved abroad', '18 Sep 2026', ['done', 'done', 'na', 'done', 'todo'], 'Raise the documents', 'brand'],
  ['Ncube, Tariro', 'CHS-1292', 'Form 2B', 'Moved abroad', '24 Jul 2026', ['done', 'done', 'na', 'todo', 'todo'], 'Close the portal', 'brand'],
  ['Mhaka, Tinashe', 'CHS-1309', 'Form 3B', 'Expelled', '19 Jun 2026', ['done', 'todo', 'na', 'done', 'done'], 'Take the book back', 'warn'],
  ['Mafuta, Simba', 'CHS-1301', 'Upper Sixth', 'Completed Upper 6', '27 Nov 2026', ['done', 'done', 'na', 'done', 'done'], 'Close the record', 'plain'],
  ['Sibanda, Ruvimbo', 'CHS-1266', 'Form 3A', 'Withdrawn by guardian', '12 Jun 2026', ['done', 'done', 'done', 'done', 'done'], 'Close the record', 'plain'],
]

/** The bursar's question: money that walked out of the gate. */
const GONE_OWING = [
  ['Chigumba, Anesu', 'CHS-0994', 'Completed Form 4', '5 Dec 2025', '840.00'],
  ['Mangwiro, Panashe', 'CHS-1042', 'Transferred to another school', '27 Mar 2026', '620.00'],
  ['Zhou, Kundai', 'CHS-1078', 'Completed Upper 6', '5 Dec 2025', '560.00'],
  ['Muchena, Tapiwanashe', 'CHS-1120', 'Withdrawn by guardian', '3 Jul 2026', '470.00'],
]

export const Leavers = defineScreen(
  {
    screen: 'Leavers',
    route: '/schools/leavers',
    story: 'S-13.4',
    title: 'Leavers',
    railItem: 'Leavers',
    action: { label: 'Record a leaver', icon: I.plus },
    search: 'Search the leaving queue',
    scope: SCOPE,
    user: USER,
    chips: [
      { label: 'In the queue', value: '9' },
      { label: 'Not cleared', value: '7', tone: 'warn' },
      { label: 'Owing on exit', value: '$1,240.00', tone: 'bad' },
      { label: 'Documents outstanding', value: '6', tone: 'warn' },
    ],
    bandActions: [ghostBtn('Export the queue', I.download)],
  },
  () =>
    page(`
      ${section(
        { title: 'The leaving queue', note: '2 of 9 cleared' },
        stack(
          `${rowFlex(
            `${segments([{ label: 'Still open', count: 9 }, { label: 'Closed this year', count: 14 }], 'Still open')}
             ${filterSelect('Year group', 'The whole school')}
             ${filterSelect('Reason', 'Any reason')}
             ${filterSelect('Clearance', 'Any state')}`,
            { align: 'flex-end' },
          )}
          ${table({
            cols: [
              { label: 'Pupil' },
              { label: 'Year group', w: 100 },
              { label: 'Leaving because', w: 200 },
              { label: 'Last day', w: 100 },
              { label: 'Fees · Library · Bed · Portal · Docs', w: 215 },
              { label: 'Next step', w: 150, align: 'right' },
            ],
            rows: QUEUE.map(([name, no, yr, reason, last, states, verb, tone]) => [
              pupilCell(name, no),
              txt(yr, { size: 12, color: C.mid }),
              txt(reason, { size: 12, color: reason === 'Expelled' || reason === 'Fees' ? C.bad : C.mid, ellipsis: true }),
              mono(last, { size: 11.5, color: C.body }),
              clearance(states),
              tinyBtn(verb, tone),
            ]),
          })}`,
          10,
        ),
      )}
      ${section(
        { title: 'Gone, still owing', note: '7 former pupils &middot; $2,910.00' },
        table({
          cols: [
            { label: 'Former pupil' },
            { label: 'Left because', w: 260 },
            { label: 'Last day', w: 110 },
            { label: 'Still owed', w: 110, align: 'right' },
          ],
          rows: [
            ...GONE_OWING.map(([name, no, reason, last, amt]) => [
              stackCell(name, no),
              txt(reason, { size: 12, color: C.mid, ellipsis: true }),
              mono(last, { size: 11.5 }),
              mono(`$${amt}`, { size: 12, color: C.bad, weight: 700 }),
            ]),
            [
              txt('Three others', { size: 12, color: C.mid }),
              txt('Each under $200.00', { size: 12, color: C.subtle }),
              mono('—', { size: 11.5 }),
              mono('$420.00', { size: 12, color: C.bad, weight: 700 }),
            ],
            {
              total: [
                txt('Seven former pupils', { size: 12.5, color: C.body }),
                '',
                '',
                mono('$2,910.00', { size: 12.5, color: C.bad, weight: 700 }),
              ],
            },
          ],
        }),
      )}
    `),
)

/* ── /schools/alumni ────────────────────────────────────────────────────
   Everybody who has left, and then the one question that says whether anybody
   has been keeping the register: of 1,412 people, how many may be written to
   and how many have a destination against their name. Consent and coverage
   are two ways of asking it, so they are two groups in one table.
 */
const ALUMNI = [
  ['Mangwiro, Panashe', 'CHS-1042', '2026', 'Form 3B', 'Left before O-Levels', 'Transferred &middot; Prince Edward School', 'No contact', 'bad', '', ''],
  ['Muchena, Tapiwanashe', 'CHS-1120', '2026', 'Form 2A', 'Left before O-Levels', 'Unknown', 'Not asked', 'plain', 'Ask for consent', 'brand'],
  ['Chigumba, Anesu', 'CHS-0994', '2025', 'Form 4A', '8 O-Levels &middot; 5 at B or better', 'Unknown', 'May contact', 'ok', 'Where did they go?', 'brand'],
  ['Zhou, Kundai', 'CHS-1078', '2025', 'Upper Sixth', '3 A-Levels &middot; 9 points', 'Employed &middot; Old Mutual, Harare', 'May contact', 'ok', 'Add an update', 'plain'],
  ['Nyamande, Tinotenda', 'CHS-0961', '2024', 'Form 4B', '7 O-Levels &middot; 2 at B or better', 'Unknown', 'Not asked', 'plain', 'Ask for consent', 'brand'],
  ['Chikafu, Rutendo', 'CHS-0788', '2019', 'Upper Sixth', '3 A-Levels &middot; 13 points', 'University of Zimbabwe &middot; BSc Accounting', 'May contact', 'ok', 'Add an update', 'plain'],
  ['Marufu, Chiedza', 'CHS-0640', '2016', 'Upper Sixth', '3 A-Levels &middot; 15 points', 'Nurse training &middot; Parirenyatwa', 'May contact', 'ok', 'Add an update', 'plain'],
  ['Chirisa, Farirai', 'CHS-0512', '2014', 'Form 4A', '9 O-Levels &middot; 7 at B or better', 'Employed &middot; self-employed, Mbare', 'May contact', 'ok', 'Add an update', 'plain'],
]

/** label, tone, count, of, share — the shares are the counts over 1,412. */
const CONSENT = [
  ['May contact', 'ok', '604', '1,412', '43%'],
  ['No contact', 'bad', '121', '1,412', '9%'],
  ['Not asked', 'plain', '687', '1,412', '49%'],
]

const DESTINATION_BY_YEAR = [
  ['Class of 2026', '41', '62', '66%', 'ok'],
  ['Class of 2025', '48', '96', '50%', 'warn'],
  ['Class of 2024', '21', '88', '24%', 'bad'],
  ['2023 and earlier', '181', '1,166', '16%', 'bad'],
]

export const Alumni = defineScreen(
  {
    screen: 'Alumni',
    route: '/schools/alumni',
    story: 'S-13.4',
    title: 'Alumni',
    railItem: 'Alumni',
    search: 'Search the alumni register',
    scope: SCOPE,
    user: USER,
    chips: [
      { label: 'On the register', value: '1,412' },
      { label: 'Left this year', value: '62' },
      { label: 'Destination unknown', value: '1,121', tone: 'warn' },
      { label: 'Consent never asked', value: '687', tone: 'warn' },
    ],
    bandActions: [ghostBtn('Export the register', I.download)],
  },
  () =>
    page(`
      ${section(
        { title: 'Everyone who has left', note: '8 shown &middot; newest first' },
        stack(
          `${rowFlex(
            `${filterSelect('Class of', 'Any year', { w: 130 })}
             ${filterSelect('House', 'Any house', { w: 150 })}
             ${filterSelect('Destination', 'Any destination', { w: 170 })}
             ${filterSelect('Consent', 'Any consent', { w: 150 })}
             <div style="flex: 1"></div>
             ${searchField('Name or admission number', { w: 230 })}`,
            { align: 'flex-end' },
          )}
          ${table({
            cols: [
              { label: 'Name' },
              { label: 'Class of', w: 70 },
              { label: 'Last year group', w: 105 },
              { label: 'Results on leaving', w: 160 },
              { label: 'Where they went', w: 200 },
              { label: 'Contact consent', w: 112 },
              { label: '', w: 130, align: 'right' },
            ],
            rows: ALUMNI.map(([name, no, year, yr, results, dest, consent, tone, verb, vtone]) => [
              stackCell(name, no),
              mono(year, { size: 11.5, color: C.body, weight: 700 }),
              txt(yr, { size: 12, color: C.mid }),
              txt(results, { size: 12, color: results === 'Left before O-Levels' ? C.subtle : C.mid, ellipsis: true }),
              txt(dest, { size: 12, color: dest === 'Unknown' ? C.warn : C.body, ellipsis: true }),
              badge(consent, tone),
              verb ? tinyBtn(verb, vtone) : '',
            ]),
          })}`,
          10,
        ),
      )}
      ${section(
        { title: 'How much of the register is kept', note: '604 contactable &middot; 291 destinations' },
        table({
          cols: [
            { label: 'Measure' },
            { label: 'Count', w: 90, align: 'right' },
            { label: 'Of', w: 90, align: 'right' },
            { label: 'Share', w: 220 },
          ],
          rows: [
            { group: 'Contact consent' },
            ...CONSENT.map(([label, tone, n, of, pct]) => [
              badge(label, tone),
              mono(n, { size: 12, color: C.strong, weight: 700 }),
              mono(of, { size: 11.5 }),
              share(pct, tone === 'plain' ? 'warn' : tone),
            ]),
            { group: 'Destination recorded, by leaving year' },
            ...DESTINATION_BY_YEAR.map(([label, got, of, pct, tone]) => [
              txt(label, { size: 12, weight: 600, color: C.strong }),
              mono(got, { size: 12, color: C.strong, weight: 700 }),
              mono(of, { size: 11.5 }),
              share(pct, tone),
            ]),
            {
              total: [
                txt('Destination recorded, whole register', { size: 12.5, color: C.body }),
                mono('291', { size: 12.5, color: C.strong, weight: 700 }),
                mono('1,412', { size: 12 }),
                share('21%', 'warn'),
              ],
            },
          ],
        }),
      )}
    `),
)

/* ── /schools/alumni/[alumnusId] ────────────────────────────────────────
   Rutendo Chikafu, class of 2019. Eight closed facts and four open ones in
   one property block: the closed half carries a lock and cannot be pressed,
   the open half is pressable and opens its editor. Then the chronology — what
   happened to her and what paper the school issued, which is one sequence and
   was drawn as two lists the first time.
 */
const CHRONOLOGY = [
  ['Mar 2026', 'Qualified &mdash; BSc Accounting, University of Zimbabwe, upper second', '', 'Rudo Makoni · 3 Mar 2026'],
  ['Sep 2024', 'Treasurer of the university accounting society', '', 'Rudo Makoni · 11 Oct 2024'],
  ['Feb 2022', 'Started BSc Accounting, University of Zimbabwe', '', 'Office · 2 Feb 2022'],
  ['Jan 2022', 'Testimonial raised', 'BOR/TS/2022/0009', '17 Jan 2022'],
  ['Jan 2020', 'Statement of results raised', 'BOR/SR/2020/0044', '28 Jan 2020'],
  ['Dec 2019', 'School-leaving certificate raised', 'BOR/LC/2019/0221', '12 Dec 2019'],
  ['Dec 2019', 'Left Upper Sixth', '', 'From the leaving queue'],
]

const EXAMS = [
  ['Accounting', 'A-Level', 'A', '5', 'November 2019'],
  ['Economics', 'A-Level', 'B', '4', 'November 2019'],
  ['Mathematics', 'A-Level', 'B', '4', 'November 2019'],
  ['Nine subjects', 'O-Level', '7 at B or better', '—', 'November 2017'],
]

export const AlumniRecord = defineScreen(
  {
    screen: 'AlumniRecord',
    route: '/schools/alumni/[alumnusId]',
    story: 'S-13.4',
    title: 'Rutendo Chikafu',
    railItem: 'Alumni',
    back: true,
    search: null,
    scope: SCOPE,
    user: USER,
    action: { label: 'Add to the timeline', icon: I.plus },
    chips: [
      { label: 'Class of', value: '2019' },
      { label: 'Consent', value: 'May contact', tone: 'ok' },
      { label: 'Contact last confirmed', value: '3 Mar 2026' },
    ],
    bandActions: [ghostBtn('Print a testimonial', I.print)],
  },
  () =>
    page(`
      ${facts(
        [
          ['Left', 'December 2019 &middot; Upper Sixth, Arts', { locked: true }],
          ['At the school', 'January 2014 to December 2019 &middot; six years', { locked: true }],
          ['House', 'Nyanga House &middot; boarder from Form 3', { locked: true }],
          ['Admission number', 'CHS-0788', { locked: true, mono: true }],
          ['Results', '3 A-Levels &middot; 13 points &middot; ZIMSEC November 2019', { locked: true }],
          ['Conduct', 'Clear &middot; two merits in Upper Sixth', { locked: true }],
          ['Prizes and colours', '2017 Accounting prize &middot; 2018 full colours, hockey &middot; 2019 Head of Nyanga House', { locked: true }],
          ['Guardian at the time', 'Miriam Chikafu &middot; mother &middot; +263 77 412 8890', { locked: true }],
          ['Email', 'rutendo.chikafu@gmail.com'],
          ['Mobile', '+263 77 233 4180'],
          ['Town', 'Harare'],
          ['Contact consent', 'May contact &middot; given 14 December 2019'],
        ],
        { cols: 2 },
      )}
      ${section(
        { title: 'Public exam results', note: 'ZIMSEC &middot; 13 points' },
        table({
          cols: [
            { label: 'Subject' },
            { label: 'Level', w: 110 },
            { label: 'Grade', w: 170, align: 'center' },
            { label: 'Points', w: 80, align: 'right' },
            { label: 'Series', w: 140 },
          ],
          rows: EXAMS.map(([sub, lvl, grade, pts, series]) => [
            txt(sub, { size: 12, weight: sub === 'Nine subjects' ? 400 : 600, color: sub === 'Nine subjects' ? C.mid : C.strong }),
            txt(lvl, { size: 12, color: C.mid }),
            grade.length > 2 ? txt(grade, { size: 11.5, color: C.mid }) : badge(grade, grade === 'A' ? 'ok' : 'plain'),
            mono(pts, { size: 12, color: C.body, weight: 700 }),
            mono(series, { size: 11.5 }),
          ]),
        }),
      )}
      ${section(
        { title: 'Since school', note: '7 entries &middot; 3 documents raised' },
        table({
          cols: [
            { label: 'When', w: 90 },
            { label: 'What' },
            { label: 'Reference', w: 180 },
            { label: 'Recorded', w: 200 },
          ],
          rows: CHRONOLOGY.map(([when, what, ref, who]) => [
            mono(when, { size: 11, color: C.mid, weight: 700 }),
            txt(what, { size: 12, color: C.body }),
            ref ? mono(ref, { size: 11, color: C.body }) : mono('—', { size: 11 }),
            mono(who, { size: 11 }),
          ]),
        }),
      )}
    `),
)

/* ── /schools/leavers/documents ─────────────────────────────────────────
   Five documents on the S-5.x pipeline, for one leaver, in one table: what
   state each is in, what holds it, and who signs it. The hold is a rule the
   school wrote down, so the rule is named on the row it stops — a disabled
   button with nothing beside it is how an office learns to telephone the
   bursar instead of reading the screen.
 */
const DOCUMENTS = [
  ['School-leaving certificate', 'Blocked', 'bad', '$210.00 on INV-2026-0509', 'The Head, or the Deputy', 'Record a payment', 'brand'],
  ['Transfer certificate', 'Ready to raise', 'brand', 'The fee hold is off for transfers', 'The Head', 'Raise it', 'plain'],
  ['Testimonial', 'Raised', 'ok', 'Raised 2 Sep 2026 &middot; Rudo Makoni', 'The Head', 'Print again', 'plain'],
  ['Statement of results', 'Blocked', 'bad', 'Results publish 4 Dec 2026', 'The Examinations Officer', 'Open publishing', 'plain'],
  ['Fees-clearance letter', 'Blocked', 'bad', '$210.00 owed', 'The Bursar', 'Open the ledger', 'plain'],
]

/** The artefact the page exists to produce, at A4 proportion. */
const certificate = () => `
  <div style="aspect-ratio: 1 / 1.414; background: ${C.surface}; border: 1px solid ${C.borderStrong}; border-radius: 3px; box-shadow: 0 10px 24px -12px rgba(42,38,34,.34); padding: 24px 26px; display: flex; flex-direction: column">
    <div style="text-align: center">
      <div style="width: 42px; height: 42px; border-radius: 999px; border: 1.5px solid ${C.strong}; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 7px">
        <span style="font-size: 13px; font-weight: 800; letter-spacing: .06em; color: ${C.strong}">CH</span>
      </div>
      <div style="font-size: 13px; font-weight: 800; letter-spacing: .08em; color: ${C.strong}">CHISHAWASHA HIGH SCHOOL</div>
      <div style="font-size: 10px; color: ${C.mid}; margin-top: 2px">Borrowdale campus &middot; Harare &middot; Zimbabwe</div>
    </div>
    <div style="height: 1px; background: ${C.strong}; margin: 13px 0 12px"></div>
    <div style="text-align: center">
      <div style="font-size: 14px; font-weight: 800; letter-spacing: .11em; color: ${C.strong}">SCHOOL LEAVING CERTIFICATE</div>
      <div class="mono" style="font-size: 10px; color: ${C.subtle}; margin-top: 4px">No. BOR/LC/2026/0184</div>
    </div>
    <div style="margin-top: 16px; font-size: 11px; line-height: 1.75; color: ${C.body}">
      <div style="color: ${C.mid}">This is to certify that</div>
      <div style="font-size: 15px; font-weight: 800; letter-spacing: .02em; color: ${C.strong}; margin: 3px 0 4px">NYASHA ZIMUTO</div>
      <div>admission number <span class="mono">CHS-1240</span>, born 8 April 2010, was a pupil of this school from <b>January 2023 to November 2026</b>, leaving from Form 4A having completed the Ordinary Level course.</div>
    </div>
    <div style="margin-top: 14px; border-top: 1px solid ${C.borderSubtle}; border-bottom: 1px solid ${C.borderSubtle}; padding: 11px 0; display: flex; flex-direction: column; gap: 9px">
      <div style="display: flex; gap: 10px">
        <span style="width: 62px; flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: .08em; color: ${C.subtle}">RESULTS</span>
        <span style="flex: 1; font-size: 11px; line-height: 1.6; color: ${C.body}">Sat ZIMSEC Ordinary Level in November 2026, eight subjects. A full statement of results is issued separately once the board publishes.</span>
      </div>
      <div style="display: flex; gap: 10px">
        <span style="width: 62px; flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: .08em; color: ${C.subtle}">CONDUCT</span>
        <span style="flex: 1; font-size: 11px; line-height: 1.6; color: ${C.body}">Her conduct throughout was good. No disciplinary matter is recorded against her.</span>
      </div>
    </div>
    <div style="flex: 1"></div>
    <div style="display: flex; align-items: flex-end; gap: 16px">
      <div style="flex: 1; min-width: 0">
        <div style="height: 26px; border-bottom: 1px solid ${C.strong}"></div>
        <div style="font-size: 11px; font-weight: 700; color: ${C.strong}; margin-top: 5px">Mrs R. Makoni</div>
        <div style="font-size: 10px; color: ${C.mid}">Deputy Head, for the Head of School</div>
        <div class="mono" style="font-size: 10px; color: ${C.subtle}; margin-top: 3px">Dated 27 November 2026</div>
      </div>
      <div style="width: 74px; height: 74px; border-radius: 999px; border: 1px dashed ${C.borderStrong}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">
        <span style="font-size: 10px; color: ${C.faint}; text-align: center; line-height: 1.3">School<br>seal</span>
      </div>
    </div>
  </div>`

export const LeavingDocuments = defineScreen(
  {
    screen: 'LeavingDocuments',
    route: '/schools/leavers/documents',
    story: 'S-13.5',
    title: 'Leaving documents',
    caption: 'Nyasha Zimuto &middot; CHS-1240 &middot; Form 4A',
    railItem: 'Leavers',
    back: true,
    search: null,
    scope: SCOPE,
    user: USER,
    action: { label: 'Raise the certificate', icon: I.file },
    chips: [
      { label: 'Raised', value: '1', tone: 'ok' },
      { label: 'Ready to raise', value: '1', tone: 'brand' },
      { label: 'Blocked', value: '3', tone: 'bad' },
      { label: 'Owing', value: '$210.00', tone: 'bad' },
    ],
  },
  () =>
    page(`
      ${grid(
        'minmax(0, 1fr) 540px',
        `
        ${stack(`
          ${alert({
            tone: 'bad',
            title: '$210.00 outstanding on INV-2026-0509 — two documents held',
            action: `<span style="display: flex; gap: 6px; align-items: center; flex-shrink: 0">${tinyBtn('Record a payment', 'brand')}${tinyBtn('Waive it')}</span>`,
          })}
          ${section(
            { title: 'The five documents', note: '1 raised &middot; 1 ready &middot; 3 held' },
            table({
              cols: [
                { label: 'Document' },
                { label: 'State', w: 96 },
                { label: 'Detail', w: 180 },
                { label: 'Signed by', w: 135 },
                { label: '', w: 120, align: 'right' },
              ],
              rows: DOCUMENTS.map(([name, state, tone, detail, who, verb, vtone]) => [
                txt(name, { size: 12.5, weight: 600, color: C.strong, ellipsis: true }),
                badge(state, tone),
                txt(detail, { size: 11.5, color: state === 'Blocked' ? C.bad : C.mid }),
                txt(who, { size: 11.5, color: C.mid, ellipsis: true }),
                tinyBtn(verb, vtone),
              ]),
            }),
          )}
        `)}
        ${section(
          { title: 'The certificate', note: 'A4 &middot; BOR/LC/2026/0184 &middot; held', actions: [tinyBtn('Print')] },
          certificate(),
        )}
      `,
      )}
    `),
)
