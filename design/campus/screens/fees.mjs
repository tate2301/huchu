/**
 * Fees page — the year-group invoice list and the six segments of the fee
 * ledger, plus the dialogs that drive them.
 *
 * Called by build-module.mjs. The ledger is the module's workhorse screen
 * (schools-fees-content.tsx, 1367 lines) and its dialogs are where the raw
 * UUID inputs live.
 */
import {
  C, I, esc, adminArtboard, page, grid, rowFlex, card, table, listRow, badge, mono,
  txt, ghostBtn, solidBtn, filterSelect, searchField, segments, avatar,
  tinyBtn, modal, field, pickerField, proposalTag, sectionLabel,
} from '../lib/kit.mjs'

const note = () => ''

const ini = (n) => {
  const [last, first] = n.split(', ')
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

const SEGS = [
  { label: 'Invoices', count: 842 },
  { label: 'Receipts', count: 1204 },
  { label: 'Credits', count: 9 },
  { label: 'Refunds', count: 4 },
  { label: 'Waivers', count: 24 },
  { label: 'Fee Structures', count: 18 },
]

const LEDGER_SUMMARY = [
  ['Outstanding Balance', '67,700.00', 'bad'],
  ['Unpaid invoices', '188', 'plain'],
  ['Posted Receipts', '1,204', 'plain'],
  ['Applied Waivers', '18,420.00', 'plain'],
  ['Credit on account', '1,860.00', 'ok'],
]

const ledgerSummary = () =>
  `<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1px; background: ${C.border}; border: 1px solid ${C.border}; border-radius: 10px; overflow: hidden">
    ${LEDGER_SUMMARY.map(
      ([label, value, tone]) =>
        `<div style="background: ${C.surface}; padding: 12px 14px"><div style="font-size: 11px; color: ${C.mid}">${label}</div><div class="mono" style="font-size: 21px; font-weight: 700; letter-spacing: -.02em; margin-top: 3px; color: ${tone === 'bad' ? C.bad : tone === 'ok' ? C.ok : C.strong}">${value}</div></div>`,
    ).join('')}
  </div>`

const studentCell = (name, no) =>
  `${avatar(ini(name))}<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span>${mono(no, { size: 10.5 })}</span>`

const ledger = ({ active, title, note: cardNote, actions = [], body, extra = '' }) =>
  page(`
    ${ledgerSummary()}
    ${rowFlex(`${segments(SEGS, active)}<div style="flex: 1"></div>${actions.join('')}`)}
    ${card({ title, note: cardNote, children: body })}
    ${extra}
  `)

/* ── /schools/finance/class/[classId] ───────────────────────────────── */
export const FeesClass = () =>
  adminArtboard({
    title: 'Form 2 fees',
    railItem: 'Fees by year group',
    caption: 'Term 2 &middot; 118 pupils',
    search: 'Search invoices',
    back: true,
    chips: [
      { label: 'Outstanding', value: '9,610', tone: 'bad' },
      { label: 'Families', value: '31' },
      { label: 'Settled', value: '87', tone: 'ok' },
    ],
    content: page(`
      ${rowFlex(`${filterSelect('Class', 'Every class')}${filterSelect('Status', 'Any status')}<div style="flex: 1"></div>${searchField('Search invoices', { w: 250 })}`, { align: 'flex-end' })}
      ${txt('USD 9,610.00 outstanding across 31 students, from 118 invoices.', { size: 12.5, color: C.mid })}
      ${card({
        children: [
          ['Chikwanda, Rutendo', 'INV-2026-0388 · Term 2 · USD 310.00 billed', 'Paid', 'ok'],
          ['Dube, Tapiwa', 'INV-2026-0402 · Term 2 · USD 310.00 billed · USD 155.00 outstanding', 'Part paid', 'warn'],
          ['Moyo, Farai', 'INV-2026-0407 · Term 2 · USD 310.00 billed · USD 310.00 outstanding', 'Issued', 'plain'],
          ['Mutasa, Tanaka', 'INV-2026-0412 · Term 2 · USD 310.00 billed · USD 310.00 outstanding', 'Issued', 'plain'],
          ['Zimuto, Nyasha', 'INV-2026-0421 · Term 2 · USD 310.00 billed', 'Written off', 'bad'],
        ]
          .map(([name, sub, status, tone], i, a) =>
            listRow(
              `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>${badge(status, tone)}`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
      ${grid(
        2,
        `
        ${note('today', 'Rows are <code>static</code>. A bursar looking at <b>USD 310.00 outstanding</b> cannot record a payment, print the invoice, or open the family &mdash; they have to go to the whole-school ledger and find the row again.')}
        ${note('proposed', 'Every row wants two verbs: <b>Record a payment</b> and <b>Print</b>. Both already exist on the ledger; the year-group view is where a bursar working through one class actually is.')}
      `,
      )}
    `),
  })

/* ── ledger · invoices ──────────────────────────────────────────────── */
export const LedgerInvoices = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Ledger and structures',
    caption: 'Term 2 &middot; USD 67,700 outstanding',
    search: 'Search fee invoices',
    content: ledger({
      active: 'Invoices',
      title: 'Fee Invoices',
      actions: [ghostBtn('Bulk Generate', I.layers), solidBtn('Create Invoice', I.plus)],
      body: table({
        cols: [
          { label: 'Invoice No', w: 130 },
          { label: 'Student' },
          { label: 'Term', w: 70 },
          { label: 'Status', w: 105 },
          { label: 'Total', w: 95, align: 'right' },
          { label: 'Paid', w: 95, align: 'right' },
          { label: 'Outstanding', w: 110, align: 'right' },
          { label: 'Due Date', w: 95 },
          { label: '', w: 66, align: 'right' },
        ],
        rows: [
          ['INV-2026-0412', 'Mutasa, Tanaka', 'CHS-1219', 'T2', 'Issued', 'plain', '310.00', '0.00', '310.00', '15 Aug'],
          ['INV-2026-0407', 'Moyo, Farai', 'CHS-1211', 'T2', 'Issued', 'plain', '310.00', '0.00', '310.00', '15 Aug'],
          ['INV-2026-0402', 'Dube, Tapiwa', 'CHS-1204', 'T2', 'Part Paid', 'warn', '310.00', '155.00', '155.00', '15 Aug'],
          ['INV-2026-0388', 'Chikwanda, Rutendo', 'CHS-1180', 'T2', 'Paid', 'ok', '310.00', '310.00', '0.00', '15 Aug'],
          ['INV-2026-0421', 'Zimuto, Nyasha', 'CHS-1240', 'T2', 'Write-off', 'bad', '310.00', '0.00', '0.00', '15 Aug'],
          ['INV-2026-0433', 'Mafuta, Simba', 'CHS-1301', 'T2', 'Draft', 'plain', '310.00', '0.00', '310.00', '—'],
        ].map(([no, name, sno, term, status, tone, total, paid, out, due]) => [
          mono(no, { size: 11.5, color: C.brandStrong }),
          studentCell(name, sno),
          mono(term, { size: 11.5, color: C.mid }),
          badge(status, tone),
          mono(total, { size: 12, color: C.body }),
          mono(paid, { size: 12, color: C.body }),
          mono(out, { size: 12, color: out === '0.00' ? C.faint : C.bad, weight: 700 }),
          mono(due, { size: 11.5 }),
          tinyBtn('Print'),
        ]),
      }),
      extra: grid(
        2,
        `
        ${note('today', '<b>Issued</b>, <b>Voided</b> and <b>Write-off</b> render as badges and filter options that no screen can reach. <code>invoices/[id]/issue</code> and <code>invoices/[id]/write-off</code> both exist as endpoints with no control anywhere; the only path to <b>Issued</b> is a checkbox inside the bulk-generate dialog.')}
        ${note('proposed', 'A row menu with <b>Issue</b>, <b>Record a payment</b>, <b>Void</b> and <b>Write off</b> &mdash; each gated to the bursar persona and disabled with a reason for everyone else. Drawn as <b>InvoiceActions</b> on the Leadership canvas.')}
      `,
      ),
    }),
  })

/* ── ledger · receipts ──────────────────────────────────────────────── */
export const LedgerReceipts = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Receipts',
    caption: 'Term 2 &middot; 1,204 posted',
    search: 'Search fee receipts',
    content: ledger({
      active: 'Receipts',
      title: 'Fee Receipts',
      actions: [solidBtn('Record Receipt', I.plus)],
      body: table({
        cols: [
          { label: 'Receipt No', w: 130 },
          { label: 'Student' },
          { label: 'Payment Method', w: 130 },
          { label: 'Status', w: 95 },
          { label: 'Received', w: 95, align: 'right' },
          { label: 'Allocated', w: 95, align: 'right' },
          { label: 'Unallocated', w: 105, align: 'right' },
          { label: 'Receipt Date', w: 105 },
          { label: '', w: 66, align: 'right' },
        ],
        rows: [
          ['RCT-2026-1188', 'Chikwanda, Rutendo', 'CHS-1180', 'MOBILE MONEY', 'Posted', 'ok', '310.00', '310.00', '0.00', '18 Aug'],
          ['RCT-2026-1190', 'Dube, Tapiwa', 'CHS-1204', 'BANK TRANSFER', 'Posted', 'ok', '155.00', '155.00', '0.00', '19 Aug'],
          ['RCT-2026-1194', 'Nyathi, Kudzai', 'CHS-1233', 'CASH', 'Posted', 'ok', '400.00', '310.00', '90.00', '20 Aug'],
          ['RCT-2026-1201', 'Marange, Tadiwa', 'CHS-1288', 'CARD', 'Voided', 'bad', '310.00', '0.00', '0.00', '21 Aug'],
          ['RCT-2026-1204', 'Zimuto, Nyasha', 'CHS-1240', 'MOBILE MONEY', 'Draft', 'plain', '310.00', '0.00', '310.00', '22 Aug'],
        ].map(([no, name, sno, method, status, tone, rec, alloc, unalloc, date]) => [
          mono(no, { size: 11.5, color: C.brandStrong }),
          studentCell(name, sno),
          txt(method, { size: 12, color: C.mid }),
          badge(status, tone),
          mono(rec, { size: 12, color: C.body }),
          mono(alloc, { size: 12, color: C.body }),
          mono(unalloc, { size: 12, color: unalloc === '0.00' ? C.faint : C.ok, weight: 700 }),
          mono(date, { size: 11.5 }),
          tinyBtn('Print'),
        ]),
      }),
      extra: grid(
        2,
        `
        ${note('today', 'The <b>Payment Method</b> column prints the de-underscored enum &mdash; <b>BANK TRANSFER</b>, <b>MOBILE MONEY</b> &mdash; while the dialog that created the row offered <b>Bank transfer</b> and <b>Mobile money</b>. The same value, shouted back.')}
        ${note('today', '<code>receipts/[id]/void</code> and <code>receipts/[id]/fiscalise</code> both exist. Neither has a control, so a mis-keyed receipt cannot be voided, and the ZIMRA fiscalisation path in <code>lib/schools/fiscalisation.ts</code> has <b>no campus screen at all</b>.')}
      `,
      ),
    }),
  })

/* ── ledger · credits ───────────────────────────────────────────────── */
export const LedgerCredits = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Ledger and structures',
    caption: 'Term 2 &middot; USD 1,860 on account',
    search: 'Search credits',
    content: ledger({
      active: 'Credits',
      title: 'Credit on account',
      body: table({
        cols: [
          { label: 'Student' },
          { label: 'From', w: 250 },
          { label: 'Credit', w: 95, align: 'right' },
          { label: 'Held for refund', w: 115, align: 'right' },
          { label: 'Available', w: 95, align: 'right' },
          { label: 'Since', w: 95 },
          { label: 'Actions', w: 155, align: 'right' },
        ],
        rows: [
          ['Nyathi, Kudzai', 'CHS-1233', 'RCT-2026-1194 · Overpayment', '90.00', '0.00', '90.00', '20 Aug', true, true],
          ['Sibanda, Ruvimbo', 'CHS-1266', 'RCT-2026-1102 · Overpayment', '620.00', '620.00', '0.00', '4 Aug', true, false],
          ['Gwatidzo, Rufaro', 'CHS-1277', 'INV-2026-0301 · Over-settled bill', '150.00', '0.00', '150.00', '28 Jul', false, true],
        ].map(([name, sno, from, credit, held, avail, since, isReceipt, canAct]) => [
          studentCell(name, sno),
          txt(from, { size: 12, color: C.mid, ellipsis: true }),
          mono(credit, { size: 12, color: C.body }),
          mono(held, { size: 12, color: held === '0.00' ? C.faint : C.warn }),
          mono(avail, { size: 12, color: avail === '0.00' ? C.faint : C.ok, weight: 700 }),
          mono(since, { size: 11.5 }),
          `<span style="display: flex; gap: 6px; justify-content: flex-end; ${canAct ? '' : 'opacity: .4'}">${isReceipt ? tinyBtn('Allocate') : ''}${tinyBtn('Refund')}</span>`,
        ]),
      }),
      extra: grid(
        2,
        `
        ${note('today', 'The two empty states here are the best in the module because they explain the concept rather than the absence: <b>&ldquo;No credit on account &mdash; every payment so far has settled a bill exactly.&rdquo;</b> and <b>&ldquo;No refunds &mdash; start one from a credit on account.&rdquo;</b>')}
        ${note('today', 'The <b>Allocate</b> dialog then asks for an <b>Invoice ID</b> as a raw text box &mdash; on a screen that already knows which family the credit belongs to and which of their invoices are unpaid.')}
      `,
      ),
    }),
    overlay: modal({
      w: 450,
      title: 'Allocate credit',
      lede: 'USD 90.00 from RCT-2026-1194, held for Kudzai Nyathi.',
      body: `${pickerField('Invoice', 'INV-2026-0455 &mdash; Term 2 &mdash; USD 310.00 outstanding', { required: true })}
             ${field('Amount', '90.00', { hint: 'Leave blank to settle as much of the invoice as the credit covers.' })}`,
      footer: `${ghostBtn('Cancel')}${solidBtn('Allocate')}`,
    }),
  })

/* ── ledger · refunds ───────────────────────────────────────────────── */
export const LedgerRefunds = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Refunds',
    caption: 'Term 2 &middot; 1 requested',
    search: 'Search refunds',
    content: ledger({
      active: 'Refunds',
      title: 'Refunds',
      body: table({
        cols: [
          { label: 'Refund No', w: 130 },
          { label: 'Student' },
          { label: 'From', w: 145 },
          { label: 'Status', w: 105 },
          { label: 'Amount', w: 95, align: 'right' },
          { label: 'Method', w: 125 },
          { label: 'Requested', w: 95 },
          { label: 'Actions', w: 140, align: 'right' },
        ],
        rows: [
          ['REF-2026-0009', 'Sibanda, Ruvimbo', 'CHS-1266', 'RCT-2026-1102', 'Requested', 'warn', '620.00', 'Bank transfer', '5 Aug', 'act'],
          ['REF-2026-0007', 'Marange, Tadiwa', 'CHS-1288', 'RCT-2026-0988', 'Paid', 'ok', '310.00', 'Mobile money', '22 Jul', 'none'],
          ['REF-2026-0006', 'Ncube, Tariro', 'CHS-1292', 'INV-2026-0244', 'Cancelled', 'bad', '155.00', 'Cash', '14 Jul', 'none'],
        ].map(([no, name, sno, from, status, tone, amt, method, when, state]) => [
          mono(no, { size: 11.5, color: C.brandStrong }),
          studentCell(name, sno),
          mono(from, { size: 11.5, color: C.mid }),
          badge(status, tone),
          mono(amt, { size: 12, color: C.body, weight: 700 }),
          txt(method, { size: 12, color: C.mid }),
          mono(when, { size: 11.5 }),
          state === 'act'
            ? `<span style="display: flex; gap: 6px; justify-content: flex-end">${tinyBtn('Cancel')}${solidBtn('Pay')}</span>`
            : txt('No action left', { size: 11.5, color: C.subtle }),
        ]),
      }),
      extra: grid(
        2,
        `
        ${note('today', 'Refunds are the <b>only fully wired state machine in campus</b>: request from a credit &rarr; <b>Requested</b>, then <b>Pay</b> or <b>Cancel</b>, with terminal rows honestly labelled <b>&ldquo;No action left&rdquo;</b>. Everything else in the ledger is a table with the verbs missing.')}
        ${note('today', 'It also gets the destructive dialog right: <b>&ldquo;Keep it&rdquo;</b> beside <b>&ldquo;Cancel refund&rdquo;</b>, with the consequence stated first &mdash; &ldquo;This releases USD 620.00 back to the family&rsquo;s credit.&rdquo; That is the pattern the States sheet holds every other dialog to.')}
      `,
      ),
    }),
  })

/* ── ledger · waivers ───────────────────────────────────────────────── */
export const LedgerWaivers = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Waivers',
    caption: 'Term 2 &middot; 24 on file',
    search: 'Search fee waivers',
    content: ledger({
      active: 'Waivers',
      title: 'Fee Waivers',
      body: table({
        cols: [
          { label: 'Student' },
          { label: 'Waiver Type', w: 160 },
          { label: 'Status', w: 110 },
          { label: 'Amount', w: 110, align: 'right' },
          { label: 'Invoice', w: 160 },
          { label: 'Created', w: 110 },
        ],
        rows: [
          ['Moyo, Farai', 'CHS-1211', 'HARDSHIP', 'Applied', 'ok', '155.00', 'INV-2026-0407', '2 Aug'],
          ['Chikwanda, Rutendo', 'CHS-1180', 'SCHOLARSHIP', 'Applied', 'ok', '310.00', 'INV-2026-0388', '28 Jul'],
          ['Mafuta, Simba', 'CHS-1301', 'DISCOUNT', 'Approved', 'brand', '62.00', 'Unassigned', '19 Aug'],
          ['Ncube, Tariro', 'CHS-1292', 'HARDSHIP', 'Rejected', 'bad', '310.00', 'Unassigned', '11 Aug'],
          ['Gwatidzo, Rufaro', 'CHS-1277', 'OTHER', 'Draft', 'plain', '100.00', 'Unassigned', '21 Aug'],
        ].map(([name, sno, type, status, tone, amt, inv, when]) => [
          studentCell(name, sno),
          txt(type, { size: 12, color: C.mid }),
          badge(status, tone),
          mono(amt, { size: 12, color: C.body, weight: 700 }),
          mono(inv, { size: 11.5, color: inv === 'Unassigned' ? C.subtle : C.brandStrong }),
          mono(when, { size: 11.5 }),
        ]),
      }),
      extra: grid(
        2,
        `
        ${note('today', 'Read-only: no create, no approve, no reject, no apply, no reverse. <b>Four of the five waiver states have no UI to reach them</b>, and the <b>Waiver Type</b> column prints the raw enum &mdash; <code>SCHOLARSHIP</code>, <code>HARDSHIP</code> &mdash; where the rest of the module would say Scholarship and Hardship.')}
        ${note('proposed', 'A waiver is a decision about a family in difficulty, and the module treats it as a row. It needs the whole ladder: request, approve or reject with a reason, apply to a named invoice, reverse. Drawn as <b>Waivers</b> on the Leadership canvas.')}
      `,
      ),
    }),
  })

/* ── ledger · fee structures ────────────────────────────────────────── */
export const LedgerStructures = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Ledger and structures',
    caption: 'Term 2 &middot; 18 sheets',
    search: 'Search fee structures',
    content: ledger({
      active: 'Fee Structures',
      title: 'Fee Structures',
      note: 'A school opens with one fee sheet on the first year group. Copy it up the ladder rather than re-typing it — the copies arrive as drafts.',
      body: table({
        cols: [
          { label: 'Fee Structure' },
          { label: 'Status', w: 105 },
          { label: 'Lines', w: 70, align: 'right' },
          { label: 'Total Amount', w: 120, align: 'right' },
          { label: 'Mandatory Amount', w: 140, align: 'right' },
          { label: 'Currency', w: 90 },
          { label: '', w: 110, align: 'right' },
        ],
        rows: [
          ['Form 1 fees — Term 2', 'Form 1 / Term 2', 'Active', 'ok', '6', '310.00', '280.00', 'USD'],
          ['Form 2 fees — Term 2', 'Form 2 / Term 2', 'Active', 'ok', '6', '310.00', '280.00', 'USD'],
          ['Form 3 fees — Term 2', 'Form 3 / Term 2', 'Active', 'ok', '6', '340.00', '310.00', 'USD'],
          ['Form 4 fees — Term 2', 'Form 4 / Term 2', 'Draft', 'plain', '6', '340.00', '310.00', 'USD'],
          ['Lower Sixth fees — Term 1', 'Lower Sixth / Term 1', 'Archived', 'plain', '7', '420.00', '380.00', 'USD'],
        ].map(([name, sub, status, tone, lines, total, mand, ccy]) => [
          `<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>`,
          badge(status, tone),
          mono(lines, { size: 12, color: C.body }),
          mono(total, { size: 12, color: C.body }),
          mono(mand, { size: 12, color: C.mid }),
          mono(ccy, { size: 11.5, color: C.mid }),
          tinyBtn('Copy to…'),
        ]),
      }),
      extra: grid(
        2,
        `
        ${note('today', 'The copy dialog tells you to <b>&ldquo;activate each one when you have read it&rdquo;</b> &mdash; and <b>nothing in the module activates a draft</b>, or archives an active one. The instruction describes a control that does not exist, and Form 4 cannot be invoiced until it does.')}
        ${note('proposed', '<b>Activate</b> and <b>Archive</b> on the row, plus a warning on the Invoices view when a year group has no active structure for the current term. Drawn as <b>StructureLifecycle</b> on the Leadership canvas.')}
      `,
      ),
    }),
    overlay: modal({
      w: 470,
      title: 'Copy this fee sheet',
      lede: 'Form 2 fees — Term 2 &mdash; 6 lines, USD 310.00 a term. The copies keep the same lines and land in Term 2.',
      body: `
        <div style="display: flex; align-items: center; gap: 8px">${sectionLabel('Year groups')}<div style="flex: 1"></div>${tinyBtn('Select all')}</div>
        <div style="border: 1px solid ${C.border}; border-radius: 9px; overflow: hidden">
          ${[
            ['Form 1', '116 pupils', false],
            ['Form 3', '114 pupils', true],
            ['Form 4', '96 pupils', true],
            ['Lower Sixth', '62 pupils', false],
            ['Upper Sixth', '58 pupils', false],
          ]
            .map(
              ([name, n, on], i, a) =>
                `<div style="display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 0 11px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}">
                  <span style="width: 15px; height: 15px; border-radius: 4px; border: 1px solid ${on ? C.brand : C.borderStrong}; background: ${on ? C.brand : C.surface}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${on ? '<span style="color:#fff;font-size:10px;font-weight:700">&#10003;</span>' : ''}</span>
                  <span style="flex: 1; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${name}</span>
                  <span style="font-size: 11px; color: ${C.subtle}">${n}</span>
                </div>`,
            )
            .join('')}
        </div>
        <div style="display: flex; align-items: center; gap: 9px">
          <span style="width: 15px; height: 15px; border-radius: 4px; border: 1px solid ${C.borderStrong}; background: ${C.surface}; flex-shrink: 0"></span>
          <span style="font-size: 12.5px; color: ${C.body}">Make them active straight away</span>
        </div>`,
      footer: `${ghostBtn('Cancel')}${solidBtn('Copy to 2 year groups')}`,
    }),
  })

/* ── bulk generate ──────────────────────────────────────────────────── */
export const FeeBulkGenerate = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Ledger and structures',
    caption: 'Term 2 &middot; bulk generate',
    search: 'Search fee invoices',
    content: ledger({
      active: 'Invoices',
      title: 'Fee Invoices',
      actions: [ghostBtn('Bulk Generate', I.layers), solidBtn('Create Invoice', I.plus)],
      body: table({
        cols: [{ label: 'Invoice No', w: 130 }, { label: 'Student' }, { label: 'Status', w: 105 }, { label: 'Outstanding', w: 120, align: 'right' }],
        rows: [
          ['INV-2026-0412', 'Mutasa, Tanaka', 'CHS-1219', 'Issued', 'plain', '310.00'],
          ['INV-2026-0407', 'Moyo, Farai', 'CHS-1211', 'Issued', 'plain', '310.00'],
          ['INV-2026-0402', 'Dube, Tapiwa', 'CHS-1204', 'Part Paid', 'warn', '155.00'],
        ].map(([no, name, sno, status, tone, out]) => [
          mono(no, { size: 11.5, color: C.brandStrong }),
          studentCell(name, sno),
          badge(status, tone),
          mono(out, { size: 12, color: C.bad, weight: 700 }),
        ]),
      }),
    }),
    overlay: modal({
      w: 500,
      title: 'Bulk Generate Invoices',
      lede: 'Generate fee invoices for multiple students at once using a fee structure template.',
      body: `
        ${pickerField('Term', 'Term 2 &mdash; 4 May to 10 Sep 2026', { required: true })}
        ${pickerField('Class (Optional)', 'Form 2')}
        ${pickerField('Fee Structure', 'Form 2 fees &mdash; Term 2 &middot; 6 lines &middot; Total: USD 310.00', { required: true })}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 11px">${field('Issue Date', '24 Aug 2026', { required: true })}${field('Due Date', '15 Sep 2026', { required: true })}</div>
        ${field('Notes (Optional)', 'Additional notes for these invoices', { placeholder: true })}
        ${[
          ['Skip students who already have invoices for this term', true],
          ['Issue immediately (post to accounting)', false],
        ]
          .map(
            ([label, on]) =>
              `<div style="display: flex; align-items: center; gap: 9px">
                <span style="width: 15px; height: 15px; border-radius: 4px; border: 1px solid ${on ? C.brand : C.borderStrong}; background: ${on ? C.brand : C.surface}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${on ? '<span style="color:#fff;font-size:10px;font-weight:700">&#10003;</span>' : ''}</span>
                <span style="font-size: 12.5px; color: ${C.body}">${label}</span>
              </div>`,
          )
          .join('')}`,
      footer: `${ghostBtn('Cancel')}${solidBtn('Generate Invoices')}`,
    }),
  })

/* ── the dialogs, as built and as proposed ──────────────────────────── */
export const FeeDialogs = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Ledger and structures',
    caption: 'The dialogs',
    search: null,
    content: page(`
      ${note('today', 'The ledger drives everything through five dialogs, and three of them ask a bursar to type a UUID. They are drawn here as they ship, beside what a picker does to the same form.')}
      ${grid(
        2,
        `
        ${card({
          title: 'Create Invoice',
          note: 'as built',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
            ${txt('Enter the invoice details below.', { size: 12, color: C.mid })}
            ${field('Student ID', '', { required: true, placeholder: true })}
            ${field('Term ID', '', { required: true, placeholder: true })}
            ${field('Description', '', { placeholder: true })}
            ${field('Amount', '', { required: true, placeholder: true })}
            ${rowFlex(`<div style="flex:1"></div>${ghostBtn('Cancel')}${solidBtn('Create Invoice')}`)}
          </div>`,
        })}
        ${card({
          title: 'Create an invoice',
          note: 'proposed',
          actions: [proposalTag()],
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
            ${txt('One bill for one pupil. It lands as a draft until you issue it.', { size: 12, color: C.mid })}
            ${pickerField('Pupil', 'Mutasa, Tanaka &mdash; CHS-1219 &mdash; Form 2A', { required: true })}
            ${pickerField('Term', 'Term 2 &mdash; 4 May to 10 Sep 2026', { required: true })}
            ${field('Description', 'Extra tuition, Term 2')}
            ${field('Amount', 'USD 60.00', { required: true, hint: 'Added to the pupil&rsquo;s outstanding balance when issued.' })}
            ${rowFlex(`<div style="flex:1"></div>${ghostBtn('Cancel')}${solidBtn('Create invoice')}`)}
          </div>`,
        })}
        ${card({
          title: 'Record Receipt',
          note: 'as built',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
            ${txt('Enter the receipt details below.', { size: 12, color: C.mid })}
            ${field('Invoice ID', '', { required: true, placeholder: true })}
            ${field('Amount', '', { required: true, placeholder: true })}
            ${pickerField('Payment method', 'Select method', { required: true, placeholder: true, hint: 'A payment larger than the invoice is accepted; the surplus becomes credit on the family&rsquo;s account.' })}
            ${field('Reference', '', { placeholder: true })}
            ${rowFlex(`<div style="flex:1"></div>${ghostBtn('Cancel')}${solidBtn('Record Receipt')}`)}
          </div>`,
        })}
        ${card({
          title: 'Cancel refund',
          note: 'as built — and the one to copy',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
            ${txt('<b>Cancel refund REF-2026-0009</b>', { size: 13, color: C.strong })}
            ${txt('This releases USD 620.00 back to the family&rsquo;s credit.', { size: 12, color: C.mid })}
            ${field('Reason', 'Family asked for it to stay on account', { required: true })}
            ${rowFlex(`<div style="flex:1"></div>${ghostBtn('Keep it')}${solidBtn('Cancel refund')}`)}
            ${txt('The consequence is stated before the buttons, and the safe option is named for what it does rather than &ldquo;Cancel&rdquo; &mdash; which on this dialog would mean two opposite things.', { size: 11.5, color: C.mid })}
          </div>`,
        })}
      `,
      )}
    `),
  })
