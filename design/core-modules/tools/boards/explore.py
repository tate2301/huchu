import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import *
ROOT = sys.argv[1]

TABLES = [
    ('CRM', '<img src="%s" alt="" width="16" height="16" class="pm">' % MARK['flare-mark.svg'],
     [('customers', '212'), ('deals', '96'), ('site_visits', '86'), ('quotes', '71'), ('quote_lines', '412')]),
    ('Books', ic('books'), [('invoices', '142'), ('payments', '131'), ('bank_lines', '618')]),
    ('Tender', '<img src="%s" alt="" width="16" height="16" class="pm">' % MARK['tender-mark.svg'],
     [('sales', '4,210'), ('sale_lines', '11,384'), ('cash_ups', '214'), ('products', '148')]),
    ('People', ic('person'), [('staff', '9'), ('pay_runs', '12'), ('leave', '64')]),
]
COLS = {'site_visits': ['id · customer_id · fitter_id', 'visited_on · area_m2 · subfloor', 'quote_id · state'],
        'invoices': ['id · number · customer_id', 'issued_on · due_on · total', 'balance · state']}

def ex_nav(tab='Your data', open_t=None, locked=(), dim=False, body=None):
    tabs = ''.join('<button role="tab" aria-selected="%s">%s</button>' % ('true' if t == tab else 'false', t) for t in ('Your data', 'Templates', 'Saved'))
    if body is None:
        body = ''
        for prod, mark, ts in TABLES:
            body += '<div class="ex-prod">%s<span>%s</span></div>' % (mark, prod)
            for t, n in ts:
                if t in locked:
                    body += '<div class="ex-t is-locked" title="Only People managers read %s">%s<span>%s</span><span class="n">%s</span></div>' % (t, ic('lock'), t, 'People managers')
                    continue
                body += '<div class="ex-t%s">%s<span>%s</span><span class="n">%s</span></div>' % (' is-on' if t == open_t else '', ic('tablegrid'), t, n)
                if t == open_t:
                    body += '<div class="ex-cols">%s</div>' % '<br>'.join(COLS.get(t, []))
    return ('<aside class="ex-nav"%s aria-label="Explore"><div class="pm-h"><b>Explore</b>%s</div>'
            '<div class="seg ex-tabs" role="tablist" aria-label="Show">%s</div>'
            '<label class="input-wrap pm-find">%s<input type="search" aria-label="Search tables and columns" placeholder="Search tables and columns"></label>'
            '<div class="ex-body">%s</div></aside>') % (' style="opacity:.45"' if dim else '', iconbtn('panel', 'Hide the panel'), tabs, ic('search'), body)

SQL = [
    '<span class="k">select</span> v.visited_on, c.name <span class="k">as</span> customer, s.name <span class="k">as</span> fitter,',
    '       v.area_m2, q.total, coalesce(q.state, <span class="s">\'no quote\'</span>) <span class="k">as</span> state,',
    '       current_date - v.visited_on <span class="k">as</span> days_since',
    '<span class="k">from</span> site_visits v',
    '<span class="k">join</span> customers c <span class="k">on</span> c.id = v.customer_id',
    '<span class="k">join</span> staff s <span class="k">on</span> s.id = v.fitter_id',
    '<span class="k">left join</span> quotes q <span class="k">on</span> q.site_visit_id = v.id',
    '<span class="k">where</span> v.visited_on &gt;= <span class="p">:since</span>',
    '  <span class="k">and</span> (q.state <span class="k">is null or</span> q.state &lt;&gt; <span class="s">\'accepted\'</span>)',
    '<span class="k">order by</span> q.total <span class="k">desc nulls last</span>;',
]
STEPS = [('tablegrid', 'Start from', 'site_visits since 1 September'), ('link', 'Bring in', 'the customer, the fitter and the quote'),
         ('filter', 'Keep', 'visits with no quote, or a quote not accepted'), ('sort', 'Sort', 'by quote total, biggest first')]

def sql_block(lines):
    return '<div class="sql">%s</div>' % ''.join('<span class="l">%s</span>' % l for l in lines)

def ex_top(title, right):
    return '<header class="ex-top"><h1>%s%s</h1><div class="tb-r">%s</div></header>' % (ic('search'), title, right)

def ex_top_std(title='Open quotes since September'):
    return ex_top(title, iconbtn('bell', 'Notifications') + vane_btn(3) + btn('Schedule', 'clock') + btn('Share', 'share') + btn('Save', 'check', 'btn btn-primary', 'Ctrl S'))

def ask_bar(text, mode='Change this'):
    seg = ''.join('<button role="tab" aria-selected="%s">%s</button>' % ('true' if m == mode else 'false', m) for m in ('New question', 'Change this'))
    return ('<div class="ex-ask">%s<label class="input-wrap">%s<input aria-label="Ask in plain words" value="%s"></label>'
            '<div class="seg" role="tablist" aria-label="This asks">%s</div>%s</div>') % (vmark(28), ic('sentence'), text, seg, btn('Ask', 'upload'))

def editor(steps=STEPS, sql=SQL, param=':since = 2026-09-01', sql_head='SQL, read only'):
    st = ''.join('<li>%s<span><b>%s</b> %s</span></li>' % (ic(i), a, b) for i, a, b in steps)
    return ('<div class="ex-edit"><div class="ex-steps"><div class="ex-h"><span>Steps</span><span>Change either side; the other follows</span></div><ol>%s</ol></div>'
            '<div class="ex-sql"><div class="ex-h"><span class="guard">%s%s</span><span class="mono">%s</span></div>%s</div></div>') % (st, ic('lock'), sql_head, param, sql_block(sql))

ROWS = [('Tue 6 Oct', 'Pomona Offices', 'Kuda', '212.40', '$8,930.00', '<span class="pill pill-plain">drafted</span>', '6'),
        ('Mon 5 Oct', 'Msasa Motors', 'Tinashe', '96.00', '$3,480.00', '<span class="pill pill-plain">sent</span>', '7'),
        ('Fri 25 Sep', 'Avondale Fresh Mart', 'Farai', '64.80', '$2,610.40', '<span class="pill pill-plain">sent</span>', '17'),
        ('Tue 6 Oct', 'Mrs Chari', 'Tinashe', '27.92', '$1,041.26', '<span class="pill pill-plain">sent</span>', '6'),
        ('Thu 17 Sep', 'Greystone Park Primary', 'Kuda', '140.00', '—', '<span class="pill pill-warn">no quote</span>', '<span class="chip-n">25</span>'),
        ('Mon 14 Sep', 'Dr N. Sibanda', 'Farai', '22.50', '—', '<span class="pill pill-warn">no quote</span>', '<span class="chip-n">28</span>')]

def pager(text, pages=1, on=1):
    b = '<button aria-label="Previous">%s</button>' % ic('back')
    b += ''.join('<button class="%s">%d</button>' % ('is-on' if i == on else '', i) for i in range(1, pages + 1))
    b += '<button aria-label="Next">%s</button>' % ic('chev')
    return '<div class="ws-foot" style="position:relative"><span>%s</span><div class="pager">%s</div></div>' % (text, b)

def results(rows=ROWS):
    tools = ('<div class="ws-tools"><label class="input-wrap ws-find">%s<input type="search" aria-label="Search the rows" placeholder="Search the rows"></label>'
             '<div class="seg" role="tablist" aria-label="Show as"><button role="tab" aria-selected="true">Table</button><button role="tab" aria-selected="false">Bar chart</button></div>'
             '%s<span class="ws-n">44 rows · 0.07 s</span><div class="end"><span class="sepv"></span>%s%s%s%s</div></div>') % (
        ic('search'), btn('Filters', 'filter'), btn('Sort', 'sort', 'btn btn-quiet'), btn('Group', 'list', 'btn btn-quiet'), btn('Columns', 'columns', 'btn btn-quiet'), btn('Export', 'export'))
    head = ['visited_on', 'customer', 'fitter', 'area_m2', 'total ' + ic('down'), 'state', 'days_since']
    trs = ''.join('<tr><td class="muted">%s</td><td><span class="cell-lead">%s</span></td><td>%s</td><td class="num">%s</td><td class="num">%s</td><td>%s</td><td class="num">%s</td></tr>' % r for r in rows)
    tot = '<tr class="tot"><td>44 visits</td><td></td><td></td><td></td><td class="num">$22,325.00</td><td><span class="chip-n">15 with no quote</span></td><td></td></tr>'
    th = ''.join('<th%s>%s</th>' % (' class="num"' if i in (3, 4, 6) else '', h) for i, h in enumerate(head))
    return ('<div class="ws">%s<div class="ws-scroll"><table class="table"><thead><tr>%s</tr></thead><tbody>%s%s</tbody></table></div>%s</div>'
            % (tools, th, trs, tot, pager('1–6 of 44 · Rows 50')))

def vane_change(text='<b>Vane changed the question:</b> it now keeps visits with no quote too, and sorts by total.'):
    return '<div class="ex-note">%s<span>%s</span><div class="end">%s%s%s</div></div>' % (
        vmark(20), text, btn('Earlier versions', 'activity', 'btn btn-quiet'), iconbtn('thumbup', 'Useful'), iconbtn('thumbdown', 'Not useful'))

def ex_shell(nav, main, extra=''):
    return '<div class="ex" style="position:relative">%s%s<main class="ex-main">%s</main>%s</div>' % (rail('Explore'), nav, main, extra)

# ---------- E02: the studio ----------
def studio():
    main = ex_top_std() + ask_bar("Site visits since 1 September whose quote still isn't accepted, biggest first") + editor() + vane_change() + results()
    return write(ROOT, 'ExploreStudio', 'Explore · A question · /explore/q/open-quotes', ex_shell(ex_nav(open_t='site_visits'), main))

# ---------- E04: schedule ----------
def schedule():
    main = ex_top_std() + ask_bar("Site visits since 1 September whose quote still isn't accepted, biggest first") + editor() + vane_change() + results()
    when = ''.join('<div class="frow"><span>%s</span><div class="selbox"><span>%s</span>%s</div></div>' % (a, b, ic('down')) for a, b in
                   (('Runs', 'Every Monday'), ('At', '<span class="mono">06:00</span>, before the Monday meeting'), ('Only send', 'When there are rows')))
    to = ''.join('<div class="who"><span class="av">%s</span><span><b>%s</b><span>%s</span></span>%s</div>' % (ic('person'), a, b, iconbtn('x', 'Remove ' + a)) for a, b in
                 (('James Nyabadza', 'WhatsApp and email'), ('Rudo Mapfumo', 'Email')))
    to += btn('Add someone', 'users', 'btn btn-quiet')
    as_ = '<div class="seg" role="tablist" aria-label="Send as" style="display:flex"><button role="tab" aria-selected="true">A short table</button><button role="tab" aria-selected="false">A spreadsheet</button><button role="tab" aria-selected="false">A link</button></div>'
    watch = ('<div style="display:flex;align-items:flex-start;gap:16px"><div style="flex:1"><b style="font-weight:500;color:var(--color-ink)">Tell me as soon as it changes</b>'
             '<p class="muted" style="margin-top:2px">Vane checks this question every hour and raises an issue when the rule is met</p></div><span class="swon"></span></div>'
             '<div style="display:grid;grid-template-columns:auto 1fr 1fr 1fr;gap:8px;align-items:center;margin-top:12px"><span class="muted">When</span>'
             '<div class="selbox"><span>sum of total</span>%s</div><div class="selbox"><span>goes over</span>%s</div><div class="selbox"><span class="mono">$25,000.00</span></div></div>'
             '<div class="vnote" style="margin-top:16px">%s<div><b>It is $22,325.00 today.</b><p>It went over $25,000.00 twice since July, both times in the week before month end.</p></div></div>') % (ic('down'), ic('down'), vmark(20))
    drawer = ('<div class="over"></div><aside class="drawer" aria-label="Schedule"><div class="drawer-h"><span>Schedule “Open quotes since September”</span>%s</div>'
              '<div class="drawer-b"><section class="dsec"><h3>When</h3>%s</section><section class="dsec"><h3>To</h3>%s</section>'
              '<section class="dsec"><h3>As</h3>%s</section><section class="dsec"><h3>Watch it</h3>%s</section></div>'
              '<div class="drawer-f">%s%s</div></aside>') % (iconbtn('x', 'Close'), when, to, as_, watch, btn('Cancel', 'x'), btn('Schedule it', 'clock', 'btn btn-primary', 'Ctrl ↵'))
    return write(ROOT, 'ExploreSchedule', 'Explore · Schedule a question', ex_shell(ex_nav(open_t='site_visits'), main, drawer))

# ---------- E03: templates (Explore, Templates tab) ----------
def templates():
    cats = ''
    for name, n in (('Suggested for Floorcode', 3), ('CRM', 9), ('Books', 6), ('Tender', 5), ('People', 4)):
        cats += '<div class="ex-t%s" style="font-family:var(--font-sans)">%s<span>%s</span><span class="n">%s</span></div>' % (
            ' is-on' if name == 'Suggested for Floorcode' else '', vmark(14) if name.startswith('Suggested') else ic('corelith'), name, n)
    nav = ex_nav('Templates', body='<div class="ex-prod"><span>Questions to start from</span></div>' + cats)
    top = '<header class="ex-top"><h1>%sTemplates</h1><div class="tb-r">%s%s%s</div></header>' % (ic('corelith'), iconbtn('bell', 'Notifications'), vane_btn(3), primary('New question', 'plus', 'N'))
    tools = ('<div class="ws-tools"><label class="input-wrap ws-find">%s<input type="search" aria-label="Search templates" placeholder="Search templates"></label>'
             '<span class="chipsel">Product <b>Any</b>%s</span><span class="chipsel">Made by <b>Any</b>%s</span>%s<span class="ws-n">24</span>'
             '<div class="end"><span class="sepv"></span>%s%s%s%s</div></div>') % (ic('search'), ic('down'), ic('down'), btn('Filters', 'filter'),
             btn('Sort', 'sort', 'btn btn-quiet'), btn('Group', 'list', 'btn btn-quiet'), btn('Columns', 'columns', 'btn btn-quiet'), btn('Export', 'export'))
    groups = [
        (vmark(16) + 'Suggested for Floorcode', '3', [
            ('Quotes waiting more than 7 days', 'You open quotes one by one on Mondays', 'quotes, customers', 'Vane'),
            ('Overtime by fitter and job', "October's pay run had unusual overtime", 'staff, site_visits', 'Vane'),
            ("Cash-ups that didn't balance, by till and shift", 'Three short Mondays since August', 'cash_ups, tills', 'Vane')]),
        ('CRM', '3', [('Pipeline by stage', 'Open deals and their value', 'deals', 'Corelith'),
                      ('Site visits by fitter', 'Visits, quotes drafted and accepted', 'site_visits, quotes', 'Corelith'),
                      ('Customers who came back', 'Second visit within a year', 'customers, site_visits', 'Corelith')]),
        ('Books', '2', [('Owed to you, by age', 'Unpaid invoices in 30-day buckets', 'invoices', 'Corelith'),
                        ('Money in by method', 'Cash, EcoCash, card and transfer', 'payments', 'Corelith')]),
        ('People', '2', [('Payroll cost by team', 'Gross, deductions and net per team', 'pay_runs, staff', 'Corelith'),
                         ('Leave taken this year', 'Days by person and kind', 'leave, staff', 'Corelith')]),
    ]
    trs = ''
    for g, n, rows in groups:
        trs += '<tr class="grp"><td colspan="5">%s<span class="n">%s</span></td></tr>' % (g, n)
        for a, b, c, d in rows:
            by = '<span style="display:inline-flex;align-items:center;gap:6px">%sVane</span>' % vmark(16) if d == 'Vane' else d
            trs += '<tr><td><span class="cell-lead">%s</span></td><td>%s</td><td class="mono muted">%s</td><td>%s</td><td class="acts">%s</td></tr>' % (a, b, c, by, btn('Open', 'run'))
    trs += '<tr class="tot"><td colspan="5">24 templates, 10 shown</td></tr>'
    tbl = '<div class="ws-scroll"><table class="table"><thead><tr><th>Template</th><th>Answers</th><th>Reads</th><th>Made by</th><th></th></tr></thead><tbody>%s</tbody></table></div>' % trs
    main = top + '<div class="ws">' + tools + tbl + pager('1–10 of 24 · Rows 50', 3) + '</div>'
    return write(ROOT, 'ExploreTemplates', 'Explore · Templates · /explore/templates', ex_shell(nav, main))

# ---------- guarded access: a write refused, People tables locked ----------
def refused():
    sql = ['<span class="k">update</span> invoices',
           '<span class="k">set</span> state = <span class="s">\'paid\'</span>',
           '<span class="k">where</span> number = <span class="s">\'INV-0131\'</span>;']
    steps = [('tablegrid', 'Start from', 'invoices'), ('warn', 'Change', 'is not a step Explore has')]
    main = ex_top('Untitled question', iconbtn('bell', 'Notifications') + vane_btn(3) + btn('Run', 'run', 'btn btn-primary', 'Ctrl ↵'))
    main += ask_bar('Mark INV-0131 as paid', 'New question')
    main += editor(steps, sql, '', 'SQL, read only')
    main += ('<div style="padding:24px;display:flex;flex-direction:column;gap:16px;max-width:880px">'
             '<div class="banner banner-warning" role="status" style="display:flex;gap:12px;align-items:flex-start;padding:16px;border-radius:10px;background:var(--color-warning-tint)">%s'
             '<div><b style="color:var(--color-ink)">Explore only reads.</b><p style="color:var(--color-ink-2);margin-top:2px;line-height:1.6">Questions run as <span class="mono">explore_reader</span>, which can select from the tables your role allows and nothing else. Nothing was changed. To mark INV-0131 paid, record the payment in Books.</p>'
             '<div style="display:flex;gap:8px;margin-top:12px">%s%s</div></div></div>'
             '<div class="vnote">%s<div><b>Chisipite Dental paid $1,240.00 by EcoCash at 10:40.</b><p>The payment is in the bank lines but not matched yet. Let’s match it, and INV-0131 closes itself.</p><div class="acts">%s</div></div></div>'
             '<div class="card" style="display:flex;flex-direction:column;gap:8px"><b style="color:var(--color-ink)">What every question runs inside</b>'
             '<div class="prow" style="display:flex;justify-content:space-between;min-height:36px;box-shadow:inset 0 -1px 0 var(--color-line)"><span>Statements</span><span class="muted">select and with, nothing else</span></div>'
             '<div style="display:flex;justify-content:space-between;min-height:36px;box-shadow:inset 0 -1px 0 var(--color-line)"><span>Tables</span><span class="muted">your role’s, this workspace’s rows only</span></div>'
             '<div style="display:flex;justify-content:space-between;min-height:36px;box-shadow:inset 0 -1px 0 var(--color-line)"><span>Rows back</span><span class="muted mono">5,000</span></div>'
             '<div style="display:flex;justify-content:space-between;min-height:36px"><span>Time</span><span class="muted mono">10 s</span></div></div></div>') % (
        ic('lock'), btn('Record a payment', 'payments'), btn('Read about Explore', 'help', 'btn btn-quiet'), vmark(20), btn('Match it', 'match'))
    nav = ex_nav(open_t='invoices', locked=('pay_runs', 'staff', 'leave'))
    return write(ROOT, 'ExploreGuard', 'Explore · A change refused, People tables locked for a sales role', ex_shell(nav, main))

# ---------- E05: Vane's suggestion on a list, and Explore this list ----------
def suggest():
    pnl = panel('Books', pn('Money', 'money') + pn('Invoices', 'invoice', 3, True) + pn('Payments', 'payments') + pn('Takings', 'takings', 1) +
                pn('Expenses', 'expenses') + pn('Bank', 'bank', 4) + pn('VAT', 'vat') +
                pg('Saved views', [pn('Overdue', dot=True, meta='shared'), pn('Pomona Offices', dot=True, meta='you'), pn('Paid this month', dot=True, meta='shared')], add=True) +
                pg('Reports from Books', [pn('Money this month', 'reports'), pn('Owed to you, by age', 'reports')]))
    top = topbar('Invoices', 'invoice', primary('New invoice', 'plus', 'N'), bell=False, vane=3)
    tools = ('<div class="ws-tools"><label class="input-wrap ws-find">%s<input type="search" aria-label="Search invoices" placeholder="Search invoices"></label>'
             '<span class="chipsel">Customer <b>Any</b>%s</span><span class="chipsel is-set">State <b>Unpaid</b>%s</span>%s<span class="ws-n">142</span>'
             '<div class="end"><span class="sepv"></span>%s%s%s<button class="btn is-vane" aria-pressed="true" aria-label="Vane, 2 for this list">%s<span class="vn-c" style="color:var(--color-ink)">2</span></button></div></div>') % (
        ic('search'), ic('down'), ic('down'), btn('Filters', 'filter'), btn('View', 'eye', 'btn btn-quiet'), btn('Export', 'export'), btn('Explore this list', 'explore'), vmark(16))
    rows = [('INV-0131', 'Chisipite Dental', 'pill-warn', 'Overdue', '12 days overdue', '$1,240.00', '$1,240.00'),
            ('INV-0135', 'Highlands Guest Lodge', 'pill-warn', 'Overdue', '5 days overdue', '$860.00', '$860.00'),
            ('INV-0137', 'Msasa Motors', 'pill-warn', 'Overdue', '2 days overdue', '$380.00', '$380.00'),
            ('INV-0142', 'Pomona Offices', 'pill-info', 'Part paid', 'Due 20 Oct', '$1,994.22', '$1,494.22'),
            ('INV-0140', 'Borrowdale Brooke Clinic', 'pill-info', 'Sent', 'Due 14 Oct', '$1,750.00', '$1,750.00'),
            ('INV-0141', 'Mrs T. Gumbo', 'pill-plain', 'Paid', 'Paid 5 Oct, cash', '$430.00', '—'),
            ('INV-0139', 'Greystone Park Primary', 'pill-plain', 'Paid', 'Paid 2 Oct, transfer', '$2,980.00', '—'),
            ('INV-0138', 'Avondale Fresh Mart', 'pill-plain', 'Paid', 'Paid 30 Sep, EcoCash', '$1,865.00', '—'),
            ('INV-0136', 'Dr N. Sibanda', 'pill-plain', 'Paid', 'Paid 29 Sep, card', '$1,130.00', '—')]
    trs = ''.join('<tr><td class="sel"><label class="check"><input type="checkbox" aria-label="Select %s"></label></td><td><span class="ref">%s</span></td><td><span class="cell-lead">%s</span></td><td><span class="pill %s">%s</span></td><td>%s</td><td class="num">%s</td><td class="num">%s</td></tr>' % ((r[0],) + r) for r in rows)
    trs += '<tr class="tot"><td></td><td colspan="2">142 invoices</td><td><span class="chip-n">3 overdue</span></td><td></td><td></td><td class="num">$5,724.22</td></tr>'
    tbl = '<div class="ws-scroll"><table class="table"><thead><tr><th class="sel"><label class="check"><input type="checkbox" aria-label="Select every invoice on this page"></label></th><th>Invoice</th><th>Customer</th><th>State</th><th>When</th><th class="num">Total</th><th class="num">Balance</th></tr></thead><tbody>%s</tbody></table></div>' % trs
    pop = ('<div class="popover" style="position:absolute;right:24px;top:150px;width:370px;padding:0;z-index:5">'
           '<div style="display:flex;align-items:center;gap:8px;height:48px;padding:0 16px;box-shadow:inset 0 -1px 0 var(--color-line)">%s<b style="font-weight:600;color:var(--color-ink)">For this list</b><span class="muted" style="margin-left:auto">2</span></div>'
           '<div style="padding:16px;box-shadow:inset 0 -1px 0 var(--color-line)"><b style="color:var(--color-ink);font-weight:600">You export this list every Friday at about <span class="mono">16:00</span>.</b>'
           '<p style="color:var(--color-ink-2);margin-top:4px;line-height:1.6">Let’s send it to Rudo on WhatsApp at 16:00 instead, as a short table of what is still unpaid.</p>'
           '<div style="display:flex;gap:8px;margin-top:12px">%s%s</div></div>'
           '<div style="padding:16px"><b style="color:var(--color-ink);font-weight:600">Add a column for days overdue?</b>'
           '<p style="color:var(--color-ink-2);margin-top:4px;line-height:1.6">You sort by it in Explore each week. Let’s keep it here so the list answers it.</p>'
           '<div style="display:flex;gap:8px;margin-top:12px">%s%s</div></div></div>') % (
        vmark(18), btn('Schedule it', 'clock', 'btn btn-primary', 'S'), btn('Not now', 'x', 'btn btn-quiet'), btn('Add the column', 'plus'), btn('Not now', 'x', 'btn btn-quiet'))
    main = top + '<div class="ws" style="position:relative">' + tools + tbl + pager('1–9 of 142 · Rows 50', 3) + pop + '</div>'
    return write(ROOT, 'ExploreSuggest', 'Books · Invoices, with Vane’s suggestions for this list', shell('Books', pnl, main))

# ---------- E06: Ctrl K ----------
def ask():
    pnl = panel('Books', pn('Money', 'money', on=True) + pn('Invoices', 'invoice', 3) + pn('Payments', 'payments') + pn('Takings', 'takings', 1) +
                pn('Expenses', 'expenses') + pn('Bank', 'bank', 4) + pn('VAT', 'vat') +
                pg('Saved views', [pn('Overdue', dot=True, meta='shared'), pn('Pomona Offices', dot=True, meta='you'), pn('Paid this month', dot=True, meta='shared')], add=True) +
                pg('Reports from Books', [pn('Money this month', 'reports'), pn('Owed to you, by age', 'reports')]))
    top = topbar('Money', 'money', '', vane=5)
    cmd = ('<div class="over" style="background:rgba(255,255,255,.6)"></div><div style="position:absolute;inset:0;z-index:21;display:flex;justify-content:center">'
           '<div class="cmd" style="max-width:640px;margin-top:96px"><div class="cmd-in">%s<input aria-label="Search or ask" value="how much did we quote in september" style="flex:1;border:0;outline:0;font-size:16px;color:var(--color-ink);background:transparent">%s</div>'
           '<div style="padding:12px 8px 4px"><div class="pg-h" style="padding:0 8px">Vane</div>'
           '<div style="display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;padding:16px;border-radius:8px;background:var(--color-ground)">%s'
           '<div><p style="font-size:20px;font-weight:600;color:var(--color-ink)"><span class="mono">$19,870.00</span> quoted in September.</p>'
           '<p style="color:var(--color-ink-2);margin-top:4px">24 quotes from 27 site visits. 13 accepted, $12,640.00. August was $17,215.00.</p>'
           '<div style="display:flex;gap:8px;margin-top:12px">%s%s</div></div></div></div>'
           '<div style="padding:8px"><div class="pg-h" style="padding:0 8px">Go to</div>%s</div>'
           '<div style="display:flex;gap:16px;align-items:center;padding:10px 16px;box-shadow:inset 0 1px 0 var(--color-line);font-size:12px;color:var(--color-muted)">'
           '<span>%s %s to move</span><span>%s to open</span><span>%s to ask Vane instead</span></div></div></div>') % (
        ic('search'), kbd('Esc'), vmark(28), btn('Open in Explore', 'explore', 'btn btn-primary', '↵'), btn('Pin to Monday board', 'pin'),
        ''.join('<div style="display:flex;align-items:center;gap:12px;height:44px;padding:0 12px;border-radius:6px;%s">%s<span style="color:var(--color-ink)">%s</span><span class="muted" style="margin-left:auto;font-size:13px">%s</span></div>' % (
            'background:var(--color-fill)' if i == 0 else '', ic(a), b, c) for i, (a, b, c) in enumerate(
            (('invoice', 'Quotes, sent in September', 'CRM'), ('reports', 'Accepted quotes by subfloor', 'Reports'), ('corelith', 'Site visits by fitter', 'Template')))),
        kbd('↑'), kbd('↓'), kbd('↵'), kbd('Tab'))
    main = top + finding('<span class="num">$10,228.40</span> has come in this month.', '<span class="num">$5,724.22</span> is owed to you.')
    return write(ROOT, 'ExploreAsk', 'Ctrl K · Ask anywhere, with Open in Explore', shell('Books', pnl, main, cmd))

# ---------- E01: how it works ----------
def how():
    ways = ''.join('<div class="xp-card">%s<b>%s</b><p>%s</p><code>%s</code></div>' % (ic(i), a, b, c) for i, a, b, c in (
        ('sentence', 'Ask in plain words', 'Vane writes the SQL, runs it and says what it did. New question, or Change this.', "Site visits since September whose quote isn't accepted"),
        ('list', 'Build with steps', 'Start from, bring in, keep, group, sort. No code; every step is a clause.', 'Start from site_visits · Keep not accepted'),
        ('explore', 'Write SQL', 'Postgres, read only, with the tables and columns beside the editor.', 'select … from site_visits left join quotes …')))
    views = ''.join('<div class="xp-card">%s<b>%s</b><p>%s</p></div>' % (ic(i), a, b) for i, a, b in (
        ('tablegrid', 'A table', 'the worksheet, with totals'), ('reports', 'A chart', 'bar or line, from the same rows'), ('block', 'A block on a board', 'the Monday board'),
        ('clock', 'A schedule', 'WhatsApp or email, when there are rows'), ('bell', 'A watch', 'Vane raises an issue when a rule is met'), ('bulb', 'An insight', 'written by Vane each Monday')))
    sugg = ''.join('<div class="xp-row"><span>%s</span><span class="muted">→</span><b>%s</b></div>' % r for r in (
        ('You export the same list every week', 'Schedule it to the person who needs it'), ("You sort or filter by a figure the list doesn't show", 'Add it as a column'),
        ('You open records one by one to compare them', 'A question that compares them in one table'), ('A figure moved more than usual', 'An insight, with the rows behind it'),
        ('You ask Vane the same thing twice', 'Save it as a question, or pin it to a board'), ("A question's result crossed a line before", 'Watch it and raise an issue next time')))
    guard = ''.join('<div class="xp-row" style="grid-template-columns:240px minmax(0,1fr)"><b>%s</b><span>%s</span></div>' % r for r in (
        ('Who can open Explore', 'Owners, managers and anyone Management lets in. Everyone else asks Vane or uses reports.'),
        ('What it reads', 'The tables the person’s role reads in the app, and only this workspace’s rows. People tables stay with People managers.'),
        ('How it reads', 'As explore_reader: select and with only. A change, a delete or a second statement is refused before it runs.'),
        ('How much', '5,000 rows back and 10 seconds per question. Every question run is kept in Management → Explore, with who ran it.')))
    body = ('<div class="xp"><div class="xp-k">%s<span>Explore</span></div><h1>Ask, build or write: one question</h1>'
            '<p class="lede">Explore is the studio for people who want the workspace’s data itself. Reports, insights and Vane share its engine: however a question starts, in plain words, as steps or as SQL, it is stored as SQL and its rows. Everything else is a view over those two.</p>'
            '<section class="xp-sec"><div><h2>Three ways in</h2><p class="aside">Each one writes the same SQL, and each can be read as the others.</p></div><div class="xp-cards" style="grid-template-columns:repeat(3,1fr)">%s</div></section>'
            '<section class="xp-sec"><div><div class="card" style="text-align:center;box-shadow:0 0 0 1.5px var(--color-ink);padding:20px"><b style="font-size:16px;color:var(--color-ink)">Stored: the SQL and its rows</b><p class="muted" style="margin-top:6px;line-height:1.6">Nothing else, so the steps, the chart and Vane’s words can never disagree with the data.</p></div></div><div class="xp-cards" style="grid-template-columns:repeat(6,1fr)">%s</div></section>'
            '<section class="xp-sec"><div><h2>Guarded access</h2><p class="aside">Power without risk: Explore can read a lot, and change nothing.</p></div><div class="xp-rows">%s</div></section>'
            '<section class="xp-sec"><div><h2>Where suggestions come from</h2><p class="aside">Vane watches how people use the workspace and offers to save them the trip.</p></div><div class="xp-rows">%s</div></section>'
            '<section class="xp-sec"><div><h2>Where it shows up</h2><p class="aside">Its own place on the rail, and inside the screens people already use.</p></div><ul class="dots">'
            '<li>Explore, on the rail: the tables, the ask box, steps beside SQL, rows below. Every panel resizes.</li>'
            '<li>Every worksheet: Explore this list, which opens the list’s own SQL</li><li>The toolbar’s Vane slot: suggestions for the list on screen</li>'
            '<li>Ctrl K: ask a question anywhere and get the figure back, with Open in Explore</li><li>Reports: a block on a board is a saved question; Edit opens it here</li></ul></section></div>') % (
        ic('explore'), ways, views, guard, sugg)
    return write(ROOT, 'ExploreHow', 'Explore · How it works', body, h=2100)

if __name__ == '__main__':
    for f in (how, studio, templates, schedule, suggest, ask, refused):
        print(f())
