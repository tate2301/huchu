import os, re
PR = os.path.join(os.path.dirname(__file__), '..', 'canvas', 'project') + '/'

POS_ICONS = set(re.findall(r'\.i-pos-([a-z0-9-]+)\{', open(PR + 'icons-pos.css').read()))
POSC_ICONS = set(re.findall(r'\.i-posc-([a-z0-9-]+)\{', open(PR + 'icons-posc.css').read()))

def head(title):
    links = ['ds/corelith-workspace/components/bundle.css', 'icons.css', 'icons-w6.css', 'icons-pos.css', 'icons-posc.css', 'teams.css', 'w6.css', 'pos.css', 'pos-c.css']
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
    if n in POSC_ICONS and n not in POS_ICONS:
        return f'<span class="i i-posc-{n}"></span>'
    assert n in POS_ICONS, n
    return f'<span class="i i-pos-{n}"></span>'

def m(t):
    return f'<span class="pos-m">{t}</span>'

MARK = '<span class="pos-mark"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M3 20V5l5 6 4-6 4 6 5-6v15h-4v-7l-5 6-5-6v7z"/></svg></span>'
PHOTO = {'rumbidzai': '/_blob/2a4a6d8df97c5df72897686f73d1d6c2', 'tendai': '/_blob/345dc2679a89a59a8684aa172b4f45d3', 'nyasha': '/_blob/0964fc98daf159e133baa301d8314c40'}
NAME = {'rumbidzai': 'Rumbidzai Moyo', 'tendai': 'Tendai Chari', 'nyasha': 'Nyasha Mlambo'}
WA = '<span class="posc-wa"><span class="mark-wa"></span></span>'

def bar(t, till='Till 1', net='on'):
    w = {'on': i('wifi-high'), 'off': f'<span class="posc-off" role="img" aria-label="No connection">{i("wifi-slash")}</span>',
         'stop': f'<span class="posc-off posc-off--bad" role="img" aria-label="No connection">{i("wifi-slash")}</span>'}[net]
    return f'<div class="pos-bar">{MARK}<span class="pos-bar__shop">Mufaro Hardware</span><span class="pos-bar__till">· {till}</span><span class="spacer"></span>{w}<span class="pos-time">{t}</span></div>'

DOORS = [('till', 'cash-register', 'Till'), ('held', 'pause-circle', 'Held'), ('history', 'clock-counter-clockwise', 'History'),
         ('shift', 'vault', 'Shift'), ('customers', 'users', 'Customers'), ('price', 'tag', 'Price check'), ('reports', 'chart-bar', 'Reports')]

def rail(cur='till', held=0, who='rumbidzai'):
    out = [f'<nav class="pos-rail" aria-label="Till"><img class="pos-rail__me" src="{PHOTO[who]}" alt="{NAME[who]}" width="44" height="44">']
    for k, ic, lab in DOORS:
        cu = ' aria-current="page"' if k == cur else ''
        n = f'<span class="pos-door__n">{held}</span>' if k == 'held' and held else ''
        out.append(f'<a class="pos-door" href="#"{cu}>{i(ic)}{lab}{n}</a>')
    out.append(f'<a class="pos-door pos-rail__foot" href="#">{i("lock-simple")}Lock</a></nav>')
    return ''.join(out)

SHELF = [
    ('PVA paint, white, 5 L', '30.00', 'paint-bucket'), ('Paint brush 75 mm', '1.20', 'paint-brush'), ('Paint roller 225 mm', '6.50', 'paint-roller'),
    ('Cement 32.5R 50 kg', '11.50', 'package'), ('Rebar Y12 6 m', '9.80', 'line-segments'), ('River sand, per tonne', '45.00', 'mountains'),
    ('Binding wire 25 kg', '68.00', 'spiral'), ('Wire nails 75 mm, per kg', '2.60', 'nut'), ('PVC pipe 50 mm 6 m', '7.20', 'pipe'),
    ('Pillar tap 15 mm', '8.50', 'drop'), ('Claw hammer 16 oz', '7.90', 'hammer'), ('Wheelbarrow 65 L', '46.00', 'trolley'),
]
CATS = [('All', 'squares-four'), ('Building', 'wall'), ('Paint', 'paint-bucket'), ('Plumbing', 'pipe'), ('Tools', 'wrench'), ('Fasteners', 'nut')]

def tile(n, p, g, c=None, extra='', cls='pos-tile'):
    badge = f'<span class="pos-tile__n">{c}</span>' if c else ''
    return f'<div class="{cls}" role="button"><div class="pos-tile__pic">{i(g)}</div><div class="pos-tile__t">{n}</div><div class="pos-tile__p">US${p}</div>{extra}{badge}</div>'

def shelf(counts=None, rows=3):
    counts = counts or {}
    find = f'<div class="pos-find">{i("magnifying-glass")}<span>Search or scan</span><span class="pos-find__scan" role="button" aria-label="Scan with the camera">{i("barcode")}</span></div>'
    cats = '<div class="pos-cats">' + ''.join(f'<span class="pos-cat" role="button" aria-pressed="{"true" if n == "All" else "false"}">{i(g)}{n}</span>' for n, g in CATS) + '</div>'
    tiles = ''.join(tile(n, p, g, counts.get(n)) for n, p, g in SHELF[:rows * 4])
    return f'<section class="pos-shelf" aria-label="Shelf">{find}{cats}<div class="pos-tiles">{tiles}</div></section>'

def line(q, name, unit, val, on=False, sub=None):
    sub = sub or f'US${unit} each'
    cls = 'pos-line pos-line--on' if on else 'pos-line'
    return f'''<div class="{cls}"><div class="pos-qty"><b role="button" aria-label="One fewer">{i('minus')}</b><span>{q}</span><b role="button" aria-label="One more">{i('plus')}</b></div><div style="min-width: 0"><div class="pos-line__t">{name}</div><div class="pos-line__s">{sub}</div></div><div class="pos-line__v">US${val}</div></div>'''

def sale(lines_html, items, vat, total, take='on', title='Sale'):
    if take == 'on':
        t = f'<span class="pos-take" role="button">Take <b>US${total}</b><span class="kbd">↵</span></span>'
    elif take == 'off':
        t = f'<span class="pos-take pos-take--off" role="button" aria-disabled="true">Take <b>US${total}</b></span>'
    else:
        t = ''
    act = f'<div class="pos-act"><span class="pos-hold" role="button" aria-label="Hold, H">{i("pause-circle")}</span>{t}</div>' if t else ''
    sumr = f'<div class="pos-sum"><div class="pos-sum__row"><span>{items}</span><span class="spacer"></span><span>VAT US${vat}</span></div></div>' if items else ''
    return f'''<section class="pos-sale" aria-label="Sale"><div class="pos-sale__h"><span class="pos-sale__t">{title}</span><span class="spacer"></span><span class="pos-icon" role="button" aria-label="Add a customer">{i("user-plus")}</span><span class="pos-icon" role="button" aria-label="More">{i("dots-three")}</span></div><div class="pos-lines">{lines_html}</div>{sumr}{act}</section>'''

def device(time, body, over='', banner='', net='on', body_cls='pos-body'):
    return f'''<div class="cx pos-board" data-theme="tender"><div class="pos-dev"><div class="pos-scr">{bar(time, net=net)}{banner}<div class="{body_cls}">{body}</div>{over}</div></div></div>'''

def screen(time, inner, net='on'):
    """the Counter Mini with something other than the body grid (the gate)"""
    return f'''<div class="cx pos-board" data-theme="tender"><div class="pos-dev"><div class="pos-scr">{bar(time, net=net)}{inner}</div></div></div>'''

def keys(down=None, dot=True):
    ks = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.' if dot else '', '0']
    return '<div class="pos-keys">' + ''.join((f'<span class="pos-key{" pos-key--down" if k == down else ""}" role="button">{k}</span>' if k else '<span aria-hidden="true"></span>') for k in ks) + f'<span class="pos-key" role="button" aria-label="Delete">{i("backspace")}</span></div>'

def write(name, title, html, w=1380, h=900):
    open(PR + name + '.dc.html', 'w').write(head(title) + html + foot(w, h))

def label(d):
    v = float(d)
    return f'{int(round(v * 100))}c' if v < 1 else f'US${d}'

def count_table(rows, cur, total_label, total, slim=False, cols=('Note', 'How many', 'Comes to')):
    out = [f'<div class="posc-count{" posc-count--slim" if slim else ""}"><div class="posc-count__h"><span>{cols[0]}</span><span>{cols[1]}</span><span>{cols[2]}</span></div>']
    for lab, n, comes in rows:
        c = ' aria-current="true"' if lab == cur else ''
        z = ' posc-count__r--0' if not n else ''
        out.append(f'<div class="posc-count__r{z}"{c}><span>{lab}</span><span>{n}</span><span>{comes if n else "—"}</span></div>')
    if total_label:
        out.append(f'<div class="posc-count__f"><span>{total_label}</span><span>{total}</span></div>')
    out.append('</div>')
    return ''.join(out)

USD = ['100', '50', '20', '10', '5', '2', '1', '0.50', '0.10']
ZWG = ['200', '100', '50', '20', '10', '5', '2', '1', '0.50', '0.10']

def usd_rows(counts):
    return [(label(d), counts.get(d, 0), f'US${float(d) * counts.get(d, 0):.2f}') for d in USD]

def zig_rows(counts):
    return [(f'ZiG {d}', counts.get(d, 0), f'ZiG {float(d) * counts.get(d, 0):.2f}') for d in ZWG]

# =====================================================================
# T6 · the shift
# =====================================================================

# T6-1 · 07:58 Rumbidzai opens Till 1 with a float of US$50.00, counted by note
FLOAT = {'20': 1, '10': 2, '5': 1, '1': 5}
t61_main = f'''<section class="posc-main" aria-label="Open the shift">
<div class="posc-h"><h1 class="pos-h1">Open the shift</h1><span class="posc-hs">Till 1 · Monday 19 October</span></div>
{count_table(usd_rows(FLOAT), 'US$1', 'Float', 'US$50.00')}
</section>'''
t61_side = f'''<aside class="posc-side" aria-label="Counting">
<div class="posc-side__t">US$1 notes</div>
<div class="posc-fig"><span class="posc-fig__k">How many</span><span class="posc-fig__v">5</span></div>
{keys('5', dot=False)}
<div class="posc-foot"><span class="pos-take" role="button">Open the shift <b>US$50.00</b><span class="kbd">↵</span></span></div>
</aside>'''
write('T6-1-open-float', 'T6 Open the shift · float', device('07:58', rail('shift') + t61_main + t61_side))

# ---------- the PC till, Till 2 ----------
def pc(time, rail_html, main, side='', over='', title='Till 2 · Mufaro Hardware'):
    cols = '' if side else ' style="grid-template-columns: 84px minmax(0, 1fr)"'
    return f'''<div class="cx posc-pcboard" data-theme="tender"><div class="posc-mon"><div class="posc-win">
<div class="posc-chrome"><span class="posc-chrome__dots"><b></b><b></b><b></b></span><span class="posc-tab">{MARK}{title}</span></div>
{bar(time, till='Till 2')}<div class="posc-pcbody"{cols}>{rail_html}{main}{side}</div>{over}
</div></div><div class="posc-neck"></div><div class="posc-base"></div></div>'''


# T6-2 · 10:02 Till 2 (Tendai): the drawer passes the till rules' US$400.00
pc_ask = f'''<div class="pos-scrim pos-scrim--all" style="border-radius: 0"></div><div class="pos-sheet" role="dialog" aria-label="Move cash to the safe" style="width: 540px">
<div style="display: flex; gap: 16px; align-items: center"><span class="pos-row__g">{i('vault')}</span><div class="pos-sheet__t">Move cash to the safe</div></div>
<div style="display: flex; flex-direction: column; gap: 8px">
<div class="pos-sum__row" style="font-size: 16px"><span>In the drawer</span><span class="spacer"></span><span style="color: var(--ink); font-size: 18px">about US$418.40</span></div>
<div class="pos-sum__row" style="font-size: 16px"><span>Till rules</span><span class="spacer"></span><span style="color: var(--ink); font-size: 18px">US$400.00</span></div>
</div>
<div class="pos-btns"><span class="pos-btn" role="button">Later</span><span class="pos-btn pos-btn--go" role="button">{i('vault')}Move cash now <span class="kbd">↵</span></span></div></div>'''
empty_sale = f'''<section class="pos-sale" aria-label="Sale"><div class="pos-sale__h"><span class="pos-sale__t">Sale</span><span class="spacer"></span><span class="pos-icon" role="button" aria-label="Add a customer">{i("user-plus")}</span><span class="pos-icon" role="button" aria-label="More">{i("dots-three")}</span></div><div class="pos-lines"></div></section>'''
write('T6-2-drop-prompt-pc', 'T6 Till 2 · move cash to the safe', pc('10:02', rail('till', who='tendai'), shelf(rows=2), empty_sale, over=pc_ask), 1440, 900)

# T6-3 · 10:03 Shift, Drop to the safe: 3 × US$100 counted out
t63_main = f'''<section class="posc-main" aria-label="Shift">
<div class="posc-h"><h1 class="pos-h1">Shift</h1><span class="posc-hs">{m("SH-0009")} · Tendai Chari · since {m("07:30")}</span></div>
<div class="posc-stats">
<div class="posc-stat"><div class="posc-stat__k">Taken</div><div class="posc-stat__v">US$368.40</div></div>
<div class="posc-stat"><div class="posc-stat__k">Cash</div><div class="posc-stat__v">US$368.40</div></div>
<div class="posc-stat"><div class="posc-stat__k">Sales</div><div class="posc-stat__v">12</div></div>
</div>
<div class="posc-log">
<div class="posc-log__r"><span class="posc-log__g">{i('cash-register')}</span><span><b>Tendai</b> opened the shift with a float of {m('US$50.00')}</span><time>07:30</time></div>
</div>
</section>'''
t63_side = f'''<aside class="posc-side" aria-label="Cash in or out">
<div class="posc-side__t">Cash in or out</div>
<div class="posc-seg"><span role="button" aria-pressed="true">{i('vault')}Drop to the safe</span><span role="button" aria-pressed="false">{i('hand-coins')}Petty cash</span><span role="button" aria-pressed="false">{i('coins')}Float top-up</span></div>
<div class="posc-mini"><span aria-current="true">3<small>US$100</small></span><span>0<small>US$50</small></span><span>0<small>US$20</small></span></div>
{keys('3', dot=False)}
<div class="posc-foot"><span class="pos-take" role="button">Move <b>US$300.00</b><span class="kbd">↵</span></span></div>
</aside>'''
write('T6-3-drop-pc', 'T6 Till 2 · drop to the safe', pc('10:03', rail('shift', who='tendai'), t63_main, t63_side), 1440, 900)

COUNT_USD = {'100': 2, '50': 4, '20': 8, '10': 3, '5': 2, '1': 7, '0.50': 2, '0.10': 4}  # US$608.40
COUNT_ZIG = {'100': 1, '50': 1, '20': 2, '10': 3, '5': 1}  # ZiG 225.00
t64_main = f'''<section class="posc-main" aria-label="Count the drawer" style="padding-top: 18px; gap: 14px">
<div class="posc-h"><span class="posc-back" role="button">{i('caret-left')}Shift</span><h1 class="pos-h1">Count the drawer</h1><span class="spacer"></span><span class="posc-hs">{m("SH-0007")} · 1 of 2</span></div>
<div class="posc-two">
{count_table(usd_rows(COUNT_USD), '10c', 'Counted', 'US$608.40', slim=True)}
{count_table(zig_rows(COUNT_ZIG), None, 'Counted', 'ZiG 225.00', slim=True)}
</div>
</section>'''
t64_side = f'''<aside class="posc-side" aria-label="Counting">
<div class="posc-side__t">10c coins</div>
<div class="posc-fig"><span class="posc-fig__k">How many</span><span class="posc-fig__v">4</span></div>
{keys('4', dot=False)}
<div class="posc-foot"><span class="pos-take" role="button">Next: the float<span class="kbd">↵</span></span></div>
</aside>'''
write('T6-4-count-pc', 'T6 Till 2 · count the drawer', pc('17:40', rail('shift', who='tendai'), t64_main, t64_side), 1440, 900)

# T6-5 · 17:41 the difference, only now: out by −US$4.00
t65_main = f'''<section class="posc-main" aria-label="Close the shift" style="padding: 28px 48px 0; gap: 22px">
<div class="posc-h"><span class="posc-back" role="button">{i('caret-left')}Count</span><h1 class="pos-h1">Close the shift</h1><span class="spacer"></span><span class="posc-hs">{m("SH-0007")} · 2 of 2</span></div>
<p class="posc-lede posc-lede--bad">Out by {m('−US$4.00')}</p>
<div class="posc-two" style="max-width: 900px; gap: 24px">
<div class="posc-field"><label>Counted</label><div class="posc-in posc-in--m" style="background: var(--ground); box-shadow: none">US$608.40 <small style="margin-left: auto">and <span class="pos-m" style="font-size: 16px; color: var(--ink-2)">ZiG 225.00</span></small></div></div>
<div class="posc-field"><label>Float left for tomorrow</label><div class="posc-in posc-in--m"><small>US$</small>50.00</div></div>
</div>
<div class="posc-field" style="max-width: 900px"><label>What happened</label><div class="posc-in posc-in--on">Gave US$5 change instead of US$1 on a cement sale<span class="pos-caret" style="margin-left: 2px"></span></div></div>
<div class="posc-acts"><span class="pos-btn" role="button">{i('arrow-clockwise')}Count again</span><span class="pos-btn pos-btn--go" role="button">{i('check')}Close the shift <span class="kbd">↵</span></span></div>
</section>'''
write('T6-5-out-by-pc', 'T6 Till 2 · out by US$4.00', pc('17:41', rail('shift', who='tendai'), t65_main), 1440, 900)

# T6-6 · 17:42 closed
t66_main = f'''<section class="posc-main" aria-label="Shift closed" style="padding: 0; display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 0">
<div style="padding: 72px 64px; display: flex; flex-direction: column; gap: 26px">
<span class="pos-paid__mark" style="background: var(--tray); color: var(--ink-2)">{i('vault')}</span>
<h1 class="pos-h1" style="font-size: 34px">Shift {m('SH-0007')} closed</h1>
<div class="pos-facts" style="margin: 0; max-width: 560px">
<div class="pos-fact">{i('receipt')}<span>41 sales</span><span>US$1,286.70</span></div>
<div class="pos-fact">{i('money')}<span>Cash expected</span><span>US$612.40</span></div>
<div class="pos-fact" style="color: var(--bad)">{i('warning-circle')}<span>Short</span><span style="color: var(--bad)">US$4.00</span></div>
<div class="pos-fact">{i('user-circle')}<span>Signs it off</span><span style="font-family: var(--font-sans); font-size: 15px; color: var(--ink-2)">Nyasha</span></div>
</div>
</div>
<div style="background: var(--ground); border-left: 1px solid var(--line); padding: 72px 40px 40px; display: flex; flex-direction: column; gap: 16px">
<img src="{PHOTO['tendai']}" alt="" width="72" height="72" style="border-radius: 99px; object-fit: cover">
<div style="color: var(--ink); font-size: 20px; font-weight: 600">Tendai Chari</div>
<div style="color: var(--ink-3); font-size: 15px">Till 2 · Saturday 17 October</div>
<span class="pos-take" role="button" style="margin-top: auto">Who's selling next?<span class="kbd">↵</span></span>
</div>
</section>'''
write('T6-6-closed-pc', 'T6 Till 2 · shift closed', pc('17:42', rail('shift', who='tendai'), t66_main), 1440, 900)

# =====================================================================
# T7 · lock and PIN
# =====================================================================
def dots(n, bad=False):
    return f'<div class="w6-dots{" w6-dots--bad" if bad else ""}" aria-label="{n} of 4 digits">' + ''.join(f'<b{" class=\"on\"" if k < n else ""}></b>' for k in range(4)) + '</div>'

def pinpad(down=None, go='sign-in'):
    ks = ''.join(f'<button class="w6-key{" w6-key--down" if k == down else ""}" type="button">{k}</button>' for k in '123456789')
    return f'<div class="w6-keys">{ks}<button class="w6-key" type="button" aria-label="Delete">{i("backspace")}</button><button class="w6-key" type="button">0</button><button class="w6-key w6-key--go" type="button" aria-label="Unlock, Enter">{i(go)}</button></div>'

def gate(left, right):
    return f'<div class="posc-gate"><div class="posc-gate__l">{left}</div><div class="posc-gate__r">{right}</div></div>'

def who(t, s, p='rumbidzai', bad=False):
    return f'<div class="posc-who"><img src="{PHOTO[p]}" alt="" width="96" height="96"><div><div class="posc-who__t">{t}</div><div class="posc-who__s{" posc-who__s--bad" if bad else ""}">{s}</div></div></div>'

SOMEONE = f'<span class="pos-btn" role="button">{i("user-switch")}Someone else</span>'

# T7-1 · locked at 10:19 with L; at 10:20 the fourth wrong PIN
t71 = gate(who('Till 1 is locked', f'Rumbidzai Moyo · {m("SH-0010")}') + f'<div class="posc-gate__foot">{SOMEONE}</div>',
           f'<div class="posc-pinl">Rumbidzai\'s PIN</div>{dots(4, bad=True)}<div class="posc-err">That PIN is not right. 1 try left.</div>{pinpad()}')
write('T7-1-locked', 'T7 Till 1 locked', screen('10:20', t71))

# T7-2 · 10:20 the fifth: PIN locked
t72 = gate(who('Rumbidzai\'s PIN is locked', 'Too many tries. Ask a manager to send you a new PIN.', bad=True),
           f'''{dots(4, bad=True)}<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 18px">
<span class="pos-take" role="button" style="height: 68px">{i('key')}Use my password<span class="kbd">↵</span></span>
<span class="pos-btn" role="button" style="height: 68px; justify-content: center">{i('user-switch')}Someone else</span></div>''')
write('T7-2-pin-locked', 'T7 PIN locked', screen('10:20', t72))

# T7-3 · 10:20 sign in with her password
t73 = gate(who('Rumbidzai Moyo', 'Cashier') + f'<div class="posc-gate__foot">{SOMEONE}</div>',
           f'''<div class="posc-fl">Your password</div><div class="posc-pw">●●●●●●●●●<span class="pos-caret"></span>{i('eye-slash')}</div>
<span class="pos-take" role="button" style="height: 68px; margin-top: 6px">{i('sign-in')}Sign in<span class="kbd">↵</span></span>''')
write('T7-3-password', 'T7 Sign in with a password', screen('10:20', t73))

# T7-4 · 10:21 Nyasha, on her phone: Members › Rumbidzai › Send a new PIN
def phone(time, inner):
    return f'<div class="posc-pdev"><div class="posc-pscr"><div class="posc-pstat">{time}<span class="spacer"></span>{i("wifi-high")}{i("battery-high")}</div>{inner}</div></div>'

def member(pin_row, foot, toast=''):
    return f'''<div class="posc-phead"><span class="pos-icon" role="button" aria-label="Members">{i('caret-left')}</span><span class="posc-phead__t">Members</span></div>
<div class="posc-pme"><img src="{PHOTO['rumbidzai']}" alt="" width="84" height="84"><div class="posc-pme__t">Rumbidzai Moyo</div><div class="posc-pme__s">Cashier</div></div>
<div class="posc-pfacts">
{pin_row}
<div class="posc-pfact">{i('cash-register')}<span>Tills</span><span>Till 1, Till 2</span></div>
<div class="posc-pfact">{i('clock')}<span>On a till</span><span>{m('10:20')}</span></div>
<div class="posc-pfact">{i('phone')}<span>WhatsApp</span><span>{m('+263 77 318 4402')}</span></div>
</div>{toast}<div class="posc-pfoot">{foot}</div>'''

p1 = phone('10:21', member(f'<div class="posc-pfact posc-pfact--bad">{i("lock-key")}<span>Till PIN</span><span>Locked {m("10:20")}</span></div>',
                           f'<span class="pos-btn pos-btn--go" role="button">{WA}Send a new PIN</span>'))
p2 = phone('10:21', member(f'<div class="posc-pfact">{i("password")}<span>Till PIN</span><span>Sent on WhatsApp {m("10:21")}</span></div>',
                           f'<span class="pos-btn" role="button">{WA}Send another PIN</span>'))
write('T7-4-send-pin', 'T7 Nyasha sends a new PIN', f'<div class="cx posc-pboard" data-theme="tender">{p1}{p2}</div>')

# T7-5 · 12:58 back from lunch, the sent PIN once: now her own
t75 = gate(who('Now choose your own PIN', 'Signed in as Rumbidzai with the PIN you were sent'),
           f'''<div class="posc-twin"><div class="posc-pinl">New PIN</div>{dots(4)}</div>
<div class="posc-twin posc-twin--now"><div class="posc-pinl">Again</div>{dots(2)}</div>{pinpad('7', go='check')}''')
write('T7-5-own-pin', 'T7 Choose your own PIN', screen('12:58', t75))

# =====================================================================
# T8 · offline, Thursday 15 October (line down 11:06–15:22)
# =====================================================================
def banner_off(since, waiting):
    return f'<div class="posc-banner" role="status">{i("wifi-slash")}<span><b>No connection since {m(since)}</b></span>' + (f'<span class="posc-banner__go" role="button">{i("cloud-arrow-up")}{waiting} waiting</span>' if waiting else '') + '</div>'

STOP = 'This till has been offline for more than 4 hours, longer than the till rules allow. Connect it to send what it holds, then sell again.'
def banner_stop():
    return f'<div class="posc-banner posc-banner--bad" role="alert">{i("warning-circle")}<span><b>Selling has stopped</b> · Offline over 4 hours · 9 waiting to send</span></div>'

# T8-1 · 11:24 a cash sale with the line down
L81 = line(2, 'Cement 32.5R 50 kg', '11.50', '23.00') + line(2, 'Wire nails 75 mm, per kg', '2.60', '5.20', on=True, sub='2 kg · US$2.60 a kg')
write('T8-1-offline-sell', 'T8 Selling with no connection',
      device('11:24', rail() + shelf({'Cement 32.5R 50 kg': 2, 'Wire nails 75 mm, per kg': 2}, rows=2) + sale(L81, '4 items', '3.78', '28.20'),
             banner=banner_off('11:06', 0), net='off'))

# T8-2 · 11:25 paid, saved on this till, the slip prints
slip = f'''<section class="pos-shelf" aria-label="Slip" style="background: var(--ground); padding-top: 28px"><div class="posc-slipwrap"><div class="pos-receipt">
<div class="c t">Mufaro Hardware</div><div class="c">Chitungwiza</div><hr>
<div class="c t">Not yet a fiscal receipt</div>
<div class="r"><span>Unsent 7C2A91</span><span>15/10/2026 11:25</span></div>
<div class="r"><span>Till 1, Rumbidzai</span><span></span></div><hr>
<div class="r"><span>2 × Cement 32.5R 50 kg</span><span>23.00</span></div>
<div class="r"><span>2 × Wire nails 75 mm, per kg</span><span>5.20</span></div><hr>
<div class="r t"><span>Total</span><span>US$28.20</span></div>
<div class="r"><span>Cash US$</span><span>30.00</span></div>
<div class="r"><span>Change</span><span>1.80</span></div><hr>
<div class="q">Saved on the till with no connection. The sale number and fiscal receipt come when it is sent.</div>
</div></div></section>'''
paid82 = f'''<section class="pos-sale" aria-label="Paid" style="background: var(--surface)"><div class="pos-paid">
<span class="pos-paid__mark">{i('check-circle')}</span><div class="pos-paid__k">Change</div><div class="pos-paid__v">US$1.80</div>
<div class="pos-facts">
<div class="pos-fact">{i('cloud-slash')}<span>Saved on this till</span><span>7C2A91</span></div>
<div class="pos-fact">{i('money')}<span>Cash, US$30.00 handed</span><span>US$28.20</span></div>
<div class="pos-fact">{i('printer')}<span>Slip printed</span><span>11:25</span></div>
</div></div>
<div class="pos-act"><span class="pos-hold" role="button" aria-label="Print the slip again">{i('printer')}</span><span class="pos-take" role="button">Next sale<span class="kbd">N</span></span></div></section>'''
write('T8-2-saved-slip', 'T8 Saved on this till · slip', device('11:25', rail() + slip + paid82, banner=banner_off('11:06', 1), net='off'))

# T8-3 · 11:52 Waiting to send
Q = [('7C2A91', 'Walk-in', '11:25', '28.20', 'money'), ('3F81D0', 'Walk-in', '11:38', '7.90', 'money'), ('A04E6C', 'Walk-in', '11:49', '36.50', 'money'),
     ('92B7E3', 'Walk-in', '12:14', '39.20', 'credit-card'), ('D51A28', 'Walk-in', '12:40', '17.00', 'money'), ('6E0F47', 'Mai Rudo', '13:22', '21.60', 'device-mobile'),
     ('B7C3E5', 'Walk-in', '13:55', '115.00', 'money'), ('1D9A60', 'Walk-in', '14:31', '46.00', 'money'), ('E28F14', 'Walk-in', '14:58', '3.60', 'money')]
def qrow(tag, who_, t, v, g, s='Saved on this till', sent=None):
    if sent:
        return f'<div class="posc-q"><span class="posc-q__g posc-q__g--ok">{i("check")}</span><span class="posc-q__n">{sent}</span><span class="posc-q__t">{who_}<time>{t}</time></span><span class="posc-q__v">US${v}</span><span class="posc-q__s">{m(tag)}</span></div>'
    return f'<div class="posc-q"><span class="posc-q__g">{i(g)}</span><span class="posc-q__n">{tag}</span><span class="posc-q__t">{who_}<time>{t}</time></span><span class="posc-q__v">US${v}</span><span class="posc-q__s">{s}</span></div>'

t83 = f'''<section class="posc-main posc-main--span" aria-label="Waiting to send">
<div class="posc-h"><h1 class="pos-h1">Waiting to send</h1><span class="posc-hs">3 sales · {m("US$72.60")}</span></div>
<div class="posc-qbox">{''.join(qrow(*q) for q in Q[:3])}</div>
</section>'''
write('T8-3-waiting', 'T8 Waiting to send', device('11:52', rail('history') + t83, banner=banner_off('11:06', 3), net='off'))

# T8-4 · 15:07 past the till rules' 4 hours: selling stops
L84 = line(1, 'Binding wire 25 kg', '68.00', '68.00', on=True)
write('T8-4-stop', 'T8 Selling has stopped',
      device('15:07', rail() + shelf({'Binding wire 25 kg': 1}, rows=2) + sale(L84, '1 item', '9.13', '68.00', take='off'), banner=banner_stop(), net='stop'))

# T8-5 · 15:22 the line is back: all nine sent
SENT = ['S-10152', 'S-10153', 'S-10154', 'S-10155', 'S-10156', 'S-10157', 'S-10158', 'S-10159', 'S-10160']
t85 = f'''<section class="posc-main posc-main--span" aria-label="Waiting to send">
<div class="posc-h"><h1 class="pos-h1">Waiting to send</h1><span class="posc-hs">Nothing waiting</span></div>
<div class="posc-sub">Sent at {m('15:22')} · 9 sales · {m('US$315.00')}</div>
<div class="posc-qbox">{''.join(qrow(q[0], q[1], q[2], q[3], q[4], sent=s) for q, s in zip(Q, SENT))}</div>
</section>'''
write('T8-5-sent', 'T8 Sent when the line came back', device('15:22', rail('history') + t85))

# =====================================================================
# T9 · the Kora in the yard, Monday 19 October, Till 3, Tendai
# =====================================================================
def kora(time, inner, net='on'):
    return f'''<div class="cx posc-kboard" data-theme="tender"><div class="posc-kdev"><div class="posc-kscr">
<div class="posc-kbar"><img src="{PHOTO['tendai']}" alt="Tendai Chari"><span class="posc-kbar__t">Till 3</span><span class="spacer"></span>{i('wifi-high')}<span class="pos-time">{time}</span><span class="pos-icon" role="button" aria-label="More" style="width: 48px; margin-right: -10px">{i('list')}</span></div>
{inner}</div></div></div>'''

def kline(q, name, sub, val, on=False):
    return f'''<div class="posc-kline{" posc-kline--on" if on else ""}"><div class="posc-kline__t">{name}</div><div class="posc-kline__v">US${val}</div>
<div class="pos-qty"><b role="button" aria-label="One fewer">{i('minus')}</b><span>{q}</span><b role="button" aria-label="One more">{i('plus')}</b></div><div class="posc-kline__s">{sub}</div></div>'''

def kfoot(items, vat, total):
    return f'''<div class="posc-kfoot"><div class="pos-sum__row"><span>{items}</span><span class="spacer"></span><span>VAT US${vat}</span></div>
<div class="posc-krow"><span class="pos-hold" role="button" aria-label="Hold">{i('pause-circle')}</span><span class="pos-take" role="button">Take <b>US${total}</b></span></div></div>'''

BARS = '<svg width="150" height="58" viewBox="0 0 150 58" aria-hidden="true">' + ''.join(f'<rect x="{x}" y="0" width="{w}" height="58" fill="#24140e"/>' for x, w in [(0,3),(5,1),(8,2),(12,1),(16,3),(21,1),(24,2),(29,1),(32,3),(37,2),(41,1),(44,3),(49,1),(52,2),(56,1),(60,3),(65,1),(68,2),(72,3),(77,1),(80,2),(84,1),(88,3),(93,2),(97,1),(100,3),(105,1),(108,2),(112,1),(116,3),(121,1),(124,2),(128,3),(133,1),(136,2),(140,1),(143,3),(148,2)]) + '</svg>'
t91 = kora('11:05', f'''<div class="posc-kcam" role="img" aria-label="Camera"><div class="posc-kcam__bag"></div><div class="posc-kcam__code">{BARS}</div><div class="posc-kcam__frame"><div class="posc-kcam__line"></div></div><span class="posc-kcam__x" role="button" aria-label="Close the camera">{i('x')}</span></div>
<div class="posc-klines">{kline(10, 'Cement 32.5R 50 kg', 'US$11.50 each', '115.00', on=True)}</div>
{kfoot('10 items', '15.43', '115.00')}''')
write('T9-1-kora-scan', 'T9 Kora · scan', t91, 480, 960)

t92 = kora('11:05', f'''<div class="posc-kfind posc-kfind--on">{i('magnifying-glass')}<span>sand</span><span class="pos-caret" style="margin-left: -8px"></span><span class="spacer"></span><span class="pos-icon" role="button" aria-label="Clear" style="width: 48px">{i('x-circle')}</span></div>
<div class="posc-kres">
<div class="posc-kres__r posc-kres__r--on" role="button"><span class="posc-kres__g">{i('mountains')}<span class="pos-tile__n">1</span></span><div><div class="posc-kres__t">River <span class="posc-kmark">sand</span>, per tonne</div><div class="posc-kres__s">31 tonnes left</div></div><span class="posc-kres__p">US$45.00</span></div>
</div>
<div class="posc-klines" style="border-top: 1px solid var(--line); margin-top: 12px; padding-top: 10px">{kline(10, 'Cement 32.5R 50 kg', 'US$11.50 each', '115.00')}{kline(1, 'River sand, per tonne', 'US$45.00 a tonne', '45.00', on=True)}</div>
{kfoot('11 items', '21.47', '160.00')}''')
write('T9-2-kora-search', 'T9 Kora · search', t92, 480, 960)

KREF = 'MP261019.1106.K30772'
kb_rows = ['QWERTYUIOP', 'ASDFGHJKL']
kb = '<div class="posc-kkeys">' + ''.join(f'<span>{c}</span>' for c in kb_rows[0]) + '<span style="visibility: hidden"></span>' + ''.join(f'<span>{c}</span>' for c in kb_rows[1]) + \
     f'<span class="w2">⇧</span>' + ''.join(f'<span>{c}</span>' for c in 'ZXCVBNM') + f'<span aria-label="Delete">{i("backspace")}</span>' + \
     f'<span class="w2">123</span><span>.</span><span class="w5"></span><span class="w2" style="background: var(--action-fill); color: #fff" aria-label="Done">{i("check")}</span></div>'
t93 = kora('11:06', f'''<div class="posc-kpay">
<div class="pos-tray__h"><div><div class="pos-tray__k">Take</div><div class="pos-tray__amt">US$160.00</div></div><span class="pos-icon" role="button" aria-label="Back to the sale" style="margin: -4px -8px 0 auto">{i('x')}</span></div>
<div class="pos-tenders">''' + ''.join(f'<span class="pos-tender" role="button" aria-pressed="{"true" if k == "ecocash" else "false"}">{i(g)}{n}</span>' for k, g, n in [('cash', 'money', 'Cash'), ('card', 'credit-card', 'Card'), ('ecocash', 'device-mobile', 'EcoCash'), ('innbucks', 'wallet', 'InnBucks'), ('split', 'arrows-split', 'Split')]) + f'''</div>
<div class="pos-parts"><div class="pos-part pos-part--now" style="row-gap: 12px">
<span class="pos-part__g">{i('device-mobile')}</span><div class="pos-part__t">EcoCash</div><span class="pos-part__v">US$160.00</span>
<div style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px">
<div class="pos-sum__row"><span>Merchant code</span><span class="spacer"></span><span style="color: var(--ink)">041288</span></div>
<div class="pos-field" style="font-size: 16px; padding: 0 12px"><small>Reference</small><span>{KREF}</span><span class="pos-caret"></span></div>
</div></div></div>
<div style="padding: 14px 14px 12px"><span class="pos-take" role="button" style="height: 64px; font-size: 20px">Received <b>US$160.00</b></span></div>
{kb}</div>''')
write('T9-3-kora-ecocash', 'T9 Kora · EcoCash', t93, 480, 960)

t94 = kora('11:07', f'''<div class="posc-kpaid">
<span class="pos-paid__mark">{i('check-circle')}</span><div class="pos-paid__k">Paid by EcoCash</div><div class="pos-paid__v">US$160.00</div>
<div class="pos-facts">
<div class="pos-fact">{i('receipt')}<span>Sale</span><span>S-10491</span></div>
<div class="pos-fact">{i('device-mobile')}<span>EcoCash</span><span>…1106.K30772</span></div>
<div class="pos-fact">{i('user')}<span>Farai Chiweshe</span><span>+263 77 412 6630</span></div>
</div>
</div>
<div class="posc-kfoot" style="border-top: 0"><div class="posc-krow"><span class="pos-hold" role="button" aria-label="Print">{i('printer')}</span><span class="pos-take" role="button">{WA}Send the receipt</span></div>
<span class="pos-btn" role="button" style="justify-content: center; height: 56px">Next sale</span></div>''')
write('T9-4-kora-receipt', 'T9 Kora · receipt on WhatsApp', t94, 480, 960)

# =====================================================================
# T-F · failures, one way out each
# =====================================================================
def fcell(name, body, ground=False):
    return f'<div class="posc-fcell"><div class="posc-fname">{name}</div><div class="posc-fframe{" posc-fframe--ground" if ground else ""}">{body}</div></div>'

f1 = fcell('No match', f'''<div class="pos-find posc-find--bad">{i('magnifying-glass')}<span>sement</span><span class="pos-caret" style="margin-left: -8px"></span><span class="pos-find__scan" role="button" aria-label="Scan">{i('barcode')}</span></div>
<div class="posc-empty">{i('magnifying-glass')}<span>No product called “sement”</span><span class="pos-btn" role="button" style="align-self: center">{i('x')}Clear <span class="kbd">Esc</span></span></div>''')

f2 = fcell('EcoCash reference in the wrong format', f'''<div class="pos-part pos-part--now" style="row-gap: 12px">
<span class="pos-part__g">{i('device-mobile')}</span><div class="pos-part__t">EcoCash</div><span class="pos-part__v">US$160.00</span>
<div style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px">
<div class="pos-field posc-field--bad" style="font-size: 16px"><small>Reference</small><span>MP2610191106K30772</span><span class="pos-caret"></span></div>
<div class="posc-badline">{i('warning-circle')}Not an EcoCash reference</div>
</div></div>
<span class="pos-take pos-take--off" role="button" aria-disabled="true" style="margin-top: auto">Received <b>US$160.00</b></span>''')

f3 = fcell('Card declined on the terminal', f'''<div class="posc-term" aria-hidden="true"><div class="posc-term__s"><span>Declined</span><span>US$39.20</span></div><div class="posc-term__k"><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b></div></div>
<div class="pos-part pos-part--now"><span class="pos-part__g">{i('credit-card')}</span><div style="min-width: 0"><div class="pos-part__t">Card</div><div class="pos-part__s" style="color: var(--bad)">Declined</div></div><span class="pos-part__v">US$39.20</span></div>
<span class="pos-take" role="button" style="margin-top: auto">{i('arrows-left-right')}Pay another way<span class="kbd">↵</span></span>''', ground=True)

f4 = fcell('No ZiG rate this morning', f'''<div><div class="pos-tray__k">Take</div><div class="pos-tray__amt" style="font-size: 32px">US$34.80</div></div>
<div class="posc-cur"><span role="button" aria-pressed="true">{i('money')}US$</span><span role="button" aria-disabled="true">ZiG<small>No rate today</small></span></div>
<span class="pos-btn" role="button" style="margin-top: auto">{i('arrows-left-right')}Set today's rate</span>''')

f5 = fcell('Printer out of paper', f'''<div class="pos-facts" style="margin: 0">
<div class="pos-fact">{i('receipt')}<span>Sale</span><span>S-10485</span></div>
<div class="pos-fact">{i('money')}<span>Cash, US$5.00 handed</span><span>US$4.80</span></div>
<div class="pos-fact">{i('printer')}<span>Receipt</span><span style="color: var(--bad); font-family: var(--font-sans); font-weight: 500; font-size: 15px">Out of paper</span></div>
</div>
<span class="pos-take" role="button" style="margin-top: auto">{i('printer')}Print again<span class="kbd">P</span></span>''')

f6 = fcell('Out of stock', f'''<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; width: 100%">
{tile('Wheelbarrow 65 L', '46.00', 'trolley', extra='<div class="posc-tile__s posc-tile__s--bad">None left</div>', cls='pos-tile pos-tile--off')}
{tile('Claw hammer 16 oz', '7.90', 'hammer', extra='<div class="posc-tile__s">12 left</div>')}
</div>
<div class="posc-menu" style="left: 96px; top: 238px"><span aria-current="true">{i('package')}Adjust stock</span></div>''', ground=True)

write('T-F-failures', 'T failures', f'<div class="cx posc-fboard" data-theme="tender">{f1}{f2}{f3}{f4}{f5}{f6}</div>')
print('ok')
