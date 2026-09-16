/**
 * Conduct and pastoral — S-12.1 and S-12.3, drawn to unpark S-P.1.
 *
 * S-P.1 was parked because it is "sold in no band and no add-on, and absent
 * from all three prototypes". That is a fact about the price list, not about
 * schools. Every school in the country keeps a conduct record in some book,
 * and a campus product that cannot show one is visibly short of the systems it
 * is asking a bursar to throw away. These five artboards make the case that it
 * belongs in STANDARD at no extra price — it is small, it is expected, and it
 * feeds the report card STANDARD already sells.
 *
 * THE ARGUMENT THE DRAWING MAKES
 *
 * A behaviour log is a record of EVENTS, not a scoreboard. So every row on
 * `Conduct` names four things a filing cabinet cannot: what happened, who saw
 * it, what was decided, and whether home was told. "The parent was never
 * informed" is the sentence this page exists to prevent, which is why "home
 * not told" is a band chip, a filter and a row-level verb rather than a column
 * somebody scrolls past.
 *
 * `ConductIncident` is a record page, so it opens with properties rather than
 * a form: the pupil, the year group, what happened, when, who reported it, the
 * sanction and whether home was told, each pressable. The review spine below
 * them stays because it is a real sequence with real timestamps — four steps
 * done and one still owed — and a page that showed only the outcome would hide
 * the fact that the second detention has not been served.
 *
 * `ConductMerits` is the same ledger read the other way. Merits and demerits
 * are not two subjects; they are one question — what do staff write down — so
 * they are one table with two group headers and a total, and the year-group
 * cut sits beside it with its own total, which reconciles to the same +888.
 *
 * `ConductDetention` draws the awkward truth every real school hits at 14:00
 * on a Friday: a bus pupil and a boarder cannot serve the same slot. What is
 * still owed after today is not a second list of the same eleven names — it is
 * a column on the register, totalled at the foot.
 *
 * `Pastoral` is the screen this page exists for, and it is the one where the
 * temptation to explain is strongest. The rules are resisted by drawing them as
 * data: one table of who or what may read a note, staff in one group and the
 * four places a note never reaches in another. Below it the list is per note,
 * and the two notes this reader is not cleared for are drawn — the date, the
 * band, no content — because a note you cannot read is still a fact you may
 * need to know about.
 *
 * WHAT IS DELIBERATELY NOT ON THE ARTBOARDS
 *
 * No card on any of the five. The one that survived the first recomposition —
 * the report-card preview on `ConductIncident` — drew a border, a fill and a
 * radius around a quoted extract that already has its own, so the heading is
 * now a hairline and the extract is the thing that floats. Everything else was
 * a section already.
 *
 * Nothing on any of the five explains itself: the case for per-note visibility,
 * for counting a repeat rather than judging it, and for a pastoral note never
 * reaching the portal lives in the annotations beside the artboards in
 * build-expansion.mjs, not on them. Every `note` on a section is a count, a
 * date or a range, and where a note would have restated the total row directly
 * under it — or the band chips directly over it — it is gone.
 *
 * Called by build-expansion.mjs.
 */
import {
  C, I, esc, icon, page, grid, stack, rowFlex, section, properties, table,
  badge, mono, txt, alert, ghostBtn, filterSelect, searchField, tinyBtn, avatar,
  sectionLabel, defineScreen,
} from '../lib/expansion-kit.mjs'

/* ── local helpers ──────────────────────────────────────────────────────
   Four shapes only this page needs: a pupil cell, an incident cell, the review
   spine and the redacted row. The kit should not grow a primitive on the
   strength of one caller, and none of the four is a table in disguise.
 */

const CAMPUS = { group: 'Chishawasha Trust', campus: 'Borrowdale campus' }

/** "Tadiwa Marange" -> "TM". This page writes names the way a school says them. */
const ini = (n) =>
  n
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const pupilCell = (name, no) =>
  `${avatar(ini(name))}<span style="min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(no, { size: 10.5 })}</span>`

/** Category, then the one line of fact that says what actually happened. */
const whatCell = (category, line, tone = 'plain') =>
  `${badge(category, tone)}<span style="flex: 1; min-width: 0; font-size: 12px; color: ${C.mid}; line-height: 1.45">${line}</span>`

/** A proportional bar, sized 0–100 by the caller. */
const bar = (pct, color) =>
  `<span style="flex: 1; min-width: 0; height: 7px; border-radius: 999px; background: ${C.muted}; overflow: hidden"><span style="display: block; width: ${pct}%; height: 7px; border-radius: 999px; background: ${color}; opacity: .85"></span></span>`

/** One step of the review spine. `note` is data — never a sentence about it. */
const spineStep = ({ ic, title, when, who, note, done = true, action, last = false }) => {
  const fg = done ? C.ok : C.warn
  const bg = done ? C.okBg : C.warnBg
  const bd = done ? C.okBd : C.warnBd
  return `<div style="display: flex; gap: 12px">
    <div style="width: 26px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center">
      <div style="width: 26px; height: 26px; border-radius: 999px; background: ${bg}; border: 1px solid ${bd}; display: flex; align-items: center; justify-content: center">${icon(ic, { size: 13, stroke: fg })}</div>
      ${last ? '' : `<div style="flex: 1; min-height: 14px; width: 2px; background: ${C.border}; margin: 4px 0"></div>`}
    </div>
    <div style="flex: 1; min-width: 0; padding-bottom: ${last ? 0 : 12}px">
      <div style="display: flex; align-items: baseline; gap: 9px"><span style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">${esc(title)}</span>${mono(when, { size: 10.5 })}</div>
      <div style="font-size: 11px; color: ${C.subtle}; margin-top: 1px">${who}</div>
      ${note ? `<div style="font-size: 12px; color: ${C.body}; margin-top: 4px; line-height: 1.5">${note}</div>` : ''}
      ${action ? `<div style="margin-top: 7px; display: flex; gap: 6px">${action}</div>` : ''}
    </div>
  </div>`
}

/* ══════════════════════════════════════════════════════════════════════
   1. /schools/conduct — the whole-school behaviour log
   ══════════════════════════════════════════════════════════════════════ */

/** [when, name, no, year, category, tone, line, reporter, sanction, sanctionTone, told, when told] */
const LOG = [
  ['4 Sep 08:15', 'Tadiwa Marange', 'CHS-1288', 'Form 3B', 'Lateness', 'plain', 'Late again, missed registration', 'Priscilla Nyathi', null, null, 'no', null],
  ['3 Sep 14:40', 'Kudzai Nyathi', 'CHS-1233', 'Form 4A', 'Phone', 'plain', 'Phone out in the Accounting lesson', 'Farai Moyo', 'Kept until Friday', 'plain', 'Portal notice', '3 Sep 15:10'],
  ['3 Sep 11:05', 'Tapiwa Dube', 'CHS-1204', 'Form 2A', 'Uniform', 'plain', 'No jersey, third day running', 'Tendai Sibanda', 'Warning', 'plain', 'Portal notice', '3 Sep 11:30'],
  ['2 Sep 13:20', 'Nyasha Zimuto', 'CHS-1240', 'Form 4A', 'Plagiarism', 'warn', 'Geography essay copied outright', 'Farai Moyo', 'Friday detention ×1', 'warn', 'no', null],
  ['2 Sep 10:15', 'Tanaka Mutasa', 'CHS-1219', 'Form 2A', 'Damage', 'warn', 'Laboratory stool broken, messing about', 'Tendai Sibanda', 'Pay for the repair', 'plain', 'Phone call', '2 Sep 16:40'],
  ['1 Sep 11:50', 'Tadiwa Marange', 'CHS-1288', 'Form 3B', 'Disruption', 'warn', 'Would not settle; sent out of the laboratory', 'Tendai Sibanda', 'Friday detention ×2', 'warn', 'Phone call', '1 Sep 17:05'],
  ['1 Sep 09:30', 'Rutendo Chikwanda', 'CHS-1180', 'Form 2A', 'Absconding', 'bad', 'Left the grounds at break', 'Rudo Makoni', 'Friday detention ×3', 'warn', 'no', null],
  ['31 Aug 15:10', 'Simba Mafuta', 'CHS-1301', 'Form 4A', 'Fighting', 'bad', 'Fight behind the hall at lunch', 'Rudo Makoni', 'Two days internal', 'bad', 'Phone call', '31 Aug 15:40'],
  ['31 Aug 08:05', 'Tariro Ncube', 'CHS-1292', 'Form 3B', 'Lateness', 'plain', 'The R2 bus was twenty minutes late', 'Priscilla Nyathi', 'None — the bus was late', 'plain', 'not needed', null],
]

/** [name, no, year, count, what they were, last, tone] */
const REPEATS = [
  ['Tadiwa Marange', 'CHS-1288', 'Form 3B', '4', 'Lateness ×2, Uniform, Disruption', '4 Sep', 'bad'],
  ['Rutendo Chikwanda', 'CHS-1180', 'Form 2A', '3', 'Absconding, Lateness ×2', '1 Sep', 'warn'],
  ['Simba Mafuta', 'CHS-1301', 'Form 4A', '3', 'Fighting, Phone, Disruption', '31 Aug', 'warn'],
  ['Tariro Ncube', 'CHS-1292', 'Form 3B', '3', 'Lateness ×3 — all three the R2 bus', '31 Aug', 'plain'],
]

export const Conduct = defineScreen(
  {
    screen: 'Conduct',
    route: '/schools/conduct',
    story: 'S-12.1',
    title: 'Behaviour log',
    railItem: 'Behaviour log',
    action: { label: 'Log an incident', icon: I.plus },
    search: 'Search the behaviour log',
    scope: CAMPUS,
    user: { name: 'Rudo Makoni', role: 'Deputy Head' },
    chips: [
      { label: 'This term', value: '148' },
      { label: 'No sanction decided', value: '12', tone: 'warn' },
      { label: 'Home not told', value: '9', tone: 'bad' },
      { label: 'Three or more', value: '4', tone: 'warn' },
    ],
    bandActions: [ghostBtn('Export the log', I.download)],
  },
  () =>
    page(`
      ${section(
        { title: 'Newest first', note: '9 of 148 · Term 2', controls: rowFlex(
        `${filterSelect('Year group', 'Every year group', { w: 160 })}${filterSelect('What happened', 'Anything', { w: 150 })}${filterSelect('Sanction', 'Any sanction', { w: 160 })}${filterSelect('Home told', 'Told or not', { w: 140 })}<div style="flex: 1"></div>${searchField('Search the behaviour log', { w: 240 })}`,
        { align: 'flex-end' },
      ) },
        table({
          cols: [
            { label: 'When', w: 94 },
            { label: 'Pupil', w: 168 },
            { label: 'Year', w: 58 },
            { label: 'What happened' },
            { label: 'Reported by', w: 108 },
            { label: 'Sanction', w: 140 },
            { label: 'Home told', w: 162 },
          ],
          rows: LOG.map(
            ([when, name, no, year, cat, catTone, line, reporter, sanction, sanctionTone, told, toldAt]) => [
              mono(when, { size: 11, color: C.body }),
              pupilCell(name, no),
              txt(year, { size: 12, color: C.mid }),
              whatCell(cat, line, catTone),
              txt(reporter, { size: 12, color: C.mid }),
              sanction ? txt(sanction, { size: 12, color: sanctionTone === 'bad' ? C.bad : C.body }) : badge('Not decided', 'warn'),
              told === 'no'
                ? tinyBtn('Tell home', 'brand')
                : told === 'not needed'
                  ? badge('Not needed', 'plain')
                  : `${badge(told, 'ok')}${mono(toldAt, { size: 10.5 })}`,
            ],
          ),
        }),
      )}
      ${section(
        { title: 'Three or more this term' },
        table({
          cols: [
            { label: 'Pupil', w: 200 },
            { label: 'Year', w: 64 },
            { label: 'Incidents', w: 92 },
            { label: 'What they were' },
            { label: 'Last', w: 84 },
            { label: '', w: 132, align: 'right' },
          ],
          rows: REPEATS.map(([name, no, year, count, pattern, last, tone]) => [
            pupilCell(name, no),
            txt(year, { size: 12, color: C.mid }),
            badge(count, tone),
            txt(pattern, { size: 12, color: C.mid }),
            mono(last, { size: 11 }),
            tinyBtn('Open the record'),
          ]).concat([
            {
              total: [
                txt('Four pupils', { size: 12.5, color: C.body }),
                '',
                mono('13', { size: 12.5, color: C.strong, weight: 700 }),
                txt('of 148 incidents this term', { size: 12, color: C.mid }),
                '',
                '',
              ],
            },
          ]),
        }),
      )}
    `),
)

/* ══════════════════════════════════════════════════════════════════════
   2. /schools/conduct/[incidentId] — one incident, end to end

   A record page, so the ten facts about the incident are properties at the
   head and pressing one opens its editor. The two accounts are a table because
   they are the same three things said twice; the review is a spine because it
   is a sequence with a step still owed.
   ══════════════════════════════════════════════════════════════════════ */

/** [who, what they are, when, what they said] */
const ACCOUNTS = [
  [
    'Tendai Sibanda', 'Combined Science', '1 Sep 11:58',
    '&ldquo;Would not settle after the practical started. Two warnings, then sent out to stand at my door for the rest of the period.&rdquo;',
  ],
  [
    'Tadiwa Marange', 'Form 3B · the pupil', '1 Sep 12:30',
    '&ldquo;I was answering Tariro. I know I should have stopped when Mr Sibanda asked me the first time.&rdquo;',
  ],
]

/** [when, category, sanction, tone] */
const HIS_TERM = [
  ['12 Aug', 'Uniform', 'Warning', 'plain'],
  ['21 Aug', 'Lateness', 'Break detention', 'plain'],
  ['1 Sep', 'Disruption', 'Friday detention ×2', 'warn'],
  ['4 Sep', 'Lateness', 'Not decided', 'warn'],
]

export const ConductIncident = defineScreen(
  {
    screen: 'ConductIncident',
    route: '/schools/conduct/[incidentId]',
    story: 'S-12.1',
    title: 'Disruption in Combined Science',
    caption: 'Tadiwa Marange &middot; Form 3B &middot; Tue 1 September',
    railItem: 'Behaviour log',
    back: true,
    search: null,
    action: { label: 'Add an update', icon: I.note },
    scope: CAMPUS,
    user: { name: 'Rudo Makoni', role: 'Deputy Head' },
    chips: [
      { label: 'Home told', value: '1 Sep 17:05', tone: 'ok' },
      { label: 'Served', value: '0 of 2', tone: 'warn' },
      { label: 'Next detention', value: 'Fri 4 Sep 14:00', tone: 'warn' },
      { label: 'His term', value: '4 incidents' },
    ],
    bandActions: [ghostBtn('Print for the file', I.print)],
  },
  () =>
    page(`
      ${properties(
        [
          ['Pupil', 'Tadiwa Marange &middot; CHS-1288'],
          ['What happened', 'Disruption &mdash; sent out of the laboratory'],
          ['Year group', 'Form 3B'],
          ['When', 'Tuesday 1 September, 11:50 &middot; period 4'],
          ['Where', 'Combined Science laboratory 2'],
          ['Reported by', 'Tendai Sibanda, 11:58'],
          ['Others involved', 'Tariro Ncube &middot; CHS-1292 &middot; no sanction'],
          ['Sanction', 'Friday detention &times;2'],
          ['Home told', '1 Sep 17:05 &middot; telephone, then portal notice'],
          ['Reference', 'CI-2026-0417', { mono: true }],
        ],
        { cols: 2 },
      )}
      ${alert({
        tone: 'violet',
        title: 'One pastoral note on Tadiwa is not shown here.',
        action: tinyBtn('Open pastoral notes', 'violet'),
      })}
      ${grid(
        'minmax(0, 1fr) 380px',
        `
        ${stack(`
          ${section(
            { title: 'The accounts', note: '2 · taken 1 Sep' },
            table({
              cols: [
                { label: 'Who', w: 190 },
                { label: 'When', w: 98 },
                { label: 'What they said' },
              ],
              rows: ACCOUNTS.map(([who, what, when, said]) => [
                `<span style="min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(who)}</span>${txt(what, { size: 11, color: C.subtle })}</span>`,
                mono(when, { size: 11, color: C.body }),
                txt(said, { size: 12, color: C.body }),
              ]),
            }),
          )}
          ${section(
            { title: 'The review', note: '4 of 5 done' },
            `<div style="padding: 4px 2px 2px">
              ${spineStep({
                ic: I.flag,
                title: 'Reported',
                when: '1 Sep 11:58',
                who: 'Tendai Sibanda &middot; Combined Science',
                note: 'Laboratory 2 &middot; period 4',
              })}
              ${spineStep({
                ic: I.userCheck,
                title: 'Seen by the head of year',
                when: '1 Sep 12:30',
                who: 'Rudo Makoni &middot; Deputy Head',
                note: 'Tadiwa and Tariro Ncube &middot; separately',
              })}
              ${spineStep({
                ic: I.scale,
                title: 'Sanction decided',
                when: '1 Sep 14:05',
                who: 'Rudo Makoni &middot; Deputy Head',
                note: 'Friday detention &times;2 &middot; 4 and 11 September',
              })}
              ${spineStep({
                ic: I.phone,
                title: 'Home told',
                when: '1 Sep 17:05',
                who: 'Rudo Makoni &middot; by telephone',
                note: 'Chiedza Marange &middot; 0772 418 336 &middot; dates asked for in writing',
                action: `${badge('Phone call', 'ok')}${badge('Portal notice 17:12', 'ok')}`,
              })}
              ${spineStep({
                ic: I.clock,
                title: 'Detention served',
                when: 'due Fri 4 Sep 14:00',
                who: 'Room 12 &middot; supervised by Farai Moyo',
                note: '1 of 2 &middot; the second Fri 11 Sep',
                done: false,
                last: true,
                action: tinyBtn('Open the register', 'brand'),
              })}
            </div>`,
          )}
        `)}
        ${stack(`
          ${section(
            { title: 'Tadiwa this term', note: '4 incidents · 2 merits' },
            table({
              cols: [
                { label: 'When', w: 56 },
                { label: 'What' },
                { label: 'Sanction', w: 132 },
              ],
              rows: HIS_TERM.map(([when, cat, outcome, tone]) => [
                mono(when, { size: 11, color: when === '1 Sep' ? C.strong : C.body, weight: when === '1 Sep' ? 700 : 400 }),
                txt(cat, { size: 12, color: C.body, weight: when === '1 Sep' ? 600 : 400 }),
                badge(outcome, tone),
              ]),
            }),
          )}
          ${section(
            { title: 'What the report card will say' },
            `<div style="border: 1px solid ${C.border}; border-radius: 9px; background: ${C.surface}; padding: 11px 13px">
              ${sectionLabel('Conduct — Term 2')}
              <div style="font-size: 12.5px; color: ${C.body}; line-height: 1.6; margin-top: 6px">Four incidents recorded: two for lateness, one for uniform, one for disruption in a lesson. Two Friday detentions, neither served yet. Two merits.</div>
            </div>`,
          )}
        `)}
      `,
      )}
    `),
)

/* ══════════════════════════════════════════════════════════════════════
   3. /schools/conduct/merits — the same ledger, read the other way

   Merits and demerits are one question — what do staff write down — so they
   are one table with two group headers and a total. The year-group cut is the
   same ledger sliced the other way, and its total reconciles to the net in the
   band: +214 +268 +96 +212 +64 +34 = +888.
   ══════════════════════════════════════════════════════════════════════ */

const LEDGER = [
  ['Nyasha Zimuto', 'CHS-1240', 'Form 4A', '14', '1', '+13', 'ok', 'Merit', 'Represented the school — Harare debating provincials', '2 Sep'],
  ['Tapiwa Dube', 'CHS-1204', 'Form 2A', '9', '0', '+9', 'ok', 'Merit', 'Helping in the library at break, every day this term', '1 Sep'],
  ['Kudzai Nyathi', 'CHS-1233', 'Form 4A', '7', '3', '+4', 'ok', 'Demerit', 'Phone out in the Accounting lesson', '3 Sep'],
  ['Tanaka Mutasa', 'CHS-1219', 'Form 2A', '6', '2', '+4', 'ok', 'Merit', 'Sports colours — first team hockey', '28 Aug'],
  ['Rutendo Chikwanda', 'CHS-1180', 'Form 2A', '4', '5', '−1', 'bad', 'Demerit', 'Left the grounds at break', '1 Sep'],
  ['Tariro Ncube', 'CHS-1292', 'Form 3B', '3', '4', '−1', 'bad', 'Demerit', 'Late — the R2 bus, for the third time', '31 Aug'],
  ['Simba Mafuta', 'CHS-1301', 'Form 4A', '2', '8', '−6', 'bad', 'Merit', 'Sang the solo at the Founders service', '19 Aug'],
  ['Tadiwa Marange', 'CHS-1288', 'Form 3B', '2', '9', '−7', 'bad', 'Merit', 'Set out the hall for prize giving, unasked', '26 Aug'],
]

/**
 * One table: two group headers, one total. [reason, times, share]
 *
 * The group headers carry what the rows under them come to AND what the term
 * came to, because the two are not the same number: the six merit reasons drawn
 * are 669 of 1,284, and the six demerit reasons are all 396 there are.
 */
const REASONS = [
  { group: 'Merits · 669 of 1,284' },
  ['Helping in the library', '212', 100, 'ok'],
  ['Top of the class test', '168', 79, 'ok'],
  ['Represented the school', '96', 45, 'ok'],
  ['Sports colours', '74', 35, 'ok'],
  ['Read at assembly', '61', 29, 'ok'],
  ['Helped a younger pupil', '58', 27, 'ok'],
  { group: 'Demerits · 396 of 396' },
  ['Lateness', '141', 100, 'warn'],
  ['Uniform', '96', 68, 'warn'],
  ['Phone', '54', 38, 'warn'],
  ['No homework', '48', 34, 'warn'],
  ['Disruption', '31', 22, 'warn'],
  ['Litter', '26', 18, 'warn'],
]

const YEAR_NET = [
  ['Form 1', '+214', 80],
  ['Form 2', '+268', 100],
  ['Form 3', '+96', 36],
  ['Form 4', '+212', 79],
  ['Form 5', '+64', 24],
  ['Form 6', '+34', 13],
]

export const ConductMerits = defineScreen(
  {
    screen: 'ConductMerits',
    route: '/schools/conduct/merits',
    story: 'S-12.1',
    title: 'Merits and demerits',
    railItem: 'Merits and demerits',
    action: { label: 'Award a merit', icon: I.star },
    search: 'Search by pupil',
    scope: CAMPUS,
    user: { name: 'Rudo Makoni', role: 'Deputy Head' },
    chips: [
      { label: 'Merits', value: '1,284', tone: 'ok' },
      { label: 'Demerits', value: '396', tone: 'warn' },
      { label: 'Net', value: '+888' },
      { label: 'Pupils with neither', value: '214' },
    ],
    bandActions: [ghostBtn('Export the term', I.download)],
  },
  () =>
    page(`
      ${section(
        { title: 'By pupil', note: '8 of 628 · Term 2', controls: rowFlex(
        `${filterSelect('Year group', 'Every year group', { w: 170 })}${filterSelect('Stream', 'Every stream', { w: 150 })}${filterSelect('Sort by', 'Net, highest first', { w: 180 })}<div style="flex: 1"></div>${searchField('Search by pupil', { w: 240 })}`,
        { align: 'flex-end' },
      ) },
        table({
          cols: [
            { label: 'Pupil', w: 196 },
            { label: 'Year', w: 62 },
            { label: 'Merits', w: 68, align: 'right' },
            { label: 'Demerits', w: 78, align: 'right' },
            { label: 'Net', w: 58, align: 'right' },
            { label: 'The last thing recorded' },
          ],
          rows: LEDGER.map(([name, no, year, merits, demerits, net, netTone, kind, reason, when]) => [
            pupilCell(name, no),
            txt(year, { size: 12, color: C.mid }),
            mono(merits, { size: 12, color: C.ok, weight: 700 }),
            mono(demerits, { size: 12, color: demerits === '0' ? C.subtle : C.warn, weight: 700 }),
            mono(net, { size: 12.5, color: netTone === 'ok' ? C.ok : C.bad, weight: 700 }),
            `${badge(kind, kind === 'Merit' ? 'ok' : 'warn')}<span style="flex: 1; min-width: 0; font-size: 12px; color: ${C.mid}">${esc(reason)}</span>${mono(when, { size: 11 })}`,
          ]),
        }),
      )}
      ${grid(
        2,
        `
        ${section(
          { title: 'What gets written down', note: 'Term 2' },
          table({
            cols: [
              { label: 'Reason' },
              { label: 'Times', w: 70, align: 'right' },
              { label: 'Share', w: 150 },
            ],
            rows: REASONS.map((r) =>
              r.group !== undefined
                ? r
                : [txt(r[0], { size: 12, color: C.body }), mono(r[1], { size: 12, color: C.strong, weight: 700 }), bar(r[2], r[3] === 'ok' ? C.ok : C.warn)],
            ).concat([
              {
                total: [
                  txt('Recorded this term', { size: 12.5, color: C.body }),
                  mono('1,680', { size: 12.5, color: C.strong, weight: 700 }),
                  txt('1,284 merits &middot; 396 demerits', { size: 11.5, color: C.mid }),
                ],
              },
            ]),
          }),
        )}
        ${section(
          { title: 'By year group', note: 'Term 2' },
          table({
            cols: [
              { label: 'Year group' },
              { label: 'Net', w: 70, align: 'right' },
              { label: 'Share', w: 150 },
            ],
            rows: YEAR_NET.map(([label, v, w]) => [
              txt(label, { size: 12, color: C.body }),
              mono(v, { size: 12, color: C.strong, weight: 700 }),
              bar(w, C.brand),
            ]).concat([
              {
                total: [
                  txt('All six year groups', { size: 12.5, color: C.body }),
                  mono('+888', { size: 12.5, color: C.strong, weight: 700 }),
                  '',
                ],
              },
            ]),
          }),
        )}
      `,
      )}
    `),
)

/* ══════════════════════════════════════════════════════════════════════
   4. /schools/conduct/detention — the register for one session

   What is still owed after today is a column on the register, not a second
   list of the same names: a pupil marked here owes m − n, and a pupil moved to
   Saturday still owes the session today did not take. Six sessions across five
   pupils, totalled at the foot.
   ══════════════════════════════════════════════════════════════════════ */

/** [name, no, year, serving for, session n of m, travel, travel icon, state, at, still to serve] */
const DUE = [
  ['Tadiwa Marange', 'CHS-1288', 'Form 3B', 'Disruption — sent out of Combined Science, 1 Sep', '1 of 2', 'Day', null, 'here', '14:01', '1 more · Fri 11 Sep'],
  ['Rutendo Chikwanda', 'CHS-1180', 'Form 2A', 'Absconding — left the grounds at break, 1 Sep', '1 of 3', 'Day', null, 'here', '13:58', '2 more · 11 and 18 Sep'],
  ['Simba Mafuta', 'CHS-1301', 'Form 4A', 'Fighting — behind the hall, 31 Aug', '2 of 2', 'Boarder', 'bed', 'here', '14:00', null],
  ['Nyasha Zimuto', 'CHS-1240', 'Form 4A', 'Plagiarism — Geography essay, 2 Sep', '1 of 1', 'Boarder', 'bed', 'here', '14:00', null],
  ['Kudzai Nyathi', 'CHS-1233', 'Form 4A', 'Phone — third time this term, 3 Sep', '1 of 1', 'Boarder', 'bed', 'here', '14:03', null],
  ['Tapiwa Dube', 'CHS-1204', 'Form 2A', 'Uniform — no jersey, three days, 3 Sep', '1 of 1', 'Boarder', 'bed', 'here', '14:00', null],
  ['Tanaka Mutasa', 'CHS-1219', 'Form 2A', 'Damage — laboratory stool, 2 Sep', '1 of 1', 'Boarder', 'bed', 'here', '14:02', null],
  ['Ruvimbo Sibanda', 'CHS-1266', 'Form 1B', 'Lateness — four times, 28 Aug', '2 of 3', 'Day', null, 'here', '14:05', '1 more · Fri 11 Sep'],
  ['Rufaro Gwatidzo', 'CHS-1277', 'Form 1B', 'No homework — Maths, twice, 27 Aug', '1 of 1', 'Boarder', 'bed', 'here', '14:00', null],
  ['Panashe Zvobgo', 'CHS-1247', 'Form 3A', 'Disruption — Shona lesson, 28 Aug', '2 of 2', 'Bus R2', 'bus', 'moved', null, '1 more · Sat 12 Sep'],
  ['Anesu Chirwa', 'CHS-1310', 'Form 2B', 'Uniform — wrong shoes, repeatedly, 26 Aug', '1 of 1', 'Bus R2', 'bus', 'moved', null, '1 more · Sat 12 Sep'],
  ['Munashe Hove', 'CHS-1283', 'Form 3A', 'Litter — behind the tuck shop, 3 Sep', '1 of 1', 'Day', null, 'unmarked', null, null],
]

const COMING = [
  ['Fri 11 Sep', '14:00 · Room 12', 'Farai Moyo', '9', 'plain'],
  ['Sat 12 Sep', '08:00 · Room 12', 'Priscilla Nyathi', '2', 'warn'],
  ['Fri 18 Sep', '14:00 · Room 12', 'Not yet supervised', '4', 'bad'],
  ['Fri 25 Sep', '14:00 · Room 12', 'Tendai Sibanda', '1', 'plain'],
]

export const ConductDetention = defineScreen(
  {
    screen: 'ConductDetention',
    route: '/schools/conduct/detention',
    story: 'S-12.1',
    title: 'Detention',
    caption: 'Fri 4 September &middot; 14:00 &middot; Room 12 &middot; Farai Moyo',
    railItem: 'Detention',
    action: { label: 'Take the register', icon: I.fileCheck },
    search: null,
    scope: CAMPUS,
    user: { name: 'Farai Moyo', role: 'English teacher' },
    chips: [
      { label: 'Due here', value: '10' },
      { label: 'Here', value: '9', tone: 'ok' },
      { label: 'Not marked', value: '1', tone: 'warn' },
      { label: 'Moved to Saturday', value: '2', tone: 'warn' },
    ],
    bandActions: [ghostBtn('Print the list', I.print)],
  },
  () =>
    page(`
      ${alert({
        tone: 'warn',
        title: 'The R2 leaves at 14:10 — Panashe Zvobgo and Anesu Chirwa serve Saturday 12 September at 08:00 instead.',
        action: ghostBtn('See the two'),
      })}
      ${section(
        { title: 'Who is due', note: '12 named', controls: rowFlex(
        `${filterSelect('Session', 'Fri 4 Sep · 14:00 · Room 12', { w: 230 })}${filterSelect('Year group', 'Every year group', { w: 160 })}${filterSelect('Serving for', 'Anything', { w: 150 })}<div style="flex: 1"></div>${ghostBtn('Mark everyone here', I.checks)}`,
        { align: 'flex-end' },
      ) },
        table({
          cols: [
            { label: 'Pupil', w: 172 },
            { label: 'Year', w: 58 },
            { label: 'Serving for' },
            { label: 'Session', w: 72 },
            { label: 'Gets home', w: 96 },
            { label: 'Register', w: 186 },
            { label: 'Still to serve', w: 162 },
          ],
          rows: DUE.map(([name, no, year, reason, session, travel, travelIc, state, at, left]) => [
            pupilCell(name, no),
            txt(year, { size: 12, color: C.mid }),
            txt(reason, { size: 12, color: C.mid }),
            mono(session, { size: 11.5, color: session.startsWith('2') || session.startsWith('3') ? C.warn : C.body }),
            `${travelIc ? icon(travelIc === 'bed' ? I.bed : I.bus, { size: 13, stroke: travelIc === 'bus' ? C.orangeFg : C.mid }) : ''}${txt(travel, { size: 11.5, color: travelIc === 'bus' ? C.orangeFg : C.mid })}`,
            state === 'here'
              ? `${badge('Here', 'ok')}${mono(at, { size: 11 })}`
              : state === 'moved'
                ? `${badge('Moved to Saturday', 'warn')}${mono('08:00', { size: 11 })}`
                : `${badge('Not marked', 'warn')}${tinyBtn('Here')}${tinyBtn('Did not turn up')}`,
            left ? txt(left, { size: 11.5, color: C.warn }) : txt('—', { size: 12, color: C.faint }),
          ]).concat([
            {
              total: [
                txt('Still to serve after today', { size: 12.5, color: C.body }),
                '',
                '',
                '',
                '',
                '',
                mono('6 sessions · 5 pupils', { size: 11.5, color: C.strong, weight: 700 }),
              ],
            },
          ]),
        }),
      )}
      ${section(
        { title: 'The coming sessions', note: '11 to 25 September' },
        table({
          cols: [
            { label: 'When', w: 110 },
            { label: 'Where', w: 160 },
            { label: 'Supervised by' },
            { label: 'Named', w: 80, align: 'right' },
            { label: '', w: 190, align: 'right' },
          ],
          rows: COMING.map(([day, where, who, named, tone]) => [
            mono(day, { size: 11.5, color: C.strong, weight: 700 }),
            txt(where, { size: 11.5, color: C.mid }),
            txt(who, { size: 12, color: who === 'Not yet supervised' ? C.bad : C.body }),
            mono(named, { size: 12, color: C.strong, weight: 700 }),
            tone === 'plain' ? '' : badge(tone === 'bad' ? 'Needs a supervisor' : 'Moved here from today', tone),
          ]).concat([
            {
              total: [
                txt('Four sessions', { size: 12.5, color: C.body }),
                '',
                '',
                mono('16', { size: 12.5, color: C.strong, weight: 700 }),
                '',
              ],
            },
          ]),
        }),
      )}
    `),
)

/* ══════════════════════════════════════════════════════════════════════
   5. /schools/conduct/pastoral — who may read this, before anything else

   The visibility rules are data, so they are a table: who or what, against
   what it may read. Staff in one group, the four places a note never reaches
   in the other. Nothing on the artboard argues for the rule.
   ══════════════════════════════════════════════════════════════════════ */

/** [name, role, what they may read, cleared] */
const READERS = [
  ['Rudo Makoni', 'Deputy Head', 'Pastoral team only · Head and pastoral team', true],
  ['Sister Moyo', 'School Nurse — you', 'Pastoral team only · Head and pastoral team', true],
  ['Priscilla Nyathi', 'Head of Year 3', 'Pastoral team only · Year 3 pupils', true],
  ['Elias Chikafu', 'Group Head', 'Nothing · unless named on the note', false],
]

const NEVER = [
  ['The parent portal', I.users],
  ['The report card', I.chart],
  ['A leaving certificate or testimonial', I.graduation],
  ['Any export, spreadsheet or print', I.download],
]

/** [pupil, no, year, author, role, when, note, band, bandTone, referral, review, reviewTone] */
const NOTES = [
  [
    'Nyasha Zimuto', 'CHS-1240', 'Form 4A', 'Sister Moyo', 'School Nurse', '3 Sep',
    'Three visits to the san this week, the same headache each time. Asked whether she could sit the mocks in a quiet room.',
    'Pastoral team only', 'plain', null, '17 Sep', 'plain',
  ],
  [
    'Tadiwa Marange', 'CHS-1288', 'Form 3B', 'Rudo Makoni', 'Deputy Head', '1 Sep',
    'His father&rsquo;s job ended in July. The lateness started the week the fees letter went home.',
    'Head and pastoral team', 'brand', 'Bursar — waiver form', '15 Sep', 'plain',
  ],
  [
    'Tariro Ncube', 'CHS-1292', 'Form 3B', 'Priscilla Nyathi', 'Head of Year 3', '31 Aug',
    'All three of her lates are the R2. She leaves home at 05:40.',
    'Pastoral team only', 'plain', null, 'None needed', 'plain',
  ],
  ['withheld', null, null, null, null, '28 Aug', null, 'Safeguarding — named individuals', 'violet', null, null, null],
  [
    'Kudzai Nyathi', 'CHS-1233', 'Form 4A', 'Rudo Makoni', 'Deputy Head', '24 Aug',
    'Boarding fees are paid by an uncle. Letters go to him, not to the home address; the mother asked for this in person.',
    'Head and pastoral team', 'brand', null, 'None needed', 'plain',
  ],
  ['withheld', null, null, null, null, '19 Aug', null, 'Safeguarding — named individuals', 'violet', null, null, null],
  [
    'Rutendo Chikwanda', 'CHS-1180', 'Form 2A', 'Sister Moyo', 'School Nurse', '18 Aug',
    'Fainted at assembly; had eaten nothing since the day before. Breakfast at the tuck shop arranged with Loveness Chirwa.',
    'Head and pastoral team', 'brand', 'Bursar — hardship', 'Was due 8 Sep', 'warn',
  ],
]

const redactedCells = (when, band, bandTone) => [
  `${icon(I.lock, { size: 13, stroke: C.violetFg })}<span style="font-size: 12px; color: ${C.violetFg}; font-weight: 600">A note you may not read</span>`,
  txt('Not shown', { size: 12, color: C.faint }),
  `<span style="flex: 1; min-width: 0; height: 16px; border-radius: 4px; background: repeating-linear-gradient(135deg, ${C.muted} 0 6px, ${C.hair} 6px 12px); border: 1px solid ${C.borderSubtle}"></span>`,
  badge(band, bandTone),
  mono(when, { size: 11, color: C.subtle }),
  tinyBtn('Ask to see it', 'violet'),
]

export const Pastoral = defineScreen(
  {
    screen: 'Pastoral',
    route: '/schools/conduct/pastoral',
    story: 'S-12.3',
    title: 'Pastoral notes',
    railItem: 'Pastoral notes',
    action: { label: 'Write a note', icon: I.note },
    search: 'Search the notes you may read',
    scope: CAMPUS,
    user: { name: 'Sister Moyo', role: 'School Nurse' },
    chips: [
      { label: 'You may read', value: '14' },
      { label: 'Withheld from you', value: '2', tone: 'brand' },
      { label: 'Review overdue', value: '1', tone: 'warn' },
      { label: 'Referred on', value: '4' },
    ],
    bandActions: [ghostBtn('Who may read what', I.shield)],
  },
  () =>
    page(`
      ${section(
        { title: 'Who may read a pastoral note', note: '3 of 4 cleared · 4 never' },
        table({
          cols: [
            { label: 'Who or where', w: 320 },
            { label: 'May read' },
            { label: '', w: 130, align: 'right' },
          ],
          rows: [
            { group: 'Staff at Borrowdale · 4 of 148' },
            ...READERS.map(([name, role, reads, cleared]) => [
              `${avatar(ini(name), { size: 22, bg: cleared ? C.violetBg : C.muted, fg: cleared ? C.violetFg : C.subtle })}<span style="min-width: 0"><span style="display: block; font-size: 12px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${txt(role, { size: 11, color: C.subtle })}</span>`,
              txt(reads, { size: 11.5, color: cleared ? C.mid : C.faint }),
              cleared ? badge('Cleared', 'violet') : badge('Not cleared', 'plain'),
            ]),
            { group: 'Never' },
            ...NEVER.map(([label, ic]) => [
              `${icon(ic, { size: 14, stroke: C.faint })}<span style="font-size: 12px; color: ${C.body}">${esc(label)}</span>`,
              txt('Nothing', { size: 11.5, color: C.faint }),
              badge('Never', 'bad'),
            ]),
          ],
        }),
      )}
      ${section(
        { title: 'Notes', note: '5 of 14 · 2 withheld', controls: rowFlex(
        `${filterSelect('Year group', 'Every year group', { w: 160 })}${filterSelect('Visibility', 'Everything you may read', { w: 190 })}${filterSelect('Review', 'Any review date', { w: 160 })}<div style="flex: 1"></div>${searchField('Search the notes you may read', { w: 250 })}`,
        { align: 'flex-end' },
      ) },
        table({
          cols: [
            { label: 'Pupil', w: 176 },
            { label: 'Written by', w: 124 },
            { label: 'The note' },
            { label: 'Who may read it', w: 196 },
            { label: 'Review', w: 92 },
            { label: '', w: 96, align: 'right' },
          ],
          rows: NOTES.map((n) => {
            const [pupil, no, year, author, role, when, body, band, bandTone, referral, review, reviewTone] = n
            if (pupil === 'withheld') return redactedCells(when, band, bandTone)
            return [
              pupilCell(pupil, `${no} · ${year}`),
              `<span style="min-width: 0"><span style="display: block; font-size: 12px; color: ${C.body}">${esc(author)}</span>${mono(when, { size: 10.5 })}</span>`,
              `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12px; color: ${C.body}; line-height: 1.5">${body}</span>${referral ? `<span style="display: inline-flex; margin-top: 4px">${badge(`Referred: ${referral}`, 'ok')}</span>` : ''}</span>`,
              badge(band, bandTone),
              review === 'None needed' ? txt(review, { size: 11.5, color: C.faint }) : mono(review, { size: 11, color: reviewTone === 'warn' ? C.warn : C.body }),
              tinyBtn('Open'),
            ]
          }),
        }),
      )}
    `),
)
