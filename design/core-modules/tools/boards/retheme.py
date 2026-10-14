"""Second pass: bring every older board onto the handover kit's tokens, type and shell sizes."""
import os, re, sys
P = sys.argv[1]
KIT = set(os.listdir('canvas2/project'))
FONT = '/_blob/5b8c2719f79e56705cee4939b8ccbb77'
MAP = {'#0b0c14': '#26251f', '#3b3d47': '#5f5d57', '#6b6d78': '#716f69', '#9aa1ad': '#a3a19b', '#e7e9ef': '#e5e4e1', '#eef0f4': '#eeedea',
       '#eef0f3': '#f4f3f1', '#d4d9e0': '#dbd9d5', '#f6f7f9': '#faf9f8', '#e8effd': '#eef3fe', '#17734c': '#17694e', '#e7f4ee': '#e6f4ee',
       '#8a5a10': '#8a5200', '#fbf1dc': '#fdf3e1', '#b42318': '#c2321b', '#c9cdd4': '#d6d4cf', '#4b5363': '#5f5d57', '#1f2937': '#26251f',
       '#2a2e37': '#26251f', '#f9f9f9': '#faf9f8'}
FACE = '@font-face{font-family:"Inter";src:url("%s") format("woff2");font-weight:100 900;font-display:block}html{font-feature-settings:"zero" 1}' % FONT
n = 0
for f in sorted(os.listdir(P)):
    if not f.endswith('.dc.html') or f in KIT: continue
    s = open(os.path.join(P, f)).read(); o = s
    s = re.sub(r'#[0-9a-fA-F]{6}\b', lambda m: MAP.get(m.group(0).lower(), m.group(0)), s)
    s = s.replace("'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible'", "'Inter'").replace("'Atkinson Hyperlegible Next'", "'Inter'")
    s = s.replace('family=Atkinson+Hyperlegible+Next:wght@400;500;600;700&amp;', '').replace('family=Atkinson+Hyperlegible+Next:wght@400;500;600&amp;', '')
    if '@font-face{font-family:"Inter"' not in s:
        s = s.replace('<helmet>\n', '<helmet>\n<style>%s</style>\n' % FACE, 1) if '<helmet>\n' in s else s.replace('<helmet>', '<helmet><style>%s</style>' % FACE, 1)
    # shell sizes from the reference: a 56px top bar
    s = s.replace('hint-size="100%,48px"></dc-import>', 'hint-size="100%,56px"></dc-import>')
    if s != o:
        open(os.path.join(P, f), 'w').write(s); n += 1
print(n, 'boards rethemed')
