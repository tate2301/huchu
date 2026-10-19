"""Books, final form: page boards for Bank & cash, Tax, Close the month, Ledger, Settings and the cross-cutting states.

    cd design/core-modules && python3 tools/boards/books_pages_b.py boards/canvas

Every board is a Bk… page from spec/books-final.md §3.3, in the shell with the Books panel open on the page's level.
Figures agree with books_pages_a.py (Money, Sales, Bills & spending: accounts, payments, receipts, VAT so far)
and with the older BooksBank, PageBooksJournals and PageBooksClose where those still hold. Today is Sat 18 Oct 2026.
"""
import sys, os
from decimal import Decimal, ROUND_HALF_UP
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import *
from books_nav import *
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'boards', 'canvas')

CSS = '''
.sh{position:relative}
.mn{position:relative}
.bk-tabs{padding:0 24px;flex:none}
.bk-tabs .tab .n{font-weight:400;color:var(--color-muted);font-variant-numeric:tabular-nums}
.bk-body{display:flex;flex:1 1 auto;min-height:0}
.bk-col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;overflow:auto}
.bk-pad{padding:0 24px}
.bk-sum{width:100%;border-collapse:collapse;font-size:14px}
.bk-sum td{height:40px;padding:0 24px;box-shadow:inset 0 -1px 0 var(--color-line);color:var(--color-ink-2)}
.bk-sum td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--color-ink)}
.bk-sum tr.t td{font-weight:600;color:var(--color-ink);background:var(--color-ground)}
.bk-sum tr.d td{font-weight:600;color:var(--color-ink);box-shadow:inset 0 1px 0 var(--color-rule),inset 0 -1px 0 var(--color-line)}
.bk-chk{display:grid;grid-template-columns:24px minmax(0,1.1fr) minmax(0,1.3fr) 150px;align-items:center;gap:16px;min-height:52px;padding:8px 24px;box-shadow:inset 0 -1px 0 var(--color-line);font-size:14px;color:var(--color-ink-2)}
.bk-chk .lead{color:var(--color-ink);font-weight:500}
.bk-chk .end{display:flex;justify-content:flex-end;gap:8px}
.bk-ok{color:var(--color-success)}
.bk-no{color:var(--color-danger)}
.bk-wait{color:var(--color-warning)}
.bk-kv{display:grid;grid-template-columns:150px minmax(0,1fr);row-gap:10px;column-gap:12px;font-size:13px}
.bk-kv dt{color:var(--color-muted)}
.bk-kv dd{margin:0;color:var(--color-ink);min-width:0}
.bk-h3{font-size:14px;font-weight:600;color:var(--color-ink)}
.bk-note{font-size:13px;color:var(--color-muted);line-height:1.5}
.bk-dlg{width:520px;max-width:none;display:flex;flex-direction:column}
.bk-dlg .dialog-foot{flex-direction:row;align-items:center}
.bk-dlg .dialog-body{gap:16px}
.bk-dlg .dialog-body p{font-size:14px;line-height:1.5}
.bk-what{display:flex;flex-direction:column;gap:0;border-radius:8px;box-shadow:var(--shadow-ring);overflow:hidden}
.bk-what div{display:grid;grid-template-columns:20px minmax(0,1fr);gap:10px;align-items:start;padding:10px 12px;font-size:13px;line-height:1.5;color:var(--color-ink-2);box-shadow:inset 0 -1px 0 var(--color-line)}
.bk-what div:last-child{box-shadow:none}
.bk-what .ic{width:16px;height:16px;margin-top:2px;color:var(--color-muted)}
.bk-chips{display:flex;flex-wrap:wrap;gap:6px}
.bk-chips span{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:6px;box-shadow:var(--shadow-ring);font-size:13px;color:var(--color-ink-2)}
.bk-chips span.on{background:var(--color-ink);color:var(--color-surface);box-shadow:none}
.bk-ta{min-height:64px;padding:8px 12px;border-radius:var(--radius-control);box-shadow:var(--shadow-ring),var(--shadow-raised);font-size:14px;color:var(--color-ink);line-height:1.5}
.bk-in{display:flex;align-items:center;height:36px;padding:0 12px;border-radius:var(--radius-control);box-shadow:var(--shadow-ring),var(--shadow-raised);font-size:14px;color:var(--color-ink);background:var(--color-surface)}
.bk-in.ph{color:var(--color-faint)}
.bk-in.ro{background:var(--color-ground);color:var(--color-muted);box-shadow:var(--shadow-ring)}
.bk-lab{font-size:13px;font-weight:500;color:var(--color-ink)}
.bk-fld{display:flex;flex-direction:column;gap:6px;min-width:0}
.bk-dim{position:absolute;inset:0;background:var(--color-scrim);z-index:30;display:flex;align-items:center;justify-content:center;gap:32px;padding:24px}
.bk-menu{position:absolute;z-index:5}
.bk-tree td:nth-child(2){white-space:nowrap}
.bk-tree .lv1{padding-left:0;font-weight:600;color:var(--color-ink)}
.bk-tree .lv2{padding-left:20px;font-weight:500;color:var(--color-ink)}
.bk-tree .lv3{padding-left:44px}
.bk-tree .caret{display:inline-block;width:16px;color:var(--color-muted)}
.bk-tree .caret .ic{width:12px;height:12px;vertical-align:-1px}
.bk-ex{padding:16px 24px 20px;background:var(--color-ground);box-shadow:inset 0 -1px 0 var(--color-line);display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:32px}
.bk-sel td{background:var(--color-accent-tint)}
.bk-ph{width:390px;height:844px;display:flex;flex-direction:column;background:var(--color-surface);position:relative;overflow:hidden}
.bk-ph header{display:flex;align-items:center;gap:8px;height:56px;padding:0 8px;box-shadow:inset 0 -1px 0 var(--color-line);flex:none}
.bk-ph header b{font-size:17px;flex:1}
.bk-card{padding:16px;border-radius:12px;box-shadow:var(--shadow-ring);display:flex;flex-direction:column;gap:10px}
.bk-upsell li{display:grid;grid-template-columns:20px minmax(0,1fr);gap:12px;padding:12px 0;box-shadow:inset 0 -1px 0 var(--color-line);font-size:14px;color:var(--color-ink-2);line-height:1.5}
.bk-upsell li b{color:var(--color-ink);font-weight:600}
.bk-upsell .ic{color:var(--color-muted);margin-top:2px}
.table td.bk-fw{max-width:none;white-space:normal}
.table td.bk-fw .cell-lead{overflow:visible}
.bk-cmp td,.bk-cmp th{padding-left:8px;padding-right:8px}
.bk-ghost td{color:transparent!important}
.bk-ghost td i{display:block;height:10px;border-radius:4px;background:var(--color-fill)}
/* the calm pass: one rail kit, top-aligned icons, quiet rows */
.bk-rail{flex:none;overflow:auto;background:var(--color-surface)}
.bk-rail .attrs dd.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--color-ink)}
.bk-rail .attrs.n{grid-template-columns:minmax(0,1fr) auto}
.bk-rail .sec-title .end{margin-left:auto}
.bk-rail .bk-racts{display:flex;gap:8px;align-items:center}
.bk-rail .bk-mut{font-size:13px;color:var(--color-muted);margin-top:-6px}
.bk-chk{align-items:center;padding:8px 24px;min-height:52px;line-height:20px}
.bk-chk>span:first-child{display:flex;align-items:center;height:20px}
.bk-chk>span:first-child .ic{width:18px;height:18px}
.bk-chk .end{align-self:center}
.bk-chk>span:nth-child(3){color:var(--color-muted)}
.bk-gh{padding:40px 24px 8px}
.bk-head{display:flex;flex-direction:column;gap:6px;padding:32px 24px 16px}
.bk-head .t{display:flex;align-items:center;gap:12px}
.bk-head h1{font-size:var(--text-20);font-weight:600;letter-spacing:var(--tracking-title);line-height:28px;color:var(--color-ink)}
.bk-head .sub{font-size:13px;color:var(--color-muted)}
.bk-prop{display:grid;grid-template-columns:14px minmax(0,1fr);column-gap:8px;row-gap:2px}
.bk-prop .vn{margin-top:3px}
.bk-prop .cell-lead{line-height:20px;white-space:normal}
.bk-prop .sub{grid-column:2;font-size:13px;color:var(--color-muted)}
.bk-rowacts{display:flex;gap:4px;justify-content:flex-end;align-items:center}
.bk-what div{line-height:20px}
.bk-what .ic{margin-top:2px}
.bk-upsell li{grid-template-columns:20px minmax(0,1fr);padding:14px 0;line-height:20px}
.bk-upsell li .ic{width:20px;height:20px;margin-top:0}
.bk-upsell li span{display:flex;flex-direction:column;gap:2px}
.bk-upsell li b{font-weight:500}
.bk-upsell li em{font-style:normal;font-size:13px;color:var(--color-muted);line-height:18px}
.bk-map{display:grid;grid-template-columns:minmax(0,420px) minmax(0,280px);gap:48px;padding:24px 24px 28px;background:var(--color-ground);box-shadow:inset 0 -1px 0 var(--color-line)}
.bk-map>div{display:flex;flex-direction:column;gap:12px}
.bk-map .attrs dd{color:var(--color-ink)}
'''

# ---------- money ----------
def M(x):
    return Decimal(str(x)).quantize(Decimal('0.01'), ROUND_HALF_UP)

def fmt(x):
    return '{:,.2f}'.format(M(x))

def usd(x, sign=False):
    x = M(x)
    return ('−' if x < 0 else ('+' if sign and x > 0 else '')) + 'US$' + fmt(abs(x))

def zig(x, sign=False):
    x = M(x)
    return ('−' if x < 0 else ('+' if sign and x > 0 else '')) + 'ZiG ' + fmt(abs(x))

def n2(x, blank_zero=False):
    x = M(x)
    if blank_zero and x == 0:
        return ''
    return ('−' if x < 0 else '') + fmt(abs(x))

RATE = M('27.00')        # RBZ interbank, today 06:00 (books_pages_a)
RATE_SEP = M('26.80')    # 30 Sep, month end
VAT = Decimal('0.155')

def vat_in(gross):
    return M(M(gross) * VAT / (1 + VAT))

def to_usd(z, rate=RATE):
    return M(M(z) / rate)

# ---------- cells ----------
def ref(x):
    return '<span class="ref">%s</span>' % x

def lead(x, sub=None):
    return '<span class="cell-lead">%s</span>' % x + ('<span class="sub" style="display:block;font-size:12px;color:var(--color-muted)">%s</span>' % sub if sub else '')

def mut(x):
    return '<span class="muted">%s</span>' % x

def flag(text='To confirm'):
    return '<span class="pill pill-warn">%s</span>' % text

TONES = {'Posted': 'success', 'Paid': 'success', 'Matched': 'success', 'Closed': 'success', 'Filed': 'success', 'Valid': 'success',
         'Approved': 'success', 'Reconciled': 'success', 'Active': 'success', 'Ready': 'success', 'Counted': 'success', 'Done': 'success',
         'Open': 'info', 'Reviewed': 'info', 'Finalised': 'info', 'Issued': 'info', 'Part paid': 'info',
         'Waiting': 'warning', 'Pending': 'warning', 'Closing': 'warning', 'To approve': 'warning', 'Due': 'warning', 'To match': 'warning',
         'Overdue': 'warning', 'Not checked': 'warning', 'Expired': 'warning', 'None on file': 'warning',
         'Failed': 'danger', 'Not valid': 'danger', 'Needs an account': 'danger', 'Skipped': 'danger',
         'Void': 'void', 'Excluded': 'void', 'Reversed': 'void', 'Inactive': 'void', 'Unchanged': 'void', 'Not yet': '', 'Draft': ''}

def st(word, label=None):
    t = TONES.get(word, '')
    label = label or word
    if t == 'void':
        return '<span class="status" style="color:var(--color-muted)">%s</span>' % label
    if t == 'warning':
        return '<span class="status status-warning" style="color:var(--color-ink);font-weight:500">%s</span>' % label
    return status(label, t)

def tick(state):
    if state == 'ok':
        return '<span class="bk-ok">%s</span>' % ic('check')
    if state == 'no':
        return '<span class="bk-no">%s</span>' % ic('warn')
    if state == 'wait':
        return '<span class="bk-wait">%s</span>' % ic('clock')
    return '<span class="muted">%s</span>' % ic('step-todo')

def tbl(cols, rows, total=None, cls='table', rowcls=None, sel_rows=()):
    """cols: (label, kind); kind '' | 'num' | 'fill' (ellipsis) | 'fillw' (wraps) | 'sel' | 'wrap' | 'acts'."""
    def cw(k):
        if k in ('fill', 'fillw'):
            return '<col>'
        if k == 'wrap':
            return '<col style="width:30%">'
        return '<col style="width:1%">'
    def cl(k):
        return {'num': ' class="num"', 'fill': ' class="fill"', 'fillw': ' class="fill bk-fw"', 'sel': ' class="sel"', 'wrap': ' class="wrap"', 'acts': ' class="acts"'}.get(k, '')
    th = ''.join('<th%s>%s</th>' % (cl(k) if k not in ('wrap', 'fillw') else '', h) for h, k in cols)
    body = ''
    for i, r in enumerate(rows):
        if isinstance(r, str):
            body += r
            continue
        a = ''
        if rowcls and rowcls.get(i):
            a = ' class="%s"' % rowcls[i]
        if i in sel_rows:
            a = ' aria-selected="true"'
        body += '<tr%s>' % a + ''.join('<td%s>%s</td>' % (cl(k), c) for (_, k), c in zip(cols, r)) + '</tr>'
    tf = ''
    if total:
        tf = '<tfoot><tr class="tot">' + ''.join('<td%s>%s</td>' % (cl(k) if k != 'wrap' else '', c) for (_, k), c in zip(cols, total)) + '</tr></tfoot>'
    return '<table class="%s"><colgroup>%s</colgroup><thead><tr>%s</tr></thead><tbody>%s</tbody>%s</table>' % (cls, ''.join(cw(k) for _, k in cols), th, body, tf)

def grp(label, n, span):
    return '<tr class="grp"><td colspan="%d">%s<span class="n">%s</span></td></tr>' % (span, label, n)

def tot(cells):
    return '<tr class="tot">%s</tr>' % ''.join(cells)

def cbx(on=False, label='Select'):
    return '<label class="check"><input type="checkbox" aria-label="%s"%s></label>' % (label, ' checked' if on else '')

# ---------- page parts ----------
def tabs(items, on=0):
    out = ''
    for i, it in enumerate(items):
        label, n = (it if isinstance(it, tuple) else (it, None))
        out += '<button class="tab" role="tab" aria-selected="%s">%s%s</button>' % ('true' if i == on else 'false', label, ' <span class="n">%s</span>' % n if n is not None else '')
    return '<div class="tabs bk-tabs" role="tablist">%s</div>' % out

def seg(items, on=0, label='View'):
    return '<div class="seg" role="tablist" aria-label="%s">%s</div>' % (label, ''.join(
        '<button role="tab" aria-selected="%s">%s</button>' % ('true' if i == on else 'false', t) for i, t in enumerate(items)))

def tools(find, chips=(), count='', right=None):
    return ws_tools(find, chips, count, right, False)

def chips_bar(*parts):
    return '<div class="tools" style="padding:12px 24px">%s</div>' % ''.join(parts)

def chip(label, value, on=False):
    return '<span class="chipsel%s">%s <b>%s</b>%s</span>' % (' is-set' if on else '', label, value, ic('down'))

def fsum(label, value):
    return '<span class="foot-sum">%s <b>%s</b></span>' % (label, value)

def foot(left, sums=(), end='', sel=None):
    s = '<div class="foot-row foot-sel" role="region" aria-label="Selection">%s</div>' % sel if sel else ''
    main = '<div class="foot-row foot-main"><span class="num">%s</span>%s<div class="end">%s</div></div>' % (left, ''.join(fsum(a, b) for a, b in sums), end)
    return '<div class="table-foot"%s>%s%s</div>' % (' data-selected="true"' if sel else '', s, main)

def selbar(n, sums, actions):
    return '<span><b>%s</b> selected</span>%s<div class="btn-group" role="group" aria-label="Do with the selection">%s</div><div class="end">%s%s</div>' % (
        n, ''.join(fsum(a, b) for a, b in sums), actions, kbd('Esc'), btn('Clear', 'x', 'btn btn-quiet'))

def pages_btns():
    return '<div class="btn-group" role="group" aria-label="Pages">%s%s</div>' % (btn('Previous', 'back'), btn('Next', 'chev'))

def sheet(table_html, foot_html, before='', after=''):
    return '<div class="table-shell"><div class="table-scroll">%s%s%s</div>%s</div>' % (before, table_html, after, foot_html)

def disabled_primary(label, icon, k):
    return '<button class="btn btn-primary" disabled aria-disabled="true" style="opacity:.45">%s%s%s</button>' % (ic(icon), label, kbd(k, True))

ICON = {}
for _lvl, _ic, _rows in LEVELS:
    for _r in _rows:
        ICON[_r[0]] = _r[1]

# Board heights fit the content: the last element's bottom plus 48px, never under a 900px screen (measured after the calm pass).
H = {'BkAccount': 930, 'BkTaxDue': 910, 'BkVatReturn': 1000, 'BkClose': 960, 'BkJournals': 920, 'BkJournalNew': 920,
     'BkTrialBalance': 1450, 'BkFinancials': 1010, 'BkLedger': 1510, 'BkChart': 1120, 'BkSetup': 1040}

def page(name, title, route, on, main, right='', h=900, extra='', icon=None, heading=None):
    h = H.get(name, h)
    top = topbar(heading or title, icon or ICON.get(on, 'books'), right)
    body = shell('Books', books_panel_for(on), top + main, extra)
    return write(ROOT, name, 'Books · %s · %s' % (title, route), body, h=h, css=CSS)

def kaside(inner, w=360):
    return '<aside class="kaside" style="width:%dpx">%s</aside>' % (w, inner)

def split(left, side):
    return '<div class="bk-body"><div class="bk-col">%s</div>%s</div>' % (left, side)

def kv(pairs):
    return '<dl class="bk-kv">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % p for p in pairs)

# ---------- the calm pass ----------
def menu_btn(label, icon=None):
    """One menu button that holds the actions that are not the primary (rule 1)."""
    return '<button class="btn" aria-haspopup="menu">%s%s%s</button>' % (ic(icon) if icon else '', label, ic('down'))

def more_btn(label='More actions'):
    return '<button class="btn btn-quiet btn-icon" aria-haspopup="menu" aria-label="%s">%s</button>' % (label, ic('more'))

def ink(label, icon, k=None, extra=''):
    """Strong, for an action that holds up money or a fine today (rule 9)."""
    return '<button class="btn btn-ink%s">%s%s%s</button>' % (extra, ic(icon) if icon else '', label, kbd(k, True) if k else '')

def rsec(title, rows=(), figure=None, end='', after='', num=False):
    """A rail section: title, optional figure, at most four rows (rule 5)."""
    assert len(rows) <= 4, title
    dd = '<dd class="num">%s</dd>' if num else '<dd>%s</dd>'
    dl = '<dl class="attrs%s">%s</dl>' % (' n' if num else '', ''.join(('<dt>%s</dt>' + dd) % r for r in rows)) if rows else ''
    return '<section><div class="sec-title">%s%s</div>%s%s%s</section>' % (
        title, '<span class="end">%s</span>' % end if end else '', '<div class="figure">%s</div>' % figure if figure else '', dl, after)

def rail_(sections, w=340):
    assert sections.count('<section>') <= 2
    return '<aside class="rail bk-rail" style="width:%dpx">%s</aside>' % (w, sections)

def rec_head(title, pill, sub):
    """Record page header: title, one status pill, one muted line of two items (rule 2)."""
    return '<div class="bk-head"><div class="t"><h1>%s</h1>%s</div><div class="sub">%s</div></div>' % (title, pill, sub)


# =====================================================================
# The world (books_pages_a.py owns Money, Sales and Bills & spending; these agree with it)
# =====================================================================
# Money accounts, today 06:00
ACCOUNTS = [
    # kind, name, sub, currency, balance, last reconciled, to match
    ('Bank', 'CBZ current, USD', 'Ending 4471 · 1010', 'USD', M('18412.75'), '30 Sep', 4),
    ('Bank', 'CBZ current, ZWG', 'Ending 4472 · 1011', 'ZWG', M('61280.40'), '30 Sep', 0),
    ('Mobile money', 'EcoCash merchant', 'Merchant 0412 · 1020', 'USD', M('1086.50'), '15 Oct', 0),
    ('Cash', 'Showroom cash box', 'The tills’ cash · 1030', 'USD', M('642.80'), 'Counted 17 Oct', 0),
    ('Cash', 'Showroom petty cash', 'Chipo Mhlanga · imprest US$200.00', 'USD', M('126.40'), 'Counted 30 Sep', 0),
    ('Cash', 'Site float, Farai Ncube', 'Imprest US$100.00 · 1041', 'USD', M('64.00'), 'Counted 30 Sep', 0),
]
CASH_USD = sum((a[4] for a in ACCOUNTS if a[3] == 'USD'), Decimal('0'))
CASH_ZIG = sum((a[4] for a in ACCOUNTS if a[3] == 'ZWG'), Decimal('0'))
CASH_BASE = CASH_USD + to_usd(CASH_ZIG)

# CBZ current, USD: book entries since the 30 Sep reconciliation (payments and receipts from books_pages_a)
CBZ_TX = [
    ('1 Oct', 'PAY-0056', 'JE-0417', 'Kingsway Property, rent October', 'Payment made', M(-1450), True),
    ('1 Oct', 'BE-0041', 'JE-0418', 'IMTT on PAY-0056', 'Bank entry', M('-29.00'), True),
    ('2 Oct', 'REC-0088', 'JE-0423', 'Greystone Park Primary, INV-0139', 'Payment received', M(2980), True),
    ('5 Oct', 'PAY-0057', 'JE-0431', 'Halsted Builders, BILL-0219', 'Payment made', M('-312.40'), True),
    ('5 Oct', 'BE-0042', 'JE-0432', 'IMTT on PAY-0057', 'Bank entry', M('-6.25'), True),
    ('8 Oct', 'REC-0091', 'JE-0446', 'Pomona Offices, INV-0142', 'Payment received', M(500), True),
    ('9 Oct', 'PAY-0058', 'JE-0449', 'Tile Trader Zimbabwe, BILL-0216', 'Payment made', M(-2210), True),
    ('9 Oct', 'BE-0043', 'JE-0450', 'IMTT on PAY-0058', 'Bank entry', M('-44.20'), True),
    ('10 Oct', 'PAY-0059', 'JE-0455', 'ZIMRA, PAYE and AIDS levy, September', 'Payment made', M('-648.40'), True),
    ('10 Oct', 'BE-0044', 'JE-0456', 'IMTT on PAY-0059', 'Bank entry', M('-12.97'), True),
    ('12 Oct', 'REC-0092', 'JE-0466', 'Mandara Medical Centre, deposit', 'Payment received', M(1000), True),
    ('14 Oct', 'PAY-0061', 'JE-0481', 'ZIMRA, VAT September', 'Payment made', M('-1184.60'), False),
]
CBZ_BOOK = M('18412.75')
CBZ_SEP = CBZ_BOOK - sum((t[5] for t in CBZ_TX), Decimal('0'))           # book = statement on 30 Sep
# The statement to Fri 16 Oct: the lines still to match
MATCH_LINES = [
    ('Wed 14 Oct', 'ZIMRA VAT Sep 2026 ref 2210448', M('-1184.60'), ref('PAY-0061') + ', ZIMRA, VAT for September', 'Match',
     'Same amount and TaRMS reference'),
    ('Wed 14 Oct', 'IMTT 2% tax', M('-23.69'), 'Bank entry: IMTT, to 6420', 'Create',
     '2%% of the %s paid to ZIMRA' % usd(1184.60)),
    ('Fri 16 Oct', 'Transfer from EcoCash 0412', M('800.00'), 'Transfer from EcoCash merchant', 'Create',
     'EcoCash shows %s sent on 16 Oct' % usd(800)),
    ('Fri 16 Oct', 'Service fee October', M('-18.00'), '', '',
     'Looks like CBZ’s monthly fee'),
]
NOT_IN_BOOKS = M('-23.69') + M('800.00') + M('-18.00')
STMT_CLOSE = CBZ_BOOK + NOT_IN_BOOKS
MATCHED = [t for t in CBZ_TX if t[6]]
MATCHED_SUM = sum((t[5] for t in MATCHED), Decimal('0'))
UNMATCHED_SUM = sum((l[2] for l in MATCH_LINES), Decimal('0'))
assert CBZ_SEP + MATCHED_SUM + UNMATCHED_SUM == STMT_CLOSE

# Tax
PAYE_OCT = M('1799.62')        # PAYE and AIDS levy on October's run (PayApprove)
NSSA_OCT = M('509.40')
ZIMDEF_OCT = M('81.56')
WHT = M(M('1859.55') * Decimal('0.30'))   # PAY-0062 to Mutare Timber Works, BILL-0220
QPD4 = M(3150)
TAX_YEAR = M(9000)
VAT_SEP = M('1184.60')
OUT_ROWS = [  # line, documents, gross
    ('Standard-rated sales, invoices, 15.5%', '6 invoices', [380, 1750, 430, M('1994.22'), 640, to_usd(13500)], 1),
    ('Less credit notes', ref('CN-0007') + ', ' + ref('CN-0008') + ', ' + ref('CN-0009'), [85, 420, 640], -1),
    ('Till sales, showroom, 15.5%', '641 sales', [M('14862.40')], 1),
]
IN_ROWS = [
    ('Bills with an FTI that is Valid on FDMS', '4 bills', [1450, M('312.40'), 2640, M('212.60')], 1),
    ('Requisition slips with a valid FTI', ref('REQ-0088') + ', 2 slips', [M('32.50'), M('96.00')], 1),
]
NOT_CHECKED = [M('1859.55'), 3180, 185]

def vat_line(gross, sign):
    g = sum((M(x) for x in gross), Decimal('0'))
    v = sum((vat_in(x) for x in gross), Decimal('0'))
    return sign * (g - v), sign * v

OUT_VAT = sum((vat_line(r[2], r[3])[1] for r in OUT_ROWS), Decimal('0'))
IN_VAT = sum((vat_line(r[2], r[3])[1] for r in IN_ROWS), Decimal('0'))
VAT_OCT = OUT_VAT - IN_VAT
assert VAT_OCT == M('1968.46'), VAT_OCT
NOV_PAY = PAYE_OCT + NSSA_OCT + ZIMDEF_OCT + WHT + VAT_OCT


# =====================================================================
# Bank & cash
# =====================================================================
def crumb(parent, here):
    return '<span style="color:var(--color-muted);font-weight:500">%s</span><span style="color:var(--color-faint);font-weight:400">/</span>%s' % (parent, here)

# Bank & cash: Transfer and Record a bank charge live in one Record menu; Upload a statement is the one primary.
RECORD_BANK = menu_btn('Record')

def accounts():
    # Currency is dropped: the balance carries US$ or ZiG.
    cols = [('Account', 'fill'), ('Balance', 'num'), ('In USD', 'num'), ('Last reconciled', ''), ('To match', 'num'), ('', 'acts')]
    rows = []
    for kind, n in (('Bank', 2), ('Mobile money', 1), ('Cash', 3)):
        rows.append(grp(kind, n, len(cols)))
        for a in [a for a in ACCOUNTS if a[0] == kind]:
            bal = usd(a[4]) if a[3] == 'USD' else zig(a[4])
            tm = '<span class="chip-n">%d</span>' % a[6] if a[6] else mut('—')
            rows.append([lead(a[1], a[2]), bal, usd(to_usd(a[4])) if a[3] != 'USD' else mut('—'), mut(a[5]), tm, iconbtn('more', 'More for %s' % a[1])])
    tb = tbl(cols, rows).replace('<td class="fill">', '<td class="fill" style="height:52px">')
    f = foot('6 accounts', (('In USD', usd(CASH_BASE)), ('USD', usd(CASH_USD)), ('ZiG', zig(CASH_ZIG))), mut('ZiG at 27.00 today'))
    main = (finding('%s is in your bank, EcoCash and cash today.' % usd(CASH_BASE), 'CBZ current, USD has 4 lines to match.')
            + tabs([('All', 6), ('Bank', 2), ('Mobile money', 1), ('Cash', 3)], 0)
            + tools('Search accounts', (), '6 accounts', btn('Export', 'export'))
            + sheet(tb, f))
    return page('BkAccounts', 'Accounts', '/books/accounts', 'Accounts', main, RECORD_BANK + primary('Upload a statement', 'upload', 'U'))


def account():
    # A record page: no finding. The balance and the statement figure are in the rail.
    bal = CBZ_SEP
    lines = []
    for t in CBZ_TX:
        bal += t[5]
        lines.append((t, bal))
    rows = []
    for t, b in reversed(lines):
        rows.append([mut(t[0]), ref(t[1]), lead(t[3], t[4]), usd(t[5], True), mut(usd(b)), st('Matched' if t[6] else 'To match')])
    rows.append([mut('30 Sep'), '', lead(mut('Reconciled balance')), '', mut(usd(CBZ_SEP)), ''])
    cols = [('Date', ''), ('Number', ''), ('What', 'fillw'), ('Amount', 'num'), ('Balance', 'num'), ('Statement', '')]
    t_in = sum((t[5] for t in CBZ_TX if t[5] > 0), Decimal('0'))
    t_out = -sum((t[5] for t in CBZ_TX if t[5] < 0), Decimal('0'))
    f = foot('12 entries since 30 Sep', (('In', usd(t_in)), ('Out', usd(t_out))), pages_btns())
    left = (rec_head('CBZ current, USD', '<span class="pill pill-warn">4 to match</span>', 'Bank account · ending 4471')
            + tabs([('Transactions', 12), ('Statement lines', 15), ('Reconciliations', 9)], 0)
            + tools('Search transactions', (('Dates', 'Since 30 Sep', True),), '12 entries', btn('Export', 'export'))
            + sheet(tbl(cols, rows), f))
    side = rail_(rsec('In the books', (('Statement, 16 Oct', usd(STMT_CLOSE)), ('Difference', usd(STMT_CLOSE - CBZ_BOOK)), ('Last reconciled', '30 Sep')), figure=usd(CBZ_BOOK), num=True)
                 + rsec('Details', (('Bank', 'CBZ, Samora Machel Ave'), ('Number', '<span class="mono">••• 4471</span>'), ('Ledger account', ref('1010')), ('Statements', 'CSV, weekly'))), 340)
    return page('BkAccount', 'CBZ current, USD', '/books/accounts/cbz-usd', 'Accounts', split(left, side), RECORD_BANK + primary('Upload a statement', 'upload', 'U'),
                icon='bank', heading=crumb('Accounts', 'CBZ current, USD'), h=1000)


def to_match():
    cols = [('', 'sel'), ('Date', ''), ('Statement line', ''), ('Amount', 'num'), ('Vane’s proposal', 'fillw'), ('', '')]
    rows = []
    for i, (d, line, amt, prop, kind, why) in enumerate(MATCH_LINES):
        if prop:
            acts = '<div class="bk-rowacts">%s%s</div>' % (btn('Accept', 'check'), more_btn('Choose or exclude'))
            pv = '<div class="bk-prop">%s<span class="cell-lead"><span>%s</span></span><span class="sub">%s</span></div>' % (vmark(14), prop, why)
        else:
            acts = '<div class="bk-rowacts">%s%s</div>' % ('<button class="btn" aria-haspopup="menu" aria-expanded="true">%sCreate%s</button>' % (ic('plus'), ic('down')), more_btn('Exclude'))
            pv = '<div class="bk-prop"><span></span><span class="cell-lead muted">No match</span><span class="sub">%s</span></div>' % why
        rows.append([cbx(i < 3, 'Select the line from %s' % d), mut(d), lead(line), usd(amt, True), pv, acts])
    tb = tbl(cols, rows, sel_rows=(0, 1, 2)).replace('<td class="fill bk-fw">', '<td class="fill bk-fw" style="padding-top:14px;padding-bottom:14px">')
    menu = ('<div class="menu bk-menu" style="right:60px;top:296px;width:236px;z-index:40"><div class="menu-label">Create from this line</div>'
            '<button class="menu-item">%sPayment received</button><button class="menu-item">%sPayment made</button>'
            '<button class="menu-item" data-active="true">%sBank charge<span class="end muted" style="font-size:12px">6420</span></button><button class="menu-item">%sTransfer</button></div>') % (
        ic('payments'), ic('expenses'), ic('bank2'), ic('move'))
    sel3 = sum((l[2] for l in MATCH_LINES[:3]), Decimal('0'))
    sel = selbar(3, (('Net', usd(sel3, True)),), btn('Accept 3', 'check', 'btn', 'A') + btn('Exclude', 'x'))
    t_in = sum((l[2] for l in MATCH_LINES if l[2] > 0), Decimal('0'))
    t_out = -sum((l[2] for l in MATCH_LINES if l[2] < 0), Decimal('0'))
    f = foot('4 lines to match', (('In', usd(t_in)), ('Out', usd(t_out))), mut('Statement to Fri 16 Oct'), sel=sel)
    main = (finding('4 lines on CBZ’s statement are still to match.', 'Vane proposed a match for 3.')
            + tabs([('To match', 4), ('Matched', 61), ('Excluded', 2), ('Everything', 67)], 0)
            + tools('Search lines', (('Account', 'CBZ current, USD', True),), '4 lines', btn('Accept Vane’s 3', 'check') + btn('Export', 'export'))
            + '<div style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column">%s%s</div>' % (sheet(tb, f), menu))
    return page('BkToMatch', 'To match', '/books/bank', 'To match', main, primary('Upload a statement', 'upload', 'U'))


def to_match_phone():
    def card(d, line, amt, prop, why):
        acts = '<div style="display:flex;gap:8px">%s%s</div>' % (btn('Accept', 'check', 'btn btn-lg'), btn('Choose', 'list', 'btn btn-lg btn-quiet'))
        pv = '<div class="bk-prop" style="font-size:14px">%s<span class="cell-lead" style="color:var(--color-ink)"><span>%s</span></span><span class="sub">%s</span></div>' % (vmark(14), prop, why)
        return ('<div class="bk-card" style="gap:12px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline"><b style="font-size:15px;font-weight:600;color:var(--color-ink)">%s</b><b class="mono" style="font-size:15px">%s</b></div>'
                '<span class="muted" style="font-size:13px;margin-top:-8px">%s</span>%s%s</div>') % (line, usd(amt, True), d, pv, acts)
    cards = ''.join(card(d, l, a, p, w) for d, l, a, p, k, w in MATCH_LINES[:2]) + '<div class="muted" style="font-size:14px;text-align:center;padding:4px 0">2 more lines</div>'
    body = ('<div class="bk-ph"><header>%s<b>To match</b>%s</header>'
            '<div style="padding:20px 16px;display:flex;flex-direction:column;gap:16px;overflow:hidden;flex:1">'
            '<div><div style="font-size:22px;font-weight:600;color:var(--color-ink)">4 lines to match</div><div class="muted" style="font-size:13px;margin-top:4px">CBZ current, USD · to 16 Oct</div></div>'
            '%s</div>'
            '<div style="padding:12px 16px 24px;box-shadow:inset 0 1px 0 var(--color-line);display:flex;gap:8px;align-items:center;flex:none"><span class="muted" style="font-size:13px;flex:1">Vane proposed 3</span>%s</div></div>') % (
        iconbtn('back', 'Back to Books'), iconbtn('upload', 'Upload a statement'), cards, btn('Accept Vane’s 3', 'check', 'btn btn-primary btn-lg'))
    return write(ROOT, 'BkToMatchPhone', 'Books · To match, on Rudo’s phone', body, w=390, h=844, css=CSS)


def reconciliation():
    recs = [('CBZ current, USD', '1 to 16 Oct', usd(STMT_CLOSE), '4', usd(STMT_CLOSE - CBZ_BOOK), 'Open'),
            ('CBZ current, ZWG', '1 to 16 Oct', zig(M('61280.40')), '0', zig(0), 'Ready')]
    rows = [[lead(a, 'Statement ' + p), mut(c), u if u != '0' else mut('0'), ('<b style="color:var(--color-ink)">%s</b>' % d) if s == 'Open' else mut(d),
             st('Open') if s == 'Open' else status('Ready to close', 'success')] for a, p, c, u, d, s in recs]
    tb = tbl([('Account', 'fillw'), ('Closing balance', 'num'), ('Unmatched', 'num'), ('Difference', 'num'), ('State', '')], rows, rowcls={0: 'bk-sel'})
    f = foot('2 open', (('Closed this year', '19'),))
    left = (finding('CBZ current, USD is %s out.' % usd(STMT_CLOSE - CBZ_BOOK), 'CBZ current, ZWG is ready to close.')
            + tabs([('Open', 2), ('Closed', 19)], 0)
            + tools('Search reconciliations', (('Account', 'Any', False),), '2 open', btn('Export', 'export'))
            + sheet(tb, f))
    # The selected reconciliation: its four figures, then what clears the difference, then Close (off until it is 0.00).
    acts = '<div class="bk-racts" style="margin-top:4px">%s<button class="btn" disabled aria-disabled="true" style="opacity:.45">%sClose%s</button></div>' % (
        btn('Open To match', 'match'), ic('check'), kbd('Ctrl ↵'))
    side = rail_(rsec('CBZ current, USD', (('Statement, 16 Oct', n2(STMT_CLOSE)), ('In the books', n2(CBZ_BOOK)), ('Unmatched, 4 lines', n2(UNMATCHED_SUM)), ('Difference', '<b>%s</b>' % n2(STMT_CLOSE - CBZ_BOOK))),
                      end='<span class="pill pill-info">Open</span>', num=True)
                 + rsec('What clears it', (('Transfer, EcoCash', n2(800)), ('IMTT', n2(-23.69)), ('CBZ fee', n2(-18))), num=True, after=acts), 380)
    return page('BkReconciliation', 'Reconciliations', '/books/reconciliations', 'Reconciliations', split(left, side), primary('Start a reconciliation', 'plus', 'N'))


# =====================================================================
# Tax
# =====================================================================
def tax_due():
    # The three month calendars are gone: the table is the calendar, a row per date. The period sits under each line.
    cols = [('Date', ''), ('What', 'fillw'), ('Amount', 'num'), ('Settled by', ''), ('State', '')]
    def w(text, period, fl=''):
        return lead(text + (' ' + fl if fl else ''), period)
    rows = [
        grp('October', '4 done', 5),
        [mut('Thu 15 Oct'), w('Pay VAT', 'September'), usd(VAT_SEP), ref('PAY-0061') + mut(', 14 Oct'), st('Paid')],
        [mut('Sat 10 Oct'), w('File the VAT 7 return', 'September'), usd(VAT_SEP), mut('TaRMS, 9 Oct'), st('Filed')],
        [mut('Sat 10 Oct'), w('Pay PAYE and AIDS levy, and NSSA', 'September'), usd(M('648.40') + to_usd(M('7654.50'))), ref('PAY-0059') + ', ' + ref('PAY-0060'), st('Paid')],
        [mut('Mon 5 Oct'), w('File the PAYE return', 'September'), usd(M('648.40')), mut('TaRMS, 2 Oct'), st('Filed')],
        grp('November', '6 due', 5),
        [mut('Thu 5 Nov'), w('File the PAYE return', 'October'), usd(PAYE_OCT), mut('Pay run, from 25 Oct'), st('Due')],
        [mut('Thu 5 Nov'), w('File the 30% withholding return', 'October'), usd(WHT), mut('If PAY-0062 is paid'), st('Due')],
        [mut('Tue 10 Nov'), w('Pay PAYE and AIDS levy, NSSA, ZIMDEF', 'October'), usd(PAYE_OCT + NSSA_OCT + ZIMDEF_OCT), mut('3 payments'), st('Due')],
        [mut('Tue 10 Nov'), w('Pay the 30% withheld', 'October'), usd(WHT), mut('A payment to ZIMRA'), st('Due')],
        [mut('Tue 10 Nov'), w('File the VAT 7 return', 'October, so far'), usd(VAT_OCT), mut('Draft return'), st('Draft')],
        [mut('Sun 15 Nov'), w('Pay VAT', 'October · a Sunday', flag()), usd(VAT_OCT), mut('A payment to ZIMRA'), st('Due')],
        grp('December', '1 due', 5),
        [mut('Sun 20 Dec'), w('Provisional tax, 4th instalment', '2026 · 35% of the year', flag()), usd(QPD4), mut('A payment to ZIMRA'), st('Due')],
    ]
    f = foot('7 due by 20 Dec', (('To pay in November', usd(NOV_PAY)), ('December', usd(QPD4))))
    main = (finding('Next: the PAYE and withholding returns on 5 November.', '%s is due in November.' % usd(NOV_PAY))
            + tools('Search what’s due', (('Tax', 'All', False), ('Months', 'Oct to Dec', True)), '11 dates', btn('Add to my calendar', 'calendar') + more_btn('Export'))
            + sheet(tbl(cols, rows), f))
    return page('BkTaxDue', 'What’s due', '/books/tax', "What's due", main, btn('Set the dates', 'gear'))


def tax_due_phone():
    def item(date, what, amt, note, fl=False):
        return ('<div style="display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:12px;align-items:start;padding:14px 0;box-shadow:inset 0 -1px 0 var(--color-line)">'
                '<div style="text-align:center;border-radius:8px;box-shadow:var(--shadow-ring);padding:6px 0"><div class="muted" style="font-size:11px">%s</div><div style="font-size:18px;font-weight:600;color:var(--color-ink)">%s</div></div>'
                '<div><b style="font-size:15px;font-weight:600;color:var(--color-ink);line-height:20px">%s</b><div class="muted" style="font-size:13px;margin-top:2px">%s</div>%s</div>'
                '<b class="mono" style="font-size:14px;color:var(--color-ink);line-height:20px">%s</b></div>') % (date[0], date[1], what, note, '<div style="margin-top:6px">%s</div>' % flag() if fl else '', amt)
    items = (item(('Nov', '5'), 'PAYE and withholding returns', usd(PAYE_OCT), 'October · Rudo files them')
             + item(('Nov', '10'), 'Pay PAYE, NSSA, ZIMDEF', usd(PAYE_OCT + NSSA_OCT + ZIMDEF_OCT), 'October’s pay run')
             + item(('Nov', '10'), 'Pay the 30% withheld', usd(WHT), 'If Mutare Timber Works is paid')
             + item(('Nov', '10'), 'File the VAT 7 return', usd(VAT_OCT), 'October, so far')
             + item(('Nov', '15'), 'Pay VAT', usd(VAT_OCT), 'A Sunday', True)
             + item(('Dec', '20'), 'Provisional tax, 35%', usd(QPD4), '4th instalment for 2026', True))
    body = ('<div class="bk-ph"><header>%s<b>What’s due</b>%s</header>'
            '<div style="padding:20px 16px;display:flex;flex-direction:column;gap:4px;overflow:hidden;flex:1">'
            '<div style="font-size:22px;font-weight:600;color:var(--color-ink);line-height:1.25">%s to pay in November</div><div class="muted" style="font-size:13px">Next 2 months</div>'
            '<div style="margin-top:12px">%s</div></div></div>') % (iconbtn('back', 'Back to Books'), iconbtn('calendar', 'Add to my calendar'), usd(NOV_PAY), items)
    return write(ROOT, 'BkTaxDuePhone', 'Books · What’s due, on James’s phone', body, w=390, h=844, css=CSS)


def vat_return():
    # The stepper repeats the tabs and the tie-out moves to the footer, so the return reads as one table.
    cols = [('Line', 'fillw'), ('Documents', 'num'), ('Value', 'num'), ('VAT', 'num')]
    def line(a, docs, gross, sign, muted=False):
        v, t = vat_line(gross, sign)
        d = docs if '<' in docs else mut(docs)
        return [lead(mut(a) if muted else a), d, mut(n2(v)), mut('(%s)' % n2(t)) if muted else n2(t)]
    def total(label, v):
        return tot(['<td class="fill">%s</td>' % label, '<td class="num"></td>', '<td class="num"></td>', '<td class="num">%s</td>' % n2(v)])
    rows = [grp('Output VAT', '', 4)] + [line(*r) for r in OUT_ROWS]
    rows += [[lead('Zero-rated and exempt sales'), mut('None'), mut('0.00'), '0.00'], total('Output VAT', OUT_VAT), grp('Input VAT', '', 4)]
    rows += [line(*r) for r in IN_ROWS]
    rows += [[lead('Less debit notes'), mut('None'), mut('0.00'), '0.00'], line('Bills not yet checked on FDMS, not claimed', '3 bills', NOT_CHECKED, 1, True)]
    rows += [total('Input VAT', IN_VAT), grp('Withheld', '', 4), [lead('VAT withheld by our customers'), mut('None'), '', '0.00']]
    tb = tbl(cols, rows, total=['Net VAT due to ZIMRA', '', '', n2(VAT_OCT)])
    bar = ('<div class="ws-tools">%s<span class="ws-n">October 2026 · gathered at 06:00</span><div class="end">%s</div></div>') % (
        seg(['All in USD', 'USD documents', 'ZiG documents']), btn('VAT 7 working schedule', 'export'))
    f = foot('659 documents', (('Output', usd(OUT_VAT)), ('Input', usd(IN_VAT)), ('Net', usd(VAT_OCT))),
             status('Ties to the ledger, difference 0.00', 'success'))
    main = (finding('October’s VAT stands at %s so far.' % usd(VAT_OCT), 'Return by 10 November, payment by 15 November.')
            + tabs([('Draft', 1), ('Reviewed', 0), ('Finalised', 0), ('Filed', 7)], 0)
            + bar + sheet(tb, f))
    return page('BkVatReturn', 'VAT returns', '/books/vat', 'VAT returns', main, btn('Send for review', 'send') + primary('Refresh the figures', 'arrow', 'R'))


def withholding():
    # Six columns: the ITF263 state sits under the supplier, the year-to-date and net columns go.
    W = [('18 Oct', 'PAY-0062', 'Mutare Timber Works', M('1859.55'), 'To approve'),
         ('14 Aug', 'PAY-0038', 'Mutare Timber Works', M('2080'), 'Paid')]
    cols = [('', 'sel'), ('Payment', ''), ('Supplier', 'fillw'), ('Gross', 'num'), ('Withheld, 30%', 'num'), ('State', '')]
    rows = [[cbx(), lead(ref(p), d), lead(s, 'ITF263 expired 30 Jun'), mut(n2(g)), n2(M(g * Decimal('0.30'))), st(ps)] for d, p, s, g, ps in W]
    withheld = sum((M(w[3] * Decimal('0.30')) for w in W), Decimal('0'))
    f = foot('2 payments this year', (('Withheld', usd(withheld)), ('Waiting to be paid', usd(WHT))), btn('Make the October return', 'docs'))
    main = (finding('%s will be withheld from Mutare Timber Works.' % usd(WHT), 'Its ITF263 expired on 30 June.')
            + tabs([('Withheld, 30%', 2), ('VAT withheld', 0), ('Rent and non-resident', 0), ('Certificates', 1), ('Returns', 10)], 0)
            + tools('Search withholding', (('Dates', 'This year', True), ('Supplier', 'Any', False)), '2 payments', btn('Export', 'export'))
            + sheet(tbl(cols, rows), f))
    return page('BkWithholding', 'Withholding', '/books/withholding', 'Withholding', main, primary('Pay the withheld tax', 'payments', 'P'))


def provisional():
    parts = [('1st', 'Wed 25 Mar', 10, 'PAY-0012', 'Paid'), ('2nd', 'Thu 25 Jun', 25, 'PAY-0027', 'Paid'),
             ('3rd', 'Fri 25 Sep', 30, 'PAY-0049', 'Paid'), ('4th', 'Sun 20 Dec', 35, '', 'Due')]
    rows = [[lead(nm + ' instalment'), mut(d) + (' ' + flag() if nm == '4th' else ''), mut('%d%%' % pct), n2(TAX_YEAR * pct / 100), ref(p) if p else mut('—'), st(s)]
            for nm, d, pct, p, s in parts]
    paid = TAX_YEAR * Decimal('0.65')
    tb = tbl([('Instalment', ''), ('Date', 'fill'), ('Share', 'num'), ('Amount', 'num'), ('Paid by', ''), ('State', '')], rows,
             total=['4 instalments', '', '100%', n2(TAX_YEAR), '', ''])
    f = foot('Year to 31 Dec 2026', (('Paid', usd(paid)), ('Still due', usd(TAX_YEAR - paid))), btn('Export', 'export'))
    side = rail_(rsec('The estimate', (('Worked from', 'Income of about US$35,000'), ('Rates', '25%, and 3% AIDS levy'), ('Currency split', 'Off'), ('Last revised', '18 Sep, James')),
                      figure=usd(TAX_YEAR), after='<div class="bk-racts">%s</div>' % btn('Revise the estimate', 'edit'))
                 + rsec('Payment dates', end=flag(), after='<div class="bk-racts">%s</div>' % btn('Set the dates', 'gear')), 360)
    left = (finding('%s of the year’s %s is paid.' % (usd(paid), usd(TAX_YEAR)), 'The last instalment is due on 20 December.')
            + tabs([('2026', None), ('2025', None)], 0)
            + sheet(tb, f))
    return page('BkProvisionalTax', 'Provisional tax', '/books/provisional-tax', 'Provisional tax', split(left, side), primary('Pay an instalment', 'payments', 'P'))


def fiscal():
    # Six columns: kind under the number, fiscal day under the time, the verification code under FDMS. The banner repeated the finding and the row.
    D = [('INV-0144', 'Tax invoice', 'Westgate Interiors', 122, '16 Oct 16:02', zig(13500), 'Failed', '—'),
         ('CN-0009', 'Credit note', 'Avondale Fresh Mart', 118, '12 Oct 11:40', usd(-640), 'Valid', '9D1E-44B0-C27A-61F3'),
         ('INV-0143', 'Tax invoice', 'Avondale Fresh Mart', 113, '7 Oct 09:05', usd(640), 'Valid', '2B7C-E903-5A1D-8F46'),
         ('INV-0142', 'Tax invoice', 'Pomona Offices', 112, '6 Oct 15:02', usd(1994.22), 'Valid', '4C2A-91F0-7B3D-E615'),
         ('INV-0141', 'Tax invoice', 'Mrs T. Gumbo', 111, '5 Oct 15:40', usd(430), 'Valid', 'A05F-3C82-D91B-77E0'),
         ('INV-0140', 'Tax invoice', 'Borrowdale Brooke Clinic', 109, '3 Oct 11:30', usd(1750), 'Valid', '6E3D-0A9C-B418-2F57'),
         ('CN-0008', 'Credit note', 'Msasa Motors', 108, '2 Oct 14:18', usd(-420), 'Valid', 'F172-8B4E-03CD-9A65'),
         ('CN-0007', 'Credit note', 'Dr N. Sibanda', 108, '2 Oct 10:51', usd(-85), 'Valid', '38A0-D5E1-7C29-B4F8'),
         ('INV-0139', 'Tax invoice', 'Greystone Park Primary', 108, '2 Oct 08:52', usd(2980), 'Valid', 'C3B9-1F60-E28A-5D74')]
    def fd(state, code):
        if code == '—':
            return st(state) + '<span class="sub" style="display:block;font-size:12px;color:var(--color-muted)">Tried 7 times</span>'
        return st(state) + '<span class="sub mono" style="display:block;font-size:12px;color:var(--color-muted)">%s</span>' % code
    rows = [[lead(ref(n), k), lead(c), lead(mut(s), 'Fiscal day %d' % d), a, fd(f_, code),
             btn('Retry', 'arrow', 'btn btn-sm') if f_ == 'Failed' else iconbtn('more', 'More for %s' % n)] for n, k, c, d, s, a, f_, code in D]
    cols = [('Number', ''), ('Customer', 'fill'), ('Sent', ''), ('Amount', 'num'), ('FDMS', ''), ('', '')]
    tb = tbl(cols, rows, rowcls={0: 'bk-sel'}).replace('<td class="fill">', '<td class="fill" style="height:52px">')
    f = foot('1 to 9 of 1,512', (('Valid', '1,511'), ('Failed', '1')), pages_btns())
    main = (finding('Fiscal day 124 is open with 31 receipts signed.', 'INV-0144 from Friday isn’t signed.')
            + tabs([('Documents', '1,512'), ('Fiscal days', 124), ('Failed', 1)], 0)
            + tools('Search fiscal documents', (('Kind', 'All', False), ('FDMS', 'Any', False)), '1,512 documents', btn('Export', 'export'))
            + sheet(tb, f))
    return page('BkFiscal', 'Fiscal register', '/books/fiscal', 'Fiscal register', main, primary('Retry the failed', 'arrow', 'R'))


# =====================================================================
# Close the month
# =====================================================================
def close():
    # Two groups: what is still open (with its one action), then what passed. No chips bar, no hints.
    open_ = [('no', 'Drafts older than the month', '2 September journals, %s' % usd(1140), btn('Journals', 'chev')),
             ('no', 'Revaluation posted', 'Rate 26.80 is in; not posted', btn('Post it', 'chev'))]
    passed = [('ok', 'Nothing in Needs posting', 'None for September', ''),
              ('ok', 'No fiscal document failed', 'All 412 September documents Valid', ''),
              ('ok', 'Every money account reconciled', '6 of 6, to 30 Sep', ''),
              ('ok', 'Floats counted', 'Petty cash and site float, 30 Sep', ''),
              ('ok', 'No requisition out over 30 days', 'None', ''),
              ('ok', 'Bills with an FTI checked on FDMS', 'All dated September', ''),
              ('ok', 'Payroll for the month posted', 'Posted 25 Sep', ''),
              ('ok', 'VAT return tied out', 'Filed 9 Oct, difference 0.00', ''),
              ('ok', 'Trial balance balances', '%s on each side' % usd(TB_TOTAL), '')]
    def rows(items):
        return ''.join('<div class="bk-chk">%s<span class="lead">%s</span><span>%s</span><span class="end">%s</span></div>' % (tick(s), a, b, c) for s, a, b, c in items)
    def gh(title, n):
        return '<div class="bk-chk" style="min-height:0;padding-top:10px;padding-bottom:10px;background:var(--color-ground);font-size:13px"><span></span><span class="lead" style="font-weight:600">%s <span class="muted" style="font-weight:400;margin-left:4px">%s</span></span><span></span><span></span></div>' % (title, n)
    foot_ = '<div class="foot-row" style="box-shadow:inset 0 1px 0 var(--color-line)"><span>11 checks</span>%s%s<div class="end">%s</div></div>' % (
        fsum('Passed', '9'), fsum('Open', '2'), disabled_primary('Close September', 'done', 'Ctrl ↵'))
    left = (finding('September can’t close yet: 2 of 11 checks are open.', 'October is open and taking postings.')
            + tabs([('This month', None), ('All months', 8)], 0)
            + '<div style="flex:1;min-height:0;overflow:auto">%s%s%s%s</div>' % (gh('Open', 2), rows(open_), gh('Passed', 9), rows(passed)) + foot_)
    side = rail_(rsec('Locks', (('Freeze before', '<b style="color:var(--color-ink)">1 Sep 2026</b>'), ('Set by', 'James Nyabadza, 2 Oct'), ('After closing', 'Managers post, with a reason')),
                      after='<div class="bk-racts">%s</div>' % btn('Freeze before…', 'lock'))
                 + rsec('Closed months', (('August 2026', 'Closed 2 Oct'), ('July 2026', 'Closed 6 Aug'), ('June 2026', 'Closed 3 Jul')),
                        after='<div class="bk-racts">%s</div>' % btn('Reopen August', 'back')), 340)
    return page('BkClose', 'Checklist', '/books/periods', 'Checklist', split(left, side), '', icon='done', heading='Close the month')


def needs_posting():
    # One row, opened: the fix on the left, the tries on the right. The plain-words paragraph and the try log go to the explainer.
    cols = [('Document', 'fillw'), ('Since', ''), ('Amount', 'num'), ('Why it didn’t post', ''), ('', '')]
    rows = [[lead(ref('GRN-0045') + ' Tile Trader Zimbabwe', 'Goods received, skirting and trims'), mut('16 Oct 14:20'), usd(367.20),
             '<span style="color:var(--color-ink)">No stock account for skirting and trims</span>', btn('Retry', 'arrow', 'btn btn-sm')]]
    tb = tbl(cols, rows, rowcls={0: 'bk-sel'})
    ex = ('<div class="bk-map"><div><div class="bk-h3">Map the missing account</div>'
          '<div class="bk-fld"><span class="bk-lab">Stock account for Skirting and trims</span><span class="selbox"><span>1200 Stock</span>%s</span></div>'
          '<span class="muted" style="font-size:13px;margin-top:-4px">The other flooring categories use it</span>'
          '<div style="display:flex;gap:8px;margin-top:4px">%s%s</div></div>'
          '<div><div class="bk-h3">Tries</div><dl class="attrs"><dt>First</dt><dd>16 Oct 14:20</dd><dt>Last</dt><dd>Today 06:00</dd><dt>Tries</dt><dd>9</dd><dt>Next</dt><dd>Tomorrow 06:00</dd></dl></div></div>') % (
        ic('down'), ink('Map and retry', 'check', 'Ctrl ↵'), btn('Make a new account', 'plus', 'btn btn-quiet'))
    f = foot('1 failed', (('Amount', usd(367.20)), ('Month held up', 'October')))
    main = (finding('1 money event didn’t reach the ledger.', 'It holds up October’s close.')
            + tabs([('Failed', 1), ('Waiting', 0)], 0)
            + tools('Search events', (('Source', 'Any', False),), '1 event', btn('Export', 'export'))
            + sheet(tb, f, after=ex))
    return page('BkNeedsPosting', 'Needs posting', '/books/needs-posting', 'Needs posting', main, primary('Retry all', 'arrow', 'R'))


RATES = [('Sat 18 Oct', '27.00', 'RBZ interbank', '06:00', 'Automatic'), ('Fri 17 Oct', '26.99', 'RBZ interbank', '06:00', 'Automatic'),
         ('Thu 16 Oct', '26.98', 'RBZ interbank', '06:00', 'Automatic'), ('Wed 15 Oct', '26.98', 'RBZ interbank', '06:00', 'Automatic'),
         ('Tue 14 Oct', '27.00', 'RBZ interbank', '06:00', 'Automatic'), ('Mon 13 Oct', '26.96', 'RBZ interbank', '06:00', 'Automatic'),
         ('Sun 12 Oct', '26.95', 'Manual', '09:12', 'Rudo Mapfumo, feed down'), ('Sat 11 Oct', '26.95', 'RBZ interbank', '06:00', 'Automatic'),
         ('Wed 30 Sep', '26.80', 'RBZ interbank', '06:00', 'Automatic, month end')]
REVAL = [('CBZ current, ZWG', M('52140.00'), M('1953.56')), ('NSSA owed, September', M('-7654.50'), M('-287.55'))]

def rates():
    rows = [[mut(d), '<span class="mono" style="color:var(--color-ink)">%s</span>' % r, '<span class="pill pill-n">Manual, %s</span>' % t if s == 'Manual' else mut('%s, %s' % (s, t)), mut(b), iconbtn('more', 'More')] for d, r, s, t, b in RATES]
    tb = tbl([('Date', ''), ('USD to ZiG', 'num'), ('Source', ''), ('By', 'fillw'), ('', '')], rows)
    f = foot('9 of 232 days', (('Today uses', '27.00'),), pages_btns())
    gls = [to_usd(z, RATE_SEP) - b for a, z, b in REVAL]
    gl = sum(gls, Decimal('0'))
    side = rail_(rsec('September’s revaluation', (('At 30 Sep', '26.80'), ('CBZ current, ZWG', n2(gls[0])), ('NSSA owed', n2(gls[1])), ('Reverses', '1 Oct')),
                      figure=usd(gl), num=True,
                      after='<div class="bk-racts">%s%s</div>' % (btn('Post the revaluation', 'check', 'btn', 'Ctrl ↵'), more_btn('See the lines'))), 360)
    left = (finding('Today’s documents use 27.00, RBZ’s rate at 06:00.', 'Each document keeps the rate of its own day.')
            + tabs([('Rates', None), ('Revaluation', None)], 0)
            + tools('Search rates', (('Currency', 'ZiG', True),), '232 days', btn('Export', 'export'))
            + sheet(tb, f))
    return page('BkRates', 'Rates & revaluation', '/books/rates', 'Rates & revaluation', split(left, side), primary('Enter a rate', 'plus', 'N'))


def year_end():
    # Four columns; the tick repeated the state. Six steps need no search.
    steps = [('Close December', 'The month-end checklist', 'After 31 Dec', 'Not yet'),
             ('Revalue ZiG balances', 'At the 31 Dec rate', '31 Dec', 'Not yet'),
             ('Pay the 4th provisional tax', usd(QPD4) + ', 35% of the estimate', '20 Dec', 'Due'),
             ('Post the closing entry', 'The year’s profit to 3200', 'After December', 'Not yet'),
             ('Send the year to your accountant', 'The accountant export', 'January', 'Not yet'),
             ('File the income tax return, ITF12C', 'Your accountant files it in TaRMS', '30 Apr 2027', 'Not yet')]
    rows = [[lead(a), mut(b), mut(w), st(s)] for a, b, w, s in steps]
    tb = tbl([('Step', ''), ('What it does', 'fillw'), ('When', ''), ('State', '')], rows)
    f = foot('6 steps', (('Done', '0'), ('Year ends', '31 Dec 2026')), btn('Accountant export', 'export'))
    side = rail_(rsec('Financial year', (('This year', '1 Jan to 31 Dec 2026'), ('Books start', '1 Mar 2026'), ('Retained earnings', ref('3200')), ('Closing entry by', 'Owner or accountant')),
                      after='<div class="bk-racts">%s</div>' % btn('Open Money and tax', 'link')), 340)
    left = (finding('The year ends on Thursday 31 December, in 74 days.', 'Six steps take the books there.')
            + sheet(tb, f))
    return page('BkYearEnd', 'Year end', '/books/year-end', 'Year end', split(left, side), '')


# =====================================================================
# Ledger
# =====================================================================
JOURNALS = [('', '17 Oct', 'Accrual, Pomona Offices fitting labour', 'Manual', 1450.00, 'To approve', 'Rudo Mapfumo'),
            ('', '30 Sep', 'Month-end payroll accrual', 'Manual', 980.00, 'Draft', 'Rudo Mapfumo'),
            ('', '30 Sep', 'Van fuel, September', 'Manual', 160.00, 'Draft', 'Rudo Mapfumo'),
            ('JE-0486', '18 Oct', 'Tender sales, 17 Oct', 'Retail sale', 1286.40, 'Posted', 'Books'),
            ('JE-0485', '16 Oct', 'REC-0094, Westgate Interiors', 'Payment received', 500.00, 'Posted', 'Books'),
            ('JE-0484', '16 Oct', 'INV-0144, Westgate Interiors', 'Sales invoice', 500.00, 'Posted', 'Books'),
            ('JE-0483', '16 Oct', 'Tender sales, 15 Oct', 'Retail sale', 1102.80, 'Posted', 'Books'),
            ('JE-0482', '15 Oct', 'REC-0093, Mrs R. Chuma', 'Payment received', 250.00, 'Posted', 'Books'),
            ('JE-0481', '14 Oct', 'PAY-0061, ZIMRA, VAT September', 'Payment made', 1184.60, 'Posted', 'Books'),
            ('JE-0480', '14 Oct', 'Tender sales, 13 Oct', 'Retail sale', 968.20, 'Posted', 'Books')]

def journals_main():
    rows = [[cbx(), ref(n) if n else mut('No number yet'), mut(d), lead(m, s), usd(a), st(t)] for n, d, m, s, a, t, b in JOURNALS]
    tb = tbl([('', 'sel'), ('Number', ''), ('Date', ''), ('Memo', 'fill'), ('Amount', 'num'), ('State', '')], rows).replace('<td class="fill">', '<td class="fill" style="height:52px">')
    f = foot('1 to 10 of 489', (('Drafts', usd(1140)), ('To approve', usd(1450))), pages_btns())
    return (finding('2 September journals are still drafts.', '1 more waits for a second person.')
            + tabs([('All', 489), ('Drafts', 2), ('To approve', 1), ('Posted', 484), ('Reversed', 2)], 0)
            + tools('Search journals', (('Sort', 'Needs you first', True), ('Source', 'Any', False)), '489 journals', btn('Export', 'export'))
            + sheet(tb, f))

def journals():
    return page('BkJournals', 'Journals', '/books/journals', 'Journals', journals_main(), primary('New journal', 'plus', 'N'))

def journal_new():
    lines = [('5100', 'Materials', 'Pomona Offices', '240.00', ''), ('5100', 'Materials', 'General', '', '240.00')]
    le = ''.join(('<tr><td><span class="selbox" style="width:180px"><span>%s %s</span>%s</span></td><td><span class="selbox" style="width:150px"><span>%s</span>%s</span></td>'
                  '<td class="num"><span class="bk-in" style="justify-content:flex-end;width:84px">%s</span></td><td class="num"><span class="bk-in" style="justify-content:flex-end;width:84px">%s</span></td></tr>') % (
        c, a, ic('down'), cc, ic('down'), d or '<span class="faint">0.00</span>', cr or '<span class="faint">0.00</span>') for c, a, cc, d, cr in lines)
    lt = ('<table class="table" style="font-size:14px"><thead><tr><th>Account</th><th>Cost centre</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>%s'
          '<tr><td colspan="4">%s</td></tr></tbody><tfoot><tr class="tot"><td>Totals</td><td><span class="status status-success" style="font-weight:400">Balanced</span></td><td class="num">240.00</td><td class="num">240.00</td></tr></tfoot></table>') % (
        le.replace('<td>', '<td style="height:52px">').replace('<td class="num">', '<td class="num" style="height:52px">'), btn('Add a line', 'plus', 'btn btn-quiet btn-sm'))
    fields = ('<div style="display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px">'
              '<div class="bk-fld"><span class="bk-lab">Date</span><span class="bk-in">18 Oct 2026</span></div>'
              '<div class="bk-fld"><span class="bk-lab">Memo</span><span class="bk-in">Adhesive for the Pomona job, moved to its cost centre</span></div></div>'
              '<div style="display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px">'
              '<div class="bk-fld"><span class="bk-lab">Currency</span><span class="selbox"><span>USD</span>%s</span></div>'
              '<div class="bk-fld"><span class="bk-lab">Attachment <span class="muted" style="font-weight:400">optional</span></span><span class="bk-in ph">%s&nbsp;Add the slip or a note</span></div></div>') % (ic('down'), ic('upload'))
    drawer = ('<div class="over"></div><aside class="drawer" aria-label="New journal" style="width:640px"><div class="drawer-h"><span>New journal</span>%s</div>'
              '<div class="drawer-b" style="gap:24px">%s<div style="margin:0 -24px">%s</div>'
              '<span class="muted" style="font-size:13px">Over %s, a second person approves it.</span></div>'
              '<div class="drawer-f">%s%s</div></aside>') % (
        iconbtn('x', 'Close'), fields, lt, usd(1000), btn('Save as draft', 'docs'), btn('Post this journal', 'check', 'btn btn-primary', 'Ctrl ↵'))
    # Under the drawer the page's New journal is plain, so the drawer holds the one primary.
    return page('BkJournalNew', 'New journal', '/books/journals?new', 'Journals', journals_main(), btn('New journal', 'plus', 'btn', 'N'), extra=drawer, heading='Journals')


# Trial balance at 30 Sep (before the revaluation); 1500 balances it
TB = [('1010', 'CBZ current, USD', 'Asset', CBZ_SEP, 0), ('1011', 'CBZ current, ZWG', 'Asset', M('1953.56'), 0), ('1020', 'EcoCash merchant', 'Asset', M('1240.30'), 0),
      ('1030', 'Showroom cash box', 'Asset', M('380.00'), 0), ('1040', 'Showroom petty cash', 'Asset', M('200.00'), 0), ('1041', 'Site float, Farai Ncube', 'Asset', M('100.00'), 0),
      ('1100', 'Owed to you', 'Asset', M('6850.00'), 0), ('1160', 'Deposits paid to suppliers', 'Asset', M('1200.00'), 0), ('1200', 'Stock', 'Asset', M('18420.00'), 0),
      ('1500', 'Vans and equipment', 'Asset', None, 0), ('2000', 'You owe suppliers', 'Liability', 0, M('5212.40')), ('2110', 'PAYE and AIDS levy owed', 'Liability', 0, M('648.40')),
      ('2120', 'NSSA owed', 'Liability', 0, M('287.55')), ('2200', 'Output VAT', 'Liability', 0, M('3307.70')), ('2210', 'Input VAT', 'Asset', M('2123.10'), 0),
      ('2300', 'Vehicle loan, CBZ', 'Liability', 0, M('15000.00')), ('3000', 'Owner’s capital', 'Equity', 0, M('10000.00')), ('3200', 'Retained earnings', 'Equity', 0, M('29640.00')), ('4000', 'Flooring jobs', 'Income', 0, M('96420.00')),
      ('4100', 'Showroom sales', 'Income', 0, M('58312.00')), ('5000', 'Materials used', 'Cost of sales', M('71880.00'), 0), ('6110', 'Wages and salaries', 'Expense', M('57820.00'), 0),
      ('6200', 'Rent', 'Expense', M('7200.00'), 0), ('6300', 'Van fuel', 'Expense', M('3140.00'), 0), ('6420', 'Bank charges and IMTT', 'Expense', M('1284.60'), 0), ('6500', 'Other expenses', 'Expense', M('2410.00'), 0)]
_cr = sum((M(r[4]) for r in TB), Decimal('0'))
_dr = sum((M(r[3]) for r in TB if r[3] is not None), Decimal('0'))
TB = [(c, a, t, (_cr - _dr) if d is None else M(d), M(k)) for c, a, t, d, k in TB]
TB_TOTAL = _cr

def trial_balance():
    rows = [[ref(c), lead(a), mut(t), n2(d, True), n2(k, True), '<span class="faint">%s</span>' % ic('chev')] for c, a, t, d, k in TB]
    tb = tbl([('Code', ''), ('Account', 'fill'), ('Type', ''), ('Debit', 'num'), ('Credit', 'num'), ('', '')], rows, total=['', '26 accounts', '', n2(TB_TOTAL), n2(TB_TOTAL), ''])
    f = foot('26 accounts with a balance', (('Debit', usd(TB_TOTAL)), ('Credit', usd(TB_TOTAL)), ('Difference', '0.00')), btn('Export for your accountant', 'export'))
    main = (finding('The trial balance balances at %s on 30 September.' % usd(TB_TOTAL), 'In USD, the base currency.')
            + chips_bar(seg(['By month', 'Range']), chip('As at', '30 Sep 2026', True), chip('Cost centre', 'All'), chip('Site', 'All'),
                        '<div class="end">%s%s</div>' % (btn('Print', 'print'), more_btn('Hide zero balances')))
            + sheet(tb, f))
    return page('BkTrialBalance', 'Trial balance', '/books/trial-balance', 'Trial balance', main, '', h=1410)


PL = [('Income', None, None), ('Flooring jobs', 13920.00, 96420.00), ('Showroom sales', 8620.00, 58312.00), ('=Income', 22540.00, 154732.00),
      ('Cost of sales', None, None), ('Materials used', 10180.00, 71880.00), ('=Gross profit', 12360.00, 82852.00),
      ('Expenses', None, None), ('Wages and salaries', 7970.00, 57820.00), ('Rent', 1200.00, 7200.00), ('Van fuel', 460.00, 3140.00),
      ('Bank charges and IMTT', 214.30, 1284.60), ('Other expenses', 380.00, 2410.00), ('=Expenses', 10224.30, 71854.60), ('=Profit', 2135.70, 10997.40)]

def financials():
    rows = []
    for a, m, y in PL:
        if m is None:
            rows.append(grp(a, '', 4))
        elif a.startswith('='):
            rows.append(tot(['<td class="fill">%s</td>' % a[1:], '<td class="num">%s</td>' % n2(m), '<td class="num">%s</td>' % n2(y), '<td class="num">%.1f%%</td>' % (100 * m / 22540.00)]))
        else:
            rows.append([lead(a), n2(m), mut(n2(y)), mut('%.1f%%' % (100 * m / 22540.00))])
    tb = tbl([('', 'fill'), ('September 2026', 'num'), ('1 Mar to 30 Sep', 'num'), ('Of September’s income', 'num')], rows)
    f = foot('Profit and loss, USD', (('September', usd(2135.70)), ('Since 1 Mar', usd(10997.40))), btn('Export', 'export') + iconbtn('print', 'Print'))
    main = (finding('September made a profit of %s.' % usd(2135.70), 'Since the books started on 1 March: %s.' % usd(10997.40))
            + tabs([('Profit and loss', None), ('Balance sheet', None), ('Cash flow', None)], 0)
            + chips_bar(chip('Period', 'September 2026', True), chip('Compare', 'Since 1 Mar', True), chip('Cost centre', 'All'), chip('Site', 'All'))
            + sheet(tb, f))
    return page('BkFinancials', 'Financial statements', '/books/financials', 'Financial statements', main, '', h=960)


GL_SEP = [('1 Sep', 'JE-0352', 'Takings banked, 31 Aug', 'Takings', 1188.00, 0), ('4 Sep', 'JE-0358', 'Receipt, Highlands Guest Lodge', 'Payment received', 2340.00, 0),
          ('8 Sep', 'JE-0367', 'Rent September, Kingsway Property', 'Payment made', 0, 1450.00), ('15 Sep', 'JE-0384', 'VAT August, to ZIMRA', 'Payment made', 0, 1161.75),
          ('15 Sep', 'JE-0385', 'IMTT on the VAT payment', 'Bank entry', 0, 23.24), ('25 Sep', 'JE-0402', 'Net pay September, CBZ file for 5 people', 'Payroll', 0, 4366.46),
          ('25 Sep', 'JE-0403', 'IMTT on the pay file', 'Bank entry', 0, 87.33), ('29 Sep', 'JE-0415', 'Dr N. Sibanda, INV-0136, by card', 'Payment received', 1130.00, 0)]

def ledger():
    gl = [(d, e, m, s, M(dr), M(cr)) for d, e, m, s, dr, cr in GL_SEP]
    gl += [(t[0], t[2], t[3], t[4], t[5] if t[5] > 0 else M(0), -t[5] if t[5] < 0 else M(0)) for t in CBZ_TX]
    opening = CBZ_SEP - sum((dr - cr for _, _, _, _, dr, cr in gl[:len(GL_SEP)]), Decimal('0'))
    bal = opening
    rows = [[mut('1 Sep'), '', lead(mut('Opening balance')), '', '', mut(n2(opening))]]
    for d, e, m, s, dr, cr in gl:
        bal += dr - cr
        rows.append([mut(d), ref(e), lead(m, s), n2(dr, True), n2(cr, True), mut(n2(bal))])
    assert bal == CBZ_BOOK
    tdr = sum((r[4] for r in gl), Decimal('0')); tcr = sum((r[5] for r in gl), Decimal('0'))
    tb = tbl([('Date', ''), ('Entry', ''), ('Memo', 'fill'), ('Debit', 'num'), ('Credit', 'num'), ('Balance', 'num')], rows,
             total=['18 Oct', '', 'Closing balance', n2(tdr), n2(tcr), n2(CBZ_BOOK)]).replace('<td class="fill">', '<td class="fill" style="height:52px">')
    f = foot('%d entries' % len(gl), (('Debit', usd(tdr)), ('Credit', usd(tcr)), ('Balance', usd(CBZ_BOOK))), btn('Export', 'export'))
    main = (finding('1010 CBZ current, USD stands at %s today.' % usd(CBZ_BOOK), 'It opened September at %s.' % usd(opening))
            + chips_bar(chip('Account', '1010 CBZ current, USD', True), chip('Dates', '1 Sep to 18 Oct', True), chip('Cost centre', 'All'), '<div class="end">%s</div>' % btn('Print', 'print'))
            + sheet(tb, f))
    return page('BkLedger', 'General ledger', '/books/ledger', 'General ledger', main, '', h=1200)


def chart():
    caret = '<span class="caret">%s</span>' % ic('down')
    rows = []
    def r(level, code, name, typ, tax, bal, state='Active', new=False):
        tag = ' <span class="pill pill-n" style="margin-left:6px">Added by Books</span>' if new else (' <span class="muted" style="margin-left:6px">· inactive</span>' if state == 'Inactive' else '')
        nm = '<span class="lv%d">%s%s%s</span>' % (level, caret if level < 3 else '', name, tag)
        rows.append([ref(code) if code else '', nm, mut(typ), mut(tax), bal])
    r(1, '1000', 'Assets', '', '', '')
    r(2, '1010', 'Bank and cash', '', '', '')
    for c, n, b in (('1010', 'CBZ current, USD', CBZ_BOOK), ('1011', 'CBZ current, ZWG', to_usd(M('61280.40'))), ('1020', 'EcoCash merchant', M('1086.50')),
                    ('1030', 'Showroom cash box', M('642.80')), ('1040', 'Showroom petty cash', M('126.40'))):
        r(3, c, n, 'Bank' if c < '1030' else 'Cash', '—', n2(b))
    r(3, '1099', 'Steward Bank, USD', 'Bank', '—', mut('0.00'), 'Inactive')
    r(2, '1100', 'Owed to you and advances', '', '', '')
    r(3, '1100', 'Customers', 'Receivable', '—', n2(5724.22))
    r(3, '1150', 'Cash advances to staff', 'Asset', '—', n2(95.00), new=True)
    r(3, '1170', 'VAT withheld by customers', 'Asset', '—', n2(0), new=True)
    r(1, '2000', 'Liabilities', '', '', '')
    r(3, '2000', 'You owe suppliers', 'Payable', '—', n2(8077.15))
    r(3, '2010', 'Goods received, not billed', 'Liability', '—', n2(0), new=True)
    r(3, '2180', 'Withholding owed', 'Liability', '—', n2(0), new=True)
    r(3, '2200', 'Output VAT', 'Tax', 'VAT15.5', n2(OUT_VAT))
    r(1, '6000', 'Expenses', '', '', '')
    r(3, '6420', 'Bank charges and IMTT', 'Expense', '—', n2(1381.27))
    tb = tbl([('Code', ''), ('Account', 'fillw'), ('Type', ''), ('Tax code', ''), ('Balance, USD', 'num')], rows, cls='table bk-tree')
    f = foot('86 accounts, 1 inactive', (('Added by Books', '9'),))
    main = (finding('86 accounts, in the layout your accountant knows.', 'Books added 9 where the codes were free.')
            + tools('Search accounts', (('Type', 'All', False),), '86 accounts', btn('Export', 'export') + more_btn('Collapse all, show inactive'))
            + sheet(tb, f))
    return page('BkChart', 'Chart of accounts', '/books/chart', 'Chart of accounts', main, primary('New account', 'plus', 'N'), h=1120)


def posting_rules():
    R = [('Sales invoice issued', 'Every invoice', '1100 Owed to you', '4000 Sales · 2200 Output VAT', 214, 'Ready'),
         ('Payment received', 'Every receipt', 'The money account chosen', '1100 Owed to you', 326, 'Ready'),
         ('Bill recorded', 'Every bill', 'Expense or 2010 · 2210 Input VAT', '2000 You owe suppliers', 96, 'Ready'),
         ('Payment made', 'Every supplier payment', '2000 · 6420 for IMTT', 'The money account · 2180 Withholding owed', 71, 'Ready'),
         ('Goods received', 'Per item category', 'The category’s stock account', '2010 Goods received, not billed', 1, 'Needs an account'),
         ('Requisition money out', 'CRM and retail requisitions', '1150 Cash advances to staff', 'The money account chosen', 4, 'Ready'),
         ('Retail sale', 'Per tender, from the tills', 'The tender’s account', '4100 Showroom sales · 2200', 1844, 'Ready'),
         ('Pay run approved', 'People and payroll', '6110 Wages · 6120 Employer costs', '2100 · 2110 · 2120 · 2140', 7, 'Ready'),
         ('Bank entry, charge', 'Charges and IMTT from To match', '6420 Bank charges and IMTT', 'The money account', 38, 'Ready')]
    rows = [[lead(a, w), '<span style="font-size:13px;color:var(--color-ink-2)">%s</span>' % d, '<span style="font-size:13px;color:var(--color-ink-2)">%s</span>' % c, mut(str(n)), st(s), iconbtn('edit', 'Edit %s' % a)] for a, w, d, c, n, s in R]
    tb = tbl([('Rule', ''), ('Debit', 'fillw'), ('Credit', 'fillw'), ('This month', 'num'), ('State', ''), ('', '')], rows, rowcls={4: 'bk-sel'})
    f = foot('9 rules', (('Ready', '8'), ('Needs an account', '1')))
    main = (finding('8 of 9 rules are ready.', 'Goods received has no account for Skirting and trims.')
            + tabs([('Rules', 9), ('Tender mappings', 6), ('Readiness', None)], 0)
            + tools('Search rules', (('Source', 'Any', False),), '9 rules', btn('Export', 'export'))
            + sheet(tb, f))
    return page('BkPostingRules', 'Posting rules', '/books/posting-rules', 'Posting rules', main, primary('New rule', 'plus', 'N'))


def audit():
    E = [('Mon 12 Oct 16:21', 'James Nyabadza', 'Owner', 'Voided', ref('INV-0143') + ' → ' + ref('CN-0009'), 'Cancellation, wrong customer'),
         ('Mon 12 Oct 15:12', 'Corelith support, as James', 'Sign in as · SA-214', 'Changed a posting rule', 'Retail sale, EcoCash tender', 'Ticket 4471: EcoCash tender to 1020'),
         ('Fri 9 Oct 10:18', 'Tendai Sibanda', 'Manager', 'Posted into a closed month', 'Fuel slip, August', 'Slip found after the close'),
         ('Mon 5 Oct 15:52', 'James Nyabadza', 'Owner', 'Voided', ref('REC-0090') + ', Mrs T. Gumbo', 'Duplicate, entered twice'),
         ('Fri 2 Oct 14:18', 'James Nyabadza', 'Owner', 'Revised', ref('INV-0133') + ' → ' + ref('INV-0137'), 'Wrong quantity'),
         ('Fri 2 Oct 10:05', 'James Nyabadza', 'Owner', 'Closed', 'August 2026', 'Closed again after the fix'),
         ('Fri 2 Oct 08:30', 'James Nyabadza', 'Owner', 'Reopened', 'August 2026', 'Missing fuel slip, Pomona van'),
         ('Thu 1 Oct 11:40', 'Rudo Mapfumo', 'May void and revise', 'Voided', ref('PAY-0055') + ', Kingsway Property', 'Rent paid twice')]
    rows = [[mut(w), lead(p, r), lead(a, d), mut(why)] for w, p, r, a, d, why in E]
    tb = tbl([('When', ''), ('Who', ''), ('What', ''), ('Reason', 'fillw')], rows, rowcls={1: 'bk-sel'}).replace('<td><span class="cell-lead">', '<td style="height:56px"><span class="cell-lead">')
    f = foot('8 of 296 events', (('Voids', '12'), ('Revisions', '5'), ('Deletes', '2')), pages_btns())
    snap = ('<pre class="mono" style="margin:0;padding:12px;border-radius:8px;background:var(--color-ground);font-size:12px;line-height:1.6;color:var(--color-ink-2);white-space:pre-wrap">'
            'rule: retail sale, EcoCash tender\ndebit: 1010 → 1020\nemail to the owner: sent 15:12</pre>')
    side = rail_(rsec('Changed a posting rule', (('Operator', 'Farai, Corelith support'), ('Signed in as', 'James Nyabadza, owner'), ('Mode', 'Change'), ('Reason', 'Ticket 4471')),
                      after='')
                 .replace('</div><dl', '</div><div class="bk-mut">Mon 12 Oct 15:12 · session SA-214</div><dl', 1)
                 + rsec('What was kept', end=status('Chain unbroken', 'success'), after=snap), 360)
    left = (finding('8 changes to posted records this month.', 'Each with who, why and what was kept.')
            + tools('Search the audit trail', (('Kind', 'All', False), ('Dates', 'This month', True)), '296 events', btn('Export', 'export'))
            + sheet(tb, f))
    return page('BkAudit', 'Audit trail', '/books/audit', 'Audit trail', split(left, side), '')


# =====================================================================
# Settings
# =====================================================================
def settings_tax():
    # Six columns: Until goes (a code ends by becoming inactive; its dates are on the code).
    T = [('VAT15.5', 'Standard rate', '15.5%', '1 Jan 2026', 'Sales, bills', 'Active'),
         ('VAT15', 'Standard rate, before 2026', '15%', '1 Mar 2026', 'Before 2026', 'Inactive'),
         ('ZR', 'Zero-rated', '0%', '1 Mar 2026', 'Exports', 'Active'),
         ('EX', 'Exempt', '—', '1 Mar 2026', 'Not charged VAT', 'Active'),
         ('WHT30', 'Withholding, no ITF263', '30%', '1 Mar 2026', 'Supplier payments', 'Active'),
         ('VWH', 'VAT withheld by an agent', '⅓ of the VAT', '1 Mar 2026', 'Receipts and payments', 'Active'),
         ('IMTT-USD', 'IMTT on USD transfers', '2%', '1 Mar 2026', 'Bank entries', 'Active'),
         ('IMTT-ZWG', 'IMTT on ZWG transfers', '1.5%', '1 Jan 2026', 'Bank entries', 'Active'),
         ('NR15', 'Non-resident fees ' + flag(), '15%', '1 Mar 2026', 'Supplier payments', 'Active')]
    rows = [['<span class="mono" style="color:var(--color-ink)">%s</span>' % c, lead(n), '<span class="mono">%s</span>' % r, mut(f), mut(w), st(s)] for c, n, r, f, w, s in T]
    tb = tbl([('Code', ''), ('Name', 'fillw'), ('Rate', 'num'), ('From', ''), ('Used for', ''), ('State', '')], rows)
    f = foot('9 tax codes', (('Active', '8'),))
    main = (finding('Documents keep the rate of their date.', '15.5% from 1 January, 15% before.')
            + tabs([('Tax codes', 9), ('Categories', 4), ('Templates', 3), ('Rules', 12)], 0)
            + tools('Search tax codes', (('Kind', 'All', False),), '9 codes', btn('Export', 'export'))
            + sheet(tb, f))
    return page('BkSettingsTax', 'Tax codes & rules', '/books/settings/tax', 'Tax codes & rules', main, primary('New tax code', 'plus', 'N'))


def settings_numbering():
    S = [('Invoice', 'INV-', '0145', 'INV-0144, 16 Oct'), ('Credit note', 'CN-', '0010', 'CN-0009, 12 Oct'), ('Payment received', 'REC-', '0095', 'REC-0094, 16 Oct'),
         ('Quote', 'QT-', '0404', 'QT-0403, 17 Oct'), ('Bill', 'BILL-', '0225', 'BILL-0224, 16 Oct'), ('Debit note', 'DN-', '0005', 'DN-0004, 8 Oct'),
         ('Payment made', 'PAY-', '0063', 'PAY-0062, 18 Oct'), ('Purchase order', 'PO-', '0039', 'PO-0038, 17 Oct'), ('Requisition', 'REQ-', '0094', 'REQ-0093, 18 Oct'),
         ('Claim', 'CLM-', '0015', 'CLM-0014, 17 Oct'), ('Goods received', 'GRN-', '0047', 'GRN-0046, 17 Oct'), ('Journal', 'JE-', '0487', 'JE-0486, 18 Oct')]
    rows = [[lead(d), mut('<span class="mono">%s</span>' % p), '<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><span class="mono" style="color:var(--color-ink)">%s%s</span><span class="faint" style="display:inline-flex">%s</span></span>' % (p, n, ic('lock')), mut(l), iconbtn('edit', 'Edit %s' % d)] for d, p, n, l in S]
    tb = tbl([('Document', 'fill'), ('Prefix', ''), ('Next number', ''), ('Last issued', ''), ('', '')], rows, rowcls={0: 'bk-sel'})
    f = foot('12 series', ())
    save = '<div class="bk-racts">%s%s</div>' % (btn('Save', 'check', 'btn btn-primary', 'Ctrl S'), btn('Cancel', None, 'btn btn-quiet'))
    side = rail_(rsec('Invoice', (('Prefix now', '<span class="mono">INV-</span>'), ('Next number', '<span class="mono">INV-0145</span>, fixed'), ('Issued so far', '144')))
                 + rsec('From 1 Jan 2027', after='<div class="bk-fld"><span class="bk-lab">Prefix <span class="muted" style="font-weight:400">optional</span></span><span class="bk-in">INV-27-</span></div>'
                        '<span class="muted" style="font-size:13px;margin-top:-4px">The first invoice is <span class="mono">INV-27-0001</span></span>' + save), 360)
    left = (finding('12 document series, each counting up with no gaps.', 'A number is given when the document is issued.')
            + tools('Search series', (), '12 series', btn('Export', 'export')) + sheet(tb, f))
    return page('BkSettingsNumbering', 'Numbering', '/books/settings/numbering', 'Numbering', split(left, side), '')


def setup():
    steps = [('done', 'Business and tax details', 'VAT category C · base currency USD', 'Management'),
             ('done', 'Money accounts', '2 bank, 1 EcoCash, 3 cash', 'Management'),
             ('done', 'Chart of accounts', 'Zimbabwe pack, 86 accounts', 'Chart of accounts'),
             ('done', 'Opening balances', 'Posted 1 Mar 2026', 'Opening balances'),
             ('now', 'Posting rules ready', 'Skirting and trims has no account', 'Posting rules'),
             ('done', 'Fiscal device', 'Device 21-04417, live', 'Management')]
    grid = 'grid-template-columns:24px minmax(0,1fr) minmax(0,1.2fr) 220px'
    def srow(s, a, b, where):
        ic_ = '<span class="bk-ok">%s</span>' % ic('step-done') if s == 'done' else '<span style="color:var(--color-ink)">%s</span>' % ic('step-now')
        act = btn('Map the account', 'chev', 'btn btn-primary', 'Ctrl ↵') if s == 'now' else btn(where, 'link' if where == 'Management' else 'chev', 'btn btn-quiet')
        return '<div class="bk-chk" style="%s%s">%s<span class="lead">%s</span><span>%s</span><span class="end">%s</span></div>' % (grid, ';background:var(--color-accent-tint)' if s == 'now' else '', ic_, a, b, act)
    ob = tbl([('Code', ''), ('Account', 'fill'), ('Debit', 'num'), ('Credit', 'num')],
             [[ref('1010'), lead('CBZ current, USD'), n2(2140.60), ''], [ref('1100'), lead('Owed to you, 4 customers'), n2(3880.00), ''],
              [ref('1200'), lead('Stock'), n2(16240.00), ''], [ref('1500'), lead('Vans and equipment'), n2(21600.00), ''],
              [ref('2000'), lead('You owe suppliers, 3'), '', n2(2940.60)], [ref('2200'), lead('Output VAT'), '', n2(1280.00)],
              [ref('3000'), lead('Owner’s capital'), '', n2(10000.00)], [ref('3200'), lead('Retained earnings'), '', n2(29640.00)]],
             total=['', 'Balanced', n2(43860.60), n2(43860.60)])
    left = (finding('The books are set up, but for one account.', 'Map a stock account for Skirting and trims.')
            + '<div style="box-shadow:inset 0 1px 0 var(--color-line)">%s</div>' % ''.join(srow(*s) for s in steps)
            + '<div class="group-head bk-gh"><h2 id="ob">Opening balances, 28 Feb 2026</h2><span class="sum">8 accounts</span></div>'
            + '<div style="font-size:14px">%s</div>' % ob
            + '<div class="foot-row" style="box-shadow:inset 0 1px 0 var(--color-line)"><span>Posted 1 Mar by Rudo Mapfumo</span><div class="end">%s%s</div></div>' % (
                btn('Revise the opening balances', 'edit'), more_btn('Bring in a trial balance, CSV')))
    return page('BkSetup', 'Set up the books', '/books/settings/setup', 'Set up the books', '<div class="bk-body"><div class="bk-col">%s</div></div>' % left, '')


# =====================================================================
# Cross-cutting
# =====================================================================
# The record pages behind the dialogs: a header (title, one pill, one muted line), the tabs and the lines. No finding.
def invoice_behind():
    lines = tbl([('Line', 'fill'), ('Qty', 'num'), ('Price', 'num'), ('Amount', 'num')],
                [[lead('Carpet tiles, Interface Heuga, grey'), '64 m²', n2(18.50), n2(1184.00)], [lead('Underlay and adhesive'), '64 m²', n2(3.60), n2(230.40)],
                 [lead('Fitting'), '64 m²', n2(4.20), n2(268.80)], [lead('Aluminium edge trim'), '14 m', n2(3.10), n2(43.40)]],
                total=['VAT 15.5% included in the total', '', '', n2(1994.22)])
    head = rec_head('INV-0142 · Pomona Offices', '<span class="pill pill-info">Part paid</span>', 'Issued 6 Oct · due 20 Oct')
    return head + tabs(['Lines', 'Payments', 'Credit notes', 'Fiscal', 'Posting', 'History'], 0) + lines

def bill_behind():
    lines = tbl([('Line', 'fill'), ('Qty', 'num'), ('Price', 'num'), ('Amount', 'num')],
                [[lead('Tile adhesive, 20 kg'), '12', n2(17.50), n2(210.00)], [lead('Self-levelling screed, 25 kg'), '4', n2(25.60), n2(102.40)]],
                total=['VAT 15.5% included in the total', '', '', n2(312.40)])
    head = rec_head('BILL-0219 · Halsted Builders', '<span class="pill pill-ok">Paid</span>', 'Recorded 5 Oct · Valid on FDMS')
    return head + tabs(['Lines', 'Payments', 'FDMS check', 'Posting', 'History'], 0) + lines

def receipt_behind():
    head = rec_head('REC-0090 · Mrs T. Gumbo', '<span class="pill pill-plain">Void</span>', 'Recorded 5 Oct · voided 5 Oct')
    t = tbl([('Entry', ''), ('Date', ''), ('What', 'fill'), ('Amount', 'num')],
            [[ref('JE-0429'), mut('5 Oct'), lead('Receipt into the showroom cash box'), n2(430)], [ref('JE-0430'), mut('5 Oct'), lead('Void of REC-0090, the mirror'), n2(-430)]])
    return head + tabs(['Posting', 'History'], 0) + t

def dialog(title, body, foot_html, w=520, start=''):
    return ('<div class="dialog bk-dlg" role="dialog" aria-label="%s" style="width:%dpx"><div class="dialog-head"><h2>%s</h2><div class="end">%s</div></div>'
            '<div class="dialog-body">%s</div><div class="dialog-foot">%s<span style="flex:1"></span>%s</div></div>') % (
        title, w, title, iconbtn('x', 'Close'), body, '<span class="start" style="margin-right:0">%s</span>' % start if start else '', foot_html)

def what(items):
    return '<div class="bk-what">%s</div>' % ''.join('<div>%s<span>%s</span></div>' % (ic(i), t) for i, t in items)

def danger_btn(label, icon, k):
    return '<button class="btn btn-primary" style="background:var(--color-danger)">%s%s%s</button>' % (ic(icon), label, kbd(k, True))

def void_dialog():
    body = ('<p>INV-0142 is signed on FDMS, so it is voided with a full credit note.</p>'
            + what((('file', '<b>CN-0010</b> for %s is issued and signed' % usd(1994.22)),
                    ('payments', '%s, %s, stays on account' % (ref('REC-0091'), usd(500))),
                    ('vat', 'October’s VAT return counts the credit note')))
            + '<div class="bk-fld"><span class="bk-lab">Reason on the credit note</span><div class="bk-chips"><span>Return</span><span>Price correction</span><span class="on">Cancellation</span><span>Discount</span><span>Bad debt</span></div></div>'
            + '<div class="bk-fld"><span class="bk-lab">Why are you voiding it?</span><div class="bk-ta">Their landlord is paying for the job and wants the invoice in the landlord’s name.</div>'
            + '<span class="muted" style="font-size:12px">Kept in the audit trail</span></div>')
    d = dialog('Void INV-0142', body, btn('Cancel', None, 'btn btn-quiet') + btn('Void and issue CN-0010', 'x', 'btn btn-primary', 'Ctrl ↵'))
    return page('BkVoidDialog', 'Void an invoice', '/books/invoices/inv-0142', 'Invoices', invoice_behind(), btn('Record a payment', 'payments', 'btn', 'R'),
                extra='<div class="bk-dim">%s</div>' % d, heading=crumb('Invoices', 'INV-0142'), icon='invoice')

def revise_dialog():
    body = ('<p>A posted bill isn’t edited in place. Revising voids BILL-0219 and records BILL-0225 with your changes.</p>'
            + what((('x', '<b>BILL-0219</b> is voided and shows “Replaced by BILL-0225”'),
                    ('payments', '%s, %s, moves to BILL-0225' % (ref('PAY-0057'), usd(312.40))),
                    ('vat', 'Input VAT is claimed once its FTI is Valid')))
            + '<div class="bk-fld"><span class="bk-lab">Why are you revising it?</span><div class="bk-ta">Halsted delivered 10 bags of adhesive, not 12; their credit note 00417-2231 is on file.</div>'
            + '<span class="muted" style="font-size:12px">Kept with both bills and in the audit trail</span></div>')
    d = dialog('Revise BILL-0219', body, btn('Cancel', None, 'btn btn-quiet') + btn('Revise as BILL-0225', 'edit', 'btn btn-primary', 'Ctrl ↵'))
    return page('BkReviseDialog', 'Revise a bill', '/books/bills/bill-0219', 'Bills', bill_behind(), btn('New bill', 'plus', 'btn', 'N'),
                extra='<div class="bk-dim">%s</div>' % d, heading=crumb('Bills', 'BILL-0219'), icon='docs')

def delete_dialog():
    body1 = ('<p>This removes the receipt as if it was never recorded. Delete is for duplicates and test data.</p>'
             + what((('payments', 'REC-0090 and its line on Mrs T. Gumbo’s account'), ('books', ref('JE-0429') + ', its mirror ' + ref('JE-0430') + ' and 1 event'),
                     ('lock', 'REC-0090 is never given out again')))
             + '<div class="bk-fld"><span class="bk-lab">Reason</span><div class="bk-ta">Duplicate entered at the counter; REC-0089 is the real one.</div></div>'
             + '<div class="bk-fld"><span class="bk-lab">Type REC-0090 to confirm</span><span class="bk-in">REC-0090</span></div>')
    d1 = dialog('Delete REC-0090 permanently', body1, btn('Cancel', None, 'btn btn-quiet') + danger_btn('Delete permanently', 'x', 'Ctrl ↵'), w=500)
    refused = ''.join('<div>%s<span>%s</span></div>' % ('<span class="bk-no">%s</span>' % ic('x') if on else '<span class="bk-ok">%s</span>' % ic('check'), t) for on, t in (
        (True, '<b>Signed on FDMS</b>, fiscal day 108, 2 Oct'),
        (False, 'Its month, October, is open'),
        (False, 'No finalised VAT return counts it'),
        (False, 'Its payment isn’t in a closed reconciliation')))
    body2 = ('<p>ZIMRA keeps every signed invoice, so Books keeps it too. Void it instead: a signed credit note takes it back.</p>'
             '<div class="bk-what">%s</div>') % refused
    d2 = dialog('INV-0139 can’t be deleted', body2, btn('Close', None, 'btn btn-quiet') + btn('Void with a credit note', 'x', 'btn', 'Ctrl ↵'), w=460)
    return page('BkDeleteDialog', 'Delete permanently', '/books/payments/rct-0090', 'Payments received', receipt_behind(), btn('Record a payment', 'plus', 'btn', 'N'),
                extra='<div class="bk-dim" style="align-items:flex-start;padding-top:72px">%s%s</div>' % (d1, d2), heading=crumb('Payments received', 'REC-0090'), icon='payments')


def bulk_result():
    REQ = [('REQ-0093', 'James Nyabadza', 'CRM', 'Floor sander repair', M(120)), ('REQ-0092', 'Tendai Sibanda', 'Retail', 'Till rolls and toner, showroom', M(38)),
           ('REQ-0091', 'Tinashe Moyo', 'CRM', 'Transport, 3 trips, Borrowdale Brooke Clinic', M(60))]
    behind = finding('3 requisitions wait for approval, %s in all.' % usd(218))
    behind += tabs([('To approve', 3), ('To pay', 1), ('To account for', 1), ('Done', 2), ('All', 7)], 0)
    behind += tools('Search requisitions', (('Source', 'Any', False),), '3 requisitions', btn('Export', 'export'))
    behind += tbl([('', 'sel'), ('Number', ''), ('Asked by', ''), ('For', 'fill'), ('Amount', 'num'), ('State', '')],
                  [[cbx(True), ref(n), lead(b, s), lead(f), usd(a), st('To approve')] for n, b, s, f, a in REQ], sel_rows=(0, 1, 2))
    R = [('REQ-0092', 'Tendai Sibanda', usd(38), 'Approved', 'Within your limit'),
         ('REQ-0091', 'Tinashe Moyo', usd(60), 'Approved', 'Within your limit'),
         ('REQ-0093', 'James Nyabadza', usd(120), 'Skipped', 'Your own; Rudo is asked')]
    rows = [[ref(n), lead(c), a, st(s), mut(w)] for n, c, a, s, w in R]
    t = tbl([('Requisition', ''), ('Asked by', ''), ('Amount', 'num'), ('Result', ''), ('Why', 'fillw')], rows)
    body = ('<div style="display:flex;gap:16px;align-items:baseline"><span style="font-size:28px;font-weight:600;color:var(--color-ink);letter-spacing:var(--tracking-display)">2 approved</span><span class="muted" style="font-size:14px">1 skipped</span></div>'
            '<p>%s is now ready to pay.</p>'
            '<div style="margin:0 -24px;box-shadow:inset 0 1px 0 var(--color-line)">%s</div>') % (usd(98), t)
    d = dialog('Approve 3 requisitions', body, btn('Open the 2 to pay', 'payments') + btn('Done', 'check', 'btn btn-primary', '↵'), w=680)
    return page('BkBulkResult', 'Bulk result', '/books/requisitions', 'Requisitions', behind, btn('New requisition', 'plus', 'btn', 'N'), extra='<div class="bk-dim">%s</div>' % d, heading='Requisitions')


def upsell():
    items = (('invoice', 'Invoices and bills in one place', 'With their payments, from every module'),
             ('match', 'Bank matching', 'Vane proposes, you accept'),
             ('vat', 'VAT returns', 'The VAT 7 schedule, ready to file'),
             ('done', 'The month’s close', 'A checklist, then the month locks'),
             ('books', 'The ledger for your accountant', 'Trial balance, statements, audit trail'))
    li = ''.join('<li>%s<span><b>%s</b><em>%s</em></span></li>' % (ic(i), a, b) for i, a, b in items)
    main = ('<div class="bk-body"><div class="bk-col" style="align-items:center"><div style="width:640px;padding:72px 0 48px">'
            '<p class="lede-figure">Your books hold 1,204 entries since 1 March.<span class="q">Every sale, payment and pay run has posted.</span></p>'
            '<h2 class="bk-h3" style="margin-top:40px;font-size:16px">What the Books screens add</h2><ul class="bk-upsell" style="list-style:none;margin:8px 0 0;padding:0">%s</ul>'
            '<div style="display:flex;align-items:center;gap:12px;margin-top:40px">%s<span class="pill pill-n">Price to be set</span><span style="flex:1"></span>%s</div>'
            '<p class="bk-note" style="margin-top:16px">Adding Books loses nothing: every document is already there.</p>'
            '</div></div></div>') % (li, btn('Add Books', 'plus', 'btn btn-primary btn-lg', 'A'), btn('Accountant export', 'export', 'btn btn-lg btn-quiet'))
    return page('BkUpsell', 'Without the screens', '/books', 'Money', main, '', icon='books', heading='Books')


def empty():
    ghost = tbl([('Account', 'fill'), ('Balance', 'num'), ('In USD', 'num'), ('Last reconciled', ''), ('To match', 'num')],
                [['<i style="width:%dpx"></i>' % w, '<i style="width:80px;margin-left:auto"></i>', '<i style="width:64px;margin-left:auto"></i>', '<i style="width:64px"></i>', '<i style="width:20px;margin-left:auto"></i>'] for w in (220, 180, 200)],
                cls='table bk-ghost')
    emp = ('<div class="empty" style="margin:24px auto 0;padding-top:32px">%s<h2>No money accounts yet</h2>'
           '<p>Add the account your takings go into first. The tills, the CRM and payroll use it too.</p>'
           '<div style="display:flex;gap:8px">%s%s</div></div>') % (ic('bank', 'glyph'), btn('Add an account', 'plus', 'btn btn-primary', 'N'), btn('Bring in a statement', 'upload'))
    main = (finding('Books is ready, with a chart of accounts for Zimbabwe.', 'Add a bank, EcoCash or cash account to start.')
            + tabs([('All', 0), ('Bank', 0), ('Mobile money', 0), ('Cash', 0)], 0)
            + sheet(ghost, foot('No accounts', ()), after=emp))
    import re
    top = topbar('Accounts', ICON['Accounts'], '')
    side = re.sub(r'<span class="pn-n">\d+</span>', '', books_panel_for('Accounts'))   # a first day has nothing to count
    return write(ROOT, 'BkEmpty', 'Books · Accounts, first day · /books/accounts', shell('Books', side, top + main), css=CSS)


ALL = (accounts, account, to_match, to_match_phone, reconciliation,
       tax_due, tax_due_phone, vat_return, withholding, provisional, fiscal,
       close, needs_posting, rates, year_end,
       journals, journal_new, trial_balance, financials, ledger, chart, posting_rules, audit,
       settings_tax, settings_numbering, setup,
       void_dialog, revise_dialog, delete_dialog, bulk_result, upsell, empty)


def views(names):
    """Write boards/view/<name>.html the way tools/boards/views.py does, for these boards only."""
    import re
    from views import UPLOADS
    vdir = os.path.join(ROOT, '..', 'view')
    for name in names:
        s = open(os.path.join(ROOT, name + '.dc.html')).read()
        s = s.replace('<script src="./support.js"></script>', '<style>x-dc{display:block}helmet{display:contents}</style>')
        for blob, local in UPLOADS.items():
            s = s.replace(blob, local)
        s = re.sub(r'<script type="text/x-dc" data-dc-script.*?</script>\n?', '', s, flags=re.S)
        open(os.path.join(vdir, name + '.html'), 'w').write(s)


if __name__ == '__main__':
    names = [f() for f in ALL]
    views(names)
    print('\n'.join(names))
