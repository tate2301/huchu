/**
 * Expansion foundation sheet — the rules the twenty-four artboards on the five
 * pages beside it are held to, plus the two screens that demonstrate the shell
 * this canvas corrects: where the campus in scope lives, and what a second
 * navigation surface is allowed to be.
 *
 * Called by build-expansion.mjs.
 */
import {
  C, I, esc, icon, page, grid, card, table, stat, listRow, badge, mono, txt,
  alert, ghostBtn, solidBtn, sectionLabel, field, pickerField, section,
  properties, defineScreen, wrap, verticalRail, NAV,
} from '../lib/expansion-kit.mjs'

/* ── the document sheet ─────────────────────────────────────────────── */

const num = (n, h) =>
  `<div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; background: ${C.strong}; color: #fff; font-size: 11px; font-weight: 600">${n}</span>
      <h2 style="margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.01em; color: ${C.strong}">${esc(h)}</h2>
    </div>`

const lede = (t) =>
  `<p style="margin: 0 0 16px 30px; font-size: 12.5px; color: ${C.mid}; max-width: 900px; line-height: 1.6">${t}</p>`

const body = (t) =>
  `<p style="margin: 0 0 10px; font-size: 12.5px; color: ${C.body}; line-height: 1.65">${t}</p>`

const sheetCard = (title, children) =>
  `<div style="border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}; padding: 15px 17px">
      <div style="font-size: 12.5px; font-weight: 600; color: ${C.strong}; margin-bottom: 8px">${esc(title)}</div>
      ${children}
    </div>`

/* ── §1: the shell, before and after, drawn to a third scale ───────── */

const col = (w, label, sub, tone) => {
  const fill = { nav: C.brandSoft, dead: C.badBg, live: C.surface }[tone]
  const line = { nav: C.border, dead: C.badBd, live: C.border }[tone]
  return `<div style="width: ${Math.round(w / 3)}px; flex-shrink: 0; height: 128px; background: ${fill}; border: 1px solid ${line}; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; text-align: center; padding: 0 4px">
      <span style="font-size: 11px; font-weight: 600; color: ${tone === 'dead' ? C.bad : C.strong}">${esc(label)}</span>
      <span class="mono" style="font-size: 10px; color: ${C.subtle}">${esc(sub)}</span>
    </div>`
}

const shellDiagram = () =>
  `<div style="display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap">
    <div>
      <div style="font-size: 11px; font-weight: 600; color: ${C.bad}; margin-bottom: 7px">The module canvas today &mdash; two sidebars</div>
      <div style="display: flex; gap: 4px">
        ${col(280, 'Workspace sidebar', '280px', 'nav')}
        ${col(200, 'Module rail', '200px', 'dead')}
        ${col(1120, 'Content', '1120px', 'live')}
      </div>
    </div>
    <div>
      <div style="font-size: 11px; font-weight: 600; color: ${C.ok}; margin-bottom: 7px">This canvas &mdash; one</div>
      <div style="display: flex; gap: 4px">
        ${col(248, 'Sidebar', '248px', 'nav')}
        ${col(1352, 'Content', '1352px', 'live')}
      </div>
    </div>
  </div>`

/* ── §2: the sidebar, drawn open ───────────────────────────────────────
   Every group expanded, which is not how it ships — it is how a reader of this
   sheet needs to see it. Shipped, one group is open and the rest are shut.
 */
const navPreview = () => {
  const rows = NAV.map((s) => {
    if (s.rule) return `<div style="height: 1px; background: ${C.border}; margin: 8px 6px 5px"></div>`
    const items = s.items
      .map(([label, glyph, isNew, kids]) => {
        const row = `<div style="display: flex; align-items: center; gap: 7px; height: 21px; padding: 0 6px"><span style="flex: 1; font-size: 11.5px; font-weight: ${isNew ? 600 : 400}; color: ${isNew ? C.brandStrong : C.mid}">${esc(label)}</span>${isNew ? `<span style="width: 7px; height: 7px; border-radius: 999px; border: 1.5px solid ${C.brand}; opacity: .5"></span>` : ''}</div>`
        if (!kids) return row
        return (
          row +
          `<div style="margin-left: 14px; padding-left: 7px; border-left: 1px solid ${C.borderSubtle}">${kids
            .map(
              ([k]) =>
                `<div style="height: 21px; display: flex; align-items: center; padding: 0 6px; font-size: 11.5px; color: ${C.mid}">${esc(k)}</div>`,
            )
            .join('')}</div>`
        )
      })
      .join('')
    if (!s.group) return items
    return `<div style="height: 22px; display: flex; align-items: center; padding: 6px 6px 0; font-size: 9.5px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: ${C.subtle}">${esc(s.group)}</div><div style="margin-left: 6px; padding-left: 7px; border-left: 1px solid ${C.borderSubtle}">${items}</div>`
  }).join('')
  return `<div style="width: 248px; flex-shrink: 0; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.canvas}; padding: 8px">${rows}</div>`
}

/* ── §4: the workspace header in its three states ──────────────────── */

const headerMock = (org, campus) => {
  const all = campus === 'All campuses'
  return `<div style="height: 48px; display: flex; align-items: center; gap: 9px; padding: 0 10px 0 12px; border-bottom: 1px solid ${C.border}; background: ${C.canvas}">
      <div style="width: 26px; height: 26px; border-radius: 7px; background: ${C.strong}; flex-shrink: 0; display: flex; align-items: center; justify-content: center">${icon(I.graduation, { size: 15, stroke: '#fff' })}</div>
      <div style="flex: 1; min-width: 0">
        <div style="font-size: 13px; font-weight: 600; color: ${C.strong}; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(org)}</div>
        ${campus ? `<div style="display: flex; align-items: center; gap: 4px; margin-top: 1px"><span style="width: 5px; height: 5px; border-radius: 999px; background: ${all ? C.brand : C.ok}; flex-shrink: 0"></span><span style="font-size: 10.5px; font-weight: 600; color: ${all ? C.brandStrong : C.mid}">${esc(campus)}</span></div>` : ''}
      </div>
      ${icon(I.chevD, { size: 13, stroke: C.subtle })}
    </div>`
}

const scopeCompare = () =>
  `<div style="display: flex; gap: 16px; align-items: flex-start">
    ${[
      ['One school, as it ships today', 'Chishawasha High', null, 'Nothing changes. This is every tenant on the product now, and the S-11.1 backfill gives each of them one campus without telling them so.'],
      ['A group, one campus in scope', 'Chishawasha Trust', 'Borrowdale campus', 'The green mark says the scope is narrowed. Every list, every total and every action below it is Borrowdale only.'],
      ['A group, all campuses', 'Chishawasha Trust', 'All campuses', 'Brand rather than green, because this is a destination somebody chose &mdash; not a filter they forgot to set.'],
    ]
      .map(
        ([label, org, campus, note]) => `
      <div style="flex: 1; min-width: 0">
        <div style="font-size: 11px; font-weight: 600; color: ${C.mid}; margin-bottom: 7px">${esc(label)}</div>
        <div style="border: 1px solid ${C.border}; border-radius: 10px; overflow: hidden; background: ${C.canvas}">${headerMock(org, campus)}</div>
        <div style="font-size: 11.5px; color: ${C.mid}; margin-top: 7px; line-height: 1.55">${note}</div>
      </div>`,
      )
      .join('')}
  </div>`


/* ── §3: the composition law ───────────────────────────────────────────
   The dialog drawn as a specimen rather than over a page, because the point
   being made is what a form looks like when it is not on the page.
 */
const dialogSpecimen = () =>
  `<div style="width: 420px; flex-shrink: 0; border-radius: 12px; background: ${C.surface}; border: 1px solid ${C.border}; box-shadow: 0 24px 64px -12px rgba(42,38,34,.22), 0 3px 10px rgba(42,38,34,.07); overflow: hidden">
      <div style="height: 3px; background: ${C.brand}"></div>
      <div style="padding: 15px 17px 12px"><div style="font-size: 14px; font-weight: 600; color: ${C.strong}">Move to Marondera</div></div>
      <div style="padding: 0 17px 14px; display: flex; flex-direction: column; gap: 11px">
        ${pickerField('Destination campus', 'Marondera campus', { required: true, hint: 'Secondary, boarding &middot; 514 pupils &middot; 24 beds free' })}
        ${field('Effective date', '21 September 2026', { required: true })}
        ${pickerField('Class at Marondera', 'Form 2B &middot; 31 pupils', { required: true })}
        ${pickerField('Bed at Marondera', 'Pick a bed', { required: true, placeholder: true, hint: 'Nyangani House &middot; 3 free in Room 07' })}
        ${field('Reason', 'The family has moved to Marondera')}
      </div>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 11px 17px; border-top: 1px solid ${C.borderSubtle}; background: ${C.canvas}">${ghostBtn('Cancel')}${solidBtn('Move to Marondera', I.arrowRight)}</div>
    </div>`

const RULES = [
  [
    'Cards are spent, not stamped',
    'A border, a fill and a radius each say &ldquo;separate object&rdquo;, and three of them on every block flattens the hierarchy they were meant to build. A heading on a hairline says it for less. A card is for the one thing that genuinely floats.',
  ],
  [
    'A heading is a heading',
    'No explanatory line after it. What a section is for belongs in the canvas notes beside the artboard, never on it.',
  ],
  [
    'A row is its data',
    'No sentence under a list item. If it matters it is a column; if it is not worth a column it is not worth the row.',
  ],
  [
    'Forms live in dialogs',
    'The page carries the state. Pressing a value opens the editor. A form parked in a column beside the thing it changes makes the reader hold both.',
  ],
  [
    'The design does not talk to the reader',
    '&ldquo;Nothing is written until you press Move&rdquo; is the designer explaining themselves. Refusals and errors stay &mdash; they say what happened and what to do.',
  ],
  [
    'Group by the question, not by the component',
    'What moves, what stays and what it comes to are one question asked about twelve things. One table, two group headers, one total &mdash; not two lists and a third box holding the arithmetic.',
  ],
]

export const ExpansionMain = () => {
  const inner = `
<div style="width: 1180px; min-height: 2460px; padding: 36px 40px 44px; background: ${C.canvas}">

  <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid ${C.strong}">
    <div style="max-width: 760px">
      <div style="font-size: 11px; font-weight: 600; letter-spacing: .11em; text-transform: uppercase; color: ${C.mid}; margin-bottom: 8px">Corelith Campus &middot; Expansion canvas &middot; Sheet 1</div>
      <h1 style="margin: 0 0 10px; font-size: 34px; line-height: 1.1; letter-spacing: -.021em; font-weight: 600; color: ${C.strong}">One sidebar, and twenty-four screens behind it</h1>
      <p style="margin: 0; font-size: 14px; line-height: 1.55; color: ${C.mid}; text-wrap: pretty">Phases 2 and 3 of the expansion plan propose five new areas of the campus product. Drawing them made the shell&rsquo;s own problem obvious first: the module puts two sidebars in front of every screen, and the platform&rsquo;s layout rules allow one.</p>
    </div>
    <div style="flex-shrink: 0; text-align: right; font-size: 11px; line-height: 1.7; color: ${C.subtle}">
      <div style="color: ${C.mid}; font-weight: 600">Navigation columns</div>
      <div class="mono" style="font-size: 30px; font-weight: 600; letter-spacing: -.02em; line-height: 1.15"><span style="color:${C.bad}">2</span><span style="font-size:19px;color:${C.faint}">&rarr;</span><span style="color:${C.ok}">1</span></div>
      <div>and <span class="mono">+232px</span> of content</div>
    </div>
  </div>

  <div style="margin-top: 30px">
    ${num(1, 'One sidebar, not two')}
    ${lede('The module canvas draws a 280px workspace sidebar, then a 200px module rail, then the page. That is two navigation columns before any content, and the platform has already written down that it is wrong.')}
    <div style="margin-left: 30px; display: flex; flex-direction: column; gap: 16px">
      ${shellDiagram()}
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start">
        ${sheetCard(
          'What the rules already say',
          `${body('<span class="mono">pr-71-reference-design-system.md</span> splits the shell into a left navigation rail, a main workspace and an optional right detail rail. Three regions, one of them navigation.')}
           ${body('<span class="mono">platform-ux-playbook.md</span> does describe a left vertical tab rail &mdash; for a multi-table context <b>inside</b> a page, where only the active panel may render a table. It is not a second navigation column, and using it as one borrows a rule from where it does not apply.')}`,
        )}
        ${sheetCard(
          'Where a second surface is genuinely needed',
          `${body('It is a <b>vertical rail</b>: 56px, icons, no labels. Never a second labelled sidebar.')}
           ${body('Nothing on this canvas needs one for navigation. The artboard beside this sheet draws the one real case &mdash; the fee ledger&rsquo;s six segments &mdash; so the rule is a drawing rather than a sentence to be taken on trust.')}
           ${body('The 200px the rail gives back is not empty space. It is most of a table column, on every screen in the module.')}`,
        )}
      </div>
    </div>
  </div>

  <div style="margin-top: 32px">
    ${num(2, 'So the rail becomes groups in the sidebar')}
    ${lede('Campus work leads, grouped the way a school is organised; the rest of the platform follows after a rule. Groups collapse &mdash; the one holding the page you are on is open, the rest are shut &mdash; which is what keeps forty-one destinations inside one column. Drawn here with everything open, which is not how it ships.')}
    <div style="display: flex; gap: 20px; align-items: flex-start; margin-left: 30px">
      ${navPreview()}
      <div style="flex: 1; min-width: 0">
        ${body('<b>The words did not change; the grouping did.</b> Every campus label is the string <span class="mono">lib/navigation.ts</span> already uses. A canvas is not allowed to rename a shipped destination quietly, so it has not.')}
        ${sheetCard(
          'Three groups moved, and each move says something',
          `${body('<b>People became Classroom.</b> Guardians left for Students, where they belong to a pupil. What is left is who stands in front of a class, whether they are there, and who covers when they are not.')}
           ${body('<b>Boarding became Welfare, and Pastoral notes joined it.</b> A pastoral note is not a discipline record. Filing it under Conduct would have told every person who opened the menu that it was.')}
           ${body('<b>Public exams folded into Results.</b> A head looking for November&rsquo;s grades does not first decide whether they are internal or public.')}`,
        )}
        ${sheetCard(
          'Academic setup and Portals sit under Management',
          body('Which is where the routes already are: classes, subjects, years and identity all live under <span class="mono">/management/master-data/schools/</span> today. Setup is not daily work and should not hold a group in the sidebar. Opening it lands on a settings shell with its own left settings nav &mdash; the pattern the playbook names for exactly this.'),
        )}
        ${body('<b>A hollow ring marks a destination that does not exist yet.</b> Said once, here; no artboard repeats it. When a row ships, the ring comes off in one place.')}
      </div>
    </div>
  </div>

  <div style="margin-top: 32px">
    ${num(3, 'How a page is composed')}
    ${lede('Six rules, and they cost most screens a column. The worked example is <span class="mono">Move campus</span>: it carried two lists of prose, a form and a third box holding the arithmetic, in two columns. It now carries five properties, one refusal and one table.')}
    <div style="display: flex; gap: 20px; align-items: flex-start; margin-left: 30px">
      <div style="flex: 1; min-width: 0">
        ${table({
          cols: [{ label: 'Rule', w: 250 }, { label: 'What it means' }],
          rows: RULES.map(([r, w]) => [
            txt(r, { size: 12.5, weight: 600, color: C.strong }),
            txt(w, { size: 12, color: C.mid }),
          ]),
        })}
      </div>
      ${dialogSpecimen()}
    </div>
  </div>

  <div style="margin-top: 32px">
    ${num(4, 'What is behind those groups')}
    ${lede('Five areas, each traceable to a row in <span class="mono">docs/expansion-plan/corelith-campus-expansion-plan.md</span>. Two are debt &mdash; sold in a band or an add-on today and not built &mdash; and three are new capability that needs a packaging decision before a line is written.')}
    <div style="margin-left: 30px">
      ${table({
        cols: [
          { label: 'Area', w: 190 },
          { label: 'Stories', w: 130 },
          { label: 'Screens', w: 74, align: 'right' },
          { label: 'Why it exists' },
        ],
        rows: [
          [
            txt('Group and campuses', { weight: 600, color: C.strong }),
            mono('S-11.1 – S-11.7'),
            mono('6'),
            txt('<b>Debt.</b> The GROUP band sells multi-campus consolidation. No <span class="mono">School*</span> model carries a campus.', { color: C.mid }),
          ],
          [
            txt('Conduct and pastoral', { weight: 600, color: C.strong }),
            mono('S-12.1 – S-12.3'),
            mono('5'),
            txt('Unparks <span class="mono">S-P.1</span>. Every school keeps a conduct record; recommended into STANDARD at no extra price.', { color: C.mid }),
          ],
          [
            txt('Public exams', { weight: 600, color: C.strong }),
            mono('S-13.1 – S-13.2'),
            mono('5'),
            txt('The one thing every Zimbabwean secondary school does that the pack cannot. Add-on, $99 a term.', { color: C.mid }),
          ],
          [
            txt('Leavers and alumni', { weight: 600, color: C.strong }),
            mono('S-13.4 – S-13.5'),
            mono('4'),
            txt('<span class="mono">S-1.5</span> already graduates a pupil. Graduating currently leads nowhere.', { color: C.mid }),
          ],
          [
            txt('Campus operations', { weight: 600, color: C.strong }),
            mono('S-14.1, S-14.3'),
            mono('4'),
            txt('<b>Debt.</b> The fiscalisation add-on promises receipts for &ldquo;tuck shop and uniform sales&rdquo;. Neither exists.', { color: C.mid }),
          ],
        ],
      })}
    </div>
  </div>

  <div style="margin-top: 32px">
    ${num(5, 'Where the campus in scope lives')}
    ${lede('In the sidebar header, under the group name. Not the app bar, not the band. The app bar carries the page&rsquo;s only name (canvas law &sect;1); the band carries the state that changes on this page (&sect;2). The campus in scope is neither: it belongs to the whole workspace, it survives navigation, and the header has carried a caret beside the school&rsquo;s name since the first artboard.')}
    <div style="margin-left: 30px">${scopeCompare()}</div>
  </div>

  <div style="margin-top: 32px">
    ${num(6, 'Campus is navigation, not a filter')}
    ${lede('The rule <span class="mono">S-4.6</span> set for year groups, for the same reason.')}
    <div style="margin-left: 30px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start">
      ${sheetCard(
        'A campus’s list is reached through the campus',
        body('<span class="mono">/schools/campuses/[campusId]/students</span>, not <span class="mono">/schools/students?campus=…</span>. A bursar at Borrowdale has one campus, lands in it, and never sees another campus&rsquo;s money by accident &mdash; not because a filter defaulted correctly, but because there was no other campus in the route.'),
      )}
      ${sheetCard(
        '“All campuses” is a destination, not a default',
        body('It is a row somebody chose, drawn in brand rather than green. That difference matters on the day a debt is written off: &ldquo;I thought I was in Borrowdale&rdquo; has to be impossible to say.'),
      )}
    </div>
  </div>

  <div style="margin-top: 32px">
    ${num(7, 'The contract is emitted, not maintained')}
    ${lede('The module canvas keeps <span class="mono">checklist/&lt;Screen&gt;.json</span> as a second artefact beside the drawing. This canvas emits it.')}
    <div style="margin-left: 30px">
      ${body('Every table column, card title, stat, filter, band chip and button is filed by the primitive that draws it, so the contract cannot drift from the artboard. Adding a column to a drawing adds it to the contract in the same keystroke.')}
      ${alert({
        tone: 'brand',
        title: 'Every screen on this canvas reports under NO PAGE — and should',
        body: 'Run <span class="mono">node scripts/campus-conformance.mjs</span>. &ldquo;The canvas draws it, nothing renders it&rdquo; is the right status for a proposal, and that list is the build queue. It shrinks as the work lands, because building the route is what removes the row.',
      })}
    </div>
  </div>

</div>`
  return wrap(inner, 1180, 2460)
}

/* ── the campus selector, open ─────────────────────────────────────── */

const campusRow = (name, sub, count, active, last) =>
  listRow(
    `${icon(active ? I.check : I.building, { size: 14, stroke: active ? C.brandStrong : C.faint })}<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: ${active ? 600 : 500}; color: ${active ? C.brandStrong : C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>${mono(count, { size: 11.5, color: C.mid, weight: 600 })}`,
    { tone: active ? 'sel' : undefined, last },
  )

const scopePopover = () =>
  `<div style="position: absolute; left: 12px; top: 52px; z-index: 70; width: 300px; border-radius: 10px; background: ${C.surface}; border: 1px solid ${C.border}; box-shadow: 0 16px 40px -8px rgba(42,38,34,.24), 0 3px 8px rgba(42,38,34,.08); overflow: hidden">
    <div style="padding: 10px 13px 8px; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('Chishawasha Trust')}<div style="font-size: 11.5px; color: ${C.mid}; margin-top: 3px; line-height: 1.45">Four campuses, 1,842 pupils. You may act on all four.</div></div>
    ${campusRow('All campuses', 'Consolidated — read and report', '1,842', true, false)}
    ${campusRow('Borrowdale campus', 'BOR · Primary and secondary', '842', false, false)}
    ${campusRow('Marondera campus', 'MAR · Secondary, boarding', '514', false, false)}
    ${campusRow('Ruwa campus', 'RUW · Primary', '331', false, false)}
    ${campusRow('Norton campus', 'NOR · Primary, opened Term 1', '155', false, true)}
    <div style="padding: 9px 13px; border-top: 1px solid ${C.borderSubtle}; background: ${C.canvas}; display: flex; align-items: center; gap: 8px">${ghostBtn('Manage campuses', I.settings)}<div style="flex: 1"></div>${mono('⌘⇧C', { size: 10.5, color: C.faint })}</div>
  </div>
  <div style="position: absolute; inset: 0; z-index: 65; background: rgba(22,24,29,.16)"></div>`

export const CampusScope = defineScreen(
  {
    screen: 'CampusScope',
    route: null,
    story: 'S-11.3',
    title: 'All campuses',
    caption: 'Term 2 &middot; 1,842 pupils',
    railItem: 'All campuses',
    search: 'Search across four campuses',
    scope: { group: 'Chishawasha Trust', campus: 'All campuses' },
    user: { name: 'Elias Chikafu', role: 'Group Head' },
    chips: [
      { label: 'Campuses', value: '4' },
      { label: 'In scope', value: 'All', tone: 'brand' },
    ],
    overlay: scopePopover,
  },
  () =>
    page(`
      ${grid(
        4,
        `
        ${stat({ label: 'Pupils', value: '1,842' })}
        ${stat({ label: 'Collected this term', value: '68%', tone: 'ok' })}
        ${stat({ label: 'Arrears over 60 days', value: '$41,204', tone: 'bad' })}
        ${stat({ label: 'Registers not taken', value: '3', tone: 'warn', note: 'Marondera &middot; this morning' })}
      `,
      )}
      ${section(
        { title: 'What the selector changes' },
        table({
          cols: [
            { label: 'Surface', w: 280 },
            { label: 'One campus in scope' },
            { label: 'All campuses in scope' },
          ],
          rows: [
            [
              txt('Lists and records', { weight: 600, color: C.strong }),
              txt('That campus only.', { color: C.mid }),
              txt('Every campus, with a campus column that cannot be sorted away.', { color: C.mid }),
            ],
            [
              txt('Totals and reports', { weight: 600, color: C.strong }),
              txt('That campus&rsquo;s figures.', { color: C.mid }),
              txt('Consolidated, with the per-campus split one click down.', { color: C.mid }),
            ],
            [
              txt('Creating anything', { weight: 600, color: C.strong }),
              txt('Lands on that campus.', { color: C.mid }),
              `${badge('Refused', 'bad')} ${txt('A record has to belong to a campus. Pick one first.', { color: C.mid })}`,
            ],
            [
              txt('Money moving', { weight: 600, color: C.strong }),
              txt('Allowed, audited against that campus.', { color: C.mid }),
              `${badge('Refused', 'bad')} ${txt('Read and report only. A write-off happens where the debt is.', { color: C.mid })}`,
            ],
          ],
        }),
      )}
    `),
)

/* ── the shell law, drawn ──────────────────────────────────────────────
   The only artboard on this canvas that uses verticalRail(), because it is the
   one arguing about it. The fee ledger is the real case: one component behind
   six segments, one table at a time.
 */
const LEDGER_RAIL = [
  ['Invoices', 'Receipt'],
  ['Receipts', 'CurrencyDollar'],
  ['Credit on account', 'Wallet'],
  ['Refunds', 'ArrowsClockwise'],
  ['Waivers', 'Scales'],
  ['Fee structures', 'Rows'],
]

export const ShellLaw = defineScreen(
  {
    screen: 'ShellLaw',
    route: null,
    story: 'S-11.3',
    title: 'Ledger',
    caption: 'Term 2 &middot; invoices',
    railItem: 'Ledger and structures',
    search: 'Search invoices',
    scope: { group: 'Chishawasha Trust', campus: 'Borrowdale campus' },
    chips: [
      { label: 'Outstanding', value: '$41,204', tone: 'bad' },
      { label: 'Issued this term', value: '842' },
    ],
    bandActions: [ghostBtn('Export', I.download)],
  },
  () =>
    `<div style="display: flex; align-items: stretch; min-height: 908px">
      ${verticalRail(LEDGER_RAIL, 'Invoices')}
      <div style="flex: 1; min-width: 0">
        ${page(`
          ${section(
            { title: 'When a second navigation surface is allowed' },
            table({
              cols: [
                { label: 'Surface', w: 190 },
                { label: 'What it is for' },
                { label: 'Width', w: 80, align: 'right' },
                { label: 'How many', w: 150 },
              ],
              rows: [
                [
                  txt('Sidebar', { weight: 600, color: C.strong }),
                  txt('Moving between destinations. Groups collapse; one is open.', { color: C.mid }),
                  mono('248px'),
                  txt('One, per window', { color: C.ok, weight: 600 }),
                ],
                [
                  txt('Vertical rail', { weight: 600, color: C.strong }),
                  txt('Choosing which table a page shows, where a page has several. Icons only &mdash; naming them is the page&rsquo;s job, not the rail&rsquo;s.', { color: C.mid }),
                  mono('56px'),
                  txt('One, inside a page', { color: C.mid }),
                ],
                [
                  txt('A second sidebar', { weight: 600, color: C.strong }),
                  txt('Nothing. Two labelled columns make a reader decide twice which list they are navigating with.', { color: C.mid }),
                  mono('—'),
                  badge('Never', 'bad'),
                ],
              ],
            }),
          )}
          ${alert({
            tone: 'plain',
            title: 'The fee ledger is one component behind six segments',
            body: 'A multi-table context uses a left vertical tab rail, and only the active panel renders a table.',
          })}
        `)}
      </div>
    </div>`,
)
