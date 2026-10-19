"""Huchu canvas boards in the handover kit: one stylesheet, the zip's markup."""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
IC = json.load(open(os.path.join(HERE, 'icons.json')))
IC['search'] = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m15.879 15.879l4.242 4.242M18 10.5a7.5 7.5 0 1 1-15 0a7.5 7.5 0 0 1 15 0Z"/>'
IC['chev'] = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9.343 6.343L15 12l-5.657 5.657"/>'
IC['down'] = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M17.657 9.343L12 15L6.343 9.343"/>'
# Explore: a console, filled, with the prompt cut out
IC['explore'] = '<path fill="currentColor" fill-rule="evenodd" d="M4.5 3h15A2.5 2.5 0 0 1 22 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5v-13A2.5 2.5 0 0 1 4.5 3m1.8 5.7l2.8 2.8l-2.8 2.8l1.4 1.4l4.2-4.2l-4.2-4.2zM12 14.5v2h6v-2z" clip-rule="evenodd"/>'
# a table of rows, for Explore's tables list
IC['tablegrid'] = '<path fill="currentColor" fill-rule="evenodd" d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5zM5 9v3.5h6V9zm8 0v3.5h6V9zm-8 5.5V18.5a.5.5 0 0 0 .5.5H11v-4.5zm8 0V19h5.5a.5.5 0 0 0 .5-.5v-4z" clip-rule="evenodd"/>'
IC['lock'] = '<path fill="currentColor" fill-rule="evenodd" d="M7 9V7a5 5 0 0 1 10 0v2h.5A2.5 2.5 0 0 1 20 11.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5v-8A2.5 2.5 0 0 1 6.5 9zm2 0h6V7a3 3 0 1 0-6 0zm3 4a1.5 1.5 0 0 0-1 2.62V17.5h2v-1.88A1.5 1.5 0 0 0 12 13" clip-rule="evenodd"/>'
IC['sun'] = '<path fill="currentColor" d="M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10m0-5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1m0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1M3 11h1a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2m17 0h1a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2M5.64 4.22l.7.7a1 1 0 1 1-1.41 1.42l-.71-.71a1 1 0 0 1 1.42-1.41m12.72 12.72l.7.7a1 1 0 0 1-1.41 1.42l-.71-.71a1 1 0 0 1 1.42-1.41m.7-12.72a1 1 0 0 1 0 1.41l-.7.71a1 1 0 0 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0M6.34 17.66a1 1 0 0 1 0 1.41l-.7.71a1 1 0 0 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0"/>'
IC['whatsapp'] = '<path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2"/><path fill="#fff" d="M16.9 14.4c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3c.1-.2 0-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3a3 3 0 0 0-.9 2.2a5.2 5.2 0 0 0 1.1 2.7a11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3a2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3"/>'
IC['at'] = '<path fill="currentColor" d="M12 2a10 10 0 1 0 4.5 18.9a1 1 0 1 0-.9-1.8A8 8 0 1 1 20 12v1a2 2 0 0 1-4 0V8a1 1 0 0 0-2 0v.3A5 5 0 1 0 15 15.7A4 4 0 0 0 22 13v-1A10 10 0 0 0 12 2m0 13a3 3 0 1 1 0-6a3 3 0 0 1 0 6"/>'
IC['thumbup'] = '<path fill="currentColor" d="M7 10v11H4.5A1.5 1.5 0 0 1 3 19.5v-8A1.5 1.5 0 0 1 4.5 10zm2 11h8.3a3 3 0 0 0 2.95-2.46l1.1-6A3 3 0 0 0 18.4 9H14V5.5A2.5 2.5 0 0 0 11.5 3a1 1 0 0 0-.94.66L9 8.5z"/>'
IC['history'] = IC.get('activity', '')
IC['send'] = IC['publish']  # a paper plane; the zip's Send reminders used the WhatsApp mark
IC['pen'] = IC['edit']
IC['moon'] = '<path fill="currentColor" d="M12.2 2a1 1 0 0 1 .3 1.1A7.5 7.5 0 0 0 20.9 11.5a1 1 0 0 1 1.1.3A10 10 0 1 1 12.2 2"/>'

FONT = '/_blob/5b8c2719f79e56705cee4939b8ccbb77'
CSS = open(os.path.join(HERE, 'css_url.txt')).read().strip() if os.path.exists(os.path.join(HERE, 'css_url.txt')) else '/_blob/PENDING'
MARK = {
    'campus-mark.svg': '/_blob/40aba51cba29678370340cba4a555e35', 'corelith-logo.svg': '/_blob/32e6e5c15575ba73f35524bb333d682b',
    'flare-mark.svg': '/_blob/53a8dc80210b2f55135fc98ac1eb991a', 'shift-mark.svg': '/_blob/a8c16c523436d43f5489350a73045c4e',
    'silo-mark.svg': '/_blob/d4879c010d72a0ae5d79c4702dad17f6', 'tender-mark.svg': '/_blob/5bb4eb63ed09db6ea4b40efb888195c1',
    'ecocash-wordmark.png': '/_blob/26bd05205cc4888edbde0a92e9ca6d5b',
}

def ic(name, cls='ic'):
    return '<svg class="%s" viewBox="0 0 24 24" aria-hidden="true">%s</svg>' % (cls, IC[name])

def vmark(size=16):
    return ('<svg class="vn" width="%d" height="%d" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><rect width="24" height="24" rx="6" fill="var(--color-ink)"/>'
            '<path d="M5 12h10" stroke="var(--color-surface)" stroke-width="2.2" stroke-linecap="round"/><path d="M19.5 12 14 8v8z" fill="var(--color-surface)"/>'
            '<path d="M5 8.5 7.5 12 5 15.5" stroke="var(--color-surface)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>') % (size, size)

def kbd(k, on_primary=False):
    if on_primary:
        return '<span class="kbd" style="background:transparent;color:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.32)">%s</span>' % k
    return '<span class="kbd">%s</span>' % k

def btn(label, icon=None, cls='btn', k=None, attrs=''):
    return '<button class="%s"%s>%s%s%s</button>' % (cls, attrs, ic(icon) if icon else '', label, kbd(k, 'btn-primary' in cls) if k else '')

def primary(label, icon='plus', k='N'):
    return btn(label, icon, 'btn btn-primary', k)

def iconbtn(icon, label, cls='btn btn-quiet btn-icon'):
    return '<button class="%s" aria-label="%s">%s</button>' % (cls, label, ic(icon))

# ---------- the rail ----------
RAIL = [('pipeline', 'Pipeline'), ('visits', 'Site visits'), ('showroom', 'Showroom'), ('books', 'Books'),
        ('reports', 'Reports'), ('explore', 'Explore'), ('docs', 'Documents'), ('person', 'People')]

def rail(on=None, ws='Floorcode'):
    out = ['<nav class="rail-m" aria-label="Modules">', '  <span class="ws-tile" aria-label="%s">%s</span>' % (ws, ic('ws'))]
    items = ''
    for key, label in RAIL:
        cur = ' is-on' if label == on else ''
        aria = ' aria-current="page"' if label == on else ''
        items += '<a class="rm%s" href="#%s" aria-label="%s"%s>%s</a>' % (cur, label, label, aria, ic(key))
    out.append('  ' + items)
    out.append('  <span class="grow"></span>')
    out.append('  <a class="rm%s" href="#vane" aria-label="Vane">%s</a>' % (' is-on' if on == 'Vane' else '', vmark(20)))
    out.append('  <a class="rm%s" href="#settings" aria-label="Management">%s</a>' % (' is-on' if on == 'Management' else '', ic('gear')))
    out.append('  <span class="me" aria-label="James Nyabadza">%s</span>' % ic('person'))
    out.append('</nav>')
    return '\n'.join(out)

# ---------- the module panel ----------
def pn(label, icon=None, n=None, on=False, dot=False, meta=None):
    lead = '<span class="pn-dot"></span>' if dot else (ic(icon) if icon else '')
    tail = '<span class="pn-n">%s</span>' % n if n is not None else ('<span class="pn-m">%s</span>' % meta if meta else '')
    return '<a class="pn%s" href="#%s"%s>%s<span class="truncate">%s</span>%s</a>' % (' is-on' if on else '', label, ' aria-current="page"' if on else '', lead, label, tail)

def pg(title, rows, add=False):
    a = '<button class="btn btn-quiet btn-icon pg-add" aria-label="Add to %s">%s</button>' % (title, ic('plus')) if add else ''
    return '<div class="pg"><div class="pg-h">%s<span>%s</span>%s</div>%s</div>' % (ic('down'), title, a, ''.join(rows))

def panel(title, body, find='Search'):
    return ('<aside class="panel-m" aria-label="%s">\n  <div class="pm-h"><b>%s</b>%s</div>\n'
            '  <label class="input-wrap pm-find">%s<input type="search" aria-label="Search %s" placeholder="%s"><span class="kbd">/</span></label>\n'
            '  <div class="pm-body">%s</div>\n  <div class="pm-foot">%s</div>\n</aside>') % (
        title, title, iconbtn('panel', 'Hide the panel'), ic('search'), title, find, body, pn('Help', 'help'))

# ---------- the top bar ----------
def vane_btn(n=5, on=False):
    return ('<button class="btn vn-b%s" aria-pressed="%s" aria-label="Vane, %d for you">%s<span class="ask-l">Vane</span><span class="vn-c">%d</span><span class="live-d" aria-hidden="true"></span></button>'
            % (' is-vane' if on else '', 'true' if on else 'false', n, vmark(16), n))

def find_all():
    return '<label class="input-wrap tb-find">%s<input type="search" aria-label="Search everything" placeholder="Search everything">%s</label>' % (ic('search'), kbd('Ctrl K'))

def topbar(title, icon, right='', bell=True, vane=5, find=True):
    """The standard app bar (owner, 19 Oct): the title on the left; in the right section the page's
    actions, then Vane, Search (an icon button for Ctrl K) and Notifications, which never move. More than two actions become one
    button group: the primary and a dropdown. `right` is the page's actions; appbar.standard lays them out."""
    from appbar import standard
    r = (find_all() if find else '') + (iconbtn('bell', 'Notifications') if bell else '') + (vane_btn(vane) if vane else '') + right
    return standard('<header class="tb-m"><h1>%s%s</h1><div class="tb-r">%s</div></header>' % (ic(icon) if icon else '', title, r))

def shell(rail_on, panel_html, main_html, extra=''):
    return '<div class="sh">%s%s<main class="mn">%s</main>%s</div>' % (rail(rail_on), panel_html, main_html, extra)

# ---------- pieces ----------
def finding(fact, rest=''):
    return '<div class="finding"><p class="lede-figure">%s%s</p></div>' % (fact, ' <span class="q">%s</span>' % rest if rest else '')

def group_head(title, n=None, gid='g'):
    return '<div class="group-head"><h2 id="%s">%s</h2>%s</div>' % (gid, title, '<span class="sum">%s</span>' % n if n is not None else '')

def status(word, tone=''):
    return '<span class="status%s">%s</span>' % (' status-' + tone if tone else '', word)

def table(head, rows, total=None, numcols=(), cls='table'):
    th = ''.join('<th%s>%s</th>' % (' class="num"' if i in numcols else '', h) for i, h in enumerate(head))
    body = ''
    for r in rows:
        body += '<tr>' + ''.join('<td%s>%s</td>' % (' class="num"' if i in numcols else '', c) for i, c in enumerate(r)) + '</tr>'
    tf = ''
    if total:
        tf = '<tfoot><tr class="total">' + ''.join('<td%s>%s</td>' % (' class="num"' if i in numcols else '', c) for i, c in enumerate(total)) + '</tr></tfoot>'
    return '<table class="%s"><thead><tr>%s</tr></thead><tbody>%s</tbody>%s</table>' % (cls, th, body, tf)

# ---------- the board file ----------
def safe_css(css):
    return css.replace('{{', '{ {').replace('}}', '} }')

def doc(title, body, w=1440, h=900, css='', theme=None):
    root = ' data-theme="%s"' % theme if theme else ''
    return '''<!doctype html>
<html lang="en-GB"%s>
<head>
<meta charset="utf-8">
<title>%s</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&amp;display=swap">
<link rel="stylesheet" href="%s">
</head>
<body>
<x-dc>
<helmet><style>
body{margin:0;background:var(--color-surface);font-family:var(--font-sans);color:var(--color-ink)}
.sh,.rb2,.st,.ex{height:%dpx}
%s
</style></helmet>
%s
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":%d,"height":%d}}'>
class Component extends DCLogic { renderVals() { return {}; } }
</script>
</body>
</html>
''' % (root, title, CSS, h, safe_css(css), body, w, h)

def write(root, name, title, body, w=1440, h=900, css=''):
    path = os.path.join(root, name + '.dc.html')
    open(path, 'w').write(doc(title, body, w, h, css))
    return name

# ---------- shared module panels ----------
def people_panel(on):
    top = [('Everyone', 'users', 9), ('Time off', 'sun', 2), ('Payroll', 'invoice', None), ('Loans and advances', 'payments', 1), ('Documents', 'docs', None), ('Starting and leaving', 'list', None)]
    body = ''.join(pn(a, i, n, a == on) for a, i, n in top)
    body += pg('Teams', [pn(t, dot=True, n=n, on=(t == on)) for t, n in (('Fitting', 5), ('Showroom', 2), ('Office', 1), ('Management', 1))])
    body += pg('Reports from People', [pn('Payroll cost by team', 'reports'), pn('Leave taken this year', 'reports')])
    return panel('People', body)

def books_panel(on):
    top = [('Money', 'money', None), ('Invoices', 'invoice', 3), ('Payments', 'payments', None), ('Takings', 'takings', 1), ('Expenses', 'expenses', None), ('Bank', 'bank', 4), ('VAT', 'vat', None)]
    body = ''.join(pn(a, i, n, a == on) for a, i, n in top)
    body += pg('Saved views', [pn('Overdue', dot=True, meta='shared'), pn('Pomona Offices', dot=True, meta='you'), pn('Paid this month', dot=True, meta='shared')], add=True)
    body += pg('Reports from Books', [pn('Money this month', 'reports'), pn('Owed to you, by age', 'reports')])
    return panel('Books', body)

MG = [('People', [('Users', 'users', 6), ('Departments', 'ws', None), ('Job grades', 'grade', 4), ('Pay and statutory', 'invoice', None)]),
      ('Operations', [('Sites', 'sites', None), ('Sections', 'sections', None)]),
      ('Shop', [('Tills', 'takings', None), ('Till rules', 'list', None), ('Posting', 'posting', None), ('Fiscal device', 'fiscal', None)]),
      ('Compliance', [('Permits', 'permits', None), ('Inspections', 'inspections', None), ('Incidents', 'incidents', None), ('Training', 'training', None)]),
      ('Company', [('General', 'general', None), ('Branding', 'brand', None), ('Templates', 'docs', None), ('Reports', 'reports', None), ('Explore', 'explore', None), ('Activity', 'activity', None)]),
      ('Apps', [('Billing', 'bank', None), ('Integrations', 'link', 5), ('Marketplace', 'store', None), ('Vane', 'VANE', None)]),
      ('My account', [('Profile', 'profile', None), ('Notifications', 'bell', None), ('Appearance', 'appearance', None)])]

def mg_side(on):
    nav = ''
    for g, items in MG:
        rows = ''
        for a, i, n in items:
            lead = vmark(16) if i == 'VANE' else ic(i)
            rows += '<a class="pn%s" href="#%s"%s>%s<span class="truncate">%s</span>%s</a>' % (' is-on' if a == on else '', a, ' aria-current="page"' if a == on else '', lead, a, '<span class="pn-n">%s</span>' % n if n else '')
        nav += '<div class="mg-g"><div class="mg-gh">%s</div>%s</div>' % (g, rows)
    return ('<aside class="mg-side" aria-label="Management"><div class="mg-h"><a class="btn btn-quiet btn-icon" href="#back" aria-label="Back to Floorcode">%s</a><b>Management</b></div>'
            '<label class="input-wrap pm-find">%s<input type="search" aria-label="Search management" placeholder="Search">%s</label>'
            '<nav class="pm-body">%s</nav><div class="mg-foot"><img src="%s" alt="Corelith" height="16"></div></aside>') % (ic('back'), ic('search'), kbd('/'), nav, MARK['corelith-logo.svg'])

def mg(on, main):
    return '<div class="mg">%s<main class="mn">%s</main></div>' % (mg_side(on), main)

def ws_tools(find, chips, count, right=None, filters=True):
    ch = ''.join('<span class="chipsel%s">%s <b>%s</b>%s</span>' % (' is-set' if set_ else '', a, b, ic('down')) for a, b, set_ in chips)
    if right is None:
        right = btn('Sort', 'sort', 'btn btn-quiet') + btn('Group', 'list', 'btn btn-quiet') + btn('Columns', 'columns', 'btn btn-quiet') + btn('Export', 'export')
    return ('<div class="ws-tools"><label class="input-wrap ws-find">%s<input type="search" aria-label="%s" placeholder="%s"></label>%s%s<span class="ws-n">%s</span>'
            '<div class="end"><span class="sepv"></span>%s</div></div>') % (ic('search'), find, find, ch, btn('Filters', 'filter') if filters else '', count, right)

def pager(text, pages=1, on=1):
    b = '<button aria-label="Previous">%s</button>' % ic('back')
    b += ''.join('<button class="%s">%d</button>' % ('is-on' if i == on else '', i) for i in range(1, pages + 1))
    b += '<button aria-label="Next">%s</button>' % ic('chev')
    return '<div class="ws-foot" style="position:relative"><span>%s</span><div class="pager">%s</div></div>' % (text, b)

def vflag(text):
    return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--color-ink-2)">%s%s</span>' % (vmark(16), text)

def vcard(kind, src, title, text, acts, issue=False, close=True):
    icon = ic('issue') if issue else ic('suggestion')
    x = iconbtn('x', 'Not now', 'btn btn-quiet btn-icon vc-x') if close else ''
    return '<article class="vc%s"><div class="vc-k">%s<span>%s</span><span class="muted">%s</span>%s</div><h3>%s</h3><p>%s</p><div class="vc-a">%s</div></article>' % (
        ' is-issue' if issue else '', icon, kind, src, x, title, text, acts)

def vplan(title, meta, pct, steps):
    li = ''
    for state, text, who in steps:
        li += '<li class="is-%s">%s<span>%s</span><span class="muted">%s</span></li>' % (state, ic('step-' + state), text, who)
    return '<article class="vp"><div class="vp-h"><h3>%s</h3><span class="muted">%s</span></div><div class="meter"><i style="width:%d%%"></i></div><ol>%s</ol></article>' % (title, meta, pct, li)

def mgtop(title, icon, right=''):
    return '<header class="tb-m"><h1>%s%s</h1><div class="tb-r">%s</div></header>' % (vmark(16) if icon == 'VANE' else ic(icon), title, right)
