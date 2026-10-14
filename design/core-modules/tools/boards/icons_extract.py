import re, glob, json, html
Z = 'zip-core/corelith-core-modules/html/'
icons = {}
svgre = r'<svg class="ic"[^>]*>(.*?)</svg>'
for f in sorted(glob.glob(Z + '*.html')):
    s = open(f).read()
    # aria-label before svg
    for m in re.finditer(r'aria-label="([^"]+)"[^>]*>\s*' + svgre, s, re.S):
        icons.setdefault(m.group(1).strip(), m.group(2))
    # svg followed by text
    for m in re.finditer(svgre + r'\s*(?:<span[^>]*>)?([^<]{2,40})<', s, re.S):
        icons.setdefault(html.unescape(m.group(2)).strip(), m.group(1))
# dedupe by path
bypath = {}
for k, v in icons.items():
    bypath.setdefault(v, []).append(k)
json.dump(icons, open('gen2/icons_raw.json', 'w'), indent=0)
print(len(icons), 'labels,', len(bypath), 'distinct glyphs')
for v, ks in bypath.items(): print(' | '.join(ks[:6]))
