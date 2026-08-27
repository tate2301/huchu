/**
 * Academics page — the ladder everything else hangs off: years and terms,
 * the calendar, classes and streams, subjects, and the scheme of work.
 *
 * Called by build-module.mjs. Copy is the source verbatim.
 */
import {
  C, I, esc, adminArtboard, page, grid, rowFlex, card, table, listRow, badge, mono,
  txt, ghostBtn, solidBtn, filterSelect, searchField, segments, sectionLabel,
  tinyBtn, avatar,
} from '../lib/kit.mjs'

const note = () => ''

/* ── /schools/academics ─────────────────────────────────────────────── */
export const Academics = () =>
  adminArtboard({
    title: 'Academics Setup',
    railItem: 'Years and terms',
    caption: 'Term 2 &middot; 2026 Academic Year',
    search: 'Search academic years',
    action: { label: 'New academic year' },
    bandActions: [ghostBtn('New term', I.plus), ghostBtn('Add a day', I.calendar)],
    content: page(`
      ${rowFlex(segments([{ label: 'Academic Years', count: 3 }, { label: 'Terms', count: 9 }, { label: 'Holidays & Events', count: 22 }, { label: 'Classes', count: 18 }, { label: 'Subjects', count: 22 }], 'Academic Years'))}
      ${card({
        title: 'Academic years',
        children: table({
          cols: [{ label: 'Academic year' }, { label: 'Terms', w: 90, align: 'right' }, { label: 'Classes', w: 90, align: 'right' }, { label: 'Status', w: 170 }],
          rows: [
            ['2026 - 2026 Academic Year', '5 Jan 2026 → 4 Dec 2026', '3', '18', true],
            ['2025 - 2025 Academic Year', '6 Jan 2025 → 5 Dec 2025', '3', '18', false],
            ['2024 - 2024 Academic Year', '8 Jan 2024 → 6 Dec 2024', '3', '17', false],
          ].map(([name, range, terms, classes, current]) => [
            `<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span>${mono(range, { size: 10.5 })}</span>`,
            mono(terms, { size: 12, color: C.body }),
            mono(classes, { size: 12, color: C.body }),
            current ? badge('Current', 'ok') : tinyBtn('Make current'),
          ]),
        }),
      })}
      ${card({
        title: 'Terms',
        children: table({
          cols: [{ label: 'Term' }, { label: 'Academic year', w: 190 }, { label: 'Enrolled', w: 90, align: 'right' }, { label: 'Invoices', w: 90, align: 'right' }, { label: 'Status', w: 170 }],
          rows: [
            ['T1 - Term 1', '5 Jan → 27 Mar 2026', '2026 Academic Year', '838', '838', false],
            ['T2 - Term 2', '4 May → 10 Sep 2026', '2026 Academic Year', '842', '842', true],
            ['T3 - Term 3', '21 Sep → 4 Dec 2026', '2026 Academic Year', '0', '0', false],
          ].map(([name, range, year, enrolled, inv, current]) => [
            `<span style="min-width:0"><span style="display:block;font-size:12.5px;font-weight:600;color:${C.strong}">${esc(name)}</span>${mono(range, { size: 10.5 })}</span>`,
            txt(year, { size: 12, color: C.mid }),
            mono(enrolled, { size: 12, color: C.body }),
            mono(inv, { size: 12, color: C.body }),
            current ? badge('Current', 'ok') : tinyBtn('Make current'),
          ]),
        }),
      })}
      ${grid(
        2,
        `
        ${card({
          title: 'Holidays and Events',
          note: '22 entries, 14 of which close the school.',
          children: `<div style="padding: 7px 13px; background: ${C.canvas}; border-bottom: 1px solid ${C.borderSubtle}">${sectionLabel('August 2026')}</div>
            ${[
              ['Heroes’ Day', 'Public holiday', '10 Aug', false],
              ['Defence Forces Day', 'Public holiday', '11 Aug', false],
              ['Mid-term break', 'Half term', '28 Aug → 1 Sep', false],
              ['Form 4 mock examinations', 'Examination', '24 Aug → 4 Sep', true],
            ]
              .map(([name, kind, when, open], i, a) =>
                listRow(
                  `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${esc(name)}</span>${mono(`${kind} · ${when}`, { size: 10.5 })}</span>${badge(open ? 'School open' : 'School closed', open ? 'ok' : 'plain')}${tinyBtn('Remove')}`,
                  { last: i === a.length - 1 },
                ),
              )
              .join('')}`,
        })}
        ${note('today', 'A calendar entry is removed by a ghost <b>Remove</b> with no confirmation. Deleting &ldquo;Mid-term break&rdquo; by mistake makes five days of missing registers appear across every class, and there is no undo.<br><br>The onboarding copy is exact about why this screen matters: <b>&ldquo;Add the public holidays first &mdash; they are the ones that make registers look missing.&rdquo;</b>')}
      `,
      )}
      ${note('today', 'The <b>Classes</b> and <b>Subjects</b> views on this screen have no create button &mdash; those live on <code>/schools/classes</code> and <code>/schools/subjects</code>. And there is <b>no periods UI anywhere</b>, even though the timetable&rsquo;s onboarding alert sends you here to build the school day.')}
    `),
  })

/* ── /schools/classes ───────────────────────────────────────────────── */
export const Classes = () =>
  adminArtboard({
    title: 'Classes',
    railItem: 'Classes',
    caption: 'Term 2 &middot; 18 classes, 34 streams',
    search: 'Search classes',
    action: { label: 'Add Class' },
    content: page(`
      ${rowFlex(`${segments([{ label: 'Classes', count: 18 }, { label: 'Streams', count: 34 }], 'Classes')}<div style="flex: 1"></div>${searchField('Search classes', { w: 250 })}`, { align: 'flex-end' })}
      ${card({
        title: 'Classes',
        children: table({
          cols: [
            { label: 'Code', w: 110 },
            { label: 'Name' },
            { label: 'Level', w: 90, align: 'right' },
            { label: 'Capacity', w: 100, align: 'right' },
            { label: 'Streams', w: 90, align: 'right' },
            { label: 'Students', w: 100, align: 'right' },
          ],
          rows: [
            ['F1', 'Form 1', '1', '120', '4', '116'],
            ['F2', 'Form 2', '2', '120', '4', '118'],
            ['F3', 'Form 3', '3', '120', '4', '114'],
            ['F4', 'Form 4', '4', '100', '3', '96'],
            ['L5', 'Lower Sixth', '5', '80', '2', '62'],
            ['U6', 'Upper Sixth', '6', '80', '2', '58'],
          ].map(([code, name, lvl, cap, streams, n]) => [
            mono(code, { size: 11.5, color: C.brandStrong, weight: 700 }),
            txt(name, { size: 12.5, weight: 600, color: C.brandStrong }),
            mono(lvl, { size: 12, color: C.mid }),
            mono(cap, { size: 12, color: C.mid }),
            mono(streams, { size: 12, color: C.body }),
            mono(n, { size: 12, color: C.body, weight: 700 }),
          ]),
        }),
      })}
      ${grid(
        2,
        `
        ${card({
          title: 'Streams',
          note: 'the other view',
          children: table({
            cols: [{ label: 'Code', w: 90 }, { label: 'Name' }, { label: 'Class', w: 120 }, { label: 'Capacity', w: 90, align: 'right' }],
            rows: [
              ['2A', 'Form 2 Alpha', 'Form 2', '32'],
              ['2B', 'Form 2 Beta', 'Form 2', '32'],
              ['2C', 'Form 2 Gamma', 'Form 2', '30'],
              ['2D', 'Form 2 Delta', 'Form 2', '26'],
            ].map(([c, n, cl, cap]) => [
              mono(c, { size: 11.5, color: C.body, weight: 700 }),
              txt(n, { size: 12, color: C.body }),
              txt(cl, { size: 12, color: C.mid }),
              mono(cap, { size: 12, color: C.mid }),
            ]),
          }),
        })}
        ${note('today', 'The Streams view has a heading row with no button. <b>There is no way to create a stream anywhere in the module</b> &mdash; but every roll, every register and every mark sheet is filtered by one.')}
      `,
      )}
    `),
  })

/* ── record-page shell ──────────────────────────────────────────────── */
const recordShell = ({ name, reference, subtitle, tabs, active, body, glance, props }) => `
  <div style="display: flex; height: 100%; min-height: 0">
    <div class="scroll" style="width: 172px; flex-shrink: 0; border-right: 1px solid ${C.border}; padding: 10px 8px; background: ${C.surface}">
      ${tabs
        .map(
          ([label, count]) =>
            `<div class="nav" style="display: flex; align-items: center; gap: 8px; height: 29px; padding: 0 9px; border-radius: 6px; margin-bottom: 1px; background: ${label === active ? C.brandSoft : 'transparent'}"><span style="flex: 1; font-size: 12.5px; font-weight: ${label === active ? 700 : 500}; color: ${label === active ? C.brandStrong : C.mid}">${esc(label)}</span>${count !== undefined ? mono(String(count), { size: 10.5, color: label === active ? C.brandStrong : C.faint }) : ''}</div>`,
        )
        .join('')}
    </div>
    <div class="scroll" style="flex: 1; min-width: 0; overflow-y: auto">
      <div style="position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 10px; height: var(--band-h); padding: 0 16px; background: ${C.canvas}; border-bottom: 1px solid ${C.border}">
        ${mono(reference, { size: 11.5, color: C.body, weight: 700 })}
        <span style="width: 1px; height: 14px; background: ${C.border}"></span>
        ${txt(subtitle, { size: 11.5, color: C.mid })}
      </div>
      <div style="padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 12px">${body}</div>
    </div>
    <div style="width: 300px; flex-shrink: 0; border-left: 1px solid ${C.border}; background: ${C.surface}; padding: 13px; display: flex; flex-direction: column; gap: 14px">
      <div style="display: flex; align-items: center; gap: 9px">
        ${avatar(reference.slice(0, 2), { size: 34 })}
        <div style="min-width: 0"><div style="font-size: 13px; font-weight: 700; color: ${C.strong}">${esc(name)}</div>${mono(reference, { size: 10.5 })}</div>
      </div>
      <div>${sectionLabel('At a glance')}
        <div style="margin-top: 7px; display: flex; flex-direction: column; gap: 5px">
          ${glance
            .map(
              ([k, v]) =>
                `<div style="display: flex; align-items: center; justify-content: space-between"><span style="font-size: 11.5px; color: ${C.mid}">${esc(k)}</span><span class="mono" style="font-size: 12px; font-weight: 700; color: ${C.strong}">${esc(v)}</span></div>`,
            )
            .join('')}
        </div>
      </div>
      <div>${sectionLabel('Properties')}
        <div style="margin-top: 7px; display: flex; flex-direction: column; gap: 3px">
          ${props
            .map(
              ([k, v, ro]) =>
                `<div style="display: flex; align-items: center; gap: 8px; min-height: 27px; padding: 0 7px; border-radius: 6px; background: ${ro ? 'transparent' : C.canvas}"><span style="width: 112px; flex-shrink: 0; font-size: 11px; color: ${C.mid}">${esc(k)}</span><span style="flex: 1; min-width: 0; font-size: 11.5px; color: ${ro ? C.subtle : C.body}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(v)}</span></div>`,
            )
            .join('')}
        </div>
      </div>
    </div>
  </div>`

export const ClassRecord = () =>
  adminArtboard({
    title: 'Form 2',
    railItem: 'Classes',
    caption: 'Classes',
    back: true,
    search: null,
    content: `<div style="height: calc(1000px - 48px)">${recordShell({
      name: 'Form 2',
      reference: 'F2',
      subtitle: 'Term 2 &middot; 118 of 120',
      tabs: [
        ['Roll', 118],
        ['Subjects', 9],
        ['Streams', 4],
        ['Notes', 0],
        ['Files', 0],
      ],
      active: 'Subjects',
      glance: [
        ['On the roll', '118'],
        ['Places left', '2'],
        ['Subjects', '9'],
      ],
      props: [
        ['Name', 'Form 2'],
        ['Code', 'F2'],
        ['Year group', '2'],
        ['Places', '120'],
        ['Term', 'Term 2', true],
      ],
      body: `
        ${rowFlex(`${ghostBtn('Class list', I.print)}${ghostBtn('Blank register', I.print)}`)}
        ${card({
          title: 'Subjects',
          note: '9 timetabled',
          children: [
            ['Mathematics', 'Mrs P. Nyathi', 'Core'],
            ['English Language', 'Mr T. Chirwa', 'Core'],
            ['Combined Science', 'Mr M. Sibanda', 'Core'],
            ['Shona', 'Mrs R. Moyo', 'Core'],
            ['Geography', 'Mr A. Dube', ''],
            ['History', 'No teacher assigned', ''],
          ]
            .map(([subj, teacher, core], i, a) =>
              listRow(
                `<span style="flex: 1; min-width: 0"><span style="display: block; font-size: 12.5px; font-weight: 600; color: ${C.strong}">${subj}</span>${txt(teacher, { size: 11, color: teacher.startsWith('No teacher') ? C.bad : C.subtle })}</span>${core ? badge(core, 'brand') : ''}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${card({
          title: 'Streams',
          children: [
            ['Form 2 Alpha', '2A', '32 places'],
            ['Form 2 Beta', '2B', '32 places'],
            ['Form 2 Gamma', '2C', '30 places'],
            ['Form 2 Delta', '2D', '26 places'],
          ]
            .map(([n, c, p], i, a) =>
              listRow(
                `${txt(n, { size: 12.5, weight: 600, color: C.strong, flex: 1 })}${mono(c, { size: 11.5, color: C.mid })}${txt(p, { size: 11.5, color: C.subtle })}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${note('today', 'The two print actions here are the module&rsquo;s only server-rendered PDFs, and the only place they exist. While one runs the label becomes <b>&ldquo;Preparing&hellip;&rdquo;</b> and a failure raises <b>&ldquo;Nothing was printed&rdquo;</b> &mdash; which is exactly the right sentence.')}
      `,
    })}</div>`,
  })

/* ── /schools/subjects ──────────────────────────────────────────────── */
export const Subjects = () =>
  adminArtboard({
    title: 'Subjects',
    railItem: 'Subjects',
    caption: '22 on the catalogue',
    search: 'Search subjects',
    action: { label: 'Add Subject' },
    content: page(`
      ${card({
        title: 'Subjects',
        children: table({
          cols: [{ label: 'Code', w: 110 }, { label: 'Name' }, { label: 'Type', w: 110 }, { label: 'Pass Mark', w: 110, align: 'right' }, { label: 'Status', w: 110 }],
          rows: [
            ['MAT', 'Mathematics', 'Core', '50', true],
            ['ENG', 'English Language', 'Core', '50', true],
            ['CSC', 'Combined Science', 'Core', '50', true],
            ['SHO', 'Shona', 'Core', '50', true],
            ['GEO', 'Geography', 'Elective', '45', true],
            ['HIS', 'History', 'Elective', '45', true],
            ['LAT', 'Latin', 'Elective', '45', false],
          ].map(([code, name, type, pass, active]) => [
            mono(code, { size: 11.5, color: C.brandStrong, weight: 700 }),
            txt(name, { size: 12.5, weight: 600, color: C.brandStrong }),
            badge(type, type === 'Core' ? 'brand' : 'plain'),
            mono(pass, { size: 12, color: C.body }),
            active ? badge('Active', 'ok') : badge('Inactive'),
          ]),
        }),
      })}
      ${grid(
        2,
        `
        ${note('today', 'A second <code>&lt;h2&gt;</code> reading <b>Subjects</b> sits directly under the page title &mdash; the same duplicate as Guardians.')}
        ${note('proposed', 'This is one of <b>three</b> subject lists. Consolidating on this one, and having Teachers and Academics link to it, removes two tables, two dialogs and one endpoint &mdash; and settles whether <b>Core</b> defaults on.')}
      `,
      )}
    `),
  })

/* ── /schools/subjects/[id] ─────────────────────────────────────────── */
export const SubjectRecord = () =>
  adminArtboard({
    title: 'Mathematics',
    railItem: 'Subjects',
    caption: 'Subjects',
    back: true,
    search: null,
    content: `<div style="height: calc(1000px - 48px)">${recordShell({
      name: 'Mathematics',
      reference: 'MAT',
      subtitle: 'Core &middot; Pass at 50 &middot; Currently taught',
      tabs: [
        ['Classes', 18],
        ['Notes', 0],
        ['Files', 0],
      ],
      active: 'Classes',
      glance: [
        ['Classes', '18'],
        ['Teachers', '6'],
        ['Without a teacher', '2'],
      ],
      props: [
        ['Name', 'Mathematics'],
        ['Code', 'MAT'],
        ['Taken by', 'Everybody — core'],
        ['Pass mark', '50'],
        ['Taught', 'Currently taught'],
      ],
      body: `
        ${card({
          title: 'Classes',
          note: '18 take this subject',
          children: [
            ['Form 1', 'Mrs P. Nyathi'],
            ['Form 2', 'Mrs P. Nyathi'],
            ['Form 3', 'Mr T. Chirwa'],
            ['Form 4', 'Mrs P. Nyathi'],
            ['Lower Sixth', 'No teacher'],
            ['Upper Sixth', 'No teacher'],
          ]
            .map(([cls, teacher], i, a) =>
              listRow(
                `${txt(cls, { size: 12.5, weight: 600, color: C.strong, flex: 1 })}${txt(teacher, { size: 11.5, color: teacher === 'No teacher' ? C.bad : C.mid })}`,
                { last: i === a.length - 1 },
              ),
            )
            .join(''),
        })}
        ${note('proposed', 'The rail already counts <b>Without a teacher: 2</b>, and the rows name them. There is no action to fix it here &mdash; the allocate dialog lives on the Teachers screen, two clicks away and filtered the other way round. A <b>Give it a teacher</b> action on the row is that same dialog, opened where the problem is.')}
      `,
    })}</div>`,
  })

/* ── /schools/academics/syllabus ────────────────────────────────────── */
const weekBlock = (n, topic, objectives, activities, resources, last) => `
  <div style="padding: 13px; ${last ? '' : `border-bottom: 1px solid ${C.borderSubtle};`}">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 9px">
      <span style="font-size: 12.5px; font-weight: 700; color: ${C.strong}">Week ${n}</span>
      <div style="flex: 1"></div>
      ${tinyBtn('Remove')}
    </div>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px">
      ${[
        ['Topic', topic, 'What is taught this week'],
        ['Objectives', objectives, 'By the end of the week, pupils can…'],
        ['Activities', activities, 'How the week runs'],
        ['Resources', resources, 'Textbook chapters, equipment, handouts'],
      ]
        .map(
          ([label, value, ph]) =>
            `<div style="display: flex; flex-direction: column; gap: 4px">
              <span style="font-size: 11px; font-weight: 600; color: ${C.body}">${label}</span>
              <div style="min-height: 52px; padding: 7px 9px; border: 1px solid ${C.border}; border-radius: 7px; background: ${C.surface}"><span style="font-size: 12px; line-height: 1.5; color: ${value ? C.body : C.subtle}">${esc(value || ph)}</span></div>
            </div>`,
        )
        .join('')}
    </div>
  </div>`

export const Syllabus = () =>
  adminArtboard({
    title: 'Scheme of work',
    railItem: 'Scheme of work',
    caption: 'Mathematics &middot; Form 2 &middot; Term 2',
    search: null,
    content: `<div style="padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 12px; max-width: 1040px">
      ${txt('Each subject&rsquo;s term written week by week &mdash; and what the lesson planner drafts from.', { size: 12.5, color: C.mid })}
      ${rowFlex(`${filterSelect('Subject', 'Mathematics')}${filterSelect('Form', 'Form 2')}${filterSelect('Term', 'Term 1 · 2026 Academic Year (current)', { w: 280 })}`, { align: 'flex-end' })}
      ${card({
        title: 'Mathematics — Form 2',
        note: '3 weeks laid out. A week with no topic is dropped on save.',
        actions: [solidBtn('Save the scheme')],
        children: `
          ${weekBlock(1, 'Simultaneous equations — elimination', 'Solve a pair of linear equations by elimination, and check the answer by substitution.', 'Worked examples on the board, then exercise 4 in pairs. Board race on Friday.', 'New General Mathematics Bk 2, ch. 7. Squared paper.', false)}
          ${weekBlock(2, 'Simultaneous equations — substitution and graphs', 'Solve the same pairs graphically and say why the two methods agree.', 'Graph plotting on squared paper; one problem set for homework.', 'Bk 2, ch. 7–8. Graph paper, rulers.', false)}
          ${weekBlock(3, '', '', '', '', true)}`,
      })}
      ${rowFlex(ghostBtn('Add a week', I.plus))}
      ${note('today', 'Saving <b>replaces the whole scheme</b>, and a removed week is genuinely deleted with no confirmation. The success message is the good part: <b>&ldquo;Scheme saved &mdash; 3 weeks. &lsquo;Lay out this week&rsquo; in the planner now drafts from it.&rdquo;</b> &mdash; it says what the save is <em>for</em>, not that it worked.')}
    </div>`,
  })
