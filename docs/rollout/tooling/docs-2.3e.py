import re
p="/home/user/huchu/README.md"; s=open(p).read()
m=re.search(r'\| `packages/modules/` \|[^\n]*\n', s); row=m.group(0)
new=re.sub(r'So far: [^|]*\|', 'So far: `workflow`, `notifications`, `records`, `documents`. |', row)
open(p,"w").write(s.replace(row,new))
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3d executed:"
row=("| 2026-09-06 | — | **Phase 2.3e executed: `packages/modules/documents`.** The render pipeline (sources, branded templates, PDF/HTML/CSV, the "
     "export client), `lib/pdf.ts`, the PDF viewer, and from the CRM the block templates, starter templates, template variables, the template editor "
     "and the template library, as `@corelithzw/module-documents`; `RecordDialog` to `ui`. Two seams: the source registry imported the school's and "
     "payroll's resolvers and switched on the accounting, report and dashboard keys — sources are a registry the host wires from `modules.ts` "
     "(`registerDocumentSource`), the school and payroll resolvers moved next to their modules and the rest to `lib/host/document-sources.ts` until "
     "books, gold and people move; the default template catalogue named every module's documents — the module keeps its one table template and reads "
     "the rest from the manifests (`documents.templates`, data built with the module's schema helpers), declared by books (a manifest ahead of its "
     "move), gold, people and schools. Because the template studio reads the catalogue in the browser, this is also why manifests are imported on "
     "every side. The CRM manifest declares that it requires documents. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3e applied")
