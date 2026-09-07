import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`, `maintenance`, `compliance`, `offline`, `gold`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3i (offline) executed:"
row=("| 2026-09-06 | — | **Phase 2.3i (gold) executed: `packages/modules/gold`.** `lib/gold`, `lib/settlements`, `lib/operations`, `lib/dashboard`, "
     "`commodity-billing`, the gold and dashboard components and the gold screens' routes and shapes (which lived under `app/gold`) as "
     "`@corelithzw/module-gold`, requiring people, books, records and workflow — the crews and rosters through the people directory. Composed only "
     "into this host, never into a marketed product; the gold API routes, pages and notification emitters stay in the host. The gold client left "
     "`lib/api.ts`. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3i-gold applied")
