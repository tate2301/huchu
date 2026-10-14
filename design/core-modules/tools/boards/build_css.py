import re, glob, collections, sys
Z = 'zip-core/corelith-core-modules/html/'
FONT = '/_blob/5b8c2719f79e56705cee4939b8ccbb77'
tokens = open(Z + 'tokens.css').read()
# light by default on the canvas: drop the automatic dark block, keep [data-theme="dark"]
tokens = re.sub(r'@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{.*?\}\s*\}', '', tokens, flags=re.S)
kit = open(Z + 'kit.css').read()
cnt = collections.Counter()
order = []
for f in sorted(glob.glob(Z + '*.html')):
    s = open(f).read()
    for st in re.findall(r'<style>(.*?)</style>', s, re.S):
        for line in st.split('\n'):
            line = line.strip()
            if not line: continue
            if line not in cnt: order.append(line)
            cnt[line] += 1
shell = [r for r in order if cnt[r] >= 14 and not r.startswith('@font-face')]
extra = open('gen2/extra.css').read() + '\n/* Vane panel, from books-vane */\n' + open('gen2/vane_panel.css').read() + open('gen2/vane_fy.css').read() + open('gen2/mgmt.css').read() + '\n/* builders */\n' + open('gen2/studio.css').read()
css = '@font-face{font-family:"Inter";src:url("%s") format("woff2");font-weight:100 900;font-display:block}\n' % FONT
css += tokens + '\n' + kit + '\n/* shell, shared by every screen */\n' + '\n'.join(shell) + '\n' + extra
open('kit2/core.css', 'w').write(css)
print(len(css), 'bytes;', len(shell), 'shell rules')
