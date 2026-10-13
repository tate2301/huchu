import sys
sys.path.insert(0, 'gen2/port')
from ri_shared import *
import vn_data as V
P = sys.argv[1]
theme('corelith')

def sheet_doc(title, sub, inner):
    return T('''<div style="min-height: 100%; box-sizing: border-box; background: #ffffff; color: [[ink]]; font: 400 13.5px/1.45 [[sans]]; padding: 48px 56px 64px;">
  <div style="display: flex; align-items: center; gap: 10px; color: [[muted]]; font-size: 12.5px; font-weight: 500;">[[vm]]Vane · every workspace</div>
  <h1 style="margin: 10px 0 6px; font-size: 26px; font-weight: 600; letter-spacing: -0.015em;">[[t]]</h1>
  <p style="margin: 0 0 28px; max-width: 780px; color: [[ink2]]; font-size: 14.5px;">[[s]]</p>
[[x]]
</div>''', vm=VANE_MARK(), t=title, s=sub, x=inner)

def h2(t, s=''):
    return T('<h2 style="margin: 30px 0 4px; font-size: 16px; font-weight: 600;">[[t]]</h2>[[s]]', t=t, s=T('<p style="margin: 0 0 12px; color: [[muted]];">[[s]]</p>', s=s) if s else '')

def box(title, body, tone='plain', w=''):
    bg, bd = {'plain': ('#ffffff', C['line']), 'vane': (C['ground'], C['strong']), 'person': (C['sel'], '#bcd0f7'), 'app': ('#ffffff', C['strong'])}[tone]
    return T('<div style="flex: 1 1 0; min-width: 0; [[w]] padding: 12px 14px; border: 1px solid [[bd]]; border-radius: 10px; background: [[bg]]; display: flex; flex-direction: column; gap: 4px;"><span style="font-weight: 600;">[[t]]</span><span style="color: [[ink2]]; font-size: 13px;">[[b]]</span></div>', w=w, bd=bd, bg=bg, t=title, b=body)
def arrow():
    return T('<span style="flex: none; align-self: center; display: flex; color: [[faint]];">[[i]]</span>', i=icon('arrowRight', 16))
def flow(boxes):
    out = []
    for i, b in enumerate(boxes):
        if i: out.append(arrow())
        out.append(box(*b))
    return T('<div style="display: flex; gap: 8px; align-items: stretch;">[[x]]</div>', x=''.join(out))
def legend():
    return T('<div style="display: flex; gap: 16px; margin: 10px 0 0; font-size: 12.5px; color: [[muted]];"><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: [[ground]]; border: 1px solid [[strong]];"></span>Vane, on its own</span><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: [[sel]]; border: 1px solid #bcd0f7;"></span>A person presses</span><span style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: #ffffff; border: 1px solid [[strong]];"></span>The app, as it works today</span></div>')

# ================= Tree =================
def node(depth, name, route, what, tag=None):
    pad = depth * 28
    tg = (' ' + chip(*tag)) if tag else ''
    rail = ''.join(T('<span style="position: absolute; left: [[x]]px; top: 0; bottom: 0; width: 1px; background: [[strong]];"></span>', x=14 + i * 28) for i in range(depth))
    elbow = T('<span style="position: absolute; left: [[x]]px; top: 20px; width: 12px; height: 1px; background: [[strong]];"></span>', x=14 + (depth - 1) * 28) if depth else ''
    return T('<div style="position: relative; display: grid; grid-template-columns: [[w]]px minmax(0, 1fr); gap: 16px; align-items: start; padding: 10px 0 10px [[p]]px; border-bottom: 1px solid [[soft]];">[[rail]][[elbow]]<span style="display: flex; flex-direction: column; gap: 2px; padding-left: [[pl]]px;"><span style="font-weight: 600;">[[n]][[tg]]</span><span style="font: 12px [[mono]]; color: [[muted]];">[[r]]</span></span><span style="color: [[ink2]];">[[wh]]</span></div>', w=330 - pad, p=pad, pl=6 if depth else 0, rail=rail, elbow=elbow, n=name, tg=tg, r=route, wh=what)
TREE = [
 (0, 'Vane', 'rail, above Settings', 'Its own module, the button in every top bar, and the panel. Each person sees only what they could open themselves.'),
 (1, 'For you', '/vane', 'Issues and suggestions for this person, newest first, this module’s first when opened from the panel.'),
 (2, 'A card', '/vane/items/[id]', 'Kind and source, one fact, the reason, “Let’s …”, the button that names the act. What I read: the report templates and the question it ran.'),
 (1, 'Working on', '/vane/working', 'Jobs running now with their progress, and jobs queued.'),
 (1, 'Plans', '/vane/plans/[id]', 'Work broken into steps, each owned by Vane or by a person: VAT, the close, a pay run, the returns.'),
 (1, 'Done', '/vane/done', 'What Vane finished and what people did with its drafts, by day.'),
 (1, 'Muted', '/vane/muted', 'Cards set aside with Not now, and the reason. Bring one back, or stop that kind.'),
 (1, 'Give Vane a job', 'panel foot · Ctrl J', 'Ask in a sentence. Vane answers, or proposes a plan and waits for Start.', ('New', 'info')),
 (1, 'The panel', 'top bar button · Esc closes', 'Opens beside any page: working now, this page’s cards first, plans, done while you were away.'),
 (1, 'Inside modules', 'where the work is', 'Books: drafts and the close. Reports: explain a figure, a block in the builder, notes on Insights. Build: changes to forms, checks on documents. People and pay: run checks, leave cover. Retail, Schools, Mine: their own cards.'),
 (1, 'Settings', 'Management → Vane', 'What it watches, what it may draft, quiet hours, who hears about what, this month’s jobs. The one place Claude is named.'),
]
tree = ''.join(node(*t) for t in TREE)
pipe = flow([('Something changes', 'A record is saved, a schedule comes round (every few minutes, 06:00, Monday), or someone asks.', 'app'),
             ('A job', 'One per workspace, kind, subject and day, so it never runs twice.', 'vane'),
             ('Vane reads', 'Through report templates, as the person it is for. Read only.', 'vane'),
             ('Vane writes', 'A card, a plan, or a draft marked as Vane’s. Nothing else.', 'vane'),
             ('A person presses', 'Send, issue, approve, keep, publish, file: the app’s own buttons.', 'person')])
inner = T('''<div class="cm-grid2" style="display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 48px; align-items: start;">
  <div>[[h1]]<div style="border-top: 1px solid [[line]];">[[tree]]</div></div>
  <div>[[h2]][[pipe]][[lg]][[h3]][[ws]]</div>
</div>''', h1=h2('The tree', 'Routes are proposed; nothing of Vane exists in the app yet.'), tree=tree,
  h2=h2('How a job runs', 'The same five steps for every template.'), pipe=T('<div style="display: flex; flex-direction: column; gap: 8px;">[[x]]</div>', x=pipe.replace('flex: 1 1 0; min-width: 0;', 'flex: 1 1 0; min-width: 0;')), lg=legend(),
  h3=h2('In each workspace', 'Same module, its own watches.'),
  ws=table([('Workspace', '150px', 'l'), ('Vane watches', 'minmax(0, 1fr)', 'l'), ('Templates', '80px', 'r')],
           [[('Sales and CRM', 'lead'), ('Books, Pipeline, Site visits, Showroom, Reports, Build', 'wrap'), str(sum(1 for j in V.J if j[1] in ('Books', 'Sales and CRM', 'Reports', 'Forms and documents', 'People and pay')))],
            [('Retail', 'lead'), ('The floor, Stock, Buying, Books, Reports', 'wrap'), str(sum(1 for j in V.J if j[1] in ('Books', 'Retail', 'Reports', 'People and pay')))],
            [('Schools', 'lead'), ('Fees, Today, Books, People and pay, Reports, Build', 'wrap'), str(sum(1 for j in V.J if j[1] in ('Books', 'Schools', 'Reports', 'People and pay', 'Forms and documents')))],
            [('Gold mine', 'lead'), ('Gold, Production, Stores, Maintenance, Books, Reports', 'wrap'), str(sum(1 for j in V.J if j[1] in ('Books', 'Gold mine', 'Reports', 'People and pay')))],
            [('Payroll services', 'lead'), ('Payroll, People, Books', 'wrap'), str(sum(1 for j in V.J if j[1] in ('Books', 'People and pay')))]], pad='0 12px', rowh=48).replace('text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', 'text-align: left; padding-top: 9px; padding-bottom: 9px;'))
save(P, 'VnTree.dc.html', doc('Vane · The tree', sheet_doc('The tree', 'Vane is one module in every workspace and a panel beside every page. It reads what the person could read, writes cards, plans and drafts, and waits for a person to press the button.', inner), {}, 1440, 1240))

# ================= Templates =================
rows = []
groups = []
for j in V.J:
    if j[1] not in groups: groups.append(j[1])
for g in groups:
    js = [j for j in V.J if j[1] == g]
    rows.append(('__group__', g, str(len(js)), ''))
    for j in js:
        st = V.STATES[j[10]]
        kt = {'Issue': 'warn', 'Suggestion': 'neutral', 'Plan': 'info', 'Draft': 'info', 'Answer': 'neutral'}[j[3]]
        rows.append([(j[2] + '<br><span style="font: 11.5px ' + MONO + '; color: ' + C['muted'] + ';">' + j[0] + '</span>', 'wrap'), (j[3], 'chip', kt), (j[4], 'wrap'), (j[5], 'wrap'), (j[6], 'wrap'), (j[7], 'wrap'), (j[8], 'wrap'), (st[0], 'chip', st[1])])
tt = table([('Template', '200px', 'l'), ('Kind', '92px', 'l'), ('When', '130px', 'l'), ('Reads (report templates)', 'minmax(0, 1fr)', 'l'), ('Vane does on its own', 'minmax(0, 1.1fr)', 'l'), ('The person presses', '150px', 'l'), ('Lands in', '150px', 'l'), ('', '120px', 'l')], rows, pad='0 12px', rowh=56)
tt = tt.replace('text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', 'text-align: left; padding-top: 9px; padding-bottom: 9px;')
FIELDS = [('Kind', 'Issue (something is wrong), Suggestion (something to do), Plan (work in steps), Draft (a record or a block, marked as Vane’s), Answer (to a question someone asked).'),
          ('When', 'A record change, a schedule, or someone asking. Quiet hours hold the telling, not the work.'),
          ('Reads', 'Report templates, never tables. If the person cannot open the report, Vane cannot read it for them.'),
          ('Does on its own', 'Reading, working out, comparing with habits, drafting, planning. Nothing a customer, a bank or ZIMRA would see.'),
          ('The person presses', 'One button that names the act, with its shortcut. It calls the same endpoint as the app’s own button.'),
          ('Lands in', 'A card in For you, a plan, or a draft in its module. Drafts carry “Vane’s draft” until someone changes or issues them.'),
          ('Routed to', 'A role or a person, from Management → Vane. Fitters get only their own visits and quotes.')]
fl = ''.join(T('<div style="display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid [[soft]];"><span style="font-weight: 600;">[[k]]</span><span style="color: [[ink2]];">[[v]]</span></div>', k=k, v=v) for k, v in FIELDS)

rep = flow([('Report template', 'Vane reads Quotes, opened 7 days, every owner: the same view a person would open.', 'app'), ('Card', '“16 quotes have had no reply for 7 days.” What I read opens that exact view.', 'vane'), ('Save as a template', 'If people open the view every week, Vane names it and suggests saving it.', 'person')])
blk = flow([('Ask in the builder', '“Add won m² by month.”', 'person'), ('Vane’s block', 'The question in Steps, or SQL when it needs a join, with its rows. An accent line marks it.', 'vane'), ('Keep', 'The block becomes yours. Not now removes it. Saving the report is still Save.', 'person')])
frm = flow([('Answers come in', 'Site visit answers, read weekly per form.', 'app'), ('Vane’s change', '“Make Subfloor required”, “Add Screed as an option”, “Underlay factor 1.15”. Drafted, with the answers behind it.', 'vane'), ('Keep, then Publish', 'Kept changes join the form’s draft. Reps see them only once someone publishes.', 'person')])
dcm = flow([('Document drafted', 'A quote from a visit, an invoice from a quote.', 'app'), ('Vane checks and writes', 'Lines against the price list; the WhatsApp or email text that goes with it.', 'vane'), ('Change the line · Send', 'Each change and the send are the person’s.', 'person')])
inner = T('''<div class="cm-grid2" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 48px; align-items: start;">
  <div>[[h1]]<div style="border-top: 1px solid [[line]];">[[fl]]</div></div>
  <div>[[h2]]<div style="display: flex; flex-direction: column; gap: 14px;"><span style="font-weight: 600;">Reports: Vane reads through templates</span>[[rep]]<span style="font-weight: 600; margin-top: 6px;">Reports: a block in the builder</span>[[blk]]<span style="font-weight: 600; margin-top: 6px;">Forms: changes from the answers</span>[[frm]]<span style="font-weight: 600; margin-top: 6px;">Documents: checks and the message</span>[[dcm]][[lg]]</div></div>
</div>
[[h3]][[tt]]''', h1=h2('What a Vane template holds'), fl=fl, h2=h2('How it meets reports and forms'), rep=rep, blk=blk, frm=frm, dcm=dcm, lg=legend(),
  h3=h2('The templates', '%d, in seven groups. “Reads” names report templates from the Reports page, so What I read always opens a real view.' % len(V.J)), tt=tt)
save(P, 'VnTemplates.dc.html', doc('Vane · Templates', sheet_doc('Vane’s templates', 'Every job Vane does starts from a template: when it runs, which report templates it reads, what it may write, and the one button a person presses. Forms and documents meet it through drafts that wait to be kept.', inner), {}, 1440, 1060 + len(rows) * 64))

# ================= Use cases =================
UC = [
 ('Rudo, accounts', 'Floorcode', 'Monday, 07:40', [('v', 'Overnight, read Invoices and Owed to us, by age'), ('v', 'Card: 3 invoices past their terms, Chisipite Dental first'), ('p', 'Opens the statements and calls Chisipite')], 'books.past-terms'),
 ('James, owner', 'Floorcode', 'A deal is won', [('v', 'Reads the accepted quote, drafts INV-0143 for $6,400.00'), ('v', 'Card to James: let’s check it and issue it'), ('p', 'Opens the draft, changes the due date, presses Issue')], 'books.won-no-invoice'),
 ('Kuda, fitter', 'Floorcode', 'Two days after a visit', [('v', 'Sees Pomona Offices’ quote is still a draft'), ('v', 'Writes the WhatsApp message to go with it'), ('p', 'On his phone, reads it and presses Send the quote')], 'crm.quote-waiting'),
 ('Rudo, accounts', 'Floorcode', '1 October, 06:00', [('v', 'Plan: VAT for September, 4 steps'), ('v', 'Prepares the return, finds tax codes for 2 bill lines'), ('p', 'Reviews, finalises, files with ZIMRA, marks it filed')], 'books.vat-plan'),
 ('James, owner', 'Floorcode', 'On the Deals report', [('p', 'Asks: why is Negotiating losing deals?'), ('v', 'Reads Deals as filtered; answers with 11 rows'), ('p', 'Saves the view as “Deals gone quiet”')], 'reports.explain'),
 ('Rudo, accounts', 'Floorcode', 'Building Measured to won', [('p', 'Asks for won m² by month beside measured'), ('v', 'Writes the question as SQL (it needs a join) and its rows'), ('p', 'Keeps the block, then saves the report')], 'reports.block'),
 ('James, owner', 'Floorcode', 'Weekly, on the site visit form', [('v', 'Reads answers: Subfloor skipped on 1 visit in 5; 21 typed “screed”'), ('v', 'Drafts two changes in the builder'), ('p', 'Keeps both, publishes the form')], 'forms.required'),
 ('Simba, payroll', 'Floorcode', 'October run drafted', [('v', 'Checks 9 people against September'), ('v', 'Flags a missing NSSA number and Kuda’s overtime'), ('p', 'Fixes the number, submits the run')], 'pay.run-check'),
 ('Tendai, shop owner', 'Avondale Bottle Store', 'Shift closed $12.00 short', [('v', 'Reads Till shifts: Till 1, morning, third time'), ('v', 'Card with the three shifts'), ('p', 'Opens the sales, tightens voids')], 'retail.short'),
 ('Tendai, shop owner', 'Avondale Bottle Store', '06:00', [('v', 'Reads Stock to reorder: 9 products, 2 suppliers'), ('v', 'Drafts 2 orders'), ('p', 'Changes a quantity, sends both orders')], 'retail.reorder'),
 ('Mrs Dube, bursar', 'Mazowe High', 'Monday in term', [('v', 'Reads Fees owed, by class: 41 families paid nothing'), ('v', 'Drafts each family’s reminder'), ('p', 'Takes 3 off the list, sends 38')], 'schools.fees'),
 ('Mr Chari, engineer', 'Shamva Gold', 'Mill 1 down again', [('v', 'Reads Downtime: feed pump seal, third time in 30 days'), ('v', 'Drafts a work order with the history'), ('p', 'Raises it and orders the seal')], 'mine.breakdown'),
]
def uc(c):
    who, ws, when, steps, tid = c
    st = ''.join(T('<div style="display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; align-items: start; padding: 5px 0;"><span style="margin-top: 3px; width: 12px; height: 12px; border-radius: 3px; background: [[bg]]; border: 1px solid [[bd]];"></span><span>[[t]]</span></div>', bg=C['ground'] if k == 'v' else C['sel'], bd=C['strong'] if k == 'v' else '#bcd0f7', t=t) for k, t in steps)
    return T('<article style="border: 1px solid [[line]]; border-radius: 12px; padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 6px; break-inside: avoid; margin-bottom: 16px;"><div style="display: flex; align-items: baseline; gap: 8px;"><span style="font-weight: 600;">[[w]]</span><span style="color: [[muted]]; font-size: 12.5px;">[[ws]]</span><span style="margin-left: auto; font-size: 12.5px; color: [[muted]];">[[when]]</span></div>[[st]]<span style="font: 11.5px [[mono]]; color: [[muted]]; padding-top: 4px; border-top: 1px solid [[soft]];">[[tid]]</span></article>', w=who, ws=ws, when=when, st=st, tid=tid)
inner = legend() + T('<div style="column-count: 3; column-gap: 20px; margin-top: 20px;">[[x]]</div>', x=''.join(uc(c) for c in UC))
save(P, 'VnUseCases.dc.html', doc('Vane · Use cases', sheet_doc('Use cases', 'Twelve moments, across five workspaces. In each one Vane reads and drafts, and a named person does the part a customer, the bank or ZIMRA would see.', inner), {}, 1440, 1180))

# ================= Interactions =================
card = T('''<div style="border: 1px solid [[line]]; border-radius: 12px; background: #ffffff; padding: 16px 18px; display: grid; grid-template-columns: 28px minmax(0, 1fr) 28px; gap: 12px; position: relative;">
  <span style="width: 28px; height: 28px; border-radius: 7px; background: #fbf1dc; color: #8a5a10; display: flex; align-items: center; justify-content: center;">[[ic]]</span>
  <div style="display: flex; flex-direction: column; gap: 4px;"><span style="font-size: 12px; color: [[muted]];"><b style="font-weight: 500; color: #8a5a10;">Issue</b> · Books · 06:04</span><span style="font-size: 14.5px; font-weight: 600;">3 invoices are past their terms, $2,480.00.</span><span style="color: [[ink2]];">Chisipite Dental is 12 days late, later than they usually pay. Let’s open their statements and call them first.</span>
  <span style="display: flex; gap: 6px; margin-top: 6px;">[[p]][[s]]</span>
  <a href="#" style="margin-top: 6px; display: inline-flex; align-items: center; gap: 6px; color: [[muted]]; font-size: 12.5px; text-decoration: none;">[[t]]What I read: Invoices, Owed to us by age · 3 rows</a></div>
  <span style="display: flex; color: [[faint]];">[[x]]</span>
</div>''', ic=icon('warning', 15), p=primary_k('Open 3 statements', 'S'), s=btn('Show the ageing', 'clock'), t=icon('table', 13), x=icon('x', 15))
ann = [('1', 'Kind and source', 'Issue or Suggestion, the module, the time. Issues use the warning colour on the icon only.'), ('2', 'One fact', 'Names, amounts with both decimals, dates. No adjectives.'), ('3', 'The reason, then “Let’s …”', 'One or two sentences in the first person.'), ('4', 'The button names the act', 'Never “OK” or “Do it”. The primary shows its shortcut; S on the focused card.'), ('5', 'What I read', 'The report templates and the question Vane ran, opened as the same view.'), ('6', 'Not now', 'Moves it to Muted and asks why, in one tap: not mine, already done, wrong, not now.')]
annl = ''.join(T('<div style="display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 10px; padding: 8px 0; border-bottom: 1px solid [[soft]];"><span style="width: 20px; height: 20px; border-radius: 99px; background: [[ink]]; color: #ffffff; font: 600 11px/20px [[mono]]; text-align: center;">[[n]]</span><span><b style="font-weight: 600;">[[t]]</b><br><span style="color: [[ink2]];">[[s]]</span></span></div>', n=n, t=t, s=s) for n, t, s in ann)
life = flow([('Open', 'In For you and the panel, counted on the button.', 'vane'), ('Pressed', 'The person presses the act. The card shows who did what, then goes to Done.', 'person'), ('Resolved on its own', 'If the thing is fixed elsewhere (the invoice is paid), Vane closes the card and says why.', 'vane'), ('Not now', 'Muted, with the reason. Three of a kind muted: Vane asks to stop that kind.', 'person')])
draft = flow([('Vane drafts', 'A draft row in its module, marked “Vane’s draft”, with what it read.', 'vane'), ('The person opens it', 'Changes anything. The mark stays until it is issued or deleted.', 'person'), ('Issue, send, approve', 'The app’s own button and endpoint. The audit reads “by Rudo, drafted by Vane”.', 'person')])
job = flow([('Give Vane a job', '“Get September’s VAT ready.” Ctrl J, from any page.', 'person'), ('Vane proposes', 'An answer, or a plan with steps marked Vane or You, and what it will read.', 'vane'), ('Start', 'Nothing runs before Start. Vane does its steps; yours wait in Plans.', 'person')])
STATES = [('Working', 'Pulsing dot on the button; the job’s label and progress, “38 of 61 accounts”.'), ('Paused', 'From Pause Vane. Nothing runs; cards stay. The button shows Paused.'), ('Quiet hours', '20:00 to 06:00 by default. Work goes on; cards wait for the morning.'), ('Over the allowance', 'Jobs this month are used up. Cards already made stay; new jobs start on the 1st.'), ('Could not work it out', 'The card says what it tried and offers Show the rows. No guess.'), ('Cannot reach the service', 'Retries on its own; shows when it last worked.')]
stl = ''.join(T('<div style="display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid [[soft]];"><span style="font-weight: 600;">[[k]]</span><span style="color: [[ink2]];">[[v]]</span></div>', k=k, v=v) for k, v in STATES)
KEYS = [('Ctrl J', 'Open the panel and Give Vane a job'), ('Esc', 'Close the panel'), ('J / K', 'Next and previous card'), ('S', 'The focused card’s primary act'), ('N', 'Not now on the focused card'), ('Ctrl ↵', 'Keep, on a Vane block or form change')]
kl = ''.join(T('<div style="display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid [[soft]];"><kbd style="justify-self: start; height: 22px; padding: 0 7px; border: 1px solid [[strong]]; border-radius: 5px; font: 500 12px/20px [[mono]];">[[k]]</kbd><span>[[v]]</span></div>', k=k, v=v) for k, v in KEYS)
inner = T('''<div class="cm-grid2" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: start;">
  <div>[[h1]][[card]]<div style="margin-top: 14px; border-top: 1px solid [[line]];">[[annl]]</div></div>
  <div>[[h2]][[life]][[h3]][[draft]][[h4]][[job]][[lg]]</div>
</div>
<div class="cm-grid2" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: start;">
  <div>[[h5]]<div style="border-top: 1px solid [[line]];">[[stl]]</div></div>
  <div>[[h6]]<div style="border-top: 1px solid [[line]];">[[kl]]</div></div>
</div>''', h1=h2('A card', 'Every card in For you, the panel and inside modules.'), card=card, annl=annl,
  h2=h2('A card’s life'), life=life, h3=h2('A draft’s life', 'Invoices, orders, reminders, work orders, report blocks, form changes.'), draft=draft,
  h4=h2('Give Vane a job'), job=job, lg=legend(), h5=h2('Vane’s states', 'The four the handover left undrawn are drawn on the pages to the right.'), stl=stl, h6=h2('Keys', 'Ctrl J is new; the rest follow the app’s list keys.'), kl=kl)
save(P, 'VnInteractions.dc.html', doc('Vane · Interactions', sheet_doc('Interactions', 'How a card reads, what happens when someone presses it or sets it aside, how drafts reach a person, and how to hand Vane a job.', inner), {}, 1440, 1500))

# ================= Requirements and the migration =================
REQ = [
 ('Where it lives', [('Vane is in the rail of every workspace, above Settings, and its button is in every top bar with the open count and a dot while it works.', 'build'), ('The panel opens beside any page, 400 px, with that page’s cards first. Esc closes it.', 'build'), ('/vane has For you, Working on, Plans, Done and Muted.', 'build')]),
 ('Reading', [('Vane reads through report templates only, as the person the card is for. If they cannot open the report, Vane cannot read it for them.', 'build'), ('Bank details, ID and tax numbers are kept from Vane. It can see a number is missing, never the number.', 'build'), ('Fitters’ cards come only from their own visits and quotes. The CRM lets a rep read the whole pipeline today.', 'decide'), ('Every card keeps the question it ran and what it read, and What I read opens that view.', 'build')]),
 ('Writing', [('Vane writes only its own tables and drafts marked as Vane’s. Send, pay, issue, approve, save, publish and file are a person’s press, enforced on the server.', 'build'), ('Draft records need “made by Vane”: the createdById columns point at people.', 'decide'), ('Every press on a Vane draft is audited “by the person, drafted by Vane”. Worker writes are not audited automatically today.', 'build')]),
 ('Reports', [('Explain a figure on any report, with the rows it used.', 'build'), ('A block in the builder: Steps when it can, SQL when it needs a join. Marked until kept. The custom report document has no draft flag yet.', 'build'), ('Suggest saving a view people open every week. Report views are not logged today.', 'decide'), ('Notes on Insights each Monday, in Do something about it.', 'build')]),
 ('Forms and documents', [('Changes to a form drafted from its answers: required, a new option, a quote line factor. Kept changes join the form’s draft; publishing stays a person’s.', 'build'), ('A new form copied from the closest Corelith template, as a draft reps do not see.', 'reuse'), ('Quote lines checked against the price list; the message that goes with a document drafted beside it.', 'build')]),
 ('Jobs and states', [('Jobs run on a record change, every few minutes, at 06:00 and on Mondays, keyed so they never run twice. There is no record-change outbox yet.', 'build'), ('Quiet hours hold cards, not work. Paused, over the allowance, could not work it out and cannot reach the service each have a state.', 'build'), ('Ctrl J opens Give Vane a job. A plan waits for Start.', 'build')]),
 ('Server', [('Claude is called from the worker only, the key stays on the server, and the model is read from VANE_MODEL.', 'build'), ('Every call is logged with tokens and time and counted against the month’s allowance.', 'build'), ('Claude is named once, on Management → Vane. Never AI, assistant or a sparkle.', 'build')]),
]
SC = {'build': ('To build', 'neutral'), 'reuse': ('Reuses code', 'ok'), 'decide': ('Decide', 'warn')}
n = 0; secs = []
for head, items in REQ:
    rs = []
    for text, st in items:
        n += 1
        rs.append(T('<div style="display: grid; grid-template-columns: 52px minmax(0, 1fr) 100px; gap: 14px; align-items: start; padding: 11px 0; border-bottom: 1px solid [[soft]];"><span style="font: 500 12.5px [[mono]]; color: [[muted]]; padding-top: 2px;">V[[n]]</span><span>[[t]]</span><span style="display: flex; justify-content: flex-end;">[[c]]</span></div>', n=n, t=text, c=chip(*SC[st])))
    secs.append(T('<section style="break-inside: avoid; margin-bottom: 26px;"><h2 style="margin: 0 0 8px; font-size: 15px; font-weight: 600;">[[h]]</h2><div style="border-top: 1px solid [[line]];">[[r]]</div></section>', h=head, r=''.join(rs)))
TABLES = [('vane_items', 'id, workspace_id, kind, source_module, template, subject_type, subject_id, headline, body, action, read_from, question_sql, status (open, done, muted), muted_reason, audience, created_at, resolved_at, resolved_by'),
          ('vane_plans', 'id, workspace_id, template, title, due_on, status, started_by, created_at'),
          ('vane_plan_steps', 'id, plan_id, position, label, owner (vane, person), status (todo, now, done), progress_label, done_at, done_by'),
          ('vane_jobs', 'id, workspace_id, template, label, trigger, started_at, finished_at, progress_done, progress_total, tokens_in, tokens_out, tools, result, error'),
          ('vane_settings', 'workspace_id, watches, raise_issues, plans, drafts, quiet_from, quiet_to, routing, monthly_allowance, paused_at'),
          ('made_by_vane', 'A boolean on SalesInvoice, SalesQuotation, purchase orders, work orders, fee reminders and form versions, beside createdById. New'),
          ('report_views', 'company, report key, view hash, user, opened_at. For “save the view you keep making”. New')]
tl = ''.join(T('<div style="display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid [[soft]];"><span style="font: 600 12.5px [[mono]];">[[k]]</span><span style="color: [[ink2]]; font-size: 13px;">[[v]]</span></div>', k=k, v=v) for k, v in TABLES)
mig = T('<section style="break-inside: avoid; margin-bottom: 26px; padding: 18px 20px; border: 1px solid [[strong]]; border-radius: 12px;"><div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;"><h2 style="margin: 0; font-size: 15px; font-weight: 600;">The migration</h2>[[c]]</div><p style="margin: 0 0 10px; color: [[ink2]];">Proposed, not run. It waits for your yes.</p><div style="border-top: 1px solid [[line]];">[[tl]]</div><p style="margin: 12px 0 0; color: [[ink2]];"><b style="font-weight: 600;">vane_reader</b>: a database role with SELECT only, row-level security by workspace, and no grant on pay, national ID, bank details or personal phone numbers. It is the first database role the app would have; today tenancy is checked in the app by company.</p></section>', c=chip('Waiting for your yes', 'warn'), tl=tl)
counts = {}
for _, items in REQ:
    for _, st in items: counts[st] = counts.get(st, 0) + 1
legend2 = ' '.join(chip('%d %s' % (counts.get(k, 0), SC[k][0].lower()), SC[k][1]) for k in ('build', 'reuse', 'decide'))
inner = T('<div style="display: flex; gap: 10px; flex-wrap: wrap; margin: -8px 0 28px;">[[l]]</div><div style="column-count: 2; column-gap: 48px;">[[s]][[m]]</div>', l=legend2, s=''.join(secs), m=mig)
save(P, 'VnRequirements.dc.html', doc('Vane · Requirements', sheet_doc('Requirements and the migration', 'None of Vane exists in the app yet. Each line says what to build, what reuses code already there, and what needs your decision first.', inner), {}, 1440, 1800))
print('vane plan ok', n, counts)
