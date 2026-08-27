/**
 * Results page — a year group's mark sheets, the moderation queue and the
 * publishing windows.
 *
 * Called by build-module.mjs. This is the part of campus with the widest gap
 * between what the API can do and what any screen offers: five transition
 * endpoints exist (submit, hod-approve, hod-request-changes, publish,
 * unpublish) and none has a call site, so both queues are read-only tables.
 */
import {
  C, esc, adminArtboard, page, grid, rowFlex, card, table, listRow, badge, mono,
  txt, filterSelect, searchField, segments,
} from '../lib/kit.mjs'

const note = () => ''

const SHEET_TONE = {
  Draft: 'plain',
  Submitted: 'warn',
  'HOD Approved': 'ok',
  Approved: 'ok',
  'HOD Rejected': 'bad',
  'Sent back': 'bad',
  Published: 'brand',
}

const sheetCell = (title, sub) =>
  `<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(title)}</span>${mono(sub, { size: 10.5 })}</span>`

/* ── /schools/results/class/[classId] ───────────────────────────────── */
export const ResultsClass = () =>
  adminArtboard({
    title: 'Form 2 marks',
    railItem: 'Results overview',
    caption: 'Term 2 &middot; 36 sheets',
    search: 'Search mark sheets',
    back: true,
    chips: [
      { label: 'Draft', value: '9' },
      { label: 'Submitted', value: '14', tone: 'warn' },
      { label: 'Approved', value: '8', tone: 'ok' },
      { label: 'Published', value: '5', tone: 'brand' },
    ],
    content: page(`
      ${rowFlex(`${filterSelect('Class', 'Every class')}${filterSelect('Status', 'Any status')}<div style="flex: 1"></div>${searchField('Search mark sheets', { w: 250 })}`, { align: 'flex-end' })}
      ${card({
        children: [
          ['Mathematics — end of term', '2A · Term 2 · 32 marks · average 64.2', 'Submitted'],
          ['English Language — end of term', '2A · Term 2 · 32 marks · average 58.9', 'Approved'],
          ['Combined Science — end of term', '2A · Term 2 · 31 marks · average 61.4', 'Published'],
          ['Shona — end of term', '2A · Term 2 · 32 marks · average 70.1', 'Sent back'],
          ['Geography — end of term', '2A · Term 2 · 0 marks', 'Draft'],
          ['Mathematics — end of term', '2B · Term 2 · 31 marks · average 59.8', 'Submitted'],
        ]
          .map(([title, sub, status], i, a) =>
            listRow(`<span style="flex: 1; min-width: 0">${sheetCell(title, sub)}</span>${badge(status, SHEET_TONE[status])}`, {
              last: i === a.length - 1,
            }),
          )
          .join(''),
      })}
      ${txt('Moderation and publishing act on these sheets &mdash; <a href="#">moderation queue</a> and <a href="#">publishing</a>.', { size: 12, color: C.mid })}
      ${grid(
        2,
        `
        ${note('today', 'Every row is <code>static</code> &mdash; no link, no action, nothing to open. A deputy who sees <b>Geography, 0 marks</b> two days before the deadline cannot open it, cannot see whose marks are missing, and cannot chase the teacher from here.')}
        ${note('today', 'This screen says <b>Approved</b> and <b>Sent back</b>. The moderation queue, listing the same sheets, says <b>HOD Approved</b> and <b>HOD Rejected</b>. Two vocabularies, one enum &mdash; a teacher and a head reading the same sheet see different words for its state.')}
      `,
      )}
    `),
  })

/* ── the eight-cell summary strip, shared by both queue screens ─────── */
const SUMMARY = [
  ['Draft', '38', 'plain'],
  ['Submitted', '14', 'warn'],
  ['HOD Rejected', '3', 'bad'],
  ['HOD Approved', '46', 'ok'],
  ['Published', '63', 'brand'],
  ['Windows Open', '2', 'ok'],
  ['Windows Scheduled', '3', 'plain'],
  ['Windows Closed', '1', 'plain'],
]

const summaryStrip = () =>
  `<div style="display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 1px; background: ${C.border}; border: 1px solid ${C.border}; border-radius: 10px; overflow: hidden">
    ${SUMMARY.map(
      ([label, value, tone]) =>
        `<div style="background: ${C.surface}; padding: 11px 12px"><div style="font-size: 10.5px; color: ${C.mid}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${label}</div><div class="mono" style="font-size: 19px; font-weight: 700; letter-spacing: -.02em; margin-top: 3px; color: ${tone === 'bad' ? C.bad : tone === 'warn' ? C.warn : tone === 'ok' ? C.ok : tone === 'brand' ? C.brandStrong : C.strong}">${value}</div></div>`,
    ).join('')}
  </div>`

/* ── /schools/results/moderation ────────────────────────────────────── */
export const ResultsModeration = () =>
  adminArtboard({
    title: 'Results Moderation',
    railItem: 'Moderation',
    caption: 'Term 2 &middot; 14 waiting',
    search: 'Search moderation queue',
    content: page(`
      ${summaryStrip()}
      ${rowFlex(`${segments([{ label: 'Moderation Queue', count: 14 }, { label: 'All Sheets', count: 164 }], 'Moderation Queue')}<div style="flex: 1"></div>${searchField('Search moderation queue', { w: 250 })}`, { align: 'flex-end' })}
      ${card({
        title: 'Moderation Queue',
        children: table({
          cols: [
            { label: 'Updated', w: 100 },
            { label: 'Sheet' },
            { label: 'Status', w: 120 },
            { label: 'Lines', w: 70, align: 'right' },
            { label: 'Average', w: 90, align: 'right' },
            { label: 'Published', w: 100 },
          ],
          rows: [
            ['22 Aug', 'Mathematics — end of term', 'Term 2 / Form 2 / 2A', 'Submitted', '32', '64.2', '—'],
            ['22 Aug', 'Mathematics — end of term', 'Term 2 / Form 2 / 2B', 'Submitted', '31', '59.8', '—'],
            ['21 Aug', 'English Language — end of term', 'Term 2 / Form 3 / 3A', 'Submitted', '30', '62.7', '—'],
            ['21 Aug', 'Shona — end of term', 'Term 2 / Form 2 / 2A', 'HOD Rejected', '32', '70.1', '—'],
            ['20 Aug', 'Combined Science — end of term', 'Term 2 / Form 4 / 4A', 'Submitted', '29', '55.3', '—'],
          ].map(([when, title, sub, status, lines, avg, pub]) => [
            mono(when, { size: 11.5 }),
            sheetCell(title, sub),
            badge(status, SHEET_TONE[status]),
            mono(lines, { size: 12, color: C.body }),
            mono(avg, { size: 12, color: C.body }),
            mono(pub, { size: 11.5 }),
          ]),
        }),
      })}
      ${grid(
        2,
        `
        ${note('today', 'That is the entire screen. <b>No approve, no send back, no submit, no publish, no row menu, no dialog</b> &mdash; two search boxes and two tables. The eight-cell summary even counts publish windows on a page that has no windows view.')}
        ${note('proposed', 'Five endpoints already exist &mdash; <code>submit</code>, <code>hod-approve</code>, <code>hod-request-changes</code>, <code>publish</code>, <code>unpublish</code> &mdash; each permission-gated and each with <b>zero call sites</b> in the app. <code>HOD_APPROVED</code> is a state no human being can reach. The Leadership canvas draws this queue with its verbs.')}
      `,
      )}
    `),
  })

/* ── /schools/results/publish ───────────────────────────────────────── */
export const ResultsPublish = () =>
  adminArtboard({
    title: 'Results Publishing',
    railItem: 'Publishing',
    caption: 'Term 2 &middot; 2 windows open',
    search: 'Search publish windows',
    content: page(`
      ${summaryStrip()}
      ${rowFlex(`${segments([{ label: 'Publish Windows', count: 6 }, { label: 'Published', count: 63 }, { label: 'All Sheets', count: 164 }], 'Publish Windows')}<div style="flex: 1"></div>${searchField('Search publish windows', { w: 250 })}`, { align: 'flex-end' })}
      ${card({
        title: 'Publish Windows',
        children: table({
          cols: [
            { label: 'Status', w: 120 },
            { label: 'Scope' },
            { label: 'Open', w: 130 },
            { label: 'Close', w: 130 },
            { label: 'Notes', w: 240 },
          ],
          rows: [
            ['Open', 'Term 2 / Form 4 / 4A', '20 Aug 08:00', '5 Sep 17:00', 'Mocks — released to families early'],
            ['Open', 'Term 2 / All Classes', '27 Aug 18:00', '12 Sep 17:00', '—'],
            ['Scheduled', 'Term 2 / Form 1', '1 Sep 08:00', '12 Sep 17:00', '—'],
            ['Scheduled', 'Term 2 / Form 2', '1 Sep 08:00', '12 Sep 17:00', '—'],
            ['Scheduled', 'Term 2 / Form 3', '1 Sep 08:00', '12 Sep 17:00', '—'],
            ['Closed', 'Term 1 / All Classes', '20 Mar 08:00', '3 Apr 17:00', 'Closed after the Easter break'],
          ].map(([status, scope, open, close, notes]) => [
            badge(status, status === 'Open' ? 'ok' : status === 'Closed' ? 'plain' : 'warn'),
            txt(scope, { size: 12.5, weight: 600, color: C.strong }),
            mono(open, { size: 11.5, color: C.body }),
            mono(close, { size: 11.5, color: C.body }),
            txt(notes, { size: 12, color: notes === '—' ? C.subtle : C.mid, ellipsis: true }),
          ]),
        }),
      })}
      ${grid(
        2,
        `
        ${note('today', 'No <b>New window</b>, no open, no close, no publish, no unpublish. The route the nav would use for this &mdash; <code>/schools/results/publish/windows</code> &mdash; exists as a page and <code>redirect()</code>s straight back here, and the API for creating a window is fully built and never called.')}
        ${note('today', 'The teacher portal&rsquo;s settings panel explains the mechanism to teachers in plain words &mdash; <b>&ldquo;The office opens a window per term&hellip;&rdquo;</b> &mdash; describing a control that exists in no screen. See <b>PublishWindows</b> on the Leadership canvas.')}
      `,
      )}
    `),
  })
