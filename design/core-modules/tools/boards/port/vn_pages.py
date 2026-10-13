import sys
sys.path.insert(0, 'gen2/port')
from ri_shared import *
P = sys.argv[1]
theme('corelith')

KT = lambda k: {'Issue': ('#fbf1dc', '#8a5a10', '#8a5a10', 'warning'), 'Suggestion': (C['tray'], C['ink2'], C['ink2'], 'lightning'), 'Answer': (C['tray'], C['ink2'], C['ink2'], 'question'), 'Draft': (C['tray'], C['ink2'], C['ink2'], 'pencil')}[k]

def vcard(kind, src, when, head, body, prim=None, secs=(), read='', sel=False, pad='16px 24px', glyph=None, fig=None, compact=False):
    """A Vane card in three columns: a coloured tile, the words (kind chip, one fact, one sentence), and on the right
    the figure it is about with the buttons under it. What I read and Not now are icon buttons at the top right."""
    bg, fg, kc, g = KT(kind)
    ktone = {'Issue': 'warn', 'Suggestion': 'sel', 'Answer': 'neutral', 'Draft': 'neutral'}[kind]
    p = primary_k(prim[0], prim[1]) if prim else ''
    ss = ''.join(btn(l, gl) for l, gl in secs)
    ib = lambda gl, lab: T('<button type="button" aria-label="[[l]]" title="[[l]]" style="width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: [[faint]]; display: flex; align-items: center; justify-content: center;">[[i]]</button>', l=lab, i=icon(gl, 15))
    tools = T('<span style="display: flex; gap: 2px;">[[a]][[b]]</span>', a=ib('table', 'What I read: ' + read) if read else '', b=ib('x', 'Not now'))
    meta = T('<span style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: [[muted]];">[[c]]<span>[[src]] · [[when]]</span></span>', c=chip(kind, ktone), src=src, when=when)
    words = T('<div style="display: flex; flex-direction: column; gap: 6px; min-width: 0;">[[m]]<h3 style="margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3;">[[h]]</h3><p style="margin: 0; max-width: 560px; color: [[ink2]]; line-height: 1.45;">[[b]]</p></div>', m=meta, h=head, b=body)
    figure = T('<span style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;"><span style="font: 600 18px/1.2 [[mono]]; letter-spacing: -0.02em; color: [[fc]];">[[v]]</span><span style="font-size: 12px; color: [[muted]];">[[n]]</span></span>', fc=fg if kind == 'Issue' else C['ink'], v=fig[0], n=fig[1]) if fig else ''
    acts = T('<div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: [[j]];">[[p]][[s]]</div>', j='flex-start' if compact else 'flex-end', p=p, s=ss) if (p or ss) else ''
    tile = T('<span style="width: 32px; height: 32px; border-radius: 8px; background: [[bg]]; color: [[fg]]; display: flex; align-items: center; justify-content: center;">[[ic]]</span>', bg=bg, fg=fg, ic=icon(glyph or g, 16))
    edge = ('inset 3px 0 0 ' + C['acc']) if sel else 'none'
    if compact:
        return T('<article style="display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 8px 12px; padding: [[pad]]; border-bottom: 1px solid [[soft]]; background: [[bgc]]; box-shadow: [[sh]];">[[t]][[w]][[tools]]<span></span><div style="grid-column: 2 / -1; display: flex; flex-direction: column; gap: 10px;">[[f]][[a]]</div></article>',
                 pad=pad, bgc=C['sel'] if sel else '#ffffff', sh=edge, t=tile, w=words, tools=tools, f=figure.replace('align-items: flex-end', 'align-items: flex-start') if figure else '', a=acts)
    return T('<article style="display: grid; grid-template-columns: 32px minmax(0, 1fr) 240px; gap: 16px; padding: 20px 24px; border-bottom: 1px solid [[soft]]; background: [[bgc]]; box-shadow: [[sh]];">[[t]][[w]]<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 12px;"><div style="display: flex; align-items: flex-start; gap: 10px;">[[f]][[tools]]</div>[[a]]</div></article>',
             bgc=C['sel'] if sel else '#ffffff', sh=edge, t=tile, w=words, f=figure, tools=tools, a=acts)

def vpanel(inner, h=900, status='Working', foot=True):
    f = T('<div style="flex: none; padding: 12px 16px 14px; border-top: 1px solid [[line]];"><label style="min-height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 12px; border: 1px solid [[strong]]; border-radius: 10px; color: [[muted]];"><span style="flex: 1 1 auto;">Give Vane a job</span><kbd style="height: 20px; padding: 0 5px; border: 1px solid [[line]]; border-radius: 5px; font: 500 11px/18px [[mono]];">Ctrl J</kbd></label></div>') if foot else ''
    dot = {'Working': C['acc'], 'Paused': C['faint'], 'Quiet hours': C['faint']}.get(status, '#c2850f')
    return T('''  <aside class="cm-vane" aria-label="Vane" style="flex: none; width: 400px; min-height: [[h]]px; box-sizing: border-box; display: flex; flex-direction: column; background: #ffffff; border-left: 1px solid [[line]];">
    <div style="height: 48px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 16px; border-bottom: 1px solid [[line]];">[[vm]]<span style="font-weight: 600;">Vane</span><span style="display: inline-flex; align-items: center; gap: 6px; color: [[muted]]; font-size: 12.5px;"><span style="width: 7px; height: 7px; border-radius: 99px; background: [[dot]];"></span>[[st]]</span><span style="flex: 1 1 auto;"></span>[[pz]][[cl]]</div>
    <div style="flex: 1 1 auto; overflow: hidden; display: flex; flex-direction: column;">[[x]]</div>
[[f]]  </aside>
''', h=h, vm=VANE_MARK(), dot=dot, st=status, pz=T('<button type="button" aria-label="Pause Vane" style="width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: [[muted]]; display: flex; align-items: center; justify-content: center;">[[i]]</button>', i=icon('pause', 15)), cl=T('<button type="button" aria-label="Close, Esc" style="width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: [[muted]]; display: flex; align-items: center; justify-content: center;">[[i]]</button>', i=icon('x', 15)), x=inner, f=f)

def psec(title, inner, right=''):
    return T('<div style="display: flex; align-items: center; height: 32px; padding: 0 16px; background: [[ground]]; border-bottom: 1px solid [[line]]; color: [[muted]]; font-size: 12.5px; font-weight: 500;"><span style="flex: 1 1 auto;">[[t]]</span><span style="font-family: [[mono]];">[[r]]</span></div>[[x]]', t=title, r=right, x=inner)

def working(rows):
    return ''.join(T('<div style="display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 16px; border-bottom: 1px solid [[soft]];"><span style="width: 7px; height: 7px; flex: none; border-radius: 99px; background: [[acc]];"></span><span style="flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">[[t]]</span><span style="font: 12px [[mono]]; color: [[muted]];">[[p]]</span></div>', t=t, p=p) for t, p in rows)

def steps(rows):
    out = []
    for text, who, st, note in rows:
        g, col, w = {'done': ('checkCircle', C['ok'], 400), 'now': ('spinner', C['acc'], 600), 'todo': ('circle', C['faint'], 400)}[st]
        out.append(T('<li style="display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 7px 0;"><span style="display: flex; color: [[c]]; margin-top: 1px;">[[i]]</span><span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-weight: [[w]];">[[t]]</span><span style="font-size: 12.5px; color: [[muted]];">[[n]]</span></span><span style="font-size: 12px; color: [[muted]];">[[who]]</span></li>', c=col, i=icon(g, 15), w=w, t=text, n=note, who=who))
    return T('<ol style="margin: 0; padding: 0; list-style: none;">[[x]]</ol>', x=''.join(out))

def meter(pct):
    return T('<div role="meter" aria-valuenow="[[p]]" aria-valuemin="0" aria-valuemax="100" style="height: 4px; border-radius: 99px; background: [[tray]];"><div style="width: [[p]]%; height: 4px; border-radius: 99px; background: [[acc]];"></div></div>', p=pct)

# ---- the handover kit's Vane pieces: a For you row, the .vc card, the .ask panel ----
def vcard(kind, src, when, head, body, prim=None, secs=(), read='', sel=False, pad='16px 24px', glyph=None, fig=None, compact=False):
    issue = kind == 'Issue'
    nt = icon('warning' if issue else ('pencil' if kind == 'Draft' else ('question' if kind == 'Answer' else 'lightning')), 20)
    acts = (primary_k(prim[0], prim[1]) if prim else '') + ''.join(btn(l, gl) for l, gl in secs)
    if read:
        acts += '<button class="btn btn-quiet" title="%s">%sWhat I read</button>' % (read, icon('table', 16))
    k = '%s, %s · <span class="mono">%s</span>' % (kind, src, when) + (' · <b class="mono" style="font-weight:500;color:%s">%s</b> %s' % ('var(--color-warning)' if issue else 'var(--color-ink)', fig[0], fig[1]) if fig else '')
    if compact:
        return '<article class="vc%s" style="margin:0 16px 12px%s"><div class="vc-k">%s<span>%s</span><span class="muted">%s</span>%s</div><h3>%s</h3><p>%s</p>%s</article>' % (
            ' is-issue' if issue else '', ';box-shadow:0 0 0 1.5px var(--color-accent)' if sel else '', icon('warning' if issue else 'lightning', 16), kind, src, ck.iconbtn('x', 'Not now', 'btn btn-quiet btn-icon vc-x'), head, body, '<div class="vc-a">%s</div>' % acts if acts else '')
    return '<div class="row fy%s"%s><span class="nt">%s</span><div class="t"><span class="k">%s</span><span class="lead">%s</span><span class="d">%s</span>%s</div>%s</div>' % (
        ' is-issue' if issue else '', ' style="background:var(--color-accent-tint)"' if sel else '', nt, k, head, body, '<div class="a">%s</div>' % acts if acts else '', ck.iconbtn('x', 'Not now'))

def vpanel(inner, h=900, status='Working', foot=True):
    live = '<span class="live">%s</span>' % status if status == 'Working' else '<span class="muted" style="font-size:12px">%s</span>' % status
    f = '<div class="ask-c"><label class="input-wrap ask-in" style="flex:1"><input type="text" aria-label="Give Vane a job" placeholder="Give Vane a job">%s</label>%s</div>' % (ck.kbd('Ctrl J'), ck.iconbtn('upload', 'Hand it over', 'btn btn-icon')) if foot else ''
    return '  <aside class="ask cm-vane" aria-label="Vane" style="width:400px;flex:none"><div class="ask-h">%s<b>Vane</b>%s<div class="tb-r">%s%s</div></div><div class="ask-b" style="padding:0 0 16px;gap:0">%s</div>%s</aside>\n' % (
        ck.vmark(18), live, ck.iconbtn('pause', 'Pause Vane'), ck.iconbtn('x', 'Close Vane'), inner, f)

def psec(title, inner, right=''):
    return '<div class="vs" style="padding:0 16px;margin:16px 0 8px">%s%s</div>%s' % (title, ' <span class="pn-n">%s</span>' % right if right else '', inner)

def working(rows):
    return ''.join('<div class="vn-now" style="padding:0 16px"><span class="live-d" aria-hidden="true"></span><span class="truncate">%s</span><span class="muted">%s</span></div>' % (t, p) for t, p in rows)

def steps(rows):
    li = ''.join('<li class="is-%s">%s<span>%s%s</span><span class="muted">%s</span></li>' % (st, ck.ic('step-' + st), text, ('<br><span class="muted" style="font-size:12px">%s</span>' % note) if note else '', who) for text, who, st, note in rows)
    return '<div class="vp" style="box-shadow:none;padding:0"><ol>%s</ol></div>' % li

def meter(pct):
    return '<div class="meter" role="meter" aria-valuenow="%s" aria-valuemin="0" aria-valuemax="100"><i style="width:%s%%;background:var(--color-accent)"></i></div>' % (pct, pct)


TB_VANE = ' vaneOpen="{{yes}}"'

# ---------------- For you
CARDS = [
 ('Issue', 'Books', '06:04', '3 invoices are past their terms.', 'Chisipite Dental is 12 days late, later than they usually pay. Let’s call them first.', ('Open 3 statements', 'S'), [], 'Invoices, Owed to us by age', ('$2,480.00', '3 invoices')),
 ('Suggestion', 'Pipeline', '09:12', 'A won deal has no invoice.', 'Borrowdale Brooke Clinic, won 4 days ago. I drafted INV-0143 from the accepted quote; let’s check it and issue it.', ('Open the draft', 'S'), [], 'Deals, Quotes, Invoices', ('$6,400.00', 'INV-0143, draft')),
 ('Suggestion', 'Build', '06:10', 'Reps skip Subfloor on site visits.', 'Those quotes are won a third of the time. I drafted two changes to the form; let’s keep them and publish.', ('Open the changes', 'S'), [], 'Site visit answers', ('18 of 86', 'visits skipped it')),
 ('Issue', 'Showroom', 'Mon 07:02', 'Till 1 was short again on Monday.', 'The third time since August, each on the morning shift. Let’s go through that shift’s sales.', None, [('Show the sales', 'receipt')], 'Till shifts, Till variances', ('−$12.00', 'Till 1, morning')),
 ('Suggestion', 'Reports', 'Mon 08:15', 'You open Deals by owner every Monday.', 'Let’s save it as a template, “Deals by owner, this quarter”, so it opens that way.', None, [('Save as a template', 'fileCheck')], 'Deals, your last 3 Mondays', ('3 Mondays', 'running')),
 ('Issue', 'People and pay', '06:20', 'Simba has no NSSA number.', 'The October run cannot list him on the NSSA schedule. Let’s add it before the 20th.', None, [('Open Simba’s details', 'user')], 'Employees, Pay by employee', ('Due 20 Oct', 'run submitted')),
]
def for_you(sel=None):
    out = finding('Vane has 6 things for you and is working on 2.', 'Most came in overnight, across Books, Build, the showroom and People and pay.', pad='26px 24px 20px') + band('For you', '6')
    for i, c in enumerate(CARDS):
        out += vcard(*c[:8], sel=(i == sel), fig=c[8])
    return out
ASIDE_FY = aside(label('Working on 2') + T('<div style="margin: 0 -20px; border-top: 1px solid [[line]];">[[w]]</div>', w=working([('Checking September’s trial balance agrees', '38 of 61'), ('Finding tax codes for 2 bill lines', '1 of 2')]).replace('padding: 0 16px', 'padding: 0 20px')) +
  T('<div style="margin-top: 10px; padding: 12px 14px; border: 1px solid [[line]]; border-radius: 10px; background: #ffffff; display: flex; flex-direction: column; gap: 8px;"><div style="display: flex; align-items: baseline; gap: 8px;"><span style="font-weight: 600;">VAT for September</span><span style="margin-left: auto; font-size: 12px; color: [[muted]];">Due 25 Oct</span></div>[[m]][[s]]</div>', m=meter(25), s=steps([('Prepare the September return', 'Vane', 'done', 'VAT-7, net $1,227.20'), ('Find tax codes for 2 bill lines', 'Vane', 'now', '1 of 2'), ('Review and finalise the return', 'Rudo', 'todo', ''), ('File with ZIMRA, then mark it filed', 'Rudo', 'todo', '')])) +
  T('<span style="margin-top: 10px;">[[l]]</span>', l=label('Done today 14')) + T('<div style="display: flex; flex-direction: column;">[[x]]</div>', x=''.join(T('<div style="height: 32px; display: flex; align-items: center; gap: 8px;"><span style="display: flex; color: [[ok]];">[[i]]</span><span style="flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">[[t]]</span><span style="font: 12px [[mono]]; color: [[muted]];">[[w]]</span></div>', i=icon('check', 14), t=t, w=w) for t, w in [('Prepared the September VAT return', '06:02'), ('Drafted INV-0143 from QT-0398', '09:12'), ('Read 86 site visit forms', '06:10'), ('Checked 14 quotes against the price list', '05:48')])), 360)
VANE_ACT = [{'label': 'Pause Vane', 'kind': 'secondary', 'glyph': 'pause'}]
save(P, 'PageVane.dc.html', doc('Vane · For you', frame('crm', 'vane', 'For you', topbar('For you', 'pin'), for_you(), ASIDE_FY, railCur='vane'), {'actions': VANE_ACT}, 1440, 900))

# ---------------- A card, with what Vane read
SQL = '''select d.deal_no, d.customer, d.value, d.won
from crm_deals d
left join crm_invoices i on i.for = d.deal_no
where d.outcome = 'Won'
  and d.won >= current_date - 7
  and i.invoice_no is null'''
inner = T('<div style="display: flex; flex-direction: column; gap: 8px;">[[l]][[r]]</div>', l=label('It read'), r=kv([(link('Deals') + ' <span style="color: ' + C['muted'] + ';">won, last 7 days</span>', '4 rows'), (link('Invoices') + ' <span style="color: ' + C['muted'] + ';">for those deals</span>', '3 rows'), (link('Quotes') + ' <span style="color: ' + C['muted'] + ';">QT-0398, accepted 7 Oct</span>', '1 row')])) + \
  T('<div style="display: flex; flex-direction: column; gap: 6px;">[[l]]<pre style="margin: 0; padding: 12px; border-radius: 8px; background: [[ground]]; border: 1px solid [[line]]; font: 12px/1.55 [[mono]]; color: [[ink2]]; white-space: pre-wrap;">[[s]]</pre><span style="font-size: 12.5px; color: [[muted]];">1 row, read only, as Rudo could read it.</span></div>', l=label('The question it ran'), s=SQL) + \
  T('<div style="display: flex; flex-direction: column; gap: 6px;">[[l]][[kv]]</div>', l=label('What it drafted'), kv=kv([('INV-0143', 'Draft, made by Vane'), ('Customer', 'Borrowdale Brooke Clinic'), ('Lines', '4, copied from QT-0398'), ('Total', '$6,400.00 with VAT'), ('Due', '21 days, their usual terms')])) + \
  T('<div style="padding: 12px 14px; border-radius: 8px; background: [[ground]]; color: [[ink2]];">Nothing is issued until someone presses Issue on the invoice.</div>')
save(P, 'PageVaneCard.dc.html', doc('Vane · A card, what it read', frame('crm', 'vane', 'For you', topbar('For you', 'pin'), for_you(sel=1), overlay=sheet('A deal was won with no invoice', 'Suggestion · Pipeline · 09:12', inner, btn('Not now', 'x') + primary_k('Open the draft', 'S'), w=460), railCur='vane'), {'actions': VANE_ACT}, 1440, 900))

# ---------------- Plans
PLANS = [('VAT for September', 'Due 25 Oct', 25, True), ('Close October', 'Due 3 Nov · waiting for Start', 0, False), ('P2 and NSSA for September', 'Done 9 Oct', 100, False)]
pl = ''.join(T('<a href="#" style="display: flex; flex-direction: column; gap: 6px; padding: 14px 24px; border-bottom: 1px solid [[soft]]; background: [[bg]]; box-shadow: [[sh]]; color: [[ink]]; text-decoration: none;"><span style="display: flex; gap: 8px;"><span style="font-weight: 600;">[[t]]</span><span style="margin-left: auto; font-size: 12.5px; color: [[muted]];">[[d]]</span></span>[[m]]</a>', bg=C['sel'] if on else '#ffffff', sh=('inset 3px 0 0 ' + C['acc']) if on else 'none', t=t, d=dd, m=meter(p)) for t, dd, p, on in PLANS)
detail = T('''<div style="padding: 24px 28px; display: flex; flex-direction: column; gap: 16px;">
  <div style="display: flex; align-items: baseline; gap: 10px;"><h2 style="margin: 0; font-size: 19px; font-weight: 600;">VAT for September</h2>[[c]]<span style="margin-left: auto; color: [[muted]];">Due 25 October · started by Vane, 1 Oct 06:00</span></div>
  [[m]]
  <div style="border-top: 1px solid [[line]];">[[st]]</div>
  <div class="cm-grid2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;"><div style="display: flex; flex-direction: column; gap: 6px;">[[l1]][[kv1]]</div><div style="display: flex; flex-direction: column; gap: 6px;">[[l2]][[kv2]]</div></div>
</div>''', c=chip('Vane is on step 2', 'info'), m=meter(25),
  st=steps([('Prepare the September return', 'Vane', 'done', 'Drafted VAT-7 from 41 invoices and 18 bills: output $2,964.70, input $1,737.50, net $1,227.20'), ('Find tax codes for 2 bill lines', 'Vane', 'now', 'Halsted Builders, 2 lines with no tax code. 1 of 2 found: standard rated, from their last 6 bills'), ('Review and finalise the return', 'Rudo', 'todo', 'Opens VAT-7. Finalise is Rudo’s press (Ctrl ↵)'), ('File with ZIMRA, then mark it filed', 'Rudo', 'todo', 'Vane cannot file. Mark filed once ZIMRA’s portal accepts it')]).replace('padding: 7px 0;', 'padding: 12px 0; border-bottom: 1px solid ' + C['soft'] + ';'),
  l1=label('It reads'), kv1=kv([('VAT summary', 'September'), ('Invoices and bills', '59 rows'), ('Trial balance', 'to check 2200 agrees')]), l2=label('It may write'), kv2=kv([('VAT-7', 'as a draft'), ('Tax codes', 'suggested on the bill lines, kept by Rudo')]))
body = T('        <div style="flex: 1 1 auto; display: flex; min-height: 0;"><div style="flex: none; width: 340px; border-right: 1px solid [[line]];">[[pl]]</div><div style="flex: 1 1 0; min-width: 0;">[[d]]</div></div>\n', pl=pl, d=detail)
save(P, 'PageVanePlan.dc.html', doc('Vane · Plans', frame('crm', 'vane', 'Plans', topbar('Plans', 'list'), body, railCur='vane'), {'actions': [{'label': 'Give Vane a job', 'kind': 'primary', 'glyph': 'plus', 'kbd': 'Ctrl J'}]}, 1440, 900))

# ---------------- Give Vane a job
prop = T('''<div style="padding: 28px; display: flex; flex-direction: column; gap: 18px; max-width: 820px;">
  <label style="display: flex; flex-direction: column; gap: 8px;"><span style="font-weight: 600;">What should Vane do?</span><span style="min-height: 64px; box-sizing: border-box; padding: 12px 14px; border: 2px solid [[acc]]; border-radius: 10px; font-size: 14.5px;">Get the October close ready, so we can close on the 3rd.</span></label>
  <div style="border: 1px solid [[line]]; border-radius: 12px; overflow: hidden;">
    <div style="display: flex; align-items: center; gap: 8px; padding: 14px 18px; border-bottom: 1px solid [[line]]; background: [[ground]];">[[vm]]<span style="font-weight: 600;">Here is the plan. Nothing starts until you press Start.</span></div>
    <div style="padding: 6px 18px 4px;">[[st]]</div>
    <div class="cm-grid2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 12px 18px 16px; border-top: 1px solid [[line]];"><div style="display: flex; flex-direction: column; gap: 6px;">[[l1]][[kv1]]</div><div style="display: flex; flex-direction: column; gap: 6px;">[[l2]][[kv2]]</div></div>
    <div style="display: flex; gap: 8px; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid [[line]];">[[b1]][[b2]][[b3]]</div>
  </div>
</div>''', vm=VANE_MARK(), st=steps([('Check every account in the trial balance agrees', 'Vane', 'todo', '61 accounts, as of 31 October'), ('Draft the payroll accrual journal', 'Vane', 'todo', 'From the October run, as a draft journal'), ('List receipts not fiscalised and postings that failed', 'Vane', 'todo', 'From Fiscalisation and Posting rules'), ('Post the journals', 'Rudo', 'todo', 'Journals → Post (Ctrl ↵)'), ('Replay the failed postings', 'Rudo', 'todo', 'Posting rules → Replay'), ('Close October', 'James', 'todo', 'Periods → Close, once the checklist is clear')]).replace('padding: 7px 0;', 'padding: 9px 0; border-bottom: 1px solid ' + C['soft'] + ';'),
  l1=label('It will read'), kv1=kv([('Trial balance', 'October'), ('Journals', 'drafts'), ('Posting rules', 'failures'), ('Fiscalisation', 'queued')]), l2=label('It may write'), kv2=kv([('A journal', 'as a draft'), ('Cards', 'for Rudo and James')]),
  b1=btn('Cancel'), b2=btn('Change the steps', 'pencil'), b3=primary_k('Start', 'Ctrl ↵'))
save(P, 'PageVaneJob.dc.html', doc('Vane · Give Vane a job', frame('crm', 'vane', 'Plans', topbar('Give Vane a job', 'plus'), prop, railCur='vane'), {'actions': []}, 1440, 900))

# ---------------- Done
DONE = [('__group__', 'Today', '14', ''),
 [('09:12', 'muted'), ('Drafted INV-0143 from QT-0398', 'lead'), ('books.won-no-invoice', 'code'), ('Issued by James, 10:14', ''), ('$6,400.00', 'num')],
 [('06:20', 'muted'), ('Found Simba has no NSSA number', 'lead'), ('pay.run-check', 'code'), ('Open', 'muted'), ('', 'faint')],
 [('06:10', 'muted'), ('Drafted 2 changes to Floor site visit', 'lead'), ('forms.required', 'code'), ('Open', 'muted'), ('', 'faint')],
 [('06:04', 'muted'), ('Found 3 invoices past their terms', 'lead'), ('books.past-terms', 'code'), ('Statements opened by Rudo', ''), ('$2,480.00', 'num')],
 [('06:02', 'muted'), ('Prepared the September VAT return', 'lead'), ('books.vat-plan', 'code'), ('Waiting for Rudo', 'muted'), ('$1,227.20', 'num')],
 [('05:48', 'muted'), ('Checked 14 quotes against the price list', 'lead'), ('crm.quote-price', 'code'), ('1 line changed by Kuda', ''), ('', 'faint')],
 ('__group__', 'Yesterday', '19', ''),
 [('16:40', 'muted'), ('Wrote the message for Pomona Offices’ quote', 'lead'), ('crm.quote-waiting', 'code'), ('Sent by Kuda, 16:52', ''), ('$8,930.00', 'num')],
 [('11:05', 'muted'), ('Answered: why is Negotiating losing deals?', 'lead'), ('reports.explain', 'code'), ('Saved as a template by James', ''), ('', 'faint')],
 [('09:30', 'muted'), ('Wrote a block for Measured to won', 'lead'), ('reports.block', 'code'), ('Kept by Rudo', ''), ('', 'faint')],
 [('07:02', 'muted'), ('Found Monday’s cash-up short', 'lead'), ('retail.short', 'code'), ('Not now: “already spoke to Chipo”', 'muted'), ('$12.00', 'num')]]
body = params([('calendar', 'Last 7 days', 'on'), ('user', 'Everyone', 'menu'), ('grid4', 'Every template', 'menu')], '33 jobs · 1,284 this month') + \
  table([('When', '70px', 'l'), ('What Vane did', 'minmax(0, 1.3fr)', 'l'), ('Template', '180px', 'l'), ('What happened next', 'minmax(0, 1fr)', 'l'), ('Amount', '110px', 'r')], DONE, rowh=40)
save(P, 'PageVaneDone.dc.html', doc('Vane · Done', frame('crm', 'vane', 'Done', topbar('Done', 'check'), finding('Vane did 14 things today; people took 3 of them further.', 'Every row says what Vane did on its own and who pressed the button after.', pad='26px 28px 20px') + body, railCur='vane'), {'actions': []}, 1440, 900))

# ---------------- Muted
stop = T('        <div style="margin: 20px 28px 0; padding: 14px 16px; border: 1px solid [[line]]; border-radius: 10px; display: flex; align-items: center; gap: 12px;">[[vm]]<span style="flex: 1 1 auto;"><b style="font-weight: 600;">You set aside “Short cash-up” 3 times this month.</b><br><span style="color: [[ink2]];">Shall I stop showing it to you? Tendai and the shop managers still get it.</span></span>[[b1]][[b2]]</div>\n', vm=VANE_MARK(), b1=btn('Keep showing it'), b2=btn('Stop it for me', 'bell'))
MUT = [[('Monday’s cash-up was short, $12.00', 'lead'), ('Showroom', 'muted'), ('Already spoke to Chipo', ''), ('James, 5 Oct', 'muted'), ('Bring back', 'link')],
       [('Quote for Mrs T. Gumbo has waited 3 days', 'lead'), ('Site visits', 'muted'), ('Not mine', ''), ('James, 2 Oct', 'muted'), ('Bring back', 'link')],
       [('Fuel spend is up 18% on September', 'lead'), ('Books', 'muted'), ('Wrong: the van was serviced', ''), ('James, 28 Sep', 'muted'), ('Bring back', 'link')]]
reasons = T('        <div style="margin: 24px 28px 0; display: flex; flex-direction: column; gap: 8px;">[[l]]<div style="display: flex; gap: 8px; flex-wrap: wrap;">[[c]]</div><span style="font-size: 12.5px; color: [[muted]];">Not now asks why in one tap. Vane reads the reason before it raises that kind again.</span></div>\n', l=label('The reasons people give'), c=''.join(chip(x) for x in ('Not mine', 'Already done', 'Wrong', 'Not now', 'Something else')))
body = stop + T('<div style="height: 20px;"></div>') + table([('Card', 'minmax(0, 1.4fr)', 'l'), ('From', '110px', 'l'), ('Reason', 'minmax(0, 1fr)', 'l'), ('Set aside', '120px', 'l'), ('', '100px', 'l')], MUT, rowh=44) + reasons
save(P, 'PageVaneMuted.dc.html', doc('Vane · Muted', frame('crm', 'vane', 'Muted', topbar('Muted', 'bell'), body, railCur='vane'), {'actions': []}, 1440, 900))

# ---------------- States board
def mini(status, title, body, extra=''):
    return T('<div style="flex: 1 1 0; min-width: 0; border: 1px solid [[line]]; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; background: #ffffff;">[[p]]</div>', p=vpanel(T('<div style="padding: 22px 18px; display: flex; flex-direction: column; gap: 10px;"><span style="font-size: 15px; font-weight: 600;">[[t]]</span><span style="color: [[ink2]];">[[b]]</span>[[e]]</div>', t=title, b=body, e=extra) + psec('For you', '', '4') + vcard('Issue', 'Books', '06:04', '3 invoices are past their terms.', 'Cards already made stay where they are.', pad='14px 16px', compact=True), h=640, status=status, foot=False).replace('class="cm-vane" ', '').replace('width: 400px;', 'width: 100%;'))
states = T('<div style="min-height: 100%; box-sizing: border-box; padding: 40px; background: [[ground]]; font: 400 13.5px/1.4 [[sans]]; color: [[ink]];"><h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 600;">Vane’s states</h1><p style="margin: 0 0 24px; color: [[ink2]];">The four the handover left undrawn, in the panel. For you, plans and drafts already made always stay.</p><div style="display: flex; gap: 20px;">[[a]][[b]][[c]][[d]]</div></div>',
  a=mini('Paused', 'Paused by James, 10:20', 'Nothing new is read or drafted until someone resumes.', btn('Resume Vane', 'play')),
  b=mini('Over the allowance', '5,000 of 5,000 jobs this month', 'New jobs start again on 1 November. Plans already started finish.', btn('See this month', 'barChart')),
  c=mini('Working', 'I could not work this out', 'Fuel spend in September: 3 receipts have no amount, so the total would be a guess. Let’s look at the rows.', btn('Show the rows', 'table')),
  d=mini('Cannot reach the service', 'Vane cannot work just now', 'Last worked at 09:12. It tries again on its own every few minutes.', T('<span style="font-size: 12.5px; color: [[muted]];">Next try 09:46</span>')))
save(P, 'PageVaneStates.dc.html', doc('Vane · States', states, {}, 1440, 900))

# ================= Reports =================
import ri_crm
theme('corelith')
ans = psec('You asked', T('<div style="padding: 12px 16px; border-bottom: 1px solid [[soft]]; font-weight: 500;">Why is Negotiating losing deals?</div>')) + \
  psec('Answer', T('<div style="padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid [[soft]];"><span style="font-size: 14.5px; font-weight: 600;">11 deals went cold in Negotiating since July.</span><span style="color: [[ink2]];">8 of them had no call logged after the quote was revised, and 7 are Kuda’s. The ones won there had a call within 3 days.</span>[[t]]<a href="#" style="display: inline-flex; align-items: center; gap: 6px; color: [[muted]]; font-size: 12.5px; text-decoration: none;">[[i]]What I read: Deals, lost in Negotiating since 1 Jul · 11 rows; Activity logged</a></div>', t=table([('Owner', 'minmax(0, 1fr)', 'l'), ('Went cold', '80px', 'r'), ('No call after', '96px', 'r')], [[('Kuda', 'lead'), '7', '6'], [('Tinashe', 'lead'), '3', '2'], [('Farai', 'lead'), '1', '0']], pad='0', rowh=32), i=icon('table', 13))) + \
  vcard('Suggestion', 'Reports', 'now', 'Let’s keep this view.', 'Deals lost in Negotiating since July, grouped by owner. I would call it “Deals gone quiet”.', ('Save as a template', 'Ctrl ↵'), [('Open the 11 rows', 'table')], pad='14px 16px', compact=True)
save(P, 'PageVaneReport.dc.html', doc('Vane · On a report', frame('crm', 'reports', 'Sales and delivery', topbar('Deals', 'funnel', TB_VANE), ri_crm.deals_body(), overlay=vpanel(ans, h=1040), h=1040), {'yes': True, 'actions': ri_crm.DEAL_ACTIONS}, 1440, 1040))

SQL2 = '''select date_trunc('month', f.visited) as month,
       sum(f.area_measured_m2) as won_m2
from crm_visit_forms f
join crm_deals d on d.deal_no = f.deal
where d.outcome = 'Won'
  and f.visited between period_start() and period_end()
group by 1 order by 1'''
MONTHS = [('Apr', 312.4, 140.2), ('May', 598.0, 301.6), ('Jun', 641.2, 322.8), ('Jul', 702.8, 361.4), ('Aug', 655.3, 330.1), ('Sep', 734.9, 372.3), ('Oct', 268.0, 129.0)]
mx = 734.9
blk_left = bars('Measured, by month', [(m_, '{:,.1f}'.format(a), a / mx) for m_, a, b in MONTHS], w_label='40px', pad='18px 18px 14px')
blk_right = T('<div style="position: relative; margin: 6px; border: 2px dashed [[acc]]; border-left: 4px solid [[acc]]; border-radius: 8px;"><span style="position: absolute; top: -12px; left: 10px; height: 22px; display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; border-radius: 5px; background: [[ink]]; color: #ffffff; font-size: 12.5px; font-weight: 500;">[[vm]]won_m2 · Vane’s, not kept</span>[[b]]</div>', vm=icon('vane', 12), b=bars('Won, by month', [(m_, '{:,.1f}'.format(b), b / mx, 'hi') for m_, a, b in MONTHS], w_label='40px', pad='18px 18px 14px'))
canvas = T('        <div style="display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid [[line]];"><span style="font-size: 17px; font-weight: 600;">Measured to won</span>[[c]]</div>', c=chip('Just yours')) + \
  T('<div class="cm-grid2" style="display: grid; grid-template-columns: 1fr 1fr;"><div style="border-right: 1px solid [[line]];">[[a]]</div><div>[[b]]</div></div>', a=blk_left, b=blk_right)
insp = ri_crm.insp_tabs(['Question', 'Show as', 'Size'], 'Question') + T('''<div style="padding: 18px 22px; display: flex; flex-direction: column; gap: 14px;">
  <div style="padding: 12px 14px; border-radius: 10px; background: [[ground]]; border: 1px solid [[line]]; display: flex; flex-direction: column; gap: 8px;"><span style="display: flex; align-items: center; gap: 8px; font-weight: 600;">[[vm]]Vane wrote this question</span><span style="color: [[ink2]];">You asked for won m² beside measured. It joins Site visit forms to Deals, so it is written in SQL; Steps cannot join.</span><span style="display: flex; gap: 8px;">[[b1]][[b2]]</span></div>
  <div role="group" style="display: flex; padding: 2px; border-radius: 8px; background: [[tray]];"><button type="button" style="flex: 1; height: 28px; border: 0; background: transparent; font: 500 13px [[sans]]; color: [[faint]];">Steps</button><button type="button" style="flex: 1; height: 28px; border: 0; border-radius: 6px; background: #ffffff; box-shadow: 0 0 0 1px [[line]]; font: 600 13px [[sans]]; color: [[ink]];">SQL</button></div>
  <pre style="margin: 0; padding: 12px; border-radius: 8px; background: [[ground]]; border: 1px solid [[line]]; border-left: 2px solid [[acc]]; font: 12px/1.55 [[mono]]; color: [[ink2]]; white-space: pre-wrap;">[[sql]]</pre>
  <span style="font-size: 12.5px; color: [[muted]];">7 rows in 0.04 s, read only. Won m² is 1,957.4 in all, the same as the figure above.</span>
  <label style="min-height: 38px; box-sizing: border-box; display: flex; align-items: center; padding: 0 12px; border: 1px solid [[strong]]; border-radius: 8px; color: [[muted]];">Give Vane a change to make</label>
</div>''', vm=VANE_MARK(), b1=btn('Not now', 'x', small=True), b2=primary_k('Keep', 'Ctrl ↵'), sql=SQL2)
ri_crm.P = P
ri_crm.studio('PageVaneBlock.dc.html', 'Vane · A block in the builder', {'name': 'Measured to won', 'sub': 'Built report · Just yours', 'markGlyph': 'barChart', 'markBg': '#2563eb', 'saved': 'Saved; 1 block not kept'},
  ('Blocks', [{'head': 'The page', 'items': [{'label': 'Figures', 'glyph': 'hash'}, {'label': 'measured', 'glyph': 'barChart'}, {'label': 'won_m2 · Vane’s', 'glyph': 'vane', 'on': True}, {'label': 'By rep', 'glyph': 'table'}]}, {'head': 'Reports it can read', 'items': [{'label': 'crm_visit_forms', 'glyph': 'table'}, {'label': 'crm_deals', 'glyph': 'table'}]}]),
  canvas, insp)

# ================= Forms and documents =================
form_sections = [
 {'h': 'Rooms', 'qs': [
   {'q': 'Room areas', 'meta': 'Required', 'kind': 'rooms', 'fig': '27.92 m²', 'rooms': [{'name': 'Lounge', 'a': '5.2', 'b': '4.1', 'area': '21.32 m²'}, {'name': 'Passage', 'a': '6.0', 'b': '1.1', 'area': '6.60 m²'}]},
   {'q': 'Subfloor', 'meta': 'Required, was optional', 'kind': 'choice', 'tag': 'Vane’s change, not kept', 'tagGlyph': 'vane', 'opts': [{'l': 'Concrete', 'on': True}, {'l': 'Timber boards'}, {'l': 'Existing tiles'}, {'l': 'Screed, new'}]},
   {'q': 'Moisture reading', 'meta': 'When the subfloor is concrete or screed', 'kind': 'one', 'value': '3.4', 'unit': '%', 'fig': '3.4%', 'child': True, 'num': True}]},
 {'h': 'Finishes', 'qs': [{'q': 'Skirting wanted', 'meta': 'Optional', 'kind': 'choice', 'opts': [{'l': 'Yes', 'on': True}, {'l': 'No'}]}]}]
fins = T('''<div style="height: 48px; flex: none; display: flex; align-items: stretch; gap: 20px; padding: 0 22px; border-bottom: 1px solid [[line]];"><button type="button" style="border: 0; background: transparent; padding: 0; color: [[muted]]; font: 500 13px [[sans]];">Question</button><button type="button" style="border: 0; background: transparent; padding: 0; box-shadow: inset 0 -2px 0 [[ink]]; color: [[ink]]; font: 600 13px [[sans]];">Vane 3</button><button type="button" style="border: 0; background: transparent; padding: 0; color: [[muted]]; font: 500 13px [[sans]];">Settings</button></div>
<div style="padding: 16px 22px; display: flex; flex-direction: column; gap: 12px;">
  <span style="color: [[ink2]];">From 86 visits since July. Kept changes join this form’s draft; reps see them when you publish.</span>
  [[c1]][[c2]][[c3]]
</div>''', c1='', c2='', c3='')
def fchange(title, why, read, kept=False):
    return T('<div style="padding: 12px 14px; border: 1px solid [[line]]; border-left: 3px solid [[bl]]; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;"><span style="font-weight: 600;">[[t]]</span><span style="color: [[ink2]];">[[w]]</span><span style="font-size: 12.5px; color: [[muted]];">Read: [[r]]</span><span style="display: flex; gap: 8px;">[[b]]</span></div>', bl=C['ok'] if kept else C['acc'], t=title, w=why, r=read, b=chip('Kept', 'ok') if kept else (btn('Not now', 'x', small=True) + primary_k('Keep', 'Ctrl ↵')))
fins = fins.replace('<div style="padding: 16px 22px; display: flex; flex-direction: column; gap: 12px;">\n  <span', '<div style="padding: 16px 22px; display: flex; flex-direction: column; gap: 12px;">\n  <span', 1)
fins = fins.replace('\n  \n</div>', '\n  ' + fchange('Make Subfloor required', 'Skipped on 18 of 86 visits. Those quotes were won 33% of the time, against 53% with it.', 'Site visit answers') + fchange('Add Screed as an option', '11 of the 18 skipped visits left a note saying screed. Moisture reading asks for it too.', 'Site visit answers, notes') + fchange('Laminate waste 13%, not 10%', 'On 14 invoiced laminate jobs, the packs used came to 13% over the measured area.', 'Site visit forms, Invoices', kept=True) + '\n</div>')
form_page = T('''<div style="min-height: 900px; display: flex; flex-direction: column; background: #ffffff; color: [[ink]]; font: 400 13.5px/1.4 [[sans]];">
  <dc-import name="StudioBar" name="Floor site visit" sub="Form · draft, 3 changes from Vane" markGlyph="flag" markBg="#cf3d1d" saved="Draft, not published" extraButton="Publish" hint-size="100%,52px"></dc-import>
  <div style="flex: 1 1 auto; min-height: 848px; display: flex;">
    <div class="cm-panel" style="flex: none; display: flex;"><dc-import name="StudioOutline" groups="{{outline}}" height="848" hint-size="240px,848px"></dc-import></div>
    <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column;"><dc-import name="FormPaper" title="Floor site visit" sections="{{sections}}" foot="{{foot}}" height="848" hint-size="100%,848px"></dc-import></div>
    <aside class="cm-insp" style="flex: none; width: 340px; box-sizing: border-box; border-left: 1px solid [[line]]; display: flex; flex-direction: column;">[[f]]</aside>
  </div>
</div>''', f=fins)
save(P, 'PageVaneForm.dc.html', doc('Vane · Changes to a form', form_page, {
  'outline': [{'head': 'Rooms', 'items': [{'label': 'Room areas', 'glyph': 'grid4'}, {'label': 'Subfloor · Vane', 'glyph': 'vane', 'on': True}, {'label': 'Moisture reading', 'glyph': 'thermometer', 'child': True}]}, {'head': 'Finishes', 'items': [{'label': 'Skirting wanted', 'glyph': 'checkCircle'}, {'label': 'Doorways', 'glyph': 'hash'}]}, {'head': 'Quote lines', 'items': [{'label': 'Laminate planks · 13% waste', 'glyph': 'receipt'}, {'label': 'Underlay', 'glyph': 'receipt'}]}],
  'sections': form_sections, 'foot': {'text': 'These answers draft a quote of', 'strong': '$1,041.26', 'rest': ', 6 lines', 'button': 'See the quote', 'glyph': 'receipt'}}, 1440, 900))

# document: quotation with Vane's check and message
LINES = [('Laminate planks, oak', '13 packs × 2.22 m²', '$24.50', '$318.50', False), ('Underlay', '2 rolls × 15 m²', '$46.50', '$93.00', True), ('Moisture barrier', '2 rolls × 20 m²', '$38.00', '$76.00', False), ('Skirting, oak', '24 m', '$4.20', '$100.80', False), ('Fitting', '27.92 m²', '$6.00', '$167.52', False), ('Delivery', '1', '$40.00', '$40.00', False)]
lr = ''.join(T('<div style="display: grid; grid-template-columns: minmax(0, 1fr) 140px 80px 90px; gap: 10px; padding: 9px 10px; border-bottom: 1px solid [[soft]]; background: [[bg]]; box-shadow: [[sh]];"><span>[[a]]</span><span style="color: [[muted]];">[[b]]</span><span style="text-align: right; font-family: [[mono]];">[[c]]</span><span style="text-align: right; font-family: [[mono]];">[[d]]</span></div>', bg=C['sel'] if f else '#ffffff', sh=('inset 3px 0 0 ' + C['acc']) if f else 'none', a=a, b=b, c=c, d=dd) for a, b, c, dd, f in LINES)
paper = T('''<div style="flex: 1 1 0; min-width: 0; background: [[ground]]; padding: 28px 32px; box-sizing: border-box;"><div style="background: #ffffff; border: 1px solid [[line]]; border-radius: 4px; padding: 32px 36px; display: flex; flex-direction: column; gap: 16px;">
  <div style="display: flex; align-items: center; gap: 10px;"><span style="width: 30px; height: 30px; border-radius: 6px; background: #cf3d1d;"></span><span style="font-size: 17px; font-weight: 600;">Floorcode</span><span style="margin-left: auto; text-align: right; color: [[muted]]; font-size: 12.5px;">Quotation QT-0402<br>9 October 2026</span></div>
  <div style="color: [[ink2]];">For Pomona Offices · Lounge and passage, 27.92 m²</div>
  <div style="border-top: 1px solid [[line]];">[[lr]]</div>
  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-family: [[mono]];"><span>Subtotal $795.82</span><span style="color: [[muted]];">VAT 15.5% $123.35</span><span style="font-weight: 600; font-size: 15px;">Total $919.17</span></div>
</div></div>''', lr=lr)
dinsp = T('''<div style="padding: 18px 22px; display: flex; flex-direction: column; gap: 14px;">
  <div style="padding: 12px 14px; border: 1px solid [[line]]; border-left: 3px solid [[acc]]; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;"><span style="display: flex; align-items: center; gap: 8px; font-weight: 600;">[[vm]]Underlay is under the price list</span><span style="color: [[ink2]];">$46.50 a roll here; the price list says $49.80 since 1 October. The other 5 lines match.</span><span style="font-size: 12.5px; color: [[muted]];">Read: Quotes, the price list</span><span style="display: flex; gap: 8px;">[[b1]][[b2]]</span></div>
  <div style="display: flex; flex-direction: column; gap: 8px;">[[l]]<div style="padding: 12px 14px; border-radius: 10px; background: #e7f4ee; color: [[ink]]; white-space: pre-line;">Good afternoon. Here is the quote for the lounge and passage, 27.92 m² of oak laminate, fitted: $919.17 with VAT. It holds for 30 days. Kuda can start on Monday 19 October if that suits you.</div><span style="font-size: 12.5px; color: [[muted]];">Vane wrote this. Change anything; it goes only when you press Send.</span></div>
  <div style="display: flex; gap: 8px;">[[b3]][[b4]]</div>
</div>''', vm=VANE_MARK(), b1=btn('Leave it', None, small=True), b2=btn('Change the line', 'pencil', small=True), l=label('The message, to 077 412 8830 on WhatsApp'), b3=btn('Download PDF', 'download'), b4=primary_k('Send the quote', 'S'))
doc_page = T('''<div style="min-height: 900px; display: flex; flex-direction: column; background: #ffffff; color: [[ink]]; font: 400 13.5px/1.4 [[sans]];">
  <dc-import name="StudioBar" name="QT-0402 · Pomona Offices" sub="Quotation · draft from Kuda’s visit" markGlyph="receipt" markBg="#cf3d1d" saved="Draft" hint-size="100%,52px"></dc-import>
  <div style="flex: 1 1 auto; min-height: 848px; display: flex;">[[p]]<aside class="cm-insp" style="flex: none; width: 360px; box-sizing: border-box; border-left: 1px solid [[line]];">[[i]]</aside></div>
</div>''', p=paper, i=dinsp)
save(P, 'PageVaneDocument.dc.html', doc('Vane · A document, checked', doc_page, {}, 1440, 900))

# Vane's draft invoice in Books
LN = [('Vinyl sheet, 3 consulting rooms', '58.4 m²', '$62.00', '$3,620.80'), ('Levelling compound', '6 bags', '$31.50', '$189.00'), ('Coved skirting', '64 m', '$9.50', '$608.00'), ('Fitting', '58.4 m²', '$18.17', '$1,123.48')]
inv = band('Lines', '4, copied from QT-0398', top=False) + table([('Item', 'minmax(0, 1fr)', 'l'), ('Quantity', '110px', 'r'), ('Price', '100px', 'r'), ('Amount', '120px', 'r')], [[(a, 'lead'), b, c, dd] for a, b, c, dd in LN], totals=['Subtotal', '', '', '$5,541.28']) + \
  T('        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; padding: 14px 28px; font-family: [[mono]];"><span style="color: [[muted]];">VAT 15.5% $858.90</span><span style="font-weight: 600; font-size: 15px;">Total $6,400.18</span></div>\n')
banner = T('        <div style="margin: 18px 28px 0; padding: 12px 14px; border-radius: 10px; background: [[ground]]; border: 1px solid [[line]]; display: flex; align-items: center; gap: 10px;">[[vm]]<span style="flex: 1 1 auto;"><b style="font-weight: 600;">Vane’s draft.</b> Made from QT-0398, accepted on 7 October. Check it, then issue it; nothing is sent or posted until you do.</span><a href="#" style="color: [[muted]]; font-size: 12.5px;">What I read</a></div>\n', vm=VANE_MARK())
facts = aside(label('Invoice') + kv([('Customer', 'Borrowdale Brooke Clinic'), ('For', 'DL-0396, won 7 Oct'), ('Date', 'On issue'), ('Due', '21 days, their usual'), ('Status', chip('Draft', 'warn')), ('Made by', 'Vane, 09:12')]) + T('<span style="margin-top: 8px;">[[l]]</span>', l=label('What changed since the quote')) + kv([('Nothing', 'Lines and prices as accepted')]), 320)
save(P, 'PageVaneDraft.dc.html', doc('Vane · A draft invoice', frame('crm', 'books', 'Invoices', topbar('INV-0143', 'receipt'), banner + finding('$6,400.18 to Borrowdale Brooke Clinic, due 21 days after you issue it.', 'The accepted quote said $6,400.00; VAT rounding on 4 lines adds 18 cents.') + inv, facts, railCur='books'), {'actions': [{'label': 'Delete the draft', 'kind': 'secondary', 'glyph': 'x'}, {'label': 'Issue', 'kind': 'primary', 'glyph': 'send', 'kbd': 'I'}]}, 1440, 900))

# ================= Other workspaces =================
# Retail: reorder drafts
theme('tender')
OR = [{'sel': True, 'cells': [('PO-0218', 'code'), ('Delta Beverages', 'lead'), ('6 products', 'muted'), ('$1,412.40', 'strong'), ('Vane’s draft', 'chip', 'sel'), ('Usual, Tuesdays', 'muted')]},
      [('PO-0219', 'code'), ('Southern Wines', 'lead'), ('3 products', 'muted'), ('$628.00', 'strong'), ('Vane’s draft', 'chip', 'sel'), ('Usual, Thursdays', 'muted')],
      [('PO-0216', 'code'), ('Delta Beverages', 'lead'), ('8 products', 'muted'), ('$1,980.00', 'strong'), ('Received', 'chip', 'ok'), ('6 Oct', 'muted')],
      [('PO-0215', 'code'), ('Mukuru Snacks', 'lead'), ('4 products', 'muted'), ('$312.50', 'strong'), ('Sent', 'chip', 'info'), ('8 Oct', 'muted')]]
body = finding('2 orders are drafted for the 9 products running low.', 'Vane drafted one per usual supplier from Stock to reorder. They go when you send them.') + \
  table([('Order', '90px', 'l'), ('Supplier', 'minmax(0, 1fr)', 'l'), ('Lines', '110px', 'l'), ('Value', '110px', 'r'), ('State', '120px', 'l'), ('Delivers', '140px', 'l')], OR, rowh=42)
rp = psec('For you', vcard('Suggestion', 'Stock', '06:00', '9 products will run out before the next delivery.', 'Castle Lager 340 ml has 2 days of cover. I drafted PO-0218 for Delta and PO-0219 for Southern Wines at your usual quantities. Let’s check them and send.', ('Send PO-0218', 'S'), [('Open it', 'external')], 'Stock to reorder · 9 rows', pad='14px 16px', sel=True, compact=True), '2') + \
  vcard('Issue', 'The floor', 'Sat 18:42', 'Till 1 was short $12.50 on Saturday.', 'The third short shift on Till 1 this month. Let’s look at the shifts.', None, [('Look at the shifts', 'cashRegister')], 'Till shifts', pad='14px 16px', compact=True)
save(P, 'PageVaneRetail.dc.html', doc('Vane · Retail, orders drafted', frame('retail', 'retailReports', '', topbar('Orders', 'tray', TB_VANE), body, overlay=vpanel(rp), railCur='buying', panel=False), {'yes': True, 'actions': [{'label': 'New order', 'kind': 'primary', 'glyph': 'plus', 'kbd': 'N'}]}, 1440, 900))

# Schools: reminders drafted
theme('corelith')
FAM = [('The Moyo family', 'Rumbidzai, Form 3B', '$1,420.00', True), ('The Ncube family', 'Tafadzwa, Form 4A', '$1,180.00', True), ('The Banda family', 'Kudakwashe, Form 3A', '$960.00', True), ('The Zhou family', 'Nyasha, Lower 6', '$870.00', False), ('The Sibanda family', 'Panashe, Form 2C', '$640.00', True), ('The Gumbo family', 'Tariro, Form 1A', '$540.00', True)]
def cb(on):
    return ('<span style="width: 16px; height: 16px; box-sizing: border-box; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #ffffff; background: %s; border: %s;">%s</span>' % (C['acc'] if on else '#ffffff', '0' if on else '1.5px solid ' + C['strong'], icon('check', 11) if on else ''), 'html')
fr = [{'sel': s, 'cells': [cb(s), (a, 'lead'), (b, 'muted'), c, ('Portal and SMS', 'muted'), ('Payment plan agreed' if not s else '', 'muted')]} for a, b, c, s in FAM]
msg = T('        <div style="margin: 0 28px 18px; padding: 14px 16px; border: 1px solid [[line]]; border-radius: 10px; display: flex; flex-direction: column; gap: 6px;"><span style="display: flex; align-items: center; gap: 8px; font-weight: 600;">[[vm]]The reminder Vane drafted</span><span style="color: [[ink2]];">Dear [family], Mazowe High has not yet received third-term fees for [pupil]: [amount]. You can pay at the bursary, by EcoCash to 0712 400 500, or ask us for a payment plan. Thank you.</span><span style="font-size: 12.5px; color: [[muted]];">Each family sees its own name and amount. Change the words here; it changes all 41.</span></div>\n', vm=VANE_MARK())
body = finding('41 families have paid nothing this term, $21,980.00 between them.', 'Vane drafted a reminder for each. 3 are unticked: they have a payment plan.') + msg + \
  table([('', '28px', 'l'), ('Family', 'minmax(0, 1fr)', 'l'), ('Pupil', 'minmax(0, 1fr)', 'l'), ('Owed', '110px', 'r'), ('Goes by', '120px', 'l'), ('', '170px', 'l')], fr, rowh=40) + \
  pager('38 of 41 ticked', T('<span>Owed <b style="font: 600 13px [[mono]]; color: [[ink]];">$20,410.00</b></span>'))
save(P, 'PageVaneSchool.dc.html', doc('Vane · Schools, reminders drafted', frame('schools', 'schoolReports', 'Fees', topbar('Remind families', 'money'), body, railCur='fees', panel=False), {'actions': [{'label': 'Discard the drafts', 'kind': 'secondary', 'glyph': 'x'}, {'label': 'Send 38 reminders', 'kind': 'primary', 'glyph': 'send', 'kbd': 'S'}]}, 1440, 900))

# Mine: work order drafted
HIST = [[('8 Oct', 'muted'), ('Mill 1', 'lead'), ('Feed pump seal', ''), '6.0', ('Seal replaced from stores', 'muted')], [('29 Sep', 'muted'), ('Mill 1', 'lead'), ('Feed pump seal', ''), '5.0', ('Seal replaced from stores', 'muted')], [('14 Sep', 'muted'), ('Mill 1', 'lead'), ('Feed pump seal', ''), '0.0', ('Leak noticed, ran on', 'muted')]]
banner2 = banner.replace('Made from QT-0398, accepted on 7 October. Check it, then issue it; nothing is sent or posted until you do.', 'The feed pump seal on Mill 1 failed 3 times in 30 days. Vane drafted this work order with the history; raise it to send it to the workshop.')
body = banner2 + finding('Rebuild the Mill 1 feed pump, not the seal again.', '11 hours lost to it since 14 September. The seal kit is in stores; the impeller is not.') + \
  T('        <div style="padding: 0 28px 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;">[[a]][[b]][[c]]</div>\n', a=field('Equipment', 'Mill 1 feed pump, P-104', menu=True), b=field('Assign to', 'Mr Chari, engineer', menu=True), c=field('Priority', 'High: lost 11 hours', menu=True)) + \
  band('What happened before', '3 stops · 11.0 hours') + table([('Date', '80px', 'l'), ('Site', '100px', 'l'), ('Cause', 'minmax(0, 1fr)', 'l'), ('Hours', '80px', 'r'), ('Notes', 'minmax(0, 1fr)', 'l')], HIST, rowh=38) + \
  band('Parts', 'from stores') + table([('Part', 'minmax(0, 1fr)', 'l'), ('On hand', '100px', 'r'), ('Needed', '100px', 'r')], [[('Pump seal kit, 80 mm', 'lead'), '4', '1'], [('Impeller, 80 mm', 'lead'), ('0', 'bad'), '1']], rowh=38)
save(P, 'PageVaneMine.dc.html', doc('Vane · Gold mine, a work order drafted', frame('mine', 'mineReports', '', topbar('Work order · draft', 'wrench'), body, railCur='maintenance', panel=False), {'actions': [{'label': 'Delete the draft', 'kind': 'secondary', 'glyph': 'x'}, {'label': 'Raise the work order', 'kind': 'primary', 'glyph': 'send', 'kbd': 'R'}]}, 1440, 900))

# Phone: a fitter's For you
phone = T('''<div style="width: 390px; min-height: 844px; box-sizing: border-box; background: #ffffff; color: [[ink]]; font: 400 14px/1.4 [[sans]]; display: flex; flex-direction: column;">
  <div style="height: 54px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid [[line]];">[[vm]]<span style="font-size: 17px; font-weight: 600;">For you</span><span style="margin-left: auto; font: 12px [[mono]]; color: [[muted]];">Kuda · 2</span></div>
  <div style="padding: 14px 16px; color: [[ink2]];">Only your own visits and quotes.</div>
  [[c1]]
  <div style="margin: 0 16px 16px; padding: 12px; border-radius: 12px; background: #e7f4ee; font-size: 13.5px;">Good afternoon. Here is the quote for the offices, 212.40 m² of carpet tiles over concrete, fitted: $8,930.00 with VAT. It holds for 30 days.</div>
  [[c2]]
  <div style="flex: 1 1 auto;"></div>
  <div style="height: 64px; flex: none; display: flex; justify-content: space-around; align-items: center; border-top: 1px solid [[line]]; color: [[muted]]; font-size: 11.5px;">[[nav]]</div>
</div>''', vm=VANE_MARK(),
  c1=vcard('Suggestion', 'Site visits', 'Thu 14:05', 'Pomona Offices’ quote has waited since Tuesday.', 'You measured 212.40 m² of concrete. I wrote the message. Let’s send it before the weekend.', ('Send the quote', 'S'), [('Open it', 'external')], 'Quotes · QT-0399', pad='14px 16px', compact=True).replace('max-width: 660px;', ''),
  c2=vcard('Issue', 'Site visits', 'Thu 09:40', 'Mrs T. Gumbo’s visit has no moisture reading.', 'The quote cannot price the barrier without it. Let’s add it when you are back on Saturday.', None, [('Open the visit', 'calendar')], 'Site visit forms · 1 row', pad='14px 16px', compact=True).replace('max-width: 660px;', ''),
  nav=''.join(T('<span style="display: flex; flex-direction: column; align-items: center; gap: 4px; color: [[c]];">[[i]][[l]]</span>', c=C['ink'] if l == 'Vane' else C['muted'], i=icon(g, 20), l=l) for g, l in [('calendar', 'Visits'), ('receipt', 'Quotes'), ('vane', 'Vane'), ('user', 'Me')]))
save(P, 'PageVanePhone.dc.html', doc('Vane · A fitter’s phone', phone, {}, 390, 844))
print('vane pages ok')
