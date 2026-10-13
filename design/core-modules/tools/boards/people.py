import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import *
ROOT = sys.argv[1]
PEOPLE = [('EMP-0001', 'James Nyabadza', 'Director', 'Management', 'Director', 'Permanent', ('plain', 'Active'), '$2,400.00', None),
          ('EMP-0002', 'Rudo Mapfumo', 'Accounts', 'Office', '—', 'Permanent', ('plain', 'Active'), '$950.00', None),
          ('EMP-0003', 'Chipo Mhlanga', 'Showroom lead', 'Showroom', 'Showroom lead', 'Permanent', ('info', 'On leave'), '$820.00', None),
          ('EMP-0004', 'Tendai Sibanda', 'Showroom sales', 'Showroom', '—', 'Fixed term', ('plain', 'Active'), '$560.00', None),
          ('EMP-0005', 'Tinashe Moyo', 'Fitter', 'Fitting', 'Fitter', 'Fixed term', ('warn', 'Contract ends'), '$780.00', 'Contract ends 31 Oct'),
          ('EMP-0006', 'Kuda Chigumba', 'Fitter', 'Fitting', 'Fitter', 'Permanent', ('plain', 'Active'), '$780.00', 'Overtime 3 times usual'),
          ('EMP-0007', 'Farai Ncube', 'Fitter', 'Fitting', 'Fitter', 'Permanent', ('plain', 'Active'), '$780.00', None),
          ('EMP-0008', 'Blessing Zhou', 'Assistant fitter', 'Fitting', 'Fitter', 'Fixed term', ('plain', 'Active'), '$420.00', None),
          ('EMP-0009', 'Simba Gondo', 'Driver', 'Fitting', '—', 'Permanent', ('warn', 'No NSSA number'), '$480.00', 'No NSSA number')]

def everyone():
    top = topbar('Everyone', 'users', primary('Add a person', 'users', 'N'), bell=False, vane=3)
    tools = ws_tools('Search people', [('Team', 'Any', False), ('Contract', 'Any', False), ('Status', 'Active', True)], '9')
    trs = ''
    for code, name, role, team, grade, contract, (tone, st), pay, vane in PEOPLE:
        trs += ('<tr><td class="sel"><label class="check"><input type="checkbox" aria-label="Select %s"></label></td><td><span class="ref">%s</span> <span class="cell-lead">%s</span></td>'
                '<td>%s</td><td>%s</td><td>%s</td><td>%s</td><td><span class="pill pill-%s">%s</span></td><td class="num">%s</td><td>%s</td></tr>') % (
            name, code, name, role, team, grade, contract, tone, st, pay, vflag(vane) if vane else '<span class="muted">—</span>')
    trs += '<tr class="tot"><td></td><td>9 people</td><td></td><td></td><td><span class="chip-n">3 without a grade</span></td><td></td><td></td><td class="num">$7,970.00</td><td></td></tr>'
    head = '<tr><th class="sel"><label class="check"><input type="checkbox" aria-label="Select everyone on this page"></label></th><th>Person</th><th>Role</th><th>Team</th><th>Job grade</th><th>Contract</th><th>Status %s</th><th class="num">Monthly pay</th><th>Vane</th></tr>' % ic('down')
    main = top + '<div class="ws">' + tools + '<div class="ws-scroll"><table class="table"><thead>%s</thead><tbody>%s</tbody></table></div>' % (head, trs) + pager('1–9 of 9 · Rows 50') + '</div>'
    return write(ROOT, 'PeopleEveryone', 'People · Everyone · /people', shell('People', people_panel('Everyone'), main))

def kvrow(k, v):
    return '<div style="display:grid;grid-template-columns:240px minmax(0,1fr);gap:56px"><span class="muted" style="min-height:48px;display:flex;align-items:center;box-shadow:inset 0 -1px 0 var(--color-line)">%s</span><span style="min-height:48px;display:flex;align-items:center;gap:8px;color:var(--color-ink);box-shadow:inset 0 -1px 0 var(--color-line)">%s</span></div>' % (k, v)

def payrow(k, v, total=False):
    st = 'font-weight:600;color:var(--color-ink);box-shadow:inset 0 2px 0 var(--color-rule)' if total else 'color:var(--color-ink-2);box-shadow:inset 0 -1px 0 var(--color-line)'
    return '<div style="display:flex;justify-content:space-between;align-items:center;min-height:48px;%s"><span>%s</span><span class="mono" style="color:var(--color-ink)">%s</span></div>' % (st, k, v)

def side_kv(k, v, mono=True):
    return '<div style="display:flex;justify-content:space-between;min-height:32px;align-items:center"><span class="muted">%s</span><span class="%s" style="color:var(--color-ink-2)">%s</span></div>' % (k, 'mono' if mono else '', v)

def person():
    right = '<div class="btn-group" role="group" aria-label="Tinashe">%s%s</div>%s' % (btn('Message', 'whatsapp'), btn('Book time off', 'sun'), btn('Edit', 'pen', 'btn btn-primary', 'E'))
    top = topbar('Tinashe Moyo', 'person', right, bell=False, vane=3)
    head = ('<div style="display:flex;align-items:center;gap:20px"><span class="av" style="width:56px;height:56px">%s</span><div style="flex:1"><div style="font-size:20px;font-weight:600;color:var(--color-ink)">Tinashe Moyo</div>'
            '<div class="muted" style="margin-top:2px"><span class="ref">EMP-0005</span> · Fitter in Fitting · since 1 November 2025</div></div><span class="pill pill-warn">Contract ends 31 Oct</span></div>') % ic('person')
    note = ('<div class="card" style="display:grid;grid-template-columns:20px minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:16px 20px">%s<div><b style="color:var(--color-ink)">Tinashe’s contract ends on 31 October.</b>'
            '<p style="color:var(--color-ink-2);line-height:1.6">He has been on the same terms for 12 months and made 31 site visits since July, with 15 quotes accepted. Let’s renew it for another 12 months.</p></div>%s%s</div>') % (
        vmark(20), btn('Draft the renewal', 'docs'), iconbtn('x', 'Not now'))
    tabs = '<div class="tabs" role="tablist">%s</div>' % ''.join('<button class="tab" role="tab" aria-selected="%s">%s</button>' % ('true' if i == 0 else 'false', t) for i, t in enumerate(('Job and pay', 'Time off', 'Documents', 'Site visits', 'Activity')))
    job = '<h2 class="text-heading" style="margin:8px 0 8px">Job</h2>' + ''.join(kvrow(k, v) for k, v in (('Role', 'Fitter'), ('Team', 'Fitting, reports to James Nyabadza'), ('Job grade', '<span class="ref">GRD-0001</span> Fitter'), ('Contract', 'Fixed term, 1 Nov 2025 to 31 Oct 2026'), ('Works', 'Monday to Saturday, 07:30 to 16:30')))
    pay = '<h2 class="text-heading" style="margin:16px 0 8px">Pay, this month</h2><div style="max-width:620px">' + ''.join(payrow(k, v) for k, v in (('Basic pay', '$780.00'), ('NSSA, 4.5%', '−$31.50'), ('PAYE', '−$152.13'), ('AIDS levy, 3% of PAYE', '−$4.56'))) + payrow('Net pay, to CBZ', '$591.81', True) + '</div>'
    side = ('<aside style="box-shadow:inset 1px 0 0 var(--color-line);display:flex;flex-direction:column">'
            '<section style="padding:32px;box-shadow:inset 0 -1px 0 var(--color-line)"><h3 class="text-heading">Time off left</h3><div style="font-size:36px;font-weight:600;margin:12px 0 16px;color:var(--color-ink)"><span class="mono">11</span> days</div>%s%s%s</section>'
            '<section style="padding:32px;box-shadow:inset 0 -1px 0 var(--color-line)"><h3 class="text-heading" style="margin-bottom:16px">Loans and advances</h3>%s%s%s</section>'
            '<section style="padding:32px"><h3 class="text-heading" style="margin-bottom:16px">Details</h3>%s%s%s</section></aside>') % (
        side_kv('Annual', '11 of 22'), side_kv('Sick', '0 used'), side_kv('Next off', 'None booked', False),
        side_kv('Advance, Sep', '$100.00'), side_kv('Left to repay', '$50.00'), side_kv('Per month', '$50.00'),
        side_kv('Phone', '077 381 2209'), side_kv('NSSA number', 'On file', False), side_kv('Paid by', 'CBZ', False))
    body = '<div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;flex:1;min-height:0"><div style="padding:32px;display:flex;flex-direction:column;gap:24px;overflow:auto">%s%s%s<div>%s%s</div></div>%s</div>' % (head, note, tabs, job, pay, side)
    return write(ROOT, 'PeoplePerson', 'People · Tinashe Moyo · /people/EMP-0005', shell('People', people_panel('Everyone'), top + body))

def time_off():
    top = topbar('Time off', 'sun', primary('Book time off', 'plus', 'N'), bell=False, vane=3)
    def req(code, name, what, note, acts):
        return ('<div class="card" style="padding:20px 24px;display:flex;flex-direction:column;gap:16px"><div style="display:flex;align-items:center;gap:16px"><span class="ref">%s</span><b style="color:var(--color-ink);font-weight:600">%s</b><span class="muted">%s</span><span class="pill pill-warn" style="margin-left:auto">Waiting</span></div>%s<div style="display:flex;gap:8px">%s</div></div>') % (code, name, what, note, acts)
    n1 = '<div class="vnote">%s<div><b>Two of four fitters would be out on Wednesday.</b><p>Farai is already off on the 21st, and Kuda leads the Pomona Offices job (212.40 m²) booked for that week. Blessing is free and has covered for Kuda before. Let’s approve it with Blessing on the Pomona job.</p></div></div>' % vmark(20)
    r1 = req('LV-0042', 'Kuda Chigumba', 'Annual leave, Tue 20 to Thu 22 October, 3 days', n1, btn('Approve, with Blessing covering', 'check', 'btn btn-primary', 'A') + btn('Approve', 'check') + btn('Decline', 'x', 'btn btn-quiet'))
    r2 = req('LV-0043', 'Tendai Sibanda', 'Sick leave, Mon 12 October, 1 day, note attached', '', btn('Approve', 'check') + btn('Decline', 'x', 'btn btn-quiet'))
    days = ['Mon 19', 'Tue 20', 'Wed 21', 'Thu 22', 'Fri 23', 'Sat 24']
    plan = {'Chipo Mhlanga': [1, 1, 1, 1, 1, 1], 'Kuda Chigumba': [0, 2, 2, 2, 0, 0], 'Farai Ncube': [0, 0, 1, 0, 0, 0], 'Tinashe Moyo': [0] * 6, 'Blessing Zhou': [0] * 6}
    bar = {0: '', 1: '<span style="display:block;height:26px;border-radius:4px;background:var(--color-accent-tint)"></span>',
           2: '<span style="display:block;height:26px;border-radius:4px;box-shadow:inset 0 0 0 1.5px var(--color-warning);background:repeating-linear-gradient(135deg,var(--color-warning-tint) 0 4px,#fff 4px 8px)"></span>'}
    trs = ''.join('<tr><td>%s</td>%s</tr>' % (n, ''.join('<td style="padding:0 8px">%s</td>' % bar[v] for v in vs)) for n, vs in plan.items())
    grid = '<div class="card" style="padding:0;overflow:hidden"><table class="table"><thead><tr><th style="width:30%%"></th>%s</tr></thead><tbody>%s</tbody></table></div>' % (''.join('<th>%s</th>' % d for d in days), trs)
    left = ('<div style="padding:40px 32px;display:flex;flex-direction:column;gap:16px;overflow:auto"><div style="display:flex;justify-content:space-between"><h2 class="text-heading">Waiting for you</h2><span class="muted mono">2</span></div>%s%s'
            '<div style="display:flex;justify-content:space-between;margin-top:32px"><h2 class="text-heading">Next week, Fitting and Showroom</h2><span class="muted">19 to 24 October</span></div>%s</div>') % (r1, r2, grid)
    side = '<aside style="box-shadow:inset 1px 0 0 var(--color-line);padding:40px 32px"><h3 class="text-heading" style="margin-bottom:16px">Annual leave left</h3>%s</aside>' % ''.join(
        side_kv(n, '%s days' % d) for n, d in (('Chipo Mhlanga', 4), ('Kuda Chigumba', 14), ('Farai Ncube', 9), ('Tinashe Moyo', 11), ('Blessing Zhou', 18), ('Tendai Sibanda', 16)))
    body = '<div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;flex:1;min-height:0">%s%s</div>' % (left, side)
    return write(ROOT, 'PeopleTimeOff', 'People · Time off · /people/time-off', shell('People', people_panel('Time off'), top + body))

RUN = [('EMP-0001', 'James Nyabadza', '$2,400.00', '—', '$2,400.00', '$31.50', '$643.98', '$19.32'),
       ('EMP-0006', 'Kuda Chigumba', '$780.00', '+$186.00', '$966.00', '$31.50', '$198.63', '$5.96'),
       ('EMP-0002', 'Rudo Mapfumo', '$950.00', '—', '$950.00', '$31.50', '$194.63', '$5.84'),
       ('EMP-0003', 'Chipo Mhlanga', '$820.00', '—', '$820.00', '$31.50', '$162.13', '$4.86'),
       ('EMP-0005', 'Tinashe Moyo', '$780.00', '—', '$780.00', '$31.50', '$152.13', '$4.56'),
       ('EMP-0007', 'Farai Ncube', '$780.00', '—', '$780.00', '$31.50', '$152.13', '$4.56'),
       ('EMP-0004', 'Tendai Sibanda', '$560.00', '—', '$560.00', '$25.20', '$98.70', '$2.96'),
       ('EMP-0009', 'Simba Gondo', '$480.00', '—', '$480.00', '$21.60', '$79.60', '$2.39'),
       ('EMP-0008', 'Blessing Zhou', '$420.00', '—', '$420.00', '$18.90', '$65.28', '$1.96')]

def run_table(dim=False):
    trs = ''
    for code, name, basic, ot, gross, nssa, paye, aids in RUN:
        flagged = code in ('EMP-0006', 'EMP-0009')
        otc = '<span class="chip-n">%s</span>' % ot if ot != '—' else '<span class="muted">—</span>'
        trs += '<tr%s><td><span class="ref">%s</span> <span class="cell-lead">%s</span></td><td class="num">%s</td><td class="num">%s</td><td class="num" style="font-weight:600">%s</td><td class="num">%s</td><td class="num">%s</td><td class="num">%s</td></tr>' % (
            ' style="background:var(--color-ground)"' if flagged else '', code, name, basic, otc, gross, nssa, paye, aids)
    trs += '<tr class="tot"><td>9 people</td><td></td><td class="num">+$186.00</td><td class="num">$8,156.00</td><td class="num">$254.70</td><td class="num">$1,747.21</td><td class="num">$52.41</td></tr>'
    head = '<tr><th>Person</th><th class="num">Basic</th><th class="num">Overtime</th><th class="num" style="color:var(--color-ink)">Gross %s</th><th class="num">NSSA</th><th class="num">PAYE</th><th class="num">AIDS levy</th></tr>' % ic('down')
    return '<div class="ws-scroll"%s><table class="table"><thead>%s</thead><tbody>%s</tbody></table></div>' % (' style="opacity:.5"' if dim else '', head, trs)

def pay_run():
    right = btn('Payslips', 'export') + btn('Approve the run', 'check', 'btn btn-primary', 'Ctrl ↵')
    top = topbar('October pay run', 'invoice', right, bell=False, vane=3)
    tools = ws_tools('Search the run', [('Team', 'Any', False), ('Paid by', 'Any', False), ('Vane', 'Flagged 2', True)], '9')
    ws = '<div class="ws">' + tools + run_table() + pager('1–9 of 9 · Rows 50') + '</div>'
    panel_ = ('<aside class="ask" aria-label="Vane"><div class="ask-b"><div class="vn-now"><span class="live-d" aria-hidden="true"></span><span class="truncate">Checking each person against September</span><span class="muted">9 of 9</span></div>'
              '<div class="vs">For you <span class="pn-n">2</span></div>%s%s<div class="vs">Broken down</div>%s</div></aside>') % (
        vcard('Issue', 'NSSA', 'Simba has no NSSA number.', 'The October return can’t include him without it. Let’s ask him on WhatsApp; the run can still be approved.', btn('Ask Simba', 'whatsapp'), issue=True),
        vcard('Suggestion', 'Overtime', 'Kuda’s overtime is 3 times his usual.', '$186.00 from 31 hours on the Pomona Offices job, all logged on its site visits. Let’s keep it.', btn('Keep it', 'check') + btn('Show the hours', 'tablegrid', 'btn btn-quiet')),
        vplan('October pay run', 'Pay day 25 Oct', 34, [('done', 'Count overtime from site visits', 'Vane'), ('done', 'Check each person against September', 'Vane'), ('now', 'Get Simba’s NSSA number', 'Rudo'), ('todo', 'Approve the run', 'James'), ('todo', 'Pay by CBZ and EcoCash', 'James'), ('todo', 'File PAYE and NSSA by 10 Nov', 'Rudo')]))
    body = '<div style="display:grid;grid-template-columns:minmax(0,1fr) 360px;flex:1;min-height:0">%s%s</div>' % (ws, panel_)
    return write(ROOT, 'PayRun', 'People · Payroll · October pay run · /people/payroll/2026-10', shell('People', people_panel('Payroll'), top + body))

def approve():
    top = topbar('October pay run', 'invoice', '', bell=False, vane=False, find=False)
    def line(icon, a, b, amt):
        return '<div style="display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:16px;align-items:center;min-height:64px;box-shadow:inset 0 -1px 0 var(--color-line)">%s<div><b style="font-weight:500;color:var(--color-ink)">%s</b><div class="muted" style="font-size:13px">%s</div></div><span class="mono" style="font-weight:600;color:var(--color-ink)">%s</span></div>' % (icon, a, b, amt)
    eco = '<span class="mk"><img src="%s" alt="EcoCash" style="width:28px;height:auto"></span>' % MARK['ecocash-wordmark.png']
    mi = lambda n: '<span class="mi">%s</span>' % ic(n)
    drawer = ('<div class="over"></div><aside class="drawer" aria-label="Approve and pay October"><div class="drawer-h"><span>Approve and pay October</span>%s</div>'
              '<div class="drawer-b"><p class="lede-figure"><span class="num">$6,101.68</span> to 9 people on 25 October. <span class="q"><span class="num">$8,156.00</span> gross, <span class="num">$2,054.32</span> deducted.</span></p>'
              '<section class="dsec"><h3>How it goes out</h3>%s%s</section><section class="dsec"><h3>What is owed after pay day</h3>%s%s%s</section>'
              '<div class="vnote">%s<div><b>I’ll add these to the plan once you approve.</b><p>Rudo gets the PAYE and NSSA returns drafted on 1 November, with a reminder on the 8th.</p></div></div></div>'
              '<div class="drawer-f">%s%s</div></aside>') % (
        iconbtn('x', 'Close'), line(mi('bank'), 'CBZ bank file', '5 people, uploaded to CBZ internet banking', '$4,366.46'), line(eco, 'EcoCash bulk payment', '4 people, from the merchant wallet', '$1,735.22'),
        line(mi('fiscal'), 'PAYE and AIDS levy to ZIMRA', 'Due 10 November', '$1,799.62'), line(mi('inspections'), 'NSSA, both shares', 'Due 10 November. Simba’s number is missing', '$509.40'), line(mi('training'), 'ZIMDEF, 1% of the payroll', 'Due 10 November', '$81.56'),
        vmark(20), btn('Cancel', 'x'), btn('Approve and make the files', 'check', 'btn btn-primary', 'Ctrl ↵'))
    main = top + '<div class="ws">' + run_table(dim=True) + '</div>'
    return write(ROOT, 'PayApprove', 'People · Payroll · Approve and pay October', shell('People', people_panel('Payroll'), main, drawer))

def payslip():
    rows = ''.join('<div style="display:flex;justify-content:space-between;align-items:center;min-height:44px;box-shadow:inset 0 -1px 0 var(--color-line)"><span class="muted" style="font-size:15px">%s</span><span class="mono" style="font-size:15px;color:var(--color-ink)">%s</span></div>' % r for r in (
        ('Basic pay', '$780.00'), ('NSSA', '−$31.50'), ('PAYE', '−$152.13'), ('AIDS levy', '−$4.56'), ('Advance, repaid', '−$50.00')))
    rows += '<div style="display:flex;justify-content:space-between;align-items:center;min-height:48px"><b style="font-size:15px">To your bank</b><b class="mono" style="font-size:15px">$541.81</b></div>'
    body = ('<div style="width:390px;height:844px;display:flex;flex-direction:column;background:var(--color-surface)">'
            '<header style="display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 8px;box-shadow:inset 0 -1px 0 var(--color-line)">%s<b style="font-size:17px">October payslip</b>%s</header>'
            '<div style="padding:24px 16px;display:flex;flex-direction:column;gap:24px"><div><span class="muted">Paid to CBZ on 25 October</span><div class="mono" style="font-size:34px;font-weight:600;margin-top:6px;color:var(--color-ink)">$541.81</div></div>'
            '<div>%s</div>'
            '<div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:20px 16px"><div><b style="font-size:17px"><span class="mono">11</span> days</b><div class="muted">annual leave left</div></div>%s</div>'
            '<div class="card" style="display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:12px;align-items:start;padding:20px 16px">%s<div><b>Your contract ends on 31 October.</b><p class="muted" style="margin-top:4px">James has a renewal ready for you to sign.</p></div>%s</div></div></div>') % (
        iconbtn('back', 'Back'), iconbtn('export', 'Download the payslip'), rows, btn('Ask for time off', 'sun', 'btn btn-lg'), vmark(20), btn('Read it', 'docs'))
    return write(ROOT, 'PaySlipPhone', 'People · A payslip, on Tinashe’s phone', body, w=390, h=844)

if __name__ == '__main__':
    for f in (everyone, person, time_off, pay_run, approve, payslip):
        print(f())
