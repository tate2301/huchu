import json, os, sys
from dsl import svg, render
from icons import I
STY = ["outline", "fill", "outline-duo", "fill-duo"]
os.makedirs("dist", exist_ok=True)
data = {}
for st in STY:
    os.makedirs(f"dist/{st}", exist_ok=True)
for n, d in I.items():
    data[n] = {"cat": d["cat"], "tags": d["tags"]}
    for st in STY:
        s = svg(d["groups"], st, f"ci-{n}")
        open(f"dist/{st}/{n}.svg", "w").write(s)
        data[n][st] = render(d["groups"], st, f"ci-{n}")
json.dump(data, open("dist/icons.json", "w"))
# contact sheet
size = int(sys.argv[1]) if len(sys.argv) > 1 else 36
cats = {}
for n, d in I.items(): cats.setdefault(d["cat"], []).append(n)
h = ['<!doctype html><meta charset=utf-8><style>body{font:11px system-ui;margin:16px;color:#111;background:#fff}h2{font-size:13px;margin:14px 0 6px}.g{display:flex;flex-wrap:wrap;gap:6px}.c{width:%dpx;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 2px;border:1px solid #eee;border-radius:8px}.c span{font-size:9px;color:#666;text-align:center;word-break:break-all}.r{display:flex;gap:6px}</style>' % (size*2+40)]
for c, ns in cats.items():
    h.append(f"<h2>{c}</h2><div class=g>")
    for n in ns:
        cells = "".join(svg(I[n]["groups"], st, f"s{size}-{st}-{n}", size) for st in ["outline", "fill"])
        h.append(f"<div class=c><div class=r>{cells}</div><span>{n}</span></div>")
    h.append("</div>")
open(f"sheet.html", "w").write("".join(h))
print(len(I), "icons")
