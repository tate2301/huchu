import json,re,os,shutil,sys
S=os.environ.get("TEAMS_DESIGN_ROOT", "/tmp/claude-0/-home-claude/36ba3da9-336b-59d8-8a05-4b9104ebe48e/scratchpad")
PR=S+'/canvas/project/'
OUT=S+'/pack/design/teams/boards/'
src=open(S+'/preview/dc.py').read()
exec(src.split('def render')[0])  # S etc
vals_src='def vals'+src.split('def vals')[1].split('for s in')[0]
exec(vals_src)
IMG={'0964fc98daf159e133baa301d8314c40':'nyasha.jpg','345dc2679a89a59a8684aa172b4f45d3':'tendai.jpg','2a4a6d8df97c5df72897686f73d1d6c2':'rumbidzai.jpg','81c03dae91fdd18d1f0b59aa98e43ca4':'blessing.jpg','e7e012736e184b768be5e95bbda848fc':'kuda.jpg','a61b8dfcc034758dfb81f13a105f61e9':'rudo.jpg','f758321fc00ba727fdd197f8c71213c7':'tinashe.jpg','ed739be2d725b178f8e5b3b2ca0eb224':'precious.jpg','722541ad1bbcd1094ec76f6b5a2209df':'tinashe2.jpg','5cb94a92544c012adfc9f737955a54ca':'logo-mark.svg'}
for d in ['view','png','assets/img','canvas']: os.makedirs(OUT+d,exist_ok=True)
for f,n in IMG.items(): shutil.copy(S+'/up/'+n, OUT+'assets/img/'+n)
c=json.load(open(PR+'canvas.json'))
pages={p['id']:p['name'] for p in c['pages']}
css=set()
def resolve(h,vals):
    m=re.search(r"<x-dc>(.*)</x-dc>",h,re.S).group(1)
    helm=re.search(r'<helmet>(.*?)</helmet>',m,re.S)
    head=helm.group(1) if helm else ''
    m=re.sub(r'<helmet>.*?</helmet>','',m,flags=re.S)
    pat=re.compile(r'<sc-if value="\{\{([\w.]+)\}\}"[^>]*>((?:(?!<sc-if).)*?)</sc-if>',re.S)
    def get(k):
        v=vals
        for p in k.split('.'): v=v.get(p) if isinstance(v,dict) else None
        return v
    while True:
        n=pat.sub(lambda mm: mm.group(2) if get(mm.group(1)) else '', m)
        if n==m: break
        m=n
    m=re.sub(r'\{\{([\w.]+)\}\}', lambda mm: (str(get(mm.group(1))).lower() if isinstance(get(mm.group(1)),bool) else str(get(mm.group(1)) if get(mm.group(1)) is not None else '')), m)
    return head,m
items=[]
order=[p['id'] for p in c['pages']]
for f,b in sorted(c['boards'].items(), key=lambda kv:(order.index(kv[1]['page']),kv[1]['y'],kv[1]['x'])):
    if b['page']=='archive': continue
    h=open(PR+f).read()
    title=re.search(r'<title>(.*?)</title>',h).group(1)
    links=[os.path.basename(l) for l in re.findall(r'<link rel="stylesheet" href="([^"]+\.css)">',h) if not l.startswith('http')]
    css.update(links)
    states=[('',vals('open') if f=='DealNyatsime.dc.html' else {})]
    imp=re.search(r'<dc-import name="(\w+)" step="(\w+)"',h)
    if imp:
        h=open(PR+imp.group(1)+'.dc.html').read(); states=[('',vals(imp.group(2)))]
        links=[os.path.basename(l) for l in re.findall(r'<link rel="stylesheet" href="([^"]+\.css)">',h) if not l.startswith('http')]
    for st,v in states:
        stem=f.replace('.dc.html','')+('-'+st if st else '')
        head,body=resolve(h,v)
        for k,n in IMG.items(): body=body.replace('/_blob/'+k,'../assets/img/'+n)
        doc=('<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
             f'<title>{b["title"]}</title>\n'+''.join(f'<link rel="stylesheet" href="../assets/{l}">\n' for l in links)+head.strip()+'\n</head>\n<body>\n'+body.strip()+'\n</body>\n</html>\n')
        open(OUT+'view/'+stem+'.html','w').write(doc)
        items.append(dict(id=stem,source=f,page=b['page'],pageName=pages[b['page']],title=b['title'],state=st or None,width=b['w'],height=b['h'],html='boards/view/'+stem+'.html',png='boards/png/'+stem+'.png'))
for l in css:
    p=PR+l if os.path.exists(PR+l) else (S+'/preview/'+l)
    shutil.copy(p if os.path.exists(p) else S+'/preview/bundle.css', OUT+'assets/'+l)
json.dump(items,open(S+'/pack/boards.json','w'),indent=1,ensure_ascii=False)
# canvas source
for f in os.listdir(PR):
    if f.endswith(('.dc.html','.css','.json','.js')) : shutil.copy(PR+f, OUT+'canvas/'+f)
print(len(items),'views;',sorted(css))
