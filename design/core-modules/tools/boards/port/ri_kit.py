"""The old report kit's API, emitting the handover kit's markup (core.css classes, CSS-variable tokens)."""
import json, re, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import ck
from glyphs import MAP as GMAP
NAV = json.load(open(os.path.join(HERE, 'nav.json')))

NUMERIC = re.compile(r'^[\d$−+.,%\s·]*$')
def numeric(x):
    return bool(x) and bool(NUMERIC.match(str(x)))
MONO = 'var(--font-mono)'
SANS = 'var(--font-sans)'
V = lambda n: 'var(--color-%s)' % n
BASE = dict(ink=V('ink'), ink2=V('ink-2'), muted=V('muted'), faint=V('faint'), line=V('line'), soft=V('line'), ground=V('ground'), tray=V('fill'),
            strong=V('rule'), acc=V('accent'), sel=V('accent-tint'), bar=V('ink-2'), hi=V('accent'), hi2='color-mix(in oklab, var(--color-accent) 45%, white)',
            data=V('ink-2'), datac=V('rule'), ok=V('success'), okbg=V('success-tint'), warn=V('warning'), warnbg=V('warning-tint'), bad=V('danger'),
            badbg=V('danger-tint'), info=V('info'), infobg=V('info-tint'))
PAL = {'corelith': dict(BASE), 'tender': dict(BASE)}
# Tender (retail) keeps its warm ink and orange accent; everything reads the same variables.
TENDER_VARS = ('--color-ink:#24140e;--color-ink-2:#4a3a33;--color-muted:#75675f;--color-faint:#a89c94;--color-line:#ece6e0;--color-ground:#faf7f4;'
               '--color-fill:#f3eee9;--color-rule:#ddd4cc;--color-accent:#b84a0c;--color-accent-tint:#fbeee5;--color-hover:#f7f2ee')
C = dict(PAL['corelith'])
def theme(name):
    C.clear(); C.update(PAL[name]); C['name'] = name
theme('corelith')

def T(_tpl, **kw):
    base = dict(C); base.update(mono=MONO, sans=SANS); base.update(kw)
    for k, v in base.items():
        _tpl = _tpl.replace('[[' + k + ']]', str(v))
    return _tpl

def kicon(g):
    k = GMAP.get(g, g)
    return k if k in ck.IC else ('corelith' if g == 'fileCheck' else 'list')

def icon(g, size=14, color=None):
    if g == 'vane':
        return ck.vmark(size)
    col = 'color:%s;' % color if color else ''
    return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:%dpx;height:%dpx;flex:none;%s">%s</svg>' % (size, size, col, ck.IC[kicon(g)])

TONECLS = {'ok': 'pill-ok', 'warn': 'pill-warn', 'bad': 'pill-bad', 'info': 'pill-info', 'sel': 'pill-info', 'neutral': 'pill-n'}
def chip(t, tone='neutral'):
    return '<span class="pill %s">%s</span>' % (TONECLS.get(tone, 'pill-n'), t)

def btn(label, glyph=None, small=False):
    return '<button type="button" class="btn%s">%s%s</button>' % (' btn-sm' if small else '', icon(glyph, 16) if glyph else '', label)

def primary(label, glyph, kbd):
    return '<button type="button" class="btn btn-primary">%s%s%s</button>' % (icon(glyph, 16) if glyph else '', label, ck.kbd(kbd, True) if kbd else '')

def link(t):
    return '<a href="#" class="link">%s</a>' % t

def finding(fact, rest, pad='', size=26):
    return '        <div class="finding"><p class="lede-figure">%s%s</p></div>\n' % (fact, ' <span class="q">%s</span>' % rest if rest else '')

def params(chips, right='', pad=''):
    out = []
    for g, l, k in chips:
        if k == 'sep':
            out.append('<span class="sepv"></span>'); continue
        if k in ('menu', 'on'):
            out.append('<span class="chipsel%s">%s%s%s</span>' % (' is-set' if k == 'on' else '', icon(g, 14) if g else '', l, icon('chevronDown', 14)))
        else:
            out.append(btn(l, g))
    r = '<div class="end"><span class="ws-n" style="font-family:var(--font-sans)">%s</span></div>' % right if right else ''
    return '        <div class="ws-tools" style="flex-wrap:wrap">%s%s</div>\n' % (''.join(out), r)

def tabs(names, on, pad='', counts=None):
    out = []
    for i, n in enumerate(names):
        c = ' <span class="mono muted">%s</span>' % counts[i] if counts and counts[i] else ''
        out.append('<button class="tab" role="tab" aria-selected="%s">%s%s</button>' % ('true' if n == on else 'false', n, c))
    return '        <div class="tabs" role="tablist" style="padding:0 24px">%s</div>\n' % ''.join(out)

def band(label, right='', top=True):
    right = right if numeric(right) else ''
    return '        <div class="group-head" style="padding-top:%s"><h2>%s</h2>%s</div>\n' % ('24px' if top else '16px', label, '<span class="sum">%s</span>' % right if right else '')

def tiles(items, cols=None, pad=''):
    """The KPI strip: one bordered box, a label, the figure in mono, then the change in its tone and the note."""
    cols = cols or len(items)
    out = []
    for it in items:
        l, v, note = it[0], it[1], it[2]
        tone = it[3] if len(it) > 3 else ''
        delta = it[4] if len(it) > 4 else ''
        tc = {'up': V('success'), 'down': V('danger'), 'warn': V('warning'), '': V('muted')}[tone]
        dl = '<span class="mono" style="color:%s">%s</span> ' % (tc, delta) if delta else ''
        nc = tc if (tone and not delta) else V('muted')
        out.append('<div class="kt"><span class="kt-l">%s</span><span class="kt-v">%s</span><span class="kt-n">%s<span style="color:%s">%s</span></span></div>' % (l, v, dl, nc, note))
    return '        <div style="padding:16px 24px 8px"><div class="kstrip" style="grid-template-columns:repeat(%d,minmax(0,1fr))">%s</div></div>\n' % (cols, ''.join(out))

def kpi_tile(label, value, delta, tone, note, bars7, glyph=None, foot='', span=3):
    tc = {'up': V('success'), 'down': V('danger'), 'warn': V('warning'), '': V('muted')}[tone]
    mx = max(bars7) or 1
    bs = ''.join('<i style="height:%d%%;background:%s"></i>' % (round(b * 100 / mx), V('ink-2') if i == len(bars7) - 1 else V('rule')) for i, b in enumerate(bars7))
    f = '<span class="kpi-f">%s</span>' % foot if foot else ''
    return ('<a href="#" class="kpi" style="grid-column:span %d"><span class="kpi-l">%s%s</span><span class="kpi-v">%s</span>'
            '<span class="kpi-n"><span class="mono" style="color:%s">%s</span> %s</span><span class="kpi-b">%s</span>%s</a>') % (span, icon(glyph, 14) if glyph else '', label, value, tc, delta, note, bs, f)

def panel(title, inner, count='', span=12, count_tone='neutral'):
    ct = '<span class="pill %s">%s</span>' % ('pill-bad' if count_tone == 'bad' else 'pill-n', count) if count else ''
    return '<section class="kpanel" style="grid-column:span %d"><div class="kpanel-h"><h2>%s</h2>%s</div>%s</section>' % (span, title, ct, inner)

def bars(title, rows, sub='', w_label='140px', pad='16px 24px 20px', hi_rows=()):
    out = []
    for r in rows:
        l, v, f = r[0], r[1], r[2]
        tone = r[3] if len(r) > 3 else ''
        col = {'': V('muted'), 'hi': V('accent'), 'warn': V('warning'), 'faint': V('rule')}[tone]
        out.append('<div class="hbar" style="grid-template-columns:%s minmax(0,1fr) 96px"><span class="truncate">%s</span><span class="hbar-t"><i style="width:%s%%;background:%s"></i></span><span class="num">%s</span></div>' % (w_label, l, round(f * 100, 1), col, v))
    s = '<span class="sum">%s</span>' % sub if sub else ''
    return '<section class="kblock" style="padding:%s"><div class="kblock-h"><h3>%s</h3>%s</div>%s</section>' % (pad, title, s, ''.join(out))

HEX = {'ink': '#26251f', 'muted': '#716f69', 'faint': '#a3a19b', 'line': '#eeedea', 'acc': '#2563eb', 'acc_t': '#b84a0c'}
def trend(title, values, labels, sub='', width=520, height=150, pad='16px 24px 20px', fmt=None, dashed=None, color=None):
    mx = max(values + (dashed or [])) * 1.1 or 1
    n = len(values)
    def pts(vals):
        return ' '.join('%.1f,%.1f' % (8 + i * (width - 16) / (n - 1), 8 + (height - 16) * (1 - v / mx)) for i, v in enumerate(vals))
    p = pts(values)
    area = '8,%d %s %.1f,%d' % (height - 8, p, width - 8, height - 8)
    col = HEX['acc_t'] if C.get('name') == 'tender' else HEX['acc']
    d = ('<polyline points="%s" fill="none" stroke="%s" stroke-width="1.5" stroke-dasharray="4 4"/>' % (pts(dashed), HEX['faint'])) if dashed else ''
    grid = ''.join('<line x1="8" x2="%d" y1="%.1f" y2="%.1f" stroke="%s" stroke-width="1"/>' % (width - 8, y, y, HEX['line']) for y in (8 + (height - 16) * k / 3 for k in range(4)))
    lab = ''.join('<span>%s</span>' % l for l in labels)
    s = '<span class="sum">%s</span>' % sub if sub else ''
    svg = '<svg viewBox="0 0 %d %d" width="100%%" height="%d" preserveAspectRatio="none" role="img" aria-label="%s">%s<polygon points="%s" fill="%s" opacity="0.10"/>%s<polyline points="%s" fill="none" stroke="%s" stroke-width="2"/></svg>' % (width, height, height, title, grid, area, col, d, p, col)
    return '<section class="kblock" style="padding:%s"><div class="kblock-h"><h3>%s</h3>%s</div>%s<div class="axis">%s</div></section>' % (pad, title, s, svg, lab)

def columns_chart(title, series, labels, keys, sub='', height=150, pad='16px 24px 20px', fmt=None):
    n = len(labels)
    tot = [sum(s[i] for s in series) for i in range(n)]
    mx = max(tot) * 1.1
    cols = []
    for i in range(n):
        segs = ''.join('<span style="display:block;height:%.1f%%;background:%s"></span>' % (series[k][i] / mx * 100, keys[k][1]) for k in range(len(keys)))
        cols.append('<div class="col"><div style="height:%dpx;display:flex;flex-direction:column-reverse;padding:0 6px">%s</div><span>%s</span></div>' % (height, segs, labels[i]))
    legend = ''.join('<span class="lg"><i style="background:%s"></i>%s</span>' % (c, nm) for nm, c in keys)
    s = '<span class="sum">%s</span>' % sub if sub else ''
    return '<section class="kblock" style="padding:%s"><div class="kblock-h"><h3>%s</h3>%s<span style="margin-left:auto;display:flex;gap:14px">%s</span></div><div class="cols">%s</div></section>' % (pad, title, s, legend, ''.join(cols))

def table(cols, rows, totals=None, pad='', rowh=40, head=True, group=None):
    """The worksheet table: a ground head, 40px rows, mono right-aligned figures, groups and a total row on ground."""
    def cell(x, i):
        right = cols[i][2] == 'r'
        if isinstance(x, str): x = (x, 'num' if right else '')
        t, k = x[0], x[1]
        tone = x[2] if len(x) > 2 else 'neutral'
        cls = 'num' if right else ''
        st = ''
        if k == 'chip': return '<td>%s</td>' % chip(t, tone)
        if k == 'html': return '<td%s>%s</td>' % (' class="num"' if right else '', t)
        if k == 'link': return '<td><a href="#" class="link">%s</a></td>' % t
        if k == 'code': t = '<span class="ref">%s</span>' % t
        if k == 'lead': t = '<span class="cell-lead">%s</span>' % t
        if k == 'muted': cls += ' muted'
        if k == 'faint': st = 'color:var(--color-faint)'
        if k == 'strong': st = 'font-weight:600;color:var(--color-ink)'
        if k == 'bad': st = 'color:var(--color-danger);font-weight:500'
        if k == 'ok': st = 'color:var(--color-success);font-weight:500'
        if k == 'warn': st = 'color:var(--color-warning);font-weight:500'
        if k in ('num', 'strong', 'bad', 'ok', 'warn', 'faint') and not right: cls += ' mono'
        return '<td%s%s>%s</td>' % (' class="%s"' % cls.strip() if cls.strip() else '', ' style="%s"' % st if st else '', t)
    th = ''.join('<th%s>%s</th>' % (' class="num"' if c[2] == 'r' else '', c[0]) for c in cols) if head else ''
    body = ''
    for r in rows:
        if isinstance(r, tuple) and r and r[0] == '__group__':
            fig = r[3] if len(r) > 3 and numeric(r[3]) else ''
            body += '<tr class="grp"><td colspan="%d">%s<span class="n">%s</span>%s</td></tr>' % (len(cols), r[1], r[2] if len(r) > 2 else '', '<span class="mono" style="float:right">%s</span>' % fig if fig else '')
            continue
        sel = False
        if isinstance(r, dict):
            sel = r.get('sel'); r = r['cells']
        body += '<tr%s>%s</tr>' % (' aria-selected="true"' if sel else '', ''.join(cell(x, i) for i, x in enumerate(r)))
    if totals:
        body += '<tr class="tot">%s</tr>' % ''.join('<td%s>%s</td>' % (' class="num"' if cols[i][2] == 'r' else '', t) for i, t in enumerate(totals))
    cg = ''.join('<col style="width:%s">' % c[1] if c[1].endswith('px') else '<col>' for c in cols)
    return '        <div class="ws" style="flex:none"><table class="table" style="table-layout:fixed"><colgroup>%s</colgroup>%s<tbody>%s</tbody></table></div>\n' % (cg, '<thead><tr>%s</tr></thead>' % th if head else '', body)

def pager(rng, sums=''):
    return '        <div class="ws-foot" style="margin-top:auto"><b>%s</b>%s</div>\n' % (rng, sums)

def grid2(a, b, ratio='minmax(0, 1fr) minmax(0, 1fr)', top=True):
    return '        <div class="cm-grid2" style="display:grid;grid-template-columns:%s;%s"><div style="box-shadow:inset -1px 0 0 var(--color-line);min-width:0">%s</div><div style="min-width:0">%s</div></div>\n' % (ratio, 'box-shadow:inset 0 1px 0 var(--color-line)' if top else '', a, b)

def aside(inner, w=320):
    return '      <aside class="kaside" style="width:%dpx">%s</aside>\n' % (w, inner)

def label(t):
    return '<span class="sec-title">%s</span>' % t

def kv(rows):
    return '<dl class="attrs">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in rows)

def action_card(title, body, button, glyph='arrowRight'):
    return '<div class="card" style="display:flex;flex-direction:column;gap:8px"><b style="font-weight:600;color:var(--color-ink)">%s</b><span style="color:var(--color-ink-2);line-height:1.5">%s</span><span>%s</span></div>' % (title, body, btn(button, glyph))

VANE_MARK = lambda: ck.vmark(18)

# ---------- shell ----------
RAILKIT = {'funnel': 'pipeline', 'calendar': 'visits', 'storefront': 'showroom', 'wallet': 'books', 'user': 'person', 'barChart': 'reports', 'clipboard': 'docs'}
def rail_html(vertical, cur):
    v = NAV['V'].get(vertical, NAV['V']['crm'])
    items = []
    for key, lab, g in v['items']:
        items.append((key, lab, RAILKIT.get(g, kicon(g))))
        if key == 'reports':
            items.append(('explore', 'Explore', 'explore'))
    # the reference order: People last, after Build
    ppl = [i for i in items if i[0] == 'people']
    items = [i for i in items if i[0] != 'people'] + ppl
    h = '<nav class="rail-m" aria-label="Modules"><span class="ws-tile" aria-label="%s">%s</span>' % (v['workspace'], ck.ic('ws'))
    for key, lab, k in items:
        on = key == cur
        h += '<a class="rm%s" href="#%s" aria-label="%s"%s>%s</a>' % (' is-on' if on else '', lab, lab, ' aria-current="page"' if on else '', ck.ic(k))
    h += '<span class="grow"></span><a class="rm%s" href="#vane" aria-label="Vane">%s</a><a class="rm" href="#settings" aria-label="Management">%s</a><span class="me" aria-label="James Nyabadza">%s</span></nav>' % (
        ' is-on' if cur == 'vane' else '', ck.vmark(20), ck.ic('gear'), ck.ic('person'))
    return h

def panel_html(module, current):
    m = NAV['M'].get(module, NAV['M']['books'])
    def row(r):
        lab, g, n = r[0], (r[1] if len(r) > 1 else None), (r[2] if len(r) > 2 else None)
        if g:
            return ck.pn(lab, kicon(g), n, lab == current)
        return ck.pn(lab, None, n, lab == current, dot=True)
    body = ''.join(row(r) for r in m['items'])
    for g in m['groups']:
        open_ = 'open' in g or len(m['groups']) < 3 or any(r[0] == current for r in g['items'])
        body += ck.pg(g['head'], [row(r) for r in g['items']] if open_ else [], add=g.get('add', False))
    return ck.panel(m['title'], body)

def frame(rail, module, current, top, body, aside='', overlay='', h=900, railCur='reports', panel=True):
    tv = TENDER_VARS if C.get('name') == 'tender' else ''
    cols = '' if panel else 'grid-template-columns:56px minmax(0,1fr);'
    return ('<div class="sh" style="position:relative;%s%s">%s%s<main class="mn" style="overflow:hidden">%s'
            '<div style="flex:1 1 auto;display:flex;min-height:0"><div class="kbody">%s</div>%s</div></main>%s</div>') % (
        tv, cols, rail_html(rail, railCur), panel_html(module, current) if panel else '', top, body, aside, overlay)

def topbar(title, glyph, extra=''):
    find = 'search="{{no}}"' not in extra
    vane = 'vane="{{no}}"' not in extra
    vopen = 'vaneOpen="{{yes}}"' in extra
    r = (ck.find_all() + ck.iconbtn('bell', 'Notifications') if find else '') + (ck.vane_btn(5, vopen) if vane else '') + '[[ACTIONS]]'
    return '<header class="tb-m"><h1>%s%s</h1><div class="tb-r">%s</div></header>' % (icon(glyph, 16) if glyph else '', title, r)

def render_actions(actions):
    out = ''
    sec = [a for a in actions if a.get('kind') == 'secondary']
    for a in actions:
        k = a.get('kind')
        if k == 'primary':
            out += '<button class="btn btn-primary">%s%s%s%s</button>' % (icon(a['glyph'], 16) if a.get('glyph') else '', a['label'], icon('chevronDown', 14) if a.get('menu') else '', ck.kbd(a['kbd'], True) if a.get('kbd') else '')
        elif k == 'icon':
            out += ck.iconbtn(kicon(a.get('glyph', 'more')), a.get('label', 'More'))
        else:
            out += '<button class="btn">%s%s%s</button>' % (icon(a['glyph'], 16) if a.get('glyph') else '', a['label'], icon('chevronDown', 14) if a.get('menu') else '')
    return out

STATIC_ICON = re.compile(r'<dc-import name="Icon" glyph="(\w+)" size="(\d+)"[^>]*></dc-import>')
def doc(title, inner, vals, w=1440, h=900):
    inner = inner.replace('[[ACTIONS]]', render_actions(vals.get('actions', []) if isinstance(vals, dict) else []))
    inner = STATIC_ICON.sub(lambda m: icon(m.group(1), int(m.group(2))), inner)
    s = ck.doc(title, inner, w, h, css='')
    return s.replace('class Component extends DCLogic { renderVals() { return {}; } }',
                     'class Component extends DCLogic {\n  renderVals() {\n    return %s;\n  }\n}' % json.dumps(vals, ensure_ascii=False, indent=2).replace('\n', '\n    '))

def save(P, fname, s):
    open(P + '/' + fname, 'w').write(s)

# ---------- the builder's own components, in the kit's builder frame ----------
ATTR = re.compile(r'(\w+)="([^"]*)"')
def studio_bar(attrs):
    a = dict(ATTR.findall(attrs))
    mark = '<span style="width:28px;height:28px;border-radius:7px;background:%s;color:#fff;display:grid;place-items:center;flex:none">%s</span>' % (a.get('markBg', '#2563eb'), icon(a.get('markGlyph', 'file'), 15))
    extra = '<button class="btn">%s</button>' % a['extraButton'] if a.get('extraButton') and a.get('extraButton') != 'Publish' else ''
    pub = a.get('extraButton') == 'Publish' or True
    return ('<header class="st-bar" style="height:56px;flex:none;position:relative">%s%s<div class="st-name"><b class="truncate">%s</b><span>%s</span></div>'
            '<div class="seg st-mode" role="tablist" aria-label="Mode"><button role="tab" aria-selected="true">%sBuild</button><button role="tab" aria-selected="false">%sPreview</button></div>'
            '<div class="st-end"><span class="saved">%s%s</span>%s<button class="btn btn-primary">%sPublish%s</button></div></header>') % (
        ck.iconbtn('back', 'Back'), mark, a.get('name', ''), a.get('sub', ''), icon('pencil', 14), icon('eye', 14), icon('check', 14), a.get('saved', 'Saved'), extra, icon('send', 16), ck.kbd('Ctrl ↵', True))

def studio_outline(attrs, vals):
    a = dict(ATTR.findall(attrs))
    groups = vals.get('outline', []) if 'outline' in attrs else []
    h = '<aside class="st-out" aria-label="Outline" style="flex:none;min-height:0"><button class="btn st-add">%s%s%s</button>' % (icon('plus', 16), a.get('addLabel', 'Add'), ck.kbd('/'))
    for g in groups:
        h += '<div class="oh">%s</div>' % g.get('head', '')
        for it in g.get('items', []):
            h += '<button class="oi%s%s">%s<span class="truncate">%s</span></button>' % (' is-on' if it.get('on') else '', ' is-sub' if it.get('sub') else '', icon(it.get('glyph', 'file'), 16), it.get('label', ''))
    return h + '</aside>'

def form_paper(attrs, vals):
    a = dict(ATTR.findall(attrs))
    title = a.get('title', '')
    secs = vals.get('sections', [])
    foot = vals.get('foot', {})
    out = '<div class="fpaper"><h1 class="text-title">%s</h1>' % title
    for s in secs:
        out += '<section class="fs"><h2>%s</h2>' % s.get('h', '')
        for q in s.get('qs', []):
            tag = '<span class="sel-tag">%s%s</span>' % (icon(q.get('tagGlyph', 'grid4'), 12), q['tag']) if q.get('tag') else ''
            body = ''
            k = q.get('kind')
            if k == 'rooms':
                body = '<div class="rooms">%s</div>' % ''.join('<div class="rm"><input class="input" aria-label="Room" value="%s"><input class="input num" aria-label="Length, m" value="%s"><span class="muted">×</span><input class="input num" aria-label="Width, m" value="%s"><span class="num muted">%s</span></div>' % (r['name'], r['a'], r['b'], r['area']) for r in q.get('rooms', []))
            elif k in ('choice', 'checks'):
                body = '<div style="display:flex;flex-wrap:wrap;gap:8px 24px">%s</div>' % ''.join('<label class="check"><input type="%s"%s aria-label="%s">%s</label>' % ('checkbox' if k == 'checks' else 'radio', ' checked' if o.get('on') else '', o['l'], o['l']) for o in q.get('opts', []))
            elif k == 'one':
                body = '<div style="display:flex;align-items:center;gap:8px"><input class="input%s" style="width:%s" aria-label="%s" value="%s"><span class="muted">%s</span></div>' % (' num' if q.get('num') else '', '96px' if q.get('num') else '100%', q['q'], q.get('value', ''), q.get('unit', ''))
            fig = '<span class="qr-fig num">%s</span>' % q['fig'] if q.get('fig') else ''
            out += '<div class="qr%s%s">%s<div class="qr-l"><span class="qr-q">%s</span><span class="qr-m">%s</span></div>%s<div class="qr-in">%s</div></div>' % (' sel' if q.get('tag') else '', ' is-sub' if q.get('child') else '', tag, q['q'], q.get('meta', ''), fig, body)
        out += '</section>'
    out += '</div>'
    if foot:
        out += '<div style="position:sticky;bottom:0;display:flex;align-items:center;gap:12px;height:64px;padding:0 24px;background:var(--color-surface);box-shadow:inset 0 1px 0 var(--color-line);margin-top:auto"><span style="flex:1;color:var(--color-ink-2)">%s <b class="mono" style="color:var(--color-ink)">%s</b>%s</span>%s</div>' % (
            foot.get('text', ''), foot.get('strong', ''), foot.get('rest', ''), btn(foot.get('button', ''), foot.get('glyph')))
    return '<div style="flex:1;display:flex;flex-direction:column;background:var(--color-ground);overflow:auto">%s</div>' % out

_doc0 = doc
def doc(title, inner, vals, w=1440, h=900):
    v = vals if isinstance(vals, dict) else {}
    inner = re.sub(r'<dc-import name="StudioBar"([^>]*)></dc-import>', lambda m: studio_bar(m.group(1)), inner)
    inner = re.sub(r'<dc-import name="StudioOutline"([^>]*)></dc-import>', lambda m: studio_outline(m.group(1), v), inner)
    inner = re.sub(r'<dc-import name="FormPaper"([^>]*)></dc-import>', lambda m: form_paper(m.group(1), v), inner)
    return _doc0(title, inner, vals, w, h)
