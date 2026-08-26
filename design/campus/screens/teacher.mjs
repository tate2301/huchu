/**
 * Teacher portal — the shell and every screen, redrawn from
 * components/schools/portal/teacher/*.
 *
 * The published canvas described this portal as green, on a 60px bar, with
 * 44px targets throughout. The code says otherwise: violet (--accent-violet-solid
 * #7B45D6, which the shell re-points the whole brand channel to), a 56px .te-bar
 * with the caption ABOVE the title, a 5-tab strip under it, and rail rows at a
 * 34px min-height. These artboards follow the code.
 */
import { C, I, icon, esc, wrap, mono, txt, badge, avatar, sectionLabel } from '../lib/kit.mjs'
import { ph } from '../lib/icons.mjs'

const V = {
  brand: '#7B45D6',
  strong: '#5C31A6',
  soft: '#F2EBFC',
  bd: '#D5C4F3',
  grad: 'linear-gradient(135deg, #7B45D6 0%, #5C31A6 100%)',
}

const W = 1240
const H = 880

const note = () => ''

/* ── shell ──────────────────────────────────────────────────────────── */
const RAIL = {
  'My classes': [
    ['Form 2A · Mathematics', 'F2A · 32', '#7B45D6'],
    ['Form 2B · Mathematics', 'F2B · 31', '#0B5DF0'],
    ['Form 3A · Mathematics', 'F3A · 30', '#13857D'],
    ['Form 4A · Add. Mathematics', 'F4A · 18', '#E06A16'],
  ],
  'Daily work': [
    ['Today', 'House'],
    ['Attendance', 'UserCheck'],
    ['Enter marks', 'NotePencil'],
    ['Marks book', 'ClipboardText'],
    ['Messages', 'Envelope'],
    ['Timetable', 'CalendarBlank'],
    ['Lesson plans', 'StackSimple'],
  ],
  More: [
    ['Homework', 'ListChecks'],
    ['Shared files', 'Folder'],
    ['Reports', 'ChartBar'],
    ['Parent meetings', 'CalendarCheck'],
  ],
  Account: [
    ['Profile', 'UserCircle'],
    ['Settings', 'Gear'],
    ['Help', 'Question'],
    ['Sign out', 'SignOut'],
  ],
}

const TABS = [
  ['Today', 'House'],
  ['Marks', 'NotePencil'],
  ['Messages', 'Envelope'],
  ['Timetable', 'CalendarBlank'],
  ['Lessons', 'StackSimple'],
]

const railItem = (entry, activeLabel) => {
  const [label, glyph] = Array.isArray(entry) ? entry : [entry, null]
  const on = label === activeLabel
  return `
  <div class="nav" style="display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 9px 10px; border-radius: 7px; cursor: pointer; background: ${on ? V.soft : 'transparent'}">
    ${glyph ? ph(glyph, { size: 16, color: on ? V.strong : C.subtle }) : ''}
    <span style="flex: 1; min-width: 0; font-size: 13px; font-weight: ${on ? 700 : 500}; color: ${on ? V.strong : C.mid}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(label)}</span>
  </div>`
}

const classRow = ([label, code, hue], active) => `
  <div class="nav" style="display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 7px; cursor: pointer; background: ${active ? V.soft : 'transparent'}">
    <span style="width: 6px; height: 22px; border-radius: 3px; background: ${hue}; flex-shrink: 0"></span>
    <span style="flex: 1; min-width: 0">
      <span style="display: block; font-size: 12.5px; font-weight: ${active ? 700 : 500}; color: ${active ? V.strong : C.body}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(label)}</span>
      ${mono(code, { size: 10.5 })}
    </span>
  </div>`

const shell = ({ caption, title, activeRail, activeTab, body, online = true, bell = 6, overlay = '' }) => `
<div style="width: ${W}px; height: ${H}px; display: flex; overflow: hidden; background: ${C.canvas}; position: relative; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">

  <div class="scroll" style="width: 236px; flex-shrink: 0; display: flex; flex-direction: column; background: ${C.surface}; border-right: 1px solid ${C.border}; padding: 16px 12px 12px; overflow-y: auto">
    <div style="display: flex; align-items: center; gap: 10px; padding: 0 4px 14px">
      ${avatar('PN', { size: 36, bg: V.soft, fg: V.strong })}
      <div style="min-width: 0">
        <div style="font-size: 13px; font-weight: 600; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">Priscilla Nyathi</div>
        <div style="font-size: 11px; color: ${C.subtle}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">Mathematics · Add. Mathematics</div>
      </div>
    </div>
    ${Object.entries(RAIL)
      .map(
        ([group, items]) => `
      <div style="padding: 10px 10px 4px">${sectionLabel(group)}</div>
      ${group === 'My classes' ? items.map((c, i) => classRow(c, i === 0)).join('') : items.map((l) => railItem(l, activeRail)).join('')}`,
      )
      .join('')}
  </div>

  <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden">
    <div style="min-height: 56px; flex-shrink: 0; display: flex; align-items: center; gap: 14px; padding: 0 22px; border-bottom: 1px solid ${C.border}; background: ${C.surface}">
      <div style="flex: 1; min-width: 0">
        <div style="font-size: 11.5px; font-weight: 500; color: ${C.subtle}; line-height: 1">${caption}</div>
        <h1 style="margin: 3px 0 0; font-size: 16px; font-weight: 700; line-height: 1.2; letter-spacing: -.015em; color: ${C.strong}">${esc(title)}</h1>
      </div>
      <span style="display: inline-flex; align-items: center; height: 20px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: ${online ? C.okBg : C.warnBg}; color: ${online ? C.ok : C.warn}; flex-shrink: 0">${online ? 'Online' : 'Offline'}</span>
      <div style="position: relative; width: 32px; height: 32px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0">
        ${icon(I.bell, { size: 17 })}
        ${bell ? `<span class="mono" style="position: absolute; top: -2px; right: -2px; min-width: 14px; height: 14px; border-radius: 999px; background: ${C.bad}; color: #fff; font-size: 9px; font-weight: 600; line-height: 14px; text-align: center">${bell}</span>` : ''}
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 2px; padding: 0 22px; border-bottom: 1px solid ${C.border}; background: ${C.surface}; flex-shrink: 0">
      ${TABS.map(
        ([t, g]) =>
          `<div style="display: flex; align-items: center; gap: 7px; padding: 11px 14px; font-size: 13px; font-weight: 500; line-height: 1; border-bottom: 2px solid ${t === activeTab ? V.brand : 'transparent'}; color: ${t === activeTab ? V.strong : C.mid}; cursor: pointer">${ph(g, { size: 15, color: t === activeTab ? V.brand : C.subtle })}${t}</div>`,
      ).join('')}
    </div>
    <div class="scroll" style="flex: 1; min-height: 0; overflow-y: auto; padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 16px">${body}</div>
  </div>
  ${overlay}
</div>`

export const artboard = (opts) => wrap(shell(opts), W, H)

/* ── local primitives ───────────────────────────────────────────────── */
export const card = ({ title, sub, action, children, pad = false }) => `
  <div style="border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}; overflow: hidden">
    ${
      title
        ? `<div style="display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid ${C.borderSubtle}">
            <div style="flex: 1; min-width: 0">
              <div style="font-size: 14px; font-weight: 700; color: ${C.strong}">${esc(title)}</div>
              ${sub ? `<div style="font-size: 11.5px; color: ${C.subtle}; margin-top: 2px">${sub}</div>` : ''}
            </div>${action ?? ''}
          </div>`
        : ''
    }
    ${pad ? `<div style="padding: 14px 16px">${children}</div>` : children}
  </div>`

export const row = (cells, last) =>
  `<div class="row" style="display: flex; align-items: center; gap: 12px; min-height: 46px; padding: 8px 16px; ${last ? '' : `border-bottom: 1px solid ${C.hair};`}">${cells}</div>`

export const btn = (label, kind = 'ghost') => {
  const s = {
    ghost: `border: 1px solid ${C.border}; background: ${C.surface}; color: ${C.mid}`,
    solid: `border: 1px solid transparent; background: ${V.brand}; color: #fff`,
    quiet: `border: 1px solid transparent; background: ${V.soft}; color: ${V.strong}`,
  }[kind]
  return `<span style="display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border-radius: 8px; font-size: 13px; font-weight: 600; ${s}; flex-shrink: 0; cursor: pointer">${esc(label)}</span>`
}

export const stat = (label, value, note, tone) => `
  <div style="border: 1px solid ${C.border}; border-radius: 11px; background: ${C.surface}; padding: 13px 15px">
    <div style="font-size: 11px; color: ${C.mid}">${esc(label)}</div>
    <div class="mono" style="font-size: 24px; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; margin-top: 4px; color: ${tone === 'warn' ? C.warn : tone === 'bad' ? C.bad : tone === 'ok' ? C.ok : C.strong}">${esc(value)}</div>
    ${note ? `<div style="font-size: 11px; color: ${C.subtle}; margin-top: 3px">${note}</div>` : ''}
  </div>`

export const grid = (cols, children, gap = 12) =>
  `<div style="display: grid; grid-template-columns: ${typeof cols === 'number' ? `repeat(${cols}, minmax(0, 1fr))` : cols}; gap: ${gap}px; align-items: start">${children}</div>`

export const seg = (options, active) =>
  `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px; background: ${C.muted}; border: 1px solid ${C.border}; flex-shrink: 0">${options
    .map(([label, tone]) => {
      const on = label === active
      const bg = !on ? 'transparent' : tone === 'ok' ? C.okBg : tone === 'bad' ? C.badBg : tone === 'warn' ? C.warnBg : C.surface
      const fg = !on ? C.mid : tone === 'ok' ? C.ok : tone === 'bad' ? C.bad : tone === 'warn' ? C.warn : C.strong
      return `<span style="display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: 6px; background: ${bg}; color: ${fg}; font-size: 12px; font-weight: ${on ? 700 : 500}; cursor: pointer">${label}</span>`
    })
    .join('')}</span>`

export const ini = (n) => {
  const [last, first] = n.split(', ')
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}

export const pupil = (name, sub) =>
  `${avatar(ini(name), { size: 30 })}<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>`

/* ── 1. shell anatomy ───────────────────────────────────────────────── */
export const TeacherShell = () =>
  artboard({
    caption: 'Thursday &middot; 6 August 2026 &middot; Term 2',
    title: 'Your day',
    activeRail: 'Today',
    activeTab: 'Today',
    body: `
      ${note('fix', 'The published canvas said this portal was <b>green</b>, on a <b>60px bar</b>, with <b>44px targets throughout</b>, and captions on all three portals. <code>teacher-portal.css</code> says otherwise: violet <b>#7B45D6</b>, re-pointed through the whole brand channel; a <b>56px</b> <code>.te-bar</code>; rail rows at <b>34px</b> min-height; and the caption <b>above</b> the title. This artboard follows the code.')}
      ${card({
        title: 'Why this shell is not the dashboard',
        sub: 'teacher-portal-shell.tsx, verbatim',
        pad: true,
        children: `<div style="display: flex; flex-direction: column; gap: 10px">
          ${[
            'A portal is not the dashboard with a different nav: a teacher signs in on a shared tablet between lessons, and the surface they get is anchored to a class and a term rather than to a module tree. That is SHL·07, and it is why this shell owns its rail instead of borrowing the admin one.',
            'The class rail sits above the navigation because it changes what every screen below it means. Picking Form 2A once is what lets Attendance, Enter marks and Lesson plans all agree about whose lesson this is.',
            'The bar&rsquo;s two lines: the caption is context — the school day this is, or the class the screen is anchored to — and the title is where the teacher stands. It does not greet them.',
            'The strip under the bar: the five screens a teacher moves between inside one lesson, promoted out of the rail so they are one tap away from wherever they are. Same routes as the rail — a second way in, not a second place to be.',
          ]
            .map((q) => `<div style="border-left: 2px solid ${V.bd}; padding-left: 11px; font-size: 12px; line-height: 1.6; color: ${C.mid}">${q}</div>`)
            .join('')}
        </div>`,
      })}
      ${grid(
        2,
        `${note('today', 'Touch targets, measured: there are no bottom tabs here; rail rows are <b>34px</b>, the bell is <b>32px</b>, the tab strip is <b>~35px</b> tall. The shell&rsquo;s own comment says it is for &ldquo;a shared tablet between lessons&rdquo;, which is a 44px surface.')}
         ${note('proposed', 'Raise rail rows and the bell to 44px at touch widths only &mdash; the same markup, one media query. The register&rsquo;s own controls already sit at 34&ndash;46px and are the ones that matter most; they are drawn at 44 here.')}`,
      )}
    `,
  })

/* ── 2. today ───────────────────────────────────────────────────────── */
export const TeacherToday = () =>
  artboard({
    caption: 'Thursday &middot; 6 August 2026 &middot; Term 2',
    title: 'Your day',
    activeRail: 'Today',
    activeTab: 'Today',
    body: `
      <div style="display: flex; align-items: flex-end; gap: 12px">
        <div style="flex: 1; min-width: 0">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.015em; color: ${C.strong}">Good morning, Nyathi</h2>
          <div style="font-size: 12.5px; color: ${C.mid}; margin-top: 3px">4 classes &middot; Term 2 &middot; 5 lessons today &middot; 2 free</div>
        </div>
        ${btn('Set new homework')}
      </div>

      <div style="border-radius: 12px; background: ${V.grad}; padding: 18px; color: #fff">
        <div style="font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: rgba(255,255,255,.78)">Right now &middot; Period 2</div>
        <h3 style="margin: 6px 0 0; font-size: 18px; font-weight: 700; letter-spacing: -.01em">Mark attendance &mdash; Form 2A &middot; Mathematics</h3>
        <div style="font-size: 13px; color: rgba(255,255,255,.86); margin-top: 5px">32 pupils on the class list &middot; nobody has been marked yet</div>
        <div style="display: inline-flex; align-items: center; height: 38px; padding: 0 16px; border-radius: 9px; background: rgba(255,255,255,.18); font-size: 13.5px; font-weight: 700; margin-top: 13px">Mark attendance &rarr;</div>
      </div>

      ${card({
        title: "Today's lessons",
        sub: '5 periods · 2 free',
        action: `<span style="display: inline-flex; align-items: center; height: 26px; padding: 0 11px; border-radius: 999px; background: ${V.soft}; color: ${V.strong}; font-size: 11.5px; font-weight: 700">Right now &middot; Period 2</span>`,
        children: [
          ['PD-01 · 08:00', 'Form 2B', 'Mathematics · Rm 4', 'Register taken', 'ok'],
          ['PD-02 · 08:40', 'Form 2A', 'Mathematics · Rm 4', 'Not marked', 'warn'],
          ['PD-03 · 09:40', 'Free', 'Staff room', '', ''],
          ['PD-04 · 10:20', 'Form 3A', 'Mathematics · Rm 4', 'Not marked', 'warn'],
          ['PD-05 · 11:00', 'Form 4A', 'Add. Mathematics · Rm 7', 'Not marked', 'warn'],
          ['PD-06 · 11:40', 'Free', 'Staff room', '', ''],
        ]
          .map(([period, cls, sub, state, tone], i, a) =>
            row(
              `${mono(period, { size: 11.5, color: C.body, width: 96, weight: 700 })}
               <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: ${cls === 'Free' ? 400 : 600}; color: ${cls === 'Free' ? C.subtle : C.strong}">${cls}</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}">${sub}</span></span>
               ${state ? `<span style="display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0"><span style="width: 7px; height: 7px; border-radius: 999px; background: ${tone === 'ok' ? C.ok : C.warn}"></span><span style="font-size: 12px; font-weight: 600; color: ${tone === 'ok' ? C.ok : C.warn}">${state}</span></span>` : ''}`,
              i === a.length - 1,
            ),
          )
          .join(''),
      })}

      ${grid(
        2,
        `${card({
          title: 'Papers to mark',
          action: `<span style="display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; background: ${C.warnBg}; color: ${C.warn}; font-size: 11px; font-weight: 700">3 waiting</span>`,
          children: [
            ['Form 2A · Mathematics · End of term', '18 of 32 marked', '14'],
            ['Form 3A · Mathematics · Mid-term test', '22 of 30 marked', '8'],
            ['Form 4A · Add. Mathematics · Mock', '0 of 18 marked', '18'],
          ]
            .map(([t, sub, n], i, a) =>
              row(
                `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${t}</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}">${sub}</span></span>
                 <span style="text-align: right; flex-shrink: 0"><span class="mono" style="display: block; font-size: 17px; font-weight: 700; color: ${C.strong}">${n}</span><span style="font-size: 10.5px; color: ${C.subtle}">to go</span></span>`,
                i === a.length - 1,
              ),
            )
            .join(''),
        })}
        ${card({
          title: 'This week',
          pad: true,
          children: grid(
            3,
            [stat('Registers unmarked', '3', '', 'warn'), stat('Papers to mark', '40', 'Across 3 assessments'), stat('Homework open', '5', 'Set by you, still collecting')].join(''),
            10,
          ),
        })}`,
      )}
      ${note('today', 'The design intent, verbatim: <b>&ldquo;every period of the day is a cell, free ones included, and the register a teacher has not taken is a lit cell rather than a missing one. A screen that only listed what had been done would be silent about exactly the thing a teacher is behind on.&rdquo;</b>')}
    `,
  })

/* ── 3. register ────────────────────────────────────────────────────── */
const REGISTER = [
  ['Chikwanda, Rutendo', 'CHS-1180', 'Present'],
  ['Dube, Tapiwa', 'CHS-1204 · boarder', 'Present'],
  ['Gwatidzo, Rufaro', 'CHS-1277', 'Late'],
  ['Mafuta, Simba', 'CHS-1301', 'Present'],
  ['Marange, Tadiwa', 'CHS-1288 · boarder', 'Present'],
  ['Moyo, Farai', 'CHS-1211', 'Absent'],
  ['Mutasa, Tanaka', 'CHS-1219 · boarder', 'Present'],
  ['Ncube, Tariro', 'CHS-1292', ''],
  ['Nyathi, Kudzai', 'CHS-1233', ''],
]

const MARK_OPTIONS = [
  ['Present', 'ok'],
  ['Absent', 'bad'],
  ['Late', 'warn'],
  ['Excused', 'plain'],
]

export const TeacherRegister = () =>
  artboard({
    caption: 'Form 2A &middot; Mathematics &middot; Term 2',
    title: 'Mark the register',
    activeRail: 'Attendance',
    activeTab: 'Today',
    body: `
      ${card({
        title: 'Form 2A · Mathematics',
        sub: 'Term 2 · 32 pupils on the class list',
        action: `<span style="display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}">${icon(I.calendar, { size: 14 })}<span class="mono" style="font-size: 12.5px; color: ${C.body}">2026-08-06</span></span>`,
        children: `
          <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; background: ${C.border}; border-bottom: 1px solid ${C.border}">
            ${[
              ['Present', '24', C.okBg, C.ok],
              ['Absent', '3', C.badBg, C.bad],
              ['Late', '1', C.warnBg, C.warn],
              ['Not marked', '4', C.muted, C.mid],
            ]
              .map(
                ([label, value, bg, fg]) =>
                  `<div style="background: ${bg}; padding: 10px 14px"><div class="mono" style="font-size: 26px; font-weight: 700; line-height: 1; color: ${fg}">${value}</div><div style="font-size: 11px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: ${fg}; margin-top: 5px">${label}</div></div>`,
              )
              .join('')}
          </div>
          <div style="display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-bottom: 1px solid ${C.borderSubtle}">
            <span style="font-size: 11.5px; font-weight: 600; color: ${C.mid}">Quick mark</span>
            ${btn('Everyone present', 'quiet')}${btn('Everyone absent')}<span style="opacity: .4">${btn('Undo my changes')}</span>
          </div>
          ${REGISTER.map(([name, sub, state], i, a) =>
            row(`${pupil(name, sub)}${!state ? badge('Not marked', 'warn') : ''}${seg(MARK_OPTIONS, state)}`, i === a.length - 1),
          ).join('')}`,
      })}
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}; box-shadow: 0 -6px 18px -8px rgba(22,24,29,.1)">
        <span style="flex: 1; min-width: 0; font-size: 13px; color: ${C.body}">24 present &middot; 3 absent &middot; 1 late<span style="color: ${C.warn}"> &middot; 4 still unmarked</span></span>
        ${btn('Save the register', 'solid')}
      </div>
      ${note('today', 'The intent, verbatim: <b>&ldquo;Marking is a single tap, not a dropdown, because it happens standing up with a class waiting. Unmarked is its own state rather than being silently treated as present.&rdquo;</b> The register is drawn mid-task &mdash; 28 of 32 &mdash; because that is the state a teacher actually sees, and the four blanks are what the design has to make obvious.')}
    `,
  })

export const TeacherRegisterLocked = () =>
  artboard({
    caption: 'Form 2A &middot; Mathematics &middot; Term 2',
    title: 'Mark the register',
    activeRail: 'Attendance',
    activeTab: 'Today',
    body: `
      <div style="display: flex; gap: 11px; padding: 13px 15px; border: 1px solid ${C.warnBd}; border-radius: 11px; background: ${C.warnBg}">
        ${icon(I.lock, { size: 17, stroke: C.warn, w: 1.9 })}
        <div><div style="font-size: 13px; font-weight: 700; color: ${C.warn}">This register is locked</div><div style="font-size: 12.5px; color: ${C.warn}; opacity: .9; margin-top: 2px; line-height: 1.5">The office has closed this day. Ask them to reopen it if something needs changing.</div></div>
      </div>
      ${card({
        title: 'Form 2A · Mathematics',
        sub: 'Term 2 · 32 pupils on the class list',
        children: `<div style="opacity: .55">${REGISTER.slice(0, 5)
          .map(([name, sub, state], i, a) => row(`${pupil(name, sub)}${seg(MARK_OPTIONS, state)}`, i === a.length - 1))
          .join('')}</div>`,
      })}
      ${note('proposed', 'Locked is drawn because it is the state a teacher meets when they are in the wrong. What is missing is the way out: the alert says &ldquo;ask them&rdquo; and gives no way to ask. A <b>Request this day is reopened</b> action, writing a message to the office with the class and the date already in it, is one button on a screen that knows both.')}
    `,
  })

export const TeacherRegisterOffline = () =>
  artboard({
    caption: 'Form 2A &middot; Mathematics &middot; Term 2',
    title: 'Mark the register',
    activeRail: 'Attendance',
    activeTab: 'Today',
    online: false,
    body: `
      <div style="display: flex; gap: 11px; padding: 13px 15px; border: 1px solid ${C.badBd}; border-radius: 11px; background: ${C.badBg}">
        ${icon(I.wifiOff, { size: 17, stroke: C.bad, w: 1.9 })}
        <div><div style="font-size: 13px; font-weight: 700; color: ${C.bad}">There is no connection, and this register will not save</div><div style="font-size: 12.5px; color: ${C.bad}; opacity: .9; margin-top: 2px; line-height: 1.6">Nothing queues on the device: a register needs a connection at the moment you save it. If the room has no signal, take the register on paper and enter it later against that date rather than leaving the tablet open and hoping.</div></div>
      </div>
      ${card({
        title: 'Form 2A · Mathematics',
        sub: 'Term 2 · 32 pupils on the class list',
        children: `<div style="opacity: .5">${REGISTER.slice(0, 5)
          .map(([name, sub, state], i, a) => row(`${pupil(name, sub)}${seg(MARK_OPTIONS, state)}`, i === a.length - 1))
          .join('')}</div>`,
      })}
      ${note('today', 'That warning is the portal&rsquo;s own words, taken from the Help screen&rsquo;s answer to <b>&ldquo;Does the portal work without a connection?&rdquo;</b> &mdash; where it is buried nine rows down an accordion. It belongs here, where the teacher is standing in a room with no signal.')}
      ${note('proposed', 'The honest fix: the chip in the bar goes amber the moment the connection drops, this banner appears <b>before</b> the first tap rather than after the failed save, and the button reads <b>Cannot save while offline</b> rather than failing on press.')}
    `,
  })

/* ── 4. marks ───────────────────────────────────────────────────────── */
export const TeacherMarks = () =>
  artboard({
    caption: 'Form 2A &middot; Mathematics &middot; Term 2',
    title: 'Enter marks',
    activeRail: 'Enter marks',
    activeTab: 'Marks',
    body: `
      ${card({
        title: 'End of term — out of 100',
        sub: 'Form 2A · Mathematics · 18 of 32 marked, 14 still blank',
        action: `<span style="display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}"><span style="font-size: 12.5px; color: ${C.body}">End of term &middot; out of 100</span>${icon(I.chevD, { size: 13, stroke: C.faint, w: 2 })}</span>`,
        children: [
          ['Chikwanda, Rutendo', 'CHS-1180', '64', '64%'],
          ['Dube, Tapiwa', 'CHS-1204', '71', '71%'],
          ['Gwatidzo, Rufaro', 'CHS-1277', '58', '58%'],
          ['Mafuta, Simba', 'CHS-1301', '', ''],
          ['Marange, Tadiwa', 'CHS-1288', '77', '77%'],
          ['Moyo, Farai', 'CHS-1211', 'absent', ''],
          ['Mutasa, Tanaka', 'CHS-1219', '78', '78%'],
          ['Ncube, Tariro', 'CHS-1292', '', ''],
        ]
          .map(([name, no, score, pct], i, a) =>
            row(
              `${pupil(name, no)}
               <span style="width: 56px; flex-shrink: 0; text-align: right">${pct ? mono(pct, { size: 12.5, color: C.body, weight: 700 }) : ''}</span>
               ${score === 'absent' ? btn('Was absent', 'quiet') : btn('Mark absent')}
               <span style="width: 84px; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; height: 36px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}"><span class="mono" style="font-size: 13.5px; font-weight: 700; color: ${score && score !== 'absent' ? C.strong : C.faint}">${score && score !== 'absent' ? score : '&mdash;'}</span></span>`,
              i === a.length - 1,
            ),
          )
          .join(''),
      })}
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}">
        <span style="flex: 1; font-size: 13px; color: ${C.body}">18 of 32 marked &middot; 14 still blank</span>
        ${btn('Save the marks', 'solid')}
      </div>
      ${note('today', 'A mark saved here is <b>not a published mark</b> &mdash; the Settings screen says so plainly, and says the office holds the publish window. That window has no screen anywhere in the product. A teacher can enter every mark in the school and no parent will see one.')}
    `,
  })

export const TeacherMarksBook = () =>
  artboard({
    caption: 'Form 2A &middot; Mathematics &middot; Term 2',
    title: 'Marks book',
    activeRail: 'Marks book',
    activeTab: 'Marks',
    body: `
      ${card({
        title: 'Form 2A · Mathematics',
        sub: '60 continuous / 40 exam · 24 of 32 with a mark · class average 64%',
        children: `
          <div style="display: flex; align-items: center; gap: 12px; padding: 9px 16px; border-bottom: 1px solid ${C.border}; background: ${C.canvas}">
            ${['Pupil', 'Continuous', 'Exam', 'Term mark', 'Grade']
              .map(
                (h, i) =>
                  `<span style="font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: ${C.mid}; ${i === 0 ? 'flex: 1; min-width: 0' : 'width: 106px; flex-shrink: 0; text-align: right'}">${h}</span>`,
              )
              .join('')}
          </div>
          ${[
            ['Chikwanda, Rutendo', 'CHS-1180', '62', '64', '63', 'C', 'warn'],
            ['Dube, Tapiwa', 'CHS-1204', '74', '71', '73', 'A', 'ok'],
            ['Gwatidzo, Rufaro', 'CHS-1277', '48', '58', '52', 'C', 'warn'],
            ['Mafuta, Simba', 'CHS-1301', '—', '—', 'Not marked', '—', 'plain'],
            ['Moyo, Farai', 'CHS-1211', '38', '—', '38', 'F', 'bad'],
            ['Mutasa, Tanaka', 'CHS-1219', '80', '78', '79', 'A', 'ok'],
          ]
            .map(([name, no, cont, exam, term, grade, tone], i, a) =>
              row(
                `${pupil(name, no)}
                 ${[cont, exam, term].map((v) => `<span style="width: 106px; flex-shrink: 0; text-align: right">${mono(v, { size: 12.5, color: v === 'Not marked' ? C.subtle : v === '—' ? C.faint : C.body, weight: v === '—' || v === 'Not marked' ? 400 : 700 })}</span>`).join('')}
                 <span style="width: 106px; flex-shrink: 0; display: flex; justify-content: flex-end">${grade === '—' ? mono('—', { size: 12.5, color: C.faint }) : badge(grade, tone)}</span>`,
                i === a.length - 1,
              ),
            )
            .join('')}`,
      })}
      ${note('today', 'Read-only, and right to be: this is the sheet a teacher reads down before a parents&rsquo; evening. <b>Not marked</b> is spelled out where a term mark is missing, rather than a dash that could be read as a zero.')}
    `,
  })

/* ── 5. week grid ───────────────────────────────────────────────────── */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const PERIODS = ['08:00', '08:40', '09:40', '10:20', '11:00']
const WEEK = {
  '0|0': ['Form 2B', 'Mathematics', 'Rm 4', '#0B5DF0'],
  '0|1': ['Form 2A', 'Mathematics', 'Rm 4', '#7B45D6'],
  '0|3': ['Form 3A', 'Mathematics', 'Rm 4', '#13857D'],
  '1|0': ['Form 2A', 'Mathematics', 'Rm 4', '#7B45D6'],
  '1|2': ['Form 4A', 'Add. Mathematics', 'Rm 7', '#E06A16'],
  '1|4': ['Form 2B', 'Mathematics', 'Rm 4', '#0B5DF0'],
  '2|1': ['Form 3A', 'Mathematics', 'Rm 4', '#13857D'],
  '2|3': ['Form 2A', 'Mathematics', 'No room set', '#7B45D6'],
  '3|0': ['Form 2A', 'Mathematics', 'Rm 4', '#7B45D6'],
  '3|2': ['Form 1C', 'Mathematics', 'Rm 9', 'cover'],
  '3|4': ['Form 4A', 'Add. Mathematics', 'Rm 7', '#E06A16'],
  '4|1': ['Form 2B', 'Mathematics', 'Rm 4', '#0B5DF0'],
  '4|3': ['Form 3A', 'Mathematics', 'Rm 4', '#13857D'],
}

const weekGrid = (cell) => `
  <div style="overflow-x: auto">
    <div style="min-width: 736px; display: grid; grid-template-columns: 5.5rem repeat(5, minmax(8rem, 1fr)); gap: 5px">
      <div></div>
      ${DAYS.map((d) => `<div style="font-size: 11.5px; font-weight: 700; color: ${C.mid}; padding: 4px 6px">${d}</div>`).join('')}
      ${PERIODS.map(
        (time, p) =>
          `<div style="padding: 8px 6px"><div style="font-size: 12px; font-weight: 700; color: ${C.strong}">P${p + 1}</div>${mono(time, { size: 10.5 })}</div>` +
          DAYS.map((_, d) => cell(WEEK[`${d}|${p}`], d, p)).join(''),
      ).join('')}
    </div>
  </div>`

const timetableCell = (l) => {
  if (!l)
    return `<div style="min-height: 4.25rem; border: 1px dashed ${C.borderStrong}; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px"><span style="font-size: 12px; font-weight: 600; color: ${C.faint}">Free</span><span style="font-size: 10px; color: ${C.faint}">Nothing timetabled</span></div>`
  const cover = l[3] === 'cover'
  const hue = cover ? C.orange : l[3]
  return `<div style="min-height: 4.25rem; padding: 8px 9px; border: 1px solid ${cover ? C.orangeBd : C.border}; border-radius: 8px; background: ${cover ? C.orangeBg : C.surface}; display: flex; flex-direction: column; gap: 2px">
    <span style="display: flex; align-items: center; gap: 5px"><span style="width: 6px; height: 6px; border-radius: 999px; background: ${hue}"></span><span style="font-size: 12px; font-weight: 700; color: ${C.strong}">${l[0]}</span>${cover ? badge('Cover', 'orange') : ''}</span>
    <span style="font-size: 11px; color: ${C.mid}">${l[1]}</span>
    <span style="font-size: 10.5px; color: ${l[2] === 'No room set' ? C.warn : C.subtle}; margin-top: auto">${l[2]}</span>
  </div>`
}

export const TeacherTimetable = () =>
  artboard({
    caption: 'Term 2 &middot; 1 &ndash; 5 June 2026',
    title: 'Your week',
    activeRail: 'Timetable',
    activeTab: 'Timetable',
    body: `
      <div style="display: flex; gap: 11px; padding: 12px 14px; border: 1px solid ${C.orangeBd}; border-radius: 11px; background: ${C.orangeBg}">
        ${icon(I.info, { size: 17, stroke: C.orangeFg, w: 1.9 })}
        <div><div style="font-size: 13px; font-weight: 700; color: ${C.orangeFg}">You are covering 1 lesson this week</div><div style="font-size: 12.5px; color: ${C.orangeFg}; opacity: .9; margin-top: 2px; line-height: 1.5">A cover lesson is another teacher&rsquo;s class, taken by you for one day. It sits in your week in orange, and the plan they left for you is on the card.</div></div>
      </div>
      ${card({
        title: 'Term 2',
        sub: '13 lessons · 12 free periods · this week',
        action: `<span style="display: flex; align-items: center; gap: 8px">${btn('This week')}<span class="mono" style="font-size: 12px; color: ${C.mid}">1 &ndash; 5 June 2026</span></span>`,
        pad: true,
        children: `${weekGrid(timetableCell)}
          <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 13px; padding-top: 12px; border-top: 1px solid ${C.borderSubtle}">
            ${[
              ['Form 2A', '#7B45D6'],
              ['Form 2B', '#0B5DF0'],
              ['Form 3A', '#13857D'],
              ['Form 4A', '#E06A16'],
              ['Cover lesson', C.orange],
            ]
              .map(([l, h]) => `<span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 8px; height: 8px; border-radius: 2px; background: ${h}"></span><span style="font-size: 11.5px; color: ${C.mid}">${l}</span></span>`)
              .join('')}
          </div>`,
      })}
      ${note('today', 'Verbatim: <b>&ldquo;Days across, periods down &mdash; the shape a timetable has on a staffroom wall. A list of lessons cannot do that: it throws away the empty space, which is half the information. Free periods are drawn, not omitted.&rdquo;</b> And: cover <b>&ldquo;carries the word &lsquo;Cover&rsquo; as well, because a lesson somebody else&rsquo;s class is waiting for must not be distinguishable by colour alone.&rdquo;</b>')}
    `,
  })

const lessonCell = (l, d, p) => {
  if (!l) return `<div style="min-height: 4.5rem; border: 1px dashed ${C.borderStrong}; border-radius: 8px; display: flex; align-items: center; justify-content: center"><span style="font-size: 11.5px; color: ${C.faint}">Free</span></div>`
  const cover = l[3] === 'cover'
  const planned = (d + p) % 3 !== 0
  return `<div style="min-height: 4.5rem; padding: 8px 9px; border: 1px solid ${cover ? C.orangeBd : C.border}; border-radius: 8px; background: ${cover ? C.orangeBg : C.surface}; display: flex; flex-direction: column; gap: 3px">
    <span style="font-size: 11.5px; font-weight: 700; color: ${planned ? C.strong : C.warn}">${planned ? ['Linear equations', 'Simultaneous eqns', 'Graphs of functions', 'Indices and surds'][(d + p) % 4] : 'Not written yet'}</span>
    <span style="font-size: 10.5px; color: ${C.subtle}">${l[0]} &middot; ${l[2]}</span>
    ${cover ? badge('Cover', 'orange') : ''}
  </div>`
}

export const TeacherLessons = () =>
  artboard({
    caption: 'Form 2A &middot; Mathematics &middot; Term 2',
    title: 'Lesson plans',
    activeRail: 'Lesson plans',
    activeTab: 'Lessons',
    body: `
      ${card({
        title: 'Term 2',
        sub: '9 of 13 lessons planned',
        action: `<span style="display: flex; align-items: center; gap: 8px">${btn('Lay out this week (4)', 'quiet')}${btn('Copy last week forward (4)')}<span style="display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; background: ${C.warnBg}; color: ${C.warn}; font-size: 11px; font-weight: 700">4 not written</span></span>`,
        pad: true,
        children: weekGrid(lessonCell),
      })}
      ${grid(
        2,
        `${note('today', 'Verbatim: <b>&ldquo;The plan itself is a drawer rather than a page: writing Tuesday&rsquo;s objectives while looking at Monday&rsquo;s is how a scheme of work stays coherent.&rdquo;</b> And of the assist: <b>&ldquo;It names its size before it runs and it never overwrites.&rdquo;</b>')}
         ${note('today', '<b>Lay out this week</b> drafts from the scheme of work &mdash; the same one the admin app writes at <code>/schools/academics/syllabus</code>. That is the only place in campus where an admin screen and a portal screen are two ends of one feature, and neither links to the other.')}`,
      )}
    `,
  })

/* ── 6. homework ────────────────────────────────────────────────────── */
const progress = (label, value, max, tone) => `
  <div style="flex: 1; min-width: 0">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px"><span style="font-size: 11px; color: ${C.mid}">${label}</span><span class="mono" style="font-size: 11px; font-weight: 700; color: ${C.body}">${value}/${max}</span></div>
    <div style="height: 6px; border-radius: 999px; background: ${C.sunken}; overflow: hidden"><div style="width: ${max ? Math.round((value / max) * 100) : 0}%; height: 100%; background: ${tone === 'ok' ? C.ok : V.brand}"></div></div>
  </div>`

export const TeacherHomework = () =>
  artboard({
    caption: 'Term 2 &middot; all my classes',
    title: 'Homework and tasks',
    activeRail: 'Homework',
    activeTab: 'Lessons',
    body: `
      <div style="display: flex; align-items: flex-end; gap: 12px">
        <div style="flex: 1; min-width: 0; font-size: 12.5px; color: ${C.mid}; line-height: 1.5">Everything you have set this term. Open one to see who has handed in and what is still to mark.</div>
        ${btn('Set homework', 'solid')}
      </div>
      <div style="display: flex; gap: 10px">
        ${[
          ['Class', 'All my classes'],
          ['Show', 'Everything set'],
        ]
          .map(
            ([l, v]) =>
              `<span style="display: flex; flex-direction: column; gap: 4px; width: 200px"><span style="font-size: 10.5px; font-weight: 600; color: ${C.mid}">${l}</span><span style="display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}"><span style="flex: 1; font-size: 12.5px; color: ${C.body}">${v}</span>${icon(I.chevD, { size: 13, stroke: C.faint, w: 2 })}</span></span>`,
          )
          .join('')}
      </div>
      ${[
        ['Form 2A · Mathematics', 'Simultaneous equations, exercise 4', 'Given to the class', 'ok', 'Set 17 Aug · due 21 Aug', 'Out of 20', 28, 32, 12, 28],
        ['Form 2B · Mathematics', 'Revision: chapters 6 and 7', 'Draft', 'warn', 'Set 22 Aug · no deadline', 'Not marked out of anything', 0, 31, 0, 1],
        ['Form 3A · Mathematics', 'Graph plotting, questions 1–8', 'Given to the class', 'ok', 'Set 14 Aug · due 20 Aug', 'Out of 30', 30, 30, 30, 30],
      ]
        .map(
          ([cls, title, state, tone, dates, outOf, handed, roll, marked, handedMax]) => `
        <div style="border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}; padding: 14px 16px; display: flex; flex-direction: column; gap: 11px">
          <div style="display: flex; align-items: center; gap: 7px; flex-wrap: wrap">
            ${badge(cls, 'plain')}
            <span style="display: inline-flex; align-items: center; gap: 6px; height: 19px; padding: 0 8px; border-radius: 5px; background: ${tone === 'ok' ? C.okBg : C.warnBg}; color: ${tone === 'ok' ? C.ok : C.warn}; font-size: 10.5px; font-weight: 600"><span style="width: 6px; height: 6px; border-radius: 999px; background: currentColor"></span>${state}</span>
            ${badge(outOf, 'plain')}
          </div>
          <div>
            <div style="font-size: 14px; font-weight: 700; color: ${C.strong}">${title}</div>
            <div style="font-size: 11.5px; color: ${C.subtle}; margin-top: 2px">${dates}</div>
          </div>
          <div style="display: flex; gap: 16px">${progress('Handed in', handed, roll)}${progress('Marked', marked, handedMax, 'ok')}</div>
          ${grid(3, [stat('Handed in', `${Math.round((handed / roll) * 100)}%`), stat('Marked', `${handedMax ? Math.round((marked / handedMax) * 100) : 0}%`), stat('Waiting', String(roll - handed), '', roll - handed > 0 ? 'warn' : 'ok')].join(''), 10)}
        </div>`,
        )
        .join('')}
      ${note('today', 'Verbatim, and worth keeping: <b>&ldquo;Handed in is counted against the roll. Marked is counted against what was handed in, because a teacher cannot mark work that has not arrived, and scoring it out of thirty would make a finished evening look like a half-done one.&rdquo;</b>')}
    `,
  })

/* ── 7. messages ────────────────────────────────────────────────────── */
export const TeacherMessages = () =>
  artboard({
    caption: 'Term 2 &middot; 6 new',
    title: 'Messages',
    activeRail: 'Messages',
    activeTab: 'Messages',
    body: `
      ${card({
        title: 'Parent messages',
        sub: '14 conversations',
        action: `<span style="display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; background: ${C.warnBg}; color: ${C.warn}; font-size: 11px; font-weight: 700">6 new</span>`,
        children: [
          ['Grace Mutasa', 'Thank you — I will make sure he brings the calculator on Thursday.', 're: Tanaka Mutasa', '22 Aug, 19:14', true],
          ['Tsitsi Moyo', 'Farai has been unwell since Monday, I have kept him at home.', 're: Farai Moyo', '22 Aug, 07:02', true],
          ['Regis Dube', 'Is there extra help available before the mock?', 're: Tapiwa Dube', '21 Aug, 20:41', false],
          ['Esther Chikwanda', 'About the trip permission form — I posted it back with Rutendo.', 'General enquiry · to the office', '20 Aug, 16:28', false],
        ]
          .map(([who, preview, ctx, when, unread], i, a) =>
            row(
              `${unread ? `<span style="width: 8px; height: 8px; border-radius: 999px; background: ${V.brand}; flex-shrink: 0"></span>` : '<span style="width: 8px; flex-shrink: 0"></span>'}
               ${avatar(who.split(' ').map((p) => p[0]).join(''), { size: 30 })}
               <span style="flex: 1; min-width: 0">
                 <span style="display: block; font-size: 13px; font-weight: ${unread ? 700 : 600}; color: ${C.strong}">${who}</span>
                 <span style="display: block; font-size: 12px; color: ${C.mid}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${preview}</span>
                 <span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 1px">${ctx}</span>
               </span>
               ${mono(when, { size: 10.5 })}`,
              i === a.length - 1,
            ),
          )
          .join(''),
      })}
      ${card({
        title: 'Calculator for Thursday',
        sub: 'Grace Mutasa · about Tanaka Mutasa',
        action: btn('Back to all'),
        pad: true,
        children: `<div style="display: flex; flex-direction: column; gap: 10px">
          <div style="max-width: 74%; padding: 10px 13px; border: 1px solid ${C.border}; border-radius: 12px 12px 12px 3px; background: ${C.surface}"><div style="font-size: 12.5px; color: ${C.body}; line-height: 1.55">Good evening. Tanaka says he needs a scientific calculator for Thursday &mdash; is that right?</div><div style="font-size: 10.5px; color: ${C.subtle}; margin-top: 5px">22 Aug, 18:40</div></div>
          <div style="max-width: 74%; margin-left: auto; padding: 10px 13px; border-radius: 12px 12px 3px 12px; background: ${V.soft}"><div style="font-size: 12.5px; color: ${V.strong}; line-height: 1.55">Yes &mdash; we start on trigonometry on Thursday and they will each need one. The school shop has them.</div><div style="font-size: 10.5px; color: ${V.strong}; opacity: .7; margin-top: 5px">22 Aug, 19:02</div></div>
          <div style="max-width: 74%; padding: 10px 13px; border: 1px solid ${C.border}; border-radius: 12px 12px 12px 3px; background: ${C.surface}"><div style="font-size: 12.5px; color: ${C.body}; line-height: 1.55">Thank you &mdash; I will make sure he brings the calculator on Thursday.</div><div style="font-size: 10.5px; color: ${C.subtle}; margin-top: 5px">22 Aug, 19:14</div></div>
          <div style="display: flex; gap: 10px; align-items: flex-end; margin-top: 4px">
            <span style="flex: 1; min-height: 62px; padding: 10px 12px; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}; font-size: 12.5px; color: ${C.subtle}">Write a reply</span>
            ${btn('Send', 'solid')}
          </div>
        </div>`,
      })}
      ${note('today', 'Verbatim: <b>&ldquo;A list of people, not of rooms. Opening a thread marks it read in the same request, because a badge that survives the screen meant to clear it is a badge people stop believing.&rdquo;</b>')}
    `,
  })

/* ── 8. reports ─────────────────────────────────────────────────────── */
export const TeacherReports = () =>
  artboard({
    caption: 'Term 2 &middot; 4 classes',
    title: 'Reports',
    activeRail: 'Reports',
    activeTab: 'Today',
    body: `
      <div>
        <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: ${C.strong}">Your classes this term</h2>
        <div style="font-size: 12.5px; color: ${C.mid}; margin-top: 3px">Term 2 &middot; counted from the registers you have taken, the marks you have entered and the homework you have set</div>
      </div>
      ${grid(
        4,
        [
          stat('Attendance', '88%', '164 registers taken', 'warn'),
          stat('At or above the pass mark', '71%', '84 of 118 marked'),
          stat('Average term mark', '64%', '84 of 111 on the rolls'),
          stat('Homework handed in', '76%', '12 set this term', 'warn'),
        ].join(''),
      )}
      ${card({
        title: 'Class by class',
        sub: 'Every figure opens the list it was counted from',
        children: `
          <div style="display: flex; align-items: center; gap: 12px; padding: 9px 16px; border-bottom: 1px solid ${C.border}; background: ${C.canvas}">
            ${['Class', 'Attendance', 'Average', 'Passing', 'Homework in']
              .map((h, i) => `<span style="font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: ${C.mid}; ${i === 0 ? 'flex: 1' : 'width: 116px; flex-shrink: 0; text-align: right'}">${h}</span>`)
              .join('')}
          </div>
          ${[
            ['Form 2A · Mathematics', '92%', '68%', '78%', '88%'],
            ['Form 2B · Mathematics', '86%', '61%', '65%', '71%'],
            ['Form 3A · Mathematics', '89%', '66%', '74%', '80%'],
            ['Form 4A · Add. Mathematics', '84%', '58%', '61%', '58%'],
          ]
            .map(([cls, ...vals], i, a) =>
              row(
                `<span style="flex: 1; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${cls}</span>
                 ${vals.map((v) => `<span style="width: 116px; flex-shrink: 0; text-align: right"><span class="mono" style="font-size: 12.5px; font-weight: 700; color: ${V.strong}; text-decoration: underline; text-underline-offset: 3px">${v}</span></span>`).join('')}`,
                i === a.length - 1,
              ),
            )
            .join('')}`,
      })}
      ${card({
        title: 'Children to look at',
        sub: 'In for less than 80% of their registers, or holding a term mark under 40%',
        children: [
          ['Moyo, Farai', 'CHS-1211 · Form 2B', '68% in · term mark 38%'],
          ['Ncube, Tariro', 'CHS-1292 · Form 3A', '74% in · term mark 44%'],
          ['Mafuta, Simba', 'CHS-1301 · Form 4A', '81% in · term mark 36%'],
        ]
          .map(([name, sub, why], i, a) => row(`${pupil(name, sub)}${txt(why, { size: 12, color: C.bad })}`, i === a.length - 1))
          .join(''),
      })}
      ${note('today', 'The best paragraph in the portal, from this screen&rsquo;s source: <b>&ldquo;What the demo shows and this does not: deltas against last term, a distinctions count, and a week/term/year range switch. None of the three is computable from what the school records&hellip; and a number invented to fill a tile is worse than a tile that is not there.&rdquo;</b>')}
    `,
  })

/* ── 9. profile ─────────────────────────────────────────────────────── */
export const TeacherProfile = () =>
  artboard({
    caption: 'Term 2',
    title: 'Your profile',
    activeRail: 'Profile',
    activeTab: 'Today',
    body: `
      ${grid(
        'minmax(0, 1.4fr) minmax(0, 1fr)',
        `${card({
          title: 'Held by the school office',
          sub: 'These are read-only here. Ask the office to change them.',
          children: [
            ['Name', 'School office', 'It appears on registers, mark sheets and anything sent to parents, so it follows the staff record rather than a portal edit.'],
            ['Staff code', 'School office', 'Issued once with your employment record and used to tie your account to it.'],
            ['Email', 'School office', 'It is how you sign in. Changing it changes the account, which is an administrator&rsquo;s job.'],
            ['Job title', 'Human resources', 'Read from the employee record. It also decides some of what this portal lets you do.'],
            ['Photograph', 'School office', 'Set on your account. Without one, your initials stand in wherever you are listed.'],
            ['Classes and subjects', 'School office', 'Teaching assignments are made per term against the timetable. They end when the term does.'],
          ]
            .map(([field, owner, why], i, a) =>
              row(
                `<span style="flex: 1; min-width: 0"><span style="display: flex; align-items: center; gap: 7px"><span style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">${field}</span>${badge(owner, 'plain')}</span><span style="display: block; font-size: 11.5px; color: ${C.mid}; line-height: 1.5; margin-top: 3px">${why}</span></span>`,
                i === a.length - 1,
              ),
            )
            .join(''),
        })}
        <div style="display: flex; flex-direction: column; gap: 12px">
          ${card({
            pad: true,
            children: `<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center">
              ${avatar('PN', { size: 56, bg: V.soft, fg: V.strong })}
              <div><div style="font-size: 15px; font-weight: 700; color: ${C.strong}">Priscilla Nyathi</div><div style="font-size: 12px; color: ${C.mid}">Head of department</div></div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center">${badge('Mathematics', 'violet')}${badge('Add. Mathematics', 'violet')}</div>
              ${btn('Settings')}
            </div>`,
          })}
          ${card({
            title: 'This term',
            pad: true,
            children: grid(3, [stat('Classes', '4'), stat('Pupils', '111'), stat('Subjects', '2')].join(''), 8) + `<div style="font-size: 11.5px; color: ${C.subtle}; margin-top: 10px">5 lessons on today&rsquo;s timetable</div>`,
          })}
          <div style="border: 1px solid ${V.bd}; border-radius: 12px; background: ${V.soft}; padding: 13px 15px">
            <div style="font-size: 13px; font-weight: 700; color: ${V.strong}">Something here is wrong</div>
            <div style="font-size: 12px; color: ${V.strong}; opacity: .88; margin-top: 3px; line-height: 1.55">Send the office the correction rather than working around it. A register, a mark sheet and a parent message all read the same staff record, so fixing it once fixes it everywhere.</div>
          </div>
        </div>`,
      )}
      ${note('today', 'Verbatim: <b>&ldquo;The demo answers this with an &lsquo;Edit profile&rsquo; button that raises a toast saying the edit is pending admin approval &mdash; a control that looks live and does nothing. Naming the owner is more useful than a disabled input.&rdquo;</b> That is the same principle the States sheet applies to permissions.')}
    `,
  })

/* ── 10. settings ───────────────────────────────────────────────────── */
const settingRow = (label, right, why, last) =>
  row(
    `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${label}</span>${why ? `<span style="display: block; font-size: 11.5px; color: ${C.mid}; line-height: 1.5; margin-top: 2px">${why}</span>` : ''}</span>${right}`,
    last,
  )

const toggle = (on) =>
  `<span style="width: 36px; height: 21px; border-radius: 999px; background: ${on ? V.brand : C.borderStrong}; position: relative; flex-shrink: 0"><span style="position: absolute; top: 2px; ${on ? 'right: 2px' : 'left: 2px'}; width: 17px; height: 17px; border-radius: 999px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.18)"></span></span>`

export const TeacherSettings = () =>
  artboard({
    caption: 'Your account',
    title: 'Settings',
    activeRail: 'Settings',
    activeTab: 'Today',
    body: `
      <div style="display: flex; gap: 16px; align-items: flex-start">
        <div style="width: 196px; flex-shrink: 0; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}; padding: 10px 8px">
          <div style="padding: 4px 9px 7px">${sectionLabel('Your account')}</div>
          ${[
            ['Notifications', 'Bell'],
            ['Mark publishing', 'CheckSquareOffset'],
            ['Appearance', 'Eye'],
            ['Security', 'Lock'],
            ['Privacy and data', 'ShieldCheck'],
          ]
            .map((l) => railItem(l, 'Mark publishing'))
            .join('')}
        </div>
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px">
          <div>
            <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: ${C.strong}">Mark publishing</h2>
            <div style="font-size: 12.5px; color: ${C.mid}; margin-top: 3px">The school sets these, not you. They decide when what you enter reaches a parent.</div>
          </div>
          ${card({
            children: `
              ${settingRow('Who publishes marks', badge('The office', 'plain'), '', false)}
              ${settingRow('Approval before parents see a mark', badge('Required', 'plain'), '', false)}
              ${settingRow('Publish window', badge('Set by the office', 'plain'), 'The office opens a window per term.', false)}
              ${settingRow('Grade instead of the raw mark in messages', badge('Not yet available', 'warn'), '', true)}`,
          })}
          <div style="border: 1px solid ${V.bd}; border-radius: 12px; background: ${V.soft}; padding: 13px 15px">
            <div style="font-size: 13px; font-weight: 700; color: ${V.strong}">A mark you have saved is not a published mark</div>
          </div>
          ${card({
            title: 'Notifications',
            children: `
              ${settingRow('Notifications in the portal', toggle(true), 'Shows the notification centre while you work. Turning it off silences the portal itself.', false)}
              ${settingRow('Browser push', toggle(false), 'Lets this device raise a notification when the portal is not open. The browser asks for its own permission the first time.', false)}
              ${settingRow('Absence alerts', badge('Not yet available', 'warn'), '', false)}
              ${settingRow('Daily digest', badge('Not yet available', 'warn'), '', false)}
              ${settingRow('Quiet hours', badge('Not yet available', 'warn'), '', true)}`,
          })}
        </div>
      </div>
      ${note('today', 'The <code>NotYetAvailable</code> badge exists because of this comment, and it is the honest choice: <b>&ldquo;A switch with nothing behind it is worse than no switch: the teacher flips it, the school never behaves differently, and the portal has quietly lied.&rdquo;</b>')}
      ${note('proposed', 'One line here describes a control the product does not have: <b>&ldquo;Publish window &mdash; set by the office.&rdquo;</b> No screen in campus opens, closes or creates a publish window. The Leadership canvas draws it.')}
    `,
  })

/* ── 11. help ───────────────────────────────────────────────────────── */
export const TeacherHelp = () =>
  artboard({
    caption: 'Term 2',
    title: 'Help',
    activeRail: 'Help',
    activeTab: 'Today',
    body: `
      ${card({
        title: 'How-to guides',
        sub: 'The four things this portal is for, and how each one behaves',
        children: ['Taking the register', 'Entering marks for a test', 'Reading your day', 'Switching between your classes']
          .map((t, i, a) => row(`<span style="flex: 1; font-size: 13px; font-weight: 600; color: ${C.strong}">${t}</span>${icon(I.chevD, { size: 15, stroke: C.faint })}`, i === a.length - 1))
          .join(''),
      })}
      ${card({
        title: 'Frequently asked',
        sub: 'What teachers ask the office about this portal',
        children: [
          ['I marked the wrong pupil. Can I fix it?', false],
          ['What happens when the office locks a day?', false],
          ['Why can I not publish marks to parents?', false],
          ['A class I teach is missing from my rail', false],
          ['The class list is empty', false],
          ['My name or staff code is wrong', false],
          ['I have forgotten my password', false],
          ['Does the portal work without a connection?', true],
          ['Who can see what I enter?', false],
        ]
          .map(([q, open], i, a) =>
            open
              ? `<div style="padding: 12px 16px; border-bottom: 1px solid ${C.hair}; background: ${V.soft}">
                   <div style="font-size: 13px; font-weight: 700; color: ${V.strong}">${q}</div>
                   <div style="font-size: 12.5px; color: ${V.strong}; opacity: .9; line-height: 1.6; margin-top: 6px">Not yet. Nothing queues on the device: a register or a mark sheet needs a connection at the moment you save it. If the room has no signal, take the register on paper and enter it later against that date rather than leaving the tablet open and hoping.</div>
                 </div>`
              : row(`<span style="flex: 1; font-size: 12.5px; color: ${C.body}">${q}</span>${icon(I.chevD, { size: 14, stroke: C.faint })}`, i === a.length - 1),
          )
          .join(''),
      })}
      ${note('today', 'That answer is the authoritative statement of offline behaviour for the entire teacher portal &mdash; and it lives nine rows down a Help accordion. The <b>Register &mdash; offline</b> artboard puts it where the teacher is.')}
    `,
  })

/* ── 12. login ──────────────────────────────────────────────────────── */
export const TeacherLogin = () =>
  wrap(
    `<div style="width: 900px; height: 640px; background: ${C.canvas}; display: flex; align-items: center; justify-content: center; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">
      <div style="width: 400px; display: flex; flex-direction: column; gap: 18px">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 11px; text-align: center">
          <div style="width: 52px; height: 52px; border-radius: 13px; background: ${V.grad}; display: flex; align-items: center; justify-content: center">${icon(I.users, { size: 26, stroke: '#fff', w: 1.8 })}</div>
          <div>
            <div style="font-size: 19px; font-weight: 700; color: ${C.strong}">Teacher Portal</div>
            <div style="font-size: 13px; color: ${C.mid}; margin-top: 3px">Access classes, attendance, marks, and moderation workflows.</div>
          </div>
          ${badge('Chishawasha High', 'plain')}
        </div>
        <div style="border: 1px solid ${C.border}; border-radius: 14px; background: ${C.surface}; padding: 20px; display: flex; flex-direction: column; gap: 13px">
          ${['Email', 'Password']
            .map(
              (l) =>
                `<div style="display: flex; flex-direction: column; gap: 5px"><span style="font-size: 11.5px; font-weight: 600; color: ${C.body}">${l}</span><div style="height: 40px; border: 1px solid ${C.border}; border-radius: 9px; background: ${C.surface}"></div></div>`,
            )
            .join('')}
          <div style="height: 44px; border-radius: 9px; background: ${V.brand}; display: flex; align-items: center; justify-content: center"><span style="font-size: 14px; font-weight: 600; color: #fff">Sign in</span></div>
        </div>
        <div style="font-size: 11.5px; color: ${C.subtle}; text-align: center; line-height: 1.55">Contact your school administrator if you need teacher portal access.</div>
        <div style="border: 1px dashed ${V.bd}; border-radius: 10px; background: ${V.soft}; padding: 10px 13px">
          <span style="font-size: 11.5px; color: ${V.strong}; line-height: 1.55"><b>Voice clash.</b> This is the only teacher-facing screen written in US product English &mdash; &ldquo;Access classes, attendance, marks, and moderation workflows.&rdquo; Every screen behind it is British sentence-case prose written to a teacher. The login is the outlier, and it is the first thing they read.</span>
        </div>
      </div>
    </div>`,
    900,
    640,
  )

/* ── 13. the HOD gap ────────────────────────────────────────────────── */
export const TeacherHodAffordance = () =>
  artboard({
    caption: 'Term 2 &middot; Head of department, Mathematics',
    title: 'Your day',
    activeRail: 'Today',
    activeTab: 'Today',
    bell: 14,
    body: `
      ${note('proposed', '<code>lib/platform/gating/portal-isolation.ts</code> routes <code>HOD</code> to <code>/portal/teacher</code> with the comment <i>&ldquo;HODs use teacher portal with additional permissions&rdquo;</i>. The shell has <b>no HOD affordance at all</b>: no rail item, no queue, nothing conditional on the flag. The moderation queue they are granted lives at <code>/schools/results/moderation</code>, on the other side of the app, reachable only by typing the URL.')}
      <div style="border-radius: 12px; background: ${V.grad}; padding: 18px; color: #fff">
        <div style="font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: rgba(255,255,255,.78)">As head of Mathematics</div>
        <h3 style="margin: 6px 0 0; font-size: 18px; font-weight: 700; letter-spacing: -.01em">14 mark sheets are waiting for you</h3>
        <div style="font-size: 13px; color: rgba(255,255,255,.86); margin-top: 5px">Term 2 closes on 10 September. The publishing window opens on 1 September.</div>
        <div style="display: inline-flex; align-items: center; height: 38px; padding: 0 16px; border-radius: 9px; background: rgba(255,255,255,.18); font-size: 13.5px; font-weight: 700; margin-top: 13px">Open the moderation queue &rarr;</div>
      </div>
      ${card({
        title: 'Waiting on you',
        sub: 'Mathematics · 14 submitted',
        children: [
          ['Mathematics — end of term', 'Form 2A · Mr Chirwa · 32 marks · average 64.2', '22 Aug'],
          ['Mathematics — end of term', 'Form 2B · Mrs Moyo · 31 marks · average 59.8', '22 Aug'],
          ['Add. Mathematics — mock', 'Form 4A · Mr Sibanda · 18 marks · average 55.1', '21 Aug'],
        ]
          .map(([t, sub, when], i, a) =>
            row(
              `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: 600; color: ${C.strong}">${t}</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}">${sub}</span></span>
               ${mono(when, { size: 10.5 })}${badge('Submitted', 'warn')}${btn('Review')}`,
              i === a.length - 1,
            ),
          )
          .join(''),
      })}
      ${note('proposed', 'Two additions, no new shell: a <b>Moderation</b> row in the <i>Daily work</i> rail group when the profile carries the HOD flag, and this banner on Today when the queue is not empty. Both read a flag the teacher record already stores and the moderation API already checks.')}
    `,
  })

/* ── 14. shared files ───────────────────────────────────────────────── */
export const TeacherFiles = () =>
  artboard({
    caption: 'Term 2 &middot; Mathematics',
    title: 'Shared files',
    activeRail: 'Shared files',
    activeTab: 'Lessons',
    body: `
      <div style="display: flex; align-items: flex-end; gap: 12px">
        <div style="flex: 1; min-width: 0; font-size: 12.5px; color: ${C.mid}; line-height: 1.55">Worksheets, slides and past papers shared across the department, plus your own drafts, which nobody else can see. Files themselves land with the documents work in a later release &mdash; for now a resource is a link to wherever the file already lives.</div>
        ${btn('Add a link', 'solid')}
      </div>
      <div style="display: flex; gap: 10px">
        ${[
          ['Search', 'Name, subject or who added it', 240],
          ['Subject', 'All subjects', 170],
          ['Year group', 'All year groups', 170],
        ]
          .map(
            ([l, v, w]) =>
              `<span style="display: flex; flex-direction: column; gap: 4px; width: ${w}px"><span style="font-size: 10.5px; font-weight: 600; color: ${C.mid}">${l}</span><span style="display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}"><span style="flex: 1; font-size: 12.5px; color: ${C.subtle}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${v}</span></span></span>`,
          )
          .join('')}
      </div>
      <div style="font-size: 12px; color: ${C.mid}">6 of 42 resources</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 12px">
        ${[
          ['Word problems · Set B', 'PDF', 'Mathematics', 'Form 2', '184 KB', 'Mrs P. Nyathi', '14 Aug', false],
          ['Simultaneous equations — slides', 'Slides', 'Mathematics', 'Form 2', '1.2 MB', 'Mr T. Chirwa', '11 Aug', false],
          ['ZIMSEC 2024 paper 1', 'PDF', 'Mathematics', 'Form 4', '2.8 MB', 'The school', '3 Aug', false],
          ['Trigonometry starter — draft', 'Document', 'Mathematics', 'Any year group', '64 KB', 'Mrs P. Nyathi', '22 Aug', true],
          ['Graph paper template', 'PDF', 'Any subject', 'Any year group', '38 KB', 'The school', '3 Aug', false],
          ['Indices — video walkthrough', 'Video', 'Mathematics', 'Form 3', '—', 'Mr M. Sibanda', '18 Aug', false],
        ]
          .map(
            ([name, kind, subject, year, size, who, when, draft]) => `
          <div style="border: 1px solid ${draft ? C.warnBd : C.border}; border-radius: 10px; background: ${C.surface}; padding: 14px; display: flex; flex-direction: column; gap: 9px">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap">${badge(kind, 'plain')}${badge(subject, 'violet')}${draft ? `<span style="display: inline-flex; align-items: center; gap: 6px; height: 19px; padding: 0 8px; border-radius: 5px; background: ${C.warnBg}; color: ${C.warn}; font-size: 10.5px; font-weight: 600"><span style="width: 6px; height: 6px; border-radius: 999px; background: currentColor"></span>Draft &mdash; only you</span>` : ''}</div>
            <div style="font-size: 13.5px; font-weight: 700; color: ${C.strong}; line-height: 1.35">${esc(name)}</div>
            <div style="font-size: 11.5px; color: ${C.mid}">${year} &middot; ${size}</div>
            <div style="font-size: 11px; color: ${C.subtle}; margin-top: auto">${who} &middot; ${when}</div>
          </div>`,
          )
          .join('')}
      </div>
      ${note('today', 'The lede is admirably plain about what this is not: <b>&ldquo;Files themselves land with the documents work in a later release &mdash; for now a resource is a link to wherever the file already lives.&rdquo;</b> The dialog repeats it as an info alert rather than hiding it behind a disabled upload button.')}
      ${note('proposed', 'The same honesty is missing one step: campus has <b>no file upload anywhere</b> &mdash; not here, and not on the Files tab of any of the six admin record types, where the empty state describes attachments nobody can attach. One documents release closes both.')}
    `,
  })

/* ── 15. parent meetings ────────────────────────────────────────────── */
export const TeacherMeetings = () =>
  artboard({
    caption: 'Term 2 &middot; June 2026',
    title: 'Parent meetings',
    activeRail: 'Parent meetings',
    activeTab: 'Today',
    body: `
      <div style="display: flex; align-items: flex-end; gap: 12px">
        <div style="flex: 1; min-width: 0">
          <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: ${C.strong}">Parent meetings</h2>
          <div style="font-size: 12.5px; color: ${C.mid}; margin-top: 3px">Parents book these from their own portal &middot; Term 2</div>
        </div>
        ${btn('Open an evening', 'solid')}
      </div>
      ${grid(
        'minmax(0, 20rem) minmax(0, 1fr)',
        `<div style="display: flex; flex-direction: column; gap: 12px">
          ${card({
            title: 'Pick an evening',
            sub: 'June 2026',
            pad: true,
            children: `
              <div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px">
                ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div style="text-align: center; font-size: 10.5px; font-weight: 700; color: ${C.subtle}; padding: 4px 0">${d}</div>`).join('')}
                ${Array.from({ length: 30 }, (_, i) => i + 1)
                  .map((d) => {
                    const open = [3, 10, 17].includes(d)
                    const sel = d === 3
                    return `<div style="aspect-ratio: 1; display: flex; align-items: center; justify-content: center; border-radius: 7px; background: ${sel ? V.brand : open ? V.soft : 'transparent'}; color: ${sel ? '#fff' : open ? V.strong : C.faint}; font-size: 12px; font-weight: ${open ? 700 : 400}">${d}</div>`
                  })
                  .join('')}
              </div>
              <div style="font-size: 11px; color: ${C.subtle}; line-height: 1.5; margin-top: 10px">Only evenings with slots on them can be picked. Open one to put a date on the calendar.</div>`,
          })}
          ${grid(2, [stat('Evenings open', '3', 'this month'), stat('Slots booked', '41', 'of 72 this month', 'ok')].join(''), 10)}
        </div>
        ${card({
          title: '3 June 2026',
          sub: '24 slots · 21 booked · 3 free',
          children: [
            ['17:00 – 17:10', 'Mutasa, Tanaka', 'CHS-1219 · Form 2A · Room 4', true],
            ['17:10 – 17:20', 'Chikwanda, Rutendo', 'CHS-1180 · Form 2A · Room 4', true],
            ['17:20 – 17:30', '', '', false],
            ['17:30 – 17:40', 'Moyo, Farai', 'CHS-1211 · Form 2B · Room 4', true],
            ['17:40 – 17:50', 'Booked, but the pupil record has gone', 'CHS-1266 · No room set', true],
            ['17:50 – 18:00', '', '', false],
          ]
            .map(([time, name, meta, booked], i, a) =>
              row(
                `${mono(time, { size: 12, color: C.body, width: 118, weight: 700 })}
                 <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: ${booked ? 600 : 400}; color: ${booked ? C.strong : C.subtle}">${booked ? esc(name) : 'Nobody has taken this slot'}</span>${booked ? mono(meta, { size: 10.5 }) : ''}</span>
                 ${booked ? `<span style="display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0"><span style="width: 7px; height: 7px; border-radius: 999px; background: ${C.ok}"></span><span style="font-size: 12px; font-weight: 600; color: ${C.ok}">Booked</span></span>${btn('Release')}` : `<span style="display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0"><span style="width: 7px; height: 7px; border-radius: 999px; background: ${C.faint}"></span><span style="font-size: 12px; color: ${C.mid}">Free</span></span>`}`,
                i === a.length - 1,
              ),
            )
            .join(''),
        })}`,
      )}
      ${note('today', '')}
    `,
  })

/* ═══ PLANNING ══════════════════════════════════════════════════════
   Scheme of work and lesson plans as the two examination boards a
   Zimbabwean school runs actually require them.

   ZIMSEC / Ministry of Primary and Secondary Education: at secondary level
   the SCHEME-CUM-PLAN is the expected document — a scheme of work on its own
   is optional, and a separate lesson plan is only drawn when a teacher
   schemed rather than scheme-cum-planned. It is written a fortnight ahead of
   delivery, and its columns are fixed: week ending, topic/content,
   objectives, source of matter, media, methodology/activities, evaluation.

   Cambridge International: the scheme of work is a MEDIUM-TERM plan built
   from syllabus units with a suggested teaching order and time allocation,
   and the lesson plan carries learning objectives against syllabus
   references, success criteria, a timed starter/main/plenary, resources,
   differentiation, assessment and homework.

   The shipped screens carry four fields — Topic, Objectives, Activities,
   Resources on the scheme; Topic, What pupils should learn, Materials,
   Homework on the plan — which satisfies neither board.
   ══════════════════════════════════════════════════════════════════ */

const boardSwitch = (active) =>
  `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px; background: ${C.muted}; border: 1px solid ${C.border}; flex-shrink: 0">${['ZIMSEC', 'Cambridge']
    .map((b) => {
      const on = b === active
      return `<span style="display: inline-flex; align-items: center; height: 28px; padding: 0 13px; border-radius: 6px; background: ${on ? C.surface : 'transparent'}; box-shadow: ${on ? '0 1px 2px rgba(42,38,34,.06)' : 'none'}; font-size: 12px; font-weight: ${on ? 700 : 500}; color: ${on ? C.strong : C.mid}">${b}</span>`
    })
    .join('')}</span>`

const planField = (label, value, { hint, w, rows = 1 } = {}) => `
  <div style="display: flex; flex-direction: column; gap: 4px; ${w ? `width: ${w}px; flex-shrink: 0` : 'flex: 1; min-width: 0'}">
    <span style="font-size: 11px; font-weight: 600; color: ${C.body}">${esc(label)}</span>
    <div style="min-height: ${rows > 1 ? rows * 17 + 16 : 32}px; padding: 8px 10px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}"><span style="font-size: 12px; line-height: 1.5; color: ${value ? C.body : C.subtle}">${value || hint || ''}</span></div>
    ${hint && value ? `<span style="font-size: 10.5px; color: ${C.subtle}">${hint}</span>` : ''}
  </div>`

/* ── ZIMSEC scheme-cum-plan ─────────────────────────────────────────── */
const ZIMSEC_COLS = [
  ['Week ending', 96],
  ['Topic / content', 168],
  ['Objectives', 0],
  ['Source of matter', 150],
  ['Media', 130],
  ['Methodology and activities', 0],
  ['Evaluation', 160],
]

export const TeacherSchemeZimsec = () =>
  artboard({
    caption: 'Form 2A &middot; Mathematics &middot; Term 2',
    title: 'Scheme of work',
    activeRail: 'Lesson plans',
    activeTab: 'Lessons',
    body: `
      <div style="display: flex; align-items: flex-end; gap: 12px">
        <div style="flex: 1; min-width: 0">
          <div style="font-size: 12.5px; color: ${C.mid}; line-height: 1.5">Written a fortnight ahead of delivery, and signed by the head of department before the first week of it is taught.</div>
        </div>
        ${boardSwitch('ZIMSEC')}
        ${btn('Send for signing', 'solid')}
      </div>

      <div style="display: flex; gap: 10px">
        ${[
          ['Class', 'Form 2A'],
          ['Subject', 'Mathematics'],
          ['Term', 'Term 2 · 2026'],
          ['Syllabus', 'Mathematics 4028 (2024–2030)'],
        ]
          .map(
            ([l, v]) =>
              `<span style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0"><span style="font-size: 10.5px; font-weight: 600; color: ${C.mid}">${l}</span><span style="display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}"><span style="flex: 1; min-width: 0; font-size: 12.5px; color: ${C.body}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${v}</span>${icon(I.chevD, { size: 13, stroke: C.faint })}</span></span>`,
          )
          .join('')}
      </div>

      ${card({
        title: 'Scheme-cum-plan',
        sub: 'Weeks 5 to 8 · signed to week 6',
        action: `<span style="display: flex; align-items: center; gap: 8px">${badge('2 weeks ahead', 'ok')}${btn('Add a week')}</span>`,
        children: `
          <div style="overflow-x: auto">
            <div style="min-width: 1180px">
              <div style="display: flex; gap: 10px; padding: 9px 16px; border-bottom: 1px solid ${C.border}; background: ${C.canvas}">
                ${ZIMSEC_COLS.map(([label, w]) => `<span style="font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: ${C.mid}; ${w ? `width: ${w}px; flex-shrink: 0` : 'flex: 1; min-width: 0'}">${label}</span>`).join('')}
              </div>
              ${[
                [
                  '14 Aug 2026',
                  'Simultaneous equations — elimination',
                  'Solve a pair of linear equations by elimination and check by substitution.',
                  'New General Mathematics Bk 2, ch. 7',
                  'Squared paper, board',
                  'Worked examples on the board, then exercise 4 in pairs. Board race Friday.',
                  'Objectives met. 8 pupils still adding instead of subtracting — re-teach Monday.',
                  'signed',
                ],
                [
                  '21 Aug 2026',
                  'Simultaneous equations — substitution and graphs',
                  'Solve the same pairs graphically and explain why both methods agree.',
                  'Bk 2, ch. 7–8',
                  'Graph paper, rulers',
                  'Plot on squared paper; one problem set for homework.',
                  'Partly met — graph work ran into week 7.',
                  'signed',
                ],
                [
                  '28 Aug 2026',
                  'Indices and standard form',
                  'Apply the laws of indices and write numbers in standard form.',
                  'Bk 2, ch. 9',
                  'Scientific calculators',
                  'Rules derived from first principles, then drill. Mid-term break Fri.',
                  '',
                  'waiting',
                ],
                [
                  '4 Sep 2026',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  'draft',
                ],
              ]
                .map(([week, topic, objectives, source, media, method, evaluation, state], i, a) => {
                  const empty = !topic
                  return `<div style="display: flex; gap: 10px; padding: 11px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`} background: ${state === 'draft' ? C.canvas : 'transparent'}">
                    <span style="width: 96px; flex-shrink: 0"><span class="mono" style="display: block; font-size: 11.5px; font-weight: 700; color: ${C.strong}">${week}</span><span style="display: block; margin-top: 5px">${badge(state === 'signed' ? 'Signed' : state === 'waiting' ? 'Waiting' : 'Not written', state === 'signed' ? 'ok' : state === 'waiting' ? 'warn' : 'plain')}</span></span>
                    <span style="width: 168px; flex-shrink: 0; font-size: 12px; font-weight: ${empty ? 400 : 600}; color: ${empty ? C.faint : C.strong}; line-height: 1.45">${empty ? 'Not written yet' : topic}</span>
                    <span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.5">${objectives}</span>
                    <span style="width: 150px; flex-shrink: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.5">${source}</span>
                    <span style="width: 130px; flex-shrink: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.5">${media}</span>
                    <span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.5">${method}</span>
                    <span style="width: 160px; flex-shrink: 0; font-size: 11.5px; color: ${evaluation ? C.body : C.faint}; line-height: 1.5">${evaluation || 'Written after the week is taught'}</span>
                  </div>`
                })
                .join('')}
            </div>
          </div>`,
      })}

      ${grid(
        3,
        [
          stat('Weeks schemed', '8 of 14', 'Term 2'),
          stat('Signed by the HOD', '6', 'to week ending 21 Aug', 'ok'),
          stat('Ahead of delivery', '2 weeks', 'the Ministry asks for two', 'ok'),
        ].join(''),
      )}
    `,
  })

/* ── Cambridge scheme of work ───────────────────────────────────────── */
export const TeacherSchemeCambridge = () =>
  artboard({
    caption: 'Form 4A &middot; Add. Mathematics &middot; Term 2',
    title: 'Scheme of work',
    activeRail: 'Lesson plans',
    activeTab: 'Lessons',
    body: `
      <div style="display: flex; align-items: flex-end; gap: 12px">
        <div style="flex: 1; min-width: 0; font-size: 12.5px; color: ${C.mid}; line-height: 1.5">A medium-term plan: syllabus units in a teaching order, with the hours each is given and the learning objectives it carries.</div>
        ${boardSwitch('Cambridge')}
        ${btn('Send for signing', 'solid')}
      </div>

      <div style="display: flex; gap: 10px">
        ${[
          ['Class', 'Form 4A'],
          ['Subject', 'Additional Mathematics'],
          ['Term', 'Term 2 · 2026'],
          ['Syllabus', 'Cambridge IGCSE 0606 (2025–2027)'],
        ]
          .map(
            ([l, v]) =>
              `<span style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0"><span style="font-size: 10.5px; font-weight: 600; color: ${C.mid}">${l}</span><span style="display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}"><span style="flex: 1; min-width: 0; font-size: 12.5px; color: ${C.body}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${v}</span>${icon(I.chevD, { size: 13, stroke: C.faint })}</span></span>`,
          )
          .join('')}
      </div>

      ${card({
        title: 'Units in teaching order',
        sub: '5 units · 42 of 48 hours allocated',
        action: btn('Add a unit'),
        children: `
          <div style="display: flex; gap: 12px; padding: 9px 16px; border-bottom: 1px solid ${C.border}; background: ${C.canvas}">
            ${[
              ['Unit', 0],
              ['Syllabus reference', 150],
              ['Learning objectives', 0],
              ['Hours', 66],
              ['Assessment', 170],
              ['Resources', 180],
            ]
              .map(([l, w]) => `<span style="font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: ${C.mid}; ${w ? `width: ${w}px; flex-shrink: 0` : 'flex: 1; min-width: 0'}">${l}</span>`)
              .join('')}
          </div>
          ${[
            ['1. Functions', '2.1, 2.2', 'Understand and use function notation; find inverse and composite functions.', '8', 'Unit test · past paper 0606/12', 'Coursebook ch. 2, GeoGebra'],
            ['2. Quadratic functions', '2.3', 'Complete the square; sketch and interpret quadratic graphs.', '10', 'Class quiz · marked homework', 'Coursebook ch. 3, graph plotter'],
            ['3. Indices and surds', '1.1, 1.2', 'Simplify surds and apply the laws of indices in algebraic contexts.', '6', 'Marked homework', 'Coursebook ch. 1'],
            ['4. Simultaneous equations', '2.4', 'Solve one linear and one quadratic equation simultaneously.', '8', 'Unit test', 'Coursebook ch. 4, past papers'],
            ['5. Logarithmic and exponential functions', '3.1, 3.2', 'Use the laws of logarithms; solve equations of the form aˣ = b.', '10', 'End-of-term paper', 'Coursebook ch. 5'],
          ]
            .map(([unit, ref, objectives, hours, assessment, resources], i, a) =>
              row(
                `<span style="flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: ${C.strong}; line-height: 1.4">${unit}</span>
                 <span style="width: 150px; flex-shrink: 0">${mono(ref, { size: 11.5, color: C.brandStrong, weight: 700 })}</span>
                 <span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.5">${objectives}</span>
                 <span style="width: 66px; flex-shrink: 0">${mono(hours + ' h', { size: 12, color: C.body, weight: 700 })}</span>
                 <span style="width: 170px; flex-shrink: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.5">${assessment}</span>
                 <span style="width: 180px; flex-shrink: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.5">${resources}</span>`,
                i === a.length - 1,
              ),
            )
            .join('')}`,
      })}

      ${grid(
        3,
        [
          stat('Hours allocated', '42', 'of 48 timetabled this term', 'warn'),
          stat('Syllabus coverage', '68%', '17 of 25 objectives scheduled'),
          stat('Assessment points', '5', 'one per unit', 'ok'),
        ].join(''),
      )}
    `,
  })

/* ── lesson plan drawer ─────────────────────────────────────────────── */
export const TeacherLessonPlan = () =>
  artboard({
    caption: 'Form 4A &middot; Add. Mathematics &middot; Term 2',
    title: 'Lesson plans',
    activeRail: 'Lesson plans',
    activeTab: 'Lessons',
    body: `<div style="opacity: .3; display: flex; flex-direction: column; gap: 12px">${card({ title: 'Term 2', sub: '9 of 13 lessons planned', pad: true, children: '<div style="height: 300px"></div>' })}</div>`,
    overlay: `<div style="position: absolute; inset: 0; background: rgba(22,24,29,.34); display: flex; justify-content: flex-end">
      <div style="width: 560px; height: 100%; background: ${C.surface}; box-shadow: -24px 0 48px -12px rgba(42,38,34,.2); display: flex; flex-direction: column; overflow: hidden">
        <div style="padding: 16px 20px 13px; border-bottom: 1px solid ${C.borderSubtle}">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 7px">${badge('Additional Mathematics', 'violet')}${badge('Form 4A', 'plain')}${badge('Cambridge 0606', 'brand')}${badge('Not started', 'warn')}</div>
          <div style="font-size: 16px; font-weight: 700; color: ${C.strong}">Completing the square</div>
          <div style="font-size: 12px; color: ${C.mid}; margin-top: 3px">Thursday, 6 August 2026 &middot; Period 3 &middot; 10:20 &ndash; 11:00 &middot; Room A12</div>
        </div>
        <div class="scroll" style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 13px">
          ${planField('Topic', 'Completing the square')}
          <div style="display: flex; gap: 11px">
            ${planField('Syllabus reference', '0606 · 2.3', { w: 170 })}
            ${planField('Scheme unit', 'Unit 2 — Quadratic functions')}
          </div>
          ${planField('Learning objectives', 'Express ax² + bx + c in the form a(x + p)² + q, and use it to find the vertex of a parabola.', { hint: 'One objective a line. These are what the lesson is judged against.', rows: 3 })}
          ${planField('Success criteria', 'I can complete the square on a quadratic where a = 1.\nI can complete the square where a ≠ 1.\nI can state the vertex and the line of symmetry from the completed form.', { hint: 'What the class should be able to say by the end.', rows: 4 })}
          <div style="display: flex; flex-direction: column; gap: 8px">
            <span style="font-size: 11px; font-weight: 600; color: ${C.body}">Lesson shape</span>
            ${[
              ['Starter', '5 min', 'Expand three brackets on the board; the class spots the pattern in the constant term.'],
              ['Main', '25 min', 'Derive the method from the expansion, then worked examples with a = 1, then a ≠ 1. Paired practice on the exercise.'],
              ['Plenary', '10 min', 'Exit question: state the vertex of y = 2x² − 8x + 3.'],
            ]
              .map(
                ([phase, time, what]) =>
                  `<div style="display: flex; gap: 11px; padding: 10px 12px; border: 1px solid ${C.border}; border-radius: 9px; background: ${C.surface}">
                    <span style="width: 76px; flex-shrink: 0"><span style="display: block; font-size: 12px; font-weight: 700; color: ${C.strong}">${phase}</span>${mono(time, { size: 10.5 })}</span>
                    <span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.55">${what}</span>
                  </div>`,
              )
              .join('')}
          </div>
          ${planField('Differentiation', 'Support: a = 1 sheet with the halved coefficient pre-filled. Stretch: derive the quadratic formula from the completed form.', { hint: 'What changes for the pupils who need it to.', rows: 2 })}
          ${planField('Resources and materials', 'Coursebook ch. 3, pp. 41–46 · graph plotter on the projector · squared paper', { rows: 2 })}
          ${planField('Assessment', 'Exit question marked in class; question 7 of the homework carries the same objective.', { rows: 2 })}
          ${planField('Homework', 'Exercise 3C questions 1–8, due Monday 10 August.', { rows: 2 })}
          ${planField('Evaluation', '', { hint: 'Written after the lesson. ZIMSEC requires it on the scheme-cum-plan; Cambridge treats it as reflection.', rows: 2 })}
        </div>
        <div style="padding: 12px 20px; border-top: 1px solid ${C.borderSubtle}; background: ${C.canvas}; display: flex; align-items: center; gap: 10px">
          <span style="flex: 1; font-size: 11.5px; color: ${C.subtle}">Saving writes a new plan</span>
          ${btn('Close')}${btn('Save plan', 'solid')}
        </div>
      </div>
    </div>`,
  })

/* ── HOD sign-off on planning ───────────────────────────────────────── */
export const TeacherPlanningApproval = () =>
  artboard({
    caption: 'Term 2 &middot; Head of department, Mathematics',
    title: 'Scheme of work',
    activeRail: 'Lesson plans',
    activeTab: 'Lessons',
    bell: 14,
    body: `
      <div style="display: flex; align-items: flex-end; gap: 12px">
        <div style="flex: 1; min-width: 0">
          <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: ${C.strong}">Schemes waiting for your signature</h2>
          <div style="font-size: 12.5px; color: ${C.mid}; margin-top: 3px">Mathematics &middot; Term 2 &middot; the Ministry asks for a fortnight&rsquo;s notice, so a scheme signed late is a scheme taught unsigned.</div>
        </div>
        ${btn('Sign all that are ready', 'solid')}
      </div>

      ${grid(
        4,
        [
          stat('Waiting on you', '5', 'across 4 teachers', 'warn'),
          stat('Signed this term', '31', ''),
          stat('Taught unsigned', '2', 'week ending 14 Aug', 'bad'),
          stat('Behind the fortnight', '3', 'less than 2 weeks ahead', 'bad'),
        ].join(''),
      )}

      ${card({
        title: 'Waiting',
        sub: '5 schemes',
        children: [
          ['Mrs P. Nyathi', 'Form 2A · Mathematics · ZIMSEC 4028', 'Weeks 7–8', '3 weeks ahead', 'ok'],
          ['Mr T. Chirwa', 'Form 2B · Mathematics · ZIMSEC 4028', 'Weeks 7–8', '2 weeks ahead', 'ok'],
          ['Mr M. Sibanda', 'Form 4A · Add. Mathematics · Cambridge 0606', 'Units 3–4', '9 days ahead', 'warn'],
          ['Mrs R. Moyo', 'Form 3A · Mathematics · ZIMSEC 4028', 'Week 7', '4 days ahead', 'bad'],
          ['Mr A. Dube', 'Form 1C · Mathematics · ZIMSEC 4028', 'Weeks 6–8', 'taught unsigned', 'bad'],
        ]
          .map(([who, what, scope, lead, tone], i, a) =>
            row(
              `${avatar(who.split(' ').slice(-1)[0].slice(0, 2).toUpperCase(), { size: 30 })}
               <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: 600; color: ${C.strong}">${who}</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}">${what}</span></span>
               ${mono(scope, { size: 11, color: C.mid })}
               ${badge(lead, tone)}
               ${btn('Read')}${btn('Sign', 'solid')}`,
              i === a.length - 1,
            ),
          )
          .join(''),
      })}

      ${card({
        title: 'What each board asks for',
        children: `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0; ">
          ${[
            [
              'ZIMSEC',
              'Ministry of Primary and Secondary Education',
              [
                'The <b>scheme-cum-plan</b> is the expected document at secondary level; a scheme of work on its own is optional, and a separate lesson plan is only drawn where a teacher schemed rather than scheme-cum-planned.',
                'Drawn <b>two weeks ahead</b> of the delivery date.',
                'Columns: week ending, topic and content, objectives, source of matter, media, methodology and activities, <b>evaluation written after teaching</b>.',
                'Checked and signed by the head of department.',
              ],
            ],
            [
              'Cambridge International',
              'Cambridge Assessment International Education',
              [
                'The scheme of work is a <b>medium-term plan</b>: syllabus units in a suggested teaching order with a <b>time allocation</b> against each.',
                'Every objective carries a <b>syllabus reference</b>.',
                'The lesson plan carries <b>success criteria</b>, a timed starter / main / plenary, resources, <b>differentiation</b>, assessment and homework.',
                'Assessment points are planned into the scheme, not added afterwards.',
              ],
            ],
          ]
            .map(
              ([board, body, points], i) =>
                `<div style="padding: 14px 16px; ${i === 0 ? `border-right: 1px solid ${C.borderSubtle}` : ''}">
                  <div style="font-size: 13px; font-weight: 700; color: ${C.strong}">${board}</div>
                  <div style="font-size: 11px; color: ${C.subtle}; margin-top: 1px">${body}</div>
                  <div style="display: flex; flex-direction: column; gap: 7px; margin-top: 10px">
                    ${points.map((p) => `<div style="display: flex; gap: 8px"><span style="width: 5px; height: 5px; border-radius: 999px; background: ${V.brand}; margin-top: 6px; flex-shrink: 0"></span><span style="font-size: 11.5px; color: ${C.mid}; line-height: 1.55">${p}</span></div>`).join('')}
                  </div>
                </div>`,
            )
            .join('')}
        </div>`,
      })}
    `,
  })
