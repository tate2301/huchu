/**
 * States page — the canonical loading / empty / error / denied / not-found /
 * offline / saving treatments, plus the three shared entry screens.
 *
 * Campus has no error.tsx, not-found.tsx or loading.tsx anywhere (repo-wide
 * there are three, all in the platform-admin portal), and every list swaps a
 * sentence into its empty state instead of showing a skeleton. So most of this
 * page is a proposal; each artboard says which half it is.
 */
import {
  C, I, icon, esc, adminArtboard, bareArtboard, page, grid, stack, rowFlex, card, table,
  listRow, badge, avatar, mono, txt, alert, emptyState, skel, modal, field, pickerField,
  ghostBtn, solidBtn, filterSelect, searchField, segments, proposalTag,
} from '../lib/kit.mjs'

/* A caption strip that says what an artboard is showing and why. */
const note = () => ''

const STUDENT_COLS = [
  { label: 'Student' },
  { label: 'Class', w: 150 },
  { label: 'Status', w: 110 },
  { label: 'Boarding', w: 110 },
  { label: 'Guardians', w: 130 },
]

/* ── 1. loading ─────────────────────────────────────────────────────── */
export const StateLoading = () =>
  adminArtboard({
    title: 'Form 2',
    railItem: 'All students',
    caption: 'Term 2 &middot; 118 pupils',
    search: 'Search this year group',
    chips: [{ label: 'Loading' }],
    bandActions: [ghostBtn('Export', I.download)],
    content: page(`
      ${note('proposed', 'Today every campus list swaps its empty-state string &mdash; <b>&ldquo;Loading students&hellip;&rdquo;</b> &mdash; into the middle of an empty table, so the page reflows twice and the column widths jump. A skeleton that matches the row it is about to become holds the layout still. <code>components/ui/skeleton.tsx</code> already ships <code>SkeletonCard</code>; nothing in campus calls it.')}
      ${rowFlex(
        `${filterSelect('Class', 'Every class')}${filterSelect('Status', 'Any status')}${filterSelect('Boarding', 'Boarders and day')}<div style="flex: 1"></div>${searchField('Search this year group', { w: 240 })}`,
        { align: 'flex-end' },
      )}
      ${card({
        title: 'Form 2',
        children:
          table({ cols: STUDENT_COLS, rows: [] }) +
          [58, 74, 66, 80, 62, 71, 55, 77, 68]
            .map((wpc, i, a) =>
              listRow(
                `<span style="display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0">
                 <span style="width: 24px; height: 24px; border-radius: 999px; background: ${C.sunken}; flex-shrink: 0"></span>
                 <span style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0">${skel(`${wpc}%`, 9)}${skel('34%', 7)}</span>
               </span>
               <span style="width: 150px; flex-shrink: 0">${skel('70%', 9)}</span>
               <span style="width: 110px; flex-shrink: 0">${skel('58px', 15)}</span>
               <span style="width: 110px; flex-shrink: 0">${skel('46px', 15)}</span>
               <span style="width: 130px; flex-shrink: 0">${skel('40%', 9)}</span>`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
      })}
      ${note('today', 'The rules: a skeleton mirrors the real row&rsquo;s height and column widths, never a spinner; no shimmer sweep, which draws the eye to the wait rather than the work; and the band keeps its shape, showing <b>Loading</b> where a count will land, so nothing moves when the data arrives.')}
    `),
  })

/* ── 2. empty ───────────────────────────────────────────────────────── */
export const StateEmpty = () =>
  adminArtboard({
    title: 'Students',
    railItem: 'All students',
    caption: 'Term 2 &middot; Chishawasha High',
    search: 'Find a year group',
    content: page(`
      ${note('today', 'The copy is <code>components/schools/common/grade-picker.tsx</code> verbatim. What is proposed is the <b>shape</b>: campus renders this as an <code>Alert</code>, which reads as a fault. An empty school is not a failure &mdash; it is a school on its first day.')}
      ${grid(
        2,
        `
        ${card({
          title: 'As built &mdash; an Alert',
          children: `<div style="padding: 13px">${alert({ tone: 'brand', title: 'No classes yet', body: 'Everything here is organised by year group. Set the class ladder up under Academics first.' })}</div>`,
        })}
        ${card({
          title: 'Proposed &mdash; an empty state',
          actions: [proposalTag()],
          children: emptyState({
            ic: I.grid,
            h: 230,
            title: 'No classes yet',
            body: 'Everything here is organised by year group. Set the class ladder up under Academics first.',
            action: solidBtn('Set up the class ladder', I.plus),
          }),
        })}
      `,
      )}
      ${grid(
        3,
        `
        ${card({ title: 'Nothing yet', children: emptyState({ ic: I.folder, h: 205, title: 'The school has not sent a notice yet', body: 'Anything you send appears in parents&rsquo; and pupils&rsquo; portals straight away.', action: solidBtn('Send a notice', I.send) }) })}
        ${card({ title: 'Nothing matched', children: emptyState({ ic: I.search, h: 205, title: 'No students found', body: 'No pupil in Form 2 matches <b>chikwanda</b> with status <b>Suspended</b>.', action: ghostBtn('Clear filters', I.x) }) })}
        ${card({ title: 'Nothing left to do', children: emptyState({ ic: I.check, h: 205, title: 'Nothing is late', body: 'Every book that is out is inside its return date.', action: ghostBtn('Show everything out') }) })}
      `,
      )}
      ${note('proposed', 'Three empties, three different sentences. <b>Nothing yet</b> offers the verb that fills it. <b>Nothing matched</b> repeats the filter that emptied it and offers to clear it. <b>Nothing left to do</b> is good news and says so &mdash; it never offers a create button, because there is nothing to create.')}
    `),
  })

/* ── 3. error ───────────────────────────────────────────────────────── */
export const StateError = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Ledger and structures',
    caption: 'Term 2',
    search: 'Search fee invoices',
    chips: [{ label: 'Could not load', tone: 'bad' }],
    content: page(`
      ${note('today', 'One destructive <code>Alert</code> covers all seven of the ledger&rsquo;s queries &mdash; <b>&ldquo;Unable to load schools fees data&rdquo;</b> plus whatever <code>getApiErrorMessage</code> returned. There is no retry: the only way out is a browser reload, which loses the segment you were on.')}
      ${alert({
        title: 'Unable to load schools fees data',
        body: 'Request failed with status code 500',
        action: `<div style="display: flex; gap: 7px; align-self: center">${ghostBtn('Try again', I.refresh)}</div>`,
      })}
      ${grid(
        2,
        `
        ${card({
          title: 'Proposed &mdash; the failure is scoped to what failed',
          actions: [proposalTag()],
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
            ${segments([{ label: 'Invoices', count: 412 }, { label: 'Receipts', count: 388 }, { label: 'Credits', count: 9 }, { label: 'Refunds', count: '!' }, { label: 'Waivers', count: 24 }], 'Refunds')}
            ${alert({ tone: 'bad', title: 'Refunds did not load', body: 'The other four views loaded. Only the refund list is missing.', action: `<div style="align-self: center">${ghostBtn('Try again', I.refresh)}</div>` })}
            ${txt('A failed segment keeps its place in the strip and carries the fault; the ones that loaded stay usable. A page-wide alert throws away four good answers to report one bad one.', { size: 11.5, color: C.mid })}
          </div>`,
        })}
        ${card({
          title: 'Proposed &mdash; an unrecoverable page',
          note: 'error.tsx, which campus does not have',
          actions: [proposalTag()],
          children: emptyState({
            ic: I.alert,
            h: 258,
            title: 'This page could not be opened',
            body: 'Something went wrong at our end, not yours. Nothing you had entered was saved.<br><span style="color:#8A91A0">Reference <b class="mono">e4b9-2201</b> &mdash; quote it if you report this.</span>',
            action: `<div style="display: flex; gap: 8px">${solidBtn('Try again', I.refresh)}${ghostBtn('Back to School Overview')}</div>`,
          }),
        })}
      `,
      )}
      ${note('proposed', 'Three rules. An error names <b>what</b> failed, not the layer it failed in. It always carries a way forward &mdash; a retry, or a route out. And it never blames the reader: &ldquo;at our end, not yours&rdquo; is the whole apology, and there is no second sentence of it.')}
    `),
  })

/* ── 4. permission denied ───────────────────────────────────────────── */
export const StateDenied = () =>
  adminArtboard({
    title: 'Results Moderation',
    railItem: 'Moderation',
    caption: 'Term 2 &middot; signed in as Bursar',
    search: 'Search moderation queue',
    user: { name: 'Tendai Chuma', role: 'Bursar' },
    chips: [{ label: 'Read only', tone: 'warn' }],
    content: page(`
      ${note('today', 'Campus does no role gating in the UI at all: <code>lib/schools/permissions.ts</code> is enforced in the API only, so a bursar sees every button a head sees and learns the answer as a red alert after clicking. <code>getPersonaPermissions(&quot;BURSAR&quot;)</code> grants <code>schools.results</code> nothing &mdash; not even <code>view</code>.')}
      ${alert({ title: 'You do not have permission to moderate results', body: 'schoolPermissionDenial(session, "schools.results", "moderate") &mdash; 403' })}
      ${grid(
        'minmax(0, 1.15fr) minmax(0, 1fr)',
        `
        ${card({
          title: 'Proposed &mdash; the control is disabled, and says why',
          actions: [proposalTag()],
          children: `
            ${table({
              cols: [{ label: 'Sheet' }, { label: 'Status', w: 120 }, { label: 'Lines', w: 70, align: 'right' }, { label: '', w: 200, align: 'right' }],
              rows: [
                [
                  `<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">Mathematics &mdash; end of term</span>${mono('Term 2 / Form 2 / 2A', { size: 10.5 })}</span>`,
                  badge('Submitted', 'warn'),
                  mono('32', { size: 11.5, color: C.body }),
                  `<span style="display:flex;gap:6px;justify-content:flex-end;opacity:.42">${ghostBtn('Send back')}${solidBtn('Approve')}</span>`,
                ],
                [
                  `<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">English Language &mdash; end of term</span>${mono('Term 2 / Form 2 / 2B', { size: 10.5 })}</span>`,
                  badge('Submitted', 'warn'),
                  mono('31', { size: 11.5, color: C.body }),
                  `<span style="display:flex;gap:6px;justify-content:flex-end;opacity:.42">${ghostBtn('Send back')}${solidBtn('Approve')}</span>`,
                ],
              ],
            })}
            <div style="padding: 11px 13px; border-top: 1px solid ${C.borderSubtle}">
              ${alert({ tone: 'warn', title: 'Only a head of department can approve a sheet', body: 'You can read the queue. Approving and sending back belong to the HOD for the subject &mdash; ask <b>Mrs Nyathi</b>, or the head.' })}
            </div>`,
        })}
        ${card({
          title: 'Proposed &mdash; a route the persona cannot enter at all',
          actions: [proposalTag()],
          children: emptyState({
            ic: I.lock,
            h: 268,
            title: 'Moderation is not part of your work here',
            body: 'Your account is set up as a <b>Bursar</b>. Fees, receipts and school finance are yours; results moderation belongs to heads of department.',
            action: `<div style="display: flex; gap: 8px">${solidBtn('Go to Fees by year group', I.money)}${ghostBtn('Ask for access', I.mail)}</div>`,
          }),
        })}
      `,
      )}
      ${note('proposed', 'A control the reader may never use is <b>disabled and explained where it sits</b>, not hidden &mdash; hiding it makes the screen different for different people and makes &ldquo;where has the approve button gone?&rdquo; unanswerable. A whole route they may not enter is a door, not a dead end: it names their actual job and points at it.')}
    `),
  })

/* ── 5. not found ───────────────────────────────────────────────────── */
export const StateNotFound = () =>
  adminArtboard({
    title: 'Student record',
    railItem: 'All students',
    caption: 'Not found',
    back: true,
    content: page(`
      ${note('today', 'Ten campus routes take an id &mdash; student, teacher, subject, class, guardian, hostel, three class-scoped lists and the portal invite &mdash; and every one calls <code>notFound()</code> with <b>no <code>not-found.tsx</code> anywhere in the tree</b>. What a registrar sees is Next&rsquo;s default 404: black Helvetica on white, no rail, no way back.')}
      ${grid(
        2,
        `
        ${card({
          title: 'Proposed &mdash; a record that is not there',
          actions: [proposalTag()],
          children: emptyState({
            ic: I.user,
            h: 272,
            title: 'That pupil is not on our roll',
            body: 'There is no student with reference <b class="mono">CHS-2291</b> at Chishawasha High. They may have been withdrawn, or the link may be from another school.',
            action: `<div style="display: flex; gap: 8px">${solidBtn('Search all students', I.search)}${ghostBtn('Back to Form 2')}</div>`,
          }),
        })}
        ${card({
          title: 'Proposed &mdash; a route that does not exist',
          actions: [proposalTag()],
          children: emptyState({
            ic: I.search,
            h: 272,
            title: 'There is no page here',
            body: 'The address <b class="mono">/schools/finance/invoices</b> moved to the fee ledger.',
            action: `<div style="display: flex; gap: 8px">${solidBtn('Open the fee ledger', I.money)}${ghostBtn('School Overview')}</div>`,
          }),
        })}
      `,
      )}
      ${card({
        title: 'The ten routes that need this',
        note: 'every one calls notFound() today with nothing to catch it',
        children: [
          ['/schools/students/[id]', 'Pupil withdrawn, or a link from another school'],
          ['/schools/teachers/[id]', 'Teacher left the school'],
          ['/schools/guardians/[id]', 'Guardian record merged into another'],
          ['/schools/subjects/[id]', 'Subject retired from the ladder'],
          ['/schools/classes/[id]', 'Class dissolved at roll-up'],
          ['/schools/boarding/[id]', 'Hostel closed'],
          ['/schools/students/class/[classId]', 'Year group belongs to another tenant'],
          ['/schools/results/class/[classId]', 'Year group belongs to another tenant'],
          ['/schools/finance/class/[classId]', 'Year group belongs to another tenant'],
          ['/c/[token]', 'Invite already claimed, or expired'],
        ]
          .map(([route, why], i, a) =>
            listRow(
              `${mono(route, { size: 11.5, color: C.brandStrong, width: 300 })}${txt(why, { size: 12, color: C.mid, flex: 1 })}`,
              { last: i === a.length - 1 },
            ),
          )
          .join(''),
      })}
    `),
  })

/* ── 6. offline ─────────────────────────────────────────────────────── */
export const StateOffline = () =>
  adminArtboard({
    title: 'Attendance',
    railItem: 'Attendance',
    caption: 'Term 2 &middot; Tue 24 Aug',
    search: 'Search registers',
    chips: [
      { label: 'Offline', tone: 'warn' },
      { label: 'Queued', value: '3', tone: 'warn' },
    ],
    bandActions: [ghostBtn('Retry now', I.refresh)],
    content: page(`
      ${note('today', 'Campus has offline plumbing &mdash; <code>useOfflineConnectivity</code>, the teacher portal&rsquo;s Online/Offline chip &mdash; but <code>app/offline</code> is <b>a bare 40px spinner with no copy at all</b>, and nothing anywhere tells a person their marks are sitting in a queue.')}
      ${alert({
        tone: 'warn',
        title: 'You are working offline',
        body: 'Three registers are marked but not sent. They are safe on this device and will go up on their own when the school&rsquo;s connection is back &mdash; you do not need to stay on this page.',
        action: `<div style="align-self: center">${ghostBtn('Retry now', I.refresh)}</div>`,
      })}
      ${grid(
        'minmax(0, 1fr) 340px',
        `
        ${card({
          title: 'Registers',
          note: '60 today',
          children: table({
            cols: [{ label: 'Class', w: 150 }, { label: 'Teacher' }, { label: 'Marked', w: 120, align: 'right' }, { label: 'State', w: 160 }],
            rows: [
              [txt('Form 2A', { weight: 600, color: C.strong }), txt('Mrs Nyathi'), mono('32 of 32', { size: 11.5, color: C.body }), badge('Waiting to send', 'warn')],
              [txt('Form 2B', { weight: 600, color: C.strong }), txt('Mr Chirwa'), mono('31 of 31', { size: 11.5, color: C.body }), badge('Waiting to send', 'warn')],
              [txt('Form 3A', { weight: 600, color: C.strong }), txt('Mr Sibanda'), mono('28 of 30', { size: 11.5, color: C.body }), badge('Waiting to send', 'warn')],
              [txt('Form 3B', { weight: 600, color: C.strong }), txt('Mrs Moyo'), mono('29 of 29', { size: 11.5, color: C.body }), badge('Sent', 'ok')],
              [txt('Form 4A', { weight: 600, color: C.strong }), txt('Mr Dube'), mono('&mdash;', { size: 11.5 }), badge('Not marked')],
            ],
          }),
        })}
        ${card({
          title: 'Proposed &mdash; app/offline',
          actions: [proposalTag()],
          children: `<div style="padding: 20px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center">
            <div style="width: 40px; height: 40px; border-radius: 11px; background: ${C.warnBg}; display: flex; align-items: center; justify-content: center">${icon(I.wifiOff, { size: 19, stroke: C.warn })}</div>
            <div style="font-size: 13.5px; font-weight: 700; color: ${C.strong}">No connection</div>
            <div style="font-size: 12px; color: ${C.mid}; line-height: 1.55">This page needs the school&rsquo;s network and cannot be opened from what is stored on this device.<br><br>Anything you have already marked is saved here and will go up on its own.</div>
            ${solidBtn('Try again', I.refresh)}
            <div style="font-size: 11px; color: ${C.subtle}">Last connected 09:12</div>
          </div>`,
        })}
      `,
      )}
      ${note('proposed', 'Offline copy answers three questions in this order: <b>is my work safe</b>, <b>do I have to do anything</b>, <b>when will it go</b>. The spinner answers none of them, and a spinner with no end is the one thing a person reads as broken.')}
    `),
  })

/* ── 7. saving ──────────────────────────────────────────────────────── */
export const StateSaving = () =>
  adminArtboard({
    title: 'Transport',
    railItem: 'Transport',
    caption: 'Term 2 &middot; R2 Chishawasha &middot; Morning',
    search: 'Search routes',
    chips: [
      { label: 'On', value: '24', tone: 'ok' },
      { label: 'Not on', value: '3', tone: 'bad' },
      { label: 'Unmarked', value: '2', tone: 'warn' },
    ],
    bandActions: [
      `<div class="pri" style="height: 28px; padding: 0 12px; border-radius: 6px; background: ${C.brand}; opacity: .62; display: flex; align-items: center; gap: 7px; flex-shrink: 0"><span style="width: 12px; height: 12px; border-radius: 999px; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff"></span><span style="font-size: 12px; font-weight: 600; color: #fff">Saving&hellip;</span></div>`,
    ],
    content: page(`
      ${note('today', 'The pending label is real &mdash; campus buttons swap to <b>&ldquo;Saving&hellip;&rdquo;</b>, <b>&ldquo;Generating...&rdquo;</b>, <b>&ldquo;Copying&hellip;&rdquo;</b>. What is missing is everything around it: rows stay tappable while the write is in flight, and success is a toast that says <b>&ldquo;Done&rdquo;</b>.')}
      ${grid(
        'minmax(0, 1fr) 380px',
        `
        ${card({
          title: 'This morning',
          note: 'R2 · Chishawasha · 29 expected',
          children: [
            ['Chikwanda, Rutendo', 'CHS-1180 · Mission Gate 06:40 · Form 2A', 'on'],
            ['Dube, Tapiwa', 'CHS-1204 · Mission Gate 06:40 · Form 2A', 'on'],
            ['Moyo, Farai', 'CHS-1211 · Chishawasha Shops 06:52 · Form 2B', 'off'],
            ['Mutasa, Tanaka', 'CHS-1219 · Chishawasha Shops 06:52 · Form 2A', 'on'],
            ['Nyathi, Kudzai', 'CHS-1233 · no stop set · Form 3A', 'unmarked'],
          ]
            .map(([name, sub, state], i, a) =>
              listRow(
                `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(sub, { size: 10.5 })}</span>
                 ${state === 'unmarked' ? badge('Not marked', 'warn') : ''}
                 <span style="display: flex; gap: 5px; flex-shrink: 0; opacity: .5">
                   <span style="height: 24px; padding: 0 11px; border-radius: 6px; border: 1px solid ${state === 'on' ? 'transparent' : C.border}; background: ${state === 'on' ? C.okBg : C.surface}; display: flex; align-items: center; font-size: 11.5px; font-weight: 600; color: ${state === 'on' ? C.ok : C.mid}">On</span>
                   <span style="height: 24px; padding: 0 11px; border-radius: 6px; border: 1px solid ${state === 'off' ? 'transparent' : C.border}; background: ${state === 'off' ? C.badBg : C.surface}; display: flex; align-items: center; font-size: 11.5px; font-weight: 600; color: ${state === 'off' ? C.bad : C.mid}">Not on</span>
                 </span>`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${stack(
          `
          ${card({
            title: 'Proposed &mdash; while it is in flight',
            actions: [proposalTag()],
            children: `<div style="padding: 12px 13px; display: flex; flex-direction: column; gap: 9px">
              ${txt('The register dims to 50% and stops taking taps. A save that accepts more marks halfway through is a save that loses them.', { size: 11.5, color: C.mid })}
              ${txt('The band keeps its counts. They are what the person is about to confirm.', { size: 11.5, color: C.mid })}
            </div>`,
          })}
          ${card({
            title: 'Proposed &mdash; what &ldquo;Done&rdquo; should say',
            actions: [proposalTag()],
            children: `<div style="padding: 12px 13px; display: flex; flex-direction: column; gap: 9px">
              <div style="display: flex; gap: 9px; padding: 11px 12px; border-radius: 10px; background: ${C.strong}; box-shadow: 0 12px 32px -8px rgba(42,38,34,.3)">
                ${icon(I.check, { size: 15, stroke: '#9CC290', w: 2.4 })}
                <span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 700; color: #fff">Register saved</span><span style="display: block; font-size: 11.5px; color: rgba(255,255,255,.72); margin-top: 1px">24 on, 3 not on, 2 unmarked &mdash; R2, this morning.</span></span>
                <span style="font-size: 11.5px; font-weight: 600; color: #85A8F8; align-self: center; flex-shrink: 0">Undo</span>
              </div>
              ${txt('Today this reads <b>&ldquo;Done&rdquo;</b> and <b>&ldquo;Register saved&rdquo;</b> and nothing else. A confirmation that repeats what was written is the only kind worth showing &mdash; and an unmarked child saves as <b>on</b>, so saying so is the difference between a toast and a warning.', { size: 11.5, color: C.mid })}
            </div>`,
          })}
        `,
          12,
        )}
      `,
      )}
    `),
  })

/* ── 8. dialog anatomy ──────────────────────────────────────────────── */
export const StateDialog = () =>
  adminArtboard({
    title: 'Fee ledger',
    railItem: 'Ledger and structures',
    caption: 'Term 2',
    search: 'Search fee invoices',
    content: page(`
      ${note('today', 'The ledger&rsquo;s dialogs ask for <b>Student ID</b>, <b>Term ID</b> and <b>Invoice ID</b> as raw text boxes &mdash; a bursar is expected to know a UUID. That is the single worst thing in the campus module, and it is four fields across four dialogs.')}
      ${grid(
        3,
        `
        ${card({
          title: 'As built',
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
          ${field('Student ID', '', { required: true, placeholder: true })}
          ${field('Term ID', '', { required: true, placeholder: true })}
          ${field('Amount', '', { required: true, placeholder: true })}
          ${txt('Two UUID boxes, no picker, and no validation until the server answers.', { size: 11.5, color: C.bad })}
        </div>`,
        })}
        ${card({
          title: 'Proposed &mdash; resting',
          actions: [proposalTag()],
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
          ${pickerField('Pupil', 'Search by name or number', { required: true, placeholder: true })}
          ${pickerField('Term', 'Term 2 &mdash; 4 May to 10 Sep', { required: true })}
          ${field('Amount', 'USD 0.00', { required: true, placeholder: true, hint: 'Charged against the pupil&rsquo;s fee account.' })}
        </div>`,
        })}
        ${card({
          title: 'Proposed &mdash; refused',
          actions: [proposalTag()],
          children: `<div style="padding: 13px; display: flex; flex-direction: column; gap: 11px">
          <div style="display: flex; flex-direction: column; gap: 4px">
            <span style="font-size: 11px; font-weight: 600; color: ${C.body}">Pupil <span style="color: ${C.bad}">*</span></span>
            <div style="display: flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 10px; border: 1px solid ${C.bad}; border-radius: 7px; background: ${C.surface}"><span style="flex: 1; font-size: 12.5px; color: ${C.subtle}">Search by name or number</span>${icon(I.chevD, { size: 13, stroke: C.faint, w: 2 })}</div>
            <span style="font-size: 11px; color: ${C.bad}">Choose the pupil this invoice is for.</span>
          </div>
          ${pickerField('Term', 'Term 2 &mdash; 4 May to 10 Sep', { required: true })}
          ${field('Amount', 'USD 0.00', { required: true, placeholder: true })}
          ${txt('Validation lands on the field, on blur, before the request is made &mdash; not as a red alert above the dialog after a round trip.', { size: 11.5, color: C.mid })}
        </div>`,
        })}
      `,
      )}
      ${note('proposed', 'Dialog law: the title is the verb (<b>Record a receipt</b>, not <b>Receipt</b>); the lede says what will happen when it is confirmed, including the part that cannot be undone; every reference is a picker; the confirm button repeats the verb and never says <b>OK</b>; and cancel is the safe one, so a destructive dialog names the keep-it option first &mdash; <b>&ldquo;Keep it&rdquo;</b> beside <b>&ldquo;Cancel refund&rdquo;</b>, which the refund dialog already gets right.')}
    `),
    overlay: modal({
      w: 470,
      title: 'Record a receipt',
      lede: 'A payment larger than the invoice is accepted; the surplus becomes credit on the family&rsquo;s account.',
      body: `${pickerField('Invoice', 'INV-2026-0412 &mdash; Mutasa, Tanaka &mdash; USD 310.00 outstanding', { required: true })}
             ${field('Amount', 'USD 310.00', { required: true })}
             ${pickerField('Payment method', 'Mobile money', { required: true })}
             ${field('Reference', 'Ecocash 8841 2290')}`,
      footer: `${ghostBtn('Cancel')}${solidBtn('Record receipt')}`,
    }),
  })

/* ── 9. access blocked (real screen, reproduced) ────────────────────── */
export const AccessBlocked = () =>
  bareArtboard({
    w: 1100,
    h: 700,
    content: `<div style="height: 100%; display: flex; align-items: center; justify-content: center; padding: 30px">
      <div style="width: 740px; border: 1px solid ${C.border}; border-radius: 14px; background: ${C.surface}; overflow: hidden; box-shadow: 0 18px 44px -18px rgba(42,38,34,.16)">
        <div style="height: 96px; background: linear-gradient(180deg, ${C.badBg} 0%, rgba(246,226,221,0) 100%)"></div>
        <div style="padding: 0 34px 30px; margin-top: -58px; display: flex; flex-direction: column; gap: 16px">
          <div style="display: flex; align-items: center; gap: 11px">
            <div style="width: 48px; height: 48px; border-radius: 10px; border: 1px solid ${C.badBd}; background: ${C.badBg}; display: flex; align-items: center; justify-content: center">${icon(I.shield, { size: 23, stroke: C.bad, w: 1.7 })}</div>
            ${badge('Access Restricted', 'bad')}
          </div>
          <div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -.005em; color: ${C.strong}">Access blocked for this organization</h1>
            <p style="margin: 6px 0 0; font-size: 14px; line-height: 1.55; color: ${C.mid}">Your signed-in account does not currently have permission to use this tenant host.</p>
          </div>
          <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 22px; padding-top: 4px">
            <div>
              <h2 style="margin: 0 0 6px; font-size: 14px; font-weight: 600; color: ${C.strong}">Why this happens</h2>
              <p style="margin: 0; font-size: 13px; line-height: 1.6; color: ${C.mid}">This usually means tenant access is temporarily restricted or your account belongs to a different organization.</p>
            </div>
            <div>
              <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: ${C.strong}">What to do next</h2>
              <div style="display: flex; flex-direction: column; gap: 7px">
                ${['Confirm you are signed in with the correct organization account.', 'Ask your platform administrator to verify tenant and subscription status.', 'Retry after access is restored.']
                  .map(
                    (s) =>
                      `<div style="display: flex; gap: 9px; align-items: flex-start"><span style="width: 8px; height: 8px; border-radius: 999px; background: ${C.brand}; margin-top: 6px; flex-shrink: 0"></span><span style="font-size: 13px; line-height: 1.55; color: ${C.mid}">${s}</span></div>`,
                  )
                  .join('')}
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 10px; padding-top: 6px">
            <div class="pri" style="height: 44px; min-width: 176px; padding: 0 18px; border-radius: 8px; background: ${C.brand}; display: flex; align-items: center; justify-content: center; gap: 8px"><span style="font-size: 14px; font-weight: 600; color: #fff">Retry Access</span>${icon(I.chevR, { size: 16, stroke: '#fff', w: 2.1 })}</div>
            <div class="btn" style="height: 44px; min-width: 176px; padding: 0 18px; border-radius: 8px; border: 1px solid ${C.border}; background: ${C.surface}; display: flex; align-items: center; justify-content: center; gap: 8px">${icon(I.user, { size: 16 })}<span style="font-size: 14px; font-weight: 600; color: ${C.strong}">Switch Account</span></div>
          </div>
          <p style="margin: 0; font-size: 12px; color: ${C.subtle}">If access still fails, contact your platform administrator with your company name and expected tenant.</p>
        </div>
      </div>
    </div>`,
  })

/* ── 10. the offline page, as built and as proposed ─────────────────── */
export const OfflinePage = () =>
  bareArtboard({
    w: 1100,
    h: 600,
    content: `<div style="height: 100%; display: grid; grid-template-columns: 1fr 1fr">
      <div style="border-right: 1px solid ${C.border}; display: flex; flex-direction: column">
        <div style="padding: 14px 20px; border-bottom: 1px solid ${C.border}; background: ${C.surface}"><span style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">As built</span> <span style="font-size: 11.5px; color: ${C.subtle}">&mdash; app/offline/page.tsx, in full</span></div>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: #FBFCFD">
          <div style="width: 40px; height: 40px; border-radius: 999px; border: 2px solid ${C.sunken}; border-top-color: ${C.brand}"></div>
        </div>
        <div style="padding: 13px 20px; border-top: 1px solid ${C.border}; background: ${C.surface}"><span style="font-size: 11.5px; color: ${C.mid}; line-height: 1.55">A 40px spinner and no words. A screen-reader user hears &ldquo;Loading&rdquo;. Nothing says the connection is gone, nothing says whether their work survived, and the spin never stops.</span></div>
      </div>
      <div style="display: flex; flex-direction: column">
        <div style="padding: 14px 20px; border-bottom: 1px solid ${C.border}; background: ${C.surface}; display: flex; align-items: center; gap: 9px"><span style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">Proposed</span>${proposalTag()}</div>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 28px">
          <div style="width: 380px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px">
            <div style="width: 52px; height: 52px; border-radius: 13px; background: ${C.warnBg}; display: flex; align-items: center; justify-content: center">${icon(I.wifiOff, { size: 24, stroke: C.warn, w: 1.7 })}</div>
            <div style="font-size: 17px; font-weight: 700; color: ${C.strong}">No connection</div>
            <div style="font-size: 13px; color: ${C.mid}; line-height: 1.6">This page needs the school&rsquo;s network, and there is no copy of it on this device.<br><br>Anything you had already marked is saved here and goes up on its own when you are back.</div>
            <div style="display: flex; gap: 8px; margin-top: 2px">
              <div class="pri" style="height: 40px; padding: 0 16px; border-radius: 8px; background: ${C.brand}; display: flex; align-items: center; gap: 7px">${icon(I.refresh, { size: 15, stroke: '#fff', w: 2.1 })}<span style="font-size: 13px; font-weight: 600; color: #fff">Try again</span></div>
              <div class="btn" style="height: 40px; padding: 0 16px; border-radius: 8px; border: 1px solid ${C.border}; background: ${C.surface}; display: flex; align-items: center"><span style="font-size: 13px; font-weight: 600; color: ${C.strong}">What is saved here</span></div>
            </div>
            <div style="font-size: 11.5px; color: ${C.subtle}; margin-top: 2px">Last connected 09:12 &middot; 3 registers waiting</div>
          </div>
        </div>
      </div>
    </div>`,
  })

/* ── 11. claim a portal account (/c/[token]) ────────────────────────── */
const claimHead = () => `<div style="display: flex; align-items: center; gap: 9px">
  <div style="width: 30px; height: 30px; border-radius: 8px; background: ${C.strong}; display: flex; align-items: center; justify-content: center">${icon(I.book, { size: 16, stroke: '#fff', w: 2 })}</div>
  <span style="font-size: 13px; font-weight: 700; color: ${C.strong}">Chishawasha High</span>
</div>`

const claimPane = (label, body) => `<div style="display: flex; flex-direction: column; border-right: 1px solid ${C.border}">
  <div style="padding: 12px 20px; border-bottom: 1px solid ${C.border}; background: ${C.surface}"><span style="font-size: 12px; font-weight: 700; color: ${C.strong}">${esc(label)}</span></div>
  <div style="flex: 1; padding: 26px 30px; overflow: hidden">${body}</div>
</div>`

export const ClaimAccount = () =>
  bareArtboard({
    w: 900,
    h: 700,
    content: `<div style="height: 100%; display: grid; grid-template-columns: 1fr 1fr">
      ${claimPane(
        'The invite, unclaimed',
        `<div style="display: flex; flex-direction: column; gap: 14px">
          ${claimHead()}
          <div>
            <div style="font-size: 19px; font-weight: 700; color: ${C.strong}; letter-spacing: -.01em">Set up your portal account</div>
            <div style="font-size: 13px; color: ${C.mid}; line-height: 1.6; margin-top: 5px">Chishawasha High has invited you to follow <b>Tanaka Mutasa</b> in Form 2A. Choose a password and the portal is yours.</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 10px">
            ${field('Your name', 'Grace Mutasa')}
            ${field('Email', 'g.mutasa@example.co.zw')}
            ${field('Choose a password', '&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;', { required: true, hint: 'At least 10 characters. You will use this every time.' })}
          </div>
          <div class="pri" style="height: 44px; border-radius: 9px; background: ${C.brand}; display: flex; align-items: center; justify-content: center"><span style="font-size: 13.5px; font-weight: 600; color: #fff">Open my portal</span></div>
          <div style="font-size: 11.5px; color: ${C.subtle}; line-height: 1.55">This link was sent to you by the school office and works once. If it has stopped working, ask the office to send another.</div>
        </div>`,
      )}
      ${claimPane(
        'Already claimed, or expired',
        `<div style="display: flex; flex-direction: column; gap: 14px">
          ${claimHead()}
          ${emptyState({ ic: I.lock, h: 330, title: 'This invite has already been used', body: 'The link the school sent works once, and this one has been claimed. If it was you, sign in with the password you chose. If it was not, tell the school office.', action: `<div style="display: flex; flex-direction: column; gap: 8px; width: 250px">${solidBtn('Sign in')}${ghostBtn('Ask the office for a new link')}</div>` })}
        </div>`,
      )}
    </div>`,
  })
