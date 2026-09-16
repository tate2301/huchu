/**
 * Campus expansion canvas — the kit the proposed screens are drawn with.
 *
 * The shipped module canvas is drawn with `lib/kit.mjs` and that file does not
 * change: it is the resolved state of what is built. This kit re-exports every
 * content primitive from it unchanged — so an expansion artboard and a shipped
 * artboard draw a table, a card, a stat and a band identically — and replaces
 * exactly one thing: the shell.
 *
 * WHY THE SHELL IS REPLACED
 *
 * The module canvas draws a 280px workspace sidebar AND a 200px module rail,
 * side by side, before the content starts. That is two sidebars, and the
 * platform's own layout rules do not allow it:
 *
 *   docs/ux/pr-71-reference-design-system.md — "Split the shell into: left
 *   navigation rail, main workspace, optional right detail rail."
 *   docs/ux/platform-ux-playbook.md — a left vertical tab rail is for
 *   MULTI-TABLE CONTEXTS INSIDE a page, not a second navigation column.
 *
 * So the second sidebar is folded into the first as collapsible groups. Where a
 * screen genuinely needs a second navigation surface, the rule is a vertical
 * rail — icon-width, no labels — never a second labelled sidebar. Nothing on
 * this canvas needs one.
 *
 * That buys 232px of content width on every screen, which is most of a table
 * column, and it removes the question a reader of the old shell always had to
 * answer twice: which of these two lists am I navigating with?
 *
 * WHERE THE CAMPUS SELECTOR LIVES
 *
 * In the sidebar header, under the group's name. The app bar carries the page's
 * only name (canvas law §1) and the band carries the page's state (§2). The
 * campus in scope is neither: it belongs to the whole workspace, it survives
 * navigation, and the sidebar header has carried a caret beside the school's
 * name since the first artboard. A group gets a second line under that name. A
 * single-campus school — every tenant today — sees what it sees now.
 */
import * as K from './kit.mjs'
import { ph } from './icons.mjs'

/* Every content primitive, unchanged. The instrumented six are re-exported
   further down with the same signatures. The module SHELL is deliberately not
   re-exported: `sidebar`, `rail` and `adminArtboard` draw the two-sidebar shell
   this canvas exists to replace. */
export {
  C, I, esc, icon, page, grid, stack, rowFlex, listRow, dot, mono, txt, badge,
  avatar, alert, emptyState, skel, modal, field, pickerField, sectionLabel,
  TONES, band, bandChip, appBar, primaryBtn, ghostBtn, solidBtn, dangerBtn,
  wrap, bareArtboard, HELMET,
} from './kit.mjs'

const { C, esc } = K

/* ── the collector ──────────────────────────────────────────────────────
   Each drawing primitive that carries a contract — a column, a card title, a
   stat, a filter, a button — files what it drew here while a screen is being
   rendered. build-expansion.mjs reads it back and writes the checklist.
 */

/** screen name -> the spec collected while it was drawn */
export const SPECS = new Map()

let CUR = null

const file = (bucket, value) => {
  if (!CUR || value == null) return
  const v = String(value).trim()
  if (v && !CUR[bucket].includes(v)) CUR[bucket].push(v)
}

/* ── instrumented primitives ────────────────────────────────────────────
   Same signatures as the module kit's. They record, then delegate.
 */

const colStyle = (c = {}) =>
  `${c.w ? `width: ${c.w}px; flex-shrink: 0;` : 'flex: 1; min-width: 0;'} ${c.align === 'right' ? 'justify-content: flex-end; text-align: right;' : c.align === 'center' ? 'justify-content: center; text-align: center;' : ''}`

/**
 * A data table.
 *
 * Same call shape as the module kit's, with two additions that let one table do
 * what three cards used to: a row may be `{ group: 'LABEL' }`, drawn as a grey
 * group header, or `{ total: [cells] }`, drawn as a summary row ruled off from
 * the body. Semantically related things belong in one structure, and a total
 * belongs to the rows it totals.
 *
 * cols: [{label, w?, align?}], rows: [[cell,…] | {group} | {total}]
 */
export function table({ cols, rows, zebra = false }) {
  for (const c of cols) file('columns', c.label)

  const head = `<div style="display: flex; align-items: center; gap: 10px; height: var(--head-h); padding: 0 13px; border-bottom: 1px solid ${C.border}">${cols
    .map(
      (c) =>
        `<span style="font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: ${C.subtle}; ${colStyle(c)}">${esc(c.label)}</span>`,
    )
    .join('')}</div>`

  let i = 0
  const body = rows
    .map((r) => {
      if (r && r.group !== undefined) {
        file('cards', r.group)
        return `<div style="display: flex; align-items: center; height: 26px; padding: 0 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.border}"><span style="font-size: 10px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: ${C.subtle}">${esc(r.group)}</span></div>`
      }
      const cells = r && r.total !== undefined ? r.total : r
      const isTotal = Boolean(r && r.total !== undefined)
      const bg = isTotal ? C.canvas : zebra && i++ % 2 ? C.canvas : 'transparent'
      return `<div class="row" style="display: flex; align-items: center; gap: 10px; min-height: var(--row-h); padding: 0 13px; border-bottom: 1px solid ${C.hair}; ${isTotal ? `border-top: 1px solid ${C.borderStrong}; font-weight: 600;` : ''} background: ${bg}">${cells
        .map(
          (cell, j) =>
            `<span style="display: flex; align-items: center; gap: 7px; ${colStyle(cols[j])}">${cell}</span>`,
        )
        .join('')}</div>`
    })
    .join('')
  return head + body
}

/**
 * A section: a heading on a hairline, and its content below. No box.
 *
 * The default way to separate two things on this canvas. A card says "separate
 * object" with a border, a fill and a radius all at once; spend that on the one
 * thing that genuinely floats, and let a rule and some space do the rest.
 * `note` carries state — a count, a date — never an explanation.
 *
 * `controls` takes the tabs/search/filters row, so it renders BETWEEN the
 * heading and the table rather than above the heading. Canvas law §4: the
 * control row belongs to the table it controls and sits with it, and a heading
 * dropped between the two is the same split the rule was written against.
 */
export function section({ title, note, actions = [], controls }, children) {
  file('cards', title)
  return `<div style="display: flex; flex-direction: column; gap: 9px">
      <div style="display: flex; align-items: center; gap: 9px; padding-bottom: 7px; border-bottom: 1px solid ${C.border}">
        <h2 style="margin: 0; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(title)}</h2>
        ${note ? `<span class="mono" style="font-size: 11px; color: ${C.subtle}">${note}</span>` : ''}
        <div style="flex: 1"></div>${actions.join('')}
      </div>
      ${controls ?? ''}
      ${children}
    </div>`
}

/**
 * A property block — label beside value, hairline between, no box.
 *
 * The playbook's rule for record pages: properties live at the top and the
 * editor is opened by pressing the VALUE, not by a verb parked beside it. So a
 * value reads as pressable and an unset one says what it wants.
 *
 * rows: [[label, value, {unset, tone, mono}?], …]
 */
export function properties(rows, { cols = 1, labelW = 150 } = {}) {
  const cell = ([label, value, opt = {}]) => {
    const fg = opt.unset ? C.bad : opt.tone === 'muted' ? C.mid : C.body
    return `<div style="display: flex; align-items: baseline; gap: 12px; min-height: 30px; padding: 5px 0; border-bottom: 1px solid ${C.hair}">
        <span style="width: ${labelW}px; flex-shrink: 0; font-size: 11.5px; color: ${C.subtle}; line-height: 1.4">${esc(label)}</span>
        <span style="flex: 1; min-width: 0; font-size: 12.5px; font-weight: ${opt.unset ? 600 : 400}; color: ${fg}; line-height: 1.4; ${opt.mono ? "font-family: 'Atkinson Hyperlegible Mono', monospace; font-variant-numeric: tabular-nums;" : ''} border-bottom: 1px dashed ${C.border}; cursor: pointer">${opt.mono ? esc(value) : value}</span>
      </div>`
  }
  return `<div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 0 32px">${rows.map(cell).join('')}</div>`
}

export function card({ title, note, actions = [], children = '', pad = false }) {
  file('cards', title)
  return K.card({ title, note, actions, children, pad })
}

export function stat({ label, value, note, tone = 'plain' }) {
  file('stats', label)
  return K.stat({ label, value, note, tone })
}

/** Recorded as "Label = Value" — the shape scripts/campus-conformance.mjs splits. */
export function filterSelect(label, value, opts) {
  file('filters', `${label} = ${value}`)
  return K.filterSelect(label, value, opts)
}

export function searchField(placeholder, opts) {
  return K.searchField(placeholder, opts)
}

export function tinyBtn(label, tone = 'plain') {
  file('buttons', label)
  return K.tinyBtn(label, tone)
}

export function segments(items, active) {
  for (const it of items) file('buttons', typeof it === 'string' ? it : it.label)
  return K.segments(items, active)
}

/* ── the navigation ─────────────────────────────────────────────────────
   One sidebar, carrying what the two used to carry between them.
 */

/** A destination that does not exist yet. Drawn with a hollow ring. */
const NEW = true

/**
 * The sidebar, top to bottom.
 *
 * Campus work leads, grouped the way a school is actually organised, and the
 * rest of the platform follows after a rule. Every campus label is the string
 * `lib/navigation.ts` already uses — the grouping changed, the words did not,
 * because a canvas is not allowed to rename a shipped destination quietly.
 *
 * Three groupings did move, and each says something:
 *   People → CLASSROOM. Guardians left for Students, where they belong to a
 *     pupil. What is left is who stands in front of a class, whether they are
 *     there, and who covers when they are not.
 *   Boarding → WELFARE, and Pastoral notes joins it. A pastoral note is not a
 *     discipline record, and filing it under Conduct would have said it was.
 *   Public exams folds into RESULTS. A head looking for November's grades does
 *     not first decide whether they are internal or public.
 */
export const NAV = [
  { items: [['Home', 'House'], ['Create', 'Plus']] },
  { items: [['School Overview', 'BuildingOffice']] },
  {
    group: 'Campuses',
    items: [
      ['All campuses', 'SquaresFour', NEW],
      ['Campus register', 'BuildingOffice', NEW],
      ['Group finance', 'Bank', NEW],
      ['Group billing', 'Receipt', NEW],
    ],
  },
  {
    group: 'Students',
    items: [
      ['All students', 'UsersThree'],
      ['Admissions', 'NotePencil'],
      ['Guardians', 'UserCircle'],
      ['Roll up the year', 'ClockCounterClockwise'],
      ['Import records', 'UploadSimple'],
      ['Leavers', 'SignOut', NEW],
      ['Alumni', 'GraduationCap', NEW],
    ],
  },
  {
    group: 'Fees',
    items: [
      ['Fees by year group', 'Receipt'],
      ['Ledger and structures', 'CurrencyDollar'],
      ['Receipts', 'Receipt'],
      ['Refunds', 'Wallet'],
      ['Waivers', 'Scales'],
    ],
  },
  {
    group: 'Classroom',
    items: [
      ['Teachers', 'UserGear'],
      ['Attendance', 'UserCheck'],
      ['Cover', 'ChalkboardTeacher', NEW],
    ],
  },
  {
    group: 'Conduct',
    items: [
      ['Behaviour log', 'Flag', NEW],
      ['Merits and demerits', 'Star', NEW],
      ['Detention', 'Timer', NEW],
    ],
  },
  {
    group: 'Welfare',
    items: [
      ['Bed board', 'House'],
      ['Health and welfare', 'ShieldCheck'],
      ['Pastoral notes', 'Lock', NEW],
    ],
  },
  {
    group: 'Teaching',
    items: [
      ['Timetable', 'CalendarBlank'],
      ['Homework', 'ClipboardText'],
      ['Subject targets', 'TrendUp'],
      ['Parent meetings', 'CalendarCheck'],
    ],
  },
  {
    group: 'Results',
    items: [
      ['Results overview', 'CheckSquareOffset'],
      ['Result sheets', 'Checks'],
      ['Moderation', 'Scales'],
      ['Publishing', 'CheckSquareOffset'],
      ['Exam series', 'Certificate', NEW],
    ],
  },
  {
    group: 'Services',
    items: [
      ['Library', 'Database'],
      ['Transport', 'Truck'],
      ['Notices', 'Note'],
      ['Tuck shop', 'Receipt', NEW],
    ],
  },
  {
    group: 'Reports & Documents',
    items: [['School reports', 'ChartBar'], ['Documents', 'FileText']],
  },
  { rule: true },
  {
    items: [
      ['Human Resources', 'IdentificationCard'],
      ['Payroll', 'Wallet'],
      ['Finance', 'Bank'],
      ['Reporting', 'ChartBar'],
      ['Management', 'Gear', false, [['Academic setup', 'Rows'], ['Portals', 'UsersThree']]],
    ],
  },
]

export const PROPOSED = new Set(
  NAV.flatMap((s) => s.items ?? []).filter(([, , isNew]) => isNew).map(([label]) => label),
)

/** Every label a screen may name as its active destination. */
export const NAV_LABELS = NAV.flatMap((s) => s.items ?? []).flatMap(([label, , , kids]) => [
  label,
  ...(kids ?? []).map(([k]) => k),
])

const SIDEBAR_W = 248

const ring = () =>
  `<span style="width: 7px; height: 7px; border-radius: 999px; border: 1.5px solid ${C.brand}; opacity: .5; flex-shrink: 0"></span>`

/**
 * One nav row.
 *
 * Active is a white pill with a hairline, a barely-there shadow and a 2px
 * accent bar on its leading edge — not a saturated brand fill. Both the
 * platform reference and the dense-product lane say the same thing here: the
 * sidebar sits on the page ground, and the thing you are looking at is the one
 * raised off it.
 */
const navRow = ({ label, glyph, active, proposed, indent = 0 }) =>
  `<div style="position: relative; display: flex; align-items: center; gap: 9px; height: 28px; padding: 0 8px 0 ${8 + indent}px; margin-bottom: 1px; border-radius: 6px; cursor: pointer; background: ${active ? C.surface : 'transparent'}; border: 1px solid ${active ? C.border : 'transparent'}; box-shadow: ${active ? '0 1px 2px rgba(22,24,29,.05)' : 'none'}">
      ${active ? `<span style="position: absolute; left: -1px; top: 5px; bottom: 5px; width: 2px; border-radius: 2px; background: ${C.brand}"></span>` : ''}
      ${ph(glyph, { size: 14, color: active ? C.brandStrong : C.mid })}
      <span style="flex: 1; min-width: 0; font-size: 12.5px; font-weight: ${active ? 600 : 400}; color: ${active ? C.strong : C.mid}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(label)}</span>
      ${proposed ? ring() : ''}
    </div>`

/** An uppercase micro section label with a disclosure chevron. */
const groupRow = (label, open) =>
  `<div style="display: flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; margin-top: 5px; cursor: pointer">
      ${ph(open ? 'CaretDown' : 'CaretRight', { size: 10, color: C.faint })}
      <span style="font-size: 10px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: ${C.subtle}">${esc(label)}</span>
    </div>`

/** Sub-items sit against a vertical hairline guide, the way a tree reads. */
const guide = (rows) =>
  `<div style="margin: 0 0 2px 15px; padding-left: 7px; border-left: 1px solid ${C.borderSubtle}">${rows}</div>`

const workspaceHeader = ({ org, campus }) => {
  const all = campus === 'All campuses'
  return `<div style="height: 48px; flex-shrink: 0; display: flex; align-items: center; gap: 9px; padding: 0 10px 0 12px; border-bottom: 1px solid ${C.border}">
      <div style="width: 26px; height: 26px; border-radius: 7px; background: ${C.strong}; flex-shrink: 0; display: flex; align-items: center; justify-content: center">${ph('GraduationCap', { size: 15, color: '#fff' })}</div>
      <div style="flex: 1; min-width: 0">
        <div style="font-size: 13px; font-weight: 600; color: ${C.strong}; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(org)}</div>
        ${campus ? `<div style="display: flex; align-items: center; gap: 4px; margin-top: 1px"><span style="width: 5px; height: 5px; border-radius: 999px; background: ${all ? C.brand : C.ok}; flex-shrink: 0"></span><span style="font-size: 10.5px; font-weight: 600; color: ${all ? C.brandStrong : C.mid}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(campus)}</span></div>` : ''}
      </div>
      ${ph('CaretDown', { size: 13, color: C.subtle })}
    </div>`
}

const identityCard = ({ name, role }) => {
  const ini = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return `<div style="flex-shrink: 0; border-top: 1px solid ${C.border}; padding: 7px 10px; display: flex; align-items: center; gap: 9px">
      <div style="width: 24px; height: 24px; border-radius: 999px; background: ${C.brandSoft}; color: ${C.brandStrong}; font-size: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${esc(ini)}</div>
      <div style="flex: 1; min-width: 0">
        <div style="font-size: 12px; font-weight: 600; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(name)}</div>
        <div style="font-size: 10.5px; color: ${C.subtle}">${esc(role)}</div>
      </div>
      ${ph('DotsThreeVertical', { size: 14, color: C.faint })}
    </div>`
}

/**
 * The one sidebar.
 *
 * Groups collapse. The group holding the active destination is open and every
 * other is shut, which is what keeps forty-odd destinations inside one column
 * without a second one — a reader sees the ten group names and the six rows
 * they are actually working in.
 */
export function moduleNav(activeLabel, { scope, user } = {}) {
  if (activeLabel && !NAV_LABELS.includes(activeLabel)) {
    throw new Error(`moduleNav(): no nav item labelled "${activeLabel}"`)
  }

  const body = NAV.map((section) => {
    if (section.rule) return `<div style="height: 1px; background: ${C.border}; margin: 9px 8px 4px"></div>`

    const holdsActive = section.items.some(
      ([label, , , kids]) => label === activeLabel || (kids ?? []).some(([k]) => k === activeLabel),
    )

    const rows = section.items
      .map(([label, glyph, proposed, kids]) => {
        const childActive = (kids ?? []).some(([k]) => k === activeLabel)
        const self = navRow({ label, glyph, active: label === activeLabel || childActive, proposed })
        if (!kids || !childActive) return self
        return (
          self +
          guide(
            kids
              .map(([k, kg]) => navRow({ label: k, glyph: kg, active: k === activeLabel }))
              .join(''),
          )
        )
      })
      .join('')

    if (!section.group) return rows
    return groupRow(section.group, holdsActive) + (holdsActive ? guide(rows) : '')
  }).join('')

  return `  <div style="width: ${SIDEBAR_W}px; flex-shrink: 0; display: flex; flex-direction: column; background: ${C.canvas}; border-right: 1px solid ${C.borderStrong}; overflow: hidden">
${workspaceHeader({ org: scope?.group ?? 'Chishawasha High', campus: scope?.campus })}
    <div class="scroll" style="flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 10px">${body}</div>
${identityCard({ name: user?.name ?? 'Rudo Makoni', role: user?.role ?? 'Deputy Head' })}
  </div>`
}

/**
 * A vertical rail — icon width, no labels.
 *
 * The shell's answer for the rare screen that genuinely needs a second
 * navigation surface. Nothing on this canvas uses it; it exists so the
 * Foundation sheet can draw the rule rather than only state it.
 */
export function verticalRail(items, activeLabel) {
  return `<div style="width: 56px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0; border-right: 1px solid ${C.border}; background: ${C.surface}">${items
    .map(([label, glyph]) => {
      const active = label === activeLabel
      return `<div title="${esc(label)}" style="width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: ${active ? C.brandSoft : 'transparent'}">${ph(glyph, { size: 17, color: active ? C.brandStrong : C.mid })}</div>`
    })
    .join('')}</div>`
}

/* ── the artboard ───────────────────────────────────────────────────────*/

const DENSITY_LOGIC = `class Component extends DCLogic {
  renderVals() {
    const cozy = (this.props.density ?? 'Compact') === 'Cozy';
    return {
      bandH: cozy ? '52px' : '44px',
      rowH:  cozy ? '44px' : '36px',
      headH: cozy ? '38px' : '32px',
    };
  }
}`

const textNodes = (html) => {
  const out = []
  for (const m of html.matchAll(/>([^<>]+)</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (!t) continue
    if (/^[\s.,;:/|·—–-]+$/.test(t)) continue
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/**
 * Declare one expansion screen.
 *
 * Returns the zero-argument render function build-expansion.mjs calls, and
 * files the screen's contract into SPECS as a side effect of rendering it.
 *
 * @param meta.screen   PascalCase name — the checklist and spec filename
 * @param meta.route    the route this screen is a promise about, or null
 * @param meta.story    the proposed ledger ID it belongs to
 * @param meta.railItem the sidebar label to mark active (`navItem` also accepted)
 * @param meta.scope    {group, campus} to draw the campus selector, or omitted
 * @param build         () => the page content, using page()/grid()/card()
 */
export function defineScreen(meta, build) {
  const {
    screen, route = null, story, title, caption, action, search,
    railItem, navItem, chips = [], bandActions = [], scope, user, back = false,
    w = 1600, h = 1000, overlay = '',
  } = meta
  const active = navItem ?? railItem

  return function render() {
    CUR = {
      screen, route: route ?? null, story: story ?? null, title,
      filters: [], columns: [], cards: [], stats: [], bandChips: [], buttons: [],
    }
    for (const c of chips) file('bandChips', c.label)
    if (action) file('buttons', action.label)

    const content = build()
    const over = typeof overlay === 'function' ? overlay() : overlay

    CUR.header = `<!-- SCREEN: ${screen} | app-bar title: ${title}${caption ? ` | caption: ${caption}` : ''} -->`
    CUR.content = content
    CUR.allCopy = textNodes(content + over)
    SPECS.set(screen, CUR)
    CUR = null

    const inner = `
<div style="width: ${w}px; height: ${h}px; display: flex; overflow: hidden; background: ${C.canvas}; position: relative; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">

${moduleNav(active, { scope, user })}

  <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; background: ${C.canvas}">
${K.appBar({ title, caption, action, search, back })}

    <div class="scroll" style="flex: 1; min-height: 0; overflow-y: auto; scroll-padding-top: 92px">
${chips.length || bandActions.length ? K.band(chips, bandActions) : ''}
${content}
    </div>
  </div>
${over}
</div>`
    return K.wrap(inner, w, h, DENSITY_LOGIC)
  }
}
