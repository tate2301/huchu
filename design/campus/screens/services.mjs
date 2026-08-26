/**
 * Boarding and services page — the bed board, a hostel record, health and
 * welfare, the library's two views, and transport.
 *
 * Called by build-module.mjs. Copy is the source verbatim.
 */
import {
  C, esc, adminArtboard, page, grid, rowFlex, card, table, listRow, badge, mono,
  txt, alert, ghostBtn, solidBtn, filterSelect, searchField, segments, stat, avatar,
  tinyBtn, sectionLabel, proposalTag,
} from '../lib/kit.mjs'

const note = () => ''

const ini = (n) => {
  const [last, first] = n.split(', ')
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

const studentCell = (name, no) =>
  `${avatar(ini(name))}<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span>${mono(no, { size: 10.5 })}</span>`

/* ── /schools/boarding ──────────────────────────────────────────────── */
export const Boarding = () =>
  adminArtboard({
    title: 'Boarding Management',
    railItem: 'Bed board',
    caption: 'Term 2 &middot; 318 of 370 beds',
    search: 'Search allocations',
    content: page(`
      ${grid(
        5,
        [
          stat({ label: 'Active Allocations', value: '318' }),
          stat({ label: 'Total Allocations', value: '344' }),
          stat({ label: 'Hostels', value: '4' }),
          stat({ label: 'Rooms', value: '48' }),
          stat({ label: 'Beds', value: '370' }),
        ].join(''),
      )}
      ${rowFlex(`${segments([{ label: 'Allocations', count: 344 }, { label: 'Hostels', count: 4 }, { label: 'Leave / Outing Requests', count: 11 }], 'Allocations')}<div style="flex: 1"></div>${searchField('Search allocations', { w: 240 })}`, { align: 'flex-end' })}
      ${card({
        title: 'Boarding Allocations',
        children: table({
          cols: [
            { label: 'Student' },
            { label: 'Hostel / Room / Bed', w: 250 },
            { label: 'Term', w: 80 },
            { label: 'Status', w: 115 },
            { label: 'Start', w: 95 },
            { label: 'End', w: 95 },
          ],
          rows: [
            ['Mutasa, Tanaka', 'CHS-1219', 'Chishawasha House / R12 / B3', 'T2', 'Active', 'ok', '4 May', '—'],
            ['Dube, Tapiwa', 'CHS-1204', 'Chishawasha House / R12 / B4', 'T2', 'Active', 'ok', '4 May', '—'],
            ['Zimuto, Nyasha', 'CHS-1240', 'Nyanga House / R04 / B1', 'T2', 'Active', 'ok', '4 May', '—'],
            ['Nyathi, Kudzai', 'CHS-1233', 'Nyanga House / R04 / B2', 'T2', 'Transferred', 'warn', '4 May', '18 Aug'],
            ['Marange, Tadiwa', 'CHS-1288', 'Inyanga House / R21 / B2', 'T1', 'Ended', 'plain', '5 Jan', '27 Mar'],
          ].map(([name, sno, place, term, status, tone, start, end]) => [
            studentCell(name, sno),
            txt(place, { size: 12, color: C.mid }),
            mono(term, { size: 11.5, color: C.mid }),
            badge(status, tone),
            mono(start, { size: 11.5 }),
            mono(end, { size: 11.5 }),
          ]),
        }),
      })}
      ${grid(
        2,
        `
        ${card({
          title: 'Leave and Outing Workflow',
          note: 'the other view',
          children: table({
            cols: [{ label: 'Student' }, { label: 'Type', w: 95 }, { label: 'Window', w: 145 }, { label: 'Status', w: 125 }],
            rows: [
              ['Mutasa, Tanaka', 'CHS-1219', 'LEAVE', '29 Aug – 1 Sep', 'APPROVED', 'ok'],
              ['Dube, Tapiwa', 'CHS-1204', 'OUTING', '30 Aug', 'CHECKED_IN', 'ok'],
              ['Zimuto, Nyasha', 'CHS-1240', 'LEAVE', '24 Aug – 25 Aug', 'REJECTED', 'bad'],
              ['Nyathi, Kudzai', 'CHS-1233', 'LEAVE', '31 Aug', 'CANCELED', 'bad'],
            ].map(([name, sno, type, when, status, tone]) => [
              studentCell(name, sno),
              txt(type, { size: 12, color: C.mid }),
              mono(when, { size: 11.5, color: C.body }),
              badge(status, tone),
            ]),
          }),
        })}
        ${note('today', 'Two things at once. <b>Every status is the raw enum</b> &mdash; <code>APPROVED</code>, <code>CHECKED_IN</code>, <code>CANCELED</code> with the American spelling, and hostel gender policy prints <code>MIXED</code>. And there are <b>no actions at all</b>: no approve or reject on a leave request, no allocate, no add hostel.<br><br>Meanwhile <code>components/schools/boarding/bed-board-content.tsx</code> is a complete, working bed-allocation board &mdash; rooms, beds, <b>Free the bed</b>, <b>Give it to somebody</b>, and a warning for boarders with no bed &mdash; that <b>no route renders</b>, even though the nav calls this page &ldquo;Bed board&rdquo;.')}
      `,
      )}
    `),
  })

/* ── /schools/boarding/[id] ─────────────────────────────────────────── */
export const BoardingHostel = () =>
  adminArtboard({
    title: 'Chishawasha House',
    railItem: 'Bed board',
    caption: 'Hostels',
    back: true,
    search: null,
    chips: [
      { label: 'Boarders', value: '96', tone: 'ok' },
      { label: 'Beds free', value: '4', tone: 'warn' },
      { label: 'Rooms', value: '13' },
    ],
    content: page(`
      ${grid(
        'minmax(0, 1fr) 320px',
        `
        ${card({
          title: 'Rooms',
          note: '13 rooms · 100 beds',
          children: [
            ['R10', 'Floor 1 · 8 beds', '8 in'],
            ['R11', 'Floor 1 · 8 beds', '8 in'],
            ['R12', 'Floor 1 · 8 beds', '6 in'],
            ['R13', 'Floor 2 · 8 beds', '8 in'],
            ['R14', 'Floor 2 · 8 beds', 'Empty'],
          ]
            .map(([code, sub, meta], i, a) =>
              listRow(
                `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${code}</span>${txt(sub, { size: 11, color: C.subtle })}</span>${badge(meta, meta === 'Empty' ? 'warn' : 'ok')}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${card({
          title: 'Properties',
          children: `<div style="padding: 11px 13px; display: flex; flex-direction: column; gap: 3px">
            ${[
              ['Name', 'Chishawasha House', false],
              ['Code', 'CHH', true],
              ['Takes', 'Boys', false],
              ['Intended capacity', '100', false],
              ['In use', 'In use', false],
            ]
              .map(
                ([k, v, ro]) =>
                  `<div style="display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 0 8px; border-radius: 6px; background: ${ro ? 'transparent' : C.canvas}"><span style="width: 128px; flex-shrink: 0; font-size: 11px; color: ${C.mid}">${k}</span><span style="flex: 1; font-size: 11.5px; color: ${ro ? C.subtle : C.body}">${v}</span></div>`,
              )
              .join('')}
          </div>`,
        })}
      `,
      )}
      ${card({
        title: 'The bed board that already exists',
        note: 'bed-board-content.tsx — built, and rendered by no route',
        actions: [proposalTag()],
        children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
          ${alert({ tone: 'warn', title: '4 boarders have no bed', body: 'Marange, Tadiwa &middot; Ncube, Tariro &middot; Sibanda, Ruvimbo &middot; Gwatidzo, Rufaro' })}
          <div style="border: 1px solid ${C.border}; border-radius: 9px; overflow: hidden">
            <div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('Room 12 · 6 of 8')}</div>
            ${[
              ['B1', 'Mutasa, Tanaka', 'CHS-1219', true],
              ['B2', 'Dube, Tapiwa', 'CHS-1204', true],
              ['B3', '', '', false],
              ['B4', '', '', false],
            ]
              .map(([bed, name, sno, taken], i, a) =>
                listRow(
                  `${mono(`Bed ${bed}`, { size: 11.5, color: C.body, width: 70, weight: 700 })}
                   <span style="flex: 1; min-width: 0">${taken ? `<span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${name}</span>${mono(sno, { size: 10.5 })}` : txt('Free', { size: 12, color: C.subtle })}</span>
                   ${badge(taken ? 'Taken' : 'Free', taken ? 'ok' : 'plain')}
                   ${taken ? tinyBtn('Free the bed') : tinyBtn('Give it to somebody', 'brand')}`,
                  { last: i === a.length - 1 },
                ),
              )
              .join('')}
          </div>
        </div>`,
      })}
    `),
  })

/* ── /schools/boarding/welfare ──────────────────────────────────────── */
export const BoardingWelfare = () =>
  adminArtboard({
    title: 'Health and welfare',
    railItem: 'Health and welfare',
    caption: 'Term 2 &middot; 842 children',
    search: 'Search the welfare list',
    chips: [
      { label: 'Complete', value: '689', tone: 'ok' },
      { label: 'Still to record', value: '153', tone: 'warn' },
      { label: 'Allergy, no consent', value: '6', tone: 'bad' },
    ],
    content: page(`
      ${alert({
        title: '6 children with an allergy and no consent to treat',
        body: 'This is the combination a school cannot be caught by. Ring home before anything else on this page.',
      })}
      ${rowFlex(`${filterSelect('Year group', 'The whole school')}${ghostBtn('Boarders only')}<div style="flex: 1"></div>${searchField('Search the welfare list', { w: 250 })}`, { align: 'flex-end' })}
      ${txt('842 children, 153 with something still to record.', { size: 12.5, color: C.mid })}
      ${card({
        title: 'Form 2',
        note: '118',
        children: [
          ['Chikwanda, Rutendo', 'CHS-1180 · day · allergic to peanuts', ['Allergy on file, no consent to treat']],
          ['Dube, Tapiwa', 'CHS-1204 · boarder · allergic to penicillin', []],
          ['Moyo, Farai', 'CHS-1211 · day', ['No doctor recorded']],
          ['Mutasa, Tanaka', 'CHS-1219 · boarder', []],
          ['Zimuto, Nyasha', 'CHS-1240 · boarder', ['No consent recorded', 'No doctor recorded']],
        ]
          .map(([name, sub, gaps], i, a) =>
            listRow(
              `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>
               ${gaps.length === 0 ? badge('Complete', 'ok') : gaps.map((g) => badge(g, g.includes('Allergy on file') ? 'bad' : 'plain')).join('')}
               ${tinyBtn(gaps.length === 0 ? 'Update' : 'Record', gaps.length === 0 ? 'plain' : 'brand')}`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
      ${grid(
        2,
        `
        ${note('today', 'The four consent checkboxes are written as a school would say them, not as a system would: <b>&ldquo;Ordinary first aid without ringing home&rdquo;</b>, <b>&ldquo;Emergency treatment, including hospital&rdquo;</b>, <b>&ldquo;Photographs for the newsletter and website&rdquo;</b>, <b>&ldquo;Leaving the grounds on a school trip&rdquo;</b>. And the allergy field says <b>&ldquo;Write the sentence a nurse needs, not a list of words.&rdquo;</b>')}
        ${note('proposed', 'The alert names the six children and stops. It should carry the verb: <b>Ring home</b> against each one with the guardian&rsquo;s number beside it &mdash; this screen already knows both.')}
      `,
      )}
    `),
  })

/* ── /schools/library ───────────────────────────────────────────────── */
const bookCover = (title, author, copies, shelf, hue) => `
  <div style="display: flex; flex-direction: column; gap: 6px; min-width: 0">
    <div style="aspect-ratio: 3/4; border-radius: 7px; background: ${hue}; display: flex; align-items: flex-end; padding: 10px; box-shadow: 0 6px 14px -6px rgba(42,38,34,.3)">
      <span style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,.94); line-height: 1.3">${esc(title)}</span>
    </div>
    <div style="min-width: 0">
      <div style="font-size: 11.5px; font-weight: 600; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(title)}</div>
      ${mono(`${copies}${shelf ? ` · ${shelf}` : ''}`, { size: 10 })}
    </div>
  </div>`

export const Library = () =>
  adminArtboard({
    title: 'Library',
    railItem: 'Library',
    caption: '1,842 copies &middot; 214 out',
    search: 'Title, author or ISBN',
    content: page(`
      ${rowFlex(`${segments([{ label: 'Shelves', count: 612 }, { label: 'Out', count: 214 }], 'Shelves')}<div style="flex: 1"></div>${searchField('Title, author or ISBN', { w: 260, label: 'Find a book' })}`, { align: 'flex-end' })}
      ${txt('612 titles &middot; 1,628 copies on the shelf', { size: 12.5, color: C.mid })}
      ${card({
        children: `<div style="padding: 14px 13px; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px">
          ${[
            ['Things Fall Apart', 'Chinua Achebe', '11 of 14 in', 'AFR 823.9', '#7A4A2B'],
            ['The Rain Came', 'Grace Ogot', '6 of 8 in', 'AFR 823.9', '#2F5D50'],
            ['New General Mathematics 2', 'J.B. Channon', '28 of 40 in', 'MAT 510', '#1F4E79'],
            ['Nervous Conditions', 'Tsitsi Dangarembga', '9 of 12 in', 'AFR 823.9', '#6B2D4E'],
            ['Combined Science for ZIMSEC', 'M. Chikoore', '22 of 36 in', 'SCI 500', '#4A4ED4'],
            ['Tsumo neMadimikira', 'M. Hamutyinei', '5 of 6 in', 'SHO 398', '#8A6415'],
          ]
            .map((b) => bookCover(...b))
            .join('')}
        </div>`,
      })}
      ${card({
        title: 'Things Fall Apart · Chinua Achebe',
        children: [
          ['TFA-004', 'Nyathi, Kudzai · back by 2026-09-04', 'Out', 'Take it back'],
          ['TFA-007', 'Moyo, Farai · back by 2026-08-21', 'Out', 'Take it back'],
          ['TFA-009', 'AFR 823.9', 'In', 'Lend it'],
          ['TFA-011', 'AFR 823.9', 'In', 'Lend it'],
        ]
          .map(([code, sub, state, action], i, a) =>
            listRow(
              `${mono(code, { size: 11.5, color: C.body, width: 82, weight: 700 })}
               <span style="flex: 1; min-width: 0">${txt(sub, { size: 12, color: C.mid })}</span>
               ${badge(state, state === 'Out' ? 'warn' : 'ok')}
               ${tinyBtn(action, state === 'In' ? 'brand' : 'plain')}`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
      ${grid(
        2,
        `
        ${note('today', 'Lending is inline, not a dialog: <b>Lend it</b> reveals a <b>Reader</b> select and an <b>Issue</b> button inside the row. That is the right shape for a desk. What is missing is everything upstream &mdash; <b>no way to add a book, add a copy, or manage a reservation</b>, though <code>SchoolBookReservation</code> exists in the schema and the reservation count is fetched and never rendered.')}
        ${note('proposed', 'The catalogue is the gap. <b>Add a title</b>, <b>Add copies</b>, and a reservation queue on the title card, so a librarian can run the library from the library rather than from an import.')}
      `,
      )}
    `),
  })

export const LibraryOut = () =>
  adminArtboard({
    title: 'Library',
    railItem: 'Library',
    caption: '214 out &middot; 38 late',
    search: 'Search the loan register',
    chips: [
      { label: 'Out', value: '214' },
      { label: 'Late', value: '38', tone: 'bad' },
      { label: 'Fines if back today', value: '76.00', tone: 'warn' },
    ],
    content: page(`
      ${rowFlex(`${segments([{ label: 'Shelves', count: 612 }, { label: 'Out', count: 214 }], 'Out')}<div style="flex: 1"></div>${ghostBtn('Show everything out')}`)}
      ${txt('214 books out, 38 late', { size: 12.5, color: C.mid })}
      ${card({
        children: [
          ['Moyo, Farai', 'Things Fall Apart (TFA-007) · due 2026-08-21 · Form 2B', 'Late · 1.50 if back today', 'bad'],
          ['Nyathi, Kudzai', 'New General Mathematics 2 (NGM-021) · due 2026-08-18 · Form 3A', 'Late · 3.00 if back today', 'bad'],
          ['Mafuta, Simba', 'Nervous Conditions (NC-003) · due 2026-08-14 · Form 4A', 'Late · 5.00 if back today', 'bad'],
          ['Zimuto, Nyasha', 'The Rain Came (TRC-002) · due 2026-08-29 · Form 3A', 'Out', 'warn'],
        ]
          .map(([name, sub, state, tone], i, a) =>
            listRow(
              `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>
               ${badge(state, tone)}
               ${tinyBtn('Take it back')}${tinyBtn('Renew')}`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
      ${alert({ tone: 'ok', title: 'Done', body: 'Back, with USD 1.50 to pay' })}
      ${note('today', 'The overdue filter defaults <b>on</b>, so the screen opens on the problem rather than the list &mdash; and the empty state for that is <b>&ldquo;Nothing is late.&rdquo;</b>, the right sentence for good news. The fine is quoted as <b>&ldquo;if back today&rdquo;</b>, which is honest about a number that moves.')}
    `),
  })

/* ── /schools/transport ─────────────────────────────────────────────── */
export const Transport = () =>
  adminArtboard({
    title: 'Transport',
    railItem: 'Transport',
    caption: 'Term 2 &middot; 6 routes',
    search: 'Search routes',
    content: page(`
      ${rowFlex(segments([{ label: 'Routes', count: 6 }, { label: 'This morning' }], 'Routes'))}
      ${txt('6 routes &middot; 214 riders &middot; USD 4,280.00 still to bill this term', { size: 12.5, color: C.mid })}
      ${card({
        title: 'R2 · Chishawasha · Mr Katsande',
        note: '29 riding · USD 580.00 to bill',
        actions: [badge('29 of 32 seats', 'ok')],
        children: [
          ['1. Mission Gate', 'Pick up 06:40 · drop 16:20'],
          ['2. Chishawasha Shops', 'Pick up 06:52 · drop 16:08'],
          ['3. Dandaro Turn', 'Pick up 07:04 · drop 15:55'],
          ['4. St Ignatius', 'No pick-up time set'],
        ]
          .map(([name, sub], i, a) =>
            listRow(
              `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5, color: sub.startsWith('No pick-up') ? C.warn : C.subtle })}</span>`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
      ${card({
        title: 'R5 · Borrowdale · no driver named',
        note: '0 riding',
        children: listRow(
          `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">No stops yet</span>${txt('A route with no stops is a bus with nowhere to pull in.', { size: 11, color: C.subtle })}</span>`,
          { last: true },
        ),
      })}
      ${grid(
        2,
        `
        ${note('today', 'The whole Routes view is read-only &mdash; <b>no create or edit for routes, stops, riders or fees</b>. And the billing line is report-only: <b>&ldquo;USD 4,280.00 still to bill this term&rdquo;</b> never posts to the fee ledger, so transport money exists on this screen and nowhere else in the accounts.')}
        ${note('today', '&ldquo;A route with no stops is a bus with nowhere to pull in&rdquo; is the module at its best &mdash; and it is attached to a row with no button to add a stop.')}
      `,
      )}
    `),
  })

export const TransportRegister = () =>
  adminArtboard({
    title: 'Transport',
    railItem: 'Transport',
    caption: 'R2 &middot; Chishawasha &middot; Morning &middot; Tue 24 Aug',
    search: null,
    chips: [
      { label: 'On', value: '24', tone: 'ok' },
      { label: 'Not on', value: '3', tone: 'bad' },
      { label: 'Unmarked', value: '2', tone: 'warn' },
    ],
    bandActions: [solidBtn('Save the register')],
    content: page(`
      ${rowFlex(`${segments([{ label: 'Routes', count: 6 }, { label: 'This morning' }], 'This morning')}<div style="flex: 1"></div>${filterSelect('Route', 'R2 · Chishawasha', { w: 200 })}${filterSelect('Date', '24 Aug 2026', { w: 150 })}${filterSelect('Journey', 'Morning', { w: 130 })}`, { align: 'flex-end' })}
      ${txt('R2 &middot; Chishawasha &middot; 24 on, 3 not on, 2 unmarked of 29', { size: 12.5, color: C.mid })}
      ${card({
        children: [
          ['Chikwanda, Rutendo', 'CHS-1180 · Mission Gate 06:40 · Form 2A', 'on'],
          ['Dube, Tapiwa', 'CHS-1204 · Mission Gate 06:40 · Form 2A', 'on'],
          ['Moyo, Farai', 'CHS-1211 · Chishawasha Shops 06:52 · Form 2B', 'off'],
          ['Mutasa, Tanaka', 'CHS-1219 · Chishawasha Shops 06:52 · Form 2A', 'on'],
          ['Nyathi, Kudzai', 'CHS-1233 · no stop set · Form 3A', 'unmarked'],
          ['Zimuto, Nyasha', 'CHS-1240 · Dandaro Turn 07:04 · Form 3A', 'unmarked'],
        ]
          .map(([name, sub, state], i, a) =>
            listRow(
              `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>
               ${state === 'unmarked' ? badge('Not marked', 'warn') : ''}
               <span style="display: flex; gap: 5px; flex-shrink: 0">
                 <span style="height: 26px; padding: 0 13px; border-radius: 6px; border: 1px solid ${state === 'on' ? 'transparent' : C.border}; background: ${state === 'on' ? C.okBg : C.surface}; display: flex; align-items: center; font-size: 11.5px; font-weight: 600; color: ${state === 'on' ? C.ok : C.mid}; cursor: pointer">On</span>
                 <span style="height: 26px; padding: 0 13px; border-radius: 6px; border: 1px solid ${state === 'off' ? 'transparent' : C.border}; background: ${state === 'off' ? C.badBg : C.surface}; display: flex; align-items: center; font-size: 11.5px; font-weight: 600; color: ${state === 'off' ? C.bad : C.mid}; cursor: pointer">Not on</span>
               </span>`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
      ${grid(
        2,
        `
        ${note('today', 'An <b>unmarked child saves as &ldquo;on&rdquo;</b> &mdash; the default is <code>true</code>. On a bus register that is the wrong way round: the safe reading of &ldquo;nobody looked&rdquo; is not &ldquo;the child is on the bus&rdquo;.')}
        ${note('proposed', 'Either make the unmarked default <b>not on</b>, or refuse the save while any row is unmarked and say which two they are. The band already counts them.')}
      `,
      )}
    `),
  })
