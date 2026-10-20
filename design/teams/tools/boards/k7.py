from common import *
css = '''
.k7{padding:40px 40px 56px;display:flex;flex-direction:column;gap:28px}
.h{color:var(--ink);font-weight:600;font-size:15px;margin-top:12px}
.s{color:var(--ink-3);margin-top:-20px}
.frame{border:1px solid var(--line);border-radius:12px;overflow:visible;background:var(--surface);position:relative}
.frame .tb{border-radius:12px 12px 0 0}
.w{color:var(--ink-3);font-size:var(--t-cap);margin-bottom:-18px;font-variant-numeric:tabular-nums}
.states{display:grid;grid-template-columns:repeat(3,368px);gap:32px}
.st{display:flex;flex-direction:column;gap:10px}
.st .pn{border:1px solid var(--line);border-radius:12px;height:560px}
.vrow{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.vrow > div{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.phone-bar{width:390px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ptb{height:56px;display:flex;align-items:center;gap:4px;padding:0 8px;box-shadow:inset 0 -1px 0 var(--line)}
.ptb .tb__title{font-size:16px;flex:1}
.ptb .ibtn{width:44px;height:44px}
.opts{position:absolute;left:120px;top:204px;width:232px}
.vp__now{padding:12px;border-radius:12px;background:var(--ground);box-shadow:inset 0 0 0 1px var(--line);display:flex;flex-direction:column;gap:8px}
.strip{width:48px;border:1px solid var(--line);border-radius:12px;height:560px;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:10px;box-sizing:border-box}
.strip .ibtn{position:relative}
'''
SEARCH = '<button class="ibtn" type="button" aria-label="Search everything, Ctrl K"><span class="i i-search"></span></button>'
SEARCH_TIP = '<span style="position: relative; display: inline-flex"><button class="ibtn" type="button" aria-pressed="true" aria-label="Search everything, Ctrl K"><span class="i i-search"></span></button><span class="tip">Search everything<span class="kbd">Ctrl K</span></span></span>'
def BELL(n='3'):
    b = f'<span class="ibtn__badge">{n}</span>' if n else ''
    return f'<button class="ibtn" type="button" aria-label="Notifications"><span class="i i-bell"></span>{b}</button>'
def vane(count='1', pressed=False, working=False, paused=False):
    b = f'<span class="ibtn__badge ibtn__badge--ink">{count}</span>' if count else ''
    cls = 'ibtn ibtn--vane' + (' ibtn--working' if working else '')
    st = ' style="opacity: 0.45"' if paused else ''
    return f'<button class="{cls}" type="button" aria-pressed="{"true" if pressed else "false"}" aria-label="Vane"><span{st}>{VM(18)}</span>{b}</button>'
def TOOLS(search=SEARCH):
    return f'<div class="tb__tools">{search}{BELL()}{vane()}</div>'
FACES = '<span class="faces" style="margin-right: var(--s2)"><span class="pres"><span class="face face-24"><span class="i i-person i-sm"></span></span></span><span class="pres"><span class="face face-24" style="background: var(--ok-soft); color: var(--ok)"><span class="i i-person i-sm"></span></span></span><span class="pres pres--away"><span class="face face-24"><span class="i i-person i-sm"></span></span></span></span>'
LEFT = '<a class="tb__back" href="#"><span class="i i-caret-left"></span>Deals</a><span class="tb__sep">/</span><h1 class="tb__title">Campus for Nyatsime College</h1><button class="tb__fav" aria-pressed="true"><span class="i i-star i-sm"></span></button><span class="tb__step"><button aria-label="Previous deal, K"><span class="i i-caret-left i-sm"></span></button><button aria-label="Next deal, J"><span class="i i-caret-right i-sm"></span></button><span class="tb__pos">3 of 9</span></span><span class="spacer"></span>'
PRIMARY = '<button class="btn btn--primary" type="button"><span class="i i-mail"></span>Email the school<span class="kbd">E</span></button>'
MORE = lambda on=False: f'<button class="btn btn--icon" type="button" aria-label="More" {"style=\"background: var(--active)\"" if on else ""}><span class="i i-more"></span></button>'
def bar(acts, search=SEARCH, w=None, extra=''):
    return f'<div class="frame" style="width: {w}px"><header class="tb">{LEFT}{FACES}<div class="tb__acts">{acts}</div><span class="tb__div"></span>{TOOLS(search)}</header>{extra}</div>'
menu = """<div class="menu" style="right: 132px; top: 50px; width: 256px">
 <div class="menu__i is-on"><span class="i i-phone"></span>Log a call<span class="kbd">L</span></div>
 <div class="menu__i"><span class="i i-chat"></span>Comment<span class="kbd">C</span></div>
 <div class="menu__i"><span class="i i-done"></span>New task<span class="kbd">T</span></div>
 <div class="menu__sep"></div>
 <div class="menu__i"><span class="i i-handover"></span>Hand over</div>
 <div class="menu__i"><span class="i i-pin"></span>Book a visit</div>
 <div class="menu__i"><span class="i i-receipt"></span>Make a quote<span class="kbd">Q</span></div>
 <div class="menu__sep"></div>
 <div class="menu__i"><span class="i i-flag"></span>Add to a saved view</div>
 <div class="menu__i"><span class="i i-copy"></span>Copy the link</div>
</div>"""
bars = f"""
<div class="h">The top bar</div>

<div class="w">A record at 1440</div>
{bar(MORE()+PRIMARY, w=1192)}
<div class="w">More open</div>
{bar(MORE(True)+PRIMARY, w=1192, extra=menu)}
<div style="height: 272px"></div>
<div style="display: flex; gap: 48px; align-items: flex-start">
 <div style="display: flex; flex-direction: column; gap: 10px"><div class="w" style="margin-bottom: 0">A list page</div><div class="frame" style="width: 760px"><header class="tb"><span class="i i-jobs tb__icon"></span><h1 class="tb__title">Deals</h1><span class="tb__pos" style="padding-left: 2px">9 open</span><span class="spacer"></span><div class="tb__acts"><button class="btn btn--icon" aria-label="More"><span class="i i-more"></span></button><button class="btn btn--primary"><span class="i i-plus"></span>New deal<span class="kbd">N</span></button></div><span class="tb__div"></span>{TOOLS(SEARCH_TIP)}</header></div></div>
 <div style="display: flex; flex-direction: column; gap: 10px"><div class="w" style="margin-bottom: 0">Phone</div><div class="phone-bar"><div class="ptb"><button class="ibtn" aria-label="Back to Deals"><span class="i i-caret-left"></span></button><h1 class="tb__title">Campus for Nyatsime…</h1><button class="ibtn" aria-label="Search"><span class="i i-search"></span></button><button class="ibtn" style="position: relative" aria-label="Notifications"><span class="i i-bell"></span><span class="ibtn__badge" style="top: 6px; right: 5px">3</span></button><button class="ibtn ibtn--vane" style="position: relative" aria-label="Vane">{VM(18)}<span class="ibtn__badge" style="top: 6px; right: 5px">1</span></button><button class="ibtn" aria-label="Email the school and more"><span class="i i-more"></span></button></div></div></div>
</div>
<div style="height: 24px"></div><div class="h">Vane in the bar</div>
<div class="vrow">
 <div><span class="w" style="margin: 0">Nothing for you</span>{vane(count='')}</div>
 <div><span class="w" style="margin: 0">3 waiting for you</span>{vane('3')}</div>
 <div><span class="w" style="margin: 0">Working</span>{vane('', working=True)}</div>
 <div><span class="w" style="margin: 0">Working, 3 waiting</span>{vane('3', working=True)}</div>
 <div><span class="w" style="margin: 0">Panel open</span>{vane('3', pressed=True, working=True)}</div>
 <div><span class="w" style="margin: 0">Paused</span>{vane('', paused=True)}</div>
 <div style="width: 40px"></div>
 <div><span class="w" style="margin: 0">Bell</span>{BELL('')}</div>
 <div><span class="w" style="margin: 0">12 need you</span>{BELL('12')}</div>
</div>
"""
HEAD = '<div class="pn__head"><div class="seg"><button class="seg__item" aria-pressed="true"><span class="i i-tag"></span>Details</button><button class="seg__item" aria-pressed="false"><span class="i i-chat"></span>Comments<span class="chip__n">2 open</span></button></div><button class="ibtn" aria-label="Hide the panel, ]"><span class="i i-caret-right i-sm"></span></button></div>'
loading = f'''<div class="st"><div class="w" style="margin: 0">Loading</div><aside class="pn">{HEAD}<div class="pn__body">
<section class="pn__sec"><span class="sk" style="width: 60px"></span><span class="sk" style="width: 180px; height: 28px"></span><span class="sk" style="width: 260px"></span><span class="sk" style="width: 100%; height: 6px; margin-top: 8px"></span></section>
<section class="pn__sec"><span class="sk" style="width: 110px"></span>{''.join(f'<div style="display: grid; grid-template-columns: 112px 1fr; gap: 8px"><span class="sk" style="width: 70px"></span><span class="sk" style="width: {w}px"></span></div>' for w in (90,150,120,170,80))}</section>
</div></aside></div>'''
editing = f'''<div class="st"><div class="w" style="margin: 0">Changing a value in place</div><aside class="pn" style="position: relative; overflow: visible">{HEAD}<div class="pn__body" style="overflow: visible">
<section class="pn__sec"><div class="pn__sh"><span class="i i-caret-down"></span>Deal details</div>
<dl class="kv">
 <dt><span class="i i-box"></span>Product</dt><dd>Campus</dd>
 <dt><span class="i i-building"></span>School</dt><dd><a class="u" href="#">Nyatsime College</a></dd>
 <dt><span class="i i-tag"></span>Kind of school</dt><dd class="is-editing">Government boarding<span class="i i-caret-down i-sm" style="margin-left: auto; color: var(--ink-3)"></span></dd>
 <dt><span class="i i-person"></span>Contact</dt><dd>The bursar</dd>
 <dt><span class="i i-clients"></span>Pupils</dt><dd class="is-empty">Add</dd>
 <dt><span class="i i-cal"></span>Terms</dt><dd>Founding school, open to 31 October</dd>
</dl></section></div>
<div class="menu opts" style="top: 236px; left: 128px">
 <div class="menu__h">Kind of school</div>
 <div class="menu__i is-on"><span class="i i-check"></span>Government boarding</div>
 <div class="menu__i"><span class="i" style="opacity: 0"></span>Government day</div>
 <div class="menu__i"><span class="i" style="opacity: 0"></span>Private boarding</div>
 <div class="menu__i"><span class="i" style="opacity: 0"></span>Private day</div>
 <div class="menu__i"><span class="i" style="opacity: 0"></span>Mission</div>
 <div class="menu__sep"></div>
 <div class="menu__i" style="color: var(--ink-3)"><span class="i i-plus"></span>Add a kind</div>
</div>
</aside></div>'''
locked = f'''<div class="st"><div class="w" style="margin: 0">What you can't see or change</div><aside class="pn">{HEAD}<div class="pn__body">
<section class="pn__sec"><div class="pn__sh"><span class="i i-caret-down"></span>Member details</div>
<dl class="kv">
 <dt><span class="i i-person"></span>Name</dt><dd>Farai Chikwanha</dd>
 <dt><span class="i i-tag"></span>Role</dt><dd class="is-locked">Field worker<span class="i i-lock i-sm" style="margin-left: auto; color: var(--faint)"></span></dd>
 <dt><span class="i i-phone"></span>Phone</dt><dd class="is-locked">Hidden</dd>
 <dt><span class="i i-card"></span>Pay</dt><dd class="is-locked">Hidden</dd>
 <dt><span class="i i-cal"></span>Joined</dt><dd>12 Oct</dd>
</dl>

</section></div></aside></div>'''
vanep = f'''<div class="st"><div class="w" style="margin: 0">Vane open</div><aside class="pn">
<div class="pn__head" style="padding-left: var(--s4)">{VM(20)}<span class="strong">Vane</span><span class="live-d" style="margin-left: 2px"></span><span class="muted">Working</span><span class="spacer"></span><button class="btn btn--quiet" style="height: 28px">Pause</button><button class="ibtn" aria-label="Close Vane"><span class="i i-x i-sm"></span></button></div>
<div class="pn__body">
<section class="pn__sec" style="gap: var(--s3)">
 <div class="vp__now"><div class="vc__k">Now</div><div style="color: var(--ink)">Reading the deals you follow for anything waiting on Corelith</div><div class="track"><i style="width: 62%; background: var(--action)"></i></div><div class="muted" style="font-size: var(--t-cap)">6 of 9 deals</div></div>
 <div class="pn__label" style="margin-top: 4px">On this deal</div>
 <article class="vc"><div class="vc__k"><span class="i i-note"></span>Suggestion · from Deals</div><div class="vc__h">Tatenda's reminder from 28 Sep is still addressed to the old admin address</div><div class="vc__acts"><button class="btn"><span class="i i-doc"></span>Open the draft</button><button class="btn btn--quiet">Not now</button></div></article>
 <div class="pn__label" style="margin-top: 4px">Elsewhere</div>
 <article class="vc vc--issue"><div class="vc__k"><span class="i i-alert"></span>Issue · from Deals</div><div class="vc__h">Black Ivy Media has waited 6 days for a reply</div></article>
</section>
<div class="pn__foot" style="padding: var(--s3) var(--s4)"><div class="vask" style="flex: 1">{VM()}<span>Give Vane a job</span></div></div>
</div></aside></div>'''
states = f'''<div class="h">The panel's states</div>
<div class="states">{loading}{editing}{locked}{vanep}</div>
<div style="display: flex; gap: 32px; align-items: flex-start">
<div class="st"><div class="w" style="margin: 0">Hidden</div><div class="strip"><button class="ibtn" aria-label="Show the panel, ]"><span class="i i-caret-left i-sm"></span></button><button class="ibtn" aria-label="Details"><span class="i i-tag"></span></button><button class="ibtn" aria-label="Comments, 2 open"><span class="i i-chat"></span><span class="ibtn__dot"></span></button></div></div>
<div class="st"><div class="w" style="margin: 0">A new record</div><aside class="pn" style="width: 368px; height: 560px; border: 1px solid var(--line); border-radius: 12px">{HEAD.replace('2 open','')}<div class="pn__body">
<section class="pn__sec" style="gap: var(--s3)"><div class="pos"><span class="pn__label">Price</span><div class="pos__row"><span class="figure" style="color: var(--faint)">US$0.00</span></div></div><button class="btn" style="align-self: flex-start"><span class="i i-plus"></span>Add a price</button></section>
<section class="pn__sec"><div class="pn__sh"><span class="i i-caret-down"></span>Deal details</div><dl class="kv"><dt><span class="i i-box"></span>Product</dt><dd>Campus</dd><dt><span class="i i-building"></span>School</dt><dd>Marondera High School</dd><dt><span class="i i-person"></span>Contact</dt><dd class="is-empty">Add</dd><dt><span class="i i-clients"></span>Pupils</dt><dd class="is-empty">Add</dd></dl></section>
<section class="pn__sec"><div class="pn__sh"><span class="i i-caret-down"></span>Linked<span class="pn__n">0</span></div></section>
</div></aside></div>
</div>'''
body = f'<div class="k7">{bars}{states}</div>'
open('../canvas/project/K7-bar-and-panel.dc.html','w').write(page('Top bar and panel', body, 1272, 2000, css))
print('ok')
