# Tender till, T2–T5 (fork T-B). Reuses gen.py's helpers without rewriting T1.
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, 'gen.py')).read()
# neutralise gen.py's own file writes and its print, keep every helper
_src = _src.replace("open(PR + name + '.dc.html', 'w').write(", "(lambda s: None)(").replace("print('ok')", "")
_g = {'__file__': os.path.join(HERE, 'gen.py')}
exec(_src, _g)
for k in ['PR', 'head', 'foot', 'i', 'MARK', 'PHOTO', 'DOORS', 'SHELF', 'CATS', 'shelf', 'line', 'sale_head',
          'tray_head', 'part', 'cphone', 'held_row', 'REF']:
    globals()[k] = _g[k]

# ---------- icons-posb.css ----------
A = os.path.join(HERE, '..', 'ph', 'node_modules', '@phosphor-icons', 'core', 'assets')
ICONS = {  # name: weight
    'address-book': 'fill', 'barn': 'fill', 'calendar-blank': 'fill', 'copy': 'fill', 'seal-check': 'fill',
    'bell': 'fill', 'house': 'fill', 'user-check': 'fill', 'chart-line-up': 'fill',
    'arrow-left': 'regular', 'arrow-right': 'regular', 'arrow-clockwise': 'regular', 'x': 'regular',
    'minus': 'regular', 'square': 'regular', 'lock-simple': 'regular', 'star': 'regular', 'caret-left': 'bold',
    'buildings': 'fill', 'storefront': 'fill', 'list': 'regular', 'package': 'fill', 'user-circle': 'fill',
}
css = []
for n, w in ICONS.items():
    f = f'{A}/{w}/{n}.svg' if w == 'regular' else f'{A}/{w}/{n}-{w}.svg'
    svg = open(f).read().strip()
    svg = re.sub(r'\s+', ' ', svg).replace('"', '%22').replace('<', '%3C').replace('>', '%3E').replace('#', '%23')
    css.append(f'.i-posb-{n}{{--m:url("data:image/svg+xml,{svg}")}}')
open(PR + 'icons-posb.css', 'w').write('\n'.join(css) + '\n')

def b(n):
    return f'<span class="i i-posb-{n}"></span>'

def headb(title, w, h):
    return head(title, w, h).replace('<link rel="stylesheet" href="pos.css">',
                                     '<link rel="stylesheet" href="pos.css">\n<link rel="stylesheet" href="icons-posb.css">\n<link rel="stylesheet" href="pos-b.css">')

def write(name, title, html, w=1380, h=900):
    open(PR + name + '.dc.html', 'w').write(headb(title, w, h) + html + foot(w, h))

# ---------- shell, per person and till ----------
PEOPLE = {'rumbidzai': 'Rumbidzai Moyo', 'tendai': 'Tendai Chari', 'nyasha': 'Nyasha Mlambo'}

def bar(t, till='Till 1'):
    return f'''<div class="pos-bar">{MARK}<span class="pos-bar__shop">Mufaro Hardware</span><span class="pos-bar__till">· {till}</span><span class="spacer"></span>{i('wifi-high')}<span class="pos-time">{t}</span></div>'''

def rail(cur='till', held=2, me='rumbidzai'):
    out = [f'<nav class="pos-rail" aria-label="Till"><img class="pos-rail__me" src="{PHOTO[me]}" alt="{PEOPLE[me]}" width="44" height="44">']
    for k, ic, lab in DOORS:
        cu = ' aria-current="page"' if k == cur else ''
        n = f'<span class="pos-door__n">{held}</span>' if k == 'held' and held else ''
        out.append(f'<a class="pos-door" href="#"{cu}>{i(ic)}{lab}{n}</a>')
    out.append(f'<a class="pos-door pos-rail__foot" href="#">{i("lock-simple")}Lock</a></nav>')
    return ''.join(out)

def device(time, body, extra='', over='', till='Till 1'):
    return f'''<div class="cx pos-board" data-theme="tender"><div class="pos-dev"><div class="pos-scr">{bar(time, till)}<div class="pos-body">{body}{extra}</div>{over}</div></div></div>'''

def pc(time, body, extra='', over=''):
    """Till 2: a Windows PC. The same till in a browser window filling a 1440 × 900 screen."""
    return f'''<div class="cx posb-pc" data-theme="tender">
<div class="posb-tabs"><span class="posb-tab">{MARK}<span>Till 2 · Mufaro Hardware</span>{b('x')}</span><span class="posb-tabs__new">{i('plus')}</span><span class="spacer"></span><span class="posb-win">{b('minus')}{b('square')}{b('x')}</span></div>
<div class="posb-addr">{b('arrow-left')}{b('arrow-right')}{b('arrow-clockwise')}<span class="posb-url">{b('lock-simple')}<span>till.huchu.app</span></span>{b('star')}</div>
<div class="pos-scr posb-scr">{bar(time, 'Till 2')}<div class="pos-body">{body}{extra}</div>{over}</div>
</div>'''

def sale_col(head_html, lines_html, sum_html, act_html, extra=''):
    return f'<section class="pos-sale" aria-label="Sale">{head_html}{extra}<div class="pos-lines">{lines_html}</div><div class="pos-sum">{sum_html}</div>{act_html}</section>'

def sumrow(l, r):
    return f'<div class="pos-sum__row"><span>{l}</span><span class="spacer"></span><span>{r}</span></div>'

def take(label, amt, kbd='↵', icon=''):
    a = f' <b>US${amt}</b>' if amt else ''
    return f'<span class="pos-take" role="button">{icon}{label}{a}<span class="kbd">{kbd}</span></span>'

def act1(label, amt, kbd='↵', icon=''):
    return f'<div class="pos-act" style="grid-template-columns: 1fr">{take(label, amt, kbd, icon)}</div>'

def act_print(label, kbd):
    return f'<div class="pos-act"><span class="pos-hold" role="button" aria-label="Print again">{i("printer")}</span>{take(label, None, kbd)}</div>'

def fact(g, t, v, gl=None):
    return f'<div class="pos-fact">{gl or i(g)}<span>{t}</span><span>{v}</span></div>'

KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']
def keypad(down=None, dot=True, dim=False):
    ks = KEYS if dot else ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0']
    out = ''.join(f'<span class="pos-key{" pos-key--down" if k == down else ""}{" posb-key--blank" if k == "" else ""}" role="button">{k}</span>' for k in ks)
    out += f'<span class="pos-key" role="button" aria-label="Delete">{i("backspace")}</span>'
    return f'<div class="pos-keys{" posb-dim" if dim else ""}">{out}</div>'

# =====================================================================
# T2 · a sale on account, S-10482 · Till 1 · Rumbidzai · 09:56–09:58
# =====================================================================
ACC = 'Mavhima Construction'
S82_COUNTS = {'Cement 32.5R 50 kg': 20, 'Rebar Y12 6 m': 10, 'River sand, per tonne': 2, 'Binding wire 25 kg': 1}
def s82_lines(ro=False):
    return (line(20, 'Cement 32.5R 50 kg', '11.50', '230.00', ro=ro)
            + line(10, 'Rebar Y12 6 m', '9.80', '98.00', ro=ro)
            + line(2, 'River sand, per tonne', '45.00', '90.00', sub='2 t · US$45.00 a tonne', ro=ro)
            + line(1, 'Binding wire 25 kg', '68.00', '68.00', on=not ro, ro=ro))
S82_SUM = sumrow('33 items', 'VAT US$65.22')

def acct_strip(owes='826.40'):
    return f'<div class="posb-acct">{b("address-book")}<span>On account</span><span class="posb-acct__m">30 days</span><span class="spacer"></span><span class="posb-acct__k">Owes</span><span class="pos-m">US${owes}</span></div>'

def s82_head():
    return f'<div class="pos-sale__h"><span class="pos-sale__t">Sale</span><span class="spacer"></span><span class="pos-pill">{b("buildings")}{ACC}</span><span class="pos-icon" role="button" aria-label="More">{i("dots-three")}</span></div>'

# T2-1 add the customer
s82_walkin = sale_col(sale_head(), s82_lines(), S82_SUM, act1('Take', '486.00'))
def crow(on, g, t, s, v=None):
    v = f'<span class="posb-crow__v"><span class="posb-crow__k">Owes</span> <span class="pos-m">US${v}</span></span>' if v else '<span></span>'
    return f'<div class="posb-crow{" posb-crow--on" if on else ""}" role="option" aria-selected="{"true" if on else "false"}"><span class="pos-row__g">{g}</span><div style="min-width: 0"><div class="pos-row__t">{t}</div><div class="pos-row__s">{s}</div></div>{v}</div>'
cust_sheet = f'''<div class="pos-scrim pos-scrim--all"></div><div class="pos-sheet" role="dialog" aria-label="Customer" style="width: 600px">
<div class="pos-sheet__t">Customer</div>
<div class="pos-input">{i('magnifying-glass')}<span style="margin-left: 12px">Mavh</span><span class="pos-caret" style="margin-left: 2px"></span></div>
<div class="posb-clist" role="listbox">
{crow(True, b('buildings'), ACC, '<span class="m">CU-0218</span> · On account, 30 days', '826.40')}
{crow(False, b('user-circle'), 'Mavhunga, Farai', '<span class="m">CU-0391</span> · <span class="m">0773 418 260</span>')}
</div>
<div class="pos-btns"><span class="pos-btn" role="button">Cancel</span><span class="pos-btn pos-btn--go" role="button">{b('address-book')}Add {ACC}<span class="kbd">↵</span></span></div>
</div>'''
write('T2-1-customer', 'T2 Add the customer', device('09:56', rail() + shelf(S82_COUNTS) + s82_walkin, over=cust_sheet))

# T2-2 the sale shows the account
s82_acct = sale_col(s82_head(), s82_lines(), S82_SUM, act1('Take', '486.00'), extra=acct_strip())
write('T2-2-account-sale', 'T2 Sale on the account', device('09:57', rail() + shelf(S82_COUNTS) + s82_acct))

# T2-3 the tray, On account
TEN6 = [('cash', 'money', 'Cash', i), ('card', 'credit-card', 'Card', i), ('ecocash', 'device-mobile', 'EcoCash', i),
        ('innbucks', 'wallet', 'InnBucks', i), ('account', 'address-book', 'On account', b), ('split', 'arrows-split', 'Split', i)]
def tenders6(on):
    return '<div class="pos-tenders posb-tenders6">' + ''.join(
        f'<span class="pos-tender" role="button" aria-pressed="{"true" if k == on else "false"}">{f(g)}{n}</span>' for k, g, n, f in TEN6) + '</div>'
tray_acct = f'''<div class="pos-scrim"></div><aside class="pos-tray" aria-label="Pay">{tray_head('Take', '486.00')}{tenders6('account')}
<div class="pos-parts">
  <div class="pos-part pos-part--now" style="row-gap: 14px">
    <span class="pos-part__g">{b('buildings')}</span><div style="min-width: 0"><div class="pos-part__t">{ACC}</div><div class="pos-part__s">CU-0218 · 30 days</div></div><span class="pos-part__v">US$486.00</span>
    <div class="posb-owes">
      <div><div class="posb-owes__k">Owes</div><div class="posb-owes__v">US$826.40</div></div>
      {i('arrow-right')}
      <div><div class="posb-owes__k">After this sale</div><div class="posb-owes__v posb-owes__v--to">US$1,312.40</div></div>
    </div>
  </div>
</div>
<div class="pos-tray__foot pos-tray__foot--one">{take('Charge to account', '486.00')}</div>
</aside>'''
write('T2-3-charge-account', 'T2 Charge to account', device('09:58', rail() + shelf(S82_COUNTS) + s82_acct, tray_acct))

# T2-4 charged
charged = f'''<section class="pos-sale" aria-label="Charged" style="background: var(--surface)">
<div class="pos-paid">
  <span class="pos-paid__mark">{i('check-circle')}</span>
  <div class="pos-paid__k">On account</div>
  <div class="pos-paid__v" style="font-size: 64px">US$486.00</div>
  <div class="pos-paid__z" style="font-family: var(--font-sans)">{ACC}</div>
  <div class="pos-facts">
    {fact('receipt', 'Sale', 'S-10482')}
    {fact('', 'Owes now', 'US$1,312.40', b('address-book'))}
    {fact('printer', 'Receipt printed', '09:58')}
    {fact('hourglass', 'Fiscal code', 'to follow')}
  </div>
</div>
{act_print('Next sale', 'N')}
</section>'''
write('T2-4-charged', 'T2 Charged to the account', device('09:58', rail() + shelf() + charged))

# T2-5 customer screen
CL82 = '<div class="pos-clines">' + ''.join(f'<div class="pos-cline"><span>{q}</span><span>{n}</span><span>{v}</span></div>' for q, n, v in [
    ('20', 'Cement 32.5R 50 kg', '230.00'), ('10', 'Rebar Y12 6 m', '98.00'), ('2 t', 'River sand, per tonne', '90.00'), ('1', 'Binding wire 25 kg', '68.00')]) + '</div>'
c_acct = cphone(CL82 + f'''<div class="pos-ctotal" style="padding: 16px 24px"><div style="display: flex; align-items: baseline"><span class="pos-ctotal__k">Total</span><span class="pos-m" style="margin-left: auto; font-size: 20px; color: var(--ink)">US$486.00</span></div></div>
<div class="pos-cpay"><span class="pos-cpay__k">On account</span><span style="font-size: 22px; font-weight: 600; letter-spacing: -0.01em">{ACC}</span><span class="pos-m" style="font-size: 15px; opacity: 0.75">CU-0218</span></div>''')
c_done = cphone(f'''<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 0 28px 60px; text-align: center">
<span class="pos-paid__mark" style="margin-bottom: 18px">{i('check-circle')}</span>
<div style="color: var(--ink); font-size: 30px; font-weight: 600; letter-spacing: -0.02em">Thank you</div>
<div class="pos-paid__k" style="margin-top: 28px; font-size: 16px">On account</div>
<div class="pos-m" style="font-size: 48px; color: var(--ink); letter-spacing: -0.03em">US$486.00</div>
<div class="pos-paid__z" style="font-family: var(--font-sans)">{ACC}</div>
<div class="pos-m" style="margin-top: 36px; color: var(--ink-3); font-size: 14px">S-10482 · 09:58</div>
</div>''')
write('T2-5-customer-screen', 'T2 Customer screen', f'<div class="cx pos-cboard" data-theme="tender" style="gap: 64px">{c_acct}{c_done}</div>')

# =====================================================================
# T3 · refund on S-10466 · Till 1 · Rumbidzai · 08:44–08:47
# =====================================================================
def hrow(on, g, t, ref, when, how, v, tag=''):
    tag = f'<span class="posb-tag">{tag}</span>' if tag else ''
    return f'<div class="posb-hrow{" posb-hrow--on" if on else ""}" role="button"><span class="posb-hrow__g">{g}</span><div style="min-width: 0"><div class="posb-hrow__t">{t}{tag}</div><div class="posb-hrow__s"><span class="m">{ref}</span> · <span class="m">{when}</span> · {how}</div></div><span class="posb-hrow__v">US${v}</span></div>'

PAYS = ['All', 'Cash', 'Card', 'EcoCash', 'InnBucks', 'On account']
def filters(on='All'):
    return '<div class="pos-cats">' + ''.join(f'<span class="pos-cat" role="button" aria-pressed="{"true" if p == on else "false"}">{p}</span>' for p in PAYS) + '</div>'

def history(rows, since, n, on='All'):
    return f'''<section class="pos-shelf posb-hist" aria-label="History">
<div style="display: flex; align-items: baseline; gap: 14px; padding-top: 8px"><h1 class="pos-h1">History</h1><span class="posb-h1__m">Since <span class="pos-m">{since}</span> · {n}</span><span class="spacer"></span><span class="pos-icon" role="button" aria-label="Find a sale" style="align-self: center">{i('magnifying-glass')}</span></div>
{filters(on)}
<div class="posb-hlist">{''.join(rows)}</div></section>'''

R66 = lambda on, tag='': hrow(on, i('money'), 'PVC elbow 20 mm and 2 more', 'S-10466', '08:21', 'Cash', '13.10', tag)
R62 = hrow(False, i('device-mobile'), 'Paint roller 225 mm and 1 more', 'S-10462', '08:09', 'EcoCash', '7.70')
R59 = hrow(False, i('money'), 'Pillar tap 15 mm', 'S-10459', '08:02', 'Cash', '8.50')

S66_LINES = (line(4, 'PVC elbow 20 mm', '1.20', '4.80', ro=True) + line(1, 'PVC pipe 20 mm 6 m', '4.90', '4.90', ro=True)
             + line(1, 'Solvent cement 100 ml', '3.40', '3.40', ro=True))

def rec_head(t, ref, when):
    return f'<div class="pos-sale__h"><span class="pos-sale__t">{t}</span><span class="pos-sale__code">{ref} · {when}</span><span class="spacer"></span><span class="pos-icon" role="button" aria-label="More">{i("dots-three")}</span></div>'

def rec_acts(refund_down=False):
    return f'<div class="pos-act posb-act2"><span class="pos-btn{" posb-btn--down" if refund_down else ""}" role="button">{i("arrow-u-up-left")}Refund</span>{take("Print again", None, "P", i("printer"))}</div>'

rec66 = f'''<section class="pos-sale" aria-label="S-10466">{rec_head('Sale', 'S-10466', '08:21')}
<div class="pos-lines">{S66_LINES}</div>
<div class="posb-recfacts">{fact('money', 'Cash, US$15.00 handed', 'US$13.10')}{fact('printer', 'Receipt printed', '08:21')}</div>
<div class="pos-sum">{sumrow('6 items', 'VAT US$1.76')}</div>
{rec_acts(True)}</section>'''
write('T3-1-history-record', 'T3 History · S-10466', device('08:44', rail('history', held=0) + history([R66(True), R62, R59], '07:58', '3 sales') + rec66))

# T3-2 refund lines with a reason
def rline(q, of, name, unit, val, on=False):
    return f'''<div class="pos-line{" pos-line--on" if on else ""} posb-rline{"" if q else " posb-rline--none"}"><div class="pos-qty"><b role="button" aria-label="One fewer"{'' if q else ' class="posb-off"'}>{i('minus')}</b><span>{q}</span><b role="button" aria-label="One more"{' class="posb-off"' if q == of else ''}>{i('plus')}</b></div><div style="min-width: 0"><div class="pos-line__t">{name}</div><div class="pos-line__s">{of} sold · US${unit} each</div></div><div class="pos-line__v">US${val}</div></div>'''
REASONS = ['Damaged', 'Wrong item', 'Changed mind', 'Overcharged']
refund_pick = f'''<section class="pos-shelf" aria-label="Refund S-10466">
<div style="display: flex; align-items: center; gap: 10px; padding-top: 4px"><span class="pos-icon" role="button" aria-label="Back to S-10466" style="margin-left: -12px">{b('arrow-left')}</span><h1 class="pos-h1">Refund <span class="pos-m" style="font-size: 24px; font-weight: 400; color: var(--ink-3)">S-10466</span></h1></div>
<div class="posb-rlines">
{rline(4, 4, 'PVC elbow 20 mm', '1.20', '4.80', on=True)}
{rline(0, 1, 'PVC pipe 20 mm 6 m', '4.90', '0.00')}
{rline(0, 1, 'Solvent cement 100 ml', '3.40', '0.00')}
</div>
<div class="posb-label">Reason</div>
<div class="pos-cats" style="flex-wrap: wrap">{''.join(f'<span class="pos-cat" role="button" aria-pressed="{"true" if r == "Wrong item" else "false"}">{r}</span>' for r in REASONS)}</div>
</section>'''
ref_col = f'''<section class="pos-sale" aria-label="Refund">
<div class="pos-sale__h"><span class="pos-sale__t">Refund</span><span class="pos-sale__code">S-10466</span></div>
<div class="pos-lines">{line(4, 'PVC elbow 20 mm', '1.20', '4.80', ro=True)}</div>
<div class="posb-recfacts">{fact('money', 'Cash back', 'US$4.80')}</div>
<div class="pos-sum">{sumrow('4 items', 'VAT US$0.64')}</div>
{act1('Refund', '4.80', icon=i('arrow-u-up-left'))}</section>'''
write('T3-2-refund-lines', 'T3 Refund lines and reason', device('08:45', rail('history', held=0) + refund_pick + ref_col))

# T3-3 approval: Ask Tendai sent, waiting; his PIN here is the other way
def who(p, role, on, state=''):
    return f'<span class="posb-who{" posb-who--on" if on else ""}" role="radio" aria-checked="{"true" if on else "false"}"><img src="{PHOTO[p]}" alt="" width="36" height="36"><span><span class="posb-who__n">{PEOPLE[p].split()[0]}</span><span class="posb-who__r">{role}</span></span></span>'

def appr_sheet(state):
    if state == 'waiting':
        ask = f'''<div class="posb-ask"><span class="posb-ask__g">{i('hourglass')}</span><div style="min-width: 0"><div class="posb-ask__t">Asked Tendai</div><div class="posb-ask__s">On his phone · <span class="pos-m">08:45</span></div></div></div>'''
        pin = f'''<div class="posb-pin"><div class="posb-label" style="margin: 0">Tendai's PIN</div><div class="posb-dots"><i></i><i></i><i></i><i></i></div></div>{keypad(dot=False)}'''
    else:
        ask = f'''<div class="posb-ask posb-ask--ok"><span class="posb-ask__g">{b('seal-check')}</span><div style="min-width: 0"><div class="posb-ask__t">Tendai approved</div><div class="posb-ask__s">On his phone · <span class="pos-m">08:46</span></div></div></div>'''
        pin = f'''<div class="posb-pin posb-dim"><div class="posb-label" style="margin: 0">Tendai's PIN</div><div class="posb-dots"><i></i><i></i><i></i><i></i></div></div>{keypad(dot=False, dim=True)}'''
    return f'''<div class="pos-scrim pos-scrim--all"></div><div class="pos-sheet posb-appr" role="dialog" aria-label="A manager approves">
<div style="display: flex; align-items: baseline; gap: 12px"><span class="pos-sheet__t">Refund over US$2.00</span><span class="spacer"></span><span class="pos-m" style="font-size: 20px; color: var(--ink)">US$4.80</span></div>
<div class="posb-whos" role="radiogroup" aria-label="Who approves">{who('tendai', 'Shop manager', True)}{who('nyasha', 'Owner', False)}</div>
{ask}{pin}
<div class="pos-btns"><span class="pos-btn" role="button">Cancel</span></div>
</div>'''
write('T3-3-approval-asked', 'T3 Manager approval · asked', device('08:45', rail('history', held=0) + refund_pick + ref_col, over=appr_sheet('waiting')))

# T3-4 Tendai's phone, Needs you
phone = f'''<div class="cx phone" data-theme="tender">
  <div class="pbar" style="padding-left: var(--s4)"><span class="pbar__t" style="font-size: 18px">Notifications</span><span class="spacer"></span><img class="face face-32" src="{PHOTO['tendai']}" alt="Tendai Chari"></div>
  <div class="pbody">
    <div style="padding: var(--s3) var(--s4)"><div class="seg" role="tablist" aria-label="Show" style="display: flex"><button class="seg__item" role="tab" aria-pressed="true" style="flex: 1; height: 36px">Needs you<span class="chip__n">1</span></button><button class="seg__item" role="tab" aria-pressed="false" style="flex: 1; height: 36px">Everything</button></div></div>
    <div class="irow irow--unread" style="padding-left: var(--s4); cursor: default">
      <img class="face" src="{PHOTO['rumbidzai']}" alt="">
      <div style="min-width: 0">
        <div class="irow__t"><b>Rumbidzai</b> asks you to approve a refund on <b>Till 1</b></div>
        <div class="posb-pask">
          <div style="display: flex; align-items: baseline"><span class="strong" style="font-size: 16px">Refund</span><span class="spacer"></span><span class="pos-m" style="font-size: 22px; color: var(--ink)">US$4.80</span></div>
          <div class="posb-pask__l"><span class="pos-m">4 ×</span><span>PVC elbow 20 mm</span></div>
          <dl class="posb-pask__kv"><dt>Reason</dt><dd>Wrong item</dd><dt>Sale</dt><dd class="pos-m">S-10466</dd><dt>Back as</dt><dd>Cash</dd></dl>
          <div style="display: flex; gap: 8px"><button class="btn" type="button" style="flex: 1; height: 48px"><span class="i i-x"></span>Refuse</button><button class="btn btn--primary" type="button" style="flex: 1.4; height: 48px"><span class="i i-check"></span>Approve</button></div>
        </div>
        <div class="irow__m" style="margin-top: var(--s2)">Till 1<span class="spacer"></span>08:45</div>
      </div>
    </div>
    <div class="nav__h" style="padding-left: var(--s4); padding-top: var(--s4)">Today</div>
    <div class="irow" style="padding-left: var(--s4)">
      <img class="face" src="{PHOTO['rumbidzai']}" alt="">
      <div style="min-width: 0"><div class="irow__t"><b>Rumbidzai</b> opened <b>Till 1</b> with a US$50.00 float</div><div class="irow__m">Shift<span class="spacer"></span>07:58</div></div>
    </div>
    <div class="irow" style="padding-left: var(--s4)">
      <span class="ev__g"><span class="i i-pos-coins"></span></span>
      <div style="min-width: 0"><div class="irow__t">You set today's ZiG rate to <b class="pos-m">26.90</b></div><div class="irow__m">Payments<span class="spacer"></span>07:52</div></div>
    </div>
  </div>
  <nav class="tabbar" aria-label="Tender">
    <a href="#"><span class="i i-house"></span>Today</a>
    <a href="#"><span class="i i-receipt"></span>Sales</a>
    <a href="#"><span class="i i-box"></span>Stock</a>
    <a href="#" aria-current="page"><span class="i i-bell"></span>Notifications<span class="tabbar__n">1</span></a>
    <a href="#"><span class="i i-more"></span>More</a>
  </nav>
</div>'''
write('T3-4-tendai-phone', "T3 Tendai approves on his phone", phone, 390, 844)

# T3-5 the till receives the approval
write('T3-5-approved', 'T3 Approval arrives', device('08:46', rail('history', held=0) + refund_pick + ref_col, over=appr_sheet('approved')))

# T3-6 refunded, cash back, drawer opens
refunded = f'''<section class="pos-sale" aria-label="Refunded" style="background: var(--surface)">
<div class="pos-paid">
  <span class="pos-paid__mark">{i('arrow-u-up-left')}</span>
  <div class="pos-paid__k">Cash back</div>
  <div class="pos-paid__v">US$4.80</div>
  <div class="pos-facts">
    {fact('receipt', 'Refund on', 'S-10466')}
    {fact('', 'Wrong item, 4 × PVC elbow 20 mm', '', b('list'))}
    {fact('', 'Approved by Tendai', '08:46', b('user-check'))}
    {fact('', 'Drawer open', '08:47', i('tray'))}
    {fact('printer', 'Refund slip printed', '08:47')}
  </div>
</div>
{act_print('Done', 'N')}
</section>'''
write('T3-6-refunded', 'T3 Refunded', device('08:47', rail('history', held=0) + history([R66(True, 'Part refunded'), R62, R59], '07:58', '3 sales') + refunded))

# =====================================================================
# T4 · layby payment, LB-0012 · Till 2 (Windows PC) · Tendai · 09:30–09:31
# =====================================================================
lay_find = f'''<section class="pos-shelf" aria-label="Shelf">
<div class="pos-find" style="color: var(--ink)">{i('magnifying-glass')}<span>Tsitsi</span><span class="pos-caret" style="margin-left: -10px"></span><span class="pos-find__scan" role="button" aria-label="Scan with the camera">{i('barcode')}</span></div>
<div class="posb-label" style="margin-top: 6px">Laybys</div>
<div class="pos-list">
<div class="pos-row pos-row--on" role="button" style="grid-template-columns: 52px minmax(0, 1fr) auto"><span class="pos-row__g">{b('barn')}</span><div style="min-width: 0"><div class="pos-row__t">Tsitsi Banda · Garden shed kit</div><div class="pos-row__s"><span class="m">LB-0012</span> · by 30 Nov</div></div><span class="pos-row__v"><span class="posb-row__k">Left</span> US$180.00</span></div>
</div>
<div class="posb-label" style="margin-top: 6px">Customers</div>
<div class="pos-list">
<div class="pos-row" role="button" style="grid-template-columns: 52px minmax(0, 1fr) auto"><span class="pos-row__g">{b('user-circle')}</span><div style="min-width: 0"><div class="pos-row__t">Tsitsi Banda</div><div class="pos-row__s"><span class="m">CU-0307</span> · <span class="m">0772 905 113</span></div></div><span></span></div>
</div>
</section>'''

def lay_col(act):
    pays = f'''<div class="posb-pays">
<div class="posb-pay"><span>28 Sep</span><span>Cash</span><span class="pos-m">US$100.00</span></div>
<div class="posb-pay"><span>12 Oct</span><span>EcoCash</span><span class="pos-m">US$40.00</span></div>
</div>'''
    return f'''<section class="pos-sale" aria-label="Layby LB-0012">
<div class="pos-sale__h"><span class="pos-sale__t">Layby</span><span class="pos-sale__code">LB-0012</span><span class="spacer"></span><span class="pos-pill">{i('user')}Tsitsi Banda</span></div>
<div class="pos-lines" style="flex: none">{line(1, 'Garden shed kit', '320.00', '320.00', ro=True, sub='Taken 28 Sep · by 30 Nov').replace('class="pos-line__s">', 'class="pos-line__s" style="font-family: var(--font-sans)">')}</div>
{pays}
<div class="posb-left"><div><div class="posb-owes__k">Paid</div><div class="posb-owes__v">US$140.00</div></div><div style="text-align: right"><div class="posb-owes__k">Left</div><div class="posb-owes__v posb-owes__v--to">US$180.00</div></div></div>
<span class="spacer"></span>
{act}</section>'''
write('T4-1-layby', 'T4 Till 2 · layby LB-0012', pc('09:30', rail('till', held=0, me='tendai') + lay_find + lay_col(act1('Take a payment', None, '↵', i('hand-coins'))))
     , 1440, 900)

TEN5 = [('cash', 'money', 'Cash'), ('card', 'credit-card', 'Card'), ('ecocash', 'device-mobile', 'EcoCash'), ('innbucks', 'wallet', 'InnBucks'), ('split', 'arrows-split', 'Split')]
def tenders5(on):
    return '<div class="pos-tenders">' + ''.join(f'<span class="pos-tender" role="button" aria-pressed="{"true" if k == on else "false"}">{i(g)}{n}</span>' for k, g, n in TEN5) + '</div>'
REF4 = 'MP261019.0931.K22719'
tray_lay = f'''<div class="pos-scrim"></div><aside class="pos-tray" aria-label="Pay">
<div class="pos-tray__h"><div><div class="pos-tray__k">Layby payment · <span class="pos-m">LB-0012</span></div><div class="pos-tray__amt">US$60.00</div></div><span class="pos-icon" role="button" aria-label="Back, Esc" style="margin: -4px -8px 0 auto">{i('x')}</span></div>
<div class="pos-notes" style="padding-top: 0; padding-bottom: 14px">{''.join(f'<span class="pos-note" role="button" aria-pressed="{"true" if n == "60.00" else "false"}">{n}</span>' for n in ['20.00', '50.00', '60.00', '180.00'])}</div>
{tenders5('ecocash')}
<div class="pos-parts">
  <div class="pos-part pos-part--now" style="row-gap: 14px">
    <span class="pos-part__g">{i('device-mobile')}</span><div class="pos-part__t">EcoCash</div><span class="pos-part__v">US$60.00</span>
    <div style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px">
      <div class="pos-sum__row"><span>Merchant code</span><span class="spacer"></span><span style="color: var(--ink)">041288</span></div>
      <div class="pos-field"><small>Reference</small><span>{REF4}</span><span class="pos-caret"></span></div>
    </div>
  </div>
</div>
<div class="posb-left" style="margin: 14px 20px 0"><div><div class="posb-owes__k">Paid after this</div><div class="posb-owes__v">US$200.00</div></div><div style="text-align: right"><div class="posb-owes__k">Left</div><div class="posb-owes__v posb-owes__v--to">US$120.00</div></div></div>
<div class="pos-tray__foot pos-tray__foot--one">{take('Received', '60.00')}</div>
</aside>'''
write('T4-2-layby-pay', 'T4 Layby payment by EcoCash', pc('09:31', rail('till', held=0, me='tendai') + lay_find + lay_col(act1('Take a payment', None, '↵', i('hand-coins'))), tray_lay), 1440, 900)

lay_paid = f'''<section class="pos-sale" aria-label="Paid" style="background: var(--surface)">
<div class="pos-paid">
  <span class="pos-paid__mark">{i('check-circle')}</span>
  <div class="pos-paid__k">Left to pay</div>
  <div class="pos-paid__v">US$120.00</div>
  <div class="pos-paid__z" style="font-family: var(--font-sans)">by 30 Nov</div>
  <div class="posb-bar" role="img" aria-label="US$200.00 of US$320.00 paid"><i style="width: 62.5%"></i></div>
  <div class="pos-facts" style="margin-top: 18px">
    {fact('', 'Layby, Tsitsi Banda', 'LB-0012', b('barn'))}
    {fact('device-mobile', 'EcoCash', 'US$60.00')}
    {fact('', 'Paid so far', 'US$200.00', i('hand-coins'))}
    {fact('printer', 'Receipt printed', '09:31')}
  </div>
</div>
{act_print('Next sale', 'N')}
</section>'''
lay_shelf = shelf()
write('T4-3-layby-paid', 'T4 Layby paid', pc('09:31', rail('till', held=0, me='tendai') + lay_shelf + lay_paid), 1440, 900)

# =====================================================================
# T5 · History and reprint · Till 1 · Rumbidzai · 10:31–10:32
# =====================================================================
ROWS5 = [
    hrow(False, i('money'), 'Claw hammer 16 oz', 'S-10487', '10:23', 'Cash', '7.90'),
    hrow(False, i('money'), 'Baba Tino', 'S-10486', '10:21', 'Cash', '110.00'),
    hrow(False, i('arrows-split'), 'PVA paint, white, 5 L and 1 more', 'S-10485', '10:16', 'EcoCash and cash', '34.80'),
    hrow(False, b('address-book'), ACC, 'S-10482', '09:58', 'On account', '486.00'),
    hrow(False, i('credit-card'), 'Wheelbarrow 65 L and 1 more', 'S-10479', '09:41', 'Card', '53.80'),
    hrow(False, i('wallet'), 'PVC pipe 50 mm 6 m and 1 more', 'S-10476', '09:22', 'InnBucks', '15.70'),
    hrow(False, i('device-mobile'), 'Wire nails 75 mm, per kg', 'S-10471', '08:58', 'EcoCash', '7.80'),
    R66(False, 'Part refunded'), R62, R59,
]
S85_LINES = line(1, 'PVA paint, white, 5 L', '30.00', '30.00', ro=True) + line(2, 'Paint brush 75 mm', '1.20', '2.40', ro=True)
rows_all = list(ROWS5); rows_all[2] = rows_all[2].replace('class="posb-hrow"', 'class="posb-hrow posb-hrow--on"', 1)
rec85 = f'''<section class="pos-sale" aria-label="S-10485">{rec_head('Sale', 'S-10485', '10:16')}
<div class="pos-lines">{S85_LINES}</div>
<div class="posb-recfacts">{fact('device-mobile', 'EcoCash', 'US$30.00')}{fact('money', 'Cash, US$5.00 handed', 'US$4.80')}{fact('printer', 'Receipt printed', '10:16')}{fact('hourglass', 'Fiscal code', 'to follow')}</div>
<div class="pos-sum">{sumrow('3 items', 'VAT US$4.67')}</div>
{rec_acts()}</section>'''
write('T5-1-history', 'T5 History', device('10:31', rail('history', held=0) + history(rows_all, '07:58', '10 sales') + rec85))

rec82 = lambda printed=None: f'''<section class="pos-sale" aria-label="S-10482"><div class="pos-sale__h"><span class="pos-sale__t">Sale</span><span class="pos-sale__code">S-10482</span><span class="spacer"></span><span class="pos-pill">{b('buildings')}{ACC}</span></div>
<div class="pos-lines">{s82_lines(ro=True)}</div>
<div class="posb-recfacts">{fact('', 'On account', 'US$486.00', b('address-book'))}{fact('printer', 'Printed again' if printed else 'Receipt printed', printed or '09:58')}</div>
<div class="pos-sum">{S82_SUM}</div>
{rec_acts()}</section>'''
r82 = [r for r in ROWS5 if 'S-10482' in r][0].replace('class="posb-hrow"', 'class="posb-hrow posb-hrow--on"', 1)
write('T5-2-history-account', 'T5 History · on account', device('10:31', rail('history', held=0) + history([r82], '07:58', '1 of 10 sales', 'On account') + rec82()))

# T5-3 reprint: the till and the copy it prints, side by side
SC = 0.66
tab = device('10:32', rail('history', held=0) + history([r82], '07:58', '1 of 10 sales', 'On account') + rec82('10:32'))
tab = tab.replace('class="cx pos-board"', 'class="cx pos-board" style="width: 1324px; height: 844px; background: transparent"')
TW, TH = round(1324 * SC), round(844 * SC)
def rr(l, r, cls='r'):
    return f'<div class="{cls}"><span>{l}</span><span>{r}</span></div>'
receipt = f'''<div class="pos-receipt" style="width: 330px; font-size: 12.5px">
<div class="c" style="font-weight: 500; font-size: 14px">Mufaro Hardware</div>
<div class="c">Chitungwiza</div>
<div class="c" style="margin-top: 6px; font-weight: 500">Copy · printed 10:32</div>
<hr>
{rr('S-10482', '19 Oct 2026 09:58')}
{rr('Till 1', 'Rumbidzai')}
<hr>
{rr('20 × Cement 32.5R 50 kg', '230.00')}
{rr('10 × Rebar Y12 6 m', '98.00')}
{rr('2 t River sand, per tonne', '90.00')}
{rr('1 × Binding wire 25 kg', '68.00')}
<hr>
<div class="r" style="font-weight: 500; font-size: 14px"><span>Total US$</span><span>486.00</span></div>
{rr('VAT 15.5% included', '65.22')}
<hr>
{rr('On account', '486.00')}
<div>Mavhima Construction, CU-0218</div>
{rr('Owes now', '1,312.40')}
<hr>
<div class="c">Fiscal code to follow</div>
</div>'''
LEFT = 56
reprint = f'''<div class="cx" data-theme="tender" style="width: 1380px; height: 900px; background: #fff; position: relative; overflow: hidden">
  <div style="position: absolute; left: {LEFT}px; top: {(900 - TH) // 2}px; width: {TW}px; height: {TH}px"><div style="transform: scale({SC}); transform-origin: 0 0; width: 1324px; height: 844px">{tab}</div></div>
  <div style="position: absolute; left: {LEFT + TW + 56}px; top: 0; bottom: 0; display: flex; align-items: center">{receipt}</div>
</div>'''
write('T5-3-reprint', 'T5 Reprint a receipt', reprint)
print('ok')
