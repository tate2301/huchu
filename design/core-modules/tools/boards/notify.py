import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import *
ROOT = sys.argv[1]

def nt(icon, title, text, time, acts='', new=False):
    lead = vmark(18) if icon == 'VANE' else ic(icon)
    return '<div class="nt%s"><span class="dot"></span>%s<div><b>%s</b><p>%s</p></div><time>%s</time>%s</div>' % (
        ' is-new' if new else '', lead, title, text, time, '<div class="acts">%s</div>' % acts if acts else '')

def bell():
    top = '<header class="tb-m"><h1>%sMoney</h1><div class="tb-r">%s<button class="btn btn-icon" aria-label="Notifications" aria-pressed="true" style="box-shadow:var(--shadow-ring),inset 0 0 0 1px var(--color-ink)">%s</button>%s%s</div></header>' % (
        ic('money'), find_all(), ic('bell'), vane_btn(5), primary('New invoice', 'plus', 'N'))
    pop = ('<div class="bell" role="dialog" aria-label="Notifications"><div class="bell-h"><b>Notifications</b>%s%s</div>'
           '<div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="true">Needs you <span class="muted mono">3</span></button><button class="tab" role="tab" aria-selected="false">Updates</button><button class="tab" role="tab" aria-selected="false">Mentions</button></div>'
           '<div class="bell-day">Today</div>%s%s%s%s<div class="bell-day">Yesterday</div>%s%s'
           '<div class="bell-f">%s<span class="end">Quiet from <span class="mono">20:00</span> to <span class="mono">06:00</span></span></div></div>') % (
        btn('Mark all read', 'check', 'btn btn-quiet'), iconbtn('gear', 'Notification settings'),
        nt('sun', 'Kuda Chigumba asked for annual leave', 'Tue 20 to Thu 22 October. Two of four fitters would be out on Wednesday.', '08:41', btn('Approve', 'check') + btn('Decline', 'x', 'btn btn-quiet'), True),
        nt('VANE', 'October’s pay run is ready to check', '$6,101.68 net for 9 people. 2 things to look at.', '06:12', btn('Check the run', 'eye'), True),
        nt('at', 'Rudo Mapfumo mentioned you on INV-0142', '“Pomona paid $500.00 by transfer. Shall I send a statement for the rest?”', '07:55', btn('Reply', 'whatsapp'), True),
        nt('payments', 'Chisipite Dental paid INV-0131', '$1,240.00 by EcoCash. It was 12 days late.', '10:40'),
        nt('takings', 'Monday’s cash-up was $12.00 short', 'Till 1, morning shift. Vane raised it as an issue.', '17:32'),
        nt('users', 'Blessing Zhou joined Floorcode', 'Assistant fitter, starts 1 November.', '11:05'),
        btn('All activity', 'activity', 'btn btn-quiet'))
    main = top + finding('<span class="num">$10,228.40</span> has come in this month.', '<span class="num">$5,724.22</span> is owed to you.')
    return write(ROOT, 'NotifyBell', 'The bell · Needs you, over Books', shell('Books', books_panel('Money'), main, pop))

def activity():
    top = topbar('Activity', 'activity', primary('Export', 'export', 'X'), bell=False, vane=3)
    tools = ws_tools('Search activity', [('Product', 'Any', False), ('Who', 'Anyone', False), ('Kind', 'Any', False)], '312')
    def who(n):
        return '<span style="display:inline-flex;align-items:center;gap:6px;color:var(--color-ink)">%sVane</span>' % vmark(16) if n == 'Vane' else '<span class="cell-lead">%s</span>' % n
    today = [('10:40', 'Chisipite Dental', 'Paid by EcoCash', 'INV-0131', 'Books', '$1,240.00'), ('08:41', 'Kuda Chigumba', 'Asked for annual leave', 'LV-0042', 'People', '3 days'),
             ('08:12', 'James Nyabadza', 'Sent 3 reminders on WhatsApp', 'INV-0131', 'Books', '—'), ('07:55', 'Rudo Mapfumo', 'Mentioned you', 'INV-0142', 'Books', '—'),
             ('06:12', 'Vane', 'Checked October’s pay run', 'PR-2026-10', 'People', '2 issues'), ('06:05', 'Vane', 'Matched 3 bank lines', 'CBZ USD', 'Books', '$1,600.10')]
    yday = [('17:32', 'Vane', 'Raised a short cash-up', 'CU-0214', 'Tender', '<span class="chip-n">−$12.00</span>'), ('16:58', 'Chipo Mhlanga', 'Closed Till 1', 'CU-0214', 'Tender', '$420.60'),
            ('11:05', 'James Nyabadza', 'Added Blessing Zhou', 'EMP-0008', 'People', '—')]
    def rows(rs):
        return ''.join('<tr><td class="mono muted">%s</td><td>%s</td><td>%s</td><td><span class="ref">%s</span></td><td>%s</td><td class="num">%s</td></tr>' % (a, who(b), c, d, e, f) for a, b, c, d, e, f in rs)
    trs = '<tr class="grp"><td colspan="6">Today<span class="n">6</span></td></tr>' + rows(today) + '<tr class="grp"><td colspan="6">Yesterday<span class="n">3</span></td></tr>' + rows(yday)
    trs += '<tr class="tot"><td>312 events this week</td><td>41 by Vane</td><td></td><td></td><td></td><td></td></tr>'
    head = '<tr><th>When %s</th><th>Who</th><th>What</th><th>Record</th><th>Product</th><th class="num">Amount</th></tr>' % ic('down')
    main = top + '<div class="ws">' + tools + '<div class="ws-scroll"><table class="table"><thead>%s</thead><tbody>%s</tbody></table></div>' % (head, trs) + pager('1–50 of 312 · Rows 50', 7) + '</div>'
    return write(ROOT, 'NotifyActivity', 'Activity · every event, as a worksheet · /activity', shell('Books', books_panel(None), main))

def cb(on):
    return '<span class="cb%s" role="checkbox" aria-checked="%s"></span>' % (' on' if on else '', 'true' if on else 'false')

def mg_notifications():
    rows = [('g', 'Needs you'), ('Approvals', 'Leave, pay runs, requisitions', 1, 1, 1, 1), ('Mentions', 'When someone names you on a record', 1, 1, 1, 0),
            ('Vane’s issues', 'Things Vane found that need a person', 1, 0, 1, 1), ('g', 'Updates'), ('Payments in', 'Invoices paid, by any method', 1, 0, 0, 1),
            ('Your records', 'Deals, invoices and people you own change', 1, 0, 0, 0), ('Tills and cash-ups', 'A till closes short or over', 1, 0, 1, 0)]
    trs = ''
    for r in rows:
        if r[0] == 'g':
            trs += '<tr class="g"><td colspan="5">%s</td></tr>' % r[1]
        else:
            trs += '<tr><td><b>%s</b><span class="s">%s</span></td>%s</tr>' % (r[0], r[1], ''.join('<td>%s</td>' % cb(v) for v in r[2:]))
    mx = '<table class="mx"><thead><tr><th style="width:52%%"></th><th>In the app</th><th>Email</th><th>WhatsApp</th><th>Phone</th></tr></thead><tbody>%s</tbody></table>' % trs
    when = ''.join('<div class="srow">%s<div><b>%s</b><span class="s">%s</span></div>%s</div>' % r for r in (
        (ic('moon'), 'Quiet hours', 'Nothing reaches your phone or WhatsApp in this time', '<div class="selbox"><span class="mono">20:00 to 06:00</span>%s</div>' % ic('down')),
        (vmark(20), 'Morning message from Vane', 'One WhatsApp at 07:00 with what it found overnight', '<span class="swon swink"></span>'),
        (ic('list'), 'Group repeats', 'Three payments in an hour arrive as one notification', '<span class="swon swink"></span>')))
    page = ('<div class="page" style="max-width:1120px;padding:40px 32px">%s<div style="margin-top:40px">%s</div>'
            '<div class="lset" style="box-shadow:none"><div><h2>When</h2><p class="aside">Quiet hours hold messages until the morning.</p></div><div>%s</div></div></div>') % (
        finding('You hear about 6 kinds of thing, in up to 4 places.', 'Anything you did yourself never notifies you.').replace('class="finding"', 'class="finding" style="padding:0"'), mx, when)
    return write(ROOT, 'MgmtNotifications', 'Management · Notifications', mg('Notifications', mgtop('Notifications', 'bell') + page))

def srow(icon, a, b, right):
    return '<div class="srow">%s<div><b>%s</b><span class="s">%s</span></div>%s</div>' % (ic(icon), a, b, right)

def sel(v):
    return '<div class="selbox"><span>%s</span>%s</div>' % (v, ic('down'))

def mg_pay():
    secs = [('Pay day', 'When the run is paid and who approves it.', [
                ('calendar', 'Pay day', 'Monthly, on the 25th; the working day before if it falls on a weekend', sel('25th of the month')),
                ('users', 'Approves the run', 'Directors', sel('Directors')),
                ('vat', 'Pay currency', 'US dollars. ZWG can be added per person', sel('US dollars'))]),
            ('Statutory', 'Updated by Corelith when the authorities publish new tables.', [
                ('fiscal', 'PAYE and AIDS levy', 'ZIMRA’s US dollar tables, plus 3% of the PAYE', '<span class="ok-dot">Up to date</span>'),
                ('inspections', 'NSSA', '4.5% from the person and 4.5% from Floorcode, on earnings up to $700.00 a month', '<span class="ok-dot">Up to date</span>'),
                ('training', 'ZIMDEF', '1% of the payroll, paid by Floorcode', '<span class="ok-dot">Up to date</span>'),
                ('ws', 'NEC levy', 'Set by your industry’s council. Choose yours', sel('Choose a council'))]),
            ('Pay items', 'What can appear on a payslip.', [
                ('list', 'Basic pay', 'Monthly, taxable', iconbtn('pen', 'Change Basic pay')),
                ('list', 'Overtime', 'From site visit hours at 1.5 times the hourly rate, taxable', iconbtn('pen', 'Change Overtime')),
                ('list', 'Transport allowance', 'Fixed, taxable', iconbtn('pen', 'Change Transport allowance')),
                ('list', 'Advance repayment', 'Deducted until the advance is repaid', iconbtn('pen', 'Change Advance repayment'))])]
    body = ''.join('<div class="lset"><div><h2>%s</h2><p class="aside">%s</p></div><div>%s</div></div>' % (a, b, ''.join(srow(*r) for r in rows)) for a, b, rows in secs)
    page = '<div class="page" style="max-width:1120px;padding:40px 32px">%s%s</div>' % (
        finding('Floorcode pays 9 people in US dollars on the 25th.', 'PAYE, NSSA and ZIMDEF are worked out from the tables ZIMRA and NSSA publish.').replace('class="finding"', 'class="finding" style="padding:0 0 16px"'), body)
    return write(ROOT, 'MgmtPay', 'Management · Pay and statutory', mg('Pay and statutory', mgtop('Pay and statutory', 'invoice', btn('Changes', 'activity'))) + '', css='') if False else \
        write(ROOT, 'MgmtPay', 'Management · Pay and statutory', mg('Pay and statutory', mgtop('Pay and statutory', 'invoice', btn('Changes', 'activity')) + page))

def mg_explore():
    roles = [('Owners and directors', 'James Nyabadza', 'Every table', '<span class="ok-dot">Can use Explore</span>'),
             ('Accounts', 'Rudo Mapfumo', 'Books, CRM, Tender. People’s pay', '<span class="ok-dot">Can use Explore</span>'),
             ('Showroom lead', 'Chipo Mhlanga', 'Tender, CRM customers', '<span class="ok-dot">Can use Explore</span>'),
             ('Fitters and sales', '6 people', '—', '<span class="muted">Ask Vane and reports only</span>')]
    trs = ''.join('<tr><td><span class="cell-lead">%s</span></td><td>%s</td><td>%s</td><td>%s</td></tr>' % r for r in roles)
    who = '<div class="card" style="padding:0;overflow:hidden"><table class="table"><thead><tr><th>Role</th><th>People</th><th>Reads</th><th>Explore</th></tr></thead><tbody>%s</tbody></table></div>' % trs
    tables = ''
    for prod, ts in (('CRM', 'customers · deals · site_visits · quotes · quote_lines'), ('Books', 'invoices · payments · bank_lines · journals'), ('Tender', 'sales · sale_lines · cash_ups · products · tills'), ('People', 'staff · pay_runs · payslips · leave · loans')):
        tables += srow('tablegrid', prod, '<span class="mono">%s</span>' % ts, sel('By role') if prod != 'People' else sel('People managers only'))
    limits = (srow('lock', 'Read only, always', 'Questions run as <span class="mono">explore_reader</span>: select and with only. A change, a delete or a second statement is refused before it runs.', '<span class="ok-dot">On, cannot be turned off</span>') +
              srow('ws', 'This workspace’s rows', 'Every table is filtered to Floorcode before the question sees it', '<span class="ok-dot">On, cannot be turned off</span>') +
              srow('export', 'Rows back', 'Larger answers are cut, and say so', sel('<span class="mono">5,000</span>')) +
              srow('clock', 'Time per question', 'Stopped and reported when it runs longer', sel('<span class="mono">10 s</span>')) +
              srow('pen', 'Personal details', 'Phone numbers, ID and bank accounts show as ••• unless the role reads them in People', '<span class="swon swink"></span>'))
    log = [('11:48', 'Rudo Mapfumo', 'Owed to you, by age', 'invoices', '142 rows · 0.04 s'), ('10:02', 'James Nyabadza', 'Open quotes since September', 'site_visits, quotes, customers, staff', '44 rows · 0.07 s'),
           ('09:15', 'Chipo Mhlanga', 'update products set price…', 'products', '<span class="pill pill-warn">refused, a change</span>')]
    ltrs = ''.join('<tr><td class="mono muted">%s</td><td><span class="cell-lead">%s</span></td><td>%s</td><td class="mono muted">%s</td><td>%s</td></tr>' % r for r in log)
    logt = '<div class="card" style="padding:0;overflow:hidden"><table class="table"><thead><tr><th>When</th><th>Who</th><th>Question</th><th>Read</th><th>Result</th></tr></thead><tbody>%s</tbody></table></div>' % ltrs
    page = ('<div class="page" style="max-width:1120px;padding:40px 32px">%s'
            '<div class="lset"><div><h2>Who can use Explore</h2><p class="aside">By role. Everyone else asks Vane, or opens reports.</p></div><div>%s</div></div>'
            '<div class="lset"><div><h2>What each product shows</h2><p class="aside">A role reads in Explore what it reads in the app, never more.</p></div><div>%s</div></div>'
            '<div class="lset"><div><h2>Guards</h2><p class="aside">The same for every question, from a person, a report or Vane.</p></div><div>%s</div></div>'
            '<div class="lset" style="box-shadow:none"><div><h2>Questions run today</h2><p class="aside">Kept for a year, with the SQL and who ran it.</p></div><div>%s</div></div></div>') % (
        finding('3 roles can use Explore, and none of them can change a record.', '213 questions ran this month; 2 changes were refused.').replace('class="finding"', 'class="finding" style="padding:0 0 16px"'), who, tables, limits, logt)
    return write(ROOT, 'MgmtExplore', 'Management · Explore: who reads what', mg('Explore', mgtop('Explore', 'explore', btn('All questions run', 'activity'))) + page) if False else \
        write(ROOT, 'MgmtExplore', 'Management · Explore: who reads what', mg('Explore', mgtop('Explore', 'explore', btn('All questions run', 'activity')) + page), h=1500)

if __name__ == '__main__':
    for f in (bell, activity, mg_notifications, mg_pay, mg_explore):
        print(f())
