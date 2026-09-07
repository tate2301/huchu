import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`, `maintenance`, `compliance`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3i (stock) executed:"
row=("| 2026-09-06 | — | **Phase 2.3i (maintenance, compliance) executed: `packages/modules/maintenance`, `packages/modules/compliance`.** The two "
     "add-on modules — their screens, their clients, their manifests — as `@corelithzw/module-maintenance` (requires stock, people, documents: the "
     "store an order draws on, the technician it goes to, the job card) and `@corelithzw/module-compliance` (requires people, documents). Both "
     "borrowed the users list from `lib/api.ts`; it is the kernel's client now (`platform/client/users`), beside sites and ids. The API routes, "
     "the notification emitters and the pages stay in the host until the first product host composes these modules. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3i-addons applied")
