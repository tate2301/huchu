import re,sys,json
S="/tmp/claude-0/-home-claude/36ba3da9-336b-59d8-8a05-4b9104ebe48e/scratchpad"
def render(src, vals, out):
    h=open(src).read()
    m=re.search(r"<x-dc>(.*)</x-dc>",h,re.S).group(1).replace("<helmet>","").replace("</helmet>","")
    # resolve sc-if innermost first
    pat=re.compile(r'<sc-if value="\{\{([\w.]+)\}\}"[^>]*>((?:(?!<sc-if).)*?)</sc-if>',re.S)
    def get(k):
        v=vals
        for p in k.split('.'): v=v.get(p) if isinstance(v,dict) else None
        return v
    while True:
        n=pat.sub(lambda mm: mm.group(2) if get(mm.group(1)) else '', m)
        if n==m: break
        m=n
    m=re.sub(r'\{\{([\w.]+)\}\}', lambda mm: str(get(mm.group(1))).lower() if isinstance(get(mm.group(1)),bool) else str(get(mm.group(1)) if get(mm.group(1)) is not None else ''), m)
    m=m.replace("/_blob/5cb94a92544c012adfc9f737955a54ca","logo-mark.svg")
    open(out,"w").write('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="bundle.css"><link rel="stylesheet" href="icons.css"><link rel="stylesheet" href="teams.css"></head><body style="margin:0">'+m+'</body></html>')
def vals(step):
    after=step=='after'; tab='activity' if after else 'overview'; panel='details' if after else 'comments'
    tabs=['overview','activity','documents','visits','tasks','team']
    pinned=step!='open'
    return dict(sel={t:t==tab for t in tabs},panelDetails=panel=='details',panelComments=panel=='comments',inCall=step=='call',sheet=step=='email',pinned=pinned,askShown=pinned,resendOpen=not after,resendDone=after,tatendaHere=step=='call',tatendaAway=step!='call',hereText='All three here' if step=='call' else 'Gerald is here',needsCount='1' if after else '3',openComments='2 open',taskCount='1' if after else '2',termsLeft='42 days' if after else '12 days',termsNote='Held open to 30 Nov by Gerald' if after else 'Held open to 31 Oct',termsDate='30 November' if after else '31 October',lapseLine='Monday 30 November' if after else 'Saturday 31 October',waitingOn='The bursar' if after else 'Us',waitingNote='Documents resent 10:51' if after else 'To resend the documents',eventCount='8',termsClass='is-changed' if after else '',docLine='Resent 10:51' if after else 'Sent 17 Sep',updatedAt='10:51' if after else '09:58')
for s in ['open','call','email','after']:
    render(S+"/canvas/project/DealNyatsime.dc.html", vals(s), "N-"+s+".html")
render(S+"/canvas/project/W1-1-notifications.dc.html", {}, "N-notif.html")
