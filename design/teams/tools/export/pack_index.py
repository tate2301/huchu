import json,html,os
B=os.environ.get('TEAMS_PACK','pack/design/teams/')
S=json.load(open(B+'spec/screens.json'))
pages=[]
for o in S:
    if not pages or pages[-1][0]!=o['page']: pages.append((o['page'],[]))
    pages[-1][1].append(o)
nav=''.join(f'<a href="#p{i}">{html.escape(p)}</a>' for i,(p,_) in enumerate(pages))
secs=''
for i,(p,os_) in enumerate(pages):
    cards=''.join(f'''<a class="card" href="{o['html'][7:]}"><img loading="lazy" src="{o['png'][7:]}" alt=""><b>{html.escape(o['title'])}</b><span>{html.escape(o['route'])}</span><code>{o['id']}</code></a>''' for o in os_)
    secs+=f'<section id="p{i}"><h2>{html.escape(p)}</h2><div class="grid">{cards}</div></section>'
css='''body{margin:0;font:14px/1.45 Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg)}
:root{--ink:#26251f;--ink2:#6b6a63;--line:#e7e5df;--bg:#faf9f6;--card:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#ecebe6;--ink2:#a3a29b;--line:#34332e;--bg:#1b1a17;--card:#24231f}}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;gap:16px;flex-wrap:wrap;z-index:1}
header h1{font-size:15px;margin:0;font-weight:600} header nav{display:flex;gap:12px;flex-wrap:wrap} header a{color:var(--ink2);text-decoration:none}
section{padding:24px 16px} h2{font-size:16px;font-weight:600;margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{display:flex;flex-direction:column;gap:4px;color:inherit;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px}
.card img{width:100%;aspect-ratio:16/10;object-fit:contain;object-position:top;background:#fff;border-radius:6px}
.card span,.card code{color:var(--ink2);font-size:12px}'''
open(B+'boards/index.html','w').write(f'<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Teams and till boards</title><style>{css}</style></head><body><header><h1>Teams and till · {len(S)} boards</h1><nav>{nav}</nav></header>{secs}</body></html>')
