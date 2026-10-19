"""Avatars (owner, 19 Oct), applied in place to the boards no runnable generator owns any more.

  Every reference to a person or profile that can have an avatar (users, employees, CRM customers,
  leads and people, students, guardians, teachers) shows it beside the name: the photo, else the
  initials on a soft tint (ck.avatar / ck.person). Businesses with no profile get none.

The Books boards are drawn by books_pages_a.py, books_pages_b.py and books_final.py, which call
ck.person() themselves; this pass leaves those alone (OWNED). The others were
generated once (notify.py, people.py, explore.py, port/*) and then edited in place by kitpass.py and
appbar.py, so their generators no longer reproduce them; this pass follows appbar.py and edits them
in place. It only ever adds an avatar beside a name already drawn: no word changes.
It is idempotent: a name that already has its avatar is left alone.

Run: python3 design/core-modules/tools/boards/avatars.py design/core-modules/boards/canvas
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ck import avatar, person

STAFF = ('James Nyabadza', 'Rudo Mapfumo', 'Chipo Mhlanga', 'Tendai Sibanda', 'Tinashe Moyo', 'Kuda Chigumba',
         'Farai Ncube', 'Blessing Zhou', 'Simba Gondo')
FULL = {n.split()[0]: n for n in STAFF}
FIRST = '|'.join(FULL)
NAME = '|'.join(STAFF)
# Report boards draw other worlds' people too (a school, a mine); their recipients are people all the same.
OTHER = ('James Moyo', 'Rudo Chikore')

ME_ICON = re.compile(r'(<span class="me" aria-label="([^"]+)">)<svg class="ic"[^>]*>.*?</svg>(</span>)', re.S)


def full(n):
    return FULL.get(n, n)


def named(name, label=None, bold=False):
    """A person in a sentence: the avatar, 8px, the name as drawn."""
    text = label or name
    return '<span class="pnm" style="display:inline-flex;align-items:center;gap:8px;vertical-align:top">%s%s</span>' % (
        avatar(name), '<b>%s</b>' % text if bold else text)


RULES = [
    # the signed-in person at the foot of the rail
    (ME_ICON, lambda m: m.group(1) + avatar(m.group(2), 32) + m.group(3)),
    # a person in a table's lead cell, with or without their code before the name
    (re.compile(r'(<span class="cell-lead">(?:<span class="ref">[^<]*</span> ?)?)(%s)(</span>)' % NAME),
     lambda m: m.group(1) + person(m.group(2)) + m.group(3)),
    # a person alone in a cell: a rep, an assignee, an approver (full or first name)
    (re.compile(r'(<td(?: class="(?:muted|fill)")?>)(%s|%s)(</td>)' % (NAME, FIRST)),
     lambda m: m.group(1) + person(full(m.group(2)), label=m.group(2)) + m.group(3)),
    # several people in one cell: "Blessing Zhou, Tendai Sibanda"
    (re.compile(r'(<td>)((?:%s)(?:, (?:%s))+)(</td>)' % (NAME, NAME)),
     lambda m: m.group(1) + '<span style="display:inline-flex;flex-wrap:wrap;gap:4px 16px">%s</span>' % ''.join(
         person(n) for n in m.group(2).split(', ')) + m.group(3)),
    # a notification or an activity line that starts with who did it
    # (a notification from a person leads with their face, in the slot its icon had, as Vane's lead with Vane's mark)
    (re.compile(r'<svg class="ic"[^>]*>(?:(?!</svg>).)*</svg>(<div><b>)(%s)( [^<]*</b>)' % NAME, re.S),
     lambda m: avatar(m.group(2), 20) + m.group(1) + m.group(2) + m.group(3)),
    (re.compile(r'<svg class="ic"[^>]*>(?:(?!</svg>).)*</svg><div><b><span class="pnm"[^>]*>(<span class="pav"[^>]*>[^<]*</span>)(%s)</span>' % NAME, re.S),
     lambda m: m.group(1) + '<div><b>' + m.group(2)),
    (re.compile(r'(<span><b>)(%s)(</b> )' % NAME), lambda m: '<span>' + named(m.group(2), bold=True) + m.group(3)[4:]),
    # a recipient row: the kit's `.av` with a person icon becomes their initials
    (re.compile(r'<span class="av"><svg class="ic"[^>]*>.*?</svg></span>(<span><b>)(%s)(</b>)' % NAME, re.S),
     lambda m: avatar(m.group(2), 32) + m.group(1) + m.group(2) + m.group(3)),
    # a person's own page: the 56px `.av` before their name
    (re.compile(r'<span class="av" style="width:56px;height:56px"><svg class="ic"[^>]*>.*?</svg></span>(<div style="flex:1"><div[^>]*>)(%s)(</div>)' % NAME, re.S),
     lambda m: avatar(m.group(2), 56) + m.group(1) + m.group(2) + m.group(3)),
    # who a step is for, in a plan or a pay run ("Rudo", "James")
    (re.compile(r'(</span><span class="muted">)(%s)(</span></li>)' % FIRST),
     lambda m: m.group(1) + person(full(m.group(2)), label=m.group(2)) + m.group(3)),
    # "by James, 08:12": who did a step
    (re.compile(r'(<span class="muted">by )(%s)(, )' % FIRST), lambda m: m.group(1) + named(full(m.group(2)), m.group(2)) + m.group(3)),
    # who made or changed a report, in All reports
    (re.compile(r'<span class="muted truncate">((%s), [^<]*)</span>' % FIRST),
     lambda m: '<span class="muted" style="display:flex;align-items:center;gap:8px;min-width:0">%s<span class="truncate">%s</span></span>' % (
         avatar(full(m.group(2))), m.group(1))),
    # an activity list in a rail: "James arranged the page"
    (re.compile(r'(<dt>)(%s)( [^<]*</dt>)' % FIRST), lambda m: m.group(1) + named(full(m.group(2)), m.group(2)) + m.group(3)),
    # "Issued by James", "Waiting for Rudo", "submitted by Chipo Mhlanga": who a thing is by or for
    (re.compile(r'((?:<td class="fill(?: muted)?">|· )(?:Issued by|Statements opened by|Waiting for|1 line changed by|Sent by|Saved as a template by|Kept by|submitted by) )(%s|%s)\b' % (NAME, FIRST)),
     lambda m: m.group(1) + named(full(m.group(2)), m.group(2))),
    # a person after their code in a cell: "EMP-0005 Tinashe Moyo"
    (re.compile(r'(<td><span class="ref">[^<]*</span> )(%s)(</td>)' % NAME), lambda m: m.group(1) + person(m.group(2)) + m.group(3)),
    # a request card's person, after its code
    (re.compile(r'(<span class="ref">LV-\d+</span>)(<b style="color:var\(--color-ink\);font-weight:600">)(%s)(</b>)' % NAME),
     lambda m: m.group(1) + person(m.group(3), label=m.group(2) + m.group(3) + m.group(4))),
    # a rail list of people and their figures
    (re.compile(r'(<span class="muted">)(%s)(</span><span class="num")' % NAME), lambda m: m.group(1) + person(m.group(2)) + m.group(3)),
    # "reports to James Nyabadza"
    (re.compile(r'(reports to )(%s)' % NAME), lambda m: m.group(1) + named(m.group(2))),
    # who a report is sent to
    (re.compile(r'(<span class="selbox"><span>)((?:%s)(?:, (?:%s))+)(</span>)' % ('|'.join(OTHER), '|'.join(OTHER))),
     lambda m: '<span class="selbox"><span style="display:inline-flex;gap:12px;min-width:0">%s</span>' % ''.join(person(n) for n in m.group(2).split(', ')) + m.group(3)),
]


def apply(s):
    for rx, fn in RULES:
        s = rx.sub(fn, s)
    return s


# The boards the Books generators write (books_pages_a.py, books_pages_b.py, books_final.py).
OWNED = re.compile(r'^(Bk\w+|Books(Research|Moodboard|Core|Tree|Who|States\d|Flows\d))\.dc\.html$')


def run(root):
    n = 0
    for f in sorted(os.listdir(root)):
        if not f.endswith('.dc.html') or OWNED.match(f):
            continue
        p = os.path.join(root, f)
        s = open(p).read()
        t = apply(s)
        if t != s:
            open(p, 'w').write(t)
            n += 1
    print(n, 'boards changed')


if __name__ == '__main__':
    run(sys.argv[1])
