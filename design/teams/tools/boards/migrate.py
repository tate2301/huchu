import re
P='/tmp/claude-0/-home-claude/36ba3da9-336b-59d8-8a05-4b9104ebe48e/scratchpad/canvas/project/'
VM='<svg class="vm" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect class="vm-t" width="24" height="24" rx="6" fill="var(--ink)"/><path class="vm-p" d="M5 12h10" stroke="var(--surface)" stroke-width="2.2" stroke-linecap="round"/><path class="vm-a" d="M19.5 12 14 8v8z" fill="var(--surface)"/><path class="vm-p" d="M5 8.5 7.5 12 5 15.5" stroke="var(--surface)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
def tools(bell, vane, bell_pressed=False):
    bb=f'<span class="ibtn__badge">{bell}</span>' if bell else ''
    vb=f'<span class="ibtn__badge ibtn__badge--ink">{vane}</span>' if vane else ''
    bp=' aria-pressed="true"' if bell_pressed else ''
    return ('<span class="tb__div" aria-hidden="true"></span><div class="tb__tools">'
      '<button class="ibtn" type="button" aria-label="Search everything, Ctrl K" title="Search everything  Ctrl K"><span class="i i-search"></span></button>'
      f'<button class="ibtn" type="button"{bp} aria-label="Notifications" title="Notifications"><span class="i i-bell"></span>{bb}</button>'
      f'<button class="ibtn ibtn--vane" type="button" aria-label="Vane" title="Vane"><span>{VM}</span>{vb}</button></div>')
def rep(s,a,b):
    assert a in s, a[:80]; return s.replace(a,b,1)
SS='    <label class="side-search"><span class="i i-search i-sm"></span><span>Search</span><span class="kbd">Ctrl K</span></label>\n'
p=P+'A3-home-tender.dc.html'; s=open(p).read()
s=rep(s,SS,'')
s=rep(s,'''    <div class="bar">
      <h1 class="bar__title">Home</h1>
      <span class="muted">Mufaro Hardware, Chitungwiza</span>
      <span class="spacer"></span>
      <button class="btn btn--primary" type="button"><span class="i i-till"></span>Open the till<span class="kbd">F2</span></button>
    </div>''','''    <header class="tb">
      <span class="i i-house tb__icon"></span><h1 class="tb__title">Home</h1>
      <span class="spacer"></span>
      <div class="tb__acts"><button class="btn btn--primary" type="button"><span class="i i-till"></span>Open the till<span class="kbd">F2</span></button></div>
      '''+tools('1','2')+'''
    </header>''')
for a,b in [('Chitungwiza · sells in USD and ZiG · rate typed in each morning','Chitungwiza · USD and ZiG'),
 ('214 products imported from a spreadsheet · 12 rows skipped','214 products · 12 rows skipped'),
 ("Checking device 21457 with ZIMRA since 10:31. Keep selling; we'll tell you when ZIMRA answers.",'Device 21457 · checking since 10:31'),
 ("4 people · Kudzai Ncube hasn't joined yet",'4 people · Kudzai Ncube invited'),
 ('Sell two items in practice mode. Nothing is kept, nothing goes to ZIMRA.','Practice mode'),
 ('''<div class="notice__b">Your own 214 are in now. Take the samples out so they don't show on the till.</div>''',''),
 ('<div class="figure" style="font-size: var(--t-h2)">US$486.00</div>\n          <div class="muted" style="margin-top: 4px">1 sale: <a class="u" href="#">S-10482</a> on account to Mavhima Construction, Till 1, 09:58</div>',
  '<div class="figure" style="font-size: var(--t-h2)">US$933.30</div>\n          <div class="muted" style="margin-top: 4px">16 sales · last <a class="u" href="#">S-10485</a>, Till 1, 10:14</div>'),
 ('in since 07:52','in since 07:20')]:
    s=rep(s,a,b)
open(p,'w').write(s)

p=P+'A4-members.dc.html'; s=open(p).read()
s=rep(s,SS,'')
s=rep(s,'''    <div class="bar">
      <h1 class="bar__title">Members</h1>''','''    <header class="tb">
      <span class="i i-clients tb__icon"></span><h1 class="tb__title" style="flex: none">Members</h1>''')
s=rep(s,'''      <button class="btn" type="button"><span class="i i-share"></span>Invite link<span class="muted">Off</span></button>
      <button class="btn btn--primary" type="button"><span class="i i-user-plus"></span>Add a sixth member<span class="kbd">I</span></button>
    </div>''','''      <div class="tb__acts"><button class="btn btn--icon" type="button" aria-label="More: invite link (off), roles"><span class="i i-more"></span></button><button class="btn btn--primary" type="button"><span class="i i-user-plus"></span>Add a sixth member<span class="kbd">I</span></button></div>
      '''+tools('1','')+'''
    </header>''')
for a,b in [('      <span class="spacer"></span>\n      <span class="muted">A sixth member moves Tender from US$39 to US$99 a month</span>\n',''),
 ("<span class=\"muted\">1 · holds a seat until it's accepted or expires</span>",'<span class="muted">1</span>'),
 ('+263 78 115 2290 · signs in at the till with a PIN','+263 78 115 2290 · till PIN'),
 ('4 members and 1 invite waiting · everyone who signs in counts, till staff included','4 members · 1 invite'),
 ('Suspend, frees a seat','Suspend')]:
    s=rep(s,a,b)
open(p,'w').write(s)

p=P+'A5-member.dc.html'; s=open(p).read()
s=rep(s,'''    <div class="bar">
      <a class="crumb" href="#"><span class="i i-caret-left i-sm"></span>Members</a>
      <span class="spacer"></span>
      <button class="btn" type="button"><span class="mark-wa"></span>Message</button>
      <button class="btn btn--icon" type="button" aria-label="More for Tinashe"><span class="i i-more"></span></button>
    </div>''','''    <header class="tb">
      <a class="tb__back" href="#" aria-label="Back to Members"><span class="i i-caret-left"></span>Members</a><span class="tb__sep" aria-hidden="true">/</span><h1 class="tb__title">Tinashe Gumbo</h1>
      <span class="tb__step"><button type="button" aria-label="Previous member, K"><span class="i i-caret-left i-sm"></span></button><button type="button" aria-label="Next member, J"><span class="i i-caret-right i-sm"></span></button><span class="tb__pos">3 of 4</span></span>
      <span class="spacer"></span>
      <div class="tb__acts"><button class="btn btn--icon" type="button" aria-label="More for Tinashe: sign out everywhere, suspend, remove"><span class="i i-more"></span></button><button class="btn" type="button"><span class="mark-wa"></span>Message<span class="kbd">M</span></button></div>
      '''+tools('3','')+'''
    </header>''')
s=rep(s,'<div style="height: 48px; display: flex; align-items: center; gap: 8px; padding: 0 var(--s4); border-bottom: 1px solid var(--line)">','<div style="height: 56px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 var(--s4); border-bottom: 1px solid var(--line)">')
for a,b in [('          <p>What he can do starts from his role. Changing it moves every permission still on role default.</p>\n',''),
 ('          <p>Change one for Tinashe alone. Everyone else in his role keeps the default.</p>\n',''),
 ("Allowed by Kudakwashe on 12 October. Field workers don't by default.",'Kudakwashe, 12 Oct'),
 ('Quotes over US$5,000 still need a manager.','Over US$5,000 needs a manager'),
 ('<div class="prow__s">Signs him out everywhere and frees his seat. Restore him when a seat is free.</div>',''),
 ('His 3 open jobs and 2 follow-ups go to someone you choose. His name stays on everything he did.','3 open jobs · 2 follow-ups'),
 ('Signed in on a phone and a computer. <a class="u" href="#">Sign him out everywhere</a>','Phone and computer · <a class="u" href="#">Sign him out everywhere</a>')]:
    s=rep(s,a,b)
open(p,'w').write(s)

p=P+'A6-notifications.dc.html'; s=open(p).read()
s=rep(s,'<div class="cx app" data-theme="corelith" style="min-height: 900px; grid-template-columns: 64px 372px minmax(0, 1fr) 320px">','<div class="cx app" data-theme="corelith" style="height: 900px; min-height: 0; overflow: hidden; grid-template-columns: 64px minmax(0, 1fr)">')
i=s.index('  <section style="border-right: 1px solid var(--line); display: flex; flex-direction: column; min-width: 0" aria-label="Notifications">')
head='''  <div style="display: flex; flex-direction: column; min-width: 0; min-height: 0">
  <header class="tb"><span class="i i-bell tb__icon"></span><h1 class="tb__title">Notifications</h1><span class="spacer"></span><div class="tb__acts"><button class="btn btn--icon" type="button" aria-label="Notification settings"><span class="i i-gear"></span></button></div>'''+tools('3','1',True)+'''</header>
  <div style="display: grid; grid-template-columns: 372px minmax(0, 1fr) 320px; grid-template-rows: minmax(0, 1fr); flex: 1; min-height: 0">
'''
s=s[:i]+head+s[i:]
s=rep(s,'    <div class="bar" style="padding: 0 var(--s4) 0 var(--s5)"><h1 class="bar__title">Notifications</h1><span class="spacer"></span><button class="btn btn--quiet btn--icon" type="button" aria-label="Notification settings"><span class="i i-gear"></span></button></div>\n','')
j=s.rindex('</aside>')+len('</aside>')
s=s[:j]+'\n  </div>\n  </div>'+s[j:]
for a,b in [('Seen · still yours until you reply or mark it done','Seen'),
 ('<span class="composer__hint">Ctrl Enter replies and marks it done</span>',''),
 ('<button class="btn btn--primary" type="button"><span class="i i-chat"></span>Reply</button>','<button class="btn btn--primary" type="button"><span class="i i-chat"></span>Reply<span class="kbd">Ctrl Enter</span></button>'),
 ('WhatsApp quiet 20:00 to 06:00','Quiet 20:00–06:00'),
 ('background: var(--ground); color: var(--ink-3); font-size: var(--t-cap)"><span><span class="kbd"','background: var(--ground); color: var(--ink-3); font-size: var(--t-cap); white-space: nowrap"><span><span class="kbd"')]:
    s=rep(s,a,b)
open(p,'w').write(s)

for f,L in {'P2-notifications-phone.dc.html':[('Seen, still yours','Seen')],
 'P3-members-phone.dc.html':[('\n      <span class="muted">A sixth member moves Tender from US$39 to US$99 a month.</span>','')],
 'P4-home-phone.dc.html':[('Checking device 21457 with ZIMRA. Keep selling.','Device 21457 · checking'),('Nothing is kept, nothing goes to ZIMRA.','Practice mode')]}.items():
    s=open(P+f).read()
    for a,b in L: s=rep(s,a,b)
    open(P+f,'w').write(s)
print('ok')
