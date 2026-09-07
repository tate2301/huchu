import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`, `maintenance`, `compliance`, `offline`, `gold`, `campus`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3j executed:"
row=("| 2026-09-06 | — | **Phase 3.0a executed: `packages/modules/campus`.** Phase 3 cuts Campus first, and the school's domain was still host code, so the "
     "cut begins with the module: `lib/schools` and `components/schools` — students and guardians, admissions, classes, timetable, attendance, "
     "assessments, fees, boarding, transport, library, the three portals — as `@corelithzw/module-campus`, requiring records, documents, books, "
     "offline, people (the staff directory, which grows the departments it reads) and notifications. The manifest id stays `schools`, the schema's "
     "name for the module, which the record types, features and routes carry; the package is named for the product. Two things left their odd "
     "homes on the way: the generic CSV import engine (`lib/import-core`) is the kernel's (`platform/import-core`), and the fee-posting helper "
     "that lived in the API route directory (`fees/_helpers.ts`) is the module's `fees-posting.ts`, imported by the routes and its test from "
     "there. The school's record screens read the CRM's field-definition alias; they read records' `FieldDefinitionRecord` now. The API routes, "
     "the pages and the portals' pages stay in the host until the Campus host composes the module (3.1). |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 3.0a applied")
