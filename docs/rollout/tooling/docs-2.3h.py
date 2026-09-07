import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`, `books`, `people`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3g executed:"
row=("| 2026-09-06 | — | **Phase 2.3h executed: `packages/modules/people`.** `lib/hr`, `lib/people`, `lib/payroll`, `payroll-periods.ts` and the "
     "people and payroll components as `@corelithzw/module-people`, requiring books, workflow, documents and records — the first module with real "
     "declared dependencies, and the boundary test holds it to them. `directory.ts` is the subpath other modules read people through: the search arm "
     "and the linkable-user client to start, the employee list as the readers arrive. The old `lib/hr/module-boundary.test.ts` is gone: a package has "
     "a root, and its boundary test is the one every module has. The two HR tests that read the host (route-guard coverage over `app/api`, the "
     "productisation test over the host's navigation and workspaces) moved to `lib/host`. `PersonAvatar`, which lived under the school's components "
     "and was used everywhere, went to `ui`. The people manifest written ahead of the move came home. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3h applied")
