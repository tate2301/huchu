import sys
sys.path.insert(0, 'gen2/port')
from ri_kit import *
import ri_data as d
P = sys.argv[1]
theme('corelith')

def sheet(title, sub, inner, w=1440):
    return T('''<div style="min-height: 100%; box-sizing: border-box; background: #ffffff; color: [[ink]]; font: 400 13.5px/1.45 [[sans]]; padding: 48px 56px 64px;">
  <div style="display: flex; align-items: center; gap: 10px; color: [[muted]]; font-size: 12.5px; font-weight: 500;">[[ic]]Reports &amp; Insights · every workspace</div>
  <h1 style="margin: 10px 0 6px; font-size: 26px; font-weight: 600; letter-spacing: -0.015em;">[[t]]</h1>
  <p style="margin: 0 0 28px; max-width: 760px; color: [[ink2]]; font-size: 14.5px;">[[s]]</p>
[[x]]
</div>''', ic=icon('barChart', 14), t=title, s=sub, x=inner)

def h2(t, s=''):
    return T('<h2 style="margin: 30px 0 4px; font-size: 16px; font-weight: 600;">[[t]]</h2>[[s]]', t=t, s=T('<p style="margin: 0 0 12px; color: [[muted]];">[[s]]</p>', s=s) if s else '')

# ---------------- Tree ----------------
def node(depth, name, route, what, last=False, tag=''):
    pad = depth * 28
    tg = (' ' + chip(tag[0], tag[1])) if tag else ''
    rail = ''.join(T('<span style="position: absolute; left: [[x]]px; top: 0; bottom: 0; width: 1px; background: [[strong]];"></span>', x=14 + i * 28) for i in range(depth))
    elbow = T('<span style="position: absolute; left: [[x]]px; top: 20px; width: 12px; height: 1px; background: [[strong]];"></span>', x=14 + (depth - 1) * 28) if depth else ''
    return T('<div style="position: relative; display: grid; grid-template-columns: [[w]]px minmax(0, 1fr); gap: 16px; align-items: start; padding: 10px 0 10px [[p]]px; border-bottom: 1px solid [[soft]];">[[rail]][[elbow]]<span style="display: flex; flex-direction: column; gap: 2px; padding-left: [[pl]]px;"><span style="font-weight: 600;">[[n]][[tg]]</span><span style="font: 12px [[mono]]; color: [[muted]];">[[r]]</span></span><span style="color: [[ink2]];">[[wh]]</span></div>', w=330 - pad, p=pad, pl=6 if depth else 0, rail=rail, elbow=elbow, n=name, tg=tg, r=route, wh=what)

TREE = [
 (0, 'Reports', 'rail · every workspace', 'Shows when the person can read at least one report. Same pages in every vertical; retail wears the Tender look.'),
 (1, 'Overview', '/reports', 'What changed since you last looked: each Insights headline, the templates opened most, and how each module is doing.', ('New', 'info')),
 (1, 'Insights', '/reports/insights/[topic]', 'One page per topic, in one shape: a headline written from the figures, four figures against the period before, one question with one chart, tables in tabs, and Do something about it.'),
 (2, 'Topics', 'set by the workspace', 'Sales and CRM: Sales, Site visits, Team. Retail: Sales, Profit, Products, Stock health, Losses, Customers, Money. Schools: Fees, Attendance, Enrolment, Boarding. Gold mine: Production, Downtime, Gold, Stores. Payroll: Pay cost, Statutory. Workshop: Equipment, Stores.'),
 (1, 'All reports', '/reports/all', 'Every template this person can open, grouped by area. Tabs: All, From Corelith, Made by your team, Just yours.'),
 (2, 'Area', '/reports/all?area=[slug]', 'The same list, one area. The workspace’s own areas come first; Pay, People and Books come last everywhere.'),
 (2, 'A report', '/reports/[key]', 'Dates and the report’s own choices, search, filters, group by, columns. The page: figures, charts, breakdown, table. Save as a template, Export, Send it.'),
 (3, 'Arrange the page', '/reports/[key]/arrange', 'Managers only. Blocks: headline figures, bar chart, trend, breakdown, heading, text, the table.'),
 (3, 'Save as a template', 'sheet', 'Name, what it shows, seen by (just me, managers, everyone), keep the dates.'),
 (3, 'Export and Send it', 'sheet', 'PDF in five layouts, Excel workbook, CSV, all or selected rows. Send it on a schedule.', ('To build', 'neutral')),
 (2, 'A template', '/reports/[key]?template=[id]', 'A saved view of one report: its columns, filters, grouping, totals and dates.'),
 (2, 'A built report', '/reports/built/[key] · /reports/custom/[id]', 'Blocks whose questions read one or more reports. From Corelith: Make it yours. Yours: Edit opens the builder.'),
 (3, 'Edit, in the builder', '/reports/custom/[id]/edit', 'The same builder as forms and documents: outline, page, inspector. Questions in Steps or SQL.'),
 (2, 'From Books and Payroll', 'opens in its module', 'Profit and loss, balance sheet, cash flow, trial balance, ageing, VAT, P2 and NSSA are listed here and open where they live.'),
 (1, 'Settings', 'Management → Reports', 'Managers: which reports are offered, everyone’s starting view and each report’s page.'),
]
tree = ''.join(node(*t) for t in TREE)

def tag_list(xs):
    return ' '.join(chip(x) for x in xs)
mrows = []
for v in d.VERTICALS:
    areas = [d.AREAS[a][0] for a in v[7]]
    own = [a for a in v[7] if a not in ('pay', 'people', 'books')]
    ar = ', '.join('<b style="font-weight: 600;">%s</b>' % d.AREAS[a][0] for a in own) + ('; then ' if own else '') + 'Pay, People, Books'
    mrows.append([(v[1], 'lead'), (v[2] + '<br><span style="font: 12px ' + MONO + '; color: ' + C['muted'] + ';">' + v[5] + '</span>', ''), (', '.join(t[0] for t in v[8]), ''), (ar, ''), (str(d.count(v[7])), 'num')])
mt = table([('Workspace', '130px', 'l'), ('Example', '170px', 'l'), ('Insights', 'minmax(0, 1fr)', 'l'), ('Areas, in order', 'minmax(0, 1.2fr)', 'l'), ('From Corelith', '96px', 'r')], [[(c[0], c[1]) if c[1] != '' else (c[0], 'wrap') for c in r] for r in mrows], pad='0 12px', rowh=64)
mt = mt.replace('text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', 'text-align: left; padding-top: 9px; padding-bottom: 9px;')

MOVES = [
 ('/crm/reports and /crm/insights', 'Insights → Sales', 'The two pages repeat each other. One page, one period for every tab.'),
 ('/crm/build/visits/[id]/insights', 'Insights → Site visits', 'Pick the form at the top; the figures stay the same.'),
 ('/schools/reports tabs', 'Insights → Fees, Enrolment, Boarding', 'Export CSV and PDF stay. Arrears keeps Remind the families.'),
 ('/portal/teacher/reports', 'Insights → Attendance (for heads); stays in the teacher portal', 'Teachers keep their class page.'),
 ('/dashboard, filed under Settings', 'Insights → Production', 'Plant reports only today; it reads shift reports too.'),
 ('/gold/insights/allocations', 'Gold → Allocations', 'It is a work queue, not an insight. Its status counts are fixed.'),
 ('/retail/reports, rows link to a 404', '/retail/reports/[ref] is built', 'The run page for a template: the same report page, in the Tender look.'),
 ('Books statements, payroll returns', 'Listed under Books, Pay', 'Still open in Books and Payroll. Each gets Export.'),
]
moves = table([('Today', 'minmax(0, 1fr)', 'l'), ('In this design', 'minmax(0, 1fr)', 'l'), ('Why', 'minmax(0, 1.3fr)', 'l')], [[(a, 'code'), (b, 'lead'), (c, 'muted')] for a, b, c in MOVES], pad='0 12px', rowh=44)

inner = T('''<div class="cm-grid2" style="display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 48px; align-items: start;">
  <div>[[h1]]<div style="border-top: 1px solid [[line]];">[[tree]]</div></div>
  <div>[[h2]][[mt]][[h3]][[moves]]</div>
</div>''', h1=h2('The tree', 'One module. Routes are the app’s, with two new: the Overview and /reports/all.'), tree=tree,
  h2=h2('Per workspace', 'The product decides which areas come first, so a workshop sees Stores and maintenance first, not the registry order.'), mt=mt,
  h3=h2('What moves', 'Pages that exist today and where they land.'), moves=moves)
save(P, 'RiTree.dc.html', doc('Reports · The tree', sheet('The tree', 'Reports & Insights is one module in every workspace. Insights answers a question in one page. All reports is the catalogue of templates: Corelith’s, your team’s and yours.', inner), {}, 1440, 1500))

# ---------------- Templates ----------------
STATE = {'app': ('In the app', 'ok'), 'move': ('Moves in', 'info'), 'build': ('To build', 'neutral')}
where = {}
for v in d.VERTICALS:
    for a in v[7]:
        where.setdefault(a, []).append(v[1] if a not in ('pay', 'people', 'books') else 'Every workspace')
rows = []
for a, (lab, g) in d.AREAS.items():
    ts = d.tpl(a)
    rows.append(('__group__', lab, str(len(ts)), ', '.join(sorted(set(where.get(a, []))))))
    for t in ts:
        st = STATE[t[8]]
        rows.append([(t[1], 'lead'), (t[2], 'muted'), (t[3], 'code'), (t[4], 'wrap'), (t[5], 'muted'), (t[6] or '—', 'muted' if t[6] else 'faint'), (t[7], 'muted'), (st[0], 'chip', st[1])])
tt = table([('Template', '190px', 'l'), ('Kind', '78px', 'l'), ('Reads', '200px', 'l'), ('What it shows', 'minmax(0, 1fr)', 'l'), ('Opens on', '104px', 'l'), ('One row for each', '120px', 'l'), ('Seen by', '84px', 'l'), ('State', '96px', 'l')], rows, pad='0 12px', rowh=44)
tt = tt.replace('text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', 'text-align: left; padding-top: 8px; padding-bottom: 8px;')

FIELDS = [
 ('Name', 'Says what it reads, in plain words: “Takings by payment”, not “Payments report v2”.'),
 ('What it shows', 'One line, shown in the catalogue. Every Corelith template has one.'),
 ('Reads', 'A report key, or several for a built report. Reading needs the module, the role and the campus.'),
 ('Opens on', 'The dates it starts with. Saved templates keep their dates only if asked.'),
 ('Narrowed by', 'Site, status, till, class, cashier: the report’s own choices, plus filters.'),
 ('One row for each', 'Group by, or roll up to one row per product, day, till, cashier or class.'),
 ('Columns and totals', 'Which show, in what order, and which are summed, averaged or counted.'),
 ('Page', 'Figures, charts, a breakdown and the table. Managers arrange it.'),
 ('Seen by', 'Just me, managers or everyone.'),
 ('Made by', 'Corelith, your team or you. Corelith’s never change; Make it yours copies one.'),
]
fl = ''.join(T('<div style="display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid [[soft]];"><span style="font-weight: 600;">[[k]]</span><span style="color: [[ink2]];">[[v]]</span></div>', k=k, v=v) for k, v in FIELDS)
KINDS = [('Report', 'One report with a saved view: the table, and the page above it.'), ('Built', 'Blocks whose questions read one or more reports: figures, charts, tables, text.'), ('Statement', 'Books and Payroll statements. Listed here, opened in their module.')]
kl = ''.join(T('<div style="display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid [[soft]];"><span style="font-weight: 600;">[[k]]</span><span style="color: [[ink2]];">[[v]]</span></div>', k=k, v=v) for k, v in KINDS)
n_app = sum(1 for t in d.T if t[8] == 'app'); n_move = sum(1 for t in d.T if t[8] == 'move'); n_build = sum(1 for t in d.T if t[8] == 'build')
inner = T('''<div class="cm-grid2" style="display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 48px; align-items: start; margin-bottom: 8px;">
  <div>[[h1]]<div style="border-top: 1px solid [[line]];">[[fl]]</div></div>
  <div>[[h2]]<div style="border-top: 1px solid [[line]];">[[kl]]</div>
    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px;">[[c1]][[c2]][[c3]]</div></div>
</div>
[[h3]][[tt]]''', h1=h2('What a template holds'), fl=fl, h2=h2('Three kinds'), kl=kl,
  c1=chip('%d in the app' % n_app, 'ok'), c2=chip('%d move in from Books and Payroll' % n_move, 'info'), c3=chip('%d to build' % n_build, 'neutral'),
  h3=h2('From Corelith, by area', '%d templates. Pay, People and Books ship to every workspace. Buying and Customers in retail wait on their sources: orders, bills, customers and accounts.' % len(d.T)), tt=tt)
H_T = 820 + len(rows) * 48
save(P, 'RiTemplates.dc.html', doc('Reports · Templates from Corelith', sheet('Templates from Corelith', 'The starting points every workspace gets. A template is a saved way of reading a report; a built report puts several together on one page. Nobody changes Corelith’s: they make it theirs.', inner), {}, 1440, H_T))
print('templates h', H_T)

# ---------------- Requirements ----------------
REQ = [
 ('Catalogue', [
  ('Reports is in the rail of every workspace, and shows when the person can read one report.', 'app'),
  ('One catalogue for every vertical. Retail uses the same pages in the Tender look, so its templates open instead of a 404.', 'change'),
  ('Tabs: All, From Corelith, Made by your team, Just yours, each with its count. “Built in” is renamed From Corelith.', 'change'),
  ('Grouped by area. The workspace’s own areas first, decided by its product (crm-sales and service-workshop too), not only its profile.', 'change'),
  ('Every template says what it shows in one line. No report definition sets a summary today, so that column is empty.', 'fix'),
  ('Books statements and payroll returns are listed under Books and Pay, and open in their module.', 'change'),
 ]),
 ('Running a report', [
  ('Dates, the report’s own choices, search, filters, group by and columns. All of it lives in the address, so a link opens the same view.', 'app'),
  ('The page above the table: figures, a bar chart, a trend, a breakdown. Managers arrange it for everyone.', 'app'),
  ('One row for each: roll up to product, day, till, cashier or class, with the count.', 'change'),
  ('At most 5,000 rows on screen, and the page says when it stopped.', 'app'),
  ('Selected rows show their sums, and can be exported on their own.', 'app'),
 ]),
 ('Templates', [
  ('Save as a template: name, what it shows, seen by (just me, managers, everyone), and keep the dates or not.', 'app'),
  ('Corelith templates never change. Make it yours copies one into Just yours.', 'app'),
  ('A shared template can be changed by its maker or a manager. The API says managers, the code allows only the owner role.', 'fix'),
  ('Opens and last opened are counted for every template, not only in retail, so Overview can show what is used.', 'change'),
 ]),
 ('Built reports', [
  ('Blocks: heading, text and question. A question is written in Steps or SQL and shown as a table, chart, figures or breakdown, full or half width.', 'app'),
  ('Queries run in the browser, read only, for 10 seconds and 50,000 rows at most.', 'app'),
  ('Edit opens the builder, the same one forms and documents use.', 'change'),
  ('Built reports export like any report.', 'build'),
 ]),
 ('Export and Send it', [
  ('PDF as Report, Register, Summary, Management pack or Record sheets; Excel workbook; CSV. All rows or the selected ones.', 'app'),
  ('Send it: to me or to people I choose, every day, week or month at a set time, as the PDF layout picked. Specified as INS-05 and INS-09, not built.', 'build'),
  ('Payroll returns export the P2 and the NSSA schedule. The buttons do nothing today.', 'fix'),
  ('Financial statements export as PDF and Excel.', 'build'),
 ]),
 ('Insights', [
  ('One shape for every topic: a headline written from the figures, four figures against the period before, one question with one chart, tables in tabs, and Do something about it.', 'change'),
  ('Periods: today, 7 days, 30 days, this month or a range, and every figure follows it. The CRM Team and source tabs ignore the period today.', 'fix'),
  ('Every action opens a real page. Nothing is sent or changed from an insight on its own.', 'app'),
  ('CRM activity tooltips read “undefined”: the page expects a label the API does not send.', 'fix'),
  ('Gold allocations is a work queue. It moves to Gold, and its status counts stop reading 0.', 'fix'),
 ]),
 ('Access', [
  ('A report shows if its module is on, the role may open its page, and the campus allows it.', 'app'),
  ('Managers switch reports off and set everyone’s starting view in Management → Reports.', 'app'),
  ('Cost and margin columns need the cost permission; without it they are not offered.', 'app'),
 ]),
 ('Vane', [
  ('Vane reads the reports the person can read, explains a figure and suggests a filter or a block. The person adds it. Vane never saves, shares or sends a report.', 'change'),
  ('Overview’s “How each module is doing” uses the module health already written in lib/dashboard (healthy, watch, critical). No screen uses it today.', 'build'),
 ]),
]
SC = {'app': ('In the app', 'ok'), 'change': ('Change', 'info'), 'fix': ('Fix', 'warn'), 'build': ('To build', 'neutral')}
n = 0; secs = []
counts = {}
for head, items in REQ:
    rs = []
    for text, st in items:
        n += 1; counts[st] = counts.get(st, 0) + 1
        rs.append(T('<div style="display: grid; grid-template-columns: 52px minmax(0, 1fr) 100px; gap: 14px; align-items: start; padding: 11px 0; border-bottom: 1px solid [[soft]];"><span style="font: 500 12.5px [[mono]]; color: [[muted]]; padding-top: 2px;">R[[n]]</span><span>[[t]]</span><span style="display: flex; justify-content: flex-end;">[[c]]</span></div>', n=n, t=text, c=chip(*SC[st])))
    secs.append(T('<section style="break-inside: avoid; margin-bottom: 26px;"><h2 style="margin: 0 0 8px; font-size: 15px; font-weight: 600;">[[h]]</h2><div style="border-top: 1px solid [[line]];">[[r]]</div></section>', h=head, r=''.join(rs)))
legend = ' '.join(chip('%d %s' % (counts.get(k, 0), SC[k][0].lower()), SC[k][1]) for k in ('app', 'change', 'fix', 'build'))
inner = T('<div style="display: flex; gap: 10px; flex-wrap: wrap; margin: -8px 0 28px;">[[l]]</div><div style="column-count: 2; column-gap: 48px;">[[s]]</div>', l=legend, s=''.join(secs))
save(P, 'RiRequirements.dc.html', doc('Reports · Requirements', sheet('Requirements', 'What Reports & Insights must do in every workspace. Each line says whether the app does it today, the design changes it, it is a bug to fix, or it is still to build.', inner), {}, 1440, 1700))
print('req', n, counts)
