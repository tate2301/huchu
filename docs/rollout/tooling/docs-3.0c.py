import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'All fourteen: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`, `maintenance`, `compliance`, `offline`, `gold`, `campus`, `sell`, `crm`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 3.0b executed:"
row=("| 2026-09-06 | — | **Phase 3.0c executed: `packages/modules/crm`.** `lib/crm` and `components/crm` — leads, people, companies, sites and deals, "
     "pipelines, tasks and appointments, quotes and work orders, intake, visits and sign-off, automation, commissions, collaboration, collections — "
     "as `@corelithzw/module-crm`, requiring records, documents, books, stock and notifications; the manifest written ahead of the move in 2.3a "
     "comes home. The CRM's two notification emitters left the host's `lib/notifications.ts` for the module's `notifications.ts`, on the "
     "notifications service; the four routes that raise them import the package. The permission matrix the rep settings render is the shell's "
     "(`shell/permission-matrix`): it knows roles and capabilities, which is the shell's business. With this the fourteen modules of the target "
     "layout exist as packages; the host composes all of them and still serves every route and page. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 3.0c applied")
