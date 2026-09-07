import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`, `maintenance`, `compliance`, `offline`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/AGENTS.md"; s=open(p).read()
old="and `modules.ts` (server only — the code hooks modules fill for each other: auth options, approval listeners, search arms, document sources; imported from `instrumentation.ts`). A test that reads a registry imports `@/manifests` or `@/modules` accordingly."
new="`modules.ts` (server only — the code hooks modules fill for each other: auth options, approval listeners, search arms, document sources; imported from `instrumentation.ts`) and `modules.client.ts` (both sides — what the offline runtime warms and syncs, which is code, so it is not a manifest; imported by the providers in the browser and by `modules.ts`). A test that reads a registry imports `@/manifests`, `@/modules` or `@/modules.client` accordingly."
if s.count(old)==1: s=s.replace(old,new); open(p,"w").write(s); print("AGENTS updated")
else: print("AGENTS anchor missing")
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3i (maintenance, compliance) executed:"
row=("| 2026-09-06 | — | **Phase 2.3i (offline) executed: `packages/modules/offline`.** The runtime, outbox, sync engine, entity store, "
     "workflow catalogue, service-worker source and chrome as `@corelithzw/module-offline`, requiring nothing. Two seams: the module registry "
     "listed the workforce and till definitions with their sync adapters, and the workflow catalogue named the people and POS routes and "
     "decided scope by vertical — both are registries now (`registerOfflineModules`, `registerOfflineWorkflows`), a catalogue entry carries the "
     "features that put it in scope, and the host registers its definitions from a third composition file, `modules.client.ts`, imported by "
     "the providers in the browser and by `modules.ts` on the server: the definitions carry code, so they are not manifests, and the runtime "
     "runs in the browser, so the server-only file could not register them. The definitions move into people and retail as their manifests grow. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3i-offline applied")
