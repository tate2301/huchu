# Pieces shared by every vertical's Reports pages, in the handover kit
from ri_kit import *
import ri_data as d

def topic_cards(cards, cols=3):
    out = ''.join('<a href="#" class="topic"><span class="topic-k">%s%s%s</span><span class="topic-v">%s</span><span class="topic-l">%s</span><span class="topic-n">%s</span></a>' % (
        icon(g, 14), name, '<span style="margin-left:auto;display:flex">%s</span>' % icon('arrowRight', 14, 'var(--color-faint)'), fig, line, note) for name, g, fig, line, note in cards)
    return '        <div class="topics" style="grid-template-columns:repeat(%d,minmax(0,1fr))">%s</div>\n' % (cols, out)

def opened(rows):
    return table([('Template', 'minmax(0, 1.3fr)', 'l'), ('Area', 'minmax(0, 1fr)', 'l'), ('Made by', '130px', 'l'), ('Seen by', '110px', 'l'), ('Last opened', '130px', 'l'), ('Opens, 30 days', '120px', 'r')],
                 [[(r[0], 'link'), (r[1], 'muted'), (r[2], 'chip', 'sel') if r[2] == 'Corelith' else (r[2], ''), (r[3], 'chip'), (r[4], 'muted'), r[5]] for r in rows])

HEALTH = {'Healthy': 'ok', 'Watch': 'warn', 'Critical': 'bad'}
def health_list(rows):
    return ''.join('<div class="hrow"><span class="hrow-m">%s%s</span>%s<span class="hrow-s">%s</span></div>' % (icon(g, 16), m, chip(st, HEALTH[st]), s_) for m, g, st, s_ in rows)

def overview(P, fname, title, v, module, fact, rest, cards, opened_rows, health_rows, cols=3, h=900, actions=None):
    vt = [x for x in d.VERTICALS if x[0] == v][0]
    tl = ''.join(kpi_tile(c[0], c[2], c[3], c[4], c[5], c[6], span=c[7] if len(c) > 7 else 12 // cols) for c in cards)
    op = panel('Opened most', opened(opened_rows), str(len(opened_rows)), span=8)
    hp = panel('How each module is doing', health_list(health_rows), str(len(health_rows)), span=4)
    body = '        %s<div class="kgrid">%s%s%s</div>\n' % (finding(fact, rest), tl, op, hp)
    vals = {'actions': actions or [{'label': 'New template', 'kind': 'secondary', 'glyph': 'fileCheck'}, {'label': 'Build a report', 'kind': 'primary', 'glyph': 'plus', 'kbd': 'N'}]}
    save(P, fname, doc(title, frame(vt[3], module, 'Overview', topbar('Reports', 'dashboard'), body, h=h), vals, 1440, h))

def insight_aside(cards, send=True):
    cs = ''.join(action_card(*c) for c in cards)
    snd = '<section style="display:flex;flex-direction:column;gap:8px;padding-top:16px;box-shadow:inset 0 1px 0 var(--color-line)">%s<span style="color:var(--color-ink-2)">This page, as a PDF, every Monday at 07:00.</span><span>%s</span></section>' % (label('Send me this'), btn('Send it', 'clock')) if send else ''
    return aside(label('Do something about it') + cs + snd, 320)

def chipbtn(g, l, k='menu'):
    if k in ('menu', 'on'):
        return '<span class="chipsel%s">%s%s%s</span>' % (' is-set' if k == 'on' else '', icon(g, 14) if g else '', l, icon('chevronDown', 14))
    return btn(l, g)

def periods(on, extra=(), right='', opts=('Today', '7 days', '30 days', '90 days', 'This month')):
    seg = ''.join('<button role="tab" aria-selected="%s">%s</button>' % ('true' if p == on else 'false', p) for p in opts)
    ex = ''.join(chipbtn(*e) for e in extra)
    return '        <div class="ws-tools" style="flex-wrap:wrap"><div class="seg" role="tablist" aria-label="Period">%s</div>%s%s</div>\n' % (seg, chipbtn('calendar', 'Range', 'plain'), ex)

def funnel(rows):
    return table([('Stage', 'minmax(0, 1fr)', 'l'), ('Reached', '90px', 'r'), ('From the stage before', '240px', 'l'), ('Median days in stage', '170px', 'r')],
                 [[(r[0], 'lead'), r[1], ('<span style="display:flex;align-items:center;gap:10px"><span class="hbar-t" style="width:120px"><i style="width:%s;background:%s"></i></span><span class="mono" style="color:%s">%s</span></span>' % (
                     r[2] or '0%', V('warning') if r[4] else V('muted'), V('warning') if r[4] else V('ink'), r[2] or '—'), 'html'), r[3]] for r in rows])

def mgmt_frame(current, top, body, aside_html='', h=900):
    return '<div class="mg">%s<main class="mn" style="overflow:hidden">%s<div style="flex:1 1 auto;display:flex;min-height:0"><div class="kbody">%s</div>%s</div></main></div>' % (ck.mg_side(current), top, body, aside_html)

def sheet(title, sub, inner, foot, w=440):
    return ('<div class="over"></div><aside class="drawer" role="dialog" aria-label="%s" style="width:%dpx"><div class="drawer-h" style="height:auto;min-height:56px;padding-top:14px;padding-bottom:14px;align-items:flex-start">'
            '<div style="display:flex;flex-direction:column;gap:2px"><span>%s</span><span style="font-size:13px;font-weight:400;color:var(--color-muted)">%s</span></div>%s</div>'
            '<div class="drawer-b" style="gap:20px">%s</div><div class="drawer-f">%s</div></aside>') % (title, w, title, sub, ck.iconbtn('x', 'Close'), inner, foot)

def field(lab, value, hint='', mono=False, menu=False):
    h = '<span class="muted" style="font-size:13px">%s</span>' % hint if hint else ''
    return '<label class="field"><span style="font-weight:500;color:var(--color-ink)">%s</span><span class="selbox"%s><span>%s</span>%s</span>%s</label>' % (
        lab, ' style="font-family:var(--font-mono)"' if mono else '', value, icon('chevronDown', 12) if menu else '', h)

def radios(lab, opts, on):
    o = ''.join('<label class="ropt%s"><span class="rdot"></span><span><b>%s</b><span>%s</span></span></label>' % (' is-on' if t == on else '', t, s) for t, s in opts)
    return '<div style="display:flex;flex-direction:column;gap:8px"><span style="font-weight:500;color:var(--color-ink)">%s</span>%s</div>' % (lab, o)

def switch_row(t, s, on=True):
    return '<div style="display:flex;align-items:center;gap:12px"><span style="flex:1;display:flex;flex-direction:column;gap:2px"><b style="font-weight:500;color:var(--color-ink)">%s</b><span class="muted" style="font-size:13px">%s</span></span><span class="%s" role="switch" aria-checked="%s"></span></div>' % (
        t, s, 'swon' if on else 'swoff', 'true' if on else 'false')

def primary_k(label, kbd):
    return '<button type="button" class="btn btn-primary">%s%s</button>' % (label, ck.kbd(kbd, True))
