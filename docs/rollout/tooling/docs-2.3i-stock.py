import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3h executed:"
row=("| 2026-09-06 | — | **Phase 2.3i (stock) executed: `packages/modules/stock`.** `lib/inventory` and the inventory and stores components as "
     "`@corelithzw/module-stock`, requiring people (the storeman an issue goes to, read through the directory). The stock screens borrowed three "
     "CRM components; they now live where they belong — the record history feed, the rich-text renderer and the rich text itself in records, the "
     "setup chrome in `ui` — and the CRM imports them from there; the history feed groups its rows with the CRM's generic record list, so `record-list` and `record-list-groups` went to records too, and stock requires records for it. The shelf-price integrity test reads the retail price list, so it stays in the "
     "host. The stock client left `lib/api.ts`; sites come from the kernel's client. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3i-stock applied")
