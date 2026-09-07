import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`, `books`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3f executed:"
row=("| 2026-09-06 | — | **Phase 2.3g executed: `packages/modules/books`.** `lib/accounting` and `components/accounting` as `@corelithzw/module-books`, "
     "requiring documents and notifications. Two seams, both hooks the host fills from `modules.ts`: the fiscal drain's issuer for a school's fee "
     "receipt (`registerFiscalDrainIssuer`) and what happens when a tenant's receipts have been stuck for a while (`onFiscalBacklog`; the compliance "
     "emitter raises the incident) — books names neither. The accounting API client left `lib/api.ts` for the module's own `api-client.ts`, and "
     "the kernel got its own browser clients (`client/sites`, `client/ids`) and the reserved-id hook, which every module's forms use; `lib/api.ts` "
     "re-exports all of it. The report table, domain-free, went to `ui`. The books manifest written ahead of the move came home. The default "
     "accounts and source types that name gold and retail stay in the module as data until those modules move. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3g applied")
