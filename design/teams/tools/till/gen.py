import os
PR = os.path.join(os.path.dirname(__file__), '..', 'canvas', 'project') + '/'

def head(title, w, h):
    links = ['ds/corelith-workspace/components/bundle.css', 'icons.css', 'icons-tl.css', 'icons-ob.css', 'icons-w6.css', 'icons-pos.css', 'teams.css', 'w6.css', 'pos.css']
    L = '\n'.join(f'<link rel="stylesheet" href="{l}">' for l in links)
    return f'''<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
{L}
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap">
<style>body{{margin:0;background:#ffffff}}</style>
</helmet>
'''

def foot(w, h):
    return f'''
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def i(n):
    return f'<span class="i i-pos-{n}"></span>'

MARK = '<span class="pos-mark"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M3 20V5l5 6 4-6 4 6 5-6v15h-4v-7l-5 6-5-6v7z"/></svg></span>'
PHOTO = {'rumbidzai': '/_blob/2a4a6d8df97c5df72897686f73d1d6c2', 'tendai': '/_blob/345dc2679a89a59a8684aa172b4f45d3', 'nyasha': '/_blob/0964fc98daf159e133baa301d8314c40'}

def bar(t):
    return f'''<div class="pos-bar">{MARK}<span class="pos-bar__shop">Mufaro Hardware</span><span class="pos-bar__till">· Till 1</span><span class="spacer"></span>{i('wifi-high')}<span class="pos-time">{t}</span></div>'''

DOORS = [('till', 'cash-register', 'Till'), ('held', 'pause-circle', 'Held'), ('history', 'clock-counter-clockwise', 'History'),
         ('shift', 'vault', 'Shift'), ('customers', 'users', 'Customers'), ('price', 'tag', 'Price check'), ('reports', 'chart-bar', 'Reports')]

def rail(cur='till', held=2):
    out = [f'<nav class="pos-rail" aria-label="Till"><img class="pos-rail__me" src="{PHOTO["rumbidzai"]}" alt="Rumbidzai Moyo" width="44" height="44">']
    for k, ic, lab in DOORS:
        cu = ' aria-current="page"' if k == cur else ''
        n = f'<span class="pos-door__n">{held}</span>' if k == 'held' and held else ''
        out.append(f'<a class="pos-door" href="#"{cu}>{i(ic)}{lab}{n}</a>')
    out.append(f'<a class="pos-door pos-rail__foot" href="#">{i("lock-simple")}Lock</a></nav>')
    return ''.join(out)

SHELF = [  # name, price, glyph
    ('PVA paint, white, 5 L', '30.00', 'paint-bucket'),
    ('Paint brush 75 mm', '1.20', 'paint-brush'),
    ('Paint roller 225 mm', '6.50', 'paint-roller'),
    ('Cement 32.5R 50 kg', '11.50', 'package'),
    ('Rebar Y12 6 m', '9.80', 'line-segments'),
    ('River sand, per tonne', '45.00', 'mountains'),
    ('Binding wire 25 kg', '68.00', 'spiral'),
    ('Wire nails 75 mm, per kg', '2.60', 'nut'),
    ('PVC pipe 50 mm 6 m', '7.20', 'pipe'),
    ('Pillar tap 15 mm', '8.50', 'drop'),
    ('Claw hammer 16 oz', '7.90', 'hammer'),
    ('Wheelbarrow 65 L', '46.00', 'trolley'),
]
CATS = [('All', 'squares-four'), ('Building', 'wall'), ('Paint', 'paint-bucket'), ('Plumbing', 'pipe'), ('Tools', 'wrench'), ('Fasteners', 'nut')]

def shelf(counts=None, query=None):
    counts = counts or {}
    find = f'<div class="pos-find">{i("magnifying-glass")}<span>Search or scan</span><span class="pos-find__scan" role="button" aria-label="Scan with the camera">{i("barcode")}</span></div>'
    cats = '<div class="pos-cats">' + ''.join(
        f'<span class="pos-cat" role="button" aria-pressed="{"true" if n == "All" else "false"}">{i(g)}{n}</span>' for n, g in CATS) + '</div>'
    tiles = []
    for n, p, g in SHELF:
        c = counts.get(n)
        badge = f'<span class="pos-tile__n">{c}</span>' if c else ''
        tiles.append(f'<div class="pos-tile" role="button"><div class="pos-tile__pic">{i(g)}</div><div class="pos-tile__t">{n}</div><div class="pos-tile__p">US${p}</div>{badge}</div>')
    return f'<section class="pos-shelf" aria-label="Shelf">{find}{cats}<div class="pos-tiles">{"".join(tiles)}</div></section>'

def line(q, name, unit, val, on=False, sub=None, ro=False):
    sub = sub or f'US${unit} each'
    cls = 'pos-line pos-line--on' if on else 'pos-line'
    if ro:
        return f'''<div class="pos-line pos-line--ro"><span class="pos-line__q">{q} ×</span><div style="min-width: 0"><div class="pos-line__t">{name}</div><div class="pos-line__s">{sub}</div></div><div class="pos-line__v">US${val}</div></div>'''
    return f'''<div class="{cls}"><div class="pos-qty"><b role="button" aria-label="One fewer">{i('minus')}</b><span>{q}</span><b role="button" aria-label="One more">{i('plus')}</b></div><div style="min-width: 0"><div class="pos-line__t">{name}</div><div class="pos-line__s">{sub}</div></div><div class="pos-line__v">US${val}</div></div>'''

def sale_head(cust=None):
    c = f'<span class="pos-pill">{i("user")}{cust}</span>' if cust else f'<span class="pos-icon" role="button" aria-label="Add a customer">{i("user-plus")}</span>'
    return f'<div class="pos-sale__h"><span class="pos-sale__t">Sale</span><span class="spacer"></span>{c}<span class="pos-icon" role="button" aria-label="More">{i("dots-three")}</span></div>'

def sale(lines_html, items, vat, total, take=True, cust=None):
    act = f'''<div class="pos-act"><span class="pos-hold" role="button" aria-label="Hold, H">{i('pause-circle')}</span><span class="pos-take" role="button">Take <b>US${total}</b><span class="kbd">↵</span></span></div>''' if take else ''
    return f'''<section class="pos-sale" aria-label="Sale">{sale_head(cust)}<div class="pos-lines">{lines_html}</div><div class="pos-sum"><div class="pos-sum__row"><span>{items}</span><span class="spacer"></span><span>VAT US${vat}</span></div></div>{act}</section>'''

S10485_LINES = line(1, 'PVA paint, white, 5 L', '30.00', '30.00') + line(2, 'Paint brush 75 mm', '1.20', '2.40', on=True)
S10485_SALE = lambda take=True: sale(S10485_LINES, '3 items', '4.67', '34.80', take)

def device(time, body, extra='', over=''):
    return f'''<div class="cx pos-board" data-theme="tender"><div class="pos-dev"><div class="pos-scr">{bar(time)}<div class="pos-body">{body}{extra}</div>{over}</div></div></div>'''

def write(name, title, html, w=1380, h=900):
    open(PR + name + '.dc.html', 'w').write(head(title, w, h) + html + foot(w, h))

# ---------- T1-1 sell ----------
write('T1-1-sell', 'T1 Sell',
      device('10:14', rail() + shelf({'PVA paint, white, 5 L': 1, 'Paint brush 75 mm': 2}) + S10485_SALE()))

# ---------- tray pieces ----------
def tray_head(k, amt, close=True, slim=False):
    cls = 'pos-tray__h pos-tray__h--slim' if slim else 'pos-tray__h'
    x = f'<span class="pos-icon" role="button" aria-label="Back to the sale, Esc" style="margin: -4px -8px 0 auto">{i("x")}</span>' if close else ''
    return f'<div class="{cls}"><div><div class="pos-tray__k">{k}</div><div class="pos-tray__amt">US${amt}</div></div>{x}</div>'

TENDERS = [('cash', 'money', 'Cash'), ('card', 'credit-card', 'Card'), ('ecocash', 'device-mobile', 'EcoCash'), ('innbucks', 'wallet', 'InnBucks'), ('split', 'arrows-split', 'Split')]
def tenders(on):
    return '<div class="pos-tenders">' + ''.join(f'<span class="pos-tender" role="button" aria-pressed="{"true" if k == on else "false"}">{i(g)}{n}</span>' for k, g, n in TENDERS) + '</div>'

def part(g, t, s, v, state=''):
    cls = 'pos-part' + (f' pos-part--{state}' if state else '')
    gl = i('check-circle') if state == 'done' else i(g)
    return f'<div class="{cls}"><span class="pos-part__g">{gl}</span><div style="min-width: 0"><div class="pos-part__t">{t}</div><div class="pos-part__s">{s}</div></div><span class="pos-part__v">US${v}</span></div>'

REF = 'MP261019.1015.H48213'

# ---------- T1-2 pay, EcoCash part of a split ----------
tray2 = f'''<div class="pos-scrim"></div><aside class="pos-tray" aria-label="Pay">{tray_head('Take', '34.80')}{tenders('split')}
<div class="pos-parts">
  <div class="pos-part pos-part--now" style="grid-template-columns: 36px minmax(0, 1fr) auto; row-gap: 14px">
    <span class="pos-part__g">{i('device-mobile')}</span><div class="pos-part__t">EcoCash</div><span class="pos-part__v">US$30.00</span>
    <div style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px">
      <div class="pos-sum__row"><span>Merchant code</span><span class="spacer"></span><span style="color: var(--ink)">041288</span></div>
      <div class="pos-field"><small>Reference</small><span>{REF}</span><span class="pos-caret"></span></div>
    </div>
  </div>
  {part('money', 'Cash', 'US$', '4.80', 'wait')}
</div>
<div class="pos-tray__foot pos-tray__foot--one"><span class="pos-take" role="button">Received <b>US$30.00</b><span class="kbd">↵</span></span></div>
</aside>'''
write('T1-2-pay-ecocash', 'T1 Pay · EcoCash', device('10:15', rail() + shelf({'PVA paint, white, 5 L': 1, 'Paint brush 75 mm': 2}) + S10485_SALE(), tray2))

# ---------- T1-3 pay, cash part ----------
keys = ''.join(f'<span class="pos-key{" pos-key--down" if k == "5" else ""}" role="button">{k}</span>' for k in ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']) + f'<span class="pos-key" role="button" aria-label="Delete">{i("backspace")}</span>'
notes = ''.join(f'<span class="pos-note" role="button" aria-pressed="{"true" if n == "5.00" else "false"}">{n}</span>' for n in ['4.80', '5.00', '10.00', '20.00'])
tray3 = f'''<div class="pos-scrim"></div><aside class="pos-tray" aria-label="Pay">{tray_head('Take', '34.80', slim=True)}
<div class="pos-parts pos-parts--slim" style="padding-top: 0">
  {part('device-mobile', 'EcoCash', REF, '30.00', 'done')}
  {part('money', 'Cash', 'US$', '4.80')}
</div>
<div class="pos-tender-fig" style="display: flex; align-items: baseline; gap: 12px; padding-top: 10px"><span class="pos-tender-fig__k">Handed</span><span class="pos-tender-fig__v" style="margin-left: auto">US$5.00</span></div>
<div class="pos-notes">{notes}</div>
<div class="pos-keys">{keys}</div>
<div class="pos-change"><div><div class="pos-change__k">Change</div><div class="pos-change__z">or ZiG 5.38</div><div class="pos-change__z" style="font-family: var(--font-sans); font-size: 12px">Rate <span class="pos-m">26.90</span> · Tendai, <span class="pos-m">07:52</span></div></div><span class="pos-change__v" style="align-self: center">US$0.20</span></div>
<div class="pos-tray__foot pos-tray__foot--one" style="padding-top: 12px"><span class="pos-take" role="button">Finish <b>US$34.80</b><span class="kbd">↵</span></span></div>
</aside>'''
write('T1-3-pay-cash', 'T1 Pay · cash and change', device('10:15', rail() + shelf({'PVA paint, white, 5 L': 1, 'Paint brush 75 mm': 2}) + S10485_SALE(), tray3))

# ---------- T1-4 paid ----------
paid = f'''<section class="pos-sale" aria-label="Paid" style="background: var(--surface)">
<div class="pos-paid">
  <span class="pos-paid__mark">{i('check-circle')}</span>
  <div class="pos-paid__k">Change</div>
  <div class="pos-paid__v">US$0.20</div>
  <div class="pos-paid__z">or ZiG 5.38</div>
  <div class="pos-facts">
    <div class="pos-fact">{i('receipt')}<span>Sale</span><span>S-10485</span></div>
    <div class="pos-fact">{i('device-mobile')}<span>EcoCash</span><span>US$30.00</span></div>
    <div class="pos-fact">{i('money')}<span>Cash, US$5.00 handed</span><span>US$4.80</span></div>
    <div class="pos-fact">{i('printer')}<span>Receipt printed</span><span>10:16</span></div>
    <div class="pos-fact">{i('hourglass')}<span>Fiscal code</span><span>to follow</span></div>
  </div>
</div>
<div class="pos-act"><span class="pos-hold" role="button" aria-label="Print again">{i('printer')}</span><span class="pos-take" role="button">Next sale<span class="kbd">N</span></span></div>
</section>'''
write('T1-4-paid', 'T1 Paid', device('10:16', rail() + shelf() + paid))

# ---------- customer screens ----------
def cphone(inner):
    return f'<div class="pos-cdev"><div class="pos-cscr"><div class="pos-cscr__top">{MARK}<span class="pos-cscr__shop">Mufaro Hardware</span></div>{inner}</div></div>'

CL = '<div class="pos-clines"><div class="pos-cline"><span>1</span><span>PVA paint, white, 5 L</span><span>30.00</span></div><div class="pos-cline"><span>2</span><span>Paint brush 75 mm</span><span>2.40</span></div></div>'
c_sell = cphone(CL + '<div class="pos-ctotal"><div class="pos-ctotal__k">Total</div><div class="pos-ctotal__v">US$34.80</div></div>')
c_pay = cphone(CL + '<div class="pos-ctotal" style="padding: 16px 24px"><div style="display: flex; align-items: baseline"><span class="pos-ctotal__k">Total</span><span class="pos-m" style="margin-left: auto; font-size: 20px; color: var(--ink)">US$34.80</span></div></div><div class="pos-cpay"><span class="pos-cpay__k">EcoCash merchant code</span><span class="pos-cpay__code">041288</span><span class="pos-m" style="font-size: 20px">US$30.00</span></div>')
c_paid = cphone(f'''<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 0 28px 60px; text-align: center">
<span class="pos-paid__mark" style="margin-bottom: 18px">{i('check-circle')}</span>
<div style="color: var(--ink); font-size: 30px; font-weight: 600; letter-spacing: -0.02em">Thank you</div>
<div class="pos-paid__k" style="margin-top: 28px; font-size: 16px">Your change</div>
<div class="pos-m" style="font-size: 52px; color: var(--ink); letter-spacing: -0.03em">US$0.20</div>
<div class="pos-paid__z">or ZiG 5.38</div>
<div class="pos-m" style="margin-top: 36px; color: var(--ink-3); font-size: 14px">S-10485 · 10:16</div>
</div>''')

def col(phone, cap):
    return f'<div style="display: flex; flex-direction: column; align-items: center">{phone}<div class="pos-ccaption">{cap}</div></div>'

write('T1-5b-customer-states', 'T1 Customer screen',
      f'<div class="cx pos-cboard" data-theme="tender" style="gap: 40px">{col(c_sell, "Selling")}{col(c_pay, "Paying")}{col(c_paid, "Paid")}</div>')

# scale board: the till and the customer screen at one scale
SC = 0.6
tab = device('10:15', rail() + shelf({'PVA paint, white, 5 L': 1, 'Paint brush 75 mm': 2}) + S10485_SALE(), tray2)
tab = tab.replace('class="cx pos-board"', 'class="cx pos-board" style="width: 1324px; height: 844px; background: transparent"')
TW, TH, PW, PH = round(1324 * SC), round(844 * SC), round(384 * SC), round(764 * SC)
TX = (1380 - TW - 48 - PW) // 2
PX = TX + TW + 48
TY = 190
PY = TY + TH - PH
scale_html = f'''<div class="cx" data-theme="tender" style="width: 1380px; height: 900px; background: #fff; position: relative; overflow: hidden">
  <div style="position: absolute; left: {TX}px; top: {TY}px; width: {TW}px; height: {TH}px"><div style="transform: scale({SC}); transform-origin: 0 0; width: 1324px; height: 844px">{tab}</div></div>
  <div style="position: absolute; left: {PX}px; top: {PY}px; width: {PW}px; height: {PH}px"><div style="transform: scale({SC}); transform-origin: 0 0; width: 384px; height: 764px">{c_pay}</div></div>
</div>'''
write('T1-5a-customer-scale', 'T1 Till and customer screen', scale_html)

# ---------- T1-6 held ----------
TINO_LINES = line(4, 'Cement 32.5R 50 kg', '11.50', '46.00') + line(6, 'Rebar Y12 6 m', '9.80', '58.80') + line(2, 'Wire nails 75 mm, per kg', '2.60', '5.20', sub='2 kg · US$2.60 a kg')
TINO_RO = line(4, 'Cement 32.5R 50 kg', '11.50', '46.00', ro=True) + line(6, 'Rebar Y12 6 m', '9.80', '58.80', ro=True) + line(2, 'Wire nails 75 mm, per kg', '2.60', '5.20', sub='2 kg · US$2.60 a kg', ro=True)
TINO_SALE = sale(TINO_LINES, '12 items', '14.76', '110.00')
hold_sheet = f'''<div class="pos-scrim pos-scrim--all"></div><div class="pos-sheet" role="dialog" aria-label="Hold this sale">
<div style="display: flex; align-items: baseline"><span class="pos-sheet__t">Hold this sale</span><span class="pos-m" style="margin-left: auto; font-size: 20px; color: var(--ink)">US$110.00</span></div>
<div class="pos-input">Baba Tino, fetching cash<span class="pos-caret" style="margin-left: 2px"></span></div>
<div class="pos-btns"><span class="pos-btn" role="button">Cancel</span><span class="pos-btn pos-btn--go" role="button">{i('pause-circle')}Hold<span class="kbd">↵</span></span></div>
</div>'''
write('T1-6a-hold', 'T1 Hold with a note',
      device('10:05', rail(held=1) + shelf({'Cement 32.5R 50 kg': 4, 'Rebar Y12 6 m': 6, 'Wire nails 75 mm, per kg': 2}) + TINO_SALE, over=hold_sheet))

def held_row(on, g, t, who, when, v):
    return f'<div class="pos-row{" pos-row--on" if on else ""}" role="button"><span class="pos-row__g">{i(g)}</span><div style="min-width: 0"><div class="pos-row__t">{t}</div><div class="pos-row__s">{who} · <span class="m">{when}</span></div></div><span class="pos-row__v">US${v}</span><span class="pos-icon" role="button" aria-label="Discard">{i("trash")}</span></div>'

held_list = f'''<section class="pos-shelf" aria-label="Held">
<h1 class="pos-h1" style="padding-top: 8px">Held</h1>
<div class="pos-list">
{held_row(True, 'pause-circle', 'Baba Tino, fetching cash', '3 lines', '10:05', '110.00')}
{held_row(False, 'pause-circle', 'Tichaona, back after lunch', '1 line', '09:40', '46.00')}
</div></section>'''
recall_sale = f'''<section class="pos-sale" aria-label="Held sale">
<div class="pos-sale__h"><span class="pos-sale__t">Baba Tino</span><span class="pos-m" style="color: var(--ink-3); font-size: 14px">10:05</span><span class="spacer"></span><span class="pos-icon" role="button" aria-label="More">{i('dots-three')}</span></div>
<div class="pos-lines">{TINO_RO}</div>
<div class="pos-sum"><div class="pos-sum__row"><span>12 items</span><span class="spacer"></span><span>VAT US$14.76</span></div></div>
<div class="pos-act" style="grid-template-columns: 1fr"><span class="pos-take" role="button">{i('arrow-u-up-left')}Recall <b>US$110.00</b><span class="kbd">R</span></span></div>
</section>'''
write('T1-6b-held-list', 'T1 Held', device('10:17', rail('held') + held_list + recall_sale))

ask = f'''<div class="pos-scrim pos-scrim--all"></div><div class="pos-sheet" role="dialog" aria-label="Recall">
<div class="pos-sheet__t">Hold the hammer sale first?</div>
<div class="pos-btns"><span class="pos-btn" role="button">Cancel</span><span class="pos-btn pos-btn--go" role="button">Hold it and recall<span class="kbd">↵</span></span></div>
</div>'''
write('T1-6c-recall-ask', 'T1 Recall over a sale', device('10:18', rail('held') + held_list + recall_sale, over=ask))
print('ok')
