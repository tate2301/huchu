import sys,re,os,glob
exec(open('dc.py').read().split('def vals')[0])
PR=S+"/canvas/project/"
for src in sys.argv[1:]:
    out=src.replace('.dc.html','.html')
    render(PR+src,{},out)
    h=open(PR+src).read()
    links=re.findall(r'<link rel="stylesheet" href="([^"]+\.css)">',h)
    links=[os.path.basename(l) for l in links if not l.startswith('http')]
    for l in links:
        if os.path.exists(PR+l): os.system(f'cp "{PR}{l}" .')
    o=open(out).read()
    o=o.replace('<link rel="stylesheet" href="bundle.css"><link rel="stylesheet" href="icons.css"><link rel="stylesheet" href="teams.css">',''.join(f'<link rel="stylesheet" href="{l}">' for l in links))
    open(out,'w').write(o)
