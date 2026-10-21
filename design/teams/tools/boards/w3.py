from common import VM
OUT = '../canvas/project/'
LOGO = '/_blob/5cb94a92544c012adfc9f737955a54ca'

def page(title, body, w, h, theme='corelith'):
    return f'''<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/corelith-workspace/components/bundle.css">
<link rel="stylesheet" href="icons.css">
<link rel="stylesheet" href="icons-tl.css">
<link rel="stylesheet" href="icons-ob.css">
<link rel="stylesheet" href="icons-w3.css">
<link rel="stylesheet" href="teams.css">
<link rel="stylesheet" href="timeline.css">
<link rel="stylesheet" href="onboarding.css">
<link rel="stylesheet" href="w3.css">
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap">
<style>body{{margin:0;background:#ffffff}}</style>
</helmet>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def write(name, title, body, w=390, h=844):
    open(OUT + name, 'w').write(page(title, body, w, h))

P_SVG = lambda s=16: f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#26251f"/><path d="M8 17V7h5a3.2 3.2 0 0 1 0 6.4H8" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
T_SVG = lambda s=16: f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#b84a0c"/><path d="M7 8h10M12 8v9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>'
C_MARK = lambda s=24: f'<span class="w3-prod__m" style="width: {s}px; height: {s}px; background: #2b3f6b"><span class="i i-student" style="width: {s*0.55:.0f}px; height: {s*0.55:.0f}px; color: #fff"></span></span>'
WS = lambda s=28, img=17: f'<span class="wsmark" style="width: {s}px; height: {s}px; background: var(--surface); box-shadow: var(--shadow-ring)"><img src="{LOGO}" alt="" width="{img}" height="{int(img*19/17)}"></span>'
GLYPH = lambda cls='face', extra='': f'<span class="{cls}"{extra}><span class="i i-person i-sm"></span></span>'

def pbar(title, back=True, right=''):
    b = '<button class="btn btn--quiet btn--icon" type="button" aria-label="Back" style="width: 44px; height: 44px"><span class="i i-caret-left"></span></button>' if back else ''
    return f'<div class="pbar">{b}<span class="pbar__t">{title}</span><span class="spacer"></span>{right}</div>'

def prog(now):
    cells = ''.join('<i class="on"></i>' if i < now else ('<i class="now"></i>' if i == now else '<i></i>') for i in range(6))
    return f'<div class="w3-prog" aria-label="Setting up Corelith">{cells}</div>'

LATER = '<button class="btn btn--quiet" type="button" style="height: 44px">Later</button>'

# 1 · start
s1 = f'''<div class="cx phone" data-theme="corelith">
  <div class="pbar" style="padding-left: var(--s4)"><span class="w3-brand">{P_SVG(22)}Pabasa<small>by Corelith</small></span></div>
  <div class="pbody"><div class="w3-pad" style="gap: var(--s5)">
    <h1 class="w3-h">Start Pabasa</h1>
    <div class="w3-prods" role="radiogroup" aria-label="Product">
      <div class="w3-prod" role="radio" aria-pressed="true">{P_SVG(28)}Pabasa</div>
      <div class="w3-prod" role="radio" aria-pressed="false">{T_SVG(28)}Tender</div>
      <div class="w3-prod" role="radio" aria-pressed="false">{C_MARK(28)}Campus</div>
    </div>
    <label class="w3-field"><span class="w3-label">Email or phone</span><span class="w3-input w3-input--focus"><span class="i i-mail"></span>sean@corelith.co.zw<span class="w3-caret"></span></span></label>
  </div></div>
  <div class="pin"><button class="btn btn--primary btn--block" type="button"><span class="i i-send"></span>Send me a code</button></div>
</div>'''
write('W3-1-start.dc.html', 'Start Pabasa', s1)

# 2 · code
s2 = f'''<div class="cx phone" data-theme="corelith">
  {pbar('')}
  <div class="pbody"><div class="w3-pad" style="gap: var(--s5)">
    <h1 class="w3-h">Your code <span>sean@corelith.co.zw</span></h1>
    <div class="w3-code" aria-label="6-digit code"><span>4</span><span>8</span><span>2</span><span>9</span><span class="on"></span><span></span></div>
    <span class="w3-paste"><span class="i i-envelope-open i-sm"></span>From your email <b>482 913</b></span>
  </div></div>
  <div class="pin" style="display: flex; gap: 8px"><button class="btn" type="button" style="flex: none"><span class="i i-retry"></span>New code</button><button class="btn btn--primary" type="button" style="flex: 1">Name the workspace</button></div>
</div>'''
write('W3-2-code.dc.html', 'The code from the email', s2)

# 3 · workspace
s3 = f'''<div class="cx phone" data-theme="corelith">
  {pbar('')}
  <div class="pbody"><div class="w3-pad">
    <h1 class="w3-h">Your workspace</h1>
    <div class="w3-logo"><span class="w3-logo__img"><img src="{LOGO}" alt="Corelith logo" width="30" height="34"></span><button class="btn" type="button"><span class="i i-image"></span>Change</button></div>
    <label class="w3-field"><span class="w3-label">Name</span><span class="w3-input">Corelith</span></label>
    <label class="w3-field"><span class="w3-label">Town</span><span class="w3-input w3-input--focus"><span class="i i-pin"></span>Harare<span class="w3-caret"></span></span></label>
    <div class="w3-field"><span class="w3-label">You</span><div class="w3-row" style="border: 0; min-height: 44px"><span class="face face-32"><span class="i i-person i-sm"></span></span><div><div class="w3-row__t">Sean Muchenje</div><div class="w3-row__s">Owner</div></div><span></span></div></div>
  </div></div>
  <div class="pin"><button class="btn btn--primary btn--block" type="button">Create Corelith</button></div>
</div>'''
write('W3-3-workspace.dc.html', 'Naming the workspace', s3)

# 4 · your business, Vane reading the website
found = [
    ('i-building', 'Software for schools, shops and mines', 'Home'),
    ('i-pin', 'Harare', 'Contact'),
    ('i-cal', 'Founded September 2025', 'About'),
    ('i-box', 'Tender, Campus, Huchu', 'Products'),
    ('i-clients', 'Sean, Gerald, Munashe, Tatenda', 'Team'),
]
rows = ''.join(f'<div class="w3-row w3-row--new"><span class="w3-row__m"><span class="i {ic}"></span></span><div class="w3-row__t">{t}</div><span class="w3-row__e">{src}</span></div>' for ic, t, src in found)
rows += '<div class="w3-row w3-row--reading"><span class="w3-row__m"><span class="sk" style="width: 14px; height: 14px; border-radius: 4px"></span></span><div><span class="sk" style="width: 170px"></span></div><span class="w3-row__e">Pricing</span></div>'
s4 = f'''<div class="cx phone" data-theme="corelith">
  {pbar('Your business', right=LATER)}
  {prog(0)}
  <div class="pbody"><div class="w3-pad">
    <div class="w3-read">
      <div class="w3-read__l">{VM(18)}corelith.co.zw<span class="muted">6 of 9 pages</span></div>
      <div class="w3-bar"><i style="width: 66%"></i></div>
    </div>
    <div class="w3-list">{rows}</div>
    <div style="display: flex; gap: 8px"><button class="btn" type="button" style="flex: 1"><span class="i i-upload"></span>Add a document</button><button class="btn" type="button" style="flex: 1"><span class="i i-pause"></span>Stop reading</button></div>
  </div></div>
  <div class="pin"><button class="btn btn--primary btn--block" type="button">Your clients<span class="i i-caret-right i-sm"></span></button></div>
</div>'''
write('W3-4-business.dc.html', 'Vane reads corelith.co.zw', s4)

# 5 · clients import
s5 = f'''<div class="cx phone" data-theme="corelith">
  {pbar('Your clients', right=LATER)}
  {prog(1)}
  <div class="pbody"><div class="w3-pad">
    <div class="w3-row" style="border: 0; min-height: 48px"><span class="lk__mark"><span class="i i-doc"></span></span><div><div class="w3-row__t">Corelith prospects.xlsx</div><div class="w3-row__s">64 rows · 10:11</div></div><button class="btn btn--quiet btn--icon" type="button" aria-label="Choose another file" style="width: 44px; height: 44px"><span class="i i-swap"></span></button></div>
    <div class="w3-map">
      <code>School or company</code><span class="i i-arrow-right"></span><span>Name</span>
      <code>Contact person</code><span class="i i-arrow-right"></span><span>Contact</span>
      <code>Cell</code><span class="i i-arrow-right"></span><span>Phone</span>
      <code>Town</code><span class="i i-arrow-right"></span><span>Town</span>
      <code>Product</code><span class="i i-arrow-right"></span><span>Interested in</span>
    </div>
    <div class="w3-big"><b>52</b><span>clients</span></div>
    <div class="w3-skip">
      <div class="w3-skip__r"><span class="i i-x i-sm"></span>No name<span class="n">5</span><span class="i i-caret-down i-sm"></span></div>
      <div class="w3-skip__r" style="grid-template-rows: auto auto; padding-top: 14px"><span class="i i-copy i-sm"></span>Already in the list<span class="n">4</span><span class="i i-caret-down i-sm" style="transform: rotate(180deg)"></span>
        <div class="w3-skip__ex">Row 31 Mabvazuva Primary = row 9<br>Row 44 Black Ivy Media = row 12<br>Row 52 Nyatsime College = row 3<br>Row 60 Ruwa Junior School = row 27</div></div>
      <div class="w3-skip__r"><span class="i i-note i-sm"></span>Notes, not clients<span class="n">3</span><span class="i i-caret-down i-sm"></span></div>
    </div>
  </div></div>
  <div class="pin"><button class="btn btn--primary btn--block" type="button"><span class="i i-upload"></span>Import 52 clients</button></div>
</div>'''
write('W3-5-clients.dc.html', 'Importing the prospects spreadsheet', s5)

# 6 · stages
stages = ['Lead', 'Visit', 'Proposal sent', 'Negotiating', 'Won', 'Onboarding', 'Live']
st = ''
for i, name in enumerate(stages, 1):
    cls = 'w3-stage'
    if name == 'Won': cls += ' w3-stage--won'
    if name == 'Visit': cls += ' w3-stage--lift'
    st += f'<div class="{cls}"><span class="i i-grip"></span><span class="w3-stage__n">{i}</span>{name}<button class="btn btn--quiet btn--icon" type="button" aria-label="Rename {name}" style="width: 40px; height: 40px"><span class="i i-pencil i-sm"></span></button></div>'
s6 = f'''<div class="cx phone" data-theme="corelith">
  {pbar('How a deal moves', right=LATER)}
  {prog(2)}
  <div class="pbody"><div class="w3-pad">
    <div class="w3-list">{st}</div>
    <button class="btn" type="button" style="align-self: flex-start"><span class="i i-plus"></span>Add a stage</button>
  </div></div>
  <div class="pin"><button class="btn btn--primary btn--block" type="button">Use these 7 stages</button></div>
</div>'''
write('W3-6-stages.dc.html', 'How a deal moves', s6)

# 7 · team
mates = [
    ('Gerald Pondai', '<span class="mark-wa" style="width: 13px; height: 13px"></span>+263 77 204 1186', 'Admin'),
    ('Munashe Mangwiro', '<span class="mark-wa" style="width: 13px; height: 13px"></span>+263 78 330 5521', 'Manager'),
    ('Tatenda Chinyamakobvu', '<span class="i i-mail" style="width: 13px; height: 13px"></span>tatenda@corelith.co.zw', 'Admin'),
    ('Simbarashe Mudonhi', '<span class="mark-wa" style="width: 13px; height: 13px"></span>+263 71 945 0372', 'Field worker'),
]
mt = ''.join(f'<div class="w3-mate w3-row--new"><span class="face face-32"><span class="i i-person i-sm"></span></span><div style="min-width: 0"><div class="w3-row__t">{n}</div><div class="w3-mate__via">{v}</div></div><span class="w3-role">{r}<span class="i i-caret-down"></span></span></div>' for n, v, r in mates)
s7 = f'''<div class="cx phone" data-theme="corelith">
  {pbar('Your team', right=LATER)}
  {prog(4)}
  <div class="pbody"><div class="w3-pad">
    <div style="display: flex; flex-direction: column; gap: 8px">
      <div class="w3-seats"><span class="i i-clients"></span>Seats<span class="muted">5 of 5</span></div>
      <div class="w3-seatbar"><i class="on"></i><i class="new"></i><i class="new"></i><i class="new"></i><i class="new"></i></div>
    </div>
    <div class="w3-list">
      <div class="w3-mate"><span class="face face-32"><span class="i i-person i-sm"></span></span><div><div class="w3-row__t">Sean Muchenje</div><div class="w3-mate__via">You</div></div><span class="w3-row__e">Owner</span></div>
      {mt}
    </div>
    <div style="display: flex; gap: 8px"><button class="btn" type="button" style="flex: 1"><span class="i i-contacts"></span>From contacts</button><button class="btn" type="button" style="flex: 1"><span class="i i-link"></span>Invite link</button></div>
  </div></div>
  <div class="pin"><button class="btn btn--primary btn--block" type="button"><span class="i i-send"></span>Send 4 invites</button></div>
</div>'''
write('W3-7-team.dc.html', 'Inviting the other four', s7)

# 8 · for you, set up, sample data offered for removal
s8 = f'''<div class="cx phone" data-theme="corelith">
  <div class="pbar" style="padding-left: var(--s4)">{WS(32, 18)}<span class="pbar__t">Corelith</span><span class="i i-caret-down i-sm" style="color: var(--faint)"></span><span class="spacer"></span>
    <button class="ibtn ibtn--vane" type="button" aria-label="Vane" style="width: 44px; height: 44px">{VM(20)}</button>
    <span class="face face-32"><span class="i i-person i-sm"></span></span></div>
  <div class="pbody"><div class="w3-pad">
    <h1 class="w3-h">Corelith is set up</h1>
    <div class="check" role="list" aria-label="Setting up Corelith">
      <div class="check__head"><span class="strong">4 of 6</span><span class="prog" aria-hidden="true"><i style="width: 67%"></i></span></div>
      <div class="ci" role="listitem" style="grid-template-columns: 24px minmax(0, 1fr) auto"><span class="ci__mark"></span><div><div class="ci__t">Your first deal</div></div><button class="btn" type="button" style="height: 40px"><span class="i i-plus"></span>Start a deal</button></div>
      <div class="ci" role="listitem" style="grid-template-columns: 24px minmax(0, 1fr) auto"><span class="ci__mark"></span><div><div class="ci__t">Quotes that look like you</div></div><button class="btn" type="button" style="height: 40px"><span class="i i-receipt"></span>Set up quotes</button></div>
      <button class="ci" type="button" style="grid-template-columns: 24px minmax(0, 1fr) auto; border: 0; background: transparent; font: inherit; text-align: left; width: 100%"><span class="ci__mark" style="background: var(--ok-dot); box-shadow: none"><span class="i i-check i-sm"></span></span><span class="ci__s" style="font-size: var(--t-sm)">Business, clients, stages, team</span><span class="i i-caret-down i-sm" style="color: var(--faint)"></span></button>
    </div>
    <div class="w3-list">
      <div class="w3-row" style="border: 0"><span class="w3-row__m"><span class="i i-clients"></span></span><div><div class="w3-row__t">5 sample clients</div><div class="w3-row__s">Beside your 52</div></div><button class="btn" type="button" style="height: 40px"><span class="i i-trash"></span>Remove</button></div>
    </div>
    <div class="w3-list">
      <div class="w3-row"><span class="face face-32"><span class="i i-person i-sm"></span></span><div><div class="w3-row__t">Gerald Pondai joined</div></div><span class="w3-row__e">10:33</span></div>
      <div class="w3-row"><span class="w3-row__m"><span class="i i-send"></span></span><div><div class="w3-row__t">3 invites out</div><div class="w3-row__s">Munashe, Tatenda, Simbarashe</div></div><span class="w3-row__e">10:21</span></div>
    </div>
  </div></div>
  <nav class="tabbar" aria-label="Pabasa">
    <a href="#" aria-current="page"><span class="i i-house"></span>For you</a>
    <a href="#"><span class="i i-jobs"></span>Deals</a>
    <a href="#"><span class="i i-pin"></span>Visits</a>
    <a href="#"><span class="i i-bell"></span>Notifications</a>
    <a href="#"><span class="i i-more"></span>More</a>
  </nav>
</div>'''
write('W3-8-for-you.dc.html', 'Set up, with the sample data to remove', s8)

# 9 · first deal
s9 = f'''<div class="cx phone" data-theme="corelith">
  {pbar('Deals', right='<button class="btn btn--quiet btn--icon" type="button" aria-label="More" style="width: 44px; height: 44px"><span class="i i-more"></span></button>')}
  <div class="pbody"><div class="w3-pad" style="gap: var(--s3)">
    <div style="display: flex; align-items: center; gap: var(--s3)"><span class="rh__mark" style="width: 44px; height: 44px"><span class="i i-building"></span></span><div style="min-width: 0"><h1 class="w3-h w3-h--sm">Campus for Marondera High School</h1></div></div>
    <div class="rh__sub"><span class="code">D-0001</span><span>·</span><span>Marondera</span></div>
    <div class="w3-stagebar"><div class="steps" aria-label="Lead, 1 of 7"><i class="now"></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="w3-stagebar__l"><b>Lead</b><span class="spacer"></span><span>Owner of the deal: Sean</span></div></div>
  </div>
  <div class="tabs" role="tablist" style="padding: 0 var(--s2)"><button class="tab" role="tab" aria-selected="true"><span class="i i-history"></span>Timeline</button><button class="tab" role="tab" aria-selected="false"><span class="i i-tag"></span>Details</button><button class="tab" role="tab" aria-selected="false"><span class="i i-doc"></span>Documents</button></div>
  <div class="feed" style="padding: var(--s2) var(--s4)">
    <div class="day">Today</div>
    <div class="ev ev--new"><span class="face"><span class="i i-person i-sm"></span></span><div class="ev__line"><b>Sean</b> started this deal</div><span class="ev__time">10:36</span></div>
    <div class="ev"><span class="ev__g"><span class="i i-xls"></span></span><div class="ev__line"><b>Marondera High School</b> came in from Corelith prospects.xlsx</div><span class="ev__time">10:12</span></div>
  </div>
  </div>
  <div class="pin" style="display: flex; gap: 8px"><button class="btn" type="button" style="flex: none"><span class="i i-phone"></span>Call</button><button class="btn btn--primary" type="button" style="flex: 1"><span class="i i-pin"></span>Book a visit</button></div>
</div>'''
write('W3-9-first-deal.dc.html', 'The first deal', s9)

# 10 · desktop join
members = [
    ('Sean Muchenje', 'Owner', 'Since 10:05', True),
    ('Gerald Pondai', 'Admin', 'Joined 10:33', True),
    ('Munashe Mangwiro', 'Manager', 'Invited', False),
    ('Simbarashe Mudonhi', 'Field worker', 'Invited', False),
]
mr = ''.join(f'<div class="w3-row" style="min-height: 52px"><span class="face face-32"{"" if on else " style=\"opacity: 0.5\""}><span class="i i-person i-sm"></span></span><div><div class="w3-row__t">{n}</div><div class="w3-row__s">{r}</div></div><span class="w3-row__e">{t}</span></div>' for n, r, t, on in members)
s10 = f'''<div class="cx w3-join" data-theme="corelith">
  <section class="w3-join__ws" aria-label="Corelith">
    <span class="w3-join__logo"><img src="{LOGO}" alt="Corelith logo" width="38" height="43"></span>
    <h1 class="w3-h" style="font-size: 32px">Corelith</h1>
    <dl class="w3-kv">
      <dt><span class="i i-pin"></span>Town</dt><dd>Harare</dd>
      <dt><span class="i i-box"></span>Product</dt><dd>{P_SVG(16)}Pabasa</dd>
      <dt><span class="i i-clients"></span>Seats</dt><dd>5 of 5</dd>
    </dl>
    <div class="w3-list" style="background: var(--surface)">{mr}</div>
    <div style="margin-top: auto" class="brandmark">{P_SVG(16)}Pabasa<span class="muted" style="font-weight: 400">by Corelith</span></div>
  </section>
  <main class="w3-join__main">
    <div style="display: flex; align-items: center; gap: 10px"><span class="face face-32"><span class="i i-person i-sm"></span></span><span class="muted"><b class="strong">Sean Muchenje</b> invited you · Monday 7 September, 10:21</span></div>
    <h2 class="headline" style="font-size: 44px">Join Corelith</h2>
    <dl class="w3-kv" style="max-width: 560px">
      <dt><span class="i i-mail"></span>You</dt><dd>tatenda@corelith.co.zw<span class="i i-lock i-sm" style="color: var(--faint)"></span></dd>
      <dt><span class="i i-shield"></span>Role</dt><dd>Admin</dd>
      <dt><span class="i i-person"></span>Your name</dt><dd><span class="w3-input w3-input--focus" style="width: 360px">Tatenda Chinyamakobvu<span class="w3-caret"></span></span></dd>
    </dl>
    <div style="display: flex; gap: var(--s2)"><button class="btn btn--primary btn--lg" type="button">Join Corelith<span class="kbd">Enter</span></button></div>
  </main>
</div>'''
write('W3-10-join-desktop.dc.html', 'Tatenda joins on his computer', s10, 1440, 900)

# failures
def frame(inner, h=372):
    return f'<div class="w3-fail__f" style="height: {h}px">{inner}</div>'
f1 = frame(f'''{pbar('')}
  <div class="w3-pad" style="gap: var(--s4)">
    <h1 class="w3-h w3-h--sm">Your code <span>sean@corelith.co.zw</span></h1>
    <div class="w3-code w3-code--bad"><span>4</span><span>8</span><span>2</span><span>9</span><span>1</span><span>3</span></div>
    <div class="w3-err"><span class="i i-alert i-sm"></span>Expired at 10:12</div>
    <button class="btn btn--primary btn--block" type="button"><span class="i i-retry"></span>Send a new code</button>
  </div>''')
f2 = frame(f'''{pbar('')}
  <div class="w3-pad" style="gap: var(--s3)">
    <h1 class="w3-h w3-h--sm">Your workspace</h1>
    <label class="w3-field"><span class="w3-label">Name</span><span class="w3-input w3-input--bad">Corelith</span></label>
    <div class="w3-err"><span class="i i-alert i-sm"></span>corelith is taken as an address</div>
    <button class="btn btn--block" type="button"><span class="i i-check"></span>Use corelith-harare</button>
  </div>''')
f3 = frame(f'''{pbar('Your clients')}
  <div class="w3-pad" style="gap: var(--s3)">
    <div class="w3-row" style="border: 0; min-height: 44px"><span class="lk__mark"><span class="i i-doc"></span></span><div><div class="w3-row__t">contacts-export.csv</div><div class="w3-row__s">3 columns · 210 rows</div></div><span></span></div>
    <div class="w3-map"><code>Column1</code><span class="i i-arrow-right"></span><span style="color: var(--bad)">?</span><code>Column2</code><span class="i i-arrow-right"></span><span style="color: var(--bad)">?</span><code>Column3</code><span class="i i-arrow-right"></span><span style="color: var(--bad)">?</span></div>
    <button class="btn btn--block" type="button"><span class="i i-match"></span>Match the columns</button>
  </div>''')
f4 = frame(f'''{pbar('Your team')}
  <div class="w3-pad" style="gap: var(--s3)">
    <div class="w3-mate" style="border: 0"><span class="face face-32"><span class="i i-person i-sm"></span></span><div style="min-width: 0"><div class="w3-row__t">Simbarashe Mudonhi</div><div class="w3-mate__via" style="color: var(--bad)"><span class="i i-alert" style="width: 13px; height: 13px; color: var(--bad)"></span>+263 71 945 0372 isn't on WhatsApp</div></div><span></span></div>
    <label class="w3-field"><span class="w3-label">Email</span><span class="w3-input w3-input--focus">simbarashe@corelith.co.zw<span class="w3-caret"></span></span></label>
    <button class="btn btn--block" type="button"><span class="i i-mail"></span>Send by email instead</button>
  </div>''')
f5 = frame(f'''<div class="w3-offline"><span class="i i-offline i-sm"></span>Offline<span class="muted">Saved 10:14</span></div>
  {pbar('How a deal moves')}
  <div class="w3-pad" style="gap: var(--s3); opacity: 0.55">
    <div class="w3-list"><div class="w3-stage"><span class="i i-grip"></span><span class="w3-stage__n">1</span>Lead<span></span></div><div class="w3-stage"><span class="i i-grip"></span><span class="w3-stage__n">2</span>Visit<span></span></div><div class="w3-stage"><span class="i i-grip"></span><span class="w3-stage__n">3</span>Proposal sent<span></span></div></div>
  </div>
  <div style="padding: 0 var(--s4)"><button class="btn btn--block" type="button"><span class="i i-retry"></span>Try again</button></div>''')
cells = [('The code expired', f1), ('The address is taken', f2), ('No columns it knows', f3), ('Not on WhatsApp', f4), ('The signal drops', f5)]
fb = '<div class="cx w3-fail" data-theme="corelith" style="min-height: 900px">' + ''.join(f'<div class="w3-fail__c"><div class="w3-fail__n">{n}</div>{f}</div>' for n, f in cells) + '</div>'
write('W3-F-failures.dc.html', 'What goes wrong in W3', fb, 1440, 900)
print('ok')
