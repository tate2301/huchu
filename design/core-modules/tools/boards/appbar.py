"""The standard app bar (owner, 19 Oct), applied to every board's top bar in place.

  title · … · [the page's actions] Vane, Search (icon button, Ctrl K), Notifications.
  Everything sits in the right section. Vane, Search and Notifications are on every page and
  never move; the page's actions and contextual things appear to their left.
  More than two actions become one button group: the primary action and a dropdown.

Run: python3 design/core-modules/tools/boards/appbar.py design/core-modules/boards/canvas
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import ic

VOID = {'input', 'img', 'br', 'hr', 'meta', 'link', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'stop'}
TAG = re.compile(r'<(/?)([a-zA-Z][\w-]*)([^>]*?)(/?)>')


def top_level(html):
    """Split an HTML fragment into its top-level elements."""
    out, depth, start = [], 0, None
    for m in TAG.finditer(html):
        closing, name, selfclose = m.group(1), m.group(2).lower(), m.group(4)
        if not closing:
            if depth == 0:
                start = m.start()
            if name in VOID or selfclose:
                if depth == 0:
                    out.append(html[start:m.end()])
                continue
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                out.append(html[start:m.end()])
    return out


def search_btn():
    return '<button class="btn btn-quiet btn-icon" aria-label="Search everything, Ctrl K" title="Search · Ctrl K">%s</button>' % ic('search')


def group(main, primary):
    cls = 'btn btn-primary btn-icon' if primary else 'btn btn-icon'
    caret = '<button class="%s" aria-haspopup="menu" aria-label="More actions" style="box-shadow:inset 1px 0 0 rgba(255,255,255,.24)">%s</button>' % (cls, ic('down'))
    return '<div class="btn-group" role="group">%s%s</div>' % (main, caret)


def standard(header):
    m = re.match(r'(<header class="tb-m"[^>]*>)(.*?)(<div class="tb-r">)(.*)(</div></header>)$', header, re.S)
    if not m:
        return header
    open_, title, _, right, _ = m.groups()
    acts = []
    # An earlier pass put the actions on the left, after the title; bring them back.
    a = re.search(r'<div class="tb-acts"[^>]*>', title)
    if a:
        inner = title[a.end():]
        block = top_level(title[a.start():])[0]
        acts = top_level(block[block.index('>') + 1:-len('</div>')])
        title = title[:a.start()]
    vane = find = bell = None
    for el in top_level(right):
        if 'tb-find' in el[:80] or 'aria-label="Search everything' in el[:120]:
            find = el
        elif 'aria-label="Notifications"' in el[:120]:
            bell = el
        elif 'vn-b' in el[:60]:
            vane = el
        else:
            acts.append(el)
    if len(acts) > 2:
        prim = next((a for a in acts if 'btn-primary' in a[:60]), None)
        main = prim or next((a for a in acts if 'btn-icon' not in a[:60]), acts[-1])
        acts = [group(main, prim is not None)]
    fixed = (vane or '') + (search_btn() if find else '') + (bell or '')
    return '%s%s<div class="tb-r">%s%s</div></header>' % (open_, title, ''.join(acts), fixed)


def run(root):
    n = 0
    for f in sorted(os.listdir(root)):
        if not f.endswith('.dc.html'):
            continue
        p = os.path.join(root, f)
        s = open(p).read()
        t = re.sub(r'<header class="tb-m".*?</header>', lambda m: standard(m.group(0)), s, flags=re.S)
        if t != s:
            open(p, 'w').write(t)
            n += 1
    print(n, 'boards changed')


if __name__ == '__main__':
    run(sys.argv[1])
