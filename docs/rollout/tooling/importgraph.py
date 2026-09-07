import os, re, collections, sys
ROOT='/home/user/huchu/apps/legacy'
# map a file path to a "domain" bucket
def bucket(path):
    rel=os.path.relpath(path, ROOT)
    parts=rel.split('/')
    top=parts[0]
    if top=='app':
        if parts[1]=='api':
            if parts[2]=='v2': return f"api/v2/{parts[3]}" if len(parts)>3 else "api/v2"
            return f"api/{parts[2]}"
        if parts[1]=='portal': return f"app/portal/{parts[2]}" if len(parts)>2 else "app/portal"
        return f"app/{parts[1]}"
    if top in ('lib','components','hooks'):
        if len(parts)>2: return f"{top}/{parts[1]}"
        return f"{top}/{parts[1].split('.')[0]}"
    return top
imp=re.compile(r'from\s+["\']@/([^"\']+)["\']|import\s*\(\s*["\']@/([^"\']+)["\']')
edges=collections.Counter()
files=collections.Counter()
for d in ('app','lib','components','hooks'):
    for dp,dn,fn in os.walk(os.path.join(ROOT,d)):
        for f in fn:
            if not (f.endswith('.ts') or f.endswith('.tsx')): continue
            p=os.path.join(dp,f)
            src=bucket(p)
            files[src]+=1
            try: txt=open(p,encoding='utf-8',errors='ignore').read()
            except: continue
            for m in imp.finditer(txt):
                t=m.group(1) or m.group(2)
                tp=t.split('/')
                if tp[0] in ('lib','components','hooks'):
                    dst=f"{tp[0]}/{tp[1].split('.')[0]}" if len(tp)>1 else tp[0]
                elif tp[0]=='app':
                    dst=f"app/{tp[1]}" if len(tp)>1 else 'app'
                else: dst=tp[0]
                if dst!=src: edges[(src,dst)]+=1
mode=sys.argv[1] if len(sys.argv)>1 else 'in'
if mode=='in':
    # for each shared target, who depends on it
    targets=sys.argv[2:]
    for t in targets:
        print(f"\n### depended on: {t}")
        rows=sorted(((c,s) for (s,d),c in edges.items() if d==t), reverse=True)
        for c,s in rows[:40]: print(f"  {c:5d}  {s}")
elif mode=='out':
    srcs=sys.argv[2:]
    for s0 in srcs:
        print(f"\n### imports from: {s0}")
        agg=collections.Counter()
        for (s,d),c in edges.items():
            if s==s0 or s.startswith(s0+'/'): agg[d]+=c
        for d,c in agg.most_common(60): print(f"  {c:5d}  {d}")
