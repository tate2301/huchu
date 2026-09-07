import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`, `maintenance`, `compliance`, `offline`, `gold`, `campus`, `sell`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 3.0a executed:"
row=("| 2026-09-06 | — | **Phase 3.0b executed: `packages/modules/sell`.** `lib/retail` and `components/retail` — the till and its shifts, sales, "
     "refunds and voids, cash-up, Z reports, shelf pricing, fiscalisation, the POS portal and its offline runtime — as `@corelithzw/module-sell`, "
     "requiring books, offline, records and stock; manifest id `retail`, the schema's name. The transaction engine lived in the API route "
     "directory as `_services.ts` (1,800 lines: open and close a shift, a sale, a refund, a void, a Z report); it is the module's "
     "`transactions.ts`, imported by the ten routes and its test from there. The host's auth options and proxy still ask retail which host "
     "serves the POS portal; they import the package. Two tests that read the host — route-guard coverage over `app/api`, the areas test over "
     "the host's navigation — moved to `lib/host`. The API routes and pages stay in the host until the Sell host composes the module. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 3.0b applied")
