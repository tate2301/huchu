/**
 * The two phone portals — student and parent — redrawn from
 * components/schools/portal/{student,parent}/*.
 *
 * Both are 390x844. Neither has a caption line: the student shell's comment
 * says "Home's own greeting line does the greeting, so the bar does not repeat
 * it", and the parent shell says the same. The student header is 52px with
 * 36px buttons and 64px bottom tabs; the parent bar is 52px with a 26px child
 * avatar chip. The student portal does NOT re-point --brand — its orange is
 * the hero and the ID card only. The parent portal inherits platform blue.
 *
 * No fake status bar and no fake keyboard: on a real phone the OS draws both
 * over the top, and a painted one reads as doubled up.
 */
import { C, I, icon, esc, wrap, mono, badge, avatar } from '../lib/kit.mjs'

const W = 390
const H = 844

const O = { solid: '#E06A16', fg: '#A24E08', bg: '#FDEEE0', bd: '#F6CDAA' }
const HUES = ['#0B5DF0', '#CE3789', '#D6412F', '#E06A16', '#27803F', '#7B45D6', '#0C7FA6', '#13857D', '#4A4ED4', '#C4A20A']
export const hue = (s) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]

const note = () => ''

/* ── shared phone chrome ────────────────────────────────────────────── */
const bottomTabs = (items, active, brand) => `
  <div style="height: 64px; flex-shrink: 0; display: flex; align-items: center; padding: 6px; background: ${C.surface}; border-top: 1px solid ${C.border}; box-shadow: 0 -6px 18px -8px rgba(22,24,29,.1)">
    ${items
      .map(([label, ic, badgeN]) => {
        const on = label === active
        return `<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; position: relative">
          <span style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center">${icon(ic, { size: 22, stroke: on ? brand : C.subtle, w: on ? 2 : 1.7 })}</span>
          <span style="font-size: 10.5px; font-weight: ${on ? 700 : 500}; color: ${on ? brand : C.subtle}">${label}</span>
          ${badgeN ? `<span class="mono" style="position: absolute; top: -1px; right: 24px; min-width: 15px; height: 15px; border-radius: 999px; background: ${C.bad}; color: #fff; font-size: 9px; font-weight: 700; line-height: 15px; text-align: center">${badgeN}</span>` : ''}
        </div>`
      })
      .join('')}
  </div>`

export const eyebrow = (label, link) => `
  <div style="display: flex; align-items: baseline; justify-content: space-between; padding: 14px 0 8px">
    <span style="font-size: 11.5px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: ${C.subtle}">${esc(label)}</span>
    ${link ? `<span style="font-size: 12px; font-weight: 500; color: ${C.brandStrong}">${esc(link)}</span>` : ''}
  </div>`

export const phoneCard = (children, { pad = true, tone } = {}) =>
  `<div style="border: 1px solid ${tone === 'unread' ? '#DCE5FD' : C.border}; border-radius: 12px; background: ${tone === 'unread' ? C.brandSoft : C.surface}; overflow: hidden">${pad ? `<div style="padding: 13px 14px">${children}</div>` : children}</div>`

export const phoneRow = (cells, last) =>
  `<div style="display: flex; align-items: center; gap: 11px; padding: 14px 16px; ${last ? '' : `border-bottom: 1px solid ${C.hair};`}">${cells}</div>`

export const wideBtn = (label, kind, brand) => {
  const s =
    kind === 'solid'
      ? `background: ${brand}; color: #fff; border: 1px solid transparent`
      : kind === 'danger'
        ? `background: ${C.surface}; color: ${C.bad}; border: 1px solid ${C.badBd}`
        : `background: ${C.surface}; color: ${C.strong}; border: 1px solid ${C.border}`
  return `<div style="display: flex; align-items: center; justify-content: center; min-height: 46px; padding: 12px 18px; border-radius: 11px; font-size: 13.5px; font-weight: 600; ${s}">${esc(label)}</div>`
}

/* ── student shell ──────────────────────────────────────────────────── */
const STUDENT_TABS = [
  ['Home', I.home],
  ['Timetable', I.calendar],
  ['Marks', I.chart],
  ['Profile', I.user],
]

const studentShell = ({ title, active, body, bell = 3, overlay = '' }) => `
<div style="width: ${W}px; height: ${H}px; display: flex; flex-direction: column; overflow: hidden; background: ${C.canvas}; position: relative; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">
  <div style="height: 52px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 0 12px 0 16px; background: ${C.surface}; border-bottom: 1px solid ${C.border}">
    <h1 style="margin: 0; flex: 1; min-width: 0; font-size: 17px; font-weight: 700; line-height: 1.2; letter-spacing: -.01em; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(title)}</h1>
    <div style="position: relative; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0">
      ${icon(I.bell, { size: 18 })}
      ${bell ? `<span class="mono" style="position: absolute; top: 1px; right: 1px; min-width: 14px; height: 14px; border-radius: 999px; background: ${C.bad}; color: #fff; font-size: 9px; font-weight: 700; line-height: 14px; text-align: center">${bell}</span>` : ''}
    </div>
    ${avatar('TM', { size: 32, bg: O.bg, fg: O.fg })}
  </div>
  <div class="scroll" style="flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px 20px">${body}</div>
  ${bottomTabs(STUDENT_TABS, active, C.brand)}
  ${overlay}
</div>`

export const studentArtboard = (o) => wrap(studentShell(o), W, H)

/* ── parent shell ───────────────────────────────────────────────────── */
const PARENT_TABS = [
  ['Home', I.home],
  ['Fees', I.money],
  ['News', I.mail, 3],
  ['You', I.user],
]

const parentShell = ({ title, active, body, payBar, overlay = '' }) => `
<div style="width: ${W}px; height: ${H}px; display: flex; flex-direction: column; overflow: hidden; background: ${C.canvas}; position: relative; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">
  <div style="height: 52px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 16px; background: ${C.surface}; border-bottom: 1px solid ${C.border}">
    <h1 style="margin: 0; flex: 1; min-width: 0; font-size: 16px; font-weight: 600; line-height: 1.1; letter-spacing: -.01em; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(title)}</h1>
    <div style="position: relative; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0">
      ${icon(I.bell, { size: 18 })}
      <span style="position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 999px; background: ${C.bad}; border: 2px solid ${C.surface}"></span>
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 0 4px; flex-shrink: 0">
      <span style="width: 26px; height: 26px; border-radius: 999px; background: ${C.brand}; color: #fff; font-size: 10.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px ${C.brandSoft}">TM</span>
      <span style="font-size: 10px; font-weight: 600; color: ${C.mid}">Tanaka</span>
    </div>
  </div>
  <div class="scroll" style="flex: 1; min-height: 0; overflow-y: auto; padding: 0 0 ${payBar ? 8 : 20}px">${body}</div>
  ${
    payBar
      ? `<div style="flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: ${C.surface}; border-top: 1px solid ${C.border}">
          <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 11px; color: ${C.mid}">What you still owe</span><span class="mono" style="display: block; font-size: 19px; font-weight: 700; color: ${C.bad}">${payBar}</span></span>
          <span style="display: inline-flex; align-items: center; height: 42px; padding: 11px 18px; border-radius: 10px; background: ${C.brand}; color: #fff; font-size: 13.5px; font-weight: 600">Statement</span>
        </div>`
      : ''
  }
  ${bottomTabs(PARENT_TABS, active, C.brand)}
  ${overlay}
</div>`

export const parentArtboard = (o) => wrap(parentShell(o), W, H)

export const sectionH = (label, right) =>
  `<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 18px 20px 8px"><span style="font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: ${C.subtle}">${esc(label)}</span>${right ? `<span class="mono" style="font-size: 10.5px; color: ${C.subtle}">${right}</span>` : ''}</div>`

export const block = (children) => `<div style="margin: 0 16px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}; overflow: hidden">${children}</div>`

/* ═══ STUDENT ═══════════════════════════════════════════════════════ */

export const StudentHome = () =>
  studentArtboard({
    title: 'Home',
    active: 'Home',
    body: `
      <div style="font-size: 12px; color: ${C.mid}">Form 2 &middot; 2A &middot; Term 2</div>
      <h2 style="margin: 4px 0 0; font-size: 21px; font-weight: 700; letter-spacing: -.015em; color: ${C.strong}">Good morning, Tanaka</h2>
      ${eyebrow('Your next class', 'See timetable')}
      ${phoneCard(
        `<div style="display: flex; align-items: center; gap: 12px">
          <div style="width: 56px; flex-shrink: 0; text-align: center; padding: 7px 0; border-radius: 9px; background: ${C.muted}">
            <div class="mono" style="font-size: 14px; font-weight: 700; color: ${C.strong}">08:40</div>
            <div style="font-size: 10px; color: ${C.subtle}">Per 2</div>
          </div>
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 15px; font-weight: 700; color: ${C.strong}">Mathematics</div>
            <div style="font-size: 12px; color: ${C.mid}">Mrs Nyathi &middot; Period 2</div>
            <div style="font-size: 11.5px; color: ${C.subtle}; margin-top: 2px">Rm 4 &middot; 08:40 &ndash; 09:20</div>
          </div>
          ${icon(I.chevR, { size: 17, stroke: C.faint })}
        </div>`,
      )}
      ${eyebrow('This week', 'Whole week')}
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
        ${phoneCard(`<div style="font-size: 11px; color: ${C.mid}">Lessons today</div><div class="mono" style="font-size: 26px; font-weight: 700; color: ${C.strong}; line-height: 1.1; margin-top: 3px">6</div><div style="font-size: 11px; color: ${C.subtle}; margin-top: 2px">6 periods on your day</div>`)}
        <div style="border-radius: 12px; background: ${C.strong}; padding: 13px 14px">
          <div style="font-size: 11px; color: rgba(255,255,255,.7)">Right now</div>
          <div style="font-size: 16px; font-weight: 700; color: #fff; line-height: 1.2; margin-top: 4px">Mathematics</div>
          <div style="font-size: 11px; color: rgba(255,255,255,.66); margin-top: 3px">08:40 &ndash; 09:20</div>
        </div>
      </div>
      ${eyebrow('Quick links')}
      <div style="display: flex; flex-direction: column; gap: 9px">
        ${[
          ['Homework', 'See all', 'What is set and what you handed in', I.clipboard],
          ['Library', 'Books out', 'Borrow a book, or see what you have', I.book],
          ['My goals', 'Your targets', 'What you are aiming for each subject', I.target],
          ['Messages', 'From school', 'School news · marks · homework', I.mail],
        ]
          .map(([title, tag, sub, ic]) =>
            phoneCard(
              `<div style="display: flex; align-items: center; gap: 11px">
                <span style="width: 34px; height: 34px; border-radius: 9px; background: ${C.muted}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${icon(ic, { size: 17 })}</span>
                <span style="flex: 1; min-width: 0"><span style="display: flex; align-items: center; gap: 7px"><span style="font-size: 13.5px; font-weight: 700; color: ${C.strong}">${title}</span>${badge(tag, 'plain')}</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}; margin-top: 1px">${sub}</span></span>
                ${icon(I.chevR, { size: 16, stroke: C.faint })}
              </div>`,
            ),
          )
          .join('')}
      </div>
      <div style="margin-top: 14px">${note('today', 'The bar says only <b>Home</b>. Verbatim: <b>&ldquo;Home&rsquo;s own greeting line does the greeting, so the bar does not repeat it.&rdquo;</b> Every other title in this portal is possessive &mdash; <i>My marks</i>, <i>My timetable</i> &mdash; because <b>&ldquo;on a pupil&rsquo;s phone every screen is about them, and saying so is what makes it feel like their app rather than the school&rsquo;s.&rdquo;</b>')}</div>
    `,
  })

export const StudentTimetable = () => {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const SUBJ = [
    ['Mathematics', 'Rm 4'],
    ['English', 'Rm 7'],
    ['Science', 'Lab 1'],
    ['Shona', 'Rm 9'],
    ['Geography', 'Rm 11'],
    ['History', 'Rm 11'],
  ]
  return studentArtboard({
    title: 'My timetable',
    active: 'Timetable',
    body: `
      <div style="margin-bottom: 12px"><div style="font-size: 15px; font-weight: 700; color: ${C.strong}">Term 2</div>${mono('Form 2 · 2A', { size: 11 })}</div>
      ${phoneCard(
        `<div style="display: grid; grid-template-columns: 36px repeat(5, 1fr); gap: 3px">
          <div></div>
          ${DAYS.map((d, i) => `<div style="text-align: center; font-size: 9.5px; font-weight: 700; color: ${i === 0 ? C.brandStrong : C.subtle}; padding: 2px 0">${d}</div>`).join('')}
          ${[0, 1, 2, 3, 4, 5]
            .map(
              (p) =>
                `<div class="mono" style="font-size: 8.5px; color: ${C.faint}; display: flex; align-items: center">P${p + 1}</div>` +
                DAYS.map((_, d) => {
                  const s = (d * 2 + p) % 7 === 6 ? null : SUBJ[(d + p) % SUBJ.length]
                  if (!s)
                    return `<div style="min-height: 42px; border: 1px dashed ${C.borderStrong}; border-radius: 5px; display: flex; align-items: center; justify-content: center"><span style="font-size: 8px; color: ${C.faint}">Free</span></div>`
                  return `<div style="min-height: 42px; padding: 4px 4px 4px 5px; border-radius: 5px; background: ${C.muted}; border-left: 3px solid ${hue(s[0])}; display: flex; flex-direction: column; gap: 1px; box-shadow: ${d === 0 ? '0 0 0 2px rgba(11,93,240,.22)' : 'none'}">
                    <span style="font-size: 8.5px; font-weight: 600; line-height: 1.2; color: ${C.strong}; overflow: hidden">${s[0]}</span>
                    <span class="mono" style="font-size: 8.5px; color: ${C.subtle}; margin-top: auto">${s[1]}</span>
                  </div>`
                }).join(''),
            )
            .join('')}
        </div>`,
      )}
      <div style="display: flex; gap: 4px; padding: 3px; border-radius: 9px; background: ${C.muted}; border: 1px solid ${C.border}; margin-top: 12px">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          .map(
            (d, i) =>
              `<span style="flex: 1; text-align: center; padding: 7px 0; border-radius: 6px; background: ${i === 0 ? C.surface : 'transparent'}; box-shadow: ${i === 0 ? '0 1px 2px rgba(42,38,34,.06)' : 'none'}; font-size: 11.5px; font-weight: ${i === 0 ? 700 : 500}; color: ${i === 0 ? C.strong : C.mid}">${d}</span>`,
          )
          .join('')}
      </div>
      ${eyebrow('Today (Monday)')}
      <div style="display: flex; flex-direction: column; gap: 8px">
        ${[
          ['08:00', 'English', 'Mr Chirwa · Rm 7'],
          ['08:40', 'Mathematics', 'Mrs Nyathi · Rm 4'],
          ['09:40', 'Free', 'no lesson'],
          ['10:20', 'Combined Science', 'Mr Sibanda · Lab 1'],
          ['11:00', 'Shona', 'Mrs Moyo · Rm 9'],
        ]
          .map(([time, subj, meta]) =>
            phoneCard(
              `<div style="display: flex; align-items: center; gap: 11px">
                <span style="width: 4px; height: 34px; border-radius: 2px; background: ${subj === 'Free' ? C.border : hue(subj)}; flex-shrink: 0"></span>
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13.5px; font-weight: ${subj === 'Free' ? 400 : 700}; color: ${subj === 'Free' ? C.subtle : C.strong}">${subj}</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}">${time} &middot; ${meta}</span></span>
              </div>`,
            ),
          )
          .join('')}
      </div>
      <div style="margin-top: 14px">${note('today', 'No chevron on these rows, deliberately: <b>&ldquo;a lesson row here does not go anywhere, and a chevron that opens nothing is a lie.&rdquo;</b>')}</div>
    `,
  })
}

export const StudentMarks = () =>
  studentArtboard({
    title: 'My marks',
    active: 'Marks',
    body: `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px">
        <span style="display: flex; gap: 3px; padding: 3px; border-radius: 9px; background: ${C.muted}; border: 1px solid ${C.border}; flex: 1">
          ${['Term 1', 'Term 2', 'Term 3']
            .map(
              (t, i) =>
                `<span style="flex: 1; text-align: center; padding: 7px 0; border-radius: 6px; background: ${i === 1 ? C.surface : 'transparent'}; box-shadow: ${i === 1 ? '0 1px 2px rgba(42,38,34,.06)' : 'none'}; font-size: 11.5px; font-weight: ${i === 1 ? 600 : 500}; color: ${i === 1 ? C.strong : C.mid}">${t}</span>`,
            )
            .join('')}
        </span>
        ${mono('2026', { size: 11 })}
      </div>
      <div style="border-radius: 14px; background: linear-gradient(135deg, ${C.brand} 0%, ${C.brandStrong} 100%); padding: 18px 18px 20px; color: #fff">
        <div style="font-size: 11.5px; color: rgba(255,255,255,.76)">Overall mark &middot; Term 2</div>
        <div style="display: flex; align-items: baseline; gap: 5px; margin-top: 5px"><span style="font-size: 32px; font-weight: 700; line-height: 1.05">72</span><span style="font-size: 14px; color: rgba(255,255,255,.7)">/ 100</span></div>
        <div style="font-size: 12.5px; color: rgba(255,255,255,.86); margin-top: 3px">Up 4 on Term 1</div>
        <span style="display: inline-flex; align-items: center; height: 22px; padding: 0 10px; border-radius: 999px; background: rgba(255,255,255,.18); font-size: 11px; font-weight: 600; margin-top: 11px">Across 6 subjects</span>
      </div>
      ${eyebrow('Your subjects · 6', 'Set goals')}
      <div style="display: flex; flex-direction: column; gap: 9px">
        ${[
          ['Mathematics', 'MAT · End of term', 78, 'Up 6', 'A', 'ok', 'Term 1: 72'],
          ['English Language', 'ENG · End of term', 64, 'Down 2', 'C', 'warn', 'Term 1: 66'],
          ['Combined Science', 'CSC · End of term', 71, 'Up 3', 'B', 'ok', 'Term 1: 68'],
          ['Shona', 'SHO · End of term', 81, 'Same', 'A', 'ok', 'Term 1: 81'],
          ['Geography', 'GEO · End of term', 58, 'Up 1', 'C', 'warn', 'Term 1: 57'],
        ]
          .map(([name, sub, score, move, grade, tone, prev]) =>
            phoneCard(
              `<div style="display: flex; align-items: center; gap: 11px">
                <span style="width: 8px; height: 38px; border-radius: 4px; background: ${hue(name)}; flex-shrink: 0"></span>
                <span style="flex: 1; min-width: 0">
                  <span style="display: block; font-size: 13.5px; font-weight: 700; color: ${C.strong}">${name}</span>
                  <span style="display: block; font-size: 11px; color: ${C.subtle}">${sub}</span>
                  <span style="display: block; height: 5px; border-radius: 999px; background: ${C.sunken}; overflow: hidden; margin-top: 7px"><span style="display: block; width: ${score}%; height: 100%; background: ${hue(name)}"></span></span>
                  <span style="display: flex; gap: 5px; margin-top: 7px">${badge(move, tone)}${badge(grade, tone)}${badge(prev, 'plain')}</span>
                </span>
                <span class="mono" style="font-size: 17px; font-weight: 700; color: ${C.strong}; flex-shrink: 0">${score}<span style="font-size: 11px; color: ${C.subtle}">/100</span></span>
              </div>`,
            ),
          )
          .join('')}
      </div>
      <div style="font-size: 11.5px; color: ${C.subtle}; line-height: 1.6; margin-top: 14px">Only marks the school has published are here. A mark your teacher is still working on appears once the school releases it. This term was published on 27 August 2026.</div>
      <div style="margin-top: 12px">${note('today', 'That footnote does work three other screens fail to do: it explains <b>why</b> a subject is missing rather than leaving a gap that reads as a bad mark. It is also the only place in the product where the publish window is explained to the person it affects.')}</div>
    `,
  })

export const StudentHomework = () =>
  studentArtboard({
    title: 'Homework',
    active: 'Home',
    body: `
      <div style="display: flex; gap: 7px; overflow-x: auto; padding-bottom: 4px">
        ${[
          ['Everything', 12, true],
          ['To do', 4, false],
          ['Overdue', 1, false],
          ['Handed in', 5, false],
          ['Marked', 2, false],
        ]
          .map(
            ([label, n, on]) =>
              `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 999px; background: ${on ? C.strong : C.surface}; border: 1px solid ${on ? C.strong : C.border}; flex-shrink: 0"><span style="font-size: 12px; font-weight: 600; color: ${on ? '#fff' : C.mid}">${label}</span><span class="mono" style="font-size: 10.5px; color: ${on ? 'rgba(255,255,255,.7)' : C.faint}">${n}</span></span>`,
          )
          .join('')}
      </div>
      ${eyebrow('4 pieces still to hand in')}
      <div style="display: flex; flex-direction: column; gap: 10px">
        ${[
          ['Mathematics', 'Simultaneous equations, exercise 4', 'Mrs Nyathi · due 21 Aug', '3 days late', 'bad', '', ''],
          ['English Language', 'Comprehension — “The Rain Came”', 'Mr Chirwa · due 26 Aug', 'Due in 2 days', 'warn', '', ''],
          ['Combined Science', 'Write up the titration practical', 'Mr Sibanda · handed in 19 Aug', 'Marked', 'brand', '27/30', 'Good method. Watch your units in Q4.'],
          ['Shona', 'Tsumo nemadimikira — 20 examples', 'Mrs Moyo · handed in 18 Aug', 'Handed in', 'ok', '', ''],
        ]
          .map(([subject, title, meta, pill, tone, score, feedback]) =>
            phoneCard(
              `<div style="font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: ${hue(subject)}">${subject}</div>
               <div style="font-size: 14px; font-weight: 700; color: ${C.strong}; line-height: 1.35; margin-top: 4px">${esc(title)}</div>
               <div style="font-size: 11.5px; color: ${C.subtle}; margin-top: 3px">${meta}</div>
               <div style="display: flex; align-items: center; gap: 8px; margin-top: 9px">
                 ${tone === 'bad' ? `<span style="display: inline-flex; align-items: center; height: 24px; padding: 0 11px; border-radius: 999px; background: ${C.bad}; color: #fff; font-size: 11.5px; font-weight: 700">${pill}</span>` : badge(pill, tone)}
                 ${score ? `<span class="mono" style="font-size: 13px; font-weight: 700; color: ${C.strong}">${score}</span>` : ''}
               </div>
               ${feedback ? `<div style="font-size: 11.5px; color: ${C.mid}; line-height: 1.55; margin-top: 8px; padding-top: 8px; border-top: 1px solid ${C.hair}">${feedback}</div>` : ''}`,
            ),
          )
          .join('')}
      </div>
      <div style="margin-top: 14px">${note('today', 'Verbatim: <b>&ldquo;once work is in, the card says so, with the day it arrived, and it keeps saying so&hellip; Late work is offered, never refused.&rdquo;</b> The overdue pill is the only solid-red thing in the portal, and the sheet behind it still says <b>&ldquo;Hand it in anyway. Your teacher would rather have it late than not at all.&rdquo;</b>')}</div>
    `,
  })

export const StudentHomeworkSheet = () =>
  studentArtboard({
    title: 'Homework',
    active: 'Home',
    body: `<div style="opacity: .35; display: flex; flex-direction: column; gap: 10px">${[1, 2, 3].map(() => phoneCard('<div style="height: 78px"></div>')).join('')}</div>`,
    overlay: `<div style="position: absolute; inset: 0; background: rgba(22,24,29,.4); display: flex; align-items: flex-end">
      <div style="width: 100%; max-height: 82%; border-radius: 18px 18px 0 0; background: ${C.surface}; box-shadow: 0 -20px 40px -10px rgba(22,24,29,.3); display: flex; flex-direction: column; overflow: hidden">
        <div style="padding: 10px 0 0; display: flex; justify-content: center"><span style="width: 36px; height: 4px; border-radius: 999px; background: ${C.borderStrong}"></span></div>
        <div style="padding: 14px 18px 10px">
          <div style="font-size: 16px; font-weight: 700; color: ${C.strong}; line-height: 1.35">Simultaneous equations, exercise 4</div>
          <div style="font-size: 12px; color: ${C.mid}; margin-top: 3px">Mathematics &middot; Mrs Nyathi &middot; due 21 August</div>
        </div>
        <div style="padding: 0 18px 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto">
          <div style="display: flex; gap: 10px; padding: 11px 13px; border: 1px solid ${C.badBd}; border-radius: 11px; background: ${C.badBg}">
            ${icon(I.alert, { size: 16, stroke: C.bad, w: 1.9 })}
            <div><div style="font-size: 12.5px; font-weight: 700; color: ${C.bad}">This is past its date</div><div style="font-size: 12px; color: ${C.bad}; opacity: .9; margin-top: 2px; line-height: 1.55">Hand it in anyway. Your teacher would rather have it late than not at all, and they will see that it came in late.</div></div>
          </div>
          <div>
            <div style="font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: ${C.subtle}">What to do</div>
            <div style="font-size: 12.5px; color: ${C.body}; line-height: 1.6; margin-top: 6px">Questions 1 to 12 in exercise 4. Show your working for every one &mdash; a right answer with no method scores half. Use elimination for 1&ndash;6 and substitution for 7&ndash;12.</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px">
            <span style="font-size: 11.5px; font-weight: 600; color: ${C.body}">Your answer</span>
            <div style="min-height: 84px; padding: 11px 12px; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}; font-size: 12.5px; color: ${C.subtle}; line-height: 1.55">Type your work here, or say what you are handing to your teacher on paper.</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px">
            <span style="font-size: 11.5px; font-weight: 600; color: ${C.body}">Link to your work</span>
            <div style="height: 42px; padding: 11px 12px; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}; font-size: 12.5px; color: ${C.subtle}">https://</div>
            <span style="font-size: 11px; color: ${C.subtle}">Leave this empty unless your work is somewhere your teacher can open.</span>
          </div>
        </div>
        <div style="padding: 12px 18px; border-top: 1px solid ${C.borderSubtle}; display: flex; flex-direction: column; gap: 8px">
          ${wideBtn('Hand in late', 'solid', C.brand)}
          ${wideBtn('Close', 'ghost')}
        </div>
      </div>
    </div>`,
  })

export const StudentGoals = () =>
  studentArtboard({
    title: 'My goals',
    active: 'Home',
    body: `
      <div style="border-radius: 14px; background: linear-gradient(135deg, ${O.fg} 0%, ${O.solid} 100%); padding: 18px; color: #fff">
        <div style="font-size: 11.5px; color: rgba(255,255,255,.78)">Term 2 &middot; what you are aiming for</div>
        <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 5px"><span style="font-size: 32px; font-weight: 700; line-height: 1.05">2/5</span><span style="font-size: 13px; color: rgba(255,255,255,.74)">reached</span></div>
        <div style="font-size: 12.5px; color: rgba(255,255,255,.86); line-height: 1.55; margin-top: 7px">Pick a mark you want in a subject. The app keeps the mark you started from, so you can see how far you have come rather than only how far is left.</div>
      </div>
      ${eyebrow('Each subject · 2/5 on track')}
      <div style="display: flex; flex-direction: column; gap: 9px">
        ${[
          ['Mathematics', 'Taught by Mrs Nyathi · goal 80%', 78, 80, '2% to go', 'Running', 'brand', 72, 'Past papers every Tuesday.'],
          ['English Language', 'Taught by Mr Chirwa · goal 70%', 64, 70, '6% to go', 'Running', 'brand', 66, ''],
          ['Combined Science', 'Taught by Mr Sibanda · goal 75%', 71, 75, '4% to go', 'Running', 'brand', 68, ''],
          ['Shona', 'Taught by Mrs Moyo · goal 80%', 81, 80, 'You did it!', 'Completed', 'ok', 79, ''],
          ['Geography', 'Taught by Mr Dube · no goal yet', 58, 0, 'Not set', 'Not started', 'plain', 0, ''],
        ]
          .map(([name, sub, cur, target, delta, state, tone, start, plan]) =>
            phoneCard(
              `<div style="display: flex; align-items: flex-start; gap: 11px">
                <span style="flex: 1; min-width: 0">
                  <span style="display: block; font-size: 13.5px; font-weight: 700; color: ${C.strong}">${name}</span>
                  <span style="display: block; font-size: 11.5px; color: ${C.subtle}">${sub}</span>
                </span>
                <span style="text-align: right; flex-shrink: 0">
                  <span class="mono" style="display: block; font-size: 15px; font-weight: 700; color: ${C.strong}">${target ? `${cur}/${target}` : '&mdash;'}</span>
                  <span style="display: block; font-size: 10.5px; color: ${delta === 'You did it!' ? C.ok : delta === 'Not set' ? C.subtle : C.mid}">${delta}</span>
                </span>
              </div>
              ${target ? `<div style="height: 6px; border-radius: 999px; background: ${C.sunken}; overflow: hidden; margin-top: 9px"><div style="width: ${Math.min(100, Math.round((cur / target) * 100))}%; height: 100%; background: ${O.solid}"></div></div>` : ''}
              <div style="display: flex; align-items: center; gap: 7px; margin-top: 9px">${badge(state, tone)}${start ? mono(`Started at ${start}%`, { size: 10.5 }) : ''}</div>
              ${plan ? `<div style="font-size: 11.5px; color: ${C.mid}; line-height: 1.5; margin-top: 7px">How you will get there: ${plan}</div>` : ''}`,
            ),
          )
          .join('')}
      </div>
      <div style="margin-top: 14px">${note('today', 'Orange belongs to the pupil&rsquo;s own things &mdash; this hero and the ID card &mdash; and nowhere else. The screen&rsquo;s hardest rule is stated in its source: <b>&ldquo;the one thing this screen must never do is round that down into &lsquo;off track&rsquo; &mdash; a child reading that would think they had failed a test that has not been marked.&rdquo;</b>')}</div>
    `,
  })

export const StudentLibrary = () =>
  studentArtboard({
    title: 'Library',
    active: 'Home',
    body: `
      <div style="display: flex; align-items: center; gap: 9px; padding: 10px 12px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}">
        ${icon(I.search, { size: 16, stroke: C.subtle })}<span style="flex: 1; font-size: 12.5px; color: ${C.subtle}">Search by title or author&hellip;</span>
      </div>
      <div style="display: flex; align-items: center; gap: 11px; padding: 13px 14px; border: 1px solid ${C.badBd}; border-radius: 12px; background: ${C.badBg}; margin-top: 12px">
        <div style="flex: 1; min-width: 0"><div style="font-size: 13px; font-weight: 700; color: ${C.bad}">You owe a fine</div><div style="font-size: 11.5px; color: ${C.bad}; opacity: .9; line-height: 1.5; margin-top: 2px">Pay at the library desk. You cannot borrow again until it is settled.</div></div>
        <span class="mono" style="font-size: 17px; font-weight: 700; color: ${C.bad}; flex-shrink: 0">$ 12.50</span>
      </div>
      ${eyebrow('Books you have out · 2')}
      <div style="display: flex; flex-direction: column; gap: 9px">
        ${[
          ['Things Fall Apart', 'Chinua Achebe', '#7A4A2B', 'Overdue · $ 2.00 to pay', 'bad'],
          ['New General Mathematics 2', 'J.B. Channon', '#1F4E79', 'Bring back in 4 days · 4 Jun', 'plain'],
        ]
          .map(([title, author, cover, due, tone]) =>
            phoneCard(
              `<div style="display: flex; gap: 12px">
                <span style="width: 56px; aspect-ratio: 3/4; border-radius: 6px; background: ${cover}; flex-shrink: 0"></span>
                <span style="flex: 1; min-width: 0; display: flex; flex-direction: column">
                  <span style="font-size: 13.5px; font-weight: 700; color: ${C.strong}; line-height: 1.3">${title}</span>
                  <span style="font-size: 11.5px; color: ${C.subtle}">${author}</span>
                  <span style="font-size: 11.5px; font-weight: 600; color: ${tone === 'bad' ? C.bad : C.mid}; margin-top: 5px">${due}</span>
                  <span style="display: flex; gap: 7px; margin-top: auto; padding-top: 8px">
                    <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid ${C.border}; font-size: 12px; font-weight: 600; color: ${C.mid}">Keep longer</span>
                    <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 8px; background: ${C.brand}; font-size: 12px; font-weight: 600; color: #fff">Bring back</span>
                  </span>
                </span>
              </div>`,
            ),
          )
          .join('')}
      </div>
      ${eyebrow('The shelf · 612')}
      <div style="display: flex; flex-direction: column; gap: 8px">
        ${[
          ['The Rain Came', 'Grace Ogot', '#2F5D50', '6 of 8 on the shelf', 'Take out'],
          ['Nervous Conditions', 'Tsitsi Dangarembga', '#6B2D4E', 'All out · 3 waiting', 'Hold for me'],
          ['Combined Science for ZIMSEC', 'M. Chikoore', '#4A4ED4', '22 of 36 on the shelf', 'Take out'],
          ['Tsumo neMadimikira', 'M. Hamutyinei', '#8A6415', 'All out', 'Hold for me'],
        ]
          .map(([title, author, cover, avail, action]) =>
            phoneCard(
              `<div style="display: flex; align-items: center; gap: 11px">
                <span style="width: 42px; aspect-ratio: 3/4; border-radius: 5px; background: ${cover}; flex-shrink: 0"></span>
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: 600; color: ${C.strong}; line-height: 1.3">${title}</span><span style="display: block; font-size: 11px; color: ${C.subtle}">${author}</span><span style="display: block; font-size: 11px; color: ${avail.startsWith('All out') ? C.warn : C.mid}; margin-top: 3px">${avail}</span></span>
                <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid ${C.border}; font-size: 12px; font-weight: 600; color: ${C.mid}; flex-shrink: 0">${action}</span>
              </div>`,
            ),
          )
          .join('')}
      </div>
      <div style="margin-top: 14px">${note('today', 'Verbatim: <b>&ldquo;The demo also offers a barcode scanner for returns. There is no scanner behind it here, so the card is not drawn.&rdquo;</b> The same restraint the teacher portal shows &mdash; and the opposite of the admin app, where the report-card preview draws a table it never fills.')}</div>
    `,
  })

export const StudentMessages = () =>
  studentArtboard({
    title: 'Messages',
    active: 'Home',
    bell: 0,
    body: `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px">
        <span style="flex: 1; font-size: 12px; color: ${C.mid}">8 messages &middot; 3 new</span>
        <span style="font-size: 12px; font-weight: 500; color: ${C.brandStrong}">Mark all read</span>
        <span style="font-size: 12px; font-weight: 500; color: ${C.brandStrong}">Clear all</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px">
        ${[
          ['Sports day moved to Friday', 'The inter-house athletics has moved from Wednesday to Friday 28 August.', 'Important', C.bad, C.badBg, I.alert, '22 Aug, 14:02', true],
          ['Your Term 2 marks are out', 'Six subjects have been published. Tap to read them.', 'News', C.brand, C.brandSoft, I.info, '22 Aug, 09:15', true],
          ['Homework set — Mathematics', 'Simultaneous equations, exercise 4. Due 21 August.', 'News', C.brand, C.brandSoft, I.info, '17 Aug, 16:40', true],
          ['Library books due before half term', 'Anything out on 1 September is counted late and carries a fine.', 'Worth reading', C.warn, C.warnBg, I.alert, '11 Aug, 08:00', false],
          ['Form 2 trip — permission slips', 'Bring your slip to your form teacher by Friday.', 'Worth reading', C.warn, C.warnBg, I.alert, '4 Aug, 11:20', false],
        ]
          .map(([title, summary, kind, fg, bg, ic, when, unread]) =>
            phoneCard(
              `<div style="display: flex; gap: 11px">
                <span style="width: 36px; height: 36px; border-radius: 9px; background: ${bg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${icon(ic, { size: 17, stroke: fg, w: 1.9 })}</span>
                <span style="flex: 1; min-width: 0">
                  <span style="display: block; font-size: 13px; font-weight: ${unread ? 700 : 600}; color: ${C.strong}; line-height: 1.35">${esc(title)}</span>
                  <span style="display: block; font-size: 11.5px; color: ${C.mid}; line-height: 1.5; margin-top: 2px">${summary}</span>
                  <span style="display: flex; align-items: center; gap: 7px; margin-top: 5px">${badge(kind, kind === 'Important' ? 'bad' : kind === 'Worth reading' ? 'warn' : 'brand')}${mono(when, { size: 10 })}</span>
                </span>
                ${unread ? `<span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.brand}; flex-shrink: 0; margin-top: 5px"></span>` : ''}
              </div>`,
              { tone: unread ? 'unread' : undefined },
            ),
          )
          .join('')}
      </div>
    `,
  })

export const StudentProfile = () =>
  studentArtboard({
    title: 'My profile',
    active: 'Profile',
    body: `
      <div style="border-radius: 16px; background: linear-gradient(135deg, ${O.fg} 0%, ${O.solid} 100%); padding: 16px; color: #fff">
        <div style="display: flex; align-items: center; gap: 13px">
          ${avatar('TM', { size: 52, bg: 'rgba(255,255,255,.2)', fg: '#fff' })}
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 17px; font-weight: 700">Tanaka Mutasa</div>
            <div style="font-size: 12px; color: rgba(255,255,255,.82)">Form 2 &middot; Term 2</div>
            <div style="display: flex; gap: 6px; margin-top: 6px">
              <span class="mono" style="display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: rgba(255,255,255,.2); font-size: 10.5px; font-weight: 600">CHS-1219</span>
              <span style="display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: rgba(255,255,255,.2); font-size: 10.5px; font-weight: 600">Boarder</span>
            </div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 15px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.2)">
          ${[
            ['Year group', 'Form 2'],
            ['Stream', '2A'],
            ['Term', 'Term 2'],
          ]
            .map(([k, v]) => `<div><div style="font-size: 10px; color: rgba(255,255,255,.7); letter-spacing: .05em; text-transform: uppercase">${k}</div><div style="font-size: 13px; font-weight: 700; margin-top: 2px">${v}</div></div>`)
            .join('')}
        </div>
      </div>
      ${eyebrow('Your details')}
      ${phoneCard(
        [
          ['Student number', 'CHS-1219', true],
          ['Year group', 'Form 2', false],
          ['Boarding', 'Boarder', false],
          ['Term', 'Term 2', false],
          ['Sign-in email', 't.mutasa@chishawasha.ac.zw', false],
        ]
          .map(
            ([k, v, isMono], i, a) =>
              `<div style="display: flex; align-items: center; gap: 11px; padding: 12px 14px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}"><span style="flex: 1; font-size: 12px; color: ${C.mid}">${k}</span>${isMono ? mono(v, { size: 12, color: C.strong, weight: 700 }) : `<span style="font-size: 12.5px; font-weight: 600; color: ${C.strong}">${v}</span>`}</div>`,
          )
          .join(''),
        { pad: false },
      )}
      ${eyebrow('Held by the school')}
      ${phoneCard(
        [
          ['Your name', "It goes on the register, your marks and your report, so it follows the school's record and not this app."],
          ['Student number', 'Given to you once when you joined.'],
          ['Year group and stream', 'The office moves you between classes.'],
          ['Boarding or day', 'Set when your family arranged your place.'],
          ['Sign-in email', 'It is how you sign in, so only the office can change it.'],
        ]
          .map(
            ([k, why], i, a) =>
              `<div style="padding: 12px 14px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}"><div style="display: flex; align-items: center; gap: 7px"><span style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">${k}</span>${badge('School office', 'plain')}</div><div style="font-size: 11px; color: ${C.mid}; line-height: 1.5; margin-top: 3px">${why}</div></div>`,
          )
          .join(''),
        { pad: false },
      )}
      <div style="border: 1px solid #DCE5FD; border-radius: 12px; background: ${C.brandSoft}; padding: 12px 14px; margin-top: 12px">
        <div style="font-size: 12.5px; font-weight: 700; color: ${C.brandStrong}">Something here is wrong</div>
        <div style="font-size: 11.5px; color: ${C.brandStrong}; opacity: .88; line-height: 1.55; margin-top: 3px">Tell your form teacher or the school office. They hold the record this app reads from, so fixing it there fixes it on your report too.</div>
      </div>
    `,
  })

export const StudentAttendance = () =>
  studentArtboard({
    title: 'My attendance',
    active: 'Home',
    body: `
      ${note('proposed', 'This screen <b>does not exist</b>. <code>PERMISSIONS_BY_PERSONA.STUDENT</code> grants <code>view-own-attendance</code>, and there is no attendance screen and no attendance figure anywhere in the pupil&rsquo;s portal. Their parent has a full one for the same child; the child cannot see their own.')}
      <div style="border-radius: 14px; background: linear-gradient(135deg, ${C.brand} 0%, ${C.brandStrong} 100%); padding: 18px; color: #fff; margin-top: 12px">
        <div style="font-size: 11.5px; color: rgba(255,255,255,.76)">At school &middot; Term 2</div>
        <div style="font-size: 32px; font-weight: 700; line-height: 1.05; margin-top: 5px">97.2%</div>
        <div style="font-size: 12.5px; color: rgba(255,255,255,.86); margin-top: 3px; line-height: 1.55">Present 68 days &middot; late 2 &middot; away 2 &mdash; out of 72 school days so far.</div>
      </div>
      ${eyebrow('Day by day · 72 days')}
      <div style="display: flex; flex-direction: column; gap: 8px">
        ${[
          ['Fri 22 Aug', 'Form 2A', 'In school', 'ok', ''],
          ['Thu 21 Aug', 'Form 2A · arrived 08:20', 'Late', 'warn', ''],
          ['Wed 20 Aug', 'Form 2A', 'In school', 'ok', ''],
          ['Tue 19 Aug', 'Form 2A · dentist', 'Away — excused', 'plain', ''],
          ['Mon 18 Aug', 'Form 2A', 'In school', 'ok', 'not yet submitted'],
        ]
          .map(([date, cls, state, tone, remark]) =>
            phoneCard(
              `<div style="display: flex; align-items: center; gap: 11px">
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: 600; color: ${C.strong}">${date}</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}">${cls}</span>${remark ? `<span style="display: block; font-size: 11.5px; color: ${C.subtle}; margin-top: 2px">${remark}</span>` : ''}</span>
                <span style="font-size: 12.5px; font-weight: 600; color: ${tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.mid}; flex-shrink: 0">${state}</span>
              </div>`,
            ),
          )
          .join('')}
      </div>
      <div style="margin-top: 14px">${note('proposed', 'Drawn from the parent portal&rsquo;s attendance screen, which already exists, already reads the same registers, and already gets the hardest part right: <b>&ldquo;Telling a parent their child was absent off a register a teacher has not finished is how an argument starts over a tick somebody was about to correct.&rdquo;</b> A pupil deserves the same caveat.')}</div>
    `,
  })

export const StudentSettings = () =>
  studentArtboard({
    title: 'Settings',
    active: 'Profile',
    body: `
      ${eyebrow('Your sign-in')}
      ${phoneCard(
        `${phoneRow(`<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">t.mutasa@chishawasha.ac.zw</span><span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 2px">The address you sign in with. The school office owns it.</span></span>`, false)}
         ${phoneRow(`<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">Change your password</span><span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 2px">You sign in with a password, not a PIN</span></span>${icon(I.chevR, { size: 16, stroke: C.faint })}`, true)}`,
        { pad: false },
      )}
      ${eyebrow('Notifications')}
      ${phoneCard(
        phoneRow(
          `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">Your messages</span><span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 2px">You are told when your school publishes something for you</span></span>${icon(I.chevR, { size: 16, stroke: C.faint })}`,
          true,
        ),
        { pad: false },
      )}
      <div style="display: flex; gap: 10px; padding: 13px 14px; border: 1px solid #DCE5FD; border-radius: 12px; background: ${C.brandSoft}; margin-top: 14px">
        ${icon(I.info, { size: 16, stroke: C.brandStrong, w: 1.9 })}
        <div><div style="font-size: 12.5px; font-weight: 700; color: ${C.brandStrong}">Three things from the design are not here yet</div><div style="font-size: 11.5px; color: ${C.brandStrong}; opacity: .9; line-height: 1.55; margin-top: 3px">A PIN instead of a password, choosing how often you are told, and picking a theme. All three need somewhere to keep the setting, which the school portal does not have yet. They are on the plan rather than hidden.</div></div>
      </div>
      <div style="margin-top: 12px">${note('today', 'This is the whole screen, and it is right to be. Naming the three missing settings is the same choice the teacher portal makes with its <b>Not yet available</b> badges &mdash; and better than a settings screen full of switches that do nothing.')}</div>
    `,
  })

export const StudentHelp = () =>
  studentArtboard({
    title: 'Help',
    active: 'Profile',
    body: `
      ${eyebrow('How to use the app')}
      <div style="display: flex; flex-direction: column; gap: 8px">
        ${[
          ['How do I hand work in?', true],
          ['When do my marks appear?', false],
          ['Why can I see a mark for one subject and not another?', false],
          ['How do I keep a library book longer?', false],
          ['What happens if a book is late?', false],
          ['My timetable looks wrong', false],
          ['What is a goal for?', false],
        ]
          .map(([q, open]) =>
            phoneCard(
              open
                ? `<div style="display: flex; align-items: flex-start; gap: 10px"><span style="flex: 1; font-size: 13px; font-weight: 600; color: ${C.strong}; line-height: 1.4">${q}</span><span style="transform: rotate(90deg); flex-shrink: 0">${icon(I.chevR, { size: 15, stroke: C.faint })}</span></div>
                   <div style="font-size: 12px; color: ${C.mid}; line-height: 1.6; margin-top: 9px">Open the piece of homework, write what you did in the box, or paste a link to it, then tap <b>Hand it in</b>. If it is past its date the button says <b>Hand in late</b> &mdash; hand it in anyway.</div>`
                : `<div style="display: flex; align-items: center; gap: 10px"><span style="flex: 1; font-size: 13px; font-weight: 600; color: ${C.strong}; line-height: 1.4">${q}</span>${icon(I.chevR, { size: 15, stroke: C.faint })}</div>`,
            ),
          )
          .join('')}
      </div>
      ${eyebrow('Talk to someone')}
      ${phoneCard(
        `<div style="font-size: 13px; font-weight: 700; color: ${C.strong}">The school office</div><div style="font-size: 11.5px; color: ${C.mid}; line-height: 1.55; margin-top: 3px">Anything about your class, your marks or your fees is theirs to change &mdash; this app only shows you what they have recorded.</div>`,
      )}
    `,
  })

export const StudentLogin = () =>
  wrap(
    `<div style="width: ${W}px; height: ${H}px; background: ${C.canvas}; display: flex; flex-direction: column; justify-content: center; padding: 0 24px; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 11px; text-align: center; margin-bottom: 22px">
        <div style="width: 54px; height: 54px; border-radius: 14px; background: linear-gradient(135deg, ${O.fg} 0%, ${O.solid} 100%); display: flex; align-items: center; justify-content: center">${icon(I.users, { size: 26, stroke: '#fff', w: 1.8 })}</div>
        <div>
          <div style="font-size: 19px; font-weight: 700; color: ${C.strong}">Student Portal</div>
          <div style="font-size: 12.5px; color: ${C.mid}; margin-top: 3px; line-height: 1.5">Access your enrollment, results, and school information.</div>
        </div>
        ${badge('Chishawasha High', 'plain')}
      </div>
      <div style="border: 1px solid ${C.border}; border-radius: 14px; background: ${C.surface}; padding: 18px; display: flex; flex-direction: column; gap: 13px">
        ${['Email', 'Password']
          .map((l) => `<div style="display: flex; flex-direction: column; gap: 5px"><span style="font-size: 11.5px; font-weight: 600; color: ${C.body}">${l}</span><div style="height: 44px; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}"></div></div>`)
          .join('')}
        <div style="height: 48px; border-radius: 10px; background: ${C.brand}; display: flex; align-items: center; justify-content: center"><span style="font-size: 14px; font-weight: 600; color: #fff">Sign in</span></div>
      </div>
      <div style="font-size: 11.5px; color: ${C.subtle}; text-align: center; line-height: 1.55; margin-top: 14px">Contact your school administration if you need login credentials.</div>
      <div style="margin-top: 16px">${note('today', 'US product English again &mdash; &ldquo;Access your enrollment, results, and school information&rdquo; &mdash; on a phone app whose every other screen says <i>My marks</i> and <i>Bring back in 4 days</i>. All three portal logins share one component and one register; the screens behind them do not.')}</div>
    </div>`,
    W,
    H,
  )

/* ═══ PARENT ════════════════════════════════════════════════════════ */

export const ParentHome = () =>
  parentArtboard({
    title: 'Home',
    active: 'Home',
    body: `
      <div style="padding: 16px 20px 0">
        <div style="font-size: 12px; color: ${C.mid}">Good morning</div>
        <h2 style="margin: 3px 0 0; font-size: 21px; font-weight: 700; letter-spacing: -.015em; color: ${C.strong}">Hi, Grace Mutasa</h2>
        <div style="font-size: 12px; color: ${C.subtle}; margin-top: 3px">Chishawasha High &middot; Term 2 &middot; Week 6 of 14</div>
      </div>
      <div style="margin: 14px 16px 0; border-radius: 14px; background: linear-gradient(135deg, ${C.brand} 0%, ${C.brandStrong} 100%); padding: 18px; color: #fff">
        <div style="font-size: 11.5px; color: rgba(255,255,255,.76)">You still owe &middot; Tanaka</div>
        <div class="mono" style="font-size: 28px; font-weight: 700; line-height: 1.1; margin-top: 4px">USD 310.00</div>
        <div style="font-size: 12.5px; color: rgba(255,255,255,.86); margin-top: 3px">Term 2 fees &middot; pay by 15 September</div>
        <div style="height: 6px; border-radius: 999px; background: rgba(255,255,255,.24); overflow: hidden; margin-top: 12px"><div style="width: 50%; height: 100%; background: #fff"></div></div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,.76); margin-top: 5px"><span>Paid &middot; 310.00</span><span>Total &middot; 620.00</span></div>
        <div style="display: flex; gap: 8px; margin-top: 13px">
          <span style="flex: 1; display: inline-flex; align-items: center; justify-content: center; height: 40px; border-radius: 10px; background: #fff; color: ${C.brandStrong}; font-size: 13px; font-weight: 700">See fee statement</span>
          <span style="flex: 1; display: inline-flex; align-items: center; justify-content: center; height: 40px; border-radius: 10px; background: rgba(255,255,255,.18); color: #fff; font-size: 13px; font-weight: 600">From the school</span>
        </div>
      </div>
      ${sectionH('Today', 'See full day')}
      ${block(
        [
          ['08:00', 'English Language', 'Mr Chirwa · Rm 7', false],
          ['08:40', 'Mathematics', 'Mrs Nyathi · Rm 4', true],
          ['09:40', 'Combined Science', 'Mr Sibanda · Lab 1', false],
          ['10:20', 'Shona', 'Mrs Moyo · Rm 9', false],
        ]
          .map(
            ([time, subj, meta, next], i, a) =>
              `<div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}">
                ${mono(time, { size: 11.5, color: C.body, width: 42, weight: 700 })}
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: 600; color: ${C.strong}">${subj}</span><span style="display: block; font-size: 11px; color: ${C.subtle}">${meta}</span></span>
                ${next ? `<span style="display: inline-flex; align-items: center; height: 19px; padding: 0 8px; border-radius: 5px; background: ${C.brandSoft}; color: ${C.brandStrong}; font-size: 9.5px; font-weight: 700; letter-spacing: .06em">UP NEXT</span>` : ''}
              </div>`,
          )
          .join(''),
      )}
      ${sectionH('Quick look')}
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 16px">
        ${phoneCard(`<div style="font-size: 11px; color: ${C.mid}">How often at school</div><div class="mono" style="font-size: 26px; font-weight: 700; color: ${C.ok}; line-height: 1.1; margin-top: 3px">97%</div><div style="font-size: 11px; color: ${C.subtle}; margin-top: 2px">Present 68 of 70 days</div>`)}
        ${phoneCard(`<div style="font-size: 11px; color: ${C.mid}">Marks</div><div style="font-size: 20px; font-weight: 700; color: ${C.strong}; line-height: 1.2; margin-top: 5px">Ready</div><div style="font-size: 11px; color: ${C.subtle}; margin-top: 2px">Term 2&rsquo;s marks are out</div>`)}
      </div>
      ${sectionH('School news · 3 new', 'See all')}
      ${block(
        [
          ['Sports day moved to Friday', 'From the school · 22 Aug', true],
          ['Fee reminder — second instalment', 'From the school · 19 Aug', true],
          ['Parents’ evening, Form 4', 'From the school · 4 Aug', false],
        ]
          .map(
            ([title, meta, unread], i, a) =>
              `<div style="display: flex; align-items: center; gap: 11px; padding: 13px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}">
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: ${unread ? 700 : 500}; color: ${unread ? C.strong : C.body}">${esc(title)}</span><span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 1px">${meta}</span></span>
                ${unread ? `<span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.brand}; flex-shrink: 0"></span>` : icon(I.chevR, { size: 15, stroke: C.faint })}
              </div>`,
          )
          .join(''),
      )}
      <div style="margin: 14px 16px 0">${note('today', 'Verbatim, and the sharpest rule in the parent portal: <b>&ldquo;A figure a parent may not see is not shown as zero. A guardian without <code>canReceiveFinancials</code> gets no fee hero at all&hellip; because &lsquo;0.00 owed&rsquo; is a wrong answer where &lsquo;not shown to you&rsquo; is a true one.&rdquo;</b>')}</div>
    `,
  })

export const ParentFees = () =>
  parentArtboard({
    title: 'School fees',
    active: 'Fees',
    payBar: 'USD 310.00',
    body: `
      <div style="display: flex; align-items: center; gap: 10px; padding: 14px 20px 0">
        ${avatar('TM', { size: 28 })}<span style="font-size: 12.5px; font-weight: 600; color: ${C.strong}">Tanaka Mutasa</span><span style="font-size: 12px; color: ${C.subtle}">Form 2A</span>
      </div>
      <div style="margin: 12px 16px 0; border-radius: 14px; background: linear-gradient(135deg, ${C.brand} 0%, ${C.brandStrong} 100%); padding: 18px; color: #fff">
        <div style="font-size: 11.5px; color: rgba(255,255,255,.76)">What you still owe</div>
        <div class="mono" style="font-size: 28px; font-weight: 700; line-height: 1.1; margin-top: 4px">USD 310.00</div>
        <div style="font-size: 12.5px; color: rgba(255,255,255,.86); margin-top: 3px">Term 2 fees &middot; pay by 15 September</div>
        <div style="height: 6px; border-radius: 999px; background: rgba(255,255,255,.24); overflow: hidden; margin-top: 12px"><div style="width: 50%; height: 100%; background: #fff"></div></div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,.76); margin-top: 5px"><span>Paid &middot; 310.00</span><span>Total &middot; 620.00</span></div>
      </div>
      ${sectionH('Fee statement', 'Sent 4 May 2026')}
      ${block(`
        <div style="padding: 13px 16px; border-bottom: 1px solid ${C.hair}">
          <div style="display: flex; align-items: center; gap: 10px">
            <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: 700; color: ${C.strong}">Term 2</span>${mono('INV-2026-0412 · due 15 Sep', { size: 10.5 })}</span>
            <span class="mono" style="font-size: 14px; font-weight: 700; color: ${C.bad}">310.00</span>
          </div>
          <div style="margin-top: 11px; padding-top: 11px; border-top: 1px solid ${C.hair}; display: flex; flex-direction: column; gap: 8px">
            ${[
              ['Tuition', 'TUI', '240.00'],
              ['Boarding', 'BRD', '260.00'],
              ['Sports levy', 'SPT', '40.00'],
              ['Development levy', 'DEV', '80.00'],
            ]
              .map(([d, code, amt]) => `<div style="display: flex; align-items: center; gap: 10px"><span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12px; color: ${C.body}">${d}</span>${mono(code, { size: 10 })}</span><span class="mono" style="font-size: 12.5px; color: ${C.body}">${amt}</span></div>`)
              .join('')}
            <div style="display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid ${C.hair}"><span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12px; color: ${C.ok}">Already paid</span>${mono('Against INV-2026-0412', { size: 10 })}</span><span class="mono" style="font-size: 12.5px; font-weight: 700; color: ${C.ok}">&minus;310.00</span></div>
          </div>
          <div style="margin-top: 12px">${wideBtn('Download this bill', 'ghost')}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; padding: 13px 16px; background: ${C.canvas}">
          <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 700; color: ${C.strong}">Total for the term</span><span style="display: block; font-size: 11px; color: ${C.subtle}">Term 2 &middot; everything added up</span></span>
          <span class="mono" style="font-size: 15px; font-weight: 700; color: ${C.strong}">620.00</span>
        </div>`)}
      ${sectionH('Payments you have made', '2 receipts')}
      ${block(
        [
          ['310.00', '18 Aug 2026 · Mobile money · Ecocash 8841 2290'],
          ['310.00', '12 May 2026 · Bank transfer · CBZ 44120'],
        ]
          .map(
            ([amt, meta], i, a) =>
              `<div style="display: flex; align-items: center; gap: 11px; padding: 13px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}">
                <span style="flex: 1; min-width: 0"><span class="mono" style="display: block; font-size: 14px; font-weight: 700; color: ${C.strong}">${amt}</span><span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 1px">${meta}</span></span>
                <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 13px; border-radius: 8px; border: 1px solid ${C.border}; font-size: 12px; font-weight: 600; color: ${C.mid}">Receipt</span>
              </div>`,
          )
          .join(''),
      )}
      <div style="margin: 14px 16px 0">${note('today', 'Verbatim: <b>&ldquo;There is no payment flow in this portal, so the sticky bar&rsquo;s action is the one thing a parent can actually do here.&rdquo;</b> The bar says <b>Statement</b>, not <b>Pay now</b> &mdash; which is honest, and is also the single largest product gap in campus: a parent can see USD 310.00 owed and cannot pay it.')}</div>
    `,
  })

export const ParentAttendance = () =>
  parentArtboard({
    title: 'Attendance',
    active: 'Home',
    body: `
      <div style="margin: 16px 16px 0; border: 1px solid ${C.border}; border-radius: 14px; background: ${C.surface}; padding: 18px">
        <div style="display: flex; align-items: baseline; gap: 8px"><span class="mono" style="font-size: 28px; font-weight: 700; line-height: 1; color: ${C.ok}">97%</span><span style="font-size: 12.5px; color: ${C.mid}">at school &middot; Tanaka</span></div>
        <div style="font-size: 12px; color: ${C.subtle}; line-height: 1.55; margin-top: 8px">Present 68 days &middot; late 2 &middot; away 2 &mdash; out of 72 school days so far.</div>
      </div>
      ${sectionH('Day by day', '72 days')}
      ${block(
        [
          ['22 Aug 2026', 'Form 2A', 'In school', C.ok, ''],
          ['21 Aug 2026', 'Form 2A · arrived 08:20', 'Late', C.warn, ''],
          ['20 Aug 2026', 'Form 2A', 'In school', C.ok, ''],
          ['19 Aug 2026', 'Form 2A · dentist', 'Away — excused', C.mid, ''],
          ['18 Aug 2026', 'Form 2A', 'In school', C.ok, 'not yet submitted'],
          ['15 Aug 2026', 'Form 2A', 'Away', C.bad, ''],
        ]
          .map(
            ([date, meta, state, fg, pending], i, a) =>
              `<div style="display: flex; align-items: center; gap: 11px; padding: 13px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}">
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${date}</span><span style="display: block; font-size: 11px; color: ${C.subtle}">${meta}</span>${pending ? `<span style="display: block; font-size: 11.5px; color: ${C.subtle}; margin-top: 2px">${pending}</span>` : ''}</span>
                <span style="font-size: 12.5px; font-weight: 600; color: ${fg}; flex-shrink: 0">${state}</span>
              </div>`,
          )
          .join(''),
      )}
      <div style="margin: 14px 16px 0">${note('today', 'The <b>&ldquo;not yet submitted&rdquo;</b> line is the whole design, and its reason is stated outright: <b>&ldquo;Telling a parent their child was absent off a register a teacher has not finished is how an argument starts over a tick somebody was about to correct.&rdquo;</b>')}</div>
    `,
  })

export const ParentMarks = () =>
  parentArtboard({
    title: 'Marks',
    active: 'Home',
    body: `
      ${sectionH('Term 2', '6 subjects')}
      ${[
        ['Mathematics', 'A · Working consistently. Strong on algebra.', 78, 'good'],
        ['English Language', 'C · Needs to plan before writing.', 64, 'good'],
        ['Combined Science', 'B · Practical work is careful.', 71, 'good'],
        ['Shona', 'A · Excellent oral work.', 81, 'good'],
        ['Geography', 'C · Map skills improving.', 58, 'good'],
        ['History', 'D · Missed several assessments.', 41, 'bad'],
      ]
        .map(
          ([subj, remark, score, tone]) =>
            `<div style="margin: 0 16px 9px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}; padding: 13px 14px">
              <div style="display: flex; align-items: center; gap: 11px">
                <span style="width: 34px; height: 34px; border-radius: 9px; background: ${C.brandSoft}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${icon(I.book, { size: 16, stroke: C.brandStrong })}</span>
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13.5px; font-weight: 700; color: ${C.strong}">${subj}</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}; line-height: 1.4; margin-top: 1px">${remark}</span></span>
                <span class="mono" style="font-size: 17px; font-weight: 700; color: ${tone === 'bad' ? C.bad : C.ok}; flex-shrink: 0">${score}%</span>
              </div>
              <div style="height: 5px; border-radius: 999px; background: ${C.sunken}; overflow: hidden; margin-top: 10px"><div style="width: ${score}%; height: 100%; background: ${tone === 'bad' ? C.bad : C.ok}"></div></div>
            </div>`,
        )
        .join('')}
      <div style="margin: 6px 16px 0">${wideBtn('Download report card', 'ghost')}</div>
      <div style="margin: 14px 16px 0">${note('today', 'The blocked state is worth reading beside this one: <b>&ldquo;Marks are not shown on your account &mdash; the school has set your account up without academic access for Tanaka.&rdquo;</b> Not an error, not a zero, and it names the child.')}</div>
    `,
  })

export const ParentNotices = () =>
  parentArtboard({
    title: 'School news',
    active: 'News',
    body: `
      ${sectionH('School news', '3 new')}
      ${block(
        [
          ['Sports day moved to Friday', 'The inter-house athletics has moved from Wednesday to Friday 28 August because of the weather.', C.bad, C.badBg, I.alert, 'From the school · 22 Aug', true],
          ['Fee reminder — Term 2 second instalment', 'The second instalment fell due on 15 August. Statements are on the parent portal.', C.warn, C.warnBg, I.alert, 'From the school · 19 Aug', true],
          ['Library books due back before half term', 'Anything out on 1 September is counted late and carries a fine.', C.brand, C.brandSoft, I.info, 'From the school · 11 Aug', true],
          ['Parents’ evening, Form 4', 'Booking opens on the parent portal at 18:00 on Thursday.', C.brand, C.brandSoft, I.info, 'From the school · 4 Aug', false],
        ]
          .map(
            ([title, summary, fg, bg, ic, meta, unread], i, a) =>
              `<div style="display: flex; gap: 11px; padding: 14px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}">
                <span style="width: 34px; height: 34px; border-radius: 9px; background: ${bg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${icon(ic, { size: 16, stroke: fg, w: 1.9 })}</span>
                <span style="flex: 1; min-width: 0">
                  <span style="display: block; font-size: 13px; font-weight: ${unread ? 700 : 500}; color: ${unread ? C.strong : C.body}; line-height: 1.35">${esc(title)}</span>
                  <span style="display: block; font-size: 11.5px; color: ${C.mid}; line-height: 1.5; margin-top: 2px">${summary}</span>
                  <span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 4px">${meta}</span>
                </span>
                ${unread ? `<span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.brand}; flex-shrink: 0; margin-top: 5px"></span>` : icon(I.chevR, { size: 15, stroke: C.faint })}
              </div>`,
          )
          .join(''),
      )}
      <div style="margin: 12px 16px 0">${wideBtn('Mark them all as read', 'ghost')}</div>
      <div style="margin: 14px 16px 0">${note('today', 'The source column says <b>From the school</b> rather than the raw notice type &mdash; which is exactly what the admin-side notices table fails to do, where the same field prints <code>PARENTS</code>. The parent portal humanises it; the staff screen shouts it.')}</div>
    `,
  })

export const ParentMessages = () =>
  parentArtboard({
    title: 'Messages',
    active: 'You',
    body: `
      ${sectionH('Messages from teachers', '1 new')}
      ${block(
        [
          ['Mrs P. Nyathi', 'Yes — we start on trigonometry on Thursday and they will each need one.', 're: Tanaka', true],
          ['The school office', 'Your receipt for the second instalment is attached to the statement.', 'General', false],
          ['Mr T. Chirwa', 'Tanaka read very well in class this week. Worth telling him.', 're: Tanaka', false],
        ]
          .map(
            ([who, preview, ctx, unread], i, a) =>
              `<div style="display: flex; align-items: center; gap: 11px; padding: 13px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}">
                ${avatar(who === 'The school office' ? 'SO' : who.split(' ').slice(-1)[0].slice(0, 2).toUpperCase(), { size: 34 })}
                <span style="flex: 1; min-width: 0">
                  <span style="display: block; font-size: 13px; font-weight: ${unread ? 700 : 600}; color: ${C.strong}">${who}</span>
                  <span style="display: block; font-size: 11.5px; color: ${C.mid}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${preview}</span>
                  <span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 1px">${ctx}</span>
                </span>
                ${unread ? `<span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.brand}; flex-shrink: 0"></span>` : ''}
              </div>`,
          )
          .join(''),
      )}
      <div style="margin: 12px 16px 0">${wideBtn('Write to the school', 'solid', C.brand)}</div>
      ${sectionH('Calculator for Thursday')}
      <div style="margin: 0 16px; display: flex; flex-direction: column; gap: 9px">
        <div style="max-width: 82%; margin-left: auto; padding: 10px 13px; border-radius: 12px 12px 3px 12px; background: ${C.brand}"><div style="font-size: 12.5px; color: #fff; line-height: 1.55">Good evening. Tanaka says he needs a scientific calculator for Thursday &mdash; is that right?</div><div style="font-size: 10.5px; color: rgba(255,255,255,.72); margin-top: 5px">22 Aug, 18:40</div></div>
        <div style="max-width: 82%; padding: 10px 13px; border: 1px solid ${C.border}; border-radius: 12px 12px 12px 3px; background: ${C.surface}"><div style="font-size: 12.5px; color: ${C.body}; line-height: 1.55">Yes &mdash; we start on trigonometry on Thursday and they will each need one. The school shop has them.</div><div style="font-size: 10.5px; color: ${C.subtle}; margin-top: 5px">22 Aug, 19:02</div></div>
        <div style="min-height: 56px; padding: 11px 12px; border: 1px solid ${C.border}; border-radius: 11px; background: ${C.surface}; font-size: 12.5px; color: ${C.subtle}">Write a reply</div>
        ${wideBtn('Send', 'solid', C.brand)}
      </div>
    `,
  })

export const ParentProfile = () =>
  parentArtboard({
    title: 'Your details',
    active: 'You',
    body: `
      <div style="background: linear-gradient(180deg, ${C.brandSoft} 0%, rgba(232,239,254,0) 100%); padding: 22px 20px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center">
        ${avatar('GM', { size: 78, bg: C.brand, fg: '#fff' })}
        <div>
          <h2 style="margin: 0; font-size: 19px; font-weight: 700; color: ${C.strong}">Grace Mutasa</h2>
          <div style="font-size: 12.5px; color: ${C.mid}; margin-top: 2px">Main parent &middot; 1 child on your account</div>
        </div>
      </div>
      ${sectionH('How the school reaches you')}
      ${block(
        [
          ['Main phone', '077 412 8890'],
          ['Email', 'g.mutasa@example.co.zw'],
        ]
          .map(
            ([k, v], i, a) =>
              `<div style="display: flex; align-items: center; gap: 11px; padding: 14px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}"><span style="flex: 1; min-width: 0"><span style="display: block; font-size: 11px; color: ${C.subtle}">${k}</span><span style="display: block; font-size: 13px; font-weight: 600; color: ${C.strong}; margin-top: 1px">${v}</span></span>${icon(I.chevR, { size: 15, stroke: C.faint })}</div>`,
          )
          .join(''),
      )}
      ${sectionH('Your children', '1 child')}
      ${block(
        `<div style="display: flex; align-items: center; gap: 11px; padding: 14px 16px">
          ${avatar('TM', { size: 36 })}
          <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13.5px; font-weight: 700; color: ${C.strong}">Tanaka Mutasa</span><span style="display: block; font-size: 11.5px; color: ${C.subtle}">Form 2 &middot; 2A &middot; Mother</span></span>
          <span class="mono" style="display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 5px; background: ${C.brandSoft}; color: ${C.brandStrong}; font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase">Viewing</span>
        </div>`,
      )}
      ${sectionH('Your account')}
      ${block(
        [
          ['Messages', 'Write to the school, and read replies'],
          ['Help and common questions', 'Answers without ringing the office'],
        ]
          .map(
            ([k, sub], i, a) =>
              `<div style="display: flex; align-items: center; gap: 11px; padding: 14px 16px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`}"><span style="flex: 1; min-width: 0"><span style="display: block; font-size: 13px; font-weight: 600; color: ${C.strong}">${k}</span><span style="display: block; font-size: 11px; color: ${C.subtle}; margin-top: 1px">${sub}</span></span>${icon(I.chevR, { size: 15, stroke: C.faint })}</div>`,
          )
          .join(''),
      )}
      <div style="margin: 16px 16px 0">${wideBtn('Sign out', 'danger')}</div>
      <div style="margin: 14px 16px 0">${note('today', 'Two intents, both good. <b>&ldquo;How the school reaches you is above the children on purpose: a wrong phone number is the reason a parent misses everything else in this app.&rdquo;</b> And on the sign-out: <b>&ldquo;a &lsquo;sign out&rsquo; that leaves the session alive is the worst kind of lie for a portal holding another family&rsquo;s data.&rdquo;</b>')}</div>
      <div style="margin: 10px 16px 0">${note('proposed', 'The chevrons on the phone and email rows are decorative &mdash; neither is a link. On a screen whose whole argument is that a wrong phone number costs the parent everything, they should open a correction request to the office.')}</div>
    `,
  })

export const ParentChildSwitcher = () =>
  parentArtboard({
    title: 'Home',
    active: 'Home',
    body: `<div style="opacity: .3; padding: 16px"><div style="height: 130px; border-radius: 14px; background: ${C.sunken}"></div><div style="height: 210px; border-radius: 14px; background: ${C.sunken}; margin-top: 14px"></div></div>`,
    overlay: `<div style="position: absolute; inset: 0; background: rgba(22,24,29,.4); display: flex; align-items: flex-end">
      <div style="width: 100%; border-radius: 18px 18px 0 0; background: ${C.surface}; box-shadow: 0 -20px 40px -10px rgba(22,24,29,.3); overflow: hidden">
        <div style="padding: 10px 0 0; display: flex; justify-content: center"><span style="width: 36px; height: 4px; border-radius: 999px; background: ${C.borderStrong}"></span></div>
        <div style="padding: 14px 20px 12px">
          <div style="font-size: 16px; font-weight: 700; color: ${C.strong}">Switch child</div>
          <div style="font-size: 12.5px; color: ${C.mid}; line-height: 1.55; margin-top: 3px">Pick which child you want to look at. Fees, school day, marks and news will all change.</div>
        </div>
        ${[
          ['Tanaka Mutasa', 'Form 2 · 2A', true],
          ['Rufaro Mutasa', 'Form 4 · 4B', false],
          ['Anesu Mutasa', 'No class yet', false],
        ]
          .map(
            ([name, cls, on], i, a) =>
              `<div style="display: flex; align-items: center; gap: 12px; padding: 14px 20px; ${i === a.length - 1 ? '' : `border-bottom: 1px solid ${C.hair};`} background: ${on ? C.brandSoft : 'transparent'}">
                ${avatar(name.split(' ').map((p) => p[0]).join(''), { size: 40 })}
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 14px; font-weight: ${on ? 700 : 600}; color: ${C.strong}">${name}</span><span style="display: block; font-size: 11.5px; color: ${cls === 'No class yet' ? C.warn : C.subtle}">${cls}</span></span>
                ${on ? icon(I.check, { size: 19, stroke: C.brandStrong, w: 2.4 }) : ''}
              </div>`,
          )
          .join('')}
        <div style="padding: 14px 20px 22px">${note('today', 'Verbatim: <b>&ldquo;The child switcher is one small avatar chip in the app bar rather than a row of chips above the content&hellip; which child is in view is one glance at the initials, and changing them is one tap.&rdquo;</b><br><br><b>Copy drift:</b> the Help screen still tells a parent to <i>&ldquo;use the row of names at the top of the screen to switch&rdquo;</i> &mdash; describing the prototype&rsquo;s chip row, which this sheet replaced.')}</div>
      </div>
    </div>`,
  })

export const ParentHelp = () =>
  parentArtboard({
    title: 'Help',
    active: 'You',
    body: `
      ${sectionH('Common questions')}
      <div style="margin: 0 16px; display: flex; flex-direction: column; gap: 9px">
        ${[
          ["Why can't I see my child's marks?", true],
          ['The fees figure looks wrong.', false],
          ['My child was marked away but they were at school.', false],
          ['How do I get a receipt or a statement?', false],
          ['I have two children here but only see one.', false],
          ['Someone else uses this phone.', false],
        ]
          .map(([q, open]) =>
            phoneCard(
              open
                ? `<div style="display: flex; align-items: flex-start; gap: 10px"><span style="flex: 1; font-size: 13px; font-weight: 600; color: ${C.strong}; line-height: 1.4">${esc(q)}</span><span style="transform: rotate(90deg); flex-shrink: 0">${icon(I.chevR, { size: 15, stroke: C.faint })}</span></div>
                   <div style="font-size: 12px; color: ${C.mid}; line-height: 1.6; margin-top: 9px">The school publishes marks once they have been checked. Until then your child&rsquo;s teachers are still marking, and nothing is missing.</div>`
                : `<div style="display: flex; align-items: center; gap: 10px"><span style="flex: 1; font-size: 13px; font-weight: 600; color: ${C.strong}; line-height: 1.4">${esc(q)}</span>${icon(I.chevR, { size: 15, stroke: C.faint })}</div>`,
            ),
          )
          .join('')}
      </div>
      <div style="margin: 14px 16px 0">${note('fix', 'The answer to <b>&ldquo;I have two children here but only see one&rdquo;</b> says <i>&ldquo;Use the row of names at the top of the screen to switch&rdquo;</i>. There is no row of names: the shipped shell has a single avatar chip that opens a bottom sheet. The help text describes a screen that was replaced.')}</div>
    `,
  })

export const ParentLogin = () =>
  wrap(
    `<div style="width: ${W}px; height: ${H}px; background: ${C.canvas}; display: flex; flex-direction: column; justify-content: center; padding: 0 24px; --band-h: {{bandH}}; --row-h: {{rowH}}; --head-h: {{headH}}">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 11px; text-align: center; margin-bottom: 22px">
        <div style="width: 54px; height: 54px; border-radius: 14px; background: linear-gradient(135deg, ${C.brand} 0%, ${C.brandStrong} 100%); display: flex; align-items: center; justify-content: center">${icon(I.home, { size: 26, stroke: '#fff', w: 1.8 })}</div>
        <div>
          <div style="font-size: 19px; font-weight: 700; color: ${C.strong}">Guardian Portal</div>
          <div style="font-size: 12.5px; color: ${C.mid}; margin-top: 3px; line-height: 1.5">View your children&rsquo;s progress, fees, and school communications.</div>
        </div>
        ${badge('Chishawasha High', 'plain')}
      </div>
      <div style="border: 1px solid ${C.border}; border-radius: 14px; background: ${C.surface}; padding: 18px; display: flex; flex-direction: column; gap: 13px">
        ${['Email', 'Password']
          .map((l) => `<div style="display: flex; flex-direction: column; gap: 5px"><span style="font-size: 11.5px; font-weight: 600; color: ${C.body}">${l}</span><div style="height: 44px; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}"></div></div>`)
          .join('')}
        <div style="height: 48px; border-radius: 10px; background: ${C.brand}; display: flex; align-items: center; justify-content: center"><span style="font-size: 14px; font-weight: 600; color: #fff">Sign in</span></div>
      </div>
      <div style="font-size: 11.5px; color: ${C.subtle}; text-align: center; line-height: 1.55; margin-top: 14px">Contact the school to request guardian portal access.</div>
      <div style="margin-top: 16px">${note('today', 'The portal is called <b>Guardian Portal</b> here and <b>parent</b> everywhere behind it &mdash; the tabs say <i>You</i>, the greeting says <i>Hi</i>, the help says <i>your child</i>. Worth settling: guardian is the record, parent is the person.')}</div>
    </div>`,
    W,
    H,
  )
