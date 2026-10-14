"""The Parts page sheet: the kit pieces every board is built from."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ck
from ck import ic, btn, primary, iconbtn, kbd, finding, group_head, status, table, pn, pg, vmark

ROOT = sys.argv[1]

TOKENS = [('Ink', 'ink'), ('Ink 2', 'ink-2'), ('Muted', 'muted'), ('Faint', 'faint'), ('Line', 'line'),
          ('Fill', 'fill'), ('Ground', 'ground'), ('Accent', 'accent'), ('Success', 'success'),
          ('Warning', 'warning'), ('Danger', 'danger'), ('Info', 'info')]

def sec(title, aside, body):
    return '<section class="xp-sec"><div><h2>%s</h2><p class="aside">%s</p></div><div>%s</div></section>' % (title, aside, body)

def row(*items):
    return '<div class="ks-row">%s</div>' % ''.join(items)

colours = '<div class="ks-sw">%s</div>' % ''.join(
    '<div><span style="background:var(--color-%s)"></span><b>%s</b><code>--color-%s</code></div>' % (k, n, k) for n, k in TOKENS)

type_ = ''.join('<p class="ks-t" style="font-size:%dpx;font-weight:%d">%s<code>%dpx · %d</code></p>' % (s, w, t, s, w) for s, w, t in [
    (28, 600, 'Money in this month'), (20, 600, 'Bank lines to match'), (16, 400, 'Four lines from CBZ since Friday are not matched.'),
    (14, 400, 'Body and table text'), (13, 500, 'Labels, chips and pills'), (12, 400, 'Notes under a field')])

buttons = row(primary('New invoice', 'plus', 'N'), btn('Export', 'export'), btn('Filter', 'filter', 'btn btn-quiet'),
              iconbtn('more', 'More'), '<span class="ks-k">%s %s</span>' % (kbd('Ctrl K'), kbd('/')))

pills = row(status('Paid', 'success'), status('Due soon', 'warning'), status('Overdue', 'danger'), status('Draft'),
            '<span class="pill pill-ok">Matched</span>', '<span class="pill pill-warn">Check</span>',
            '<span class="pill pill-bad">Failed</span>', '<span class="pill pill-info">New</span>', '<span class="pill pill-n">12</span>')

controls = row('<div class="seg" role="tablist" aria-label="Lines"><button role="tab" aria-selected="true">To match <span class="pn-n">4</span></button>'
               '<button role="tab" aria-selected="false">Matched</button><button role="tab" aria-selected="false">Everything</button></div>',
               '<span class="chipsel">Customer <b>Any</b>%s</span>' % ic('down'),
               '<div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="true">Element</button>'
               '<button class="tab" role="tab" aria-selected="false">Data <span class="count">14</span></button>'
               '<button class="tab" role="tab" aria-selected="false">Settings</button></div>')

data = (finding('USD 48,210 came in this month.', 'That is 12% more than September, mostly from Mutare.')
        + group_head('Invoices', 3)
        + table(['Number', 'Customer', 'Due', 'Status', 'Amount'],
                [['<span class="ref">INV-1042</span>', 'Mutare Tiles', '14 Oct', status('Due soon', 'warning'), '4,200.00'],
                 ['<span class="ref">INV-1041</span>', 'Harare Interiors', '2 Oct', status('Overdue', 'danger'), '1,850.00'],
                 ['<span class="ref">INV-1040</span>', 'Bulawayo Build', '28 Sep', status('Paid', 'success'), '9,120.00']],
                total=['', '', '', 'Total', '15,170.00'], numcols=(4,)))

shell = ('<div class="ks-shell">%s<aside class="panel-m" aria-label="Books"><div class="pm-h"><b>Books</b></div><div class="pm-body">%s</div></aside></div>'
         % (ck.rail('Books'), pg('Money', [pn('Overview', 'overview', on=True), pn('Invoices', 'invoice', 12), pn('Bank', 'bank', 4)])))

vane = row('<span class="ks-k">%s %s %s</span>' % (vmark(16), vmark(20), vmark(24)), ck.vane_btn(5), ck.vane_btn(5, on=True))

ICONS = ['search', 'plus', 'filter', 'export', 'more', 'gear', 'bell', 'person', 'books', 'bank', 'invoice', 'insights',
         'reports', 'explore', 'docs', 'pipeline', 'visits', 'showroom', 'edit', 'publish', 'check', 'down', 'help', 'panel']
icons = '<div class="ks-ic">%s</div>' % ''.join('<div>%s<code>%s</code></div>' % (ic(k), k) for k in ICONS if k in ck.IC)

body = ('<div class="xp"><div class="xp-k">%s Parts</div><h1>The kit</h1>'
        '<p class="lede">Every board on this canvas is built from these pieces: the reference colours, Inter, the filled icons, the rail and panel, the table and the finding. Change a piece here and in the stylesheet, not on a single board.</p>'
        % ic('grid4' if 'grid4' in ck.IC else 'docs')
        + sec('Colour', 'Ink on white. One accent. Status colours only carry state.', colours)
        + sec('Type', 'Inter in six sizes. Sentence case everywhere.', type_)
        + sec('Buttons', 'One primary per screen, and it shows its shortcut.', buttons)
        + sec('Status', 'A status dot in tables, a pill when it needs more weight.', pills)
        + sec('Controls', 'Segments switch a view, chips filter it, tabs split a panel.', controls)
        + sec('Finding and table', 'A page opens on the one fact that matters, then the rows behind it.', data)
        + sec('Rail and panel', 'Modules on the rail. Management sits behind the gear, never on the panel foot.', shell)
        + sec('Vane', 'The mark and the top bar button. The count is what waits for you.', vane)
        + sec('Icons', 'Filled, 24 grid, drawn at 16 or 20.', icons)
        + '</div>')

CSS = '''
.ks-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-12)}
.ks-k{display:inline-flex;gap:var(--space-8);align-items:center}
.ks-sw{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-16)}
.ks-sw span{display:block;height:56px;border-radius:var(--radius-control);box-shadow:var(--shadow-ring)}
.ks-sw b{display:block;margin-top:var(--space-8);font-weight:500}
.ks-sw code,.ks-t code,.ks-ic code{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--color-muted)}
.ks-t{display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-16);margin:0 0 var(--space-12)}
.ks-shell{display:flex;height:320px;border-radius:var(--radius-card);box-shadow:var(--shadow-ring);overflow:hidden;width:max-content}
.ks-shell .panel-m{height:100%}
.ks-ic{display:grid;grid-template-columns:repeat(6,1fr);gap:var(--space-16)}
.ks-ic div{display:flex;flex-direction:column;align-items:center;gap:var(--space-8);padding:var(--space-12);border-radius:var(--radius-control);box-shadow:var(--shadow-ring)}
.ks-ic .ic{width:20px;height:20px}
'''

ck.write(ROOT, 'KitSheet', 'The kit', body, 1440, 2600, CSS)
print('kitsheet ok')
