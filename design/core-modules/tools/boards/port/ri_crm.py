import sys
sys.path.insert(0, 'gen2/port')
from ri_shared import *
P = sys.argv[1]
theme('corelith')

# 1 ---------- Overview
overview(P, 'PageReports.dc.html', 'Reports · Overview', 'crm', 'reports',
  'You won 52% of the deals you closed this quarter.', 'Up from 46%. Concrete subfloors still lose more often than timber, and 3 invoices are past their terms.',
  [('Sales', 'funnel', '$27,410.00', '+$3,120.00', 'up', 'weighted forecast', [19.2, 20.1, 21.4, 22.0, 23.8, 24.3, 27.41]),
   ('Site visits', 'calendar', '86', '+11', 'up', 'visits since July', [8, 10, 11, 12, 13, 15, 17]),
   ('Team', 'users', '55%', '+5 pts', 'up', 'best win rate, Tinashe', [44, 47, 50, 49, 52, 53, 55])],
  [('Deals', 'Sales and delivery', 'Corelith', 'Everyone', 'James, today', '41'),
   ('Measured to won', 'Sales and delivery', 'Corelith', 'Everyone', 'Rudo, yesterday', '18'),
   ('Accepted quotes by subfloor', 'Sales and delivery', 'James', 'Just James', 'James, 2 Oct', '12'),
   ('Fitter pay sheet', 'Pay', 'Rudo', 'Managers', 'Rudo, 28 Sep', '9'),
   ('Invoices', 'Sales and delivery', 'Corelith', 'Everyone', 'Rudo, 9 Oct', '8'),
   ('Spend and receipts', "Money in people’s hands", 'Corelith', 'Everyone', 'James, 6 Oct', '6')],
  [('Books', 'wallet', 'Watch', '3 invoices past their terms, $2,480.00'), ('Pay', 'receipt', 'Watch', 'October run in draft, 2 lines flagged'), ('People', 'user', 'Healthy', '9 working, 2 on leave next week'), ('Sales', 'funnel', 'Healthy', '37 deals open, $52,880.00')])

# 2 ---------- All reports
ALL_ROWS = [('__group__', 'Sales and delivery', '13', 'Your workspace’s own area')]
yours = {'Accepted quotes by subfloor'}
for t in d.tpl('sales'):
    ALL_ROWS.append([(t[1], 'link'), (t[4], 'muted'), (t[2], 'muted'), ('Corelith', 'chip', 'sel'), (t[7], 'chip'), ('—', 'faint') if t[1] not in ('Deals', 'Measured to won', 'Invoices') else ({'Deals': 'Today', 'Measured to won': 'Yesterday', 'Invoices': '9 Oct'}[t[1]], 'muted')])
ALL_ROWS.insert(3, [('Accepted quotes by subfloor', 'link'), ('Accepted quotes since July, by subfloor', 'muted'), ('Template', 'muted'), ('James', ''), ('Just James', 'chip'), ('2 Oct', 'muted')])
ALL_ROWS += [('__group__', "Money in people’s hands", '2', ''), ('__group__', 'Pay', '5', 'Fitter pay sheet, by Rudo'), ('__group__', 'People', '4', 'Visits this week by fitter, by James'), ('__group__', 'Books', '8', 'Open in Books')]
body = tabs(['All', 'From Corelith', 'Made by your team', 'Just yours'], 'All', counts=['34', '29', '3', '2']) + \
  params([('search', 'Template, or what it shows', 'plain'), ('grid4', 'Every area', 'menu'), ('user', 'Anyone', 'menu'), ('sort', 'Area, then name', 'menu')], '34 templates') + \
  table([('Template', 'minmax(0, 1.1fr)', 'l'), ('What it shows', 'minmax(0, 1.8fr)', 'l'), ('Kind', '84px', 'l'), ('Made by', '110px', 'l'), ('Seen by', '104px', 'l'), ('Last opened', '96px', 'l')], ALL_ROWS, rowh=38) + \
  pager('34 templates', T('<span>Collapsed areas open on a click</span>'))
save(P, 'PageReportsAll.dc.html', doc('Reports · All reports', frame('crm', 'reports', 'All reports', topbar('All reports', 'list'), body), {'actions': [{'label': 'New template', 'kind': 'secondary', 'glyph': 'fileCheck'}, {'label': 'Build a report', 'kind': 'primary', 'glyph': 'plus', 'kbd': 'N'}]}, 1440, 900))

# 3 ---------- A report: Deals
def deals_body(open_only=False, sel=False):
    if open_only:
        figs = [('Deals', '37', 'still open', ''), ('Value', '$52,880.00', 'if every one lands', ''), ('Weighted', '$27,410.00', 'by each stage’s odds', ''), ('Closing in October', '14', '$19,240.00', 'warn'), ('Oldest', '61 days', 'DL-0388, Pomona Offices', '')]
        outcome = 'Outcome is open'
    else:
        figs = [('Deals', '118', 'closing this year', ''), ('Value', '$164,320.00', 'all of them', ''), ('Won', '$71,204.50', '58 deals', 'up'), ('Open', '$52,880.00', '37 deals', ''), ('Lost', '$40,235.50', '23 deals', '')]
        outcome = 'Any outcome'
    top = T('        <div style="display: flex; align-items: center; gap: 8px; padding: 14px 28px 0; color: [[muted]]; font-size: 12.5px;">[[c]]<span>Deals closing this year, by stage, with their value and outcome</span></div>\n', c=chip('From Corelith', 'sel'))
    p = params([('calendar', 'Closing 1 Jan to 31 Dec 2026', 'on'), ('funnel', outcome, 'on' if open_only else 'menu'), ('user', 'Every owner', 'menu'), ('', '', 'sep'), ('search', 'Search', 'plain'), ('sliders', 'Filters' + (' 1' if open_only else ''), 'plain'), ('rows', 'Group by: Stage', 'on'), ('columns', 'Columns', 'plain')], 'As of 11:48')
    charts = grid2(bars('Open value, by stage', [('Qualified', '$8,940.00', 8940 / 19480), ('Site visit', '$12,600.00', 12600 / 19480), ('Quoted', '$19,480.00', 1, 'hi'), ('Negotiating', '$11,860.00', 11860 / 19480)], 'sum of Value'),
                   trend('Value, by expected close', [6.2, 8.1, 9.4, 11.0, 12.6, 10.8, 14.9, 16.2, 15.4, 19.2, 13.1, 9.6], ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'], 'by month, $ thousands'))
    S = lambda st: ('Open', 'chip', 'info')
    rows = [('__group__', 'Negotiating', '6', '$11,860.00')]
    for r in [('DL-0412', 'Clinic, 3 rooms, vinyl', 'Borrowdale Brooke Clinic', 'Farai', '$3,420.00', '24 Oct'), ('DL-0409', 'Offices, carpet tiles', 'Pomona Offices', 'Tinashe', '$2,980.00', '18 Oct'), ('DL-0405', 'Showroom floor, epoxy', 'Msasa Motors', 'Kuda', '$2,140.00', '31 Oct'), ('DL-0401', 'Lounge and passage, oak', 'Mr and Mrs Chari', 'Tinashe', '$1,284.00', '15 Oct')]:
        rows.append({'sel': sel and r[0] in ('DL-0412', 'DL-0409', 'DL-0405'), 'cells': [(r[0], 'code'), (r[1], 'lead'), r[2], (r[3], 'muted'), (r[4], 'strong'), (r[5], 'muted'), S(0)]})
    rows.append(('__group__', 'Quoted', '11', '$19,480.00'))
    for r in [('DL-0418', 'Guest rooms, laminate', 'Highlands Guest Lodge', 'Kuda', '$4,860.00', '30 Nov'), ('DL-0416', 'Surgery, sheet vinyl', 'Chisipite Dental', 'Farai', '$2,215.00', '6 Nov'), ('DL-0414', 'Bedrooms, timber', 'Dr N. Sibanda', 'Tinashe', '$1,940.00', '20 Oct')]:
        rows.append([(r[0], 'code'), (r[1], 'lead'), r[2], (r[3], 'muted'), (r[4], 'strong'), (r[5], 'muted'), S(0)])
    tb = table([('Deal', '84px', 'l'), ('Title', 'minmax(0, 1.2fr)', 'l'), ('Customer', 'minmax(0, 1fr)', 'l'), ('Owner', '90px', 'l'), ('Value', '110px', 'r'), ('Expected close', '110px', 'l'), ('Outcome', '86px', 'l')], rows, rowh=38)
    sums = T('<span>Value <b style="font: 600 13px [[mono]]; color: [[ink]];">[[v]]</b></span>', v='$52,880.00' if open_only else '$164,320.00')
    if sel:
        sums = T('<span style="color: [[ink]]; font-weight: 600;">3 selected</span><span>Value <b style="font: 600 13px [[mono]]; color: [[ink]];">$8,540.00</b></span>')
    return top + p + tiles(figs) + charts + tb + pager('1 to ' + ('37' if open_only else '118') + ', grouped by stage', sums)

DEAL_ACTIONS = [{'label': 'Save as a template', 'kind': 'secondary', 'glyph': 'fileCheck'}, {'label': 'Send it', 'kind': 'secondary', 'glyph': 'clock'}, {'label': 'Export', 'kind': 'primary', 'glyph': 'download', 'kbd': 'E'}]
save(P, 'PageReport.dc.html', doc('Reports · Deals', frame('crm', 'reports', 'Sales and delivery', topbar('Deals', 'funnel'), deals_body(), h=1040), {'actions': DEAL_ACTIONS}, 1440, 1040))

# 4 ---------- Save as a template
inner = field('Name', 'Open deals, by stage') + field('What it shows', 'Deals still open this year, grouped by the stage they sit in', 'Shown under the name in All reports.') + \
  radios('Seen by', [('Just me', 'Only you see it, in Just yours.'), ('Managers', 'James, Rudo and you.'), ('Everyone', 'Everyone who can open Deals.')], 'Managers') + \
  switch_row('Keep the dates', 'Opens on 1 Jan to 31 Dec 2026. Off: it opens on this year, whatever the year.', False) + \
  T('<div style="display: flex; flex-direction: column; gap: 6px;">[[l]][[kv]]</div>', l=label('It keeps'), kv=kv([('Narrowed by', 'Outcome is open'), ('Grouped by', 'Stage'), ('Columns', '7 of 12'), ('Sorted by', 'Expected close, soonest'), ('Page', 'Figures, 2 charts, the table')]))
foot = btn('Cancel') + primary_k('Save the template', 'Ctrl ↵')
save(P, 'PageReportSave.dc.html', doc('Reports · Save as a template', frame('crm', 'reports', 'Sales and delivery', topbar('Deals', 'funnel'), deals_body(open_only=True), overlay=sheet('Save as a template', 'A saved way of reading Deals. Deals itself does not change.', inner, foot), h=1040), {'actions': DEAL_ACTIONS}, 1440, 1040))

# 5 ---------- Export
def seg3(opts, on):
    return T('<div role="group" style="display: flex; padding: 2px; border-radius: 8px; background: [[tray]];">[[x]]</div>', x=''.join(T('<button type="button" style="flex: 1 1 0; height: 30px; border: 0; border-radius: 6px; background: [[bg]]; box-shadow: [[sh]]; color: [[col]]; font: [[w]] 13px/1 [[sans]];">[[l]]</button>', bg='#ffffff' if o == on else 'transparent', sh=('0 0 0 1px ' + C['line']) if o == on else 'none', col=C['ink'] if o == on else C['muted'], w=600 if o == on else 500, l=o) for o in opts))
def exp_tabs(on):
    return T('<div role="tablist" style="display: flex; gap: 20px; margin: -18px -22px 0; padding: 0 22px; border-bottom: 1px solid [[line]];">[[x]]</div>', x=''.join(T('<button type="button" role="tab" style="height: 42px; border: 0; background: transparent; padding: 0; box-shadow: [[sh]]; color: [[c]]; font: [[w]] 13.5px/1 [[sans]];">[[l]]</button>', sh=('inset 0 -2px 0 ' + C['ink']) if l == on else 'none', c=C['ink'] if l == on else C['muted'], w=600 if l == on else 500, l=l) for l in ('Download', 'Send it')))
inner = exp_tabs('Download') + T('<div style="display: flex; flex-direction: column; gap: 6px;"><span style="font-weight: 500;">As</span>[[s]]</div>', s=seg3(['PDF', 'Excel workbook', 'CSV'], 'PDF')) + \
  radios('Layout', [('Report', 'The page as you see it: figures, charts, then the table.'), ('Register', 'What it is narrowed by, then every row. Landscape.'), ('Summary', 'Key figures and a breakdown by stage. One page.'), ('Management pack', 'Figures, breakdown, the 10 largest, then every row.'), ('Record sheets', 'One block per deal, every field. Up to 300.')], 'Report') + \
  radios('Rows', [('The 3 selected', 'DL-0412, DL-0409 and DL-0405, $8,540.00'), ('All 118 rows', 'Grouped by stage, as on screen')], 'The 3 selected') + \
  field('Paper', 'Floorcode letterhead', 'The document template from Build. Change it there.', menu=True)
save(P, 'PageReportExport.dc.html', doc('Reports · Export', frame('crm', 'reports', 'Sales and delivery', topbar('Deals', 'funnel'), deals_body(sel=True), overlay=sheet('Export Deals', 'Closing 1 Jan to 31 Dec 2026, grouped by stage.', inner, btn('Cancel') + primary_k('Download', 'Ctrl ↵')), h=1040), {'actions': DEAL_ACTIONS}, 1440, 1040))

inner = exp_tabs('Send it') + \
  T('<div style="display: flex; flex-direction: column; gap: 6px;"><span style="font-weight: 500;">How often</span>[[s]]</div>', s=seg3(['Every day', 'Every week', 'Every month'], 'Every week')) + \
  T('<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">[[a]][[b]]</div>', a=field('On', 'Monday', menu=True), b=field('At', '07:00', mono=True, menu=True)) + \
  field('To', 'James Moyo, Rudo Chikore', 'People in this workspace who can open Deals. Nobody outside it.', menu=True) + \
  field('As', 'PDF, Summary', menu=True) + \
  switch_row('Only when something changed', 'Skip the week if no deal moved.', True) + \
  T('<div style="padding: 12px 14px; border-radius: 8px; background: [[ground]]; color: [[ink2]];">The first goes on Monday 12 October at 07:00. Dates move with it: each one reads the year so far.</div>')
save(P, 'PageReportSend.dc.html', doc('Reports · Send it', frame('crm', 'reports', 'Sales and delivery', topbar('Deals', 'funnel'), deals_body(), overlay=sheet('Send Deals', 'Grouped by stage, every owner.', inner, btn('Cancel') + primary_k('Start sending', 'Ctrl ↵')), h=1040), {'actions': DEAL_ACTIONS}, 1440, 1040))

# 6 ---------- Arrange the page (in the builder)
def studio(fname, title, bar, outline, canvas, insp, vals=None, h=900):
    attrs = ' '.join('%s="%s"' % (k, v) for k, v in bar.items())
    inner = T('''<div style="min-height: [[h]]px; display: flex; flex-direction: column; background: #ffffff; color: [[ink]]; font: 400 13.5px/1.4 [[sans]];">
  <dc-import name="StudioBar" [[a]] hint-size="100%,52px"></dc-import>
  <div style="flex: 1 1 auto; min-height: [[h2]]px; display: flex;">
    <div class="cm-panel" style="flex: none; display: flex;"><dc-import name="StudioOutline" title="[[ot]]" addLabel="Add a block" groups="{{outline}}" height="[[h2]]" hint-size="240px,[[h2]]px"></dc-import></div>
    <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; background: [[ground]]; padding: 28px 32px; box-sizing: border-box;">
      <div style="background: #ffffff; border: 1px solid [[line]]; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">[[c]]</div>
    </div>
    <aside class="cm-insp" style="flex: none; width: 320px; box-sizing: border-box; border-left: 1px solid [[line]]; display: flex; flex-direction: column;">[[i]]</aside>
  </div>
</div>''', h=h, h2=h - 52, a=attrs, ot=outline[0], c=canvas, i=insp)
    v = {'outline': outline[1]}
    v.update(vals or {})
    save(P, fname, doc(title, inner, v, 1440, h))

def insp_tabs(names, on):
    return T('<div role="tablist" style="height: 48px; flex: none; display: flex; align-items: stretch; gap: 20px; padding: 0 22px; border-bottom: 1px solid [[line]];">[[x]]</div>', x=''.join(T('<button type="button" role="tab" style="border: 0; background: transparent; padding: 0; box-shadow: [[sh]]; color: [[c]]; font: [[w]] 13px/1 [[sans]];">[[l]]</button>', sh=('inset 0 -2px 0 ' + C['ink']) if n == on else 'none', c=C['ink'] if n == on else C['muted'], w=600 if n == on else 500, l=n) for n in names))
def selwrap(html, tag):
    return T('<div style="position: relative; margin: 6px; border: 2px solid [[acc]]; border-radius: 8px;"><span style="position: absolute; top: -12px; left: 10px; height: 22px; display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; border-radius: 5px; background: [[acc]]; color: #ffffff; font-size: 12.5px; font-weight: 500;">[[t]]</span>[[h]]</div>', t=tag, h=html)

arr_canvas = tiles([('Deals', '118', 'closing this year'), ('Value', '$164,320.00', 'all of them'), ('Won', '$71,204.50', '58 deals', 'up'), ('Open', '$52,880.00', '37 deals')]) + \
  T('<div class="cm-grid2" style="display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid [[line]];"><div style="border-right: 1px solid [[line]];">[[a]]</div><div>[[b]]</div></div>', a=selwrap(bars('Open value, by stage', [('Qualified', '$8,940.00', 8940 / 19480), ('Site visit', '$12,600.00', 12600 / 19480), ('Quoted', '$19,480.00', 1, 'hi'), ('Negotiating', '$11,860.00', 11860 / 19480)], pad='18px 20px 16px'), 'Bar chart'),
    b=trend('Value, by expected close', [6.2, 8.1, 9.4, 11.0, 12.6, 10.8, 14.9, 16.2, 15.4, 19.2, 13.1, 9.6], ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'], pad='18px 20px 16px', width=420)) + \
  table([('Deal', '84px', 'l'), ('Title', 'minmax(0, 1fr)', 'l'), ('Owner', '90px', 'l'), ('Value', '110px', 'r')], [[('DL-0412', 'code'), ('Clinic, 3 rooms, vinyl', 'lead'), ('Farai', 'muted'), '$3,420.00'], [('DL-0409', 'code'), ('Offices, carpet tiles', 'lead'), ('Tinashe', 'muted'), '$2,980.00'], [('DL-0405', 'code'), ('Showroom floor, epoxy', 'lead'), ('Kuda', 'muted'), '$2,140.00']], pad='0 20px', rowh=36)
arr_insp = insp_tabs(['Block', 'Page'], 'Block') + T('<div style="padding: 18px 22px; display: flex; flex-direction: column; gap: 16px;"><h2 style="margin: 0; font-size: 15px; font-weight: 600;">Bar chart</h2>[[a]][[b]][[c]][[d2]][[e]][[f]]</div>',
  a=field('Title', 'Open value, by stage'), b=field('One bar for each', 'Stage', menu=True), c=field('Measure', 'Sum of Value', menu=True), d2=field('Show at most', '10 bars, the rest as Other', mono=False, menu=True), e=switch_row('Half width', 'Sits beside the next block.', True), f=T('<span style="color: [[muted]]; font-size: 12.5px;">Charts have one colour and no legend, on screen and in the PDF.</span>'))
studio('PageReportArrange.dc.html', 'Reports · Arrange the page', {'name': 'Deals', 'sub': 'Arranging the page, for everyone', 'markGlyph': 'funnel', 'markBg': '#2563eb', 'saved': 'Not saved', 'extraButton': 'Discard'},
  ('Blocks', [{'head': 'The page', 'items': [{'label': 'Headline figures', 'glyph': 'hash'}, {'label': 'Open value, by stage', 'glyph': 'barChart', 'on': True}, {'label': 'Value, by expected close', 'glyph': 'chartLine'}, {'label': 'The table', 'glyph': 'table'}]}, {'head': 'Add', 'items': [{'label': 'Breakdown', 'glyph': 'list'}, {'label': 'Heading', 'glyph': 'text'}, {'label': 'Text', 'glyph': 'text'}]}]),
  arr_canvas, arr_insp)

# 7 ---------- A built report from Corelith
MONTHS = [('Apr', 312.4), ('May', 598.0), ('Jun', 641.2), ('Jul', 702.8), ('Aug', 655.3), ('Sep', 734.9), ('Oct', 268.0)]
mx = max(v for _, v in MONTHS)
built = T('        <div style="display: flex; align-items: center; gap: 10px; padding: 16px 28px; border-bottom: 1px solid [[line]];">[[c]]<span style="color: [[ink2]];">Square metres measured each month, and how much was won. Reads Site visit forms and Deals.</span><span style="margin-left: auto;">[[d]]</span></div>\n', c=chip('From Corelith', 'sel'), d=chipbtn('calendar', 'Last 180 days, 14 Apr to 11 Oct', 'on')) + \
  tiles([('Visits', '96', 'with a form filled'), ('Measured', '3,912.6 m²', '40.8 m² a visit'), ('Quotes drafted', '84', 'from 96 visits'), ('Won', '1,957.4 m²', '50% of what was measured', 'up')]) + \
  grid2(bars('Measured, by month', [(m, '{:,.1f} m²'.format(v), v / mx, 'hi' if m == 'Sep' else '') for m, v in MONTHS], 'sum of Area measured', w_label='60px'),
        T('<section style="padding: 18px 28px; display: flex; flex-direction: column; gap: 10px;"><h3 style="margin: 0; font-size: 14px; font-weight: 600;">Reading it</h3><p style="margin: 0; color: [[ink2]];">September measured the most, 734.9 m². October is 11 days in.</p><p style="margin: 0; color: [[ink2]];">Farai wins the largest share of what he measures, 57%. Kuda wins 42%.</p><span style="font-size: 12.5px; color: [[muted]];">A text block. Corelith wrote it; your copy can say anything.</span></section>')) + \
  T('        <div style="padding: 18px 28px 10px; font-size: 14px; font-weight: 600; border-top: 1px solid [[line]];">By rep</div>\n') + \
  table([('Rep', 'minmax(0, 1fr)', 'l'), ('Visits', '80px', 'r'), ('Measured', '120px', 'r'), ('Quotes', '80px', 'r'), ('Jobs won', '90px', 'r'), ('Won', '120px', 'r'), ('Share won', '100px', 'r')],
        [[('Tinashe', 'lead'), '38', '1,402.6 m²', '33', '18', '701.3 m²', '50%'], [('Kuda', 'lead'), '31', '1,206.4 m²', '27', '13', '512.0 m²', '42%'], [('Farai', 'lead'), '27', '1,303.6 m²', '24', '14', '744.1 m²', ('57%', 'ok')]],
        totals=['Total', '96', '3,912.6 m²', '84', '45', '1,957.4 m²', '50%'])
save(P, 'PageBuiltReport.dc.html', doc('Reports · Measured to won', frame('crm', 'reports', 'Sales and delivery', topbar('Measured to won', 'barChart'), built), {'actions': [{'label': 'Export', 'kind': 'secondary', 'glyph': 'download'}, {'label': 'Make it yours', 'kind': 'primary', 'glyph': 'copy', 'kbd': 'M'}]}, 1440, 900))

# 8 ---------- Your copy, in the builder: the query
SQL = '''select date_trunc('month', visited) as month,
       sum(area_measured_m2) as measured
from crm_visit_forms
where visited between period_start() and period_end()
group by 1
order by 1'''
q_canvas = T('        <div style="display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid [[line]];"><span style="font-size: 17px; font-weight: 600;">Measured to won</span>[[c]]<span style="margin-left: auto;">[[d]]</span></div>', c=chip('Just yours'), d=chipbtn('calendar', 'Last 180 days', 'menu')) + \
  tiles([('Visits', '96', ''), ('Measured', '3,912.6 m²', ''), ('Quotes drafted', '84', ''), ('Won', '1,957.4 m²', '')]) + \
  T('<div class="cm-grid2" style="display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid [[line]];"><div style="border-right: 1px solid [[line]];">[[a]]</div><div>[[b]]</div></div>',
    a=selwrap(bars('Measured, by month', [(m, '{:,.1f}'.format(v), v / mx, '') for m, v in MONTHS], w_label='40px', pad='18px 18px 14px'), 'measured · Question'),
    b=T('<div style="margin: 14px; padding: 14px; border: 1px dashed [[strong]]; border-radius: 10px; display: flex; flex-direction: column; gap: 8px;"><span style="display: flex; align-items: center; gap: 8px; font-weight: 600;">[[vm]]Vane suggests a block</span><span style="color: [[ink2]];">Won m², by month, beside it. Reads Site visit forms joined to Deals that were won.</span><span style="display: flex; gap: 8px;">[[b1]][[b2]]</span><span style="font-size: 12.5px; color: [[muted]];">Nothing is added until you add it.</span></div>', vm=VANE_MARK(), b1=btn('Add the block', 'plus', small=True), b2=btn('Show the question', 'eye', small=True)))
steps = ''.join(T('<div style="display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 10px; align-items: center; min-height: 36px; border-bottom: 1px solid [[soft]];"><span style="color: [[muted]];">[[k]]</span><span style="font-weight: 500;">[[v]]</span></div>', k=k, v=v) for k, v in [('From', 'Site visit forms'), ('Where', 'Visited is in the dates'), ('One row for', 'Month of Visited'), ('Measure', 'Sum of Area measured (m²)'), ('Sort', 'Month, oldest first')])
q_insp = insp_tabs(['Question', 'Show as', 'Size'], 'Question') + T('''<div style="padding: 18px 22px; display: flex; flex-direction: column; gap: 14px;">
  <div style="display: flex; align-items: center; gap: 8px;"><h2 style="margin: 0; font-size: 15px; font-weight: 600;">measured</h2><span style="font-size: 12.5px; color: [[muted]];">other blocks read it as @measured</span></div>
  <div role="group" style="display: flex; padding: 2px; border-radius: 8px; background: [[tray]];"><button type="button" style="flex: 1; height: 28px; border: 0; border-radius: 6px; background: #ffffff; box-shadow: 0 0 0 1px [[line]]; font: 600 13px [[sans]]; color: [[ink]];">Steps</button><button type="button" style="flex: 1; height: 28px; border: 0; background: transparent; font: 500 13px [[sans]]; color: [[muted]];">SQL</button></div>
  <div style="border-top: 1px solid [[line]];">[[steps]]</div>
  <span style="font-weight: 500;">The SQL these steps write</span>
  <pre style="margin: 0; padding: 12px; border-radius: 8px; background: [[ground]]; border: 1px solid [[line]]; font: 12px/1.55 [[mono]]; color: [[ink2]]; white-space: pre-wrap;">[[sql]]</pre>
  <span style="font-size: 12.5px; color: [[muted]];">7 rows in 0.2 s. Runs in your browser, read only.</span>
</div>''', steps=steps, sql=SQL)
studio('PageReportBuild.dc.html', 'Reports · Your copy, in the builder', {'name': 'Measured to won', 'sub': 'Built report · Just yours', 'markGlyph': 'barChart', 'markBg': '#2563eb', 'saved': 'Saved'},
  ('Blocks', [{'head': 'The page', 'items': [{'label': 'Figures', 'glyph': 'hash'}, {'label': 'measured', 'glyph': 'barChart', 'on': True}, {'label': 'Reading it', 'glyph': 'text'}, {'label': 'By rep', 'glyph': 'table'}]}, {'head': 'Reports it can read', 'items': [{'label': 'crm_visit_forms', 'glyph': 'table'}, {'label': 'crm_deals', 'glyph': 'table'}, {'label': 'crm_quotes', 'glyph': 'table'}, {'label': 'crm_invoices', 'glyph': 'table'}]}]),
  q_canvas, q_insp)

# 9 ---------- Insights: Sales
FUN = [('Lead', '74', '', '—', False), ('Site visit', '58', '78%', '3', False), ('Quoted', '49', '84%', '2', False), ('Negotiating', '33', '67%', '6', True), ('Won', '26', '79%', '8', False)]
body = periods('90 days', [('user', 'Every owner', 'menu')], '12 Jul to 11 Oct, against the 90 days before', opts=('7 days', '30 days', '90 days', '12 months')) + \
  finding('You won 52% of the deals you closed this quarter, up from 46%.', 'Deals are lost after the quote: 16 of 49 quoted deals never reached negotiating.') + \
  tiles([('Win rate', '52%', 'was 46%', 'up'), ('Weighted forecast', '$27,410.00', '37 deals', ''), ('Typical cycle', '19 days', 'was 23', 'up'), ('Leads', '74', '31 became deals', '')]) + \
  T('        <div style="padding: 20px 28px 4px; display: flex; align-items: baseline; gap: 10px;"><h3 style="margin: 0; font-size: 14px; font-weight: 600;">Where do deals drop out?</h3><span style="font-size: 12.5px; color: [[muted]];">Negotiating loses the most: 1 in 3</span></div>\n') + funnel(FUN) + \
  tabs(['By owner', 'By source', 'Team', 'Channels'], 'By owner') + \
  table([('Owner', 'minmax(0, 1fr)', 'l'), ('Won', '70px', 'r'), ('Lost', '70px', 'r'), ('Open', '70px', 'r'), ('Win rate', '90px', 'r'), ('Value won', '120px', 'r'), ('Share', '80px', 'r')],
        [[('Tinashe', 'link'), '11', '9', '14', '55%', '$9,416.00', '36%'], [('Farai', 'link'), '7', '7', '11', '50%', '$9,150.00', '35%'], [('Kuda', 'link'), '8', '8', '12', '50%', '$7,544.00', '29%']],
        totals=['Total', '26', '24', '37', '52%', '$26,110.00', '100%'])
ins_aside = insight_aside([('16 quotes have had no reply for 7 days', 'Most were sent by Kuda. A call this week moves them on.', 'Open the quotes'),
                           ('Negotiating loses 1 deal in 3', 'Look at the 11 that went cold there since July.', 'See those deals'),
                           ('Subfloor is skipped on 1 visit in 5', 'Quotes without it are won less often.', 'Open Site visits')])
save(P, 'PageInsights.dc.html', doc('Reports · Insights · Sales', frame('crm', 'reports', 'Sales', topbar('Sales', 'funnel'), body, ins_aside, h=960), {'actions': [{'label': 'Open Deals', 'kind': 'secondary', 'glyph': 'table'}]}, 1440, 960))

# 10 ---------- Insights: Site visits
QS = [('Room areas', 100), ('Subfloor', 79), ('Moisture reading', 64), ('Skirting wanted', 92), ('Doorways', 88), ("Customer’s budget", 58), ('Access and parking', 71), ('Photo of the room', 83)]
body = periods('90 days', [('clipboard', 'Form: Floor site visit', 'on'), ('user', 'Every rep', 'menu')], 'Since 1 July', opts=('30 days', '90 days', '12 months')) + \
  finding('86 visits drafted 71 quotes and 42 wins since July.', 'Reps skip Subfloor on 1 visit in 5, and those quotes are won a third of the time.') + \
  tiles([('Measured a visit', '32.5 m²', 'typical'), ('Quote drafted', '$1,180.00', 'typical'), ('Visits that drafted a quote', '83%', '71 of 86'), ('Won', '49%', '42 of 86', 'up')]) + \
  grid2(bars('Where reps stop answering', [(q, '%d%%' % v, v / 100, 'warn' if v < 80 and q in ('Subfloor', "Customer’s budget") else '') for q, v in QS], 'answered, of visits asked', w_label='150px'),
        T('<section style="padding: 18px 28px; display: flex; flex-direction: column; gap: 8px;"><h3 style="margin: 0 0 6px; font-size: 14px; font-weight: 600;">What is won, by Subfloor</h3>[[t]]</section>', t=table([('Answer', 'minmax(0, 1fr)', 'l'), ('Visits', '56px', 'r'), ('Won', '50px', 'r'), ('Win rate', '70px', 'r'), ('m² a visit', '80px', 'r')],
          [[('Concrete', 'lead'), '46', '24', '52%', '31.2'], [('Timber boards', 'lead'), '18', '10', ('56%', 'ok'), '35.8'], [('Existing tiles', 'lead'), '4', '2', '50%', '28.0'], [('Not answered', 'muted'), '18', '6', ('33%', 'bad'), '33.1']], pad='0', rowh=36, totals=['Total', '86', '42', '49%', '32.5'])))
v_aside = insight_aside([('Make Subfloor required', 'Quotes without it are won 33% of the time, against 53% with it. 11 of the 18 notes say screed, which is not an option.', 'Open the form'),
                         ("Customer’s budget is answered on 58%", 'Quotes with a budget answered are won 61% of the time.', 'See those visits'),
                         ('9 visits never drafted a quote', 'Kuda has 5 of them, all this month.', 'Open the visits')])
save(P, 'PageInsightVisits.dc.html', doc('Reports · Insights · Site visits', frame('crm', 'reports', 'Site visits', topbar('Site visits', 'calendar'), body, v_aside), {'actions': [{'label': 'Open Site visit forms', 'kind': 'secondary', 'glyph': 'table'}]}, 1440, 900))

# 11 ---------- Management → Reports
REG = [('Deals', 'Sales and delivery', 'On', 'Arranged here', True), ('Leads', 'Sales and delivery', 'On', 'Its own', False), ('Site visits', 'Sales and delivery', 'On', 'Its own', False), ('Site visit forms', 'Sales and delivery', 'On', 'Its own', False), ('Site visit answers', 'Sales and delivery', 'Off', 'Its own', False), ('Quotes', 'Sales and delivery', 'On', 'Its own', False), ('Projects', 'Sales and delivery', 'Off', 'Its own', False), ('Jobs', 'Sales and delivery', 'On', 'Its own', False), ('Invoices', 'Sales and delivery', 'On', 'Arranged here', False), ('Requisitions', "Money in people’s hands", 'On', 'Its own', False), ('Spend and receipts', "Money in people’s hands", 'On', 'Its own', False), ('Pay by employee', 'Pay', 'On', 'Its own', False), ('Employees', 'People', 'On', 'Its own', False), ('Leave', 'People', 'On', 'Its own', False)]
rows = [{'sel': r[4], 'cells': [(r[0], 'lead'), (r[1], 'muted'), (r[3], 'muted'), (r[2], 'chip', 'ok' if r[2] == 'On' else 'neutral')]} for r in REG]
body = params([('search', 'Report or area', 'plain'), ('grid4', 'Every area', 'menu'), ('check', 'Offered and not', 'menu')], '14 reports · 2 off') + \
  table([('Report', 'minmax(0, 1fr)', 'l'), ('Area', 'minmax(0, 1fr)', 'l'), ('Page', '120px', 'l'), ('Offered', '80px', 'l')], rows, rowh=38)
det = T('<div style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 17px; font-weight: 600;">Deals</span><span style="margin-left: auto;">[[b]]</span></div>', b=btn('Open the report', 'external', small=True)) + \
  switch_row('Offered', 'Off: nobody here sees Deals in Reports. Its page in Pipeline stays.', True) + \
  kv([('Area', 'Sales and delivery'), ('Reads', 'crm-deals'), ('Who can open it', 'Anyone who can open Pipeline')]) + \
  T('<div style="display: flex; flex-direction: column; gap: 8px; padding-top: 6px;">[[l]]<span>Arranged for this workspace, 2 Oct</span><span style="display: flex; gap: 8px;">[[b1]][[b2]]</span></div>', l=label('Page'), b1=btn('Arrange the page', 'grid4', small=True), b2=btn('Go back to its own', None, small=True)) + \
  T('<div style="display: flex; flex-direction: column; gap: 8px; padding-top: 6px;">[[l]]<span>Grouped by stage, closing this year</span><span>[[b]]</span></div>', l=label('Starting view for everyone'), b=btn('Clear the starting view', None, small=True)) + \
  T('<div style="display: flex; flex-direction: column; gap: 6px; padding-top: 6px;">[[l]][[kv]]</div>', l=label('Activity'), kv=kv([('James arranged the page', '2 Oct'), ('James set the starting view', '2 Oct'), ('Rudo switched Projects off', '14 Sep')]))
save(P, 'PageReportsSettings.dc.html', doc('Management · Reports', mgmt_frame('Reports', topbar('Reports', 'barChart', ' search="{{no}}" vane="{{no}}"'), finding('12 of 14 reports are offered here.', 'Site visit answers and Projects are off. Deals and Invoices have pages arranged for Floorcode.') + body, aside(det, 400)), {'no': False, 'actions': []}, 1440, 900))
print('crm done')
