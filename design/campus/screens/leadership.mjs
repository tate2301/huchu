/**
 * Leadership — the four school jobs that have permissions and no screens.
 *
 * lib/auth-core/role-routes.ts has one entry in its landing allowlist
 * (SALES_REP), so BURSAR, HOD, WARDEN, SCHOOL_ADMIN and REGISTRAR all land on
 * the same /schools page. lib/platform/personas.ts grants each of them a
 * different set of verbs. Everything on this canvas is proposed.
 */
import {
  C, I, icon, esc, adminArtboard, page, grid, rowFlex, card, table, listRow, badge,
  avatar, mono, txt, alert, ghostBtn, solidBtn, dangerBtn, filterSelect, searchField,
  segments, stat, tinyBtn, modal, field, pickerField,
} from '../lib/kit.mjs'

const ini = (n) => {
  const [last, first] = n.split(', ')
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}
const person = (name, sub) =>
  `${avatar(ini(name))}<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>`

const HEAD = { name: 'Rudo Makoni', role: 'Deputy Head' }
const BURSAR = { name: 'Tendai Chuma', role: 'Bursar' }
const HOD = { name: 'Priscilla Nyathi', role: 'Head of Mathematics' }
const WARDEN = { name: 'Joseph Katsande', role: 'Warden' }

/* ── who lands where ────────────────────────────────────────────────── */
export const RoleLanding = () =>
  adminArtboard({
    title: 'School Overview',
    railItem: 'School Overview',
    caption: 'Term 2 &middot; Week 6',
    search: 'Search students, classes',
    content: page(`
      ${card({
        title: 'Where each school role lands, and what it is granted',
        note: 'lib/platform/personas.ts',
        children: table({
          cols: [
            { label: 'Role', w: 180 },
            { label: 'Lands on today', w: 170 },
            { label: 'Granted', w: 300 },
            { label: 'Proposed landing' },
          ],
          rows: [
            ['School Admin', '/schools', 'Everything, across nine resources', 'Head — the term at a glance', false],
            ['Registrar', '/schools', 'Admissions, students, teachers, academics', 'The office — admissions and records', false],
            ['Bursar', '/schools', 'Fees: issue, receive, waive, write off, void, refund', 'Fees — what is owed and what came in', false],
            ['Head of department', '/portal/teacher', 'Results: moderate, request changes, approve', 'The department — sheets and schemes waiting', false],
            ['Warden', '/schools', 'Boarding: allocate, approve leave, check in and out', 'Boarding — beds, leave and who is out', false],
            ['Teacher', '/portal/teacher', 'Attendance and results: capture, submit', 'Your day', true],
          ].map(([role, lands, granted, proposed, ok]) => [
            txt(role, { size: 12.5, weight: 700, color: C.strong }),
            mono(lands, { size: 11, color: ok ? C.ok : C.bad }),
            txt(granted, { size: 11.5, color: C.mid }),
            txt(proposed, { size: 12, color: C.body }),
          ]),
        }),
      })}
      ${grid(
        2,
        `${card({
          title: 'What lands them there',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 9px">
            ${txt('<code>ROLE_ROUTE_ALLOWLIST</code> in <code>lib/auth-core/role-routes.ts</code> has exactly one entry, <code>SALES_REP</code>. <code>landingPathForRole()</code> returns <code>null</code> for every campus role, so they all fall through to <code>/schools</code>.', { size: 12, color: C.mid })}
            ${txt('<code>SchoolsDashboardContent</code> contains no reference to role or persona. It renders the same fourteen-row metric table for all six.', { size: 12, color: C.mid })}
          </div>`,
        })}
        ${card({
          title: 'The smallest change that fixes it',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 9px">
            ${txt('One allowlist entry per role, and five landing screens. Each reads data the module already has &mdash; none of them needs a new query.', { size: 12, color: C.mid })}
            ${txt('The HOD is the exception worth noting: <code>portal-isolation.ts</code> already routes them to the teacher portal, so their landing belongs there rather than here.', { size: 12, color: C.mid })}
          </div>`,
        })}`,
      )}
    `),
  })

/* ── head ───────────────────────────────────────────────────────────── */
export const HeadDashboard = () =>
  adminArtboard({
    title: 'Head',
    railItem: 'School Overview',
    caption: 'Term 2 &middot; Week 6 of 14 &middot; Tue 24 Aug',
    search: 'Search students, classes',
    user: HEAD,
    chips: [
      { label: 'Enrolled', value: '842' },
      { label: 'Present today', value: '94.5%', tone: 'ok' },
      { label: 'Registers out', value: '18', tone: 'bad' },
      { label: 'Owed', value: '67,700', tone: 'bad' },
    ],
    bandActions: [ghostBtn('Export', I.download)],
    content: page(`
      ${grid(
        4,
        [
          stat({ label: 'Fee collection', value: '69%', note: 'Term 2 to date · 96% last term', tone: 'warn' }),
          stat({ label: 'Attendance', value: '94.5%', note: '46 away · 12 unexplained', tone: 'ok' }),
          stat({ label: 'Results published', value: '63 of 164', note: 'window opens 1 Sep', tone: 'warn' }),
          stat({ label: 'Staff without an HR record', value: '7', note: 'of 48 on the staff list', tone: 'bad' }),
        ].join(''),
      )}
      ${grid(
        'minmax(0, 1.3fr) minmax(0, 1fr)',
        `${card({
          title: 'Waiting on somebody',
          note: 'and who',
          children: [
            ['18 registers not taken', 'Closes 09:30 · 6 form teachers', 'Mrs Moyo, Mr Dube +4', 'bad'],
            ['14 mark sheets submitted', 'Term 2 · waiting on 3 HODs', 'Mrs Nyathi +2', 'warn'],
            ['5 schemes of work unsigned', '2 already being taught', 'Mrs Nyathi +2', 'bad'],
            ['3 admission offers lapsed', '14-day expiry passed', 'The office', 'bad'],
            ['6 children: allergy, no consent', 'Ring home before anything else', 'The sanatorium', 'bad'],
            ['4 boarders with no bed', 'Term 2', 'Mr Katsande', 'warn'],
          ]
            .map(([what, why, who, tone], i, a) =>
              listRow(
                `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(what)}</span>${txt(why, { size: 11, color: C.subtle })}</span>
                 ${txt(who, { size: 11.5, color: C.mid })}${badge(tone === 'bad' ? 'Overdue' : 'Due', tone)}${tinyBtn('Open')}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${card({
          title: 'Next two weeks',
          children: [
            ['Fri 27 Aug', 'Results publishing opens', C.brand],
            ['Mon 30 Aug', 'Fee reminder run — 31 accounts', C.warn],
            ['Wed 1 Sep', 'Parent meetings, Form 4', C.mid],
            ['Fri 10 Sep', 'Term 2 ends', C.mid],
          ]
            .map(([when, what, hue], i, a) =>
              listRow(
                `<span style="width: 6px; height: 6px; border-radius: 999px; background: ${hue}; flex-shrink: 0"></span>${mono(when, { size: 11, width: 76 })}${txt(what, { size: 12, color: C.body })}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}`,
      )}
    `),
  })

/* ── bursar ─────────────────────────────────────────────────────────── */
export const BursarDashboard = () =>
  adminArtboard({
    title: 'Fees',
    railItem: 'Fees by year group',
    caption: 'Term 2 &middot; USD 67,700 outstanding',
    search: 'Search a family, invoice or receipt',
    user: BURSAR,
    action: { label: 'Record a receipt', icon: I.plus },
    chips: [
      { label: 'Owed', value: '67,700', tone: 'bad' },
      { label: 'In today', value: '2,480', tone: 'ok' },
      { label: '90+ days', value: '14,240', tone: 'bad' },
    ],
    content: page(`
      ${grid(
        4,
        [
          stat({ label: 'Collected this term', value: '150,700', note: '69% of 218,400', tone: 'warn' }),
          stat({ label: 'Families in arrears', value: '188', note: 'of 842 on the roll', tone: 'bad' }),
          stat({ label: 'Unallocated receipts', value: '9', note: 'USD 1,860 sitting on account', tone: 'warn' }),
          stat({ label: 'Waivers awaiting a decision', value: '4', note: 'oldest 11 days', tone: 'warn' }),
        ].join(''),
      )}
      ${grid(
        'minmax(0, 1.25fr) minmax(0, 1fr)',
        `${card({
          title: 'Needs a decision from you',
          children: [
            ['4 waivers to approve or refuse', 'Hardship 2 · Scholarship 1 · Discount 1', 'Open'],
            ['1 refund requested', 'Sibanda, Ruvimbo · USD 620.00 · 19 days', 'Pay or cancel'],
            ['9 receipts unallocated', 'USD 1,860 on account against no invoice', 'Allocate'],
            ['Form 4 has no active fee structure', 'Term 2 · 96 pupils cannot be invoiced', 'Activate'],
            ['12 receipts not fiscalised', 'ZIMRA · oldest 6 days', 'Fiscalise'],
          ]
            .map(([what, why, action], i, a) =>
              listRow(
                `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(what)}</span>${txt(why, { size: 11, color: C.subtle })}</span>${solidBtn(action)}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${card({
          title: 'Arrears by age',
          children: [
            ['Current', '21,400', C.mid, 21400],
            ['1–30 days', '18,800', C.warn, 18800],
            ['31–60 days', '8,460', C.warn, 8460],
            ['61–90 days', '4,800', C.bad, 4800],
            ['90+ days', '14,240', C.bad, 14240],
          ]
            .map(([label, amount, hue, v], i, a) =>
              listRow(
                `<span style="width: 92px; flex-shrink: 0; font-size: 12px; color: ${C.body}">${label}</span>
                 <span style="flex: 1; min-width: 0; height: 8px; border-radius: 999px; background: ${C.sunken}; overflow: hidden"><span style="display: block; width: ${Math.round((v / 24000) * 100)}%; height: 100%; background: ${hue}"></span></span>
                 ${mono(amount, { size: 12, color: hue, weight: 700, width: 70 })}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}`,
      )}
      ${card({
        title: 'Chase list',
        note: '31 families · reminder run scheduled for Mon 30 Aug',
        actions: [ghostBtn('Preview the reminder', I.eye), solidBtn('Send 31 reminders', I.send)],
        children: table({
          cols: [
            { label: 'Family' },
            { label: 'Owed', w: 110, align: 'right' },
            { label: 'Oldest', w: 110 },
            { label: 'Last reminded', w: 130 },
            { label: 'Portal', w: 120 },
            { label: '', w: 90, align: 'right' },
          ],
          rows: [
            ['Mafuta, Simba', 'CHS-1301 · Form 4A', '2,480.00', '112 days', '19 Aug', true],
            ['Nyathi, Kudzai', 'CHS-1233 · Form 3A', '1,860.00', '96 days', '19 Aug', true],
            ['Moyo, Farai', 'CHS-1211 · Form 2B', '1,240.00', '68 days', 'Never', false],
          ].map(([name, sub, owed, oldest, last, portal]) => [
            person(name, sub),
            mono(owed, { size: 12, color: C.bad, weight: 700 }),
            mono(oldest, { size: 11.5, color: C.bad }),
            mono(last, { size: 11.5, color: last === 'Never' ? C.warn : C.subtle }),
            portal ? badge('On the portal', 'ok') : badge('No account', 'warn'),
            tinyBtn('Open'),
          ]),
        }),
      })}
    `),
  })

export const BursarReceipts = () =>
  adminArtboard({
    title: 'Receipts',
    railItem: 'Receipts',
    caption: 'Term 2 &middot; 1,204 posted',
    search: 'Search fee receipts',
    user: BURSAR,
    action: { label: 'Record a receipt', icon: I.plus },
    chips: [
      { label: 'Posted', value: '1,204', tone: 'ok' },
      { label: 'Unallocated', value: '9', tone: 'warn' },
      { label: 'Not fiscalised', value: '12', tone: 'bad' },
    ],
    bandActions: [ghostBtn('Fiscalise 12', I.receipt), ghostBtn('Export', I.download)],
    content: page(`
      ${alert({
        tone: 'warn',
        title: '12 receipts have not been fiscalised',
        body: 'ZIMRA expects a fiscal receipt against each. The oldest is 6 days old.',
        action: `<div style="align-self: center">${solidBtn('Fiscalise them')}</div>`,
      })}
      ${rowFlex(`${filterSelect('Status', 'Posted')}${filterSelect('Method', 'Any method')}${filterSelect('Term', 'Term 2')}<div style="flex: 1"></div>${searchField('Search fee receipts', { w: 250 })}`, { align: 'flex-end' })}
      ${card({
        children: table({
          cols: [
            { label: 'Receipt No', w: 130 },
            { label: 'Student' },
            { label: 'Method', w: 125 },
            { label: 'Received', w: 95, align: 'right' },
            { label: 'Unallocated', w: 100, align: 'right' },
            { label: 'Date', w: 90 },
            { label: 'Fiscal', w: 110 },
            { label: '', w: 200, align: 'right' },
          ],
          rows: [
            ['RCT-2026-1204', 'Zimuto, Nyasha', 'CHS-1240', 'Mobile money', '310.00', '310.00', '22 Aug', false],
            ['RCT-2026-1201', 'Marange, Tadiwa', 'CHS-1288', 'Card', '310.00', '0.00', '21 Aug', false],
            ['RCT-2026-1194', 'Nyathi, Kudzai', 'CHS-1233', 'Cash', '400.00', '90.00', '20 Aug', true],
            ['RCT-2026-1190', 'Dube, Tapiwa', 'CHS-1204', 'Bank transfer', '155.00', '0.00', '19 Aug', true],
          ].map(([no, name, sno, method, rec, unalloc, date, fiscal]) => [
            mono(no, { size: 11.5, color: C.brandStrong }),
            person(name, sno),
            txt(method, { size: 12, color: C.mid }),
            mono(rec, { size: 12, color: C.body }),
            mono(unalloc, { size: 12, color: unalloc === '0.00' ? C.faint : C.ok, weight: 700 }),
            mono(date, { size: 11.5 }),
            fiscal ? badge('Fiscalised', 'ok') : badge('Not sent', 'warn'),
            `<span style="display: flex; gap: 6px; justify-content: flex-end">${tinyBtn('Print')}${unalloc !== '0.00' ? tinyBtn('Allocate', 'brand') : ''}${tinyBtn('Void')}</span>`,
          ]),
        }),
      })}
    `),
  })

export const BursarWaivers = () =>
  adminArtboard({
    title: 'Waivers',
    railItem: 'Waivers',
    caption: 'Term 2 &middot; 4 waiting',
    search: 'Search fee waivers',
    user: BURSAR,
    action: { label: 'Record a waiver', icon: I.plus },
    chips: [
      { label: 'Waiting', value: '4', tone: 'warn' },
      { label: 'Applied this term', value: '18,420', tone: 'ok' },
    ],
    content: page(`
      ${rowFlex(segments([{ label: 'Waiting', count: 4 }, { label: 'Applied', count: 18 }, { label: 'Refused', count: 2 }, { label: 'All', count: 24 }], 'Waiting'))}
      ${card({
        title: 'Waiting on a decision',
        children: [
          ['Mafuta, Simba', 'CHS-1301 · Form 4A', 'Hardship', '62.00', 'Father died in June. Mother asks for the term to be halved.', '19 Aug'],
          ['Ncube, Tariro', 'CHS-1292 · Form 3A', 'Hardship', '310.00', 'Both parents out of work since May.', '11 Aug'],
          ['Gwatidzo, Rufaro', 'CHS-1277 · Form 3A', 'Scholarship', '100.00', 'Top of Form 2 in Term 3. Head suggested a partial.', '21 Aug'],
          ['Chirwa, Anesu', 'CHS-1310 · Form 1B', 'Discount', '48.00', 'Third sibling at the school.', '22 Aug'],
        ]
          .map(([name, sub, type, amount, reason, when], i, a) =>
            listRow(
              `<span style="display: flex; align-items: center; gap: 7px; width: 230px; flex-shrink: 0">${person(name, sub)}</span>
               <span style="width: 110px; flex-shrink: 0">${badge(type, type === 'Hardship' ? 'warn' : type === 'Scholarship' ? 'brand' : 'plain')}</span>
               <span style="width: 90px; flex-shrink: 0; display: flex; justify-content: flex-end">${mono(amount, { size: 12, color: C.strong, weight: 700 })}</span>
               <span style="flex: 1; min-width: 0">${txt(esc(reason), { size: 11.5, color: C.mid, ellipsis: true })}</span>
               ${mono(when, { size: 10.5 })}
               <span style="display: flex; gap: 6px; flex-shrink: 0">${tinyBtn('Refuse')}${solidBtn('Approve')}</span>`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
      ${card({
        title: 'The ladder a waiver walks',
        note: 'SchoolFeeWaiverStatus — four of its five states have no UI today',
        children: `<div style="padding: 14px 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
          ${[
            ['Draft', 'plain'],
            ['Approved', 'ok'],
            ['Applied to an invoice', 'ok'],
            ['Reversed', 'bad'],
          ]
            .map(([s, tone], i, a) => `${badge(s, tone)}${i < a.length - 1 ? icon(I.chevR, { size: 13, stroke: C.faint }) : ''}`)
            .join('')}
          <span style="width: 20px"></span>${badge('Refused', 'bad')}
          <span style="flex: 1"></span>
          ${txt('Every step records who decided it and why.', { size: 11.5, color: C.subtle })}
        </div>`,
      })}
    `),
    overlay: modal({
      w: 460,
      title: 'Approve this waiver',
      lede: 'USD 62.00 off Simba Mafuta&rsquo;s Term 2 fees, on hardship. The family sees the reduced balance on their portal as soon as it is applied.',
      body: `${pickerField('Apply to', 'INV-2026-0433 &mdash; Term 2 &mdash; USD 310.00 outstanding', { required: true })}
             ${field('Amount', 'USD 62.00', { required: true })}
             ${field('Reason recorded against the account', 'Bereavement — father died June 2026. Half term granted.', { required: true, hint: 'Read by anyone who opens the family&rsquo;s ledger, including at audit.' })}`,
      footer: `${ghostBtn('Cancel')}${solidBtn('Approve and apply')}`,
    }),
  })

export const BursarInvoiceActions = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Ledger and structures',
    caption: 'Term 2 &middot; invoice actions',
    search: 'Search fee invoices',
    user: BURSAR,
    content: page(`
      ${card({
        title: 'Fee Invoices',
        note: '842 · 188 unpaid',
        actions: [ghostBtn('Bulk generate', I.layers), solidBtn('Create invoice', I.plus)],
        children: table({
          cols: [
            { label: 'Invoice No', w: 130 },
            { label: 'Student' },
            { label: 'Status', w: 105 },
            { label: 'Total', w: 95, align: 'right' },
            { label: 'Outstanding', w: 110, align: 'right' },
            { label: 'Due', w: 85 },
            { label: '', w: 265, align: 'right' },
          ],
          rows: [
            ['INV-2026-0433', 'Mafuta, Simba', 'CHS-1301', 'Draft', 'plain', '310.00', '310.00', '—', ['Issue', 'Edit', 'Delete']],
            ['INV-2026-0412', 'Mutasa, Tanaka', 'CHS-1219', 'Issued', 'plain', '310.00', '310.00', '15 Aug', ['Record a payment', 'Void']],
            ['INV-2026-0402', 'Dube, Tapiwa', 'CHS-1204', 'Part Paid', 'warn', '310.00', '155.00', '15 Aug', ['Record a payment', 'Write off']],
            ['INV-2026-0388', 'Chikwanda, Rutendo', 'CHS-1180', 'Paid', 'ok', '310.00', '0.00', '15 Aug', ['Print']],
          ].map(([no, name, sno, status, tone, total, out, due, actions]) => [
            mono(no, { size: 11.5, color: C.brandStrong }),
            person(name, sno),
            badge(status, tone),
            mono(total, { size: 12, color: C.body }),
            mono(out, { size: 12, color: out === '0.00' ? C.faint : C.bad, weight: 700 }),
            mono(due, { size: 11.5 }),
            `<span style="display: flex; gap: 6px; justify-content: flex-end">${actions.map((a, i) => (i === 0 ? solidBtn(a) : tinyBtn(a))).join('')}</span>`,
          ]),
        }),
      })}
      ${grid(
        2,
        `${card({
          title: 'Which verbs each state offers',
          children: [
            ['Draft', 'Issue · Edit · Delete', 'plain'],
            ['Issued', 'Record a payment · Void', 'plain'],
            ['Part paid', 'Record a payment · Write off', 'warn'],
            ['Paid', 'Print — nothing left to do', 'ok'],
            ['Voided', 'Print — terminal', 'bad'],
            ['Written off', 'Print — terminal', 'bad'],
          ]
            .map(([state, verbs, tone], i, a) =>
              listRow(`<span style="width: 120px; flex-shrink: 0">${badge(state, tone)}</span>${txt(verbs, { size: 12, color: C.mid, flex: 1 })}`, { last: i === a.length - 1 }),
            )
            .join(''),
        })}
        ${card({
          title: 'Who may press them',
          children: [
            ['Bursar', 'Every verb above', 'ok'],
            ['School admin', 'Every verb above', 'ok'],
            ['Registrar', 'Read only — schools.fees: view', 'warn'],
            ['Teacher', 'No access to the ledger at all', 'bad'],
          ]
            .map(([role, what, tone], i, a) =>
              listRow(
                `<span style="width: 130px; flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${role}</span>${txt(what, { size: 12, color: C.mid, flex: 1 })}${badge(tone === 'ok' ? 'Full' : tone === 'warn' ? 'Read' : 'None', tone)}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}`,
      )}
    `),
    overlay: modal({
      w: 460,
      title: 'Write off INV-2026-0402',
      lede: 'USD 155.00 stops being owed and is charged to bad debt. The family&rsquo;s balance drops to zero and the write-off shows on their statement. It cannot be undone &mdash; a mistake is corrected with a new invoice.',
      body: `${pickerField('Reason', 'Uncollectable — family left the country', { required: true })}
             ${field('Note for the ledger', 'Confirmed with the registrar 22 Aug. No forwarding address.', { required: true })}`,
      footer: `${ghostBtn('Keep it owed')}${dangerBtn('Write off USD 155.00')}`,
    }),
  })

/* ── HOD ────────────────────────────────────────────────────────────── */
export const HodModeration = () =>
  adminArtboard({
    title: 'Moderation',
    railItem: 'Moderation',
    caption: 'Mathematics &middot; Term 2 &middot; 14 waiting',
    search: 'Search the queue',
    user: HOD,
    chips: [
      { label: 'Waiting on you', value: '14', tone: 'warn' },
      { label: 'Approved', value: '46', tone: 'ok' },
      { label: 'Sent back', value: '3', tone: 'bad' },
    ],
    bandActions: [ghostBtn('Approve all that are clean', I.checks)],
    content: page(`
      ${rowFlex(`${segments([{ label: 'Waiting', count: 14 }, { label: 'Sent back', count: 3 }, { label: 'Approved', count: 46 }, { label: 'Published', count: 63 }], 'Waiting')}<div style="flex: 1"></div>${filterSelect('Subject', 'Mathematics', { w: 190 })}${filterSelect('Year group', 'Every year')}`, { align: 'flex-end' })}
      ${card({
        title: 'Waiting on you',
        note: 'oldest submitted 4 days ago',
        children: table({
          cols: [
            { label: 'Sheet' },
            { label: 'Teacher', w: 135 },
            { label: 'Marks', w: 80, align: 'right' },
            { label: 'Average', w: 85, align: 'right' },
            { label: 'Flags', w: 190 },
            { label: '', w: 240, align: 'right' },
          ],
          rows: [
            ['Mathematics — end of term', 'Term 2 / Form 2 / 2A', 'Mr T. Chirwa', '32 of 32', '64.2', '', false],
            ['Mathematics — end of term', 'Term 2 / Form 2 / 2B', 'Mrs R. Moyo', '31 of 31', '59.8', '', false],
            ['Add. Mathematics — mock', 'Term 2 / Form 4 / 4A', 'Mr M. Sibanda', '18 of 18', '55.1', 'Average 9 below last term', false],
            ['Mathematics — end of term', 'Term 2 / Form 3 / 3A', 'Mr A. Dube', '27 of 30', '62.7', '3 marks missing', true],
          ].map(([title, sub, teacher, marks, avg, flag, short]) => [
            `<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${title}</span>${mono(sub, { size: 10.5 })}</span>`,
            txt(teacher, { size: 12, color: C.mid }),
            mono(marks, { size: 11.5, color: short ? C.bad : C.body }),
            mono(avg, { size: 12, color: C.body, weight: 700 }),
            flag ? badge(flag, 'warn') : badge('Nothing flagged', 'ok'),
            `<span style="display: flex; gap: 6px; justify-content: flex-end">${tinyBtn('Read')}${ghostBtn('Send back')}${solidBtn('Approve')}</span>`,
          ]),
        }),
      })}
      ${card({
        title: 'What happens after you approve',
        children: `<div style="padding: 14px 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
          ${[
            ['Draft', 'plain'],
            ['Submitted', 'warn'],
            ['Approved', 'ok'],
            ['Published', 'brand'],
          ]
            .map(([s, tone], i, a) => `${badge(s, tone)}${i < a.length - 1 ? icon(I.chevR, { size: 13, stroke: C.faint }) : ''}`)
            .join('')}
          <span style="width: 16px"></span>${badge('Sent back', 'bad')}
          <span style="flex: 1"></span>
          ${txt('Approved is not published. A sheet reaches a parent only inside an open publish window.', { size: 11.5, color: C.subtle })}
        </div>`,
      })}
    `),
    overlay: modal({
      w: 470,
      title: 'Send this sheet back',
      lede: 'Mathematics &mdash; end of term, Form 3A. Mr Dube gets it back as a draft with your note, and it leaves your queue until he submits it again.',
      body: field('What needs changing', 'Three pupils have no mark: Ncube, Sibanda, Gwatidzo. Enter them or mark them absent before resubmitting.', {
        required: true,
        hint: 'He sees this on the sheet and in his portal notifications.',
      }),
      footer: `${ghostBtn('Cancel')}${solidBtn('Send it back')}`,
    }),
  })

export const HodPublishWindows = () =>
  adminArtboard({
    title: 'Publishing',
    railItem: 'Publishing',
    caption: 'Term 2 &middot; 2 windows open',
    search: 'Search publish windows',
    user: HOD,
    action: { label: 'Open a window', icon: I.plus },
    chips: [
      { label: 'Open', value: '2', tone: 'ok' },
      { label: 'Scheduled', value: '3' },
      { label: 'Approved, unpublished', value: '46', tone: 'warn' },
    ],
    content: page(`
      ${alert({
        tone: 'warn',
        title: '46 approved sheets are waiting for a window',
        body: 'They have been moderated and are not visible to any parent. The next window opens on 1 September.',
        action: `<div style="align-self: center">${solidBtn('Open a window now')}</div>`,
      })}
      ${card({
        title: 'Publish windows',
        children: table({
          cols: [
            { label: 'Status', w: 110 },
            { label: 'Scope' },
            { label: 'Opens', w: 130 },
            { label: 'Closes', w: 130 },
            { label: 'Sheets', w: 85, align: 'right' },
            { label: '', w: 190, align: 'right' },
          ],
          rows: [
            ['Open', 'Term 2 / Form 4 / 4A', '20 Aug 08:00', '5 Sep 17:00', '12', ['Close now', 'Edit']],
            ['Open', 'Term 2 / All classes', '27 Aug 18:00', '12 Sep 17:00', '51', ['Close now', 'Edit']],
            ['Scheduled', 'Term 2 / Form 1', '1 Sep 08:00', '12 Sep 17:00', '18', ['Open now', 'Edit']],
            ['Closed', 'Term 1 / All classes', '20 Mar 08:00', '3 Apr 17:00', '164', ['Reopen']],
          ].map(([status, scope, opens, closes, sheets, actions]) => [
            badge(status, status === 'Open' ? 'ok' : status === 'Closed' ? 'plain' : 'warn'),
            txt(scope, { size: 12.5, weight: 600, color: C.strong }),
            mono(opens, { size: 11.5, color: C.body }),
            mono(closes, { size: 11.5, color: C.body }),
            mono(sheets, { size: 12, color: C.body, weight: 700 }),
            `<span style="display: flex; gap: 6px; justify-content: flex-end">${actions.map((a, i) => (i === 0 ? solidBtn(a) : tinyBtn(a))).join('')}</span>`,
          ]),
        }),
      })}
      ${card({
        title: 'What a window does',
        children: `<div style="padding: 13px 16px; display: flex; flex-direction: column; gap: 8px">
          ${[
            'A sheet reaches a parent or a pupil only while a window covering its class and term is <b>open</b>. Approving a sheet does not publish it.',
            'Closing a window takes the marks back off the portal. The teacher portal already explains this to teachers: <b>&ldquo;The office opens a window per term.&rdquo;</b>',
            'The API for all of this exists &mdash; <code>results/publish/windows</code>, plus <code>publish</code> and <code>unpublish</code> per sheet. Nothing calls it.',
          ]
            .map(
              (t) =>
                `<div style="display: flex; gap: 8px"><span style="width: 5px; height: 5px; border-radius: 999px; background: ${C.brand}; margin-top: 6px; flex-shrink: 0"></span><span style="font-size: 12px; color: ${C.mid}; line-height: 1.55">${t}</span></div>`,
            )
            .join('')}
        </div>`,
      })}
    `),
    overlay: modal({
      w: 470,
      title: 'Open a publish window',
      lede: 'Every approved sheet inside the scope becomes visible to parents and pupils the moment the window opens, and stops being visible when it closes.',
      body: `${pickerField('Term', 'Term 2 &mdash; 4 May to 10 Sep 2026', { required: true })}
             ${pickerField('Year group', 'All classes')}
             <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 11px">${field('Opens', '1 Sep 2026, 08:00', { required: true })}${field('Closes', '12 Sep 2026, 17:00', { required: true })}</div>
             ${field('Note', 'End of term reports')}
             ${alert({ tone: 'brand', title: '46 approved sheets fall inside this scope', body: 'They become visible to 1,106 guardians and 842 pupils when it opens.' })}`,
      footer: `${ghostBtn('Cancel')}${solidBtn('Open the window')}`,
    }),
  })

/* ── warden ─────────────────────────────────────────────────────────── */
export const WardenDashboard = () =>
  adminArtboard({
    title: 'Boarding',
    railItem: 'Bed board',
    caption: 'Term 2 &middot; 318 boarders &middot; Tue 24 Aug',
    search: 'Search a boarder',
    user: WARDEN,
    chips: [
      { label: 'In tonight', value: '311', tone: 'ok' },
      { label: 'Out on leave', value: '5', tone: 'warn' },
      { label: 'Unaccounted', value: '2', tone: 'bad' },
    ],
    bandActions: [solidBtn('Take the roll call', I.checks)],
    content: page(`
      ${alert({
        title: '2 boarders are unaccounted for tonight',
        body: 'Ncube, Tariro (Nyanga House) and Sibanda, Ruvimbo (Inyanga House) have no leave and were not on the evening roll.',
        action: `<div style="align-self: center">${solidBtn('Ring home')}</div>`,
      })}
      ${grid(
        4,
        [
          stat({ label: 'Beds occupied', value: '318 of 370', note: '86% · 4 boarders with no bed', tone: 'warn' }),
          stat({ label: 'Leave requests waiting', value: '6', note: 'oldest 3 days', tone: 'warn' }),
          stat({ label: 'Out this weekend', value: '41', note: 'signed out by a guardian' }),
          stat({ label: 'Welfare gaps', value: '6', note: 'allergy with no consent to treat', tone: 'bad' }),
        ].join(''),
      )}
      ${grid(
        'minmax(0, 1.15fr) minmax(0, 1fr)',
        `${card({
          title: 'Leave and outings waiting on you',
          children: [
            ['Mutasa, Tanaka', 'CHS-1219 · Chishawasha House', 'Leave', '29 Aug – 1 Sep', 'Home · Grace Mutasa 077 412 8890'],
            ['Dube, Tapiwa', 'CHS-1204 · Chishawasha House', 'Outing', '30 Aug', 'Uncle · Regis Dube 078 990 1120'],
            ['Zimuto, Nyasha', 'CHS-1240 · Nyanga House', 'Leave', '31 Aug – 1 Sep', 'Home · no guardian phone on file'],
          ]
            .map(([name, sub, type, when, who], i, a) =>
              listRow(
                `<span style="display: flex; align-items: center; gap: 7px; width: 240px; flex-shrink: 0">${person(name, sub)}</span>
                 ${badge(type, type === 'Leave' ? 'brand' : 'plain')}
                 <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12px; color: ${C.body}">${when}</span><span style="display: block; font-size: 11px; color: ${who.includes('no guardian') ? C.bad : C.subtle}">${who}</span></span>
                 <span style="display: flex; gap: 6px; flex-shrink: 0">${tinyBtn('Refuse')}${solidBtn('Approve')}</span>`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${card({
          title: 'Beds free tonight',
          children: [
            ['Chishawasha House', '96 of 100', '4'],
            ['Nyanga House', '84 of 90', '6'],
            ['Inyanga House', '78 of 90', '12'],
            ['Vumba House', '60 of 90', '30'],
          ]
            .map(([house, occ, free], i, a) =>
              listRow(
                `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${house}</span>${mono(occ, { size: 10.5 })}</span>${badge(`${free} free`, Number(free) < 5 ? 'warn' : 'ok')}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}`,
      )}
    `),
  })

export const WardenBedAllocate = () =>
  adminArtboard({
    title: 'Bed board',
    railItem: 'Bed board',
    caption: 'Chishawasha House &middot; Term 2',
    search: 'Search a boarder',
    user: WARDEN,
    chips: [
      { label: 'Occupied', value: '96', tone: 'ok' },
      { label: 'Free', value: '4', tone: 'warn' },
      { label: 'No bed', value: '4', tone: 'bad' },
    ],
    content: page(`
      ${alert({
        tone: 'warn',
        title: '4 boarders have no bed',
        body: 'Marange, Tadiwa &middot; Ncube, Tariro &middot; Sibanda, Ruvimbo &middot; Gwatidzo, Rufaro',
        action: `<div style="align-self: center">${solidBtn('Place them')}</div>`,
      })}
      ${grid(
        3,
        ['Room 12 · 6 of 8', 'Room 13 · 8 of 8', 'Room 14 · 0 of 8']
          .map((title, r) =>
            card({
              title,
              children: Array.from({ length: 8 }, (_, i) => {
                const taken = r === 0 ? i < 6 : r === 1
                const names = ['Mutasa, Tanaka', 'Dube, Tapiwa', 'Moyo, Farai', 'Zimuto, Nyasha', 'Chirwa, Anesu', 'Marange, T.', 'Ncube, T.', 'Sibanda, R.']
                return listRow(
                  `${mono(`B${i + 1}`, { size: 11, color: C.body, width: 32, weight: 700 })}
                   <span style="flex: 1; min-width: 0">${taken ? txt(names[i], { size: 12, weight: 600, color: C.strong, ellipsis: true }) : txt('Free', { size: 12, color: C.subtle })}</span>
                   ${taken ? tinyBtn('Free it') : tinyBtn('Give it', 'brand')}`,
                  { last: i === 7 },
                )
              }).join(''),
            }),
          )
          .join(''),
      )}
    `),
    overlay: modal({
      w: 440,
      title: 'Give bed B7 to somebody',
      lede: 'Room 12, Chishawasha House. The boarder is moved from wherever they are now, and both beds update tonight.',
      body: `${pickerField('Boarder', 'Marange, Tadiwa &mdash; CHS-1288 &mdash; no bed', { required: true, hint: '4 boarders currently have no bed.' })}
             ${field('From', '4 May 2026', { required: true })}`,
      footer: `${ghostBtn('Cancel')}${solidBtn('Give them the bed')}`,
    }),
  })
