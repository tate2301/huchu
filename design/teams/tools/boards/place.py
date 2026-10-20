import json,sys
P='/tmp/claude-0/-home-claude/36ba3da9-336b-59d8-8a05-4b9104ebe48e/scratchpad/canvas/project/canvas.json'
def place(page_id, page_name, title, rows, after=None):
    c=json.load(open(P))
    if not any(p['id']==page_id for p in c['pages']):
        idx=next((i for i,p in enumerate(c['pages']) if p['id']==after),len(c['pages'])-1)+1 if after else len(c['pages'])
        c['pages'].insert(idx,{"id":page_id,"name":page_name})
    y=300
    for r,(rtitle,items) in enumerate(rows):
        x=0; hmax=0
        for f,w,h,t in items:
            c['boards'][f]={"x":x,"y":y,"w":w,"h":h,"title":t,"page":page_id}
            if f not in c['order']: c['order'].append(f)
            x+=w+80; hmax=max(hmax,h)
        c['notes'][f't_{page_id}_{r}']={"kind":"title1","text":rtitle,"x":0,"y":y-260,"maxW":max(x-80,1440),"page":page_id}
        y+=hmax+400
    json.dump(c,open(P,'w'),indent=2,ensure_ascii=False)
