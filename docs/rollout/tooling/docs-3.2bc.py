import pathlib, json, sys
ROOT = pathlib.Path("/home/user/huchu"); HOST = sys.argv[1]
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:50]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)
SPEC = {
    "crm": dict(phase="3.2b", Name="CRM", nth="third", composes="the CRM, stock, books, people, documents, notifications, records, workflow, offline",
                row_readme="| `apps/crm/` | The CRM host: the sales product on its own Vercel project and host, composed from the CRM module and what it requires (stock, books, people, documents, notifications, records, workflow, offline). The same shape as the Campus host. `pnpm crm <script>` runs its scripts. |\n",
                plan=("**Phase 3.2b executed: `apps/crm`, the CRM host.** The third product host from the same spec. `manifests.ts` composes workflow, notifications, "
                      "offline, records, documents, books, people, stock and the CRM; `modules.ts` wires the people module's approval notices, the CRM's record guard, "
                      "the CRM and staff search arms, the payslip and books document sources, and the books' sales hooks the CRM listens to (a quote and a deal kept in "
                      "step with the invoice and the receipt). Its own data: the navigation (the CRM's objects, work, documents, insights, workflows and setup; stores; "
                      "people; payroll; the books; settings), the management areas (branding, HR master data, users, templates — no compliance module, so that area is "
                      "empty), the workspace catalogue (the CRM proper as its module — the enterprise host's version also lists the shop's customer ledger — with stores, "
                      "people, payroll, accounting, management, reporting; the PAYROLL and GENERAL profiles), the workforce offline scope. The app shell keeps the CRM's "
                      "members and collections and the stock-locations query. Its search route runs the CRM's and the staff directory's arms. 449 composed files. "
                      "No fiscal-backlog listener: the host composes no compliance module, so a stuck drain raises nothing here."),
                not_served="the CRM host has no school, till, maintenance, compliance or mine",
                runbook_row="| CRM | 3.2b | `apps/crm` | `*.crm.corelith.co.zw` | `crm.corelith.co.zw` | the CRM, stock, books, people, documents, notifications, records, workflow, offline |\n"),
    "people": dict(phase="3.2c", Name="People", nth="fourth", composes="people, compliance, books, documents, notifications, records, workflow, offline",
                row_readme="| `apps/people/` | The People host: the HR and payroll product on its own Vercel project and host, composed from the people module and what it requires (compliance, books, documents, notifications, records, workflow, offline). The same shape as the Campus host. `pnpm people <script>` runs its scripts. |\n",
                plan=("**Phase 3.2c executed: `apps/people`, the People host.** The fourth product host from the same spec, and the smallest: `manifests.ts` composes "
                      "workflow, notifications, offline, records, documents, books, people and compliance; `modules.ts` wires the people module's approval notices, "
                      "the staff search arm, the payslip and books document sources, and the compliance incident a stuck fiscal drain raises. Its own data: the "
                      "navigation (people, payroll, the books, attendance and incident reports, settings), the management areas (branding, HR master data, compliance, "
                      "users, templates), the workspace catalogue (people, payroll, accounting, management, reporting; the PAYROLL and GENERAL profiles), the workforce "
                      "offline scope. The app shell has no CRM shelves and no stock query; the search route runs the staff directory's arm. 284 composed files. "
                      "Every product in the plan's Phase 3 has a host now; what remains before a tenant moves is Phase 3.3 (portal hosts one label on product roots) "
                      "and the owner's Vercel projects."),
                not_served="the People host has no school, till, stock, CRM, maintenance or mine",
                runbook_row="| People | 3.2c | `apps/people` | `*.people.corelith.co.zw` | `people.corelith.co.zw` | people, compliance, books, documents, notifications, records, workflow, offline |\n"),
}[HOST]
ROW = f"| 2026-09-06 | — | {SPEC['plan']} |\n"
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)
prev = {"crm": "| `apps/sell/` | The Sell host", "people": "| `apps/crm/` | The CRM host"}[HOST]
s = (ROOT / "README.md").read_text(); i = s.index(prev); j = s.index("\n", i) + 1
(ROOT / "README.md").write_text(s[:j] + SPEC["row_readme"] + s[j:]); print("edited README.md")
if HOST == "crm":
    edit("AGENTS.md", "`apps/campus/` and `apps/sell/` are product hosts:", "`apps/campus/`, `apps/sell/` and `apps/crm/` are product hosts:")
else:
    edit("AGENTS.md", "`apps/campus/`, `apps/sell/` and `apps/crm/` are product hosts:", "`apps/campus/`, `apps/sell/`, `apps/crm/` and `apps/people/` are product hosts:")
prev_row = {"crm": "| Sell | 3.2a |", "people": "| CRM | 3.2b |"}[HOST]
p = ROOT / "docs/rollout/product-split-deployment.md"; s = p.read_text(); i = s.index(prev_row); j = s.index("\n", i) + 1
s = s[:j] + SPEC["runbook_row"] + s[j:]
old_ns = {"crm": "maintenance or mine; the Sell host has no school, CRM or mine.", "people": "maintenance or mine; the Sell host has no school, CRM or mine; the CRM host has no school, till, maintenance, compliance or mine."}[HOST]
new_ns = old_ns[:-1] + "; " + SPEC["not_served"] + "."
assert s.count(old_ns) == 1, old_ns; s = s.replace(old_ns, new_ns); p.write_text(s); print("edited runbook")
pj = ROOT / "package.json"; d = json.loads(pj.read_text())
d["scripts"][HOST] = f"pnpm --filter @corelithzw/{HOST} run"; d["scripts"][f"dev:{HOST}"] = f"turbo run dev --filter=@corelithzw/{HOST}"
pj.write_text(json.dumps(d, indent=2) + "\n"); print("edited package.json"); print("done")
