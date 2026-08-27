/**
 * Office page — the ten screens a head, deputy or registrar opens across a
 * term: the overview, the register board, notices, documents, the two fee
 * reports, parent meetings, the timetable, homework and subject targets.
 *
 * Every string that ships is the source verbatim — `components/schools/*`,
 * the `app/schools` page files, and `components/schools/common/filter-select.tsx`
 * for the filter idiom (a labelled dropdown whose closed state names what it
 * filters, with an `allLabel` like "Every year group" standing in for "no
 * filter"). Where a screen has no filters today and plainly needs them, the
 * artboard draws the FilterBar the rest of the module already uses rather than
 * inventing a new control.
 */
import {
  C, I, icon, esc, adminArtboard, page, grid, stack, rowFlex, card, table, listRow,
  badge, avatar, mono, txt, alert, emptyState, ghostBtn, solidBtn, dangerBtn,
  filterSelect, searchField, segments, sectionLabel, stat, tinyBtn, dot,
} from '../lib/kit.mjs'

/* ── shared ─────────────────────────────────────────────────────────── */

/**
 * The filter row. `FilterBar` is `flex flex-wrap items-end gap-3` — it wraps
 * rather than scrolling sideways, "because a filter you have to swipe to find
 * is one you do not know is set".
 */
const filters = (controls, trailing = '') =>
  `<div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px">${controls}${
    trailing ? `<div style="flex: 1; min-width: 8px"></div>${trailing}` : ''
  }</div>`

/** The `PageHeading description` line, on the four screens that carry one. */
const lede = (t) =>
  `<div style="font-size: 12.5px; color: ${C.mid}; line-height: 1.55; max-width: 760px">${t}</div>`

/** A section title in the page body — `h2.text-section-title`. */
const sectionTitle = (t, trailing = '') =>
  `<div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap"><h2 style="margin: 0; font-size: 13px; font-weight: 700; color: ${C.strong}; letter-spacing: -.005em">${esc(t)}</h2><div style="flex: 1"></div>${trailing}</div>`

/** A filled progress track. */
const progress = (pct, color = C.brand, h = 6) =>
  `<div style="height: ${h}px; border-radius: 999px; background: ${C.sunken}; overflow: hidden"><div style="width: ${pct}%; height: 100%; border-radius: 999px; background: ${color}"></div></div>`

/** A one-line key and value inside a panel. */
const kv = (k, v, { color = C.strong, weight = 700 } = {}) =>
  `<div style="display: flex; align-items: baseline; gap: 10px"><span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${C.mid}">${k}</span>${mono(v, { size: 12.5, color, weight })}</div>`

/** A column pair in a bar chart. */
const chartBar = (label, a, b, max, ca, cb, h = 128) => `
  <div style="display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; align-items: center">
    <div style="display: flex; align-items: flex-end; gap: 3px; height: ${h}px">
      <span style="width: 15px; height: ${Math.max(2, Math.round((a / max) * h))}px; border-radius: 3px 3px 0 0; background: ${ca}"></span>
      ${b !== null ? `<span style="width: 15px; height: ${Math.max(2, Math.round((b / max) * h))}px; border-radius: 3px 3px 0 0; background: ${cb}"></span>` : ''}
    </div>
    <span style="font-size: 10.5px; color: ${C.subtle}; white-space: nowrap">${label}</span>
  </div>`

const legend = (items) =>
  `<div style="display: flex; gap: 12px">${items
    .map(
      ([l, c]) =>
        `<span style="display: flex; align-items: center; gap: 5px"><span style="width: 8px; height: 8px; border-radius: 2px; background: ${c}"></span><span style="font-size: 11px; color: ${C.mid}">${l}</span></span>`,
    )
    .join('')}</div>`

/** Two-line cell: a bold line over a muted one. */
const twoLine = (a, b, { mono: isMono = false } = {}) =>
  `<span style="min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${a}</span>${
    isMono
      ? mono(b, { size: 10.5 })
      : `<span style="display: block; font-size: 11px; color: ${C.subtle}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${b}</span>`
  }</span>`

/** Initials from "Surname, Forename" or "Forename Surname". */
const ini = (name) => {
  const parts = name.includes(', ') ? name.split(', ').reverse() : name.split(' ')
  return (parts[0][0] + (parts[1] ?? ' ')[0]).toUpperCase().trim()
}

/* ── 1. /schools — the overview a head actually wants ───────────────── */
const missingRegister = (cls, teacher, note, last) =>
  listRow(
    `<span style="width: 8px; flex-shrink: 0">${dot(C.bad)}</span>
     ${txt(cls, { size: 12.5, weight: 700, color: C.strong, flex: '0 0 108px' })}
     <span style="flex: 1; min-width: 0">${txt(teacher, { size: 12, color: C.mid, ellipsis: true })}</span>
     ${mono(note, { size: 11 })}
     ${tinyBtn('Remind')}`,
    { last },
  )

const waitingRow = (glyph, title, sub, count, tone, last) =>
  listRow(
    `<span style="width: 26px; height: 26px; border-radius: 7px; background: ${C.muted}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${icon(glyph, { size: 14 })}</span>
     <span style="flex: 1; min-width: 0">${twoLine(title, sub)}</span>
     ${badge(count, tone)}
     ${icon(I.chevR, { size: 13, stroke: C.faint })}`,
    { last },
  )

export const Overview = () =>
  adminArtboard({
    title: 'School overview',
    railItem: 'School Overview',
    caption: 'Term 2 &middot; Tuesday 25 August 2026',
    search: 'Search students, classes',
    action: { label: 'Send a notice', icon: I.send },
    chips: [
      { label: 'On the roll', value: '842' },
      { label: 'Registers in', value: '21 of 24', tone: 'warn' },
      { label: 'Collected', value: '69%', tone: 'warn' },
      { label: 'Owing', value: '67,700', tone: 'bad' },
    ],
    bandActions: [ghostBtn('Export', I.download)],
    content: page(`
      ${filters(
        filterSelect('Year group', 'Every year group') +
          filterSelect('Term', 'Term 2 &middot; 2026', { w: 190 }) +
          filterSelect('Day', 'Today, 25 August', { w: 190 }),
        searchField('Search students, classes', { w: 260 }),
      )}
      ${grid(
        4,
        [
          stat({ label: 'On the roll', value: '842', note: '318 boarders &middot; 524 day' }),
          stat({ label: 'Present today', value: '791', note: '94% of the 21 registers in', tone: 'ok' }),
          stat({ label: 'Collected this term', value: '69%', note: '150,700 of 218,400', tone: 'warn' }),
          stat({ label: 'Beds occupied', value: '86%', note: '318 of 370', tone: 'ok' }),
        ].join(''),
      )}
      ${grid(
        'minmax(0, 1fr) 400px',
        `
        ${stack(`
          ${card({
            title: 'Registers still to come in',
            note: 'as at 09:15',
            actions: [ghostBtn('Open the register board', I.arrowRight)],
            children:
              missingRegister('Form 1B', 'Mrs R. Banda', 'nothing since 07:40', false) +
              missingRegister('Form 3C', 'Mr K. Sibanda', 'nothing since 07:40', false) +
              missingRegister('Lower 6 Arts', 'Unassigned &mdash; no form teacher', 'nothing since 07:40', true),
          })}
          ${card({
            title: 'Waiting on somebody',
            children:
              waitingRow(I.scale, 'Mark sheets in moderation', 'Submitted, nobody has approved them yet', '6', 'warn', false) +
              waitingRow(I.fileCheck, 'Publish window closes on Friday', 'Term 2 &middot; 41 sheets not yet approved', '41', 'bad', false) +
              waitingRow(I.note, 'Admissions to decide', 'Applied, no decision recorded', '12', 'warn', false) +
              waitingRow(I.clipboard, 'Homework past its deadline', 'Work still missing from the class list', '7', 'bad', false) +
              waitingRow(I.target, 'Pupils with no subject target', 'Nobody has set these children anything', '238', 'bad', true),
          })}
          ${card({
            title: 'Homework overdue',
            note: 'this week',
            actions: [ghostBtn('All homework', I.arrowRight)],
            children: table({
              cols: [
                { label: 'Subject and class', w: 200 },
                { label: 'Homework' },
                { label: 'Due', w: 84 },
                { label: 'Handed in', w: 96, align: 'right' },
              ],
              rows: [
                ['Mathematics &middot; Form 2A', 'Simultaneous equations, exercise 4', '21 Aug', '28 of 32'],
                ['English Language &middot; Form 2B', 'Comprehension &mdash; &ldquo;The Rain Came&rdquo;', '20 Aug', '4 of 31'],
                ['Geography &middot; Form 4A', 'Map skills, questions 1&ndash;8', '19 Aug', '11 of 29'],
              ].map(([sc, t, due, handed]) => [
                txt(sc, { size: 12, weight: 600, color: C.strong, ellipsis: true }),
                txt(t, { size: 12, color: C.body, ellipsis: true }),
                mono(due, { size: 11.5, color: C.bad }),
                mono(handed, { size: 11.5, color: C.bad, weight: 700 }),
              ]),
            }),
          })}
        `)}
        ${stack(`
          ${card({
            title: 'Fees, Term 2',
            actions: [ghostBtn('Reports', I.arrowRight)],
            pad: true,
            children: stack(
              `
              ${kv('Invoiced', '218,400.00')}
              ${kv('Collected', '150,700.00', { color: C.ok })}
              ${progress(69, C.ok)}
              ${kv('Still owing', '67,700.00', { color: C.bad })}
              <div style="height: 1px; background: ${C.borderSubtle}"></div>
              ${sectionLabel('How old the debt is')}
              <div style="display: flex; gap: 10px; align-items: flex-end">
                ${[
                  ['Now', 21400],
                  ['1&ndash;30', 18800],
                  ['31&ndash;60', 8460],
                  ['61&ndash;90', 4800],
                  ['90+', 14240],
                ]
                  .map(([l, v]) => chartBar(l, v, null, 24000, l === '90+' ? C.bad : C.warn, null, 62))
                  .join('')}
              </div>
              ${txt('188 families owe something. 31 of them are past 90 days.', { size: 11, color: C.subtle })}
            `,
              9,
            ),
          })}
          ${card({
            title: 'This week',
            children:
              listRow(
                `${icon(I.calendarCheck, { size: 15 })}<span style="flex: 1; min-width: 0">${twoLine('Parents&rsquo; evening, Form 2', '12 slots free of 48 &middot; Thursday 17:00')}</span>${badge('Open', 'ok')}`,
                {},
              ) +
              listRow(
                `${icon(I.send, { size: 15 })}<span style="flex: 1; min-width: 0">${twoLine('Sports day moved to Friday', 'Sent 22 Aug &middot; read by 894 of 1,106')}</span>${badge('Urgent', 'bad')}`,
                {},
              ) +
              listRow(
                `${icon(I.receipt, { size: 15 })}<span style="flex: 1; min-width: 0">${twoLine('Fee reminder &mdash; second instalment', 'Sent 19 Aug &middot; read by 1,012 of 1,106')}</span>${badge('Important', 'warn')}`,
                {},
              ) +
              listRow(
                `${icon(I.book, { size: 15 })}<span style="flex: 1; min-width: 0">${twoLine('Library books due before half term', '19 out past their return date')}</span>${badge('Notice')}`,
                { last: true },
              ),
          })}
          ${card({
            title: 'Boarding',
            pad: true,
            children: stack(
              `
              ${kv('Beds occupied', '318 of 370')}
              ${progress(86, C.brand)}
              ${kv('Out on leave tonight', '14', { color: C.warn })}
              ${kv('Health notes this week', '3', { color: C.mid })}
            `,
              8,
            ),
          })}
        `)}
      `,
      )}
    `),
  })

/* ── /schools, as it actually ships ─────────────────────────────────── */
export const OverviewAsBuilt = () =>
  adminArtboard({
    title: 'School Management System',
    railItem: 'School Overview',
    search: 'Search metrics',
    content: page(`
      ${grid(
        'minmax(0, 1fr) 400px',
        `
        ${card({
          children: table({
            cols: [{ label: 'Metric' }, { label: 'Count', w: 120, align: 'right' }],
            rows: [
              ['Students', '842'],
              ['Guardians', '1,106'],
              ['Enrollments', '842'],
              ['Boarding Allocations', '318'],
              ['Result Sheets', '164'],
              ['Result Moderation Actions', '212'],
              ['Teacher Profiles', '48'],
              ['Subjects', '22'],
              ['Class-Subject Assignments', '286'],
              ['Publish Windows', '6'],
              ['Fee Structures', '18'],
              ['Fee Invoices', '842'],
              ['Fee Receipts', '1,204'],
              ['Fee Waivers', '37'],
            ].map(([m, v]) => [
              txt(m, { size: 12.5, weight: 500, color: C.body }),
              mono(v, { size: 12, color: C.body }),
            ]),
          }),
        })}
        ${card({
          title: 'What is missing from it',
          pad: true,
          children: stack(
            [
              'Fourteen counts and no verb. Nothing on the page is a link, so every number is a dead end.',
              'Nothing is dated. &ldquo;Fee Receipts 1,204&rdquo; is every receipt the school has ever written, not this term&rsquo;s.',
              'Half the rows name database tables rather than school things &mdash; <b>Class-Subject Assignments</b>, <b>Result Moderation Actions</b>, <b>Enrollment Rows</b>.',
              'Six personas land here. A bursar, a warden and a teacher all open the same fourteen rows, and five of the rows are none of their business.',
              'Nothing that needs doing appears at all: no missing register, no unmoderated sheet, no overdue homework, no family in arrears.',
            ]
              .map(
                (t) =>
                  `<div style="display: flex; gap: 8px; align-items: flex-start">${icon(I.x, { size: 13, stroke: C.bad })}<span style="flex: 1; font-size: 12px; color: ${C.mid}; line-height: 1.55">${t}</span></div>`,
              )
              .join(''),
            9,
          ),
        })}
      `,
      )}
    `),
  })

/* ── 2. /schools/attendance — the register board ────────────────────── */
const registerRow = (cls, state, detail, teacher, last) => {
  const tone = state === 'Missing' ? 'bad' : state === 'Submitted' ? 'ok' : 'warn'
  return listRow(
    `${txt(cls, { size: 12.5, weight: 700, color: C.strong, flex: '0 0 132px' })}
     <span style="flex: 1; min-width: 0">${twoLine(detail, teacher)}</span>
     ${badge(state, tone)}
     ${state === 'Missing' ? tinyBtn('Remind', 'bad') : state === 'Draft' ? tinyBtn('Nudge') : mono('07:52', { size: 11 })}`,
    { tone: state === 'Missing' ? 'bad' : undefined, last },
  )
}

export const Attendance = () =>
  adminArtboard({
    title: 'Attendance',
    railItem: 'Attendance',
    caption: 'Tuesday 25 August 2026',
    search: 'Search a year group',
    chips: [
      { label: 'Registers in', value: '21 of 24', tone: 'warn' },
      { label: 'Still to come', value: '3', tone: 'bad' },
      { label: 'Present', value: '791', tone: 'ok' },
    ],
    bandActions: [ghostBtn('Yesterday', I.chevL), ghostBtn('Copy the missing list', I.file)],
    content: page(`
      ${filters(
        `<div style="display: flex; flex-direction: column; gap: 4px; width: 190px; flex-shrink: 0">
          <span style="font-size: 10.5px; font-weight: 600; color: ${C.mid}">Date</span>
          <div style="display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 9px; border: 1px solid ${C.border}; border-radius: 6px; background: ${C.surface}">${icon(I.calendar, { size: 14, stroke: C.subtle })}<span class="mono" style="flex: 1; font-size: 12px; color: ${C.body}">2026-08-25</span></div>
        </div>` +
          filterSelect('Year group', 'Every year group') +
          filterSelect('Stream', 'Every stream', { w: 150 }) +
          filterSelect('State', 'Anything', { w: 160 }),
        searchField('Search a year group', { w: 240 }),
      )}
      ${alert({
        tone: 'bad',
        title: '3 still to come in',
        body: 'Form 1B, Form 3C, Lower 6 Arts',
        action: solidBtn('Send all three a reminder', I.send),
      })}
      ${txt('21 of 24 year groups have a register for 2026-08-25.', { size: 12, color: C.mid })}
      ${grid(
        'minmax(0, 1fr) 380px',
        `
        ${card({
          title: 'Year groups',
          note: '24 on the ladder',
          children:
            registerRow('Form 1A', 'Submitted', '1 register &middot; 31 of 32 present', 'Mr T. Chirwa', false) +
            registerRow('Form 1B', 'Missing', 'No register yet', 'Mrs R. Banda', false) +
            registerRow('Form 2A', 'Submitted', '1 register &middot; 32 of 32 present', 'Mrs P. Nyathi', false) +
            registerRow('Form 2B', 'Submitted', '1 register &middot; 29 of 31 present', 'Mr T. Chirwa', false) +
            registerRow('Form 3A', 'Draft', '1 register &middot; started, not sent', 'Mr K. Sibanda', false) +
            registerRow('Form 3B', 'Submitted', '2 registers &middot; morning and afternoon', 'Mrs L. Moyo', false) +
            registerRow('Form 3C', 'Missing', 'No register yet', 'Mr K. Sibanda', false) +
            registerRow('Form 4A', 'Submitted', '1 register &middot; 27 of 29 present', 'Mr F. Dube', false) +
            registerRow('Form 4B', 'Submitted', '1 register &middot; 30 of 30 present', 'Mrs G. Marufu', false) +
            registerRow('Lower 6 Arts', 'Missing', 'No register yet', 'Unassigned &mdash; no form teacher', false) +
            registerRow('Lower 6 Sciences', 'Submitted', '1 register &middot; 24 of 26 present', 'Mr E. Zhou', true),
        })}
        ${stack(`
          ${card({
            title: 'When the school was closed',
            children: `<div style="padding: 13px">${alert({
              tone: 'brand',
              title: 'Not a school day &mdash; Heroes&rsquo; Day',
              body: 'No registers are expected. Anything below was taken anyway.',
            })}<div style="margin-top: 10px">${txt(
              'The calendar is checked before the classes are counted. Without it a public holiday reads as every class failing to send a register, which is the wrong thing to chase.',
              { size: 11.5, color: C.subtle },
            )}</div></div>`,
          })}
          ${card({
            title: 'The week',
            children: [
              ['Mon 24 Aug', 24, 24],
              ['Tue 25 Aug', 21, 24],
              ['Wed 26 Aug', null, 24],
              ['Thu 27 Aug', null, 24],
              ['Fri 28 Aug', null, 24],
            ]
              .map(([d, got, all], i, a) =>
                listRow(
                  `${txt(d, { size: 12, color: C.mid, flex: '0 0 92px' })}
                   <span style="flex: 1; min-width: 0">${got === null ? progress(0) : progress(Math.round((got / all) * 100), got === all ? C.ok : C.warn)}</span>
                   ${got === null ? mono('—', { size: 11.5 }) : mono(`${got} of ${all}`, { size: 11.5, color: got === all ? C.ok : C.warn, weight: 700 })}`,
                  { last: i === a.length - 1 },
                ),
              )
              .join(''),
          })}
          ${card({
            title: 'Nobody to chase',
            children: emptyState({
              ic: I.userGear,
              h: 168,
              title: 'Lower 6 Arts has no form teacher',
              body: 'A missing register with nobody attached to it cannot be chased. Assign a form teacher under <b>Classes</b>.',
              action: ghostBtn('Open Lower 6 Arts', I.arrowRight),
            }),
          })}
        `)}
      `,
      )}
    `),
  })

/* ── 3. /schools/notices ────────────────────────────────────────────── */
export const Notices = () =>
  adminArtboard({
    title: 'School Notices',
    railItem: 'Notices',
    caption: 'Term 2 &middot; 34 sent',
    search: 'Search sent notices',
    action: { label: 'Send a notice', icon: I.send },
    chips: [
      { label: 'Sent this term', value: '34' },
      { label: 'Unread', value: '212', tone: 'warn' },
      { label: 'No portal account', value: '61', tone: 'bad' },
    ],
    content: page(`
      ${alert({
        tone: 'ok',
        title: 'Notice sent',
        body: 'Sent to 1,106 people. 61 people have no portal account yet and did not get it &mdash; invite them from Guardians or Students.',
        action: ghostBtn('Invite the 61', I.userPlus),
      })}
      ${sectionTitle('Notices the school has sent')}
      ${filters(
        filterSelect('Who it was for', 'Every audience') +
          filterSelect('Year group', 'The whole school') +
          filterSelect('Importance', 'Any importance', { w: 160 }) +
          filterSelect('When', 'This term', { w: 150 }),
        searchField('Search sent notices', { w: 250 }),
      )}
      ${grid(
        'minmax(0, 1fr) 340px',
        `
        ${card({
          children: table({
            cols: [
              { label: 'Sent', w: 84 },
              { label: 'Notice' },
              { label: 'Audience', w: 156 },
              { label: 'Importance', w: 104 },
              { label: 'Read', w: 150, align: 'right' },
              { label: 'Expires', w: 78 },
            ],
            rows: [
              [
                '22 Aug',
                'Sports day moved to Friday',
                'The inter-house athletics has moved from Wednesday to Friday 28 August because of the weather&hellip;',
                'Parents and guardians',
                'Urgent',
                'bad',
                894,
                1106,
                '29 Aug',
              ],
              [
                '19 Aug',
                'Fee reminder &mdash; Term 2 second instalment',
                'The second instalment fell due on 15 August. Statements are on the parent portal&hellip;',
                'Parents and guardians',
                'Important',
                'warn',
                1012,
                1106,
                '—',
              ],
              [
                '14 Aug',
                'Staff briefing, Monday 07:15',
                'Moderation deadlines and the publishing window for Term 2&hellip;',
                'Teachers',
                'Notice',
                'plain',
                44,
                48,
                '18 Aug',
              ],
              [
                '11 Aug',
                'Library books due back before half term',
                'Anything out on 1 September is counted late and carries a fine&hellip;',
                'Pupils',
                'Notice',
                'plain',
                688,
                842,
                '1 Sep',
              ],
              [
                '4 Aug',
                'Parents&rsquo; evening, Form 4',
                'Booking opens on the parent portal at 18:00 on Thursday&hellip;',
                'Everyone &middot; Form 4',
                'Important',
                'warn',
                1088,
                1154,
                '1 Sep',
              ],
            ].map(([sent, title, summary, audience, imp, tone, read, all, expires]) => [
              mono(sent, { size: 11.5 }),
              twoLine(title, summary),
              txt(audience, { size: 12, color: C.mid, ellipsis: true }),
              badge(imp, tone),
              `<span style="display: flex; align-items: center; gap: 8px; justify-content: flex-end; width: 100%">
                 <span style="width: 46px">${progress(Math.round((read / all) * 100), read / all > 0.85 ? C.ok : C.warn, 5)}</span>
                 ${mono(`${read.toLocaleString('en-GB')} of ${all.toLocaleString('en-GB')}`, { size: 11.5, color: C.body })}</span>`,
              mono(expires, { size: 11.5 }),
            ]),
          }),
        })}
        ${stack(`
          ${card({
            title: 'Who never gets them',
            note: '61 people',
            children:
              listRow(`${txt('Guardians with no portal account', { size: 12, color: C.mid, flex: 1 })}${mono('47', { size: 12.5, color: C.bad, weight: 700 })}`, {}) +
              listRow(`${txt('Pupils with no portal account', { size: 12, color: C.mid, flex: 1 })}${mono('14', { size: 12.5, color: C.bad, weight: 700 })}`, {}) +
              listRow(`${txt('Guardians with no phone number', { size: 12, color: C.mid, flex: 1 })}${mono('9', { size: 12.5, color: C.warn, weight: 700 })}`, { last: true }),
          })}
          ${card({
            title: 'A notice cannot be recalled',
            pad: true,
            children: stack(
              `
              ${txt('The send dialog says so, and the sent list proves it: no draft, no schedule, and no way to correct one that went out wrong.', { size: 12, color: C.mid })}
              ${txt('The smallest honest fix is a <b>Send a correction</b> action on the row, which posts a linked follow-up to exactly the same audience.', { size: 12, color: C.mid })}
              ${ghostBtn('Send a correction', I.note)}
            `,
              9,
            ),
          })}
          ${card({
            title: 'Reach, this term',
            pad: true,
            children: stack(
              `
              ${kv('Notices sent', '34')}
              ${kv('Average read', '84%', { color: C.ok })}
              ${progress(84, C.ok)}
              ${kv('Never opened one', '212', { color: C.warn })}
              ${txt('A guardian who has opened nothing in a term is usually a guardian whose invite was never accepted.', { size: 11, color: C.subtle })}
            `,
              8,
            ),
          })}
        `)}
      `,
      )}
    `),
  })

/* ── 4. /schools/documents ──────────────────────────────────────────── */
export const Documents = () =>
  adminArtboard({
    title: 'School Documents',
    railItem: 'Documents',
    caption: 'Term 2 &middot; Report Cards',
    search: 'Search by name or student number...',
    chips: [
      { label: 'Year group', value: 'Form 2', tone: 'brand' },
      { label: 'Pupils', value: '118' },
    ],
    bandActions: [ghostBtn('Print / Save PDF', I.print)],
    content: page(`
      ${rowFlex(
        `${segments(['Report Cards', 'Fee Invoices', 'Class Lists', 'Attendance Registers'], 'Report Cards')}<div style="flex: 1"></div>${ghostBtn('Print / Save PDF', I.print)}`,
      )}
      ${filters(
        filterSelect('Year group', 'Form 2') +
          filterSelect('Stream', 'Every stream', { w: 150 }) +
          filterSelect('Term', 'Term 2 &middot; 2026', { w: 190 }) +
          filterSelect('Status', 'Active pupils', { w: 160 }),
      )}
      ${grid(
        '300px minmax(0, 1fr)',
        `
        ${card({
          title: 'Select Student',
          note: '118 in Form 2',
          children: `<div style="padding: 11px 13px">${searchField('Search by name or student number...', { w: 274, label: 'Search students' })}</div>
            <div style="border-top: 1px solid ${C.borderSubtle}">
            ${[
              ['CHS-1219', 'Tanaka Mutasa', 'Form 2A', true],
              ['CHS-1211', 'Farai Moyo', 'Form 2B', false],
              ['CHS-1180', 'Rutendo Chikwanda', 'Form 2A', false],
              ['CHS-1204', 'Tapiwa Dube', 'Form 2A', false],
              ['CHS-1226', 'Anesu Gwatidzo', 'Form 2B', false],
              ['CHS-1247', 'Chipo Marufu', 'Form 2B', false],
            ]
              .map(([no, name, cls, on], i, a) =>
                listRow(
                  `${mono(no, { size: 10.5, width: 66 })}${txt(name, { size: 12.5, weight: on ? 700 : 500, color: C.strong, flex: 1, ellipsis: true })}${badge(cls, on ? 'brand' : 'plain')}`,
                  { tone: on ? 'sel' : undefined, last: i === a.length - 1 },
                ),
              )
              .join('')}
            </div>
            <div style="padding: 9px 13px; border-top: 1px solid ${C.borderSubtle}">${txt('Showing the first 20 matches of 118.', { size: 11, color: C.subtle })}</div>`,
        })}
        ${card({
          title: 'Report Card Preview',
          actions: [ghostBtn('Print / Save PDF', I.print)],
          children: `<div style="padding: 20px 22px; background: #FDFDFE">
            <div style="border: 1px solid ${C.borderStrong}; border-radius: 4px; background: #fff; padding: 26px 30px">
              <div style="text-align: center; padding-bottom: 14px; border-bottom: 2px solid ${C.strong}">
                <div style="font-size: 17px; font-weight: 700; color: ${C.strong}; letter-spacing: -.01em">Chishawasha High</div>
                <div style="font-size: 13px; color: ${C.mid}; margin-top: 3px">Student Report Card</div>
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px 22px; padding: 14px 0; border-bottom: 1px solid ${C.border}">
                ${[
                  ['Student No', 'CHS-1219'],
                  ['Admission No', 'ADM-0994'],
                  ['Class', 'Form 2'],
                  ['Stream', '2A'],
                  ['Status', 'Active'],
                  ['Boarding', 'Boarder'],
                ]
                  .map(
                    ([k, v]) =>
                      `<div><div style="font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: ${C.subtle}">${k}</div><div style="font-size: 12.5px; font-weight: 600; color: ${C.strong}; margin-top: 2px">${v}</div></div>`,
                  )
                  .join('')}
              </div>
              <div style="display: flex; gap: 10px; padding: 12px 0 10px; border-bottom: 1px solid ${C.border}">
                ${['Subject', 'Mark', 'Grade', 'Comment']
                  .map(
                    (h, i) =>
                      `<span style="font-size: 11px; font-weight: 700; color: ${C.strong}; ${i === 0 ? 'flex: 1' : i === 3 ? 'flex: 1.4' : 'width: 70px'}">${h}</span>`,
                  )
                  .join('')}
              </div>
              ${[
                ['Mathematics', '78', 'B', 'Working steadily. Algebra is much improved.'],
                ['English Language', '71', 'B', 'Reads widely; needs to plan before writing.'],
                ['Combined Science', '64', 'C', 'Practical work is strong, theory less so.'],
                ['Geography', '69', 'C', 'Map skills good. Case studies need detail.'],
                ['Shona', '82', 'A', 'A pleasure to teach.'],
              ]
                .map(
                  ([s, m, g, c]) =>
                    `<div style="display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid ${C.hair}">
                       <span style="flex: 1; font-size: 12px; color: ${C.body}">${s}</span>
                       <span class="mono" style="width: 70px; font-size: 12px; color: ${C.body}">${m}</span>
                       <span class="mono" style="width: 70px; font-size: 12px; font-weight: 700; color: ${C.strong}">${g}</span>
                       <span style="flex: 1.4; font-size: 11.5px; color: ${C.mid}">${c}</span>
                     </div>`,
                )
                .join('')}
              <div style="display: flex; gap: 40px; padding-top: 34px">
                ${['Class Teacher', 'Head Teacher']
                  .map(
                    (r) =>
                      `<div style="flex: 1"><div style="border-bottom: 1px solid ${C.strong}; height: 24px"></div><div style="font-size: 10.5px; color: ${C.mid}; margin-top: 4px">${r} &mdash; Signature</div></div>`,
                  )
                  .join('')}
              </div>
            </div>
          </div>`,
        })}
      `,
      )}
      ${grid(
        3,
        `
        ${card({
          title: 'What ships instead',
          pad: true,
          children: stack(
            `${txt('The report card&rsquo;s subject table is a single row reading <b>&ldquo;Results data will be populated from the results module for the selected term.&rdquo;</b> The marks above are what the screen is for and what it does not yet fetch.', { size: 12, color: C.mid })}
             ${txt('The fee invoice prints Tuition Fee, Boarding Fee and Total Due, each with a literal &ldquo;-&rdquo;.', { size: 12, color: C.mid })}`,
            8,
          ),
        })}
        ${card({
          title: 'The two tabs with no filter',
          pad: true,
          children: stack(
            `${txt('<b>Class Lists</b> and <b>Attendance Registers</b> reuse the student search state but never render the search box, so they print all 842 pupils with no way to narrow to a class.', { size: 12, color: C.mid })}
             ${txt('The filter row above is the fix, and it is the same <code>FilterBar</code> every other campus screen already uses.', { size: 12, color: C.mid })}`,
            8,
          ),
        })}
        ${card({
          title: 'Printing',
          pad: true,
          children: stack(
            `${txt('Printing is a hand-rolled <code>window.open</code> plus <code>document.write</code> of the preview&rsquo;s innerHTML, with its own inline stylesheet.', { size: 12, color: C.mid })}
             ${txt('A blocked pop-up returns silently: the button does nothing and says nothing.', { size: 12, color: C.mid })}`,
            8,
          ),
        })}
      `,
      )}
    `),
  })

/* ── 5. /schools/reports — collections ──────────────────────────────── */
const REPORT_TABS = ['Collections', 'Arrears Aging', 'Enrollment', 'Hostel Occupancy']

const reportTiles = () =>
  grid(
    4,
    [
      stat({ label: 'COLLECTION RATE', value: '69%', note: 'Term 2 to date', tone: 'warn' }),
      stat({ label: 'STUDENTS WITH ARREARS', value: '188', note: 'of 842 on the roll', tone: 'bad' }),
      stat({ label: 'AVG ENROLLMENT', value: '842', note: 'across 3 terms' }),
      stat({ label: 'HOSTEL OCCUPANCY', value: '86%', note: '318 of 370 beds', tone: 'ok' }),
    ].join(''),
  )

export const Reports = () =>
  adminArtboard({
    title: 'School Reports',
    railItem: 'School reports',
    caption: 'Term 2 &middot; Collections',
    search: 'Search terms',
    bandActions: [ghostBtn('Export CSV', I.download), ghostBtn('Export PDF', I.download)],
    content: page(`
      ${reportTiles()}
      ${rowFlex(`${segments(REPORT_TABS, 'Collections')}<div style="flex: 1"></div>${ghostBtn('Export CSV', I.download)}${ghostBtn('Export PDF', I.download)}`)}
      ${sectionTitle('Fee Collections Report')}
      ${filters(
        filterSelect('Academic year', '2026', { w: 150 }) +
          filterSelect('Term', 'Every term') +
          filterSelect('Year group', 'Every year group') +
          filterSelect('Fee structure', 'Every structure'),
        searchField('Search terms', { w: 220 }),
      )}
      ${card({
        title: 'Collections by Term',
        actions: [
          legend([
            ['Invoiced', C.brand],
            ['Collected', C.ok],
          ]),
        ],
        children: `<div style="padding: 16px 16px 12px; display: flex; gap: 14px; align-items: flex-end">
          ${[
            ['Term 1 &middot; 2025', 206400, 198100],
            ['Term 2 &middot; 2025', 211800, 203900],
            ['Term 3 &middot; 2025', 209200, 201400],
            ['Term 1 &middot; 2026', 214600, 205800],
            ['Term 2 &middot; 2026', 218400, 150700],
          ]
            .map(([l, a, b]) => chartBar(l, a, b, 230000, C.brand, C.ok))
            .join('')}
        </div>`,
      })}
      ${grid(
        'minmax(0, 1fr) 340px',
        `
        ${card({
          children: table({
            cols: [
              { label: 'Term' },
              { label: 'Invoiced', w: 120, align: 'right' },
              { label: 'Collected', w: 120, align: 'right' },
              { label: 'Collection Rate', w: 132, align: 'right' },
              { label: 'Receipts', w: 88, align: 'right' },
            ],
            rows: [
              ['Term 2 &middot; 2026', '4 May – 10 Sep 2026', '218,400.00', '150,700.00', '69%', '604', 'warn'],
              ['Term 1 &middot; 2026', '12 Jan – 2 Apr 2026', '214,600.00', '205,800.00', '96%', '1,188', 'ok'],
              ['Term 3 &middot; 2025', '8 Sep – 4 Dec 2025', '209,200.00', '201,400.00', '96%', '1,164', 'ok'],
              ['Term 2 &middot; 2025', '5 May – 11 Sep 2025', '211,800.00', '203,900.00', '96%', '1,172', 'ok'],
              ['Term 1 &middot; 2025', '13 Jan – 3 Apr 2025', '206,400.00', '198,100.00', '96%', '1,150', 'ok'],
            ].map(([t, dates, inv, col, rate, rec, tone]) => [
              twoLine(t, dates, { mono: true }),
              mono(inv, { size: 12, color: C.body }),
              mono(col, { size: 12, color: C.body }),
              badge(rate, tone),
              mono(rec, { size: 12, color: C.mid }),
            ]),
          }),
        })}
        ${stack(`
          ${card({
            title: 'Term 2 &middot; 2026',
            note: 'in view',
            pad: true,
            children: stack(
              `
              ${kv('Invoiced', '218,400.00')}
              ${kv('Collected', '150,700.00', { color: C.ok })}
              ${progress(69, C.ok)}
              ${kv('Still owing', '67,700.00', { color: C.bad })}
              ${kv('Receipts written', '604')}
              ${kv('Average receipt', '249.50')}
              <div style="height: 1px; background: ${C.borderSubtle}"></div>
              ${txt('Every previous term settled at 96%. Term 2 is 27 points behind with three weeks left.', { size: 11.5, color: C.mid })}
            `,
              8,
            ),
          })}
          ${card({
            title: 'By year group',
            children: [
              ['Form 1', 96],
              ['Form 2', 74],
              ['Form 3', 71],
              ['Form 4', 58],
              ['Lower 6', 62],
              ['Upper 6', 81],
            ]
              .map(([g, pct], i, a) =>
                listRow(
                  `${txt(g, { size: 12, color: C.mid, flex: '0 0 74px' })}
                   <span style="flex: 1; min-width: 0">${progress(pct, pct >= 80 ? C.ok : pct >= 65 ? C.warn : C.bad)}</span>
                   ${mono(`${pct}%`, { size: 11.5, color: pct >= 80 ? C.ok : pct >= 65 ? C.warn : C.bad, weight: 700 })}`,
                  { last: i === a.length - 1 },
                ),
              )
              .join(''),
          })}
          ${card({
            title: 'What the screen cannot do',
            pad: true,
            children: txt(
              'There is no date-range, term or year-group filter of any kind on this route today &mdash; the four reports render everything the API returns. The filter row above is drawn with the module&rsquo;s own <code>FilterBar</code>. Both export buttons <code>window.open</code> an API URL, so a failed export is a blank tab.',
              { size: 12, color: C.mid },
            ),
          })}
        `)}
      `,
      )}
    `),
  })

/* ── 6. /schools/reports — arrears aging ────────────────────────────── */
export const ReportsArrears = () =>
  adminArtboard({
    title: 'School Reports',
    railItem: 'School reports',
    caption: 'Term 2 &middot; Arrears Aging',
    search: 'Search students',
    chips: [
      { label: 'Outstanding', value: '67,700', tone: 'bad' },
      { label: '90+ days', value: '14,240', tone: 'bad' },
      { label: 'Families', value: '188' },
    ],
    bandActions: [ghostBtn('Export CSV', I.download), solidBtn('Remind the 188', I.send)],
    content: page(`
      ${reportTiles()}
      ${rowFlex(`${segments(REPORT_TABS, 'Arrears Aging')}<div style="flex: 1"></div>${ghostBtn('Export CSV', I.download)}${ghostBtn('Export PDF', I.download)}`)}
      ${sectionTitle('Arrears Aging Report')}
      ${filters(
        filterSelect('Year group', 'Every year group') +
          filterSelect('Stream', 'Every stream', { w: 150 }) +
          filterSelect('Oldest debt', 'Any age', { w: 170 }) +
          filterSelect('Owing at least', 'Any amount', { w: 160 }) +
          filterSelect('Boarding', 'Boarders and day', { w: 170 }),
        searchField('Search students', { w: 220 }),
      )}
      ${card({
        title: 'Aging Distribution',
        actions: [legend([['Amount', C.bad]])],
        children: `<div style="padding: 16px 16px 12px; display: flex; gap: 14px; align-items: flex-end">
          ${[
            ['Current', 21400],
            ['1-30 Days', 18800],
            ['31-60 Days', 8460],
            ['61-90 Days', 4800],
            ['90+ Days', 14240],
          ]
            .map(([l, a]) => chartBar(l, a, null, 24000, l === '90+ Days' ? C.bad : C.warn))
            .join('')}
        </div>`,
      })}
      ${card({
        children: table({
          cols: [
            { label: 'Student' },
            { label: 'Total Outstanding', w: 116, align: 'right' },
            { label: 'Current', w: 84, align: 'right' },
            { label: '1-30 Days', w: 84, align: 'right' },
            { label: '31-60 Days', w: 84, align: 'right' },
            { label: '61-90 Days', w: 84, align: 'right' },
            { label: '90+ Days', w: 84, align: 'right' },
            { label: '', w: 84, align: 'right' },
          ],
          rows: [
            ['Mafuta, Simba', 'CHS-1301 &bull; Form 4A', '2,480.00', '0.00', '0.00', '0.00', '620.00', '1,860.00'],
            ['Nyathi, Kudzai', 'CHS-1233 &bull; Form 3A', '1,860.00', '0.00', '0.00', '310.00', '620.00', '930.00'],
            ['Moyo, Farai', 'CHS-1211 &bull; Form 2B', '1,240.00', '310.00', '310.00', '310.00', '310.00', '0.00'],
            ['Dube, Tapiwa', 'CHS-1204 &bull; Form 2A', '930.00', '310.00', '310.00', '310.00', '0.00', '0.00'],
            ['Zimuto, Nyasha', 'CHS-1240 &bull; Form 3A', '620.00', '310.00', '310.00', '0.00', '0.00', '0.00'],
            ['Chikwanda, Rutendo', 'CHS-1180 &bull; Form 2A', '310.00', '310.00', '0.00', '0.00', '0.00', '0.00'],
          ].map(([name, sub, total, ...rest]) => [
            `<span style="display: flex; align-items: center; gap: 8px; min-width: 0">${avatar(ini(name))}${twoLine(esc(name), sub, { mono: true })}</span>`,
            mono(total, { size: 12, color: C.bad, weight: 700 }),
            ...rest.map((v, i) =>
              mono(v, { size: 11.5, color: v === '0.00' ? C.faint : i >= 3 ? C.bad : C.body }),
            ),
            tinyBtn('Remind'),
          ]),
        }),
      })}
      ${grid(
        3,
        `
        ${card({
          title: 'The missing verb',
          pad: true,
          children: txt(
            'This screen names 188 families in arrears and offers no way to reach any of them. The school already has a notices system that lands in every parent&rsquo;s portal in one send. <b>Remind</b> on the row and <b>Remind the 188</b> in the band are the same send, addressed to the filtered set.',
            { size: 12, color: C.mid },
          ),
        })}
        ${card({
          title: 'Why these buckets',
          pad: true,
          children: txt(
            'Current, 1&ndash;30, 31&ndash;60, 61&ndash;90 and 90+ are the accounting AR report&rsquo;s own columns. A bursar comparing the two screens should not have to learn a second layout for the same idea.',
            { size: 12, color: C.mid },
          ),
        })}
        ${card({
          title: 'Where the 90+ sits',
          pad: true,
          children: stack(
            `
            ${kv('Form 4', '6,820.00', { color: C.bad })}
            ${kv('Form 3', '3,410.00', { color: C.bad })}
            ${kv('Lower 6', '2,170.00', { color: C.bad })}
            ${kv('Form 2', '1,240.00', { color: C.bad })}
            ${kv('Everything else', '600.00', { color: C.mid })}
            ${txt('31 families carry the whole 90+ column. That is the list worth ringing.', { size: 11, color: C.subtle })}
          `,
            7,
          ),
        })}
      `,
      )}
    `),
  })

/* ── 7. /schools/meetings — parent meetings and the calendar ────────── */
const slotRow = (time, booked, pupil, sub, guardian, last) =>
  listRow(
    `${mono(time, { size: 11.5, color: C.body, width: 96 })}
     ${booked ? avatar(ini(pupil)) : `<span style="width: 24px; height: 24px; border-radius: 999px; border: 1px dashed ${C.borderStrong}; flex-shrink: 0"></span>`}
     <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: ${booked ? 600 : 400}; color: ${booked ? C.strong : C.subtle}">${booked ? esc(pupil) : 'Free — nobody has taken this slot'}</span>${booked ? mono(sub, { size: 10.5 }) : ''}</span>
     ${booked ? txt(guardian, { size: 11.5, color: guardian.startsWith('No guardian') ? C.subtle : C.mid }) : ''}
     ${booked ? badge('Booked', 'ok') : badge('Free')}
     ${booked ? tinyBtn('Release') : tinyBtn('Book for a family')}`,
    { last },
  )

/** A month, with a dot on each evening that has slots open. */
const monthGrid = () => {
  const evenings = { 12: 'full', 13: 'some', 19: 'some', 26: 'some', 27: 'full' }
  const cells = []
  for (let i = 0; i < 3; i += 1) cells.push('<span></span>')
  for (let d = 1; d <= 31; d += 1) {
    const e = evenings[d]
    const today = d === 25
    cells.push(
      `<span style="height: 30px; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: ${today ? C.brandSoft : e ? C.surface : 'transparent'}; border: 1px solid ${today ? 'transparent' : e ? C.border : 'transparent'}">
         <span class="mono" style="font-size: 11px; font-weight: ${today || e ? 700 : 400}; color: ${today ? C.brandStrong : e ? C.strong : C.faint}">${d}</span>
         ${e ? dot(e === 'full' ? C.ok : C.brand) : '<span style="height: 6px"></span>'}
       </span>`,
    )
  }
  return `<div style="padding: 12px 13px">
    <div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; margin-bottom: 5px">
      ${['M', 'T', 'W', 'T', 'F', 'S', 'S']
        .map((d) => `<span style="text-align: center; font-size: 10px; font-weight: 700; color: ${C.subtle}">${d}</span>`)
        .join('')}
    </div>
    <div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px">${cells.join('')}</div>
    <div style="display: flex; gap: 12px; margin-top: 10px; padding-top: 9px; border-top: 1px solid ${C.borderSubtle}">
      <span style="display: flex; align-items: center; gap: 5px">${dot(C.ok)}<span style="font-size: 10.5px; color: ${C.mid}">Fully booked</span></span>
      <span style="display: flex; align-items: center; gap: 5px">${dot(C.brand)}<span style="font-size: 10.5px; color: ${C.mid}">Slots free</span></span>
    </div>
  </div>`
}

export const Meetings = () =>
  adminArtboard({
    title: 'Parent meetings',
    railItem: 'Parent meetings',
    caption: 'Term 2 &middot; 12 March 2026',
    search: 'Search a pupil or a teacher',
    chips: [
      { label: 'Slots open', value: '96' },
      { label: 'Booked', value: '71', tone: 'ok' },
      { label: 'Free', value: '25', tone: 'brand' },
    ],
    content: page(`
      ${lede(
        'The term&rsquo;s parents&rsquo; evenings across the whole staff room &mdash; who is open, who is booked, and which ten minutes are still free.',
      )}
      ${filters(
        filterSelect('Term', 'The current term', { w: 220 }) +
          filterSelect('Teacher', 'Every teacher') +
          filterSelect('Year group', 'Every year group') +
          filterSelect('Evening', 'Every evening', { w: 170 }),
        rowFlex(`${searchField('Search a pupil or a teacher', { w: 230 })}${solidBtn('Open slots', I.plus)}`, {
          align: 'flex-end',
        }),
      )}
      ${grid(
        3,
        [
          stat({ label: 'Slots open', value: '96', note: 'Term 2 &middot; 2026 Academic Year' }),
          stat({ label: 'Booked', value: '71', note: '74% of the slots taken', tone: 'ok' }),
          stat({ label: 'Free', value: '25', note: 'still available to families', tone: 'brand' }),
        ].join(''),
      )}
      ${grid(
        'minmax(0, 1fr) 340px',
        `
        ${stack(`
          ${card({
            title: 'Mrs P. Nyathi',
            note: '24 slots &middot; 21 booked &middot; 3 free',
            actions: [ghostBtn('Print her evening', I.print)],
            children: `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('12 March 2026')}</div>
              ${slotRow('17:00 – 17:10', true, 'Mutasa, Tanaka', 'CHS-1219 · Form 2A · Room 4', 'Grace Mutasa · 077 412 8890', false)}
              ${slotRow('17:10 – 17:20', true, 'Chikwanda, Rutendo', 'CHS-1180 · Form 2A · Room 4', 'No guardian named on the booking', false)}
              ${slotRow('17:20 – 17:30', false, '', '', '', false)}
              ${slotRow('17:30 – 17:40', true, 'Moyo, Farai', 'CHS-1211 · Form 2B · Room 4', 'Tsitsi Moyo · 071 220 4417', false)}
              ${slotRow('17:40 – 17:50', false, '', '', '', true)}`,
          })}
          ${card({
            title: 'Mr T. Chirwa',
            note: '24 slots &middot; 18 booked &middot; 6 free',
            actions: [ghostBtn('Print his evening', I.print)],
            children: `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('12 March 2026')}</div>
              ${slotRow('17:00 – 17:10', true, 'Dube, Tapiwa', 'CHS-1204 · Form 2A · No room set', 'Regis Dube · 078 990 1120', false)}
              ${slotRow('17:10 – 17:20', false, '', '', '', false)}
              ${slotRow('17:20 – 17:30', true, 'Nyathi, Kudzai', 'CHS-1233 · Form 3A · No room set', 'Memory Nyathi · 077 004 7781', true)}`,
          })}
        `)}
        ${stack(`
          ${card({ title: 'March 2026', note: '5 evenings open', children: monthGrid() })}
          ${card({
            title: 'The evenings',
            children: [
              ['Thu 12 Mar', '6 staff', '71 of 96', 'some'],
              ['Fri 13 Mar', '2 staff', '18 of 24', 'some'],
              ['Thu 19 Mar', '4 staff', '30 of 48', 'some'],
              ['Thu 26 Mar', '3 staff', '22 of 36', 'some'],
              ['Fri 27 Mar', '2 staff', '24 of 24', 'full'],
            ]
              .map(([d, staff, taken, state], i, a) =>
                listRow(
                  `${dot(state === 'full' ? C.ok : C.brand)}
                   ${txt(d, { size: 12, weight: 600, color: C.strong, flex: '0 0 84px' })}
                   <span style="flex: 1; min-width: 0">${txt(staff, { size: 11.5, color: C.subtle })}</span>
                   ${mono(taken, { size: 11.5, color: state === 'full' ? C.ok : C.body, weight: 700 })}`,
                  { last: i === a.length - 1 },
                ),
              )
              .join(''),
          })}
          ${card({
            title: 'Releasing a slot',
            pad: true,
            children: stack(
              `
              ${alert({
                tone: 'warn',
                title: 'Nobody is told automatically — ring them.',
                body: 'The meeting is cancelled and the slot goes back on the list as free, so another family can take it.',
              })}
              ${txt(
                'That is the release dialog verbatim, and it is honest. It is also the gap: the school can reach every parent&rsquo;s portal in one send, and a cancelled meeting does not use it.',
                { size: 12, color: C.mid },
              )}
            `,
              9,
            ),
          })}
        `)}
      `,
      )}
    `),
  })

/* ── 8. /schools/timetable ──────────────────────────────────────────── */
const LESSONS = {
  '1|Mon': ['Mathematics', 'Form 2A', 'Mrs Nyathi', 'Rm 4'],
  '1|Tue': ['English Language', 'Form 2A', 'Mr Chirwa', 'Rm 7'],
  '1|Wed': ['Mathematics', 'Form 2A', 'Mrs Nyathi', 'Rm 4'],
  '1|Thu': ['Combined Science', 'Form 2A', 'Mr Sibanda', 'Lab 1'],
  '1|Fri': ['Shona', 'Form 2A', 'Mrs Moyo', 'Rm 9'],
  '2|Mon': ['Combined Science', 'Form 2A', 'Mr Sibanda', 'Lab 1'],
  '2|Tue': ['Mathematics', 'Form 2A', 'Mrs Nyathi', 'Rm 4'],
  '2|Thu': ['English Language', 'Form 2A', 'Mr Chirwa', 'Rm 7'],
  '2|Fri': ['Geography', 'Form 2A', 'Mr Dube', 'Rm 11'],
  '3|Mon': ['History', 'Form 2A', 'Mr Dube', 'Rm 11'],
  '3|Wed': ['English Language', 'Form 2A', 'Mr Chirwa', 'Rm 7'],
  '3|Thu': ['Mathematics', 'Form 2A', 'Mrs Nyathi', 'Rm 4'],
  '4|Tue': ['Physical Education', 'Form 2A', 'Mr Sibanda', 'Field'],
  '4|Wed': ['Shona', 'Form 2A', 'Mrs Moyo', 'Rm 9'],
  '4|Fri': ['Combined Science', 'Form 2A', 'Mr Sibanda', 'Lab 1'],
}

const PERIODS = [
  ['1', '08:00–08:40', true],
  ['2', '08:40–09:20', true],
  ['Break', '09:20–09:40', false],
  ['3', '09:40–10:20', true],
  ['4', '10:20–11:00', true],
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export const Timetable = () =>
  adminArtboard({
    title: 'Timetable',
    railItem: 'Timetable',
    caption: 'Term 2 &middot; Form 2A',
    search: 'Search lessons',
    action: { label: 'Add lesson' },
    chips: [
      { label: 'Lessons placed', value: '15 of 20', tone: 'warn' },
      { label: 'Free periods', value: '5' },
      { label: 'Clashes', value: '0', tone: 'ok' },
    ],
    content: page(`
      ${sectionTitle(
        'The week',
        rowFlex(`${ghostBtn('Build timetable', I.grid)}${ghostBtn('Copy forward', I.history)}${solidBtn('Add lesson', I.plus)}`),
      )}
      ${filters(
        filterSelect('Show', 'By class', { w: 150 }) +
          filterSelect('Class', 'Form 2A') +
          filterSelect('Term', 'Term 2 &middot; 2026', { w: 190 }) +
          filterSelect('Room', 'Every room', { w: 150 }) +
          filterSelect('Day', 'The whole week', { w: 160 }),
        searchField('Search lessons', { w: 220 }),
      )}
      ${card({
        title: 'Form 2A',
        note: 'Monday to Friday &middot; 4 teaching periods a day',
        children: `<div style="padding: 12px 13px 14px; overflow-x: auto">
          <div style="min-width: 900px; display: grid; grid-template-columns: 118px repeat(5, minmax(0, 1fr)); gap: 5px">
            <div style="font-size: 11px; font-weight: 700; color: ${C.mid}; padding: 4px 6px">Period</div>
            ${DAYS.map((d) => `<div style="font-size: 11px; font-weight: 700; color: ${C.mid}; padding: 4px 6px">${d}</div>`).join('')}
            ${PERIODS.map(([p, time, teaching]) =>
              [
                `<div style="padding: 8px 6px; border-radius: 7px; background: ${C.canvas}"><div style="font-size: 12px; font-weight: 700; color: ${C.strong}">${p}</div>${mono(time, { size: 10.5 })}</div>`,
                ...DAYS.map((d) => {
                  if (!teaching)
                    return `<div style="padding: 8px 6px; border-radius: 7px; background: ${C.muted}; display: flex; align-items: center; justify-content: center"><span style="font-size: 11px; color: ${C.subtle}">${p}</span></div>`
                  const l = LESSONS[`${p}|${d}`]
                  if (!l)
                    return `<div style="min-height: 70px; border: 1px dashed ${C.borderStrong}; border-radius: 7px; display: flex; align-items: center; justify-content: center; cursor: pointer"><span style="font-size: 11.5px; font-weight: 600; color: ${C.faint}">Add</span></div>`
                  return `<div class="row" style="min-height: 70px; padding: 7px 9px; border: 1px solid ${C.border}; border-radius: 7px; background: ${C.surface}; display: flex; flex-direction: column; gap: 2px">
                    <span style="font-size: 12px; font-weight: 700; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${l[0]}</span>
                    <span style="font-size: 10.5px; color: ${C.mid}">${l[1]}</span>
                    <span style="font-size: 10.5px; color: ${C.subtle}">${l[2]}</span>
                    <span style="display: flex; align-items: center; justify-content: space-between; margin-top: auto">${badge(l[3], 'brand')}${icon(I.more, { size: 13, stroke: C.faint })}</span>
                  </div>`
                }),
              ].join(''),
            ).join('')}
          </div>
        </div>`,
      })}
      ${grid(
        3,
        `
        ${card({
          title: 'One day at a time',
          note: 'below lg',
          children: `<div style="padding: 11px 13px 4px">${filterSelect('Day', 'Tuesday', { w: 210 })}</div>
            ${[
              ['Mathematics &middot; Form 2A', '08:40–09:20 &middot; Mrs Nyathi &middot; Rm 4'],
              ['English Language &middot; Form 2A', '08:00–08:40 &middot; Mr Chirwa &middot; Rm 7'],
              ['Physical Education &middot; Form 2A', '10:20–11:00 &middot; Mr Sibanda &middot; Field'],
            ]
              .map(([t, s], i, a) => listRow(twoLine(t, s), { last: i === a.length - 1 }))
              .join('')}`,
        })}
        ${card({
          title: 'Removing a lesson',
          pad: true,
          children: stack(
            `${txt('<b>Remove</b> deletes a lesson with no confirmation. One mis-tap in a 900px grid of twenty-five cells and it is gone, with no undo &mdash; while every other destructive action in campus confirms first.', { size: 12, color: C.mid })}
             ${rowFlex(`${ghostBtn('Cancel')}${dangerBtn('Remove the lesson')}`)}`,
            9,
          ),
        })}
        ${card({
          title: 'The instruction that goes nowhere',
          pad: true,
          children: stack(
            `${alert({
              tone: 'brand',
              title: 'No periods yet',
              body: 'A timetable is a grid of days against periods. Set the school day up under Academics before adding lessons.',
            })}
             ${txt('There is no periods UI on <code>/schools/academics</code>. The onboarding alert points at a screen that does not exist.', { size: 12, color: C.mid })}`,
            9,
          ),
        })}
      `,
      )}
    `),
  })

/* ── 9. /schools/homework ───────────────────────────────────────────── */
export const Homework = () =>
  adminArtboard({
    title: 'Homework',
    railItem: 'Homework',
    caption: 'Term 2 &middot; every class',
    search: 'Search homework, subject or teacher',
    chips: [
      { label: 'Set and running', value: '46' },
      { label: 'Due this week', value: '18', tone: 'warn' },
      { label: 'Overdue', value: '7', tone: 'bad' },
    ],
    content: page(`
      ${lede('Every class&rsquo;s homework in one place &mdash; what is set, what is due, and how much of it came back.')}
      ${grid(
        3,
        [
          stat({ label: 'Set and running', value: '46', note: 'Published, deadline not yet passed' }),
          stat({ label: 'Due this week', value: '18', note: 'Monday to Sunday', tone: 'warn' }),
          stat({ label: 'Overdue', value: '7', note: 'Past the deadline with work still missing', tone: 'bad' }),
        ].join(''),
      )}
      ${filters(
        filterSelect('Term', 'This term') +
          filterSelect('Year group', 'Every year') +
          filterSelect('Subject', 'Every subject') +
          filterSelect('Teacher', 'Every teacher') +
          filterSelect('State', 'Anything set', { w: 160 }),
        searchField('Search homework, subject or teacher', { w: 270 }),
      )}
      ${grid(
        'minmax(0, 1fr) 320px',
        `
        ${card({
          children: table({
            cols: [
              { label: 'Subject and class', w: 176 },
              { label: 'Homework' },
              { label: 'Teacher', w: 108 },
              { label: 'Set', w: 72 },
              { label: 'Due', w: 92 },
              { label: 'Handed in', w: 92, align: 'right' },
              { label: 'State', w: 112 },
            ],
            rows: [
              ['Mathematics &middot; Form 2A', 'Simultaneous equations, exercise 4', '12 marked &middot; 2 in late', 'Mrs Nyathi', '17 Aug', '21 Aug', 28, 32, 'Overdue', 'bad'],
              ['English Language &middot; Form 2B', 'Comprehension &mdash; &ldquo;The Rain Came&rdquo;', 'Nothing marked yet', 'Mr Chirwa', '19 Aug', '26 Aug', 4, 31, 'Due this week', 'warn'],
              ['Combined Science &middot; Form 3A', 'Write up the titration practical', '30 marked', 'Mr Sibanda', '14 Aug', '20 Aug', 30, 30, 'Running', 'ok'],
              ['Geography &middot; Form 4A', 'Map skills, questions 1&ndash;8', 'Nothing marked yet', 'Unassigned', '20 Aug', 'No deadline', 0, 29, 'Not set yet', 'plain'],
              ['Shona &middot; Form 2A', 'Tsumo nemadimikira &mdash; 20 examples', '19 marked &middot; 1 in late', 'Mrs Moyo', '18 Aug', '25 Aug', 26, 32, 'Due this week', 'warn'],
              ['History &middot; Form 3B', 'The First Chimurenga &mdash; source questions', '8 marked', 'Mr Dube', '15 Aug', '22 Aug', 24, 30, 'Overdue', 'bad'],
            ].map(([sc, title, marked, teacher, set, due, handed, roll, state, tone]) => [
              txt(sc, { size: 12, weight: 600, color: C.strong, ellipsis: true }),
              twoLine(title, marked),
              txt(teacher, { size: 12, color: teacher === 'Unassigned' ? C.subtle : C.mid }),
              mono(set, { size: 11.5 }),
              mono(due, { size: 11.5, color: tone === 'bad' ? C.bad : C.subtle }),
              `<span style="display: flex; align-items: center; gap: 7px; justify-content: flex-end; width: 100%">
                 <span style="width: 30px">${progress(Math.round((handed / roll) * 100), handed >= roll ? C.ok : tone === 'bad' ? C.bad : C.warn, 5)}</span>
                 ${mono(`${handed} of ${roll}`, { size: 11.5, color: handed >= roll ? C.ok : tone === 'bad' ? C.bad : C.body, weight: 700 })}</span>`,
              badge(state, tone),
            ]),
          }),
        })}
        ${stack(`
          ${card({
            title: 'Which class is drowning',
            note: 'set this week',
            children: [
              ['Form 2A', 5],
              ['Form 3B', 4],
              ['Form 2B', 4],
              ['Form 4A', 3],
              ['Form 3A', 2],
            ]
              .map(([g, n], i, a) =>
                listRow(
                  `${txt(g, { size: 12, color: C.mid, flex: '0 0 74px' })}
                   <span style="flex: 1; min-width: 0">${progress(Math.round((n / 5) * 100), n >= 5 ? C.warn : C.brand)}</span>
                   ${mono(String(n), { size: 11.5, color: C.body, weight: 700 })}`,
                  { last: i === a.length - 1 },
                ),
              )
              .join(''),
          })}
          ${card({
            title: 'Handed in, of the roll',
            pad: true,
            children: txt(
              '<b>4 of 32</b> and <b>4 of 5</b> are the same submission count and completely different Tuesdays. That is why the roll travels with every row rather than a bare tally of what arrived.',
              { size: 12, color: C.mid },
            ),
          })}
          ${card({
            title: 'Every row is a dead end',
            pad: true,
            children: stack(
              `${txt('Nothing on this table links anywhere, so a deputy who spots <b>4 of 31 handed in</b> cannot open the homework, see who is missing, or chase them.', { size: 12, color: C.mid })}
               ${rowFlex(`${ghostBtn('Who has not handed in', I.users)}${ghostBtn('Message the class', I.send)}`)}`,
              9,
            ),
          })}
          ${card({
            title: 'Why the tiles ignore the filter',
            pad: true,
            children: txt(
              'The three tiles count the term and the class filters, never the <b>State</b> filter below them: a head reads &ldquo;7 overdue&rdquo;, then narrows the table to see which seven. Narrowing the tiles too would leave every tile reading its own filter back at itself.',
              { size: 12, color: C.mid },
            ),
          })}
        `)}
      `,
      )}
    `),
  })

/* ── 10. /schools/goals — subject targets ───────────────────────────── */
const goalRow = ([name, no, cls, subj, target, now, plan, state, tone], last) =>
  listRow(
    `<span style="display: flex; align-items: center; gap: 7px; width: 218px; flex-shrink: 0">${avatar(ini(name))}${twoLine(esc(name), no, { mono: true })}</span>
     <span style="width: 100px; flex-shrink: 0">${txt(cls, { size: 12, color: cls === 'Not placed' ? C.subtle : C.mid })}</span>
     <span style="width: 142px; flex-shrink: 0">${txt(subj, { size: 12, color: subj === 'Every subject' ? C.subtle : C.mid })}</span>
     <span style="width: 72px; flex-shrink: 0; display: flex; justify-content: flex-end">${mono(target, { size: 12, color: target === 'Not set' ? C.bad : C.strong, weight: 700 })}</span>
     <span style="width: 72px; flex-shrink: 0; display: flex; justify-content: flex-end">${mono(now, { size: 12, color: tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.faint, weight: 700 })}</span>
     <span style="flex: 1; min-width: 0">${txt(esc(plan), { size: 12, color: C.mid, ellipsis: true })}</span>
     <span style="width: 112px; flex-shrink: 0">${badge(state, tone)}</span>
     <span style="width: 78px; flex-shrink: 0; display: flex; justify-content: flex-end">${target === 'Not set' ? tinyBtn('Set a target', 'brand') : tinyBtn('Edit')}</span>`,
    { last },
  )

export const Goals = () =>
  adminArtboard({
    title: 'Subject targets',
    railItem: 'Subject targets',
    caption: 'Term 2 &middot; 842 on the roll',
    search: 'Search pupil, class or subject',
    chips: [
      { label: 'With a target', value: '604' },
      { label: 'With none', value: '238', tone: 'bad' },
      { label: 'At or above', value: '411', tone: 'ok' },
    ],
    bandActions: [ghostBtn('Export', I.download), solidBtn('Set targets for the 238', I.target)],
    content: page(`
      ${lede('What each pupil is aiming for this term, and which pupils nobody has set a target for.')}
      ${grid(
        3,
        [
          stat({ label: 'Pupils with a target', value: '604', note: 'of 842 on the roll' }),
          stat({ label: 'Pupils with none', value: '238', note: 'Nobody has set these children anything', tone: 'bad' }),
          stat({ label: 'At or above target', value: '411', note: 'Counted only where there is a mark to compare', tone: 'ok' }),
        ].join(''),
      )}
      ${filters(
        filterSelect('Term', 'This term') +
          filterSelect('Year group', 'Every year') +
          filterSelect('Subject', 'Every subject') +
          filterSelect('Standing', 'Everyone', { w: 190 }),
        searchField('Search pupil, class or subject', { w: 270 }),
      )}
      ${card({
        children:
          table({
            cols: [
              { label: 'Pupil', w: 218 },
              { label: 'Class', w: 100 },
              { label: 'Subject', w: 142 },
              { label: 'Target', w: 72, align: 'right' },
              { label: 'Now', w: 72, align: 'right' },
              { label: 'How they will get there' },
              { label: 'State', w: 112 },
              { label: '', w: 78 },
            ],
            rows: [],
          }) +
          `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('Form 2A')}</div>` +
          [
            ['Mutasa, Tanaka', 'CHS-1219', 'Form 2A', 'Mathematics', '72%', '78%', 'Past papers every Tuesday with Mrs Nyathi.', 'At target', 'ok'],
            ['Chikwanda, Rutendo', 'CHS-1180', 'Form 2A', 'Mathematics', '68%', '61%', 'Needs the algebra clinic — booked for Thursday.', 'Below target', 'warn'],
            ['Dube, Tapiwa', 'CHS-1204', 'Form 2A', 'Combined Science', 'Not set', '—', '—', 'No target', 'bad'],
            ['Gwatidzo, Anesu', 'CHS-1226', 'Form 2A', 'English Language', '75%', '—', 'Reading journal, one book a fortnight.', 'No mark yet', 'plain'],
          ]
            .map((r) => goalRow(r, false))
            .join('') +
          `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('Form 3A')}</div>` +
          [
            ['Nyathi, Kudzai', 'CHS-1233', 'Form 3A', 'Combined Science', '65%', '69%', 'Weekly practical write-up with Mr Sibanda.', 'At target', 'ok'],
            ['Zimuto, Nyasha', 'CHS-1240', 'Form 3A', 'Mathematics', 'Not set', '—', '—', 'No target', 'bad'],
          ]
            .map((r) => goalRow(r, false))
            .join('') +
          `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('Not placed in a class')}</div>` +
          goalRow(['Mafuta, Simba', 'CHS-1301', 'Not placed', 'Every subject', 'Not set', '—', '—', 'No target', 'bad'], true),
      })}
      ${grid(
        3,
        `
        ${card({
          title: 'The rows start from the roll',
          pad: true,
          children: txt(
            'A targets list built from the targets table can only show the children somebody has already thought about. The head&rsquo;s question is the other one &mdash; <b>which pupils have no target at all</b> &mdash; so a pupil with nothing set is a row saying so.',
            { size: 12, color: C.mid },
          ),
        })}
        ${card({
          title: 'No mark is not behind',
          pad: true,
          children: txt(
            'A missing mark says nothing about how the target is going, so it is neutral rather than a warning. Reading it as &ldquo;behind&rdquo; would put a child on a chase list over a test nobody has marked.',
            { size: 12, color: C.mid },
          ),
        })}
        ${card({
          title: 'The missing half',
          pad: true,
          children: stack(
            `${txt('The screen&rsquo;s whole purpose is naming the 238 pupils nobody has set a target for &mdash; and today there is no way to set one from here. Every row is a dead end.', { size: 12, color: C.mid })}
             ${txt('<b>Set a target</b> on the row, and one over the filtered set, is what turns the list into work.', { size: 12, color: C.mid })}`,
            8,
          ),
        })}
      `,
      )}
    `),
  })
