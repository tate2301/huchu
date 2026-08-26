/**
 * Campus design canvas — shared artboard kit.
 *
 * Every admin artboard is a standalone .dc.html file (the Design Components
 * format has no slot mechanism), so the shell markup is emitted per file from
 * here rather than imported at runtime. The sidebar and module rail templates
 * in ../_shell are sliced byte-for-byte out of the canvas's original
 * Overview.dc.html, so the chrome cannot drift.
 *
 * Colours are the resolved values of app/styles/tokens.css; the rail labels
 * and groups are lib/navigation.ts verbatim.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ph } from './icons.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const shellDir = path.join(HERE, '..', '_shell')
const readShell = (f) => fs.readFileSync(path.join(shellDir, f), 'utf8')

export const HELMET = readShell('helmet.html')

/* ── tokens ─────────────────────────────────────────────────────────── */
export const C = {
  canvas: '#F7F8FA',
  surface: '#FFFFFF',
  muted: '#F1F3F6',
  sunken: '#E8EBF0',
  border: '#E5E8EE',
  borderStrong: '#D2D7E0',
  borderSubtle: '#EEF0F4',
  hair: '#F4F6F9',
  strong: '#16181D',
  body: '#262A33',
  mid: '#565C69',
  subtle: '#8A91A0',
  faint: '#A6AEBD',
  brand: '#0B5DF0',
  brandStrong: '#0944C2',
  brandSoft: '#E8EFFE',
  ok: '#4A7042',
  okBg: '#E7EFE0',
  okBd: '#CFE0C3',
  warn: '#8A6415',
  warnBg: '#F4E6C5',
  warnBd: '#E8D08F',
  bad: '#B83A2A',
  badBg: '#F6E2DD',
  badBd: '#ECCBC0',
  violet: '#7B45D6',
  violetFg: '#5C31A6',
  violetBg: '#F2EBFC',
  violetBd: '#D5C4F3',
  orange: '#E06A16',
  orangeFg: '#A24E08',
  orangeBg: '#FDEEE0',
  orangeBd: '#F6CDAA',
  teal: '#13857D',
  indigo: '#4A4ED4',
  pink: '#CE3789',
}

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ── icons ─────────────────────────────────────────────────────────────
   Phosphor names, resolved through lib/icons.mjs so the weight rules in
   the app's own lib/icons.tsx apply: fill by default, bold for carets and
   bare marks, regular for the magnifier.
 */
export const I = {
  home: 'House',
  users: 'UsersThree',
  user: 'UserCircle',
  userCheck: 'UserCheck',
  userGear: 'UserGear',
  userPlus: 'UserPlus',
  plus: 'Plus',
  check: 'Check',
  checks: 'Checks',
  x: 'X',
  search: 'MagnifyingGlass',
  bell: 'Bell',
  download: 'DownloadSimple',
  upload: 'UploadSimple',
  calendar: 'CalendarBlank',
  calendarCheck: 'CalendarCheck',
  clock: 'Clock',
  money: 'CurrencyDollar',
  wallet: 'Wallet',
  receipt: 'Receipt',
  book: 'BookOpen',
  books: 'Books',
  chart: 'ChartBar',
  file: 'FileText',
  folder: 'Folder',
  chevD: 'CaretDown',
  chevR: 'CaretRight',
  chevL: 'CaretLeft',
  chevU: 'CaretUp',
  panel: 'SidebarSimple',
  bed: 'Bed',
  bus: 'Truck',
  shield: 'ShieldCheck',
  scale: 'Scales',
  layers: 'StackSimple',
  grid: 'SquaresFour',
  rows: 'Rows',
  database: 'Database',
  target: 'Target',
  mail: 'Envelope',
  print: 'Printer',
  alert: 'Warning',
  info: 'Info',
  wifiOff: 'WifiSlash',
  lock: 'Lock',
  refresh: 'ArrowClockwise',
  more: 'DotsThreeVertical',
  edit: 'PencilSimple',
  note: 'NotePencil',
  send: 'PaperPlaneTilt',
  eye: 'Eye',
  clipboard: 'ClipboardText',
  history: 'ClockCounterClockwise',
  settings: 'Gear',
  help: 'Question',
  logout: 'SignOut',
  flag: 'Flag',
  pin: 'MapPin',
  phone: 'Phone',
  star: 'Star',
  building: 'BuildingOffice',
  trendUp: 'TrendUp',
  fileCheck: 'CheckSquareOffset',
  graduation: 'GraduationCap',
  idCard: 'IdentificationCard',
  bank: 'Bank',
  arrowRight: 'ArrowRight',
}

/** Kept as icon(name, {size, stroke}) so callers do not change;  is the fill colour. */
export const icon = (name, { size = 15, stroke = C.mid } = {}) => ph(name, { size, color: stroke })

/* ── shell ──────────────────────────────────────────────────────────── */

/**
 * The campus module rail, as lib/navigation.ts declares it — labels, order
 * and grouping verbatim, each with the Phosphor glyph that entry names.
 */
export const RAIL_ITEMS = [
  [null, 'School Overview', 'BuildingOffice'],
  ['Students', 'All students', 'UsersThree'],
  ['Students', 'Admissions', 'NotePencil'],
  ['Students', 'Roll up the year', 'ClockCounterClockwise'],
  ['Students', 'Import records', 'UploadSimple'],
  ['People', 'Guardians', 'UserCircle'],
  ['People', 'Teachers', 'UserGear'],
  ['People', 'Attendance', 'UserCheck'],
  ['Boarding', 'Bed board', 'House'],
  ['Boarding', 'Health and welfare', 'ShieldCheck'],
  ['Academic setup', 'Years and terms', 'Rows'],
  ['Academic setup', 'Classes', 'Checks'],
  ['Academic setup', 'Subjects', 'Database'],
  ['Academic setup', 'Scheme of work', 'StackSimple'],
  ['Academic setup', 'Identity and records', 'UserCircle'],
  ['Teaching', 'Timetable', 'CalendarBlank'],
  ['Teaching', 'Homework', 'ClipboardText'],
  ['Teaching', 'Subject targets', 'TrendUp'],
  ['Teaching', 'Parent meetings', 'CalendarCheck'],
  ['Results', 'Results overview', 'CheckSquareOffset'],
  ['Results', 'Result sheets', 'Checks'],
  ['Results', 'Moderation', 'Scales'],
  ['Results', 'Publishing', 'CheckSquareOffset'],
  ['Fees', 'Fees by year group', 'Receipt'],
  ['Fees', 'Ledger and structures', 'CurrencyDollar'],
  ['Fees', 'Receipts', 'Receipt'],
  ['Fees', 'Refunds', 'Wallet'],
  ['Fees', 'Waivers', 'Scales'],
  ['Services', 'Library', 'Database'],
  ['Services', 'Transport', 'Truck'],
  ['Services', 'Notices', 'Note'],
  ['Reports and documents', 'School reports', 'ChartBar'],
  ['Reports and documents', 'Documents', 'FileText'],
]

const SIDEBAR_ITEMS = [
  [null, 'Home', 'House'],
  [null, 'Create', 'Plus'],
  ['Campus', 'School Operations', 'BuildingOffice'],
  ['Campus', 'Portals', 'UsersThree'],
  ['Campus', 'People', 'UserCircle'],
  ['Campus', 'Payroll', 'Wallet'],
  ['Campus', 'Accounting', 'Bank'],
  ['Campus', 'Reports', 'ChartBar'],
  ['Campus', 'Management', 'Gear'],
]

const groupLabel = (t) =>
  `<div style="padding: 11px 8px 3px; font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: ${C.subtle}">${esc(t)}</div>`

const navRow = ({ label, glyph, active, height, chevron }) =>
  `<div class="nav" style="display: flex; align-items: center; gap: 9px; height: ${height}px; padding: 0 8px; border-radius: 6px; cursor: pointer; margin-bottom: 1px; background: ${active ? C.brandSoft : 'transparent'}">${ph(glyph, { size: 15, color: active ? C.brandStrong : C.mid })}<span style="flex: 1; min-width: 0; font-size: 12.5px; font-weight: ${active ? 700 : 500}; color: ${active ? C.brandStrong : C.mid}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(label)}</span>${chevron ? ph('CaretDown', { size: 13, color: C.faint }) : ''}</div>`

/** The 280px workspace sidebar. Only the identity card varies by persona. */
export function sidebar({ name = 'Rudo Makoni', role = 'Deputy Head', initials } = {}) {
  const ini =
    initials ??
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  let group = null
  const rows = SIDEBAR_ITEMS.map(([g, label, glyph]) => {
    const head = g && g !== group ? groupLabel(g) : ''
    group = g
    return (
      head +
      navRow({ label, glyph, active: label === 'School Operations', height: 28, chevron: label === 'School Operations' })
    )
  }).join('')

  return `  <div style="width: 280px; flex-shrink: 0; display: flex; flex-direction: column; background: ${C.surface}; border-right: 1px solid ${C.borderStrong}; overflow: hidden">
    <div style="height: 48px; flex-shrink: 0; display: flex; align-items: center; gap: 9px; padding: 0 10px 0 12px; border-bottom: 1px solid ${C.borderSubtle}">
      <div style="width: 26px; height: 26px; border-radius: 7px; background: ${C.strong}; flex-shrink: 0; display: flex; align-items: center; justify-content: center">${ph('GraduationCap', { size: 15, color: '#fff' })}</div>
      <div style="flex: 1; min-width: 0"><div style="font-size: 13px; font-weight: 700; color: ${C.strong}; letter-spacing: -.01em">Chishawasha High</div></div>
      ${ph('CaretDown', { size: 13, color: C.subtle })}
    </div>
    <div class="scroll" style="flex: 1; min-height: 0; overflow-y: auto; padding: 6px 8px 10px">${rows}</div>
    <div style="flex-shrink: 0; border-top: 1px solid ${C.borderSubtle}; padding: 7px 10px; display: flex; align-items: center; gap: 9px">
      <div style="width: 24px; height: 24px; border-radius: 999px; background: ${C.brandSoft}; color: ${C.brandStrong}; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${esc(ini)}</div>
      <div style="flex: 1; min-width: 0">
        <div style="font-size: 12px; font-weight: 600; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(name)}</div>
        <div style="font-size: 10.5px; color: ${C.subtle}">${esc(role)}</div>
      </div>
    </div>
  </div>`
}

/**
 * The 200px campus rail, with one row marked active by its label.
 * Labels are lib/navigation.ts verbatim — passing anything else throws
 * rather than silently drawing a rail with nothing selected.
 */
export function rail(activeLabel) {
  let hit = false
  let group = null
  const rows = RAIL_ITEMS.map(([g, label, glyph]) => {
    const head = g && g !== group ? groupLabel(g) : ''
    group = g
    const active = label === activeLabel
    if (active) hit = true
    return head + navRow({ label, glyph, active, height: 29 })
  }).join('')
  if (activeLabel && !hit) throw new Error(`rail(): no nav item labelled "${activeLabel}"`)
  return `      <div class="scroll" style="width: 200px; flex-shrink: 0; border-right: 1px solid ${C.border}; overflow-y: auto; padding: 8px; background: ${C.surface}">${rows}</div>`
}

/** The 48px app bar. It carries the page's only name — see Main.dc.html. */
export function appBar({
  title,
  caption,
  action,
  search = 'Search students, classes',
  bell = true,
  back = false,
}) {
  const leftIcon = back ? I.chevL : I.panel
  return `
    <div style="height: 48px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 8px; border-bottom: 1px solid ${C.borderStrong}; background: ${C.surface}; box-shadow: 0 1px 0 0 rgba(22,24,29,.05)">
      <div class="btn" style="width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0">${icon(leftIcon, { size: 16 })}</div>
      <div style="font-size: 13.5px; font-weight: 700; color: ${C.strong}; letter-spacing: -.005em; flex-shrink: 0">${esc(title)}</div>
      ${caption ? `<span style="font-size: 11.5px; color: ${C.subtle}; border-left: 1px solid ${C.border}; padding-left: 10px; flex-shrink: 0; white-space: nowrap">${caption}</span>` : ''}
      <div style="flex: 1"></div>
      ${search ? `<div style="display: flex; align-items: center; height: 30px; width: 260px; border: 1px solid ${C.border}; border-radius: 6px; padding: 0 9px; gap: 7px; background: ${C.canvas}; flex-shrink: 0">${icon(I.search, { size: 14, stroke: C.subtle, w: 1.9 })}<span style="flex: 1; font-size: 12.5px; color: ${C.subtle}">${esc(search)}</span><span class="mono" style="font-size: 10.5px; color: ${C.faint}; border: 1px solid ${C.border}; background: #fff; border-radius: 4px; padding: 1px 4px">&#8984;K</span></div>` : ''}
      ${bell ? `<div class="btn" style="width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0">${icon(I.bell, { size: 16 })}</div>` : ''}
      ${action ? primaryBtn(action) : ''}
    </div>`
}

export const primaryBtn = ({ label, icon: ic = I.plus }) =>
  `<div class="pri" style="height: 30px; padding: 0 11px; border-radius: 6px; background: ${C.brand}; color: #fff; display: flex; align-items: center; gap: 6px; cursor: pointer; flex-shrink: 0">${icon(ic, { size: 14, stroke: '#fff', w: 2.2 })}<span style="font-size: 12.5px; font-weight: 600">${esc(label)}</span></div>`

export const ghostBtn = (label, ic) =>
  `<div class="btn" style="height: 28px; padding: 0 9px; border: 1px solid ${C.border}; border-radius: 6px; display: flex; align-items: center; gap: 6px; cursor: pointer; background: ${C.surface}; flex-shrink: 0">${ic ? icon(ic, { size: 13 }) : ''}<span style="font-size: 12px; color: ${C.mid}">${esc(label)}</span></div>`

export const solidBtn = (label, ic) =>
  `<div class="pri" style="height: 28px; padding: 0 10px; border-radius: 6px; background: ${C.brand}; display: flex; align-items: center; gap: 6px; cursor: pointer; flex-shrink: 0">${ic ? icon(ic, { size: 13, stroke: '#fff', w: 2.1 }) : ''}<span style="font-size: 12px; font-weight: 600; color: #fff">${esc(label)}</span></div>`

export const dangerBtn = (label, ic) =>
  `<div style="height: 28px; padding: 0 10px; border-radius: 6px; background: ${C.bad}; display: flex; align-items: center; gap: 6px; cursor: pointer; flex-shrink: 0">${ic ? icon(ic, { size: 13, stroke: '#fff', w: 2.1 }) : ''}<span style="font-size: 12px; font-weight: 600; color: #fff">${esc(label)}</span></div>`

export const TONES = {
  plain: ['#F1F3F6', '#565C69', '#E5E8EE'],
  ok: ['#E7EFE0', '#4A7042', '#CFE0C3'],
  warn: ['#F4E6C5', '#8A6415', '#E8D08F'],
  bad: ['#F6E2DD', '#B83A2A', '#ECCBC0'],
  brand: ['#E8EFFE', '#0944C2', '#DCE5FD'],
  violet: ['#F2EBFC', '#5C31A6', '#D5C4F3'],
  orange: ['#FDEEE0', '#A24E08', '#F6CDAA'],
}

export const tinyBtn = (label, tone = 'plain') => {
  const [bg, fg, bd] = TONES[tone] ?? TONES.plain
  return `<div style="height: 22px; padding: 0 8px; border-radius: 5px; background: ${tone === 'plain' ? C.surface : bg}; border: 1px solid ${tone === 'plain' ? C.border : bd}; display: flex; align-items: center; cursor: pointer; flex-shrink: 0"><span style="font-size: 11px; font-weight: 600; color: ${tone === 'plain' ? C.mid : fg}">${esc(label)}</span></div>`
}

/** A page band: state chips on the left, actions on the right. No heading. */
export function band(chips = [], actions = []) {
  return `
        <div style="position: sticky; top: 0; z-index: 30; height: var(--band-h); display: flex; align-items: center; gap: 8px; padding: 0 16px; background: ${C.canvas}; border-bottom: 1px solid ${C.border}">
          ${chips.map(bandChip).join('')}
          <div style="flex: 1"></div>
          ${actions.join('')}
        </div>`
}

export function bandChip({ label, value, tone = 'plain' }) {
  const t = {
    plain: { bg: C.surface, bd: C.border, fg: C.mid, vfg: C.strong },
    ok: { bg: C.okBg, bd: 'transparent', fg: C.ok, vfg: C.ok },
    warn: { bg: C.warnBg, bd: 'transparent', fg: C.warn, vfg: C.warn },
    bad: { bg: C.badBg, bd: 'transparent', fg: C.bad, vfg: C.bad },
    brand: { bg: C.brandSoft, bd: 'transparent', fg: C.brandStrong, vfg: C.brandStrong },
  }[tone]
  return `<div style="display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: 6px; background: ${t.bg}; border: 1px solid ${t.bd}; flex-shrink: 0"><span style="font-size: 11px; color: ${t.fg}">${esc(label)}</span>${value !== undefined ? `<span style="font-family: 'Atkinson Hyperlegible Mono', monospace; font-size: 11.5px; font-weight: 700; color: ${t.vfg}">${esc(value)}</span>` : ''}</div>`
}

/* ── content primitives ─────────────────────────────────────────────── */

export const page = (children) =>
  `<div style="padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 12px">${children}</div>`

export const grid = (cols, children, gap = 12) =>
  `<div style="display: grid; grid-template-columns: ${typeof cols === 'number' ? `repeat(${cols}, minmax(0, 1fr))` : cols}; gap: ${gap}px; align-items: start">${children}</div>`

export const stack = (children, gap = 12) =>
  `<div style="display: flex; flex-direction: column; gap: ${gap}px">${children}</div>`

export const rowFlex = (
  children,
  { gap = 8, align = 'center', justify = 'flex-start', wrap = 'nowrap' } = {},
) =>
  `<div style="display: flex; align-items: ${align}; justify-content: ${justify}; gap: ${gap}px; flex-wrap: ${wrap}">${children}</div>`

export function stat({ label, value, note, tone = 'plain' }) {
  const fg = { plain: C.strong, ok: C.ok, bad: C.bad, warn: C.warn, brand: C.brandStrong }[tone]
  return `<div style="border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}; padding: 13px 15px">
              <div style="font-size: 11px; color: ${C.mid}; margin-bottom: 6px">${esc(label)}</div>
              <div class="mono" style="font-size: 25px; font-weight: 700; color: ${fg}; letter-spacing: -.02em; line-height: 1.1">${esc(value)}</div>
              ${note ? `<div style="font-size: 11px; color: ${C.subtle}; margin-top: 4px">${note}</div>` : ''}
            </div>`
}

export function card({ title, note, actions = [], children = '', pad = false }) {
  const head = title
    ? `<div style="min-height: var(--head-h); display: flex; align-items: center; gap: 8px; padding: 0 13px; border-bottom: 1px solid ${C.borderSubtle}">
                  <h2 style="margin: 0; font-size: 12.5px; font-weight: 700; color: ${C.strong}">${esc(title)}</h2>
                  ${note ? `<span style="font-size: 11px; color: ${C.subtle}">${note}</span>` : ''}
                  <div style="flex: 1"></div>${actions.join('')}
                </div>`
    : ''
  return `<div style="border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}; overflow: hidden">${head}${pad ? `<div style="padding: 13px">${children}</div>` : children}</div>`
}

/** A list row inside a card. */
export function listRow(cells, { tone, last = false } = {}) {
  const bg = tone === 'sel' ? C.brandSoft : tone === 'bad' ? C.badBg : 'transparent'
  return `<div class="row" style="display: flex; align-items: center; gap: 10px; min-height: var(--row-h); padding: 0 13px; ${last ? '' : `border-bottom: 1px solid ${C.hair};`} background: ${bg}">${cells}</div>`
}

export const dot = (color) =>
  `<span style="width: 6px; height: 6px; border-radius: 999px; background: ${color}; flex-shrink: 0"></span>`

export const mono = (t, { size = 11, color = C.subtle, width, weight = 400 } = {}) =>
  `<span class="mono" style="font-size: ${size}px; font-weight: ${weight}; color: ${color};${width ? ` width: ${width}px; flex-shrink: 0;` : ''} font-variant-numeric: tabular-nums">${esc(t)}</span>`

export const txt = (t, { size = 12, color = C.body, weight = 400, flex, ellipsis = false } = {}) =>
  `<span style="font-size: ${size}px; font-weight: ${weight}; color: ${color};${flex ? ` flex: ${flex}; min-width: 0;` : ''}${ellipsis ? ' overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' : ''}">${t}</span>`

export function badge(label, tone = 'plain') {
  const [bg, fg, bd] = TONES[tone] ?? TONES.plain
  return `<span style="display: inline-flex; align-items: center; height: 19px; padding: 0 7px; border-radius: 5px; background: ${bg}; color: ${fg}; border: 1px solid ${bd}; font-size: 10.5px; font-weight: 600; white-space: nowrap; flex-shrink: 0">${esc(label)}</span>`
}

export function avatar(initials, { size = 24, bg = C.brandSoft, fg = C.brandStrong } = {}) {
  return `<span style="width: ${size}px; height: ${size}px; border-radius: 999px; background: ${bg}; color: ${fg}; font-size: ${Math.round(size * 0.42)}px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0">${esc(initials)}</span>`
}

const colStyle = (c = {}) =>
  `${c.w ? `width: ${c.w}px; flex-shrink: 0;` : 'flex: 1; min-width: 0;'} ${c.align === 'right' ? 'justify-content: flex-end; text-align: right;' : c.align === 'center' ? 'justify-content: center; text-align: center;' : ''}`

/** A data table. cols: [{label, w?, align?}], rows: [[cell,…]] */
export function table({ cols, rows, zebra = false }) {
  const head = `<div style="display: flex; align-items: center; gap: 10px; height: var(--head-h); padding: 0 13px; border-bottom: 1px solid ${C.border}; background: ${C.canvas}">${cols
    .map(
      (c) =>
        `<span style="font-size: 11px; font-weight: 600; color: ${C.mid}; ${colStyle(c)}">${esc(c.label)}</span>`,
    )
    .join('')}</div>`
  const body = rows
    .map(
      (r, i) =>
        `<div class="row" style="display: flex; align-items: center; gap: 10px; min-height: var(--row-h); padding: 0 13px; border-bottom: 1px solid ${C.hair}; background: ${zebra && i % 2 ? C.canvas : 'transparent'}">${r
          .map(
            (cell, j) =>
              `<span style="display: flex; align-items: center; gap: 7px; ${colStyle(cols[j])}">${cell}</span>`,
          )
          .join('')}</div>`,
    )
    .join('')
  return head + body
}

/** Segmented pill strip — VerticalDataViews renders horizontally. */
export function segments(items, active) {
  return `<div style="display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 8px; background: ${C.muted}; border: 1px solid ${C.border}; flex-shrink: 0; align-self: flex-start">${items
    .map((it) => {
      const label = typeof it === 'string' ? it : it.label
      const count = typeof it === 'string' ? undefined : it.count
      const on = label === active
      return `<div style="display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px; border-radius: 6px; background: ${on ? C.surface : 'transparent'}; box-shadow: ${on ? '0 1px 2px rgba(42,38,34,.06)' : 'none'}; cursor: pointer"><span style="font-size: 12px; font-weight: ${on ? 600 : 500}; color: ${on ? C.strong : C.mid}">${esc(label)}</span>${count !== undefined ? `<span class="mono" style="font-size: 10.5px; color: ${on ? C.mid : C.faint}">${esc(count)}</span>` : ''}</div>`
    })
    .join('')}</div>`
}

/** Filter select — components/schools/common/filter-select.tsx */
export function filterSelect(label, value, { w = 170 } = {}) {
  return `<div style="display: flex; flex-direction: column; gap: 4px; width: ${w}px; flex-shrink: 0">
    <span style="font-size: 10.5px; font-weight: 600; color: ${C.mid}">${esc(label)}</span>
    <div style="display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 9px; border: 1px solid ${C.border}; border-radius: 6px; background: ${C.surface}"><span style="flex: 1; min-width: 0; font-size: 12px; color: ${C.body}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(value)}</span>${icon(I.chevD, { size: 13, stroke: C.faint, w: 2 })}</div>
  </div>`
}

export function searchField(placeholder, { w = 260, label } = {}) {
  return `<div style="display: flex; flex-direction: column; gap: 4px; width: ${w}px; flex-shrink: 0">
    ${label ? `<span style="font-size: 10.5px; font-weight: 600; color: ${C.mid}">${esc(label)}</span>` : ''}
    <div style="display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 9px; border: 1px solid ${C.border}; border-radius: 6px; background: ${C.surface}">${icon(I.search, { size: 14, stroke: C.subtle, w: 1.9 })}<span style="flex: 1; font-size: 12px; color: ${C.subtle}">${esc(placeholder)}</span></div>
  </div>`
}

export function alert({ title, body, tone = 'bad', action }) {
  const [bg, fg, bd] = TONES[tone] ?? TONES.bad
  const ic = tone === 'bad' ? I.alert : tone === 'ok' ? I.check : I.info
  return `<div style="display: flex; gap: 10px; padding: 11px 13px; border: 1px solid ${bd}; border-radius: 10px; background: ${bg}">
    ${icon(ic, { size: 16, stroke: fg, w: 1.9 })}
    <div style="flex: 1; min-width: 0">
      <div style="font-size: 12.5px; font-weight: 700; color: ${fg}">${esc(title)}</div>
      ${body ? `<div style="font-size: 12px; color: ${fg}; opacity: .88; margin-top: 2px; line-height: 1.5">${body}</div>` : ''}
    </div>
    ${action ?? ''}
  </div>`
}

export function emptyState({ title, body, action, ic = I.folder, h = 260 }) {
  return `<div style="height: ${h}px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; text-align: center; padding: 0 40px">
    <div style="width: 38px; height: 38px; border-radius: 10px; background: ${C.muted}; display: flex; align-items: center; justify-content: center">${icon(ic, { size: 18, stroke: C.faint })}</div>
    <div style="font-size: 13px; font-weight: 700; color: ${C.strong}">${esc(title)}</div>
    ${body ? `<div style="font-size: 12px; color: ${C.mid}; max-width: 400px; line-height: 1.55">${body}</div>` : ''}
    ${action ? `<div style="margin-top: 4px">${action}</div>` : ''}
  </div>`
}

export const skel = (w, h = 10) =>
  `<span style="display: block; width: ${w}; height: ${h}px; border-radius: 4px; background: ${C.sunken}"></span>`

/** A modal over a dimmed screen. */
export function modal({ title, lede, body, footer, w = 460 }) {
  return `<div style="position: absolute; inset: 0; z-index: 60; background: rgba(22,24,29,.34); display: flex; align-items: center; justify-content: center">
    <div style="width: ${w}px; max-height: 84%; border-radius: 12px; background: ${C.surface}; box-shadow: 0 24px 64px -12px rgba(42,38,34,.28), 0 4px 12px rgba(42,38,34,.1); overflow: hidden; display: flex; flex-direction: column">
      <div style="padding: 15px 17px 12px">
        <div style="font-size: 14px; font-weight: 700; color: ${C.strong}">${esc(title)}</div>
        ${lede ? `<div style="font-size: 12px; color: ${C.mid}; margin-top: 3px; line-height: 1.5">${lede}</div>` : ''}
      </div>
      <div style="padding: 0 17px 14px; display: flex; flex-direction: column; gap: 11px; overflow: hidden">${body}</div>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 11px 17px; border-top: 1px solid ${C.borderSubtle}; background: ${C.canvas}">${footer}</div>
    </div>
  </div>`
}

export function field(label, value, { hint, required = false, placeholder = false, w } = {}) {
  return `<div style="display: flex; flex-direction: column; gap: 4px;${w ? ` width: ${w}px;` : ''}">
    <span style="font-size: 11px; font-weight: 600; color: ${C.body}">${esc(label)}${required ? ` <span style="color: ${C.bad}">*</span>` : ''}</span>
    <div style="display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; border: 1px solid ${C.border}; border-radius: 7px; background: ${C.surface}"><span style="flex: 1; min-width: 0; font-size: 12.5px; color: ${placeholder ? C.subtle : C.body}">${value}</span></div>
    ${hint ? `<span style="font-size: 11px; color: ${C.subtle}; line-height: 1.45">${hint}</span>` : ''}
  </div>`
}

export function pickerField(label, value, { hint, required = false, placeholder = false } = {}) {
  return `<div style="display: flex; flex-direction: column; gap: 4px">
    <span style="font-size: 11px; font-weight: 600; color: ${C.body}">${esc(label)}${required ? ` <span style="color: ${C.bad}">*</span>` : ''}</span>
    <div style="display: flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 10px; border: 1px solid ${C.border}; border-radius: 7px; background: ${C.surface}"><span style="flex: 1; min-width: 0; font-size: 12.5px; color: ${placeholder ? C.subtle : C.body}">${value}</span>${icon(I.chevD, { size: 13, stroke: C.faint, w: 2 })}</div>
    ${hint ? `<span style="font-size: 11px; color: ${C.subtle}; line-height: 1.45">${hint}</span>` : ''}
  </div>`
}

export const sectionLabel = (t) =>
  `<div style="font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${C.subtle}">${esc(t)}</div>`

/** A "this screen does not exist yet" tag for the gap-fill artboards. */
export const proposalTag = () => ''

/* ── artboard wrapper ───────────────────────────────────────────────── */

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

/** A full admin screen: sidebar + app bar + rail + band + content. */
export function adminArtboard({
  w = 1600,
  h = 1000,
  title,
  caption,
  action,
  search,
  railItem,
  chips = [],
  bandActions = [],
  content,
  overlay = '',
  user,
  back = false,
}) {
  const inner = `
<div style="width: ${w}px; height: ${h}px; display: flex; overflow: hidden; background: ${C.canvas}; position: relative; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">

${sidebar(user)}

  <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden">
${appBar({ title, caption, action, search, back })}

    <div style="flex: 1; min-height: 0; display: flex; overflow: hidden">

${rail(railItem)}

      <div class="scroll" style="flex: 1; min-width: 0; overflow-y: auto; scroll-padding-top: 92px">
${chips.length || bandActions.length ? band(chips, bandActions) : ''}
${content}
      </div>
    </div>
  </div>
${overlay}
</div>`
  return wrap(inner, w, h)
}

/** A bare artboard — phone screens, state sheets, standalone surfaces. */
export function bareArtboard({ w, h, content, logic, bg = C.canvas }) {
  return wrap(
    `<div style="width: ${w}px; height: ${h}px; overflow: hidden; background: ${bg}; position: relative; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">${content}</div>`,
    w,
    h,
    logic,
  )
}

export function wrap(inner, w, h, logic) {
  const props = `{"density":{"editor":"enum","options":["Compact","Cozy"],"default":"Compact"},"$preview":{"width":${w},"height":${h}}}`
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
${HELMET}
${inner}
</x-dc>
<script data-dc-script data-props='${props}'>
${logic ?? DENSITY_LOGIC}
</script>
</body>
</html>
`
}
