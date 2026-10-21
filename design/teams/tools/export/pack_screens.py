import json,re
items=json.load(open('pack/boards.json'))
R=[ # (regex on id, slice, route, note)
(r'^W1-1|^A6|^W7-1|^W7-2|^P2', 'teams','/activity','Notifications and activity; the bell opens the same list'),
(r'^W1-6','teams','/activity (phone)','Needs you on a phone, with Approve'),
(r'^DealNyatsime|^W1-[345]|^W8-[1256]|^W8-FA','teams','/crm/deals/[id]','The record page: top bar, tabs, timeline, standard right panel, presence and calls'),
(r'^W1-F','teams','/crm/deals/[id]','Failure states for the record'),
(r'^W8-3','teams','/crm/deals/[id] (no access)','Access request behind a lock'),
(r'^W8-4','teams','/activity (phone)','Let her in, from Needs you'),
(r'^W8-7|^W8-FB','teams','/crm/quotes/[id]','A quote priced from kept prices; confirm the quote route'),
(r'^W8-8','teams','public quote link (new)','What the client opens'),
(r'^W8-9','teams','Pabasa home (For you)','Setup complete'),
(r'^W2-1|^W2-4|^W2-7|^W2-F|^W4-1|^W4-5|^A4|^P3','teams','/preferences/organization/users','Members: seats, invites, states'),
(r'^W2-2','teams','/activity (phone)','A seat request in Needs you'),
(r'^W2-3','teams','Management → Billing (phone)','Add a seat and pay'),
(r'^W2-5|^W6-10|^W3-10','teams','/join/[code] (new)','Joining from an invite'),
(r'^W2-6','teams','/crm/deals (phone)','First landing after joining'),
(r'^W3-[1-9]-|^W3-F','teams','/signup/pabasa','Pabasa signup and setup, phone first'),
(r'^W4-[2-4]|^W4-[6-8]|^W4-F|^A5','teams','/preferences/organization/users/[id]','A member: role, permissions, suspend, ownership'),
(r'^W4-9|^P1','teams','/crm/deals (phone)','What a member sees after an access change'),
(r'^O[1-4]-|^O-F','teams','/signup/[product] (Start from a document)','Vane reads the company profile during setup'),
(r'^O5','teams','/signup/[product] (phone camera)','Photographing a printed list'),
(r'^O6','teams','Management → Vane → Knowledge (new)','What Vane kept, each with its page'),
(r'^O7|^W6-2','teams','/signup/tender (What you sell)','Price list to products'),
(r'^W6-[13-7]-|^W6-F','teams','/signup/tender','Tender setup steps'),
(r'^W6-8|^A3|^P4','teams','Tender home','Setup checklist on the home'),
(r'^W6-3b|^W6-9','till','POS host: /login (pair, Who\'s selling?)','Shipped; the direction the till boards follow'),
(r'^W7-3','teams','/preferences/notifications','Channels, kinds, quiet hours'),
(r'^W7-4|^W7-5','teams','workspace switcher (sidebar head)','Switch workspace and member'),
(r'^W7-6','teams','Management → Invite link (new)','Invite link and verified domain'),
(r'^W7-F','teams','several','Failures across the workspace'),
(r'^K','kit','/kit','Components and their states'),
(r'^T1-[1-4]|^T1-5','till','POS host: the till (Sell, Pay)','components/retail/till'),
(r'^T1-6','till','POS host: Held','Hold with a note, recall'),
(r'^T2','till','POS host: the till, On account tender','Needs CUS-10'),
(r'^T3-4','till','Tender on the manager\'s phone: Needs you','Approve a refund remotely'),
(r'^T3','till','POS host: History → Refund','Manager approval'),
(r'^T4','till','POS host on a PC (Till 2): Layby','Keyboard, no keypad'),
(r'^T5','till','POS host: History','Filters and reprint'),
(r'^T6','till','POS host: Shift','Float, cash to the safe, blind count, close'),
(r'^T7-4','till','Tender on the owner\'s phone: Members → a member','Send a new PIN'),
(r'^T7','till','POS host: Lock and PIN','PIN locked, password, choose your own PIN'),
(r'^T8','till','POS host: offline','Saved on this till, waiting to send, stop'),
(r'^T9','till','POS host on the Kora (390 wide)','Phone-sized till'),
(r'^T-F','till','POS host','Failures'),
]
wf={'w1':'W1','w2':'W2','w3':'W3','w4':'W4','w5':'W5','w6':'W6','w7':'W7','w8':'W8','till':'T','shell':'Gate','kit':'Kit'}
out=[]
for it in items:
    hit=next((r for r in R if re.search(r[0],it['id'])),None)
    assert hit, it['id']
    tw=re.match(r'^(T\d|T-F)',it['id'])
    out.append(dict(id=it['id'],slice=hit[1],workflow=(tw.group(1) if tw else wf[it['page']]),page=it['pageName'],title=it['title'],state=it['state'],
      size=f"{it['width']}x{it['height']}",device='phone' if it['width']<=480 else ('till' if it['id'].startswith(('T','W6-3b','W6-9')) else 'desktop'),
      route=hit[2],note=hit[3],html=it['html'],png=it['png'],source='boards/canvas/'+it['source']))
json.dump(out,open('pack/design/teams/spec/screens.json','w') if __import__('os').makedirs('pack/design/teams/spec',exist_ok=True) is None else None,indent=1,ensure_ascii=False)
from collections import Counter
print(Counter(o['slice'] for o in out), len(out))
