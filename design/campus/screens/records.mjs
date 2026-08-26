/**
 * Records page — the people the school keeps: the class roll, the roll-up,
 * admissions, imports, guardians and teachers with their record pages, and
 * the identity settings that decide how a pupil is numbered.
 *
 * Called by build-module.mjs. Copy is the source verbatim.
 */
import {
  C, I, icon, esc, adminArtboard, page, grid, stack, rowFlex, card, table, listRow,
  badge, avatar, mono, txt, alert, emptyState, ghostBtn, solidBtn, filterSelect,
  searchField, segments, sectionLabel, stat, proposalTag, tinyBtn, field,
} from '../lib/kit.mjs'

const note = () => ''

const ini = (name) => {
  const [last, first] = name.split(', ')
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

const pupilCell = (name, no, adm) =>
  `${avatar(ini(name))}<span style="min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.brandStrong}">${esc(name)}</span>${mono(`${no}${adm ? ` · Admission ${adm}` : ''}`, { size: 10.5 })}</span>`

const rollCells = ([n, no, adm, cls, st, tone, bd, g]) =>
  `<span style="display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0">${pupilCell(n, no, adm)}</span>
   <span style="width: 130px; flex-shrink: 0">${txt(cls, { size: 12, color: cls === '—' ? C.subtle : C.mid })}</span>
   <span style="width: 110px; flex-shrink: 0">${badge(st, tone)}</span>
   <span style="width: 110px; flex-shrink: 0">${badge(bd, bd === 'Boarder' ? 'brand' : 'plain')}</span>
   <span style="width: 180px; flex-shrink: 0">${txt(g, { size: 11.5, color: g.startsWith('No guardian') ? C.bad : C.mid, ellipsis: true })}</span>`

/* ── /schools/students/class/[classId] ──────────────────────────────── */
export const StudentsClass = () =>
  adminArtboard({
    title: 'Form 2',
    railItem: 'All students',
    caption: 'Term 2 &middot; 118 on the roll',
    search: 'Search this year group',
    chips: [
      { label: 'On the roll', value: '118' },
      { label: 'Boarders', value: '44' },
      { label: 'Suspended', value: '2', tone: 'warn' },
    ],
    bandActions: [ghostBtn('Class list', I.print), ghostBtn('Export', I.download)],
    content: page(`
      ${rowFlex(`${filterSelect('Class', 'Every class')}${filterSelect('Status', 'Any status')}${filterSelect('Boarding', 'Boarders and day')}<div style="flex: 1"></div>${searchField('Search this year group', { w: 250 })}`, { align: 'flex-end' })}
      ${card({
        children:
          table({
            cols: [{ label: 'Student' }, { label: 'Class', w: 130 }, { label: 'Status', w: 110 }, { label: 'Boarding', w: 110 }, { label: 'Guardians', w: 180 }],
            rows: [],
          }) +
          `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('2A')}</div>` +
          [
            ['Chikwanda, Rutendo', 'CHS-1180', 'ADM-0942', '2A', 'Active', 'ok', 'Day', 'Esther Chikwanda'],
            ['Dube, Tapiwa', 'CHS-1204', 'ADM-0971', '2A', 'Active', 'ok', 'Boarder', 'Regis Dube'],
            ['Mutasa, Tanaka', 'CHS-1219', 'ADM-0994', '2A', 'Active', 'ok', 'Boarder', 'Grace Mutasa, Peter Mutasa'],
          ]
            .map((r) => listRow(rollCells(r)))
            .join('') +
          `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('2B')}</div>` +
          [
            ['Moyo, Farai', 'CHS-1211', 'ADM-0982', '2B', 'Suspended', 'bad', 'Day', 'Tsitsi Moyo'],
            ['Zimuto, Nyasha', 'CHS-1240', 'ADM-1006', '2B', 'Active', 'ok', 'Boarder', 'No guardian linked'],
          ]
            .map((r) => listRow(rollCells(r)))
            .join('') +
          `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('Not in a class yet')}</div>` +
          listRow(rollCells(['Mafuta, Simba', 'CHS-1301', 'ADM-1044', '—', 'Applicant', 'plain', 'Day', 'Loveness Mafuta']), { last: true }),
      })}
      ${grid(
        2,
        `
        ${note('today', 'No create, no bulk, no row menu. <b>Adding a pupil is not reachable from the students area at all</b> &mdash; only through Admissions &rarr; Enrol, or an import. The nav calls this &ldquo;All students&rdquo;, so it is the first place anyone looks.')}
        ${note('proposed', 'The <b>Class list</b> and <b>Export</b> actions in the band are the two the class record page already has as server-rendered PDFs; the roll is where a form teacher expects them, so they belong here too.')}
      `,
      )}
    `),
  })

/* ── /schools/students/roll-up ──────────────────────────────────────── */
const rollUpRow = (name, sub, action, chip, done, last) =>
  listRow(
    `<span style="flex: 1; min-width: 0; ${done ? 'opacity: .55' : ''}"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>
     ${chip ?? ''}
     ${done ? badge('Already done') : `<span style="display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 9px; border: 1px solid ${C.border}; border-radius: 6px; background: ${C.surface}; width: 168px; flex-shrink: 0"><span style="flex: 1; font-size: 12px; color: ${C.body}">${esc(action)}</span>${icon(I.chevD, { size: 13, stroke: C.faint, w: 2 })}</span>`}`,
    { last },
  )

export const StudentRollUp = () =>
  adminArtboard({
    title: 'Roll up the year',
    railItem: 'Roll up the year',
    caption: 'Term 1 &rarr; Term 2',
    search: 'Search the roll',
    chips: [
      { label: 'Moving up', value: '772', tone: 'ok' },
      { label: 'Leaving', value: '48' },
      { label: 'No ladder', value: '22', tone: 'warn' },
      { label: 'Below 50%', value: '61', tone: 'bad' },
    ],
    bandActions: [solidBtn('Roll 772 students up')],
    content: page(`
      ${alert({
        tone: 'warn',
        title: 'Built from where each child sits now',
        body: 'Term 2 has no enrolment records, so this list came from each student&rsquo;s current year group instead. That is a weaker fact than an enrolment &mdash; worth a look before rolling 842 records over.',
      })}
      ${rowFlex(`${filterSelect('From term', 'Current term')}${filterSelect('Into term', 'The next one')}${filterSelect('Year group', 'The whole school')}`, { align: 'flex-end' })}
      ${txt('Term 1 &rarr; Term 2 &middot; 772 moving up, 48 leaving, 22 with no ladder &middot; 61 below 50%', { size: 12.5, color: C.mid })}
      ${card({
        title: 'Form 2',
        note: '118',
        children: `
          ${rollUpRow('Chikwanda, Rutendo', 'CHS-1180 · Form 2 → Form 3 · average 64%', 'Move up', null, false, false)}
          ${rollUpRow('Dube, Tapiwa', 'CHS-1204 · Form 2 → Form 3 · average 71%', 'Move up', null, false, false)}
          ${rollUpRow('Moyo, Farai', 'CHS-1211 · Form 2 → Form 3 · average 41%', 'Repeat the year', badge('Below 50%', 'bad'), false, false)}
          ${rollUpRow('Mutasa, Tanaka', 'CHS-1219 · Form 2 → Form 3 · average 78%', 'Move up', null, true, false)}
          ${rollUpRow('Zimuto, Nyasha', 'CHS-1240 · Form 2 → Form 3 · average 58%', 'Move up', null, false, true)}`,
      })}
      ${card({
        title: 'Form 4',
        note: '96',
        children: `
          ${rollUpRow('Mafuta, Simba', 'CHS-1301 · Form 4 → no year group above · average 66%', 'Leaving', badge('No ladder', 'warn'), false, false)}
          ${rollUpRow('Nyathi, Kudzai', 'CHS-1233 · Form 4 → no year group above · average 82%', 'Leaving', badge('No ladder', 'warn'), false, true)}`,
      })}
      ${note('today', 'The primary action commits <b>directly, with no confirmation dialog</b> &mdash; one click moves 772 children into the next year. Everything else destructive in campus confirms; the one action that rewrites the whole school does not.')}
    `),
  })

/* ── /schools/admissions ────────────────────────────────────────────── */
const applicantRow = (name, sub, actions, last) =>
  listRow(
    `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>
     <span style="display: flex; gap: 6px; flex-shrink: 0">${actions}</span>`,
    { last },
  )

export const Admissions = () =>
  adminArtboard({
    title: 'Admissions',
    railItem: 'Admissions',
    caption: 'Term 2 &middot; 61 in the pipeline',
    search: 'Name or number',
    action: { label: 'New application' },
    content: page(`
      ${alert({
        title: '3 offers have run out',
        body: 'Mafuta, Simba (APP-0114), Ncube, Tariro (APP-0119), Sibanda, Ruvimbo (APP-0121) &mdash; the place is being held for a family that has not answered.',
      })}
      ${rowFlex(`${segments([{ label: 'Pipeline', count: 61 }, { label: 'Enrolments', count: 842 }], 'Pipeline')}<div style="flex: 1"></div>${ghostBtn('Show closed')}`)}
      ${rowFlex(`${searchField('Name or number', { w: 220, label: 'Find' })}${filterSelect('Year group', 'Any year group')}${filterSelect('Stage', 'Open stages')}`, { align: 'flex-end' })}
      ${txt('14 enquiry &middot; 18 applied &middot; 9 assessment &middot; 4 waiting list &middot; 8 offered &middot; 5 accepted &middot; 3 enrolled', { size: 12, color: C.mid })}
      ${grid(
        2,
        `
        ${stack(
          `
          ${card({
            title: 'Assessment',
            note: '9',
            children: `
              ${applicantRow('Ncube, Tariro', 'APP-0119 · Form 1 · Loveness Ncube · entrance 74%', `${tinyBtn('Waiting list')}${tinyBtn('Offered')}${tinyBtn('Turned down')}`, false)}
              ${applicantRow('Sibanda, Ruvimbo', 'APP-0121 · Form 1 · Joseph Sibanda · entrance 68%', `${tinyBtn('Waiting list')}${tinyBtn('Offered')}${tinyBtn('Turned down')}`, true)}`,
          })}
          ${card({
            title: 'Offered',
            note: '8',
            children: `
              ${applicantRow('Mafuta, Simba', 'APP-0114 · Form 1 · Loveness Mafuta · entrance 66%', `${badge('Offer lapsed', 'bad')}${tinyBtn('Accepted')}${tinyBtn('Withdrawn')}`, false)}
              ${applicantRow('Chirwa, Anesu', 'APP-0126 · Form 1 · Memory Chirwa · entrance 81%', `${tinyBtn('Accepted')}${tinyBtn('Withdrawn')}`, true)}`,
          })}
          ${card({
            title: 'Accepted',
            note: '5',
            children: `
              ${applicantRow('Marange, Tadiwa', 'APP-0108 · Form 1 · Shupikai Marange · entrance 77%', solidBtn('Enrol'), false)}
              ${applicantRow('Gwatidzo, Rufaro', 'APP-0110 · Form 1 · Netsai Gwatidzo · entrance 72%', solidBtn('Enrol'), true)}`,
          })}
        `,
          12,
        )}
        ${stack(
          `
          ${alert({ tone: 'ok', title: 'Enrolled', body: 'On the roll as <b class="mono">CHS-1344</b>.' })}
          ${alert({
            tone: 'warn',
            title: '2 existing applications worth a look',
            body: 'Mafuta, Simba (APP-0071) &mdash; same guardian phone.<br>Mafuta, Simbarashe (APP-0088) &mdash; same surname and date of birth.',
          })}
          ${card({
            title: 'The stage ladder',
            note: 'ALLOWED_TRANSITIONS',
            children: [
              ['Enquiry', 'plain', '14'],
              ['Applied', 'plain', '18'],
              ['Assessment', 'plain', '9'],
              ['Waiting list', 'warn', '4'],
              ['Offered', 'brand', '8'],
              ['Accepted', 'ok', '5'],
              ['Enrolled', 'ok', '3'],
              ['Turned down', 'bad', '—'],
              ['Withdrawn', 'bad', '—'],
            ]
              .map(([s, tone, n], i, a) =>
                listRow(`${badge(s, tone)}<span style="flex: 1"></span>${mono(n, { size: 11.5, color: C.mid })}`, { last: i === a.length - 1 }),
              )
              .join(''),
          })}
          ${note('today', 'Moving an application to <b>Offered</b> stamps a 14-day expiry automatically, and a lapsed offer is flagged in red at the top &mdash; but nothing tells the family, and there is no action on the alert to chase them.')}
        `,
          12,
        )}
      `,
      )}
    `),
  })

/* ── /schools/imports ───────────────────────────────────────────────── */
const step = (n, label, state) => {
  const [bg, fg, bd] =
    state === 'done' ? [C.okBg, C.ok, C.okBd] : state === 'now' ? [C.brand, '#fff', C.brand] : [C.surface, C.faint, C.border]
  return `<div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0">
    <span style="width: 22px; height: 22px; border-radius: 999px; background: ${bg}; border: 1px solid ${bd}; color: ${fg}; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${state === 'done' ? '&#10003;' : n}</span>
    <span style="font-size: 12px; font-weight: ${state === 'now' ? 700 : 500}; color: ${state === 'todo' ? C.faint : C.strong}; white-space: nowrap">${esc(label)}</span>
    <span style="flex: 1; height: 1px; background: ${C.border}; min-width: 12px"></span>
  </div>`
}

export const Imports = () =>
  adminArtboard({
    title: 'Import records',
    railItem: 'Import records',
    caption: 'Students &middot; 118 rows',
    search: 'Search imports',
    content: page(`
      ${txt('Bring students, parents, classes, fee structures and outstanding balances over from your old system.', { size: 12.5, color: C.mid })}
      ${card({
        children: `<div style="padding: 13px 16px; display: flex; align-items: center; gap: 6px">
          ${step(1, 'Choose and upload', 'done')}${step(2, 'Check the columns', 'done')}${step(3, 'Check the data', 'now')}${step(4, 'Import', 'todo')}
        </div>`,
      })}
      ${card({
        title: 'What this would do',
        note: 'Nothing has been written yet.',
        children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 12px">
          ${grid(
            3,
            [
              stat({ label: 'To be created', value: '104', tone: 'brand' }),
              stat({ label: 'Already here', value: '9' }),
              stat({ label: 'Cannot be imported', value: '5', tone: 'bad' }),
            ].join(''),
          )}
          ${alert({ tone: 'warn', title: 'Columns nothing will read', body: '<b>House</b>, <b>Old school ref</b>. Nothing in these will be imported.' })}
          <div>
            <div style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">5 rows need fixing</div>
            <div style="font-size: 11.5px; color: ${C.mid}; margin-top: 2px; line-height: 1.5">The row numbers are the ones in your spreadsheet. Fix them there and upload it again, or import the rest without them.</div>
          </div>
          <div style="border: 1px solid ${C.border}; border-radius: 9px; overflow: hidden">
            ${table({
              cols: [{ label: 'Row', w: 70 }, { label: 'Column', w: 170 }, { label: 'What is wrong' }],
              rows: [
                ['14', 'Class', '“Form 2 Blue” is not a class at this school.'],
                ['22', 'Student number', 'Empty. A pupil cannot be brought over without one.'],
                ['31', 'Date of birth', '“31/02/2013” is not a date.'],
                ['47', 'Student number', 'CHS-1180 appears twice in this file.'],
                ['88', 'Surname', 'Empty.'],
              ].map(([r, col, why]) => [
                mono(r, { size: 11.5, color: C.body }),
                txt(col, { size: 12, weight: 600, color: C.strong }),
                txt(esc(why), { size: 12, color: C.mid }),
              ]),
            })}
          </div>
          ${rowFlex(`${ghostBtn('Start again')}<div style="flex: 1"></div>${solidBtn('Import the other 104')}`)}
        </div>`,
      })}
      ${card({
        title: 'Earlier imports',
        children: table({
          cols: [{ label: 'File' }, { label: 'Records', w: 160 }, { label: 'When', w: 130 }, { label: 'Result', w: 200 }, { label: '', w: 90, align: 'right' }],
          rows: [
            ['classes-2026.csv', 'Classes', '3 Aug 09:14', '18 created, 0 failed', 'ok'],
            ['students-form1-4.csv', 'Students', '3 Aug 09:31', '842 created, 0 failed', 'ok'],
            ['guardians.csv', 'Parents and guardians', '3 Aug 10:02', '1,106 created, 14 failed', 'warn'],
            ['balances-jul.csv', 'Opening balances', '4 Aug 08:40', 'Undone', 'plain'],
          ].map(([f, r, w, res, tone]) => [
            mono(f, { size: 11.5, color: C.brandStrong }),
            txt(r, { size: 12, color: C.mid }),
            mono(w, { size: 11.5 }),
            tone === 'plain' ? badge('Undone') : txt(res, { size: 12, color: tone === 'warn' ? C.warn : C.mid }),
            tone === 'plain' ? '' : tinyBtn('Undo'),
          ]),
        }),
      })}
      ${note('today', 'The best-written screen in the module. The ordering instruction &mdash; <b>&ldquo;a pupil cannot be put in a class that is not here yet&rdquo;</b> &mdash; and <b>&ldquo;A wrong guess waved through is worse than no guess&rdquo;</b> are what every other campus screen should sound like. It is also the only thing in campus that can be undone.')}
    `),
  })

/* ── /schools/guardians ─────────────────────────────────────────────── */
export const Guardians = () =>
  adminArtboard({
    title: 'Guardians',
    railItem: 'Guardians',
    caption: '1,106 on file &middot; 61 not invited',
    search: 'Search guardians',
    action: { label: 'Invite 61 to the portal', icon: I.mail },
    chips: [
      { label: 'On the portal', value: '1,045', tone: 'ok' },
      { label: 'Not invited', value: '61', tone: 'warn' },
    ],
    content: page(`
      ${rowFlex(`${filterSelect('Portal account', 'Everyone')}<div style="flex: 1"></div>${searchField('Search guardians', { w: 250 })}`, { align: 'flex-end' })}
      ${card({
        children: table({
          cols: [
            { label: 'Guardian No', w: 120 },
            { label: 'Name' },
            { label: 'Phone', w: 140 },
            { label: 'Email', w: 230 },
            { label: 'Portal', w: 110 },
            { label: 'Linked Students', w: 120, align: 'right' },
          ],
          rows: [
            ['GRD-0412', 'Mutasa, Grace', '077 412 8890', 'g.mutasa@example.co.zw', true, '1'],
            ['GRD-0413', 'Mutasa, Peter', '077 412 8891', 'p.mutasa@example.co.zw', true, '1'],
            ['GRD-0388', 'Moyo, Tsitsi', '071 220 4417', 'tsitsi.moyo@example.co.zw', true, '2'],
            ['GRD-0501', 'Dube, Regis', '078 990 1120', '—', false, '1'],
            ['GRD-0522', 'Chikwanda, Esther', '077 665 2210', 'e.chikwanda@example.co.zw', false, '1'],
          ].map(([no, name, phone, email, portal, n]) => [
            mono(no, { size: 11.5, color: C.brandStrong }),
            `<span style="display:flex;align-items:center;gap:7px;min-width:0">${avatar(ini(name))}<span style="font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span></span>`,
            mono(phone, { size: 11.5, color: C.body }),
            txt(email, { size: 12, color: email === '—' ? C.subtle : C.mid, ellipsis: true }),
            portal ? badge('Active', 'ok') : txt('Not invited', { size: 12, color: C.subtle }),
            mono(n, { size: 12, color: C.body, weight: 700 }),
          ]),
        }),
      })}
      ${grid(
        2,
        `
        ${note('today', 'The page title is <b>Guardians</b> and the content component renders a second <code>&lt;h2&gt;</code> also reading <b>Guardians</b> &mdash; exactly the duplicate the Foundation sheet is about. <code>/schools/subjects</code> does it too.')}
        ${note('today', 'There is no <b>Add guardian</b>: a guardian arrives only through an import or a student record. And this is the <b>only</b> mount of <code>PortalInviteDialog</code> in the whole app, even though it supports <code>subject=&quot;STUDENT&quot;</code> and three personas are granted <code>invite</code> on students and teachers.')}
      `,
      )}
    `),
  })

/* ── record-page shell, shared by the three record artboards ────────── */
const recordShell = ({ name, reference, subtitle, tabs, active, body, glance, props }) => `
  <div style="display: flex; height: 100%; min-height: 0">
    <div class="scroll" style="width: 172px; flex-shrink: 0; border-right: 1px solid ${C.border}; padding: 10px 8px; background: ${C.surface}">
      ${tabs
        .map(
          ([label, count]) =>
            `<div class="nav" style="display: flex; align-items: center; gap: 8px; height: 29px; padding: 0 9px; border-radius: 6px; margin-bottom: 1px; background: ${label === active ? C.brandSoft : 'transparent'}"><span style="flex: 1; font-size: 12.5px; font-weight: ${label === active ? 700 : 500}; color: ${label === active ? C.brandStrong : C.mid}">${esc(label)}</span>${count !== undefined ? mono(String(count), { size: 10.5, color: label === active ? C.brandStrong : C.faint }) : ''}</div>`,
        )
        .join('')}
    </div>
    <div class="scroll" style="flex: 1; min-width: 0; overflow-y: auto">
      <div style="position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 10px; height: var(--band-h); padding: 0 16px; background: ${C.canvas}; border-bottom: 1px solid ${C.border}">
        ${mono(reference, { size: 11.5, color: C.body, weight: 700 })}
        <span style="width: 1px; height: 14px; background: ${C.border}"></span>
        ${txt(subtitle, { size: 11.5, color: C.mid })}
      </div>
      <div style="padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 12px">${body}</div>
    </div>
    <div style="width: 300px; flex-shrink: 0; border-left: 1px solid ${C.border}; background: ${C.surface}; padding: 13px; display: flex; flex-direction: column; gap: 14px">
      <div style="display: flex; align-items: center; gap: 9px">
        ${avatar(ini(name), { size: 34 })}
        <div style="min-width: 0"><div style="font-size: 13px; font-weight: 700; color: ${C.strong}">${esc(name)}</div>${mono(reference, { size: 10.5 })}</div>
      </div>
      <div>
        ${sectionLabel('At a glance')}
        <div style="margin-top: 7px; display: flex; flex-direction: column; gap: 5px">
          ${glance
            .map(
              ([k, v]) =>
                `<div style="display: flex; align-items: center; justify-content: space-between"><span style="font-size: 11.5px; color: ${C.mid}">${esc(k)}</span><span class="mono" style="font-size: 12px; font-weight: 700; color: ${C.strong}">${esc(v)}</span></div>`,
            )
            .join('')}
        </div>
      </div>
      <div>
        ${sectionLabel('Properties')}
        <div style="margin-top: 7px; display: flex; flex-direction: column; gap: 3px">
          ${props
            .map(
              ([k, v, ro]) =>
                `<div style="display: flex; align-items: center; gap: 8px; min-height: 27px; padding: 0 7px; border-radius: 6px; background: ${ro ? 'transparent' : C.canvas}"><span style="width: 112px; flex-shrink: 0; font-size: 11px; color: ${C.mid}">${esc(k)}</span><span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${ro ? C.subtle : C.body}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(v)}</span></div>`,
            )
            .join('')}
        </div>
      </div>
    </div>
  </div>`

/* ── /schools/guardians/[id] ────────────────────────────────────────── */
export const GuardianRecord = () =>
  adminArtboard({
    title: 'Grace Mutasa',
    railItem: 'Guardians',
    caption: 'Guardians',
    back: true,
    search: null,
    content: `<div style="height: calc(1000px - 48px)">${recordShell({
      name: 'Mutasa, Grace',
      reference: 'GRD-0412',
      subtitle: '077 412 8890 &middot; 1 child',
      tabs: [
        ['Children', 1],
        ['Notes', 3],
        ['Files', 0],
      ],
      active: 'Children',
      glance: [
        ['Children', '1'],
        ['Gets fee notices', 'Yes'],
        ['Gets results', 'Yes'],
      ],
      props: [
        ['Phone', '077 412 8890'],
        ['Email', 'g.mutasa@example.co.zw'],
        ['Guardian number', 'GRD-0412'],
        ['Address', '14 Mission Road, Chishawasha'],
        ['National ID', '63-1188442-K-42'],
        ['Portal account', 'Claimed', true],
      ],
      body: `
        ${card({
          title: 'Children',
          children: listRow(
            `${avatar('TM')}<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.brandStrong}">Tanaka Mutasa</span>${txt('Mother &middot; Form 2A', { size: 11, color: C.subtle })}</span>${badge('Primary', 'brand')}${badge('Fees')}${badge('Results')}`,
            { last: true },
          ),
        })}
        ${card({
          title: 'Files',
          children: emptyState({
            ic: I.file,
            h: 180,
            title: 'Nothing attached',
            body: 'A birth certificate, a transfer letter, a medical note &mdash; anything that arrived on paper and belongs with this record.',
            action: `<span style="opacity:.45">${ghostBtn('Attach a file', I.upload)}</span>`,
          }),
        })}
        ${note('today', 'The <b>Files</b> tab is read-only &mdash; there is no upload control on any record page, of any of the six record types. The empty state describes files nobody can add.')}
      `,
    })}</div>`,
  })

/* ── /schools/teachers ──────────────────────────────────────────────── */
export const Teachers = () =>
  adminArtboard({
    title: 'Teachers',
    railItem: 'Teachers',
    caption: '48 on the staff list',
    search: 'Search teacher profiles',
    action: { label: 'Add Teacher' },
    bandActions: [ghostBtn('Add Subject', I.plus), ghostBtn('Allocate a teacher', I.users)],
    chips: [
      { label: 'Active', value: '46', tone: 'ok' },
      { label: 'No HR record', value: '7', tone: 'warn' },
    ],
    content: page(`
      ${rowFlex(`${segments([{ label: 'Teacher Profiles', count: 48 }, { label: 'Subjects', count: 22 }, { label: 'Assignments', count: 286 }], 'Teacher Profiles')}<div style="flex: 1"></div>${filterSelect('Status', 'Everyone', { w: 150 })}${searchField('Search teacher profiles', { w: 230 })}`, { align: 'flex-end' })}
      ${card({
        title: 'Teacher Profiles',
        children: table({
          cols: [
            { label: 'Teacher' },
            { label: 'Department', w: 140 },
            { label: 'Profile Flags', w: 185 },
            { label: 'Assignments', w: 95, align: 'right' },
            { label: 'HR record', w: 195 },
            { label: 'Active', w: 85 },
          ],
          rows: [
            ['Nyathi, Priscilla', 'T-0041 / p.nyathi@chishawasha.ac.zw', 'Mathematics', ['Class Teacher', 'HOD'], '9', 'EMP-0088', true],
            ['Chirwa, Tendai', 'T-0052 / t.chirwa@chishawasha.ac.zw', 'Languages', ['Class Teacher'], '8', 'EMP-0104', true],
            ['Sibanda, Moses', 'T-0060 / m.sibanda@chishawasha.ac.zw', 'Sciences', ['HOD'], '7', null, true],
            ['Moyo, Rejoice', 'T-0071 / r.moyo@chishawasha.ac.zw', 'Languages', ['General'], '6', 'EMP-0141', true],
            ['Dube, Alfred', 'T-0080 / a.dube@chishawasha.ac.zw', 'Humanities', ['General'], '5', null, false],
          ].map(([name, sub, dept, flags, n, emp, active]) => [
            `<span style="display:flex;align-items:center;gap:7px;min-width:0">${avatar(ini(name))}<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span></span>`,
            txt(dept, { size: 12, color: C.mid }),
            `<span style="display:flex;gap:5px">${flags.map((f) => badge(f, f === 'HOD' ? 'violet' : f === 'Class Teacher' ? 'brand' : 'plain')).join('')}</span>`,
            mono(n, { size: 12, color: C.body }),
            emp
              ? `<span style="display:flex;align-items:center;gap:6px">${badge(emp, 'ok')}${tinyBtn('Unlink')}</span>`
              : `<span style="display:flex;align-items:center;gap:6px">${badge('No HR record', 'warn')}${tinyBtn('Find the employee')}</span>`,
            active ? badge('Active', 'ok') : badge('Inactive'),
          ]),
        }),
      })}
      ${grid(
        2,
        `
        ${note('today', '<b>Desktop rows are not links.</b> Only the mobile list navigates to <code>/schools/teachers/[id]</code> &mdash; on a laptop the teacher record page is unreachable from the teacher list.')}
        ${note('today', 'Three separate subject lists exist &mdash; here, <code>/schools/subjects</code>, and Academics&rsquo; &ldquo;Subject Catalog&rdquo; &mdash; with different columns, different filters, and two different Add-Subject dialogs posting to two different endpoints, one defaulting <b>Core</b> on and one off.')}
      `,
      )}
    `),
  })

/* ── /schools/teachers/[id] ─────────────────────────────────────────── */
export const TeacherRecord = () =>
  adminArtboard({
    title: 'Priscilla Nyathi',
    railItem: 'Teachers',
    caption: 'Teachers',
    back: true,
    search: null,
    content: `<div style="height: calc(1000px - 48px)">${recordShell({
      name: 'Nyathi, Priscilla',
      reference: 'T-0041',
      subtitle: 'Mathematics &middot; Head of department &middot; Form teacher',
      tabs: [
        ['Teaches', 9],
        ['Notes', 1],
        ['Files', 0],
      ],
      active: 'Teaches',
      glance: [
        ['Subjects', '2'],
        ['Classes', '6'],
        ['Assignments', '9'],
      ],
      props: [
        ['Department', 'Mathematics'],
        ['Role', 'Head of department'],
        ['Holds a form', 'Yes'],
        ['Teaching', 'Currently teaching'],
        ['Email (account)', 'p.nyathi@chishawasha.ac.zw', true],
        ['Phone (account)', '077 300 1188', true],
        ['Staff number', 'T-0041', true],
        ['Payroll record', 'Linked', true],
      ],
      body: `
        ${card({
          title: 'Teaches',
          note: '9 assignments',
          children: [
            ['Mathematics', 'Form 2A · Term 2', 'Core'],
            ['Mathematics', 'Form 2B · Term 2', 'Core'],
            ['Mathematics', 'Form 3A · Term 2', 'Core'],
            ['Additional Mathematics', 'Form 4A · Term 2', ''],
            ['Mathematics', 'Form 4B · Term 2', 'Core'],
          ]
            .map(([subj, cls, core], i, a) =>
              listRow(
                `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${subj}</span>${txt(cls, { size: 11, color: C.subtle })}</span>${core ? badge(core, 'brand') : ''}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${note('proposed', 'The <b>HOD</b> flag on this record is the same flag the results moderation queue checks &mdash; and nothing here links to that queue, nor tells her she has <b>14 sheets waiting</b>. See the Leadership canvas.')}
      `,
    })}</div>`,
  })

/* ── /schools/academics/identity ────────────────────────────────────── */
export const Identity = () =>
  adminArtboard({
    title: 'Identity and records',
    railItem: 'Identity and records',
    caption: 'Signed in as Registrar',
    search: null,
    user: { name: 'Chipo Marimo', role: 'Registrar' },
    content: `<div style="padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 12px; max-width: 1040px">
      ${txt('How this school numbers its pupils, what its ID cards look like, and who may change a record&rsquo;s picture.', { size: 12.5, color: C.mid })}
      ${alert({ tone: 'brand', title: 'Read-only for your role', body: 'Only a school administrator can change identity settings.' })}
      ${card({
        title: 'Student numbers',
        note: '842 pupils on the books · current scheme CHS-####',
        children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 12px; opacity: .6">
          <div style="display: flex; align-items: flex-start; gap: 11px">
            <span style="width: 34px; height: 20px; border-radius: 999px; background: ${C.brand}; position: relative; flex-shrink: 0; margin-top: 1px"><span style="position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 999px; background: #fff"></span></span>
            <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 700; color: ${C.strong}">Declare a format</span><span style="display: block; font-size: 11.5px; color: ${C.mid}; line-height: 1.5; margin-top: 2px">Off, the register keeps its own scheme: new pupils continue the numbering the school arrived with. On, every new number follows the format below.</span></span>
          </div>
          ${rowFlex(
            `${field('Prefix', 'CHS', { w: 150 })}
             <div style="display: flex; flex-direction: column; gap: 4px"><span style="font-size: 11px; font-weight: 600; color: ${C.body}">Separator</span>${segments(['None', 'Dash', 'Slash'], 'Dash')}</div>
             ${field('Digits', '4', { w: 110 })}`,
            { align: 'flex-end', gap: 14 },
          )}
          ${txt('Next pupil admitted gets <b class="mono">CHS-1345</b>', { size: 12, color: C.mid })}
        </div>`,
      })}
      ${grid(
        'minmax(0, 1fr) 340px',
        `
        ${card({
          title: 'Pupil ID card',
          note: 'What a child carries in their pocket.',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 12px; opacity: .6">
            ${rowFlex(
              `<div style="display: flex; flex-direction: column; gap: 4px; width: 190px"><span style="font-size: 11px; font-weight: 600; color: ${C.body}">Card colour</span><div style="display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 9px; border: 1px solid ${C.border}; border-radius: 7px; background: ${C.surface}"><span style="width: 16px; height: 16px; border-radius: 4px; background: #1F4E79"></span>${mono('#1F4E79', { size: 12, color: C.body })}</div></div>
               ${field('Motto line', 'Doctrina lumen vitae')}`,
              { align: 'flex-end', gap: 14 },
            )}
            ${['Show the pupil&rsquo;s photograph', 'Show a guardian&rsquo;s phone number']
              .map(
                (l, i) =>
                  `<div style="display: flex; align-items: flex-start; gap: 11px"><span style="width: 34px; height: 20px; border-radius: 999px; background: ${C.brand}; position: relative; flex-shrink: 0; margin-top: 1px"><span style="position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 999px; background: #fff"></span></span><span style="font-size: 12.5px; color: ${C.body}">${l}${i === 1 ? `<span style="display: block; font-size: 11.5px; color: ${C.subtle}; margin-top: 2px">So a found card can be returned to the family, not just to the school.</span>` : ''}</span></div>`,
              )
              .join('')}
          </div>`,
        })}
        ${card({
          title: 'Preview',
          children: `<div style="padding: 16px; display: flex; justify-content: center">
            <div style="width: 268px; height: 168px; border-radius: 11px; background: #1F4E79; padding: 13px; display: flex; flex-direction: column; gap: 9px; box-shadow: 0 10px 26px -10px rgba(31,78,121,.5)">
              <div style="display: flex; align-items: center; justify-content: space-between">
                <span style="font-size: 8.5px; font-weight: 700; letter-spacing: .1em; color: rgba(255,255,255,.82)">STUDENT IDENTITY CARD</span>
                <span class="mono" style="font-size: 9px; color: rgba(255,255,255,.7)">2026</span>
              </div>
              <div style="display: flex; gap: 11px; flex: 1; min-height: 0">
                <div style="width: 62px; border-radius: 6px; background: rgba(255,255,255,.16); display: flex; align-items: center; justify-content: center"><span style="font-size: 9px; letter-spacing: .08em; color: rgba(255,255,255,.6)">PHOTO</span></div>
                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px">
                  <span style="font-size: 14px; font-weight: 700; color: #fff">Tendai Moyo</span>
                  <span style="font-size: 10.5px; color: rgba(255,255,255,.78)">Form 2 Blue</span>
                  <span class="mono" style="font-size: 9.5px; color: rgba(255,255,255,.66); margin-top: auto">Guardian: 0772 000 111</span>
                </div>
              </div>
              <span style="font-size: 8.5px; font-style: italic; color: rgba(255,255,255,.62)">Doctrina lumen vitae</span>
            </div>
          </div>`,
        })}
      `,
      )}
      ${note('today', 'This is the <b>only route in the module with a visible role gate</b> &mdash; every control disables and the save button is not rendered for anyone below <code>SCHOOL_ADMIN</code>. Everywhere else a bursar sees a head&rsquo;s buttons and finds out by clicking. This screen already knows how to do it right; nothing else copies it.')}
    </div>`,
  })
