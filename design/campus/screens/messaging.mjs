/**
 * Messaging, redesigned.
 *
 * The model in lib/schools/messages.ts and prisma's SchoolMessageThread is
 * better than any of the three screens sitting on it. It already holds:
 *
 *   - a NAMED RECIPIENT — teacherProfileId, null meaning the office
 *   - a NAMED CHILD — studentId, null meaning a general enquiry
 *   - WHOSE MOVE IT IS — derived from the last sender's side, never stored,
 *     "because a counter and the messages it counts drift apart, and the badge
 *     is the thing people trust"
 *   - CLOSURE — closedAt
 *   - an OFFICE INBOX — allThreads(), exposed at /api/v2/schools/messages
 *
 * None of that reaches a screen. The parent's compose asks for a subject and a
 * body and never asks who should read it. The office inbox has no page and no
 * nav entry, so a "general enquiry to the office" lands nowhere anyone looks.
 * A teacher who receives a fees question can only answer it or ignore it,
 * although teacherProfileId is one mutable field. Closure is discovered by
 * typing a reply and being refused.
 *
 * The redesign turns those stored facts into the interface: every conversation
 * is a named person, about a named child, on a named subject, and it always
 * says whose move it is.
 */
import {
  C, I, esc, adminArtboard, page, grid, rowFlex, card, table, listRow, badge,
  avatar, mono, txt, alert, ghostBtn, solidBtn, filterSelect, searchField, segments,
  tinyBtn, modal, field, pickerField, sectionLabel,
} from '../lib/kit.mjs'
import { ph } from '../lib/icons.mjs'
import {
  artboard as teacherArtboard,
  card as tCard,
  row as tRow,
  btn as tBtn,
  grid as tGrid,
  stat as tStat,
} from './teacher.mjs'
import { parentArtboard, studentArtboard, phoneCard, wideBtn, eyebrow, sectionH, block } from './phone.mjs'

const V = { brand: '#7B45D6', strong: '#5C31A6', soft: '#F2EBFC', bd: '#D5C4F3' }

const ini = (n) => {
  const [last, first] = n.split(', ')
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
}
const initials = (n) =>
  n
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** Whose move it is — the derived fact that turns an inbox into a to-do list. */
const move = (who) =>
  who === 'you'
    ? badge('Your reply', 'warn')
    : who === 'them'
      ? badge('With the family', 'plain')
      : badge('Finished', 'plain')

const waiting = (text, late) => mono(text, { size: 11, color: late ? C.bad : C.subtle })

/* ═══ THE MODEL ═════════════════════════════════════════════════════ */

const RECIPIENTS = [
  ['Mrs P. Nyathi', 'Mathematics · Form 2A', 'Marks, homework and how Tanaka is getting on in Maths', 'Usually replies the same school day', 'UserCircle'],
  ['Mr T. Chirwa', 'Form teacher · Form 2A', 'The school day, absence, behaviour, anything about Tanaka generally', 'Usually replies the same school day', 'UsersThree'],
  ['The school office', 'Registrar and admin', 'Forms, uniforms, transport, records, and anything you are not sure who to ask', 'Weekdays, 07:30 to 16:30', 'BuildingOffice'],
  ['The bursar', 'Fees and payments', 'Invoices, receipts, payment plans, hardship', 'Weekdays, 08:00 to 15:30', 'CurrencyDollar'],
]

export const Addressing = () =>
  adminArtboard({
    title: 'Messaging',
    railItem: 'Notices',
    caption: 'How a conversation is addressed',
    search: null,
    content: page(`
      ${grid(
        '380px minmax(0, 1fr)',
        `${card({
          title: 'What the model already holds',
          note: 'SchoolMessageThread',
          children: [
            ['guardianId', 'The family. Always set.', true],
            ['teacherProfileId', 'The named member of staff. Null means the office.', true],
            ['studentId', 'The child it is about. Null means a general enquiry.', true],
            ['subject', 'What it is about, in the family’s words.', true],
            ['closedAt', 'Whether it is finished, and when.', true],
            ['last sender side', 'Whose move it is.', false],
          ]
            .map(([f, why, stored], i, a) =>
              listRow(
                `<span style="width: 140px; flex-shrink: 0">${mono(f, { size: 11.5, color: C.brandStrong, weight: 700 })}</span>
                 <span style="flex: 1; min-width: 0">${txt(why, { size: 11.5, color: C.mid })}</span>
                 ${badge(stored ? 'Stored' : 'Derived', stored ? 'plain' : 'brand')}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${card({
          title: 'Who a family can write to, and what each of them handles',
          note: 'the list the compose screen has never shown',
          children: RECIPIENTS.map(([who, role, handles, hours, glyph], i, a) =>
            listRow(
              `<span style="width: 34px; height: 34px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 9px; background: ${C.brandSoft}">${ph(glyph, { size: 17, color: C.brandStrong })}</span>
               <span style="flex: 1; min-width: 0">
                 <span style="display: flex; align-items: center; gap: 8px"><span style="font-size: 13px; font-weight: 700; color: ${C.strong}">${who}</span>${badge(role, 'plain')}</span>
                 <span style="display: block; font-size: 11.5px; color: ${C.mid}; line-height: 1.5; margin-top: 2px">${handles}</span>
               </span>
               <span style="width: 210px; flex-shrink: 0">${txt(hours, { size: 11, color: C.subtle })}</span>`,
              { last: i === a.length - 1 },
            ),
          ).join(''),
        })}`,
      )}
      ${grid(
        3,
        `${card({
          title: 'One rule for unread, everywhere',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 10px">
            ${txt('<b>Unread</b> is: the last message is not mine, and I have not opened the conversation since it arrived.', { size: 12, color: C.body })}
            ${txt('Derived on read, never counted into a column. Every badge on every surface &mdash; the bell, the tab, the row pip &mdash; comes from that one function.', { size: 11.5, color: C.mid })}
            ${txt('The rule is already in <code>lib/schools/messages.ts</code>. The three portals each invent their own badge on top of it.', { size: 11.5, color: C.mid })}
          </div>`,
        })}
        ${card({
          title: 'Whose move it is',
          note: 'the same fact, said usefully',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 10px">
            <div style="display: flex; gap: 8px">${move('you')}${move('them')}${move('closed')}</div>
            ${txt('An inbox sorted by unread says what is new. An inbox sorted by <b>whose move it is</b> says what is yours to do &mdash; which is what a teacher with fourteen conversations needs.', { size: 11.5, color: C.mid })}
            ${txt('Same derived value, three labels, no new column.', { size: 11.5, color: C.mid })}
          </div>`,
        })}
        ${card({
          title: 'What a thread is not',
          note: 'lib/schools/messages.ts, verbatim',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 10px">
            <div style="border-left: 2px solid ${C.borderStrong}; padding-left: 11px; font-size: 11.5px; line-height: 1.6; color: ${C.mid}">Not a group chat: a school&rsquo;s messaging has to answer &ldquo;who could read this&rdquo; for a safeguarding officer a year later, and a room anybody can be added to cannot answer it.</div>
            <div style="border-left: 2px solid ${C.borderStrong}; padding-left: 11px; font-size: 11.5px; line-height: 1.6; color: ${C.mid}">Nothing is edited and nothing is deleted. What a parent was told has to still be true when somebody checks.</div>
            ${txt('So: no group threads, no editing, no deleting. Handing a conversation on moves the staff seat and says so in the thread.', { size: 11.5, color: C.body })}
          </div>`,
        })}`,
      )}
    `),
  })

/* ═══ PARENT ════════════════════════════════════════════════════════ */

const parentRow = ([who, role, preview, about, state, when, late]) => `
  <div style="display: flex; gap: 11px; padding: 13px 16px; border-bottom: 1px solid ${C.hair}; background: ${state === 'you' ? '#FBFCFE' : 'transparent'}">
    ${avatar(initials(who), { size: 36 })}
    <span style="flex: 1; min-width: 0">
      <span style="display: flex; align-items: baseline; gap: 8px">
        <span style="flex: 1; min-width: 0; font-size: 13px; font-weight: ${state === 'you' ? 700 : 600}; color: ${C.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(who)}</span>
        ${waiting(when, late)}
      </span>
      <span style="display: block; font-size: 11px; color: ${C.subtle}">${role}</span>
      <span style="display: block; font-size: 12px; color: ${C.mid}; line-height: 1.45; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(preview)}</span>
      <span style="display: flex; align-items: center; gap: 6px; margin-top: 6px">${badge(about, 'brand')}${move(state)}</span>
    </span>
  </div>`

export const ParentInbox = () =>
  parentArtboard({
    title: 'Messages',
    active: 'You',
    body: `
      <div style="padding: 14px 16px 0; display: flex; flex-direction: column; gap: 10px">
        <div style="display: flex; align-items: center; gap: 9px; padding: 10px 12px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}">
          ${ph('MagnifyingGlass', { size: 16, color: C.subtle })}<span style="flex: 1; font-size: 12.5px; color: ${C.subtle}">Search your messages</span>
        </div>
        <div style="display: flex; gap: 7px; overflow-x: auto; padding-bottom: 2px">
          ${[
            ['Everything', 6, true],
            ['Waiting on the school', 2, false],
            ['Your reply', 1, false],
            ['Finished', 3, false],
          ]
            .map(
              ([l, n, on]) =>
                `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 999px; background: ${on ? C.strong : C.surface}; border: 1px solid ${on ? C.strong : C.border}; flex-shrink: 0"><span style="font-size: 12px; font-weight: 600; color: ${on ? '#fff' : C.mid}">${l}</span><span class="mono" style="font-size: 10.5px; color: ${on ? 'rgba(255,255,255,.7)' : C.faint}">${n}</span></span>`,
            )
            .join('')}
        </div>
      </div>
      ${sectionH('Open', '3')}
      ${block(
        [
          ['Mrs P. Nyathi', 'Mathematics · Form 2A', 'Yes — we start on trigonometry on Thursday and they will each need one.', 'About Tanaka', 'them', '2h ago', false],
          ['The bursar', 'Fees and payments', 'You asked about paying Term 2 in two parts. Could you confirm the dates that suit?', 'Term 2 fees', 'you', 'Waiting 2 days', true],
          ['The school office', 'Registrar and admin', 'We have the trip form. Thank you.', 'General', 'them', 'Yesterday', false],
        ]
          .map(parentRow)
          .join(''),
      )}
      ${sectionH('Finished', '3')}
      ${block(
        `<div style="opacity: .62">${[
          ['Mr T. Chirwa', 'Form teacher · Form 2A', 'Noted, thank you for letting us know he was unwell.', 'About Tanaka', 'closed', '11 Aug', false],
          ['The school office', 'Registrar and admin', 'Your new phone number is on the record now.', 'General', 'closed', '2 Aug', false],
        ]
          .map(parentRow)
          .join('')}</div>`,
      )}
      <div style="margin: 16px 16px 0">${wideBtn('Write to somebody', 'solid', C.brand)}</div>
    `,
  })

const recipientRow = (who, role, handles, hours, glyph, on) => `
  <div style="display: flex; gap: 12px; padding: 13px 20px; border-bottom: 1px solid ${C.hair}; background: ${on ? C.brandSoft : 'transparent'}">
    <span style="width: 38px; height: 38px; border-radius: 10px; background: ${on ? C.brand : C.muted}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${ph(glyph, { size: 19, color: on ? '#fff' : C.mid })}</span>
    <span style="flex: 1; min-width: 0">
      <span style="display: block; font-size: 13.5px; font-weight: 700; color: ${C.strong}">${esc(who)}</span>
      <span style="display: block; font-size: 11px; color: ${C.subtle}">${role}</span>
      <span style="display: block; font-size: 11.5px; color: ${C.mid}; line-height: 1.5; margin-top: 4px">${handles}</span>
      <span style="display: flex; align-items: center; gap: 6px; margin-top: 6px">${ph('Clock', { size: 12, color: C.subtle })}<span style="font-size: 11px; color: ${C.subtle}">${hours}</span></span>
    </span>
    ${on ? ph('Check', { size: 19, color: C.brandStrong }) : ''}
  </div>`

export const ParentCompose = () =>
  parentArtboard({
    title: 'Messages',
    active: 'You',
    body: `<div style="opacity: .3; padding: 16px"><div style="height: 96px; border-radius: 12px; background: ${C.sunken}"></div><div style="height: 96px; border-radius: 12px; background: ${C.sunken}; margin-top: 10px"></div></div>`,
    overlay: `<div style="position: absolute; inset: 0; background: rgba(22,24,29,.4); display: flex; align-items: flex-end">
      <div style="width: 100%; max-height: 90%; border-radius: 18px 18px 0 0; background: ${C.surface}; box-shadow: 0 -20px 40px -10px rgba(22,24,29,.3); display: flex; flex-direction: column; overflow: hidden">
        <div style="padding: 10px 0 0; display: flex; justify-content: center"><span style="width: 36px; height: 4px; border-radius: 999px; background: ${C.borderStrong}"></span></div>
        <div style="padding: 14px 20px 12px">
          <div style="font-size: 16px; font-weight: 700; color: ${C.strong}">Who should read this?</div>
          <div style="font-size: 12.5px; color: ${C.mid}; line-height: 1.5; margin-top: 3px">Not sure? Send it to the office &mdash; they will pass it to the right person, and you will see who has it.</div>
        </div>
        <div class="scroll" style="flex: 1; min-height: 0; overflow-y: auto">
          <div style="padding: 0 20px 8px">${sectionLabel('About Tanaka')}</div>
          ${RECIPIENTS.slice(0, 2)
            .map(([who, role, handles, hours, glyph], i) => recipientRow(who, role, handles, hours, glyph, i === 0))
            .join('')}
          <div style="padding: 14px 20px 8px">${sectionLabel('Anything else')}</div>
          ${RECIPIENTS.slice(2)
            .map(([who, role, handles, hours, glyph]) => recipientRow(who, role, handles, hours, glyph, false))
            .join('')}
        </div>
        <div style="padding: 12px 20px 20px; border-top: 1px solid ${C.borderSubtle}; display: flex; flex-direction: column; gap: 8px">
          ${wideBtn('Write to Mrs Nyathi', 'solid', C.brand)}
          ${wideBtn('Cancel', 'ghost')}
        </div>
      </div>
    </div>`,
  })

const bubble = (side, text, when, who) =>
  side === 'you'
    ? `<div style="max-width: 84%; margin-left: auto; padding: 11px 13px; border-radius: 13px 13px 3px 13px; background: ${C.brand}"><div style="font-size: 12.5px; color: #fff; line-height: 1.55">${esc(text)}</div><div style="font-size: 10.5px; color: rgba(255,255,255,.72); margin-top: 5px">${when}</div></div>`
    : `<div style="max-width: 84%"><div style="font-size: 10.5px; font-weight: 600; color: ${C.subtle}; margin-bottom: 3px">${esc(who ?? '')}</div><div style="padding: 11px 13px; border: 1px solid ${C.border}; border-radius: 13px 13px 13px 3px; background: ${C.surface}"><div style="font-size: 12.5px; color: ${C.body}; line-height: 1.55">${esc(text)}</div><div style="font-size: 10.5px; color: ${C.subtle}; margin-top: 5px">${when}</div></div></div>`

export const ParentThread = () =>
  parentArtboard({
    title: 'Mrs P. Nyathi',
    active: 'You',
    body: `
      <div style="padding: 12px 16px 0">
        <div style="display: flex; align-items: center; gap: 11px; padding: 12px 14px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}">
          ${avatar('PN', { size: 38 })}
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 13.5px; font-weight: 700; color: ${C.strong}">Mrs P. Nyathi</div>
            <div style="font-size: 11.5px; color: ${C.subtle}">Mathematics &middot; Form 2A</div>
          </div>
          ${move('them')}
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 9px; padding: 10px 12px; border: 1px solid ${C.border}; border-radius: 11px; background: ${C.canvas}">
          ${ph('UserCircle', { size: 16, color: C.brandStrong })}
          <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12px; font-weight: 600; color: ${C.strong}">About Tanaka &middot; Form 2A</span><span style="display: block; font-size: 11px; color: ${C.subtle}">Calculator for Thursday</span></span>
          ${ph('CaretRight', { size: 14, color: C.faint })}
        </div>
      </div>
      <div style="padding: 16px 16px 0; display: flex; flex-direction: column; gap: 10px">
        ${bubble('you', 'Good evening. Tanaka says he needs a scientific calculator for Thursday — is that right?', '22 Aug, 18:40')}
        ${bubble('them', 'Yes — we start on trigonometry on Thursday and they will each need one. The school shop has them for USD 12.', '22 Aug, 19:02', 'Mrs P. Nyathi')}
        ${bubble('you', 'Thank you — I will make sure he brings one.', '22 Aug, 19:14')}
      </div>
      <div style="padding: 16px 16px 0">
        <div style="min-height: 62px; padding: 11px 12px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}; font-size: 12.5px; color: ${C.subtle}">Write a reply</div>
        <div style="display: flex; align-items: center; gap: 9px; margin-top: 9px">
          <span style="flex: 1; font-size: 11px; color: ${C.subtle}">Mrs Nyathi usually replies the same school day.</span>
          <span style="display: inline-flex; align-items: center; gap: 7px; height: 42px; padding: 0 18px; border-radius: 11px; background: ${C.brand}; color: #fff; font-size: 13.5px; font-weight: 600">${ph('PaperPlaneTilt', { size: 15, color: '#fff' })}Send</span>
        </div>
      </div>
      <div style="padding: 18px 16px 0">${wideBtn('Mark this as finished', 'ghost')}</div>
    `,
  })

export const ParentThreadClosed = () =>
  parentArtboard({
    title: 'Mr T. Chirwa',
    active: 'You',
    body: `
      <div style="padding: 12px 16px 0">
        <div style="display: flex; align-items: center; gap: 11px; padding: 12px 14px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.surface}">
          ${avatar('TC', { size: 38 })}
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 13.5px; font-weight: 700; color: ${C.strong}">Mr T. Chirwa</div>
            <div style="font-size: 11.5px; color: ${C.subtle}">Form teacher &middot; Form 2A</div>
          </div>
          ${move('closed')}
        </div>
      </div>
      <div style="padding: 16px 16px 0; display: flex; flex-direction: column; gap: 10px; opacity: .72">
        ${bubble('you', 'Tanaka has been unwell since Monday, I have kept him at home.', '11 Aug, 07:02')}
        ${bubble('them', 'Thank you for letting us know. I have marked him away — excused for Monday and Tuesday. I hope he is better soon.', '11 Aug, 08:15', 'Mr T. Chirwa')}
      </div>
      <div style="padding: 16px 16px 0">
        <div style="display: flex; gap: 11px; padding: 13px 14px; border: 1px solid ${C.border}; border-radius: 12px; background: ${C.canvas}">
          ${ph('Check', { size: 17, color: C.ok })}
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">This conversation is finished</div>
            <div style="font-size: 11.5px; color: ${C.mid}; line-height: 1.55; margin-top: 2px">Mr Chirwa marked it finished on 11 August. Nothing is lost &mdash; you can still read it, and starting a new one leaves this one where it is.</div>
          </div>
        </div>
        <div style="margin-top: 12px">${wideBtn('Write to Mr Chirwa again', 'solid', C.brand)}</div>
      </div>
    `,
  })

/* ═══ TEACHER ═══════════════════════════════════════════════════════ */

const teacherRow = ([who, child, subject, preview, when, state, late], last) =>
  tRow(
    `${avatar(initials(who), { size: 32 })}
     <span style="flex: 1; min-width: 0">
       <span style="display: flex; align-items: center; gap: 8px">
         <span style="font-size: 13px; font-weight: ${state === 'you' ? 700 : 600}; color: ${C.strong}">${esc(who)}</span>
         ${badge(child, 'brand')}
       </span>
       <span style="display: block; font-size: 12px; font-weight: 600; color: ${C.body}; margin-top: 2px">${esc(subject)}</span>
       <span style="display: block; font-size: 11.5px; color: ${C.subtle}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(preview)}</span>
     </span>
     ${waiting(when, late)}
     ${move(state)}
     ${tBtn('Pass on')}`,
    last,
  )

export const TeacherInbox = () =>
  teacherArtboard({
    caption: 'Term 2 &middot; 4 need a reply',
    title: 'Messages',
    activeRail: 'Messages',
    activeTab: 'Messages',
    bell: 4,
    body: `
      ${tGrid(
        4,
        [
          tStat('Need a reply', '4', 'oldest waiting 3 days', 'warn'),
          tStat('With the family', '7', 'you answered last'),
          tStat('Finished this term', '19', ''),
          tStat('Median reply time', '4h', 'inside the school day', 'ok'),
        ].join(''),
      )}
      <div style="display: flex; align-items: center; gap: 10px">
        <span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px; background: ${C.muted}; border: 1px solid ${C.border}">
          ${[
            ['Need a reply', 4, true],
            ['With the family', 7, false],
            ['Everything', 30, false],
            ['Finished', 19, false],
          ]
            .map(
              ([l, n, on]) =>
                `<span style="display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 13px; border-radius: 6px; background: ${on ? C.surface : 'transparent'}; box-shadow: ${on ? '0 1px 2px rgba(42,38,34,.06)' : 'none'}"><span style="font-size: 12.5px; font-weight: ${on ? 700 : 500}; color: ${on ? C.strong : C.mid}">${l}</span><span class="mono" style="font-size: 10.5px; color: ${on ? C.mid : C.faint}">${n}</span></span>`,
            )
            .join('')}
        </span>
        <div style="flex: 1"></div>
        <span style="display: flex; align-items: center; gap: 7px; height: 34px; width: 240px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}">${ph('MagnifyingGlass', { size: 15, color: C.subtle })}<span style="flex: 1; font-size: 12.5px; color: ${C.subtle}">Search a family or a pupil</span></span>
        <span style="display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.surface}"><span style="font-size: 12.5px; color: ${C.body}">Waiting longest</span>${ph('CaretDown', { size: 13, color: C.faint })}</span>
      </div>
      ${tCard({
        title: 'Need a reply',
        sub: 'sorted by how long the family has been waiting',
        children: [
          ['Tsitsi Moyo', 'Farai Moyo', 'Farai has been unwell since Monday', 'Should I send a note from the clinic, or is a message enough?', 'Waiting 3 days', 'you', true],
          ['Regis Dube', 'Tapiwa Dube', 'Extra help before the mock', 'Is there anything on before the mock? He is worried about paper 2.', 'Waiting 2 days', 'you', true],
          ['Loveness Mafuta', 'Simba Mafuta', 'Term 2 fees', 'We are struggling this term. Is there anyone I can talk to about it?', 'Waiting 1 day', 'you', false],
          ['Esther Chikwanda', 'Rutendo Chikwanda', 'Trip permission form', 'I posted it back with Rutendo on Friday — did it reach you?', 'Waiting 4h', 'you', false],
        ]
          .map((r, i, a) => teacherRow(r, i === a.length - 1))
          .join(''),
      })}
      ${tCard({
        title: 'With the family',
        sub: 'you answered last · nothing to do unless they write again',
        children: `<div style="opacity: .7">${[
          ['Grace Mutasa', 'Tanaka Mutasa', 'Calculator for Thursday', 'Thank you — I will make sure he brings one.', '2h ago', 'them', false],
          ['Memory Nyathi', 'Kudzai Nyathi', 'Mock results', 'Thank you for going through it with him.', 'Yesterday', 'them', false],
        ]
          .map((r, i, a) => teacherRow(r, i === a.length - 1))
          .join('')}</div>`,
      })}
    `,
  })

const tBubble = (side, who, text, when) => {
  if (side === 'sys')
    return `<div style="display: flex; align-items: center; gap: 9px; padding: 8px 12px; border-radius: 9px; background: ${C.canvas}; border: 1px dashed ${C.borderStrong}">${ph('ArrowRight', { size: 14, color: C.subtle })}<span style="flex: 1; font-size: 11.5px; color: ${C.mid}">${esc(text)}</span>${mono(when, { size: 10.5 })}</div>`
  return side === 'you'
    ? `<div style="max-width: 78%; margin-left: auto; padding: 11px 13px; border-radius: 13px 13px 3px 13px; background: ${V.soft}"><div style="font-size: 12.5px; color: ${V.strong}; line-height: 1.55">${esc(text)}</div><div style="font-size: 10.5px; color: ${V.strong}; opacity: .7; margin-top: 5px">${when}</div></div>`
    : `<div style="max-width: 78%"><div style="font-size: 11px; font-weight: 600; color: ${C.subtle}; margin-bottom: 3px">${esc(who)}</div><div style="padding: 11px 13px; border: 1px solid ${C.border}; border-radius: 13px 13px 13px 3px; background: ${C.surface}"><div style="font-size: 12.5px; color: ${C.body}; line-height: 1.55">${esc(text)}</div><div style="font-size: 10.5px; color: ${C.subtle}; margin-top: 5px">${when}</div></div></div>`
}

export const TeacherThread = () =>
  teacherArtboard({
    caption: 'Tsitsi Moyo &middot; about Farai Moyo &middot; Form 2B',
    title: 'Farai has been unwell since Monday',
    activeRail: 'Messages',
    activeTab: 'Messages',
    bell: 4,
    body: `
      <div style="display: flex; gap: 16px; align-items: flex-start">
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px">
          ${tCard({
            title: 'Tsitsi Moyo',
            sub: 'Mother · about Farai Moyo, Form 2B · started 22 August',
            action: `<span style="display: flex; align-items: center; gap: 8px">${move('you')}${tBtn('Pass on')}${tBtn('Mark finished')}</span>`,
            pad: true,
            children: `<div style="display: flex; flex-direction: column; gap: 12px">
              ${tBubble('them', 'Tsitsi Moyo', 'Good morning. Farai has been unwell since Monday, I have kept him at home. Should I send a note from the clinic, or is a message enough?', '22 Aug, 07:02')}
              ${tBubble('sys', '', 'The school office passed this to you — “form teacher for 2B”.', '22 Aug, 08:40')}
            </div>`,
          })}
          ${tCard({
            pad: true,
            children: `<div style="display: flex; flex-direction: column; gap: 10px">
              <div style="min-height: 88px; padding: 12px 13px; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.surface}; font-size: 12.5px; color: ${C.subtle}">Write a reply</div>
              <div style="display: flex; align-items: center; gap: 10px">
                <span style="display: flex; gap: 7px">${tBtn('Mark him excused')}${tBtn('Insert his attendance')}</span>
                <div style="flex: 1"></div>
                ${tBtn('Send', 'solid')}
              </div>
              <div style="font-size: 11px; color: ${C.subtle}">Nothing here is edited or deleted afterwards &mdash; a correction is another message.</div>
            </div>`,
          })}
        </div>
        <div style="width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px">
          ${tCard({
            title: 'Farai Moyo',
            sub: 'CHS-1211 · Form 2B',
            children: [
              ['At school', '68%', 'bad'],
              ['Away this term', '9 days', 'bad'],
              ['Term mark', '38%', 'bad'],
              ['Fees owed', 'USD 1,240', 'bad'],
              ['Guardians', 'Tsitsi Moyo', 'plain'],
            ]
              .map(([k, v, tone], i, a) =>
                tRow(
                  `<span style="flex: 1; font-size: 12px; color: ${C.mid}">${k}</span><span class="mono" style="font-size: 12.5px; font-weight: 700; color: ${tone === 'bad' ? C.bad : C.strong}">${v}</span>`,
                  i === a.length - 1,
                ),
              )
              .join(''),
          })}
          ${tCard({
            title: 'While you are here',
            children: [
              ['3 days away, unexplained', 'Mark excused'],
              ['Fees 68 days overdue', 'Tell the bursar'],
            ]
              .map(([what, action], i, a) =>
                tRow(`<span style="flex: 1; min-width: 0; font-size: 12px; color: ${C.body}; line-height: 1.4">${what}</span>${tBtn(action)}`, i === a.length - 1),
              )
              .join(''),
          })}
        </div>
      </div>
    `,
  })

export const TeacherHandoff = () =>
  teacherArtboard({
    caption: 'Loveness Mafuta &middot; about Simba Mafuta &middot; Form 4A',
    title: 'Term 2 fees',
    activeRail: 'Messages',
    activeTab: 'Messages',
    bell: 4,
    body: `<div style="opacity: .3">${tCard({ title: 'Loveness Mafuta', sub: 'Mother · about Simba Mafuta', pad: true, children: '<div style="height: 320px"></div>' })}</div>`,
    overlay: `<div style="position: absolute; inset: 0; z-index: 60; background: rgba(22,24,29,.34); display: flex; align-items: center; justify-content: center">
      <div style="width: 500px; border-radius: 12px; background: ${C.surface}; box-shadow: 0 24px 64px -12px rgba(42,38,34,.28); overflow: hidden">
        <div style="padding: 16px 18px 12px">
          <div style="font-size: 14.5px; font-weight: 700; color: ${C.strong}">Pass this to somebody else</div>
          <div style="font-size: 12px; color: ${C.mid}; line-height: 1.55; margin-top: 3px">This is a fees question. Passing it moves the conversation to them and tells Loveness Mafuta who has it now &mdash; she does not have to write again.</div>
        </div>
        <div style="padding: 0 18px 14px; display: flex; flex-direction: column; gap: 10px">
          ${[
            ['The bursar', 'Fees and payments', 'Invoices, receipts, payment plans, hardship', true],
            ['The school office', 'Registrar and admin', 'Forms, records, and anything unclear', false],
            ['Mrs P. Nyathi', 'Head of Mathematics', 'Marks, moderation, department matters', false],
          ]
            .map(
              ([who, role, handles, on]) =>
                `<div style="display: flex; gap: 11px; padding: 11px 12px; border: 1px solid ${on ? C.brand : C.border}; border-radius: 10px; background: ${on ? C.brandSoft : C.surface}">
                  <span style="width: 15px; height: 15px; border-radius: 999px; border: 1px solid ${on ? C.brand : C.borderStrong}; background: ${on ? C.brand : C.surface}; flex-shrink: 0; margin-top: 2px; display: flex; align-items: center; justify-content: center">${on ? '<span style="width:5px;height:5px;border-radius:999px;background:#fff"></span>' : ''}</span>
                  <span style="flex: 1; min-width: 0"><span style="display: flex; align-items: center; gap: 7px"><span style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">${who}</span>${badge(role, 'plain')}</span><span style="display: block; font-size: 11.5px; color: ${C.mid}; margin-top: 2px">${handles}</span></span>
                </div>`,
            )
            .join('')}
          ${field('A note for them', 'Family is in difficulty this term and is asking about a payment plan. Nothing owed to me.', { hint: 'The family sees that it was passed on, not what you wrote here.' })}
        </div>
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid ${C.borderSubtle}; background: ${C.canvas}">
          ${ghostBtn('Cancel')}${solidBtn('Pass it to the bursar')}
        </div>
      </div>
    </div>`,
  })

/* ═══ OFFICE ════════════════════════════════════════════════════════ */

export const OfficeInbox = () =>
  adminArtboard({
    title: 'Messages',
    railItem: 'Notices',
    caption: 'Term 2 &middot; 6 unassigned',
    search: 'Search a family, pupil or subject',
    action: { label: 'Write to a family', icon: I.send },
    chips: [
      { label: 'Unassigned', value: '6', tone: 'bad' },
      { label: 'Need a reply', value: '18', tone: 'warn' },
      { label: 'Open', value: '54' },
      { label: 'Median reply', value: '6h', tone: 'ok' },
    ],
    content: page(`
      ${alert({
        title: '6 conversations have nobody looking at them',
        body: 'A family wrote to the school office and no member of staff has been given it. The oldest has been waiting 4 days.',
        action: `<div style="align-self: center">${solidBtn('Assign them')}</div>`,
      })}
      ${rowFlex(`${segments([{ label: 'Unassigned', count: 6 }, { label: 'Need a reply', count: 18 }, { label: 'Open', count: 54 }, { label: 'Finished', count: 212 }], 'Unassigned')}<div style="flex: 1"></div>${filterSelect('Year group', 'Every year')}${filterSelect('With', 'Anybody')}${searchField('Search a family, pupil or subject', { w: 240 })}`, { align: 'flex-end' })}
      ${card({
        title: 'Unassigned',
        note: 'written to the office · nobody has been given them',
        children: table({
          cols: [
            { label: 'Family', w: 200 },
            { label: 'About', w: 165 },
            { label: 'Subject' },
            { label: 'Waiting', w: 100 },
            { label: 'Suggested', w: 160 },
            { label: '', w: 180, align: 'right' },
          ],
          rows: [
            ['Mafuta, Loveness', 'GRD-0602', 'Simba · Form 4A', 'Term 2 fees — asking about a payment plan', '4 days', 'The bursar', true],
            ['Ncube, Loveness', 'GRD-0611', 'Tariro · Form 3A', 'Bus route change from September', '3 days', 'The office', true],
            ['Sibanda, Joseph', 'GRD-0620', 'Ruvimbo · Form 1B', 'Uniform — where to buy the winter jersey', '2 days', 'The office', false],
            ['Gwatidzo, Netsai', 'GRD-0633', 'General', 'Applying for a place for a younger sibling', '1 day', 'Admissions', false],
            ['Marange, Shupikai', 'GRD-0641', 'Tadiwa · Form 1A', 'Boarding — can he come home on Sundays?', '6h', 'The warden', false],
          ].map(([name, ref, about, subject, wait, suggested, late]) => [
            `<span style="display:flex;align-items:center;gap:7px;min-width:0">${avatar(ini(name))}<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span>${mono(ref, { size: 10.5 })}</span></span>`,
            txt(about, { size: 12, color: about === 'General' ? C.subtle : C.mid }),
            txt(esc(subject), { size: 12, color: C.body, ellipsis: true }),
            mono(wait, { size: 11.5, color: late ? C.bad : C.warn, weight: 700 }),
            badge(suggested, 'brand'),
            `<span style="display:flex;gap:6px;justify-content:flex-end">${tinyBtn('Read')}${solidBtn('Assign')}</span>`,
          ]),
        }),
      })}
      ${grid(
        2,
        `${card({
          title: 'Slowest to be answered',
          note: 'open, sorted by how long the family has waited',
          children: [
            ['Moyo, Tsitsi', 'Mr T. Chirwa', '3 days', true],
            ['Dube, Regis', 'Mrs P. Nyathi', '2 days', true],
            ['Chikwanda, Esther', 'The office', '1 day', false],
          ]
            .map(([who, withWhom, wait, late], i, a) =>
              listRow(
                `<span style="flex: 1; min-width: 0">${txt(who, { size: 12.5, weight: 600, color: C.strong })}</span>${txt(`with ${withWhom}`, { size: 11.5, color: C.mid })}${mono(wait, { size: 11.5, color: late ? C.bad : C.warn, weight: 700 })}${tinyBtn('Chase')}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${card({
          title: 'Where the school’s messages go',
          note: 'this term',
          children: [
            ['Form teachers', '128', C.brand, 128],
            ['Subject teachers', '94', C.brand, 94],
            ['The office', '61', C.mid, 61],
            ['The bursar', '38', C.warn, 38],
            ['The warden', '11', C.mid, 11],
          ]
            .map(([label, n, hue, v], i, a) =>
              listRow(
                `<span style="width: 130px; flex-shrink: 0; font-size: 12px; color: ${C.body}">${label}</span>
                 <span style="flex: 1; min-width: 0; height: 8px; border-radius: 999px; background: ${C.sunken}; overflow: hidden"><span style="display: block; width: ${Math.round((v / 130) * 100)}%; height: 100%; background: ${hue}"></span></span>
                 ${mono(n, { size: 12, color: C.body, weight: 700, width: 44 })}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}`,
      )}
    `),
    overlay: modal({
      w: 470,
      title: 'Give this to somebody',
      lede: 'Loveness Mafuta, about Simba in Form 4A &mdash; &ldquo;Term 2 fees, asking about a payment plan&rdquo;. She sees who has it as soon as you assign it.',
      body: `${pickerField('Give it to', 'The bursar &mdash; Tendai Chuma', { required: true, hint: 'Suggested from the subject and the child’s year group.' })}
             ${field('A note for them', 'Family in difficulty. Third message this term about fees.')}`,
      footer: `${ghostBtn('Cancel')}${solidBtn('Assign to the bursar')}`,
    }),
  })

/* ═══ PUPIL AND BROADCAST ═══════════════════════════════════════════ */

export const StudentFromSchool = () =>
  studentArtboard({
    title: 'From school',
    active: 'Home',
    bell: 0,
    body: `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px">
        <span style="flex: 1; font-size: 12px; color: ${C.mid}">8 things &middot; 3 new</span>
        <span style="font-size: 12px; font-weight: 500; color: ${C.brandStrong}">Mark all read</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px">
        ${[
          ['Sports day moved to Friday', 'The inter-house athletics has moved from Wednesday to Friday 28 August.', 'Important', C.bad, C.badBg, 'Warning', '22 Aug, 14:02', true],
          ['Your Term 2 marks are out', 'Six subjects have been published. Tap to read them.', 'News', C.brand, C.brandSoft, 'Info', '22 Aug, 09:15', true],
          ['Homework set — Mathematics', 'Simultaneous equations, exercise 4. Due 21 August.', 'News', C.brand, C.brandSoft, 'Info', '17 Aug, 16:40', true],
          ['Library books due before half term', 'Anything out on 1 September is counted late and carries a fine.', 'Worth reading', C.warn, C.warnBg, 'Warning', '11 Aug, 08:00', false],
        ]
          .map(([title, summary, kind, fg, bg, glyph, when, unread]) =>
            phoneCard(
              `<div style="display: flex; gap: 11px">
                <span style="width: 36px; height: 36px; border-radius: 9px; background: ${bg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">${ph(glyph, { size: 17, color: fg })}</span>
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
      ${eyebrow('Need to ask something?')}
      ${phoneCard(
        `<div style="display: flex; gap: 11px">
          ${ph('ChalkboardTeacher', { size: 20, color: C.brandStrong })}
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 13px; font-weight: 700; color: ${C.strong}">Ask Mr Chirwa, your form teacher</div>
            <div style="font-size: 11.5px; color: ${C.mid}; line-height: 1.55; margin-top: 3px">This app shows you what the school has sent. Messages between the school and your family go to your parents&rsquo; app, so anything you need changed is a word with your form teacher or a message from home.</div>
          </div>
        </div>`,
      )}
    `,
  })

export const NoticeOrMessage = () =>
  adminArtboard({
    title: 'School Notices',
    railItem: 'Notices',
    caption: 'Notices and messages',
    search: null,
    content: page(`
      ${grid(
        2,
        `${card({
          title: 'A notice',
          note: 'one to many, no reply',
          children: `<div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 11px">
            ${[
              'Goes to an audience &mdash; parents, pupils, teachers, everyone &mdash; optionally narrowed to a year group.',
              'Appears in the parent&rsquo;s <b>News</b> tab and the pupil&rsquo;s <b>From school</b> feed.',
              'Cannot be recalled. There is no draft and no schedule.',
              'Nobody can reply to it.',
            ]
              .map(
                (t) =>
                  `<div style="display: flex; gap: 8px">${ph('Info', { size: 14, color: C.brandStrong })}<span style="flex: 1; font-size: 12px; color: ${C.mid}; line-height: 1.55">${t}</span></div>`,
              )
              .join('')}
            <div style="padding: 11px 12px; border-radius: 9px; background: ${C.canvas}; border: 1px solid ${C.border}">
              ${txt('<b>Right for:</b> sports day moved, fees due, term dates, a closure.', { size: 12, color: C.body })}
            </div>
          </div>`,
        })}
        ${card({
          title: 'A message',
          note: 'one to one, about one child',
          children: `<div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 11px">
            ${[
              'One guardian, one member of staff or the office, and the child it concerns.',
              'Lives in the parent&rsquo;s <b>Messages</b>, the staff inbox, and the office inbox.',
              'Never edited, never deleted &mdash; a correction is another message.',
              'Always says whose move it is, and can be passed to somebody else.',
            ]
              .map(
                (t) =>
                  `<div style="display: flex; gap: 8px">${ph('ChatCircle', { size: 14, color: C.brandStrong })}<span style="flex: 1; font-size: 12px; color: ${C.mid}; line-height: 1.55">${t}</span></div>`,
              )
              .join('')}
            <div style="padding: 11px 12px; border-radius: 9px; background: ${C.canvas}; border: 1px solid ${C.border}">
              ${txt('<b>Right for:</b> this child was away, this family cannot pay, this mark looks wrong.', { size: 12, color: C.body })}
            </div>
          </div>`,
        })}`,
      )}
      ${card({
        title: 'Where a notice should become a conversation',
        note: 'the join the two systems do not have',
        children: [
          ['Fee reminder — 31 families in arrears', 'Sent as one notice to everyone, including the 811 families who owe nothing.', 'Send it to the 31, and open a thread with each so a reply lands somewhere.'],
          ['Parents’ evening released', 'A parent who cannot make any slot has nowhere to say so.', 'Add “Reply to the office” to the notice; the reply starts a thread.'],
          ['A meeting released by a teacher', '“Nobody is told automatically — ring them.”', 'Releasing a slot writes a message to that family, carrying the reason.'],
        ]
          .map(([what, problem, fix], i, a) =>
            listRow(
              `<span style="width: 300px; flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: ${C.strong}; line-height: 1.4">${esc(what)}</span>
               <span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${C.mid}; line-height: 1.5">${esc(problem)}</span>
               <span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${C.brandStrong}; line-height: 1.5">${esc(fix)}</span>`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
    `),
  })
