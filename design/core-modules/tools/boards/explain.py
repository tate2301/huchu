import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import *
ROOT = sys.argv[1]

def head(kicker, title, lede):
    return '<div class="xp-k">%s<span>%s</span></div><h1>%s</h1><p class="lede">%s</p>' % (vmark(20), kicker, title, lede)

def sec(title, aside, body):
    return '<section class="xp-sec"><div><h2>%s</h2><p class="aside">%s</p></div><div>%s</div></section>' % (title, aside, body)

def cards(items, cols):
    return '<div class="xp-cards" style="grid-template-columns:repeat(%d,minmax(0,1fr))">%s</div>' % (cols, ''.join(
        '<div class="xp-card">%s<b>%s</b><p>%s</p></div>' % (vmark(20) if i == 'VANE' else ic(i), a, b) for i, a, b in items))

def how_vane():
    loop = '<div class="xp-cards" style="grid-template-columns:repeat(5,minmax(0,1fr))">%s</div>' % ''.join('<div class="xp-card">%s<b>%s</b><p>%s</p></div>' % (ic(i), a, b) for i, a, b in (
        ('eye', 'Watches', 'New and changed records in every product the workspace runs, a check every few minutes, and a nightly run at 06:00.'),
        ('tablegrid', 'Works it out', 'Reads through a read-only SQL role, compares with the workspace’s own habits, and keeps the SQL it ran.'),
        ('bulb', 'Raises and drafts', 'Writes an issue or a suggestion, drafts the invoice, reminder or payslip change, or breaks a bigger job into a plan.'),
        ('person', 'A person acts', 'Sends, approves, pays or changes, with the same buttons and shortcuts as the rest of the workspace.'),
        ('check', 'Closes the loop', 'Marks the item done, notes what was taken and what was muted, and learns which suggestions this workspace wants.')))
    two = ('<div class="xp-cards" style="grid-template-columns:1fr 1fr"><div class="xp-card" style="padding:24px 32px"><b style="text-align:center;margin-top:0">%s On its own</b><ul class="dots" style="margin-top:12px">%s</ul></div>'
           '<div class="xp-card" style="padding:24px 32px"><b style="text-align:center;margin-top:0">%s Waits for a person</b><ul class="dots" style="margin-top:12px">%s</ul></div></div>') % (
        ic('check'), ''.join('<li>%s</li>' % x for x in ('Read what the workspace allows', 'Work out figures and compare with habits', 'Draft invoices, reminders, payslip changes, report questions', 'Propose bank matches and leave cover', 'Break a job into a plan and do its read-only steps', 'Raise issues and suggestions')),
        ic('person'), ''.join('<li>%s</li>' % x for x in ('Send a message, reminder or quote', 'Approve leave or a pay run', 'Pay anyone, or record a payment', 'Accept a bank match', 'Change a record or a salary', 'File a return with ZIMRA or NSSA')))
    life = '<div style="display:grid;grid-template-columns:1fr 24px 1fr 24px 1fr 24px 1fr;align-items:center;gap:8px">%s</div>' % '<span class="muted" style="text-align:center">→</span>'.join(
        '<div class="xp-card">%s<p style="margin-top:8px">%s</p></div>' % (a, b) for a, b in (
            ('<span class="pill pill-info">Open</span>', 'Shown in For you, the panel and beside the record'), ('<span class="pill pill-plain">Done</span>', 'A person pressed the action; the outcome is kept'),
            ('<span class="pill pill-warn">Muted</span>', 'Not now, with an optional reason; it stops coming back'), ('<span class="pill pill-plain">Out of date</span>', 'The record changed and the item no longer holds')))
    srcs = '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">%s<span class="muted">→</span>%s<b style="font-size:16px">Vane</b></div>' % (
        ''.join('<span class="chipsel" style="height:36px">%s</span>' % p for p in ('Books', 'CRM', 'Tender', 'People', 'Reports', 'Explore')), vmark(40))
    body = '<div class="xp">%s%s%s%s%s</div>' % (
        head('Vane', 'How Vane works', 'Vane is part of every Corelith workspace, not a separate app. It works all day in the background, finds what needs a person, and gets the work ready. People decide and press the button.'),
        sec('The loop', 'Five steps, running for every workspace on its own queue.', loop),
        sec('What it does on its own, and what waits', 'Enforced on the server. Vane’s tools can only write drafts and its own items.', two),
        sec('An item’s life', 'Every issue and suggestion is one row in <span class="mono">vane_items</span>, with the SQL it ran and what it read.', life),
        sec('Where it reads from', 'The products a workspace runs feed one Vane. A new product adds its tables; Vane needs no new screen.', srcs))
    return write(ROOT, 'Main', 'How Vane works', body, h=1720)

def notify_how():
    body = '<div class="xp">%s%s%s%s%s</div>' % (
        head('Vane', 'Notifications and activity', 'One place for what needs you and what happened to your things, and one full record of everything. Vane’s own work stays in Vane; what it needs from a person arrives here like anything else.'),
        sec('Three surfaces, three jobs', 'Each event goes to one place first, so nothing is said twice.', cards((
            ('bell', 'The bell', 'What needs you, what changed on your records, and mentions. Actions work in place: approve, reply, check the run.'),
            ('VANE', 'Vane', 'What Vane is working on, its plans and its drafts. When it needs a person, that item also appears under Needs you.'),
            ('activity', 'Activity', 'Every event in the workspace, by people and by Vane, as a worksheet. It is the audit record and it can be exported.')), 3)),
        sec('Kinds', 'The bell’s tabs.', '<div class="xp-rows">%s</div>' % ''.join('<div class="xp-row" style="grid-template-columns:240px minmax(0,1fr)"><b>%s</b><span>%s</span></div>' % r for r in (
            ('Needs you', 'Approvals, mentions, Vane’s issues. Stays until it is done or dismissed.'), ('Updates', 'Payments in, records you own that changed, tills closed. Read and gone.'),
            ('Mentions', 'Someone named you on a record. Also counted in Needs you.')))),
        sec('The item', 'An icon for where it came from, a headline in sentence case, one line of detail with the figure, the time, and the action when there is one.',
            '<div class="card" style="padding:0;max-width:640px;overflow:hidden">%s</div>' % (
                '<div class="nt is-new"><span class="dot"></span>%s<div><b>Kuda Chigumba asked for annual leave</b><p>Tue 20 to Thu 22 October. Two of four fitters would be out on Wednesday.</p></div><time>08:41</time><div class="acts">%s%s</div></div>' % (ic('sun'), btn('Approve', 'check'), btn('Decline', 'x', 'btn btn-quiet')) +
                '<div class="nt is-new"><span class="dot"></span>%s<div><b>October’s pay run is ready to check</b><p>$6,101.68 net for 9 people. 2 things to look at.</p></div><time>06:12</time><div class="acts">%s</div></div>' % (vmark(18), btn('Check the run', 'eye')) +
                '<div class="nt"><span class="dot"></span>%s<div><b>Chisipite Dental paid INV-0131</b><p>$1,240.00 by EcoCash. It was 12 days late.</p></div><time>10:40</time></div>' % ic('payments'))),
        sec('Rules', 'Checked in review.', '<ul class="dots">%s</ul>' % ''.join('<li>%s</li>' % x for x in (
            'Nothing you did yourself notifies you', 'Repeats group: three payments in an hour are one item', 'Every item opens its record; actions in the bell are the same buttons as on the record',
            'Quiet hours hold phone and WhatsApp, never the bell', 'Unread is a dot and a heavier headline, not a colour fill', 'Phone and WhatsApp are opt-in per kind, set in Management'))))
    return write(ROOT, 'NotifyHow', 'Notifications and activity · how they work', body, h=1960)

def well(inner, pad='24px'):
    return '<div style="padding:%s;border-radius:12px;background:var(--color-ground);box-shadow:var(--shadow-ring)">%s</div>' % (pad, inner)

def topbtns():
    return ('<div style="display:flex;gap:16px">%s<button class="btn vn-b is-vane" aria-pressed="true">%s<span class="ask-l">Vane</span><span class="vn-c">5</span><span class="live-d"></span></button>'
            '<button class="btn vn-b">%s<span class="ask-l">Vane</span><span class="vn-c">0</span><span class="status" style="gap:0"></span></button>'
            '<button class="btn vn-b">%s<span class="ask-l">Vane</span><span class="vn-c">Paused</span></button></div>') % (vane_btn(5), vmark(16), vmark(16), vmark(16))

def panel_demo():
    return ('<div style="display:grid;grid-template-columns:400px minmax(0,1fr);gap:32px"><aside class="ask" style="height:560px;border-radius:10px;box-shadow:var(--shadow-ring);background:var(--color-surface)">'
            '<div class="ask-h">%s<b>Vane</b><span class="live">Working</span><div class="tb-r">%s%s</div></div>'
            '<div class="ask-b"><div class="vn-now"><span class="live-d"></span><span class="truncate">Working out October’s pay run</span><span class="muted">6 of 9 people</span></div><div class="vs">For you <span class="pn-n">2</span></div>%s</div>'
            '<div class="ask-c"><label class="input-wrap ask-in" style="flex:1"><input type="text" aria-label="Give Vane a job" placeholder="Give Vane a job"></label>%s</div></aside>'
            '<ul class="dots">%s</ul></div>') % (
        vmark(18), iconbtn('pause', 'Pause Vane'), iconbtn('x', 'Close Vane'),
        vcard('Issue', 'People', 'Simba has no NSSA number.', 'October’s NSSA return can’t include him without it. Let’s ask him for it on WhatsApp.', btn('Ask Simba', 'whatsapp'), issue=True),
        iconbtn('upload', 'Hand it over', 'btn btn-icon'),
        ''.join('<li>%s</li>' % x for x in ('Now: the job it is on, with progress', 'For you: issues and suggestions for this module, then the rest', 'Broken down: plans with steps owned by Vane or a person', 'Done while you were away', 'Give Vane a job: a plain request, answered with a plan or a draft')))

def touch():
    flagrow = ('<div class="card" style="padding:0;overflow:hidden"><table class="table"><thead><tr><th>Person</th><th>Role</th><th>Contract</th><th class="num">Pay</th><th>Vane</th></tr></thead><tbody>'
               '<tr><td><span class="ref">EMP-0005</span> Tinashe Moyo</td><td>Fitter</td><td>Fixed term</td><td class="num mono">$780.00</td><td>%s</td></tr>'
               '<tr><td><span class="ref">EMP-0006</span> Kuda Chigumba</td><td>Fitter</td><td>Permanent</td><td class="num mono">$780.00</td><td class="muted">—</td></tr></tbody></table></div>'
               '<div class="card" style="display:grid;grid-template-columns:20px minmax(0,1fr) auto auto;gap:12px;align-items:center;margin-top:16px">%s<div><b>Tinashe’s contract ends on 31 October.</b><p class="muted">He has been on the same terms for 12 months and made 31 site visits since July. Let’s renew it for another 12 months.</p></div>%s%s</div>') % (
        vflag('Contract ends 31 Oct'), vmark(20), btn('Draft the renewal', 'docs'), iconbtn('x', 'Not now'))
    form = ('<div style="display:grid;grid-template-columns:200px 320px;gap:16px;align-items:start"><span class="muted" style="padding-top:8px">Cover while away</span>'
            '<div><label class="input-wrap"><input aria-label="Cover while away" placeholder="Blessing Zhou">%s</label><p style="display:flex;gap:8px;margin-top:8px;font-size:13px;color:var(--color-ink-2)">%s Blessing has covered Farai’s jobs twice this year and is free on those days.</p></div></div>') % (kbd('Tab'), vmark(16))
    draft = '<div class="card" style="display:flex;align-items:center;gap:12px">%s<span><b>Vane drafted this.</b> <span class="muted">Nothing has been sent.</span></span><span style="margin-left:auto;display:flex;gap:8px">%s%s</span></div>' % (
        vmark(20), btn('Discard', 'x', 'btn btn-quiet'), btn('Send', 'send', 'btn btn-primary', 'S'))
    wa = '<div class="card" style="max-width:520px;display:grid;grid-template-columns:20px minmax(0,1fr);gap:12px">%s<div><b>Floorcode, from Vane</b><p style="margin-top:6px;line-height:1.6;color:var(--color-ink)">Good morning, James. 3 things for you: Simba has no NSSA number; October’s pay run is ready to check, $6,101.68 net; Tinashe’s contract ends on 31 October.</p><span class="mono muted" style="font-size:12px">07:00</span></div></div>' % ic('whatsapp')
    body = '<div class="xp">%s%s%s%s%s%s%s</div>' % (
        head('Vane', 'Where people meet Vane', 'Vane lives inside the screens people already use. It never opens a separate chat; it speaks where the work is, in the workspace’s own components.'),
        sec('1 · The top bar', 'On every page: the mark, the count of open items for this person, and a dot that pulses while Vane is working. Ctrl J opens the panel.', well(topbtns())),
        sec('2 · The panel', 'Opens on the right of any module, 400 px, and shows this module’s items first. Closing it never loses anything.', well(panel_demo())),
        sec('3 · Beside the record', 'In a table, a row Vane has something on carries a short flag in its own column. In a record, the note sits above the section it concerns.', flagrow),
        sec('4 · In a form', 'When Vane knows a likely answer, it shows it in the box, greyed. Tab takes it; typing replaces it. It never fills a box silently.', well(form)),
        sec('5 · Drafts', 'A draft Vane made opens in the normal screen, marked at the top, so the person edits and sends it like any other.', well(draft)),
        sec('6 · Outside the workspace', 'At 07:00, people who asked for it get one message with what Vane found overnight. Each line opens the item. Quiet hours hold the rest.', well(wa)))
    return write(ROOT, 'VaneTouch', 'Vane · Where people meet Vane', body, h=2920)

def components():
    def kvl(k, v):
        return '<div style="display:grid;grid-template-columns:180px minmax(0,1fr);align-items:center;gap:24px;min-height:64px;box-shadow:inset 0 -1px 0 var(--color-line)"><b style="font-weight:600">%s</b><div>%s</div></div>' % (k, v)
    mark = kvl('Mark', '<div style="display:flex;gap:16px;align-items:center">%s%s%s</div>' % (vmark(16), vmark(20), vmark(32)))
    stat = kvl('Status', '<div style="display:flex;gap:24px;font-size:13px"><span class="status status-live">Working</span><span class="status">Up to date</span><span class="status" style="gap:6px">%s Paused</span><span class="status" style="gap:6px">%s Out of jobs this month</span></div>' % (ic('pause'), ic('issue')))
    now = kvl('Now line', '<div class="vn-now" style="max-width:420px"><span class="live-d"></span><span>Reading the CBZ statement Rudo uploaded</span><span class="muted">38 of 61 lines</span></div>')
    items = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s%s%s%s</div>' % (
        vcard('Suggestion', 'People', 'October’s pay run is ready to check.', '$6,101.68 net for 9 people. Kuda’s overtime is 3 times his usual. Let’s go through the run.', btn('Check the run', 'eye', 'btn btn-primary', 'R')),
        vcard('Issue', 'People', 'Simba has no NSSA number.', 'October’s NSSA return can’t include him without it. Let’s ask him for it on WhatsApp.', btn('Ask Simba', 'whatsapp'), issue=True),
        '<article class="vc"><div class="vc-k">%s<span>Done</span><span class="muted">by James, 08:12</span></div><h3>Sent 3 reminders.</h3><p>Chisipite Dental paid $1,240.00 at 10:40.</p></article>' % ic('check'),
        '<article class="vc"><div class="vc-k">%s<span>Suggestion</span><span class="muted">Books</span></div><h3>3 invoices are overdue.</h3><p>Chisipite Dental first: 12 days late.</p><div class="vc-k">%s<span>What it read and ran</span></div><div class="vc-k">%s<span>3 overdue invoices, 31 paid ones</span><span class="muted" style="margin-left:auto">Books</span></div><div class="sql" style="padding:8px 12px;border-radius:6px;background:var(--color-ground);font-size:12px;white-space:pre-wrap">select number, balance, current_date - due_on as days_late\nfrom invoices where balance &gt; 0 and due_on &lt; current_date;</div></article>' % (ic('suggestion'), ic('sql'), ic('invoice')))
    plans = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">%s%s</div>' % (
        vplan('October pay run', 'Pay day 25 Oct', 34, [('done', 'Count overtime from site visits', 'Vane'), ('done', 'Check each person against last month', 'Vane'), ('now', 'Get Simba’s NSSA number', 'Rudo'), ('todo', 'Approve the run', 'James'), ('todo', 'Pay by CBZ and EcoCash', 'James'), ('todo', 'File PAYE and NSSA by 10 Nov', 'Rudo')]),
        vplan('VAT for September', 'Due 25 Oct', 25, [('done', 'Match the CBZ lines since Friday', 'Vane, 3 of 4'), ('now', 'Find VAT numbers on 2 receipts', 'Vane'), ('todo', 'Check the return Vane drafted', 'You'), ('todo', 'File the return on ZIMRA’s portal', 'You')]))
    other = (kvl('Row flag', '<div style="display:flex;gap:16px">%s%s</div>' % (vflag('Contract ends 31 Oct'), vflag('3 times his usual overtime'))) +
             kvl('Record note', '<div class="card" style="display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:12px;align-items:center;max-width:560px">%s<div><b>Tinashe’s contract ends on 31 October.</b><p class="muted">Let’s renew it for another 12 months.</p></div>%s</div>' % (vmark(20), btn('Draft the renewal', 'docs'))) +
             kvl('Suggested answer', '<label class="input-wrap" style="max-width:280px"><input aria-label="Suggested answer" placeholder="Blessing Zhou">%s</label>' % kbd('Tab')) +
             kvl('Draft bar', '<div class="card" style="display:flex;align-items:center;gap:12px;max-width:560px">%s<span><b>Vane drafted this.</b> <span class="muted">Nothing has been sent.</span></span><span style="margin-left:auto">%s</span></div>' % (vmark(20), btn('Discard', 'x', 'btn btn-quiet'))) +
             kvl('Give Vane a job', '<div style="display:flex;gap:8px;max-width:360px"><label class="input-wrap" style="flex:1"><input aria-label="Give Vane a job" placeholder="Give Vane a job"></label>%s</div>' % iconbtn('upload', 'Hand it over', 'btn btn-icon')))
    cant = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s%s%s%s</div>' % (
        '<article class="vc"><div class="vc-k">%s<span>Couldn’t work it out</span><span class="muted">People</span></div><h3>Blessing’s hours for 14 October are missing.</h3><p>No site visit or clock-in for that day, so overtime can’t be counted. Let’s ask Farai, who led the job.</p><div class="vc-a">%s%s</div></article>' % (ic('help'), btn('Ask Farai', 'whatsapp'), btn('Show the rows', 'tablegrid', 'btn btn-quiet')),
        '<article class="vc"><div class="vc-k">%s<span>Paused</span><span class="muted">by James, 07:30</span></div><h3>Vane is paused.</h3><p>Items stay here to read. Nothing new is worked out until it restarts.</p><div class="vc-a">%s</div></article>' % (ic('pause'), btn('Restart Vane', 'run')),
        '<article class="vc"><div class="vc-k">%s<span>Out of jobs</span><span class="muted">Management</span></div><h3>This month’s 5,000 jobs are used.</h3><p>Vane finished the job it was on and stopped. It starts again on 1 November.</p><div class="vc-a">%s</div></article>' % (ic('issue'), btn('See the plan', 'bank')),
        '<div style="display:grid;place-items:center;text-align:center;padding:24px">%s<b style="margin-top:12px">Nothing for you</b><p class="muted">Vane is up to date. It last checked at 11:48.</p></div>' % vmark(32))
    body = '<div class="xp">%s%s%s%s%s%s</div>' % (
        head('Vane', 'Vane’s components', 'Every piece Vane uses, with its states. They are built from the workspace kit and take the workspace theme, so Vane looks like the product it is in.'),
        sec('Mark and status', 'The mark is an ink tile with the vane arrow, at 16, 20 and 32. The dot says what Vane is doing.', mark + stat + kvl('Top bar button', topbtns()) + now),
        sec('Items', 'One headline that states the fact, a reason, and a closing “Let’s”. The button names the act. Issues use the warning colour on their icon only.', items),
        sec('Plans', 'A bigger job broken into steps. Vane does its read-only steps and leaves the rest to a named person.', plans),
        sec('In other components', 'The pieces Vane adds to tables, records, forms and drafts.', other),
        sec('When it can’t', 'Plain words, what it tried, and a way on.', cant))
    return write(ROOT, 'VaneComponents', 'Vane · Components and states', body, h=3000)

def rules():
    rs = (('It has no window of its own', 'No chat app, no floating bubble. Vane appears in the top bar, the panel, beside records and in drafts.'),
          ('It uses the workspace’s components', 'Its cards, plans, flags and drafts are built from the same kit as every module: the same buttons, tables, shortcuts and focus ring.'),
          ('It takes the workspace’s theme', 'Tender’s orange in a retail workspace, Campus’s in a school. Only the mark stays ink, so Vane is recognisable everywhere.'),
          ('It speaks like a colleague', 'First person, plain, with names and exact amounts. It ends with “Let’s …”. The button says the act: Send 3 reminders, never Do it.'),
          ('It shows its working', 'Every item can show the records it read and the SQL it ran. Nothing it says is unchecked.'),
          ('It waits for a person', 'Sending, paying, approving and changing are always a person’s press, enforced on the server.'),
          ('It respects people’s time', 'Quiet hours hold messages. Muted items stop coming back. One morning message, not a stream.'),
          ('It is never called AI', 'The interface says Vane. Claude is named once, on the Vane page in Management, as what Vane runs on.'))
    grid = '<div class="xp-cards" style="grid-template-columns:1fr 1fr">%s</div>' % ''.join(
        '<div class="xp-card" style="display:grid;grid-template-columns:32px minmax(0,1fr);gap:8px;padding:20px 24px"><span class="mono muted">%02d</span><div><b style="margin:0 0 6px">%s</b><p style="font-size:14px">%s</p></div></div>' % (i + 1, a, b) for i, (a, b) in enumerate(rs))
    keys = '<div class="xp-rows">%s</div>' % ''.join('<div class="xp-row" style="grid-template-columns:240px minmax(0,1fr)"><span>%s</span><span>%s</span></div>' % (kbd(k), v) for k, v in (
        ('Ctrl J', 'Open or close the Vane panel'), ('S', 'Send, on the focused card'), ('R', 'Check the run, on a pay run card'), ('Tab', 'Take a suggested answer'), ('Esc', 'Close the panel')))
    body = '<div class="xp">%s%s%s</div>' % (head('Vane', 'Why Vane feels part of the workspace', 'Eight rules every screen that shows Vane follows. Breaking one is a defect, the same as a wrong font.'),
                                           sec('The rules', 'Checked in review with the lint and by eye.', grid), sec('Keys', 'Every primary action has one.', keys))
    return write(ROOT, 'VaneRules', 'Vane · The rules', body, h=1700)

if __name__ == '__main__':
    for f in (how_vane, notify_how, touch, components, rules):
        print(f())
