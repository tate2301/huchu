import glob, sys, html.parser
class P(html.parser.HTMLParser):
    VOID = {'br','img','input','meta','link','col','hr','source','path','line','polyline','polygon','rect','circle','stop'}
    def __init__(s): super().__init__(); s.st = []; s.err = []
    def handle_starttag(s, t, a):
        if t not in s.VOID: s.st.append(t)
    def handle_endtag(s, t):
        if t in s.VOID: return
        if s.st and s.st[-1] == t: s.st.pop()
        elif t in s.st:
            while s.st and s.st[-1] != t: s.err.append('unclosed ' + s.st.pop())
            s.st.pop()
        else: s.err.append('stray </%s>' % t)
bad = 0
for d in sys.argv[1:]:
    for f in sorted(glob.glob(d + '/*.dc.html')):
        s = open(f).read(); b = s[s.index('<x-dc>'):s.index('</x-dc>') + 7]
        p = P(); p.feed(b)
        if p.err or p.st:
            bad += 1; print(f.split('/')[-1], p.err[:3], p.st[-3:])
print('bad', bad)
