import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3c executed:"
row=("| 2026-09-06 | — | **Phase 2.3d executed: `packages/modules/records`.** `lib/records`, `components/records`, and from the CRM `custom-fields` and "
     "`record-ref`, as `@corelithzw/module-records`. Two seams: the record-type registry named the CRM's and the school's types with their hrefs and "
     "query keys — they are manifest data now (`records.types`, templates with `{id}`), declared by the CRM and by the schools module ahead of its move, "
     "and the registry turns them into the functions the screens call; the search aggregation imported six modules' arms — the arms are a registry the "
     "host wires from `modules.ts`, one lazy line per module, and `SearchScope` is keyed by arm id. The CRM's field-definition API shape lives with "
     "custom fields as `FieldDefinitionRecord`; the CRM client aliases it. The vocabulary of record types stays the schema's `CrmFieldEntity` enum, "
     "which modules extend in their own schema files. The school's own list of types moved to `lib/schools/record-types.ts`. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3d applied")
