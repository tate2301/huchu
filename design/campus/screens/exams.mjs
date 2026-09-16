/**
 * Public exams — ZIMSEC and Cambridge candidate registration, subject entries,
 * seating and results. Five artboards, S-13.1 and S-13.2.
 *
 * Called by build-expansion.mjs.
 *
 * WHY THIS IS DRAWN AT ALL
 *
 * Public exams is the one thing every Zimbabwean secondary school does that the
 * pack cannot do in any form. A school that runs O and A Level today keeps the
 * candidate register in a spreadsheet, types the entry file by hand, and finds
 * out on the last Friday in August that four children have no birth certificate
 * number on file. That is the highest switching cost in the product and the
 * strongest single reason a head moves. The recommendation is an add-on at $99
 * a term from STANDARD upward — seasonal, and priced as an add-on because a
 * primary school should not pay for it.
 *
 * WHAT IS DELIBERATELY NOT DRAWN
 *
 * Direct submission to the exam authority. SCH-DEP-02 defers it: it needs an
 * external interface the board has not published and a policy review nobody has
 * booked. So these screens PRODUCE the entry file and a person uploads it —
 * which is why "Build the entry file" is a band action on ExamEntries and not a
 * card drawing an integration that does not exist. A drawn integration is a
 * promise, and this one cannot be kept.
 *
 * THE DEADLINE IS THE ARGUMENT
 *
 * A missed ZIMSEC entry deadline costs a pupil a year. So on Exams the deadline
 * is state, not decoration: it is the first band chip, it is the page's one
 * alert, and the four dates that follow it are a table of dates, days and
 * consequences rather than a paragraph each.
 *
 * HOW THESE FIVE ARE COMPOSED
 *
 * The default separator is section() — a heading on a hairline. One card is
 * spent on the whole page: the Main Hall seat plan, which is a physical object
 * and the only thing here that genuinely floats. Everything else that used to
 * be a box is either a section or a group inside the table it belonged to:
 *
 *   ExamCandidates — the blockers were a card of four paragraphs. They are one
 *     table now: blocker, who, count, verb, totalling 9 of 118. An unpaid entry
 *     fee is not one of the rows: the roll shows Mafuta and Nyathi as Ready with
 *     money owing, so the fee does not stop a registration. It is a COLUMN on
 *     the roll and a chip in the band, and the table totals what it lists.
 *   ExamEntries — the school's entry rule is properties at the head of the page,
 *     pressed to edit, not a card of read-only lines. The four stat tiles were
 *     the table's own total row drawn a second time, so they are gone.
 *   ExamSeating — rooms, access arrangements and the ten still to seat are one
 *     question ("where does every candidate sit") asked about three kinds of
 *     row, so they are one table with three group headers and a total.
 *   ExamResults — the distribution bars ARE the per-subject table; they are one
 *     structure with a whole-school bar on the total row.
 *
 * THE NUMBERS TIE ACROSS ALL FIVE SCREENS
 *
 *   826 O Level entries at $28.00 = $23,128.00 total entry fee
 *   619 of them invoiced ($17,332.00), 455 paid ($12,740.00)
 *   164 invoiced entries unpaid ($4,592.00), across 23 candidates — owed, but
 *   not a bar to registration, so it is a column and a chip, never a blocker
 *   207 entries added since the last run, $5,796.00 still to invoice
 *   9 of 118 candidates cannot be registered — 4 with no ID document,
 *   3 whose name differs from the certificate, 2 with no photograph
 *   124 exam places across five rooms, 108 seated, 16 free, 10 still to seat
 *   687 entries sat last November: 64 at A*–A, 118 B, 228 C, 177 D–E,
 *   77 F–G, 23 ungraded — 410 at C or better, which is the 60% on the
 *   total row and the only figure on these screens derived rather than given
 *
 * Nyasha Zimuto is entered for ten subjects on ExamCandidates and appears on
 * ExamEntries under "over the school maximum of nine", because a drawing that
 * contradicts itself one screen later is worth less than no drawing.
 */
import {
  C, I, esc, icon, page, grid, rowFlex, card, table, badge, mono, txt, alert,
  ghostBtn, filterSelect, searchField, segments, stat, avatar, tinyBtn,
  sectionLabel, section, properties, defineScreen,
} from '../lib/expansion-kit.mjs'

/* Phosphor names the kit's `I` has no key for. `ph()` throws on a wrong name,
   so these fail the build loudly rather than drawing a blank box. */
const CERT = 'Certificate'
const CHALK = 'ChalkboardTeacher'

const SCOPE = { group: 'Chishawasha Trust', campus: 'Borrowdale campus' }
const HEAD = { name: 'Rudo Makoni', role: 'Deputy Head' }
const BURSAR = { name: 'Loveness Chirwa', role: 'Bursar' }

const ini = (n) => {
  const [last, first] = n.split(', ')
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

const pad = (n) => String(n).padStart(4, '0')

/** Two lines in one table cell: a name, and the identifiers under it. Data, not prose. */
const twoLine = (top, sub, { strong = true } = {}) =>
  `<span style="min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: ${strong ? 600 : 500}; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(top)}</span>${mono(sub, { size: 10.5 })}</span>`

const candidateCell = (name, sno) =>
  `${avatar(ini(name))}${twoLine(name, sno)}`

/* ── /schools/exams ─────────────────────────────────────────────────────
   Two sections: the dates that follow the deadline, and the series. The days
   bar is a local composition because the kit has no primitive for "a date, and
   how far away it is", and it lives inside a table cell so the column still
   files itself into the checklist.
 */

const HORIZON = 60

const daysBar = (days) => {
  const tone = days <= 7 ? C.bad : days <= 21 ? C.warn : C.brand
  const pct = Math.max(4, Math.min(100, Math.round((days / HORIZON) * 100)))
  return `<span style="flex: 1; min-width: 0; height: 8px; border-radius: 999px; background: ${C.muted}; overflow: hidden; display: block"><span style="display: block; width: ${pct}%; height: 8px; border-radius: 999px; background: ${tone}"></span></span>${mono(`${days} days`, { size: 11.5, color: tone, weight: 700, width: 62 })}`
}

/** [what, when, days away, what follows] */
const DEADLINES = [
  ['Entries close', 'Monday 31 August 2026', 7, 'Late fee from this date'],
  ['Late entries, at a penalty', 'Monday 14 September 2026', 21, '$14.00 a subject on top'],
  ['Amendments and withdrawals close', 'Friday 2 October 2026', 39, 'Withdrawals not refunded'],
  ['Candidate schedules published', 'Friday 16 October 2026', 53, 'Names checked against the roll'],
]

const SERIES = [
  {
    name: 'ZIMSEC November 2026',
    centre: 'Centre 025419',
    level: 'Ordinary Level',
    close: '31 Aug 2026',
    closeTone: C.bad,
    candidates: '118',
    entries: '826',
    invoiced: '$17,332.00',
    collected: '$12,740.00',
    status: 'Open for entries',
    tone: 'brand',
    act: 'Open',
  },
  {
    name: 'ZIMSEC November 2026',
    centre: 'Centre 025419',
    level: 'Advanced Level',
    close: '31 Aug 2026',
    closeTone: C.bad,
    candidates: '46',
    entries: '141',
    invoiced: '$9,306.00',
    collected: '$7,242.00',
    status: 'Open for entries',
    tone: 'brand',
    act: 'Open',
  },
  {
    name: 'ZIMSEC June 2026',
    centre: 'Centre 025419 · resit',
    level: 'Ordinary Level',
    close: '6 Feb 2026',
    closeTone: C.subtle,
    candidates: '23',
    entries: '61',
    invoiced: '$1,708.00',
    collected: '$1,708.00',
    status: 'Entries closed',
    tone: 'warn',
    act: 'Open',
  },
  {
    name: 'Cambridge June 2026',
    centre: 'Centre ZW254',
    level: 'IGCSE',
    close: '20 Feb 2026',
    closeTone: C.subtle,
    candidates: '31',
    entries: '172',
    invoiced: '$12,040.00',
    collected: '$11,180.00',
    status: 'Results in',
    tone: 'ok',
    act: 'Results',
  },
  {
    name: 'ZIMSEC November 2025',
    centre: 'Centre 025419',
    level: 'Ordinary Level',
    close: '29 Aug 2025',
    closeTone: C.subtle,
    candidates: '112',
    entries: '687',
    invoiced: '$17,862.00',
    collected: '$17,862.00',
    status: 'Results in',
    tone: 'ok',
    act: 'Results',
  },
  {
    name: 'ZIMSEC November 2024',
    centre: 'Centre 025419',
    level: 'Ordinary Level',
    close: '30 Aug 2024',
    closeTone: C.subtle,
    candidates: '106',
    entries: '641',
    invoiced: '$15,384.00',
    collected: '$15,384.00',
    status: 'Archived',
    tone: 'plain',
    act: 'Results',
  },
]

export const Exams = defineScreen(
  {
    screen: 'Exams',
    route: '/schools/exams',
    story: 'S-13.1',
    title: 'Exam series',
    railItem: 'Exam series',
    action: { label: 'New series', icon: I.plus },
    search: 'Search series, candidates or centre numbers',
    scope: SCOPE,
    user: HEAD,
    chips: [
      { label: 'Days to the ZIMSEC deadline', value: '7', tone: 'bad' },
      { label: 'Candidates', value: '164' },
      { label: 'Entry fees unpaid', value: '$6,656', tone: 'warn' },
    ],
    bandActions: [ghostBtn('Print the deadline sheet', I.print)],
  },
  () =>
    page(`
      ${alert({
        tone: 'bad',
        title: 'Seven days to the ZIMSEC November deadline — nine of 118 O Level candidates cannot be registered',
        action: tinyBtn('Open the candidate roll', 'brand'),
      })}
      ${section(
        { title: 'ZIMSEC November 2026, Ordinary Level', note: 'entries close 31 August &middot; 7 days' },
        table({
          cols: [
            { label: 'Deadline' },
            { label: 'Date', w: 190 },
            { label: 'Days away' },
            { label: 'What follows', w: 230 },
          ],
          rows: DEADLINES.map(([what, when, days, then]) => [
            txt(what, { size: 12.5, weight: 600, color: C.strong }),
            mono(when, { size: 11.5, color: C.body }),
            daysBar(days),
            txt(then, { size: 11.5, color: C.subtle }),
          ]),
        }),
      )}
      ${section(
        { title: 'Series', note: '6 series &middot; 2 open for entries' },
        `${rowFlex(
          `${segments([{ label: 'All series', count: 6 }, { label: 'Open', count: 2 }, { label: 'Results in', count: 2 }], 'All series')}<div style="flex: 1"></div>${filterSelect('Board', 'Every board', { w: 160 })}${filterSelect('Level', 'Every level', { w: 160 })}${searchField('Search series', { w: 230 })}`,
          { align: 'flex-end' },
        )}
        ${table({
          cols: [
            { label: 'Series' },
            { label: 'Level', w: 120 },
            { label: 'Entries close', w: 120 },
            { label: 'Candidates', w: 88, align: 'right' },
            { label: 'Entries', w: 70, align: 'right' },
            { label: 'Invoiced', w: 95, align: 'right' },
            { label: 'Collected', w: 100, align: 'right' },
            { label: 'Status', w: 128 },
            { label: '', w: 68, align: 'right' },
          ],
          rows: SERIES.map((s) => [
            `${icon(CERT, { size: 15, stroke: s.tone === 'brand' ? C.brandStrong : C.faint })}${twoLine(s.name, s.centre)}`,
            txt(s.level, { size: 12, color: C.mid }),
            mono(s.close, { size: 11.5, color: s.closeTone, weight: s.closeTone === C.bad ? 700 : 400 }),
            mono(s.candidates, { size: 12, color: C.body }),
            mono(s.entries, { size: 12, color: C.body }),
            mono(s.invoiced, { size: 12, color: C.body }),
            mono(s.collected, { size: 12, color: s.collected === s.invoiced ? C.ok : C.warn, weight: 700 }),
            badge(s.status, s.tone),
            tinyBtn(s.act, s.tone === 'brand' ? 'brand' : 'plain'),
          ]),
        })}`,
      )}
    `),
)

/* ── /schools/exams/[seriesId]/candidates ───────────────────────────────
   The blockers were a card holding four paragraphs. They are one table: what
   stops the entry, who it stops, how many, and the verb.

   An unpaid entry fee is NOT in that table. The roll shows Mafuta and Nyathi
   as Ready with money owing, so the fee does not stop a registration and a row
   saying it did would have contradicted the 109/9 chips and left the count
   column summing to 32 under a total reading 9. The money is a column on the
   roll and a chip in the band; the table totals what it lists.
 */

/** [blocker, candidates, count, tone, verb] */
const BLOCKERS = [
  [
    'No ID document at all',
    'Ncube, Tariro · Chidziva, Blessing · Marufu, Anesu · Kamusika, Tafadzwa',
    '4',
    'bad',
    'Ring the guardians',
  ],
  [
    'Name differs from the birth certificate',
    'Sibanda, Ruvimbo · Mutasa, Tanaka · Muzengeza, Praise',
    '3',
    'bad',
    'Compare and correct',
  ],
  ['No photograph', 'Gomo, Panashe · Rusike, Anodiwa', '2', 'warn', 'Take the photographs'],
]

const ROLL = [
  ['0138', 'Gwatidzo, Rufaro', 'CHS-1198 · Form 4A', 'ID 63-1102847-K-42', '14 Mar 2009', 'F', '8', 'Paid', 'ok', 'Ready', 'ok', 'Open'],
  ['0139', 'Mafuta, Simba', 'CHS-1301 · Form 4B', 'Birth cert 254112/2009', '2 Jun 2009', 'M', '9', '$84.00 unpaid', 'warn', 'Ready', 'ok', 'Open'],
  ['0140', 'Ncube, Tariro', 'CHS-1226 · Form 4B', 'Nothing on file', '21 Nov 2008', 'F', '5', 'Paid', 'ok', 'No ID document', 'bad', 'Fix it'],
  ['0141', 'Nyathi, Kudzai', 'CHS-1233 · Form 4A', 'ID 63-1149021-B-42', '9 Jan 2009', 'M', '9', '$252.00 unpaid', 'warn', 'Ready', 'ok', 'Open'],
  ['0142', 'Sibanda, Ruvimbo', 'CHS-1249 · Form 4A', 'Birth cert 261904/2009', '30 Jul 2009', 'F', '8', 'Paid', 'ok', 'Name differs', 'bad', 'Fix it'],
  ['0143', 'Zimuto, Nyasha', 'CHS-1240 · Form 4A', 'ID 63-1156332-L-42', '4 Feb 2009', 'F', '10', 'Paid', 'ok', 'Ready', 'ok', 'Open'],
  ['0144', 'Gomo, Panashe', 'CHS-1255 · Form 4B', 'ID 63-1163778-D-42', '17 Sep 2008', 'M', '7', 'Paid', 'ok', 'No photograph', 'warn', 'Fix it'],
]

export const ExamCandidates = defineScreen(
  {
    screen: 'ExamCandidates',
    route: '/schools/exams/[seriesId]/candidates',
    story: 'S-13.1',
    title: 'Candidates',
    caption: 'ZIMSEC November 2026 &middot; Ordinary Level &middot; centre 025419',
    railItem: 'Exam series',
    back: true,
    action: { label: 'Register the year group', icon: I.userCheck },
    search: 'Search the candidate roll',
    scope: SCOPE,
    user: HEAD,
    chips: [
      { label: 'Candidates', value: '118' },
      { label: 'Ready to register', value: '109', tone: 'ok' },
      { label: 'Cannot be registered', value: '9', tone: 'bad' },
      { label: 'Entry fees unpaid', value: '$4,592.00', tone: 'warn' },
      { label: 'Days left', value: '7', tone: 'bad' },
    ],
    bandActions: [ghostBtn('Candidate numbers', I.idCard), ghostBtn('Print the roll', I.print)],
  },
  () =>
    page(`
      ${section(
        {
          title: 'What is stopping an entry',
          note: '9 of 118 blocked &middot; 7 days left',
          actions: [tinyBtn('Chase all nine', 'brand')],
        },
        table({
          cols: [
            { label: 'Blocker', w: 270 },
            { label: 'Candidates' },
            { label: 'Count', w: 66, align: 'right' },
            { label: '', w: 160, align: 'right' },
          ],
          rows: BLOCKERS.map((r) => [
            txt(r[0], { size: 12.5, weight: 600, color: C.strong }),
            mono(r[1], { size: 11, color: C.mid }),
            mono(r[2], { size: 13, color: r[3] === 'bad' ? C.bad : C.warn, weight: 700 }),
            tinyBtn(r[4], 'brand'),
          ]).concat([
            {
              total: [
                txt('Cannot be registered', { size: 12.5, color: C.body }),
                txt('Ready to register &middot; 109', { size: 12, color: C.mid }),
                mono('9 of 118', { size: 12, color: C.bad, weight: 700 }),
                '',
              ],
            },
          ]),
        }),
      )}
      ${section(
        { title: 'The roll', note: '118 candidates &middot; 0138 to 0255 &middot; 7 shown' },
        `${rowFlex(
          `${segments([{ label: 'The whole roll', count: 118 }, { label: 'Blocked', count: 9 }, { label: 'Registered', count: 0 }], 'The whole roll')}<div style="flex: 1"></div>${filterSelect('Class', 'All of Form 4', { w: 150 })}${filterSelect('Status', 'Any status', { w: 140 })}${searchField('Name or candidate number', { w: 230 })}`,
          { align: 'flex-end' },
        )}
        ${table({
          cols: [
            { label: 'Cand no', w: 66 },
            { label: 'Pupil' },
            { label: 'ID or birth certificate', w: 175 },
            { label: 'Born', w: 90 },
            { label: 'Sex', w: 46 },
            { label: 'Subjects', w: 76, align: 'right' },
            { label: 'Entry fees', w: 120 },
            { label: 'Registration', w: 150 },
            { label: '', w: 70, align: 'right' },
          ],
          rows: ROLL.map(
            ([no, name, sub, id, born, sex, subs, fee, feeTone, status, statusTone, act]) => [
              mono(no, { size: 12, color: C.brandStrong, weight: 700 }),
              candidateCell(name, sub),
              id === 'Nothing on file'
                ? `${icon(I.alert, { size: 13, stroke: C.bad })}${txt('Nothing on file', { size: 11.5, color: C.bad, weight: 600 })}`
                : mono(id, { size: 11, color: C.body }),
              mono(born, { size: 11.5 }),
              mono(sex, { size: 11.5, color: C.mid }),
              mono(subs, { size: 12, color: subs === '10' || subs === '5' ? C.warn : C.body, weight: subs === '10' || subs === '5' ? 700 : 400 }),
              badge(fee, feeTone),
              badge(status, statusTone),
              tinyBtn(act, statusTone === 'ok' ? 'plain' : 'brand'),
            ],
          ),
        })}`,
      )}
    `),
)

/* ── /schools/exams/[seriesId]/entries ──────────────────────────────────
   Subjects down, money across, and the rule the money is measured against at
   the head of the page as properties — pressed to change, not parked in a card
   beside the thing it governs. The exceptions are the same list the matrix
   cannot answer, grouped by which end of the rule they fall off.
 */

const SUBJECTS = [
  ['Mathematics', '4008', '118', '$3,304.00', '$3,304.00', '$2,688.00', '—'],
  ['English Language', '1122', '118', '$3,304.00', '$3,304.00', '$2,688.00', '—'],
  ['Combined Science', '5008', '112', '$3,136.00', '$3,136.00', '$2,296.00', '—'],
  ['Shona', '3159', '104', '$2,912.00', '$2,912.00', '$2,072.00', '—'],
  ['Geography', '2248', '96', '$2,688.00', '$2,688.00', '$1,708.00', '—'],
  ['History', '2167', '71', '$1,988.00', '$1,988.00', '$1,288.00', '—'],
  ['Accounting', '7707', '63', '$1,764.00', '—', '—', '$1,764.00'],
  ['Agriculture', '5038', '58', '$1,624.00', '—', '—', '$1,624.00'],
  ['Commerce', '7100', '52', '$1,456.00', '—', '—', '$1,456.00'],
  ['Physical Science', '4023', '34', '$952.00', '—', '—', '$952.00'],
]

/** [cand no, name, pupil number, class, subjects, tone] */
const OUTSIDE = [
  { group: 'Below the minimum of six' },
  ['0140', 'Ncube, Tariro', 'CHS-1226', 'Form 4B', '5', 'bad'],
  ['0166', 'Chidziva, Blessing', 'CHS-1262', 'Form 4A', '5', 'bad'],
  ['0203', 'Marufu, Anesu', 'CHS-1279', 'Form 4C', '4', 'bad'],
  { group: 'Over the school maximum of nine' },
  ['0143', 'Zimuto, Nyasha', 'CHS-1240', 'Form 4A', '10', 'warn'],
  ['0181', 'Chirwa, Kudakwashe', 'CHS-1268', 'Form 4B', '11', 'warn'],
]

export const ExamEntries = defineScreen(
  {
    screen: 'ExamEntries',
    route: '/schools/exams/[seriesId]/entries',
    story: 'S-13.1',
    title: 'Subject entries',
    caption: 'ZIMSEC November 2026 &middot; Ordinary Level',
    railItem: 'Exam series',
    back: true,
    action: { label: 'Invoice the entries', icon: I.receipt },
    search: 'Search entries by subject or candidate',
    scope: SCOPE,
    user: BURSAR,
    chips: [
      { label: 'Entries', value: '826' },
      { label: 'Still to invoice', value: '$5,796.00', tone: 'warn' },
      { label: 'Below the minimum', value: '3', tone: 'bad' },
      { label: 'Over the maximum', value: '2', tone: 'warn' },
      { label: 'Entry file built', value: '24 Aug · 619 entries' },
    ],
    bandActions: [ghostBtn('Build the entry file', I.download)],
  },
  () =>
    page(`
      ${properties(
        [
          ['Subjects at least', '6'],
          ['Subjects at most', '9'],
          ['Entry fee a subject', '$28.00'],
          ['English Language', 'Compulsory'],
          ['Mathematics', 'Compulsory'],
          ['Late entry penalty', '$14.00 a subject'],
        ],
        { cols: 3, labelW: 140 },
      )}
      ${alert({
        tone: 'warn',
        title: '207 entries, $5,796.00, have never been charged to a fee account',
        action: tinyBtn('Show the 207', 'brand'),
      })}
      ${section(
        { title: 'Subjects entered', note: '10 subjects &middot; 826 entries &middot; $23,128.00' },
        `${rowFlex(
          `${segments([{ label: 'By subject', count: 10 }, { label: 'By candidate', count: 118 }], 'By subject')}<div style="flex: 1"></div>${filterSelect('Level', 'Ordinary Level', { w: 160 })}${searchField('Subject or code', { w: 210 })}`,
          { align: 'flex-end' },
        )}
        ${table({
          cols: [
            { label: 'Subject' },
            { label: 'Code', w: 70 },
            { label: 'Entries', w: 80, align: 'right' },
            { label: 'Total fee', w: 110, align: 'right' },
            { label: 'Invoiced', w: 110, align: 'right' },
            { label: 'Paid', w: 110, align: 'right' },
            { label: 'To invoice', w: 110, align: 'right' },
          ],
          rows: SUBJECTS.map(([name, code, n, total, invoiced, paid, toInvoice]) => [
            txt(name, { size: 12.5, weight: 600, color: C.strong }),
            mono(code, { size: 11.5, color: C.brandStrong, weight: 700 }),
            mono(n, { size: 12, color: C.body }),
            mono(total, { size: 12, color: C.body }),
            mono(invoiced, { size: 12, color: invoiced === '—' ? C.faint : C.body }),
            mono(paid, { size: 12, color: paid === '—' ? C.faint : C.ok }),
            mono(toInvoice, { size: 12, color: toInvoice === '—' ? C.faint : C.warn, weight: toInvoice === '—' ? 400 : 700 }),
          ]).concat([
            {
              total: [
                txt('All subjects', { size: 12.5, weight: 600, color: C.strong }),
                '',
                mono('826', { size: 12, color: C.strong, weight: 700 }),
                mono('$23,128.00', { size: 12, color: C.strong, weight: 700 }),
                mono('$17,332.00', { size: 12, color: C.strong, weight: 700 }),
                mono('$12,740.00', { size: 12, color: C.ok, weight: 700 }),
                mono('$5,796.00', { size: 12, color: C.warn, weight: 700 }),
              ],
            },
          ]),
        })}`,
      )}
      ${section(
        {
          title: 'Candidates outside the rule',
          note: '5 of 118',
          actions: [tinyBtn('Open each one', 'brand')],
        },
        table({
          cols: [
            { label: 'Cand no', w: 80 },
            { label: 'Pupil' },
            { label: 'Pupil number', w: 110 },
            { label: 'Class', w: 110 },
            { label: 'Subjects', w: 90, align: 'right' },
            { label: '', w: 80, align: 'right' },
          ],
          rows: OUTSIDE.map((r) =>
            r.group !== undefined
              ? r
              : [
                  mono(r[0], { size: 12, color: C.brandStrong, weight: 700 }),
                  txt(r[1], { size: 12.5, weight: 600, color: C.strong }),
                  mono(r[2], { size: 11, color: C.mid }),
                  txt(r[3], { size: 12, color: C.mid }),
                  mono(r[4], { size: 12.5, color: r[5] === 'bad' ? C.bad : C.warn, weight: 700 }),
                  tinyBtn('Fix it', 'brand'),
                ],
          ),
        }),
      )}
    `),
)

/* ── /schools/exams/[seriesId]/seating ──────────────────────────────────
   One room as a grid, everybody as a table. The grid is composed from C tokens
   because the kit has no seat-plan primitive and a table of 48 seat numbers is
   unreadable — a hall is a shape, and an invigilator reads it as one. It is the
   only card on this page, and the only thing on these five screens that
   genuinely floats above the ground.
 */

const HALL_SEATS = 54
const HALL_TAKEN = 48

/* Candidates who are not in the hall: the six on access arrangements below and
   the four named on "Still to seat". The hall is numbered around them, so no
   candidate is drawn in two rooms at once. */
const PLACED_ELSEWHERE = new Set([138, 139, 140, 142, 166, 181, 186, 187, 188, 203])
const HALL_CANDS = []
for (let c = 138; HALL_CANDS.length < HALL_TAKEN; c += 1) {
  if (!PLACED_ELSEWHERE.has(c)) HALL_CANDS.push(c)
}

/** Panashe Gomo, 0144 — the candidate entered for two papers in this session. */
const CLASH_SEAT = HALL_CANDS.indexOf(144) + 1

const seatCell = (n) => {
  const taken = n <= HALL_TAKEN
  const cand = HALL_CANDS[n - 1]
  const clash = n === CLASH_SEAT
  const bg = clash ? C.badBg : taken ? C.surface : 'transparent'
  const bd = clash ? C.badBd : taken ? C.border : C.borderSubtle
  return `<div style="height: 42px; border: 1px ${taken ? 'solid' : 'dashed'} ${bd}; border-radius: 6px; background: ${bg}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px">
      <span class="mono" style="font-size: 9px; color: ${clash ? C.bad : C.faint}">${pad(n)}</span>
      ${taken ? `<span class="mono" style="font-size: 11px; font-weight: 700; color: ${clash ? C.bad : C.body}">${pad(cand)}</span>` : `<span style="font-size: 9.5px; color: ${C.faint}">free</span>`}
    </div>`
}

const seatGrid = () =>
  `<div style="padding: 13px; display: flex; flex-direction: column; gap: 10px">
    <div style="display: flex; align-items: center; gap: 8px">
      ${sectionLabel('Front of the hall · invigilator’s desk')}
      <div style="flex: 1; height: 1px; background: ${C.borderStrong}"></div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px">
      ${Array.from({ length: HALL_SEATS }, (_, i) => seatCell(i + 1)).join('')}
    </div>
    <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding-top: 2px">
      ${[
        ['Seated', C.surface, C.border, C.body],
        ['Free', 'transparent', C.borderSubtle, C.faint],
        ['Clash', C.badBg, C.badBd, C.bad],
      ]
        .map(
          ([label, bg, bd, fg]) =>
            `<span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 14px; height: 14px; border-radius: 4px; background: ${bg}; border: 1px solid ${bd}"></span><span style="font-size: 11px; color: ${fg}">${label}</span></span>`,
        )
        .join('')}
      <div style="flex: 1"></div>
      ${mono(`Seats 0001–${pad(HALL_TAKEN)} · candidates ${pad(HALL_CANDS[0])}–${pad(HALL_CANDS[HALL_TAKEN - 1])} · six placed elsewhere`, { size: 10.5 })}
    </div>
  </div>`

const roomCell = (name, tone) =>
  `${icon(I.building, { size: 14, stroke: tone === 'warn' ? C.warn : C.faint })}${txt(name, { size: 12.5, weight: 600, color: C.strong })}`

const invigilatorCell = (who) =>
  who === '—'
    ? mono('—', { size: 11.5, color: C.faint })
    : `${icon(CHALK, { size: 13, stroke: who === 'Nobody named' ? C.warn : C.faint })}${txt(who, { size: 11.5, color: who === 'Nobody named' ? C.warn : C.mid, ellipsis: true })}`

/** [cand no, room or candidate, seats, capacity or arrangement, invigilator, status, tone] */
const SEATING = [
  { group: 'Rooms in this session' },
  ['', 'Main Hall', '0001–0048', 'Capacity 54 · 48 seated', 'Farai Moyo', 'Ready', 'ok'],
  ['', 'Room 14', '0055–0082', 'Capacity 30 · 28 seated', 'Rudo Makoni', 'Ready', 'ok'],
  ['', 'Room 15', '0085–0110', 'Capacity 30 · 26 seated', 'Tendai Sibanda', 'Ready', 'ok'],
  ['', 'Library annexe', '0115–0119', 'Capacity 8 · 5 seated', 'Nobody named', 'No invigilator', 'warn'],
  ['', 'Sick bay', '0123', 'Capacity 2 · 1 seated', 'Sister Moyo', 'Ready', 'ok'],
  { group: 'Access arrangements · 6 candidates' },
  ['0142', 'Sibanda, Ruvimbo', 'Annexe 0115', '25% extra time · to 11:30', 'Nobody named', 'Extra time', 'brand'],
  ['0139', 'Mafuta, Simba', 'Annexe 0116', '25% extra time · to 11:30', 'Nobody named', 'Extra time', 'brand'],
  ['0181', 'Chirwa, Kudakwashe', 'Annexe 0117', 'Separate room · anxiety', 'Nobody named', 'Separate room', 'brand'],
  ['0203', 'Marufu, Anesu', 'Annexe 0118', '25% extra time · to 11:30', 'Nobody named', 'Extra time', 'brand'],
  ['0138', 'Gwatidzo, Rufaro', 'Annexe 0119', '25% extra time and a reader', 'Nobody named', 'Extra time', 'brand'],
  ['0140', 'Ncube, Tariro', 'Sick bay 0123', 'Reader · does not explain', 'Sister Moyo', 'Reader', 'brand'],
  { group: 'Still to seat · 4 of 10 shown' },
  ['0166', 'Chidziva, Blessing', '—', 'Below the minimum of six', '—', 'Not seated', 'warn'],
  ['0186', 'Kamusika, Tafadzwa', 'Room 15 · 0111', 'Registered after numbering', '—', 'Suggested', 'plain'],
  ['0187', 'Rusike, Anodiwa', 'Room 15 · 0112', 'Registered after numbering', '—', 'Suggested', 'plain'],
  ['0188', 'Muzengeza, Praise', 'Room 15 · 0113', 'Registered after numbering', '—', 'Suggested', 'plain'],
]

export const ExamSeating = defineScreen(
  {
    screen: 'ExamSeating',
    route: '/schools/exams/[seriesId]/seating',
    story: 'S-13.1',
    title: 'Seating and invigilation',
    caption: 'Mathematics Paper 1 (4008/1) &middot; Tuesday 3 November, 09:00 &middot; two hours',
    railItem: 'Exam series',
    back: true,
    action: { label: 'Assign seats', icon: I.grid },
    search: 'Find a candidate’s seat',
    scope: SCOPE,
    user: HEAD,
    chips: [
      { label: 'Candidates', value: '118' },
      { label: 'Seated', value: '108', tone: 'ok' },
      { label: 'Still to seat', value: '10', tone: 'warn' },
      { label: 'Sitting two papers at once', value: '1', tone: 'bad' },
    ],
    bandActions: [ghostBtn('Print the seating plan', I.print), ghostBtn('Attendance sheets', I.file)],
  },
  () =>
    page(`
      ${alert({
        tone: 'bad',
        title: 'Panashe Gomo is entered for two papers at 09:00 — Mathematics 4008/1 and Geography 2248/1',
        action: tinyBtn('Open the clash', 'brand'),
      })}
      ${grid(
        '420px minmax(0, 1fr)',
        `
        ${card({
          title: 'Main Hall',
          note: '48 of 54 seats &middot; Farai Moyo',
          actions: [tinyBtn('Renumber the hall')],
          children: seatGrid(),
        })}
        ${section(
          {
            title: 'Where everyone sits',
            note: '108 of 118 seated &middot; 16 places free',
            actions: [tinyBtn('Seat all ten', 'brand')],
          },
          `${rowFlex(
            `${segments([{ label: 'This session', count: 118 }, { label: 'The whole timetable', count: 26 }], 'This session')}<div style="flex: 1"></div>${filterSelect('Session', 'Tue 3 Nov, 09:00', { w: 160 })}${filterSelect('Paper', 'Mathematics 4008/1', { w: 170 })}${searchField('Name or candidate number', { w: 190 })}`,
            { align: 'flex-end' },
          )}
          ${table({
            cols: [
              { label: 'Cand no', w: 66 },
              { label: 'Room or candidate', w: 176 },
              { label: 'Seats', w: 116 },
              { label: 'Capacity or arrangement' },
              { label: 'Invigilator', w: 132 },
              { label: 'Status', w: 118 },
            ],
            rows: SEATING.map((r) =>
              r.group !== undefined
                ? r
                : [
                    r[0] ? mono(r[0], { size: 12, color: C.brandStrong, weight: 700 }) : '',
                    r[0] ? txt(r[1], { size: 12.5, weight: 600, color: C.strong }) : roomCell(r[1], r[6]),
                    mono(r[2], { size: 11.5, color: r[2] === '—' ? C.faint : C.body }),
                    txt(r[3], { size: 12, color: C.mid }),
                    invigilatorCell(r[4]),
                    badge(r[5], r[6]),
                  ],
            ).concat([
              {
                total: [
                  '',
                  txt('Five rooms · 118 candidates', { size: 12.5, color: C.body }),
                  mono('124 places', { size: 11.5, color: C.body }),
                  txt('108 seated &middot; 16 free', { size: 12, color: C.mid }),
                  '',
                  badge('10 still to seat', 'warn'),
                ],
              },
            ]),
          })}`,
        )}
      `,
      )}
    `),
)

/* ── /schools/exams/[seriesId]/results ──────────────────────────────────
   The bars and the per-subject table were the same question drawn twice, so
   they are one table: the distribution is a column, and the total row carries
   the whole school's 687 entries as one bar. Six bands, not nine, because at
   this width nine bands is a stripe nobody can read and "A* to C" is the
   sentence a head actually says.

   The statement of results and its provenance are the office's half of the
   screen: a former pupil at the counter in January, and the question "who
   typed this grade" answered before it is asked.
 */

const BANDS = [
  ['A*–A', C.ok],
  ['B', C.teal],
  ['C', C.okBd],
  ['D–E', C.warnBd],
  ['F–G', C.orangeBd],
  ['U', C.badBd],
]

const RESULTS = [
  ['Mathematics', '4008', 112, [9, 14, 31, 31, 18, 9], '48%', '−3', 'bad'],
  ['English Language', '1122', 112, [7, 19, 40, 30, 13, 3], '59%', '+5', 'ok'],
  ['Combined Science', '5008', 104, [11, 18, 34, 27, 11, 3], '61%', '+2', 'ok'],
  ['Shona', '3159', 98, [14, 22, 36, 18, 7, 1], '73%', '+6', 'ok'],
  ['Geography', '2248', 88, [6, 13, 29, 26, 11, 3], '55%', '+1', 'ok'],
  ['History', '2167', 64, [5, 11, 21, 18, 7, 2], '58%', '−4', 'bad'],
  ['Accounting', '7707', 57, [8, 12, 19, 12, 5, 1], '68%', '+3', 'ok'],
  ['Agriculture', '5038', 52, [4, 9, 18, 15, 5, 1], '60%', '+2', 'ok'],
]

/* The whole school, band by band — the eight subject rows added up. 687
   entries, of which 410 at C or better, which is the 60% on the total row. */
const ALL_BANDS = RESULTS.reduce(
  (acc, [, , , counts]) => acc.map((n, i) => n + counts[i]),
  [0, 0, 0, 0, 0, 0],
)
const ALL_SAT = ALL_BANDS.reduce((a, b) => a + b, 0)

const distBar = (counts, total) =>
  `<span style="flex: 1; min-width: 0; display: flex; height: 15px; border-radius: 4px; overflow: hidden; background: ${C.muted}">${counts
    .map(
      (n, i) =>
        `<span title="${BANDS[i][0]}" style="width: ${((n / total) * 100).toFixed(2)}%; background: ${BANDS[i][1]}; display: block"></span>`,
    )
    .join('')}</span>`

const gradeChip = (grade, tone) => {
  const bg = tone === 'ok' ? C.okBg : tone === 'warn' ? C.warnBg : C.badBg
  const fg = tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.bad
  return `<span class="mono" style="display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 26px; padding: 0 7px; border-radius: 6px; background: ${bg}; color: ${fg}; font-size: 14px; font-weight: 700">${esc(grade)}</span>`
}

const STATEMENT = [
  ['Shona', '3159', 'A', 'ok'],
  ['Mathematics', '4008', 'B', 'ok'],
  ['Combined Science', '5008', 'B', 'ok'],
  ['English Language', '1122', 'C', 'ok'],
  ['Geography', '2248', 'C', 'ok'],
  ['History', '2167', 'D', 'warn'],
  ['Accounting', '7707', 'C', 'ok'],
]

const PROVENANCE = [
  ['ZIMSEC statement of results', 'Centre 025419 · 112 candidates · printed', '21 Jan 2026'],
  ['Captured, 98 candidates', 'Rudo Makoni, Deputy Head', '23 Jan 2026 14:06'],
  ['Captured, 14 candidates', 'Loveness Chirwa, Bursar', '24 Jan 2026 09:40'],
  ['Checked line by line against the print', 'Elias Chikafu, Group Head', '26 Jan 2026 08:15'],
  ['Two grades amended after a remark', 'Rudo Makoni · History 2167, D to C', '19 Feb 2026 11:02'],
]

export const ExamResults = defineScreen(
  {
    screen: 'ExamResults',
    route: '/schools/exams/[seriesId]/results',
    story: 'S-13.2',
    title: 'Public results',
    caption: 'ZIMSEC November 2025 &middot; Ordinary Level &middot; 112 candidates',
    railItem: 'Exam series',
    back: true,
    action: { label: 'Capture results', icon: I.note },
    search: 'Name, candidate number or centre',
    scope: SCOPE,
    user: HEAD,
    chips: [
      { label: 'Statement received', value: '21 Jan 2026' },
      { label: 'Against last November', value: '+2 pts', tone: 'ok' },
      { label: 'Subjects that fell', value: '2', tone: 'bad' },
      { label: 'Grades amended', value: '2', tone: 'warn' },
    ],
    bandActions: [ghostBtn('Statement of results', I.file), ghostBtn('Export the analysis', I.download)],
  },
  () =>
    page(`
      ${grid(
        4,
        `
        ${stat({ label: 'Candidates', value: '112', note: '687 entries &middot; 6.1 subjects each' })}
        ${stat({ label: 'Five or more at C', value: '79', tone: 'ok', note: '71% &middot; 69% last November' })}
        ${stat({ label: 'A* and A grades', value: '64', note: '9.3% of all entries' })}
        ${stat({ label: 'Ungraded', value: '23', tone: 'bad', note: '3.3% &middot; nine of them in Mathematics' })}
      `,
      )}
      ${section(
        { title: 'Grades by subject', note: '8 subjects &middot; 687 entries &middot; 2 fell' },
        `${rowFlex(
          `${segments([{ label: 'By subject', count: 8 }, { label: 'By candidate', count: 112 }], 'By subject')}<div style="flex: 1"></div>${filterSelect('Series', 'ZIMSEC November 2025', { w: 210 })}${filterSelect('Compare with', 'November 2024', { w: 170 })}${searchField('Name or candidate number', { w: 220 })}`,
          { align: 'flex-end' },
        )}
        ${table({
          cols: [
            { label: 'Subject', w: 190 },
            { label: 'Code', w: 70 },
            { label: 'Sat', w: 60, align: 'right' },
            { label: 'A* to U' },
            { label: 'C or better', w: 96, align: 'right' },
            { label: 'Against 2024', w: 110, align: 'right' },
          ],
          rows: RESULTS.map(([name, code, total, counts, cplus, delta, tone]) => [
            txt(name, { size: 12.5, weight: 600, color: C.strong }),
            mono(code, { size: 11.5, color: C.brandStrong, weight: 700 }),
            mono(String(total), { size: 12, color: C.mid }),
            distBar(counts, total),
            mono(cplus, { size: 12.5, color: C.strong, weight: 700 }),
            badge(`${delta} pts`, tone),
          ]).concat([
            {
              total: [
                txt('All subjects', { size: 12.5, weight: 600, color: C.strong }),
                '',
                mono(String(ALL_SAT), { size: 12, color: C.strong, weight: 700 }),
                distBar(ALL_BANDS, ALL_SAT),
                mono('60%', { size: 12.5, color: C.strong, weight: 700 }),
                badge('2 fell', 'bad'),
              ],
            },
          ]),
        })}
        ${rowFlex(
          BANDS.map(
            ([label, colour]) =>
              `<span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 18px; height: 10px; border-radius: 3px; background: ${colour}"></span><span style="font-size: 11px; color: ${C.mid}">${label}</span></span>`,
          ).join(''),
          { gap: 16, wrap: 'wrap' },
        )}`,
      )}
      ${grid(
        'minmax(0, 1fr) 470px',
        `
        ${section(
          { title: 'Where these grades came from', note: '112 candidates &middot; 2 amended' },
          table({
            cols: [
              { label: 'What' },
              { label: 'Who', w: 280 },
              { label: 'When', w: 160, align: 'right' },
            ],
            rows: PROVENANCE.map(([what, who, when]) => [
              txt(what, { size: 12.5, weight: 600, color: C.strong }),
              txt(who, { size: 11.5, color: C.mid, ellipsis: true }),
              mono(when, { size: 11, color: C.mid }),
            ]),
          }),
        )}
        ${section(
          {
            title: 'Muchemwa, Tinashe',
            note: '0087 &middot; centre 025419',
            actions: [tinyBtn('Print the statement', 'brand')],
          },
          table({
            cols: [
              { label: 'Subject' },
              { label: 'Code', w: 80 },
              { label: 'Grade', w: 110, align: 'center' },
            ],
            rows: STATEMENT.map(([subject, code, grade, tone]) => [
              txt(subject, { size: 12.5, weight: 600, color: C.strong }),
              mono(code, { size: 11.5, color: C.brandStrong, weight: 700 }),
              gradeChip(grade, tone),
            ]).concat([
              {
                total: [
                  `${icon(I.graduation, { size: 15, stroke: C.ok })}${txt('Qualifies for A Level', { size: 12.5, weight: 600, color: C.ok })}`,
                  '',
                  badge('6 at C or better', 'ok'),
                ],
              },
            ]),
          }),
        )}
      `,
      )}
    `),
)
