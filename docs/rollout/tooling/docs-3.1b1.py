import pathlib
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:50]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)

ROW = ("| 2026-09-06 | — | **Phase 3.1b-1 executed: the host's API client barrel and its notification emitters go to their owners.** "
       "Two host files stood between the shared modules' screens and routes and their packages. `lib/api.ts` re-exported every module's "
       "browser client and defined the leftovers itself; the leftovers went home — the sites and managed-users clients to the kernel "
       "(`platform/client/sites`, `platform/client/managed-users`), approval history to people, web-push subscriptions to notifications, the "
       "sections, downtime codes, shift and plant reports and expense types to gold, customers, vendors, debit notes, statements, cash flow, "
       "the seed pack and the integration tools to books — and the seventy importers read the owner by path; the barrel is gone. "
       "`lib/notifications.ts` held the emitters of five modules: the HR incident to `people/hr/notifications`, the compliance incident and permit "
       "to `compliance/notifications`, the work order to `maintenance/notifications`, the gold exceptions, import and dispatch (with their test) "
       "to `gold/notifications`; the one recipients rule and the incident severity scale they shared are the notifications module's "
       "(`escalation.ts`). The approval emitter was one function over seven entity types of two modules; it is now a generic "
       "`emitApprovalNotice(db, input, resolver)` in `people/approval-notifications` — a module describes each notice (type, label, view path, "
       "copy) and the emitter writes it to the approvers or the submitter and prior approvers — with the people module's six entities "
       "resolved there and the gold settlement allocation in `gold/approval-notifications`, the gold module reading the emitter through the "
       "people module it already requires. The host registers both with the workflow module's `onApprovalAction`. People, compliance, "
       "maintenance and gold now declare `notifications` in their manifests, as they always used it. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)
edit("README.md",
     "   - Add notifications in `lib/notifications.ts` when users need workflow feedback.\n",
     "   - Add notifications from the owning module's `notifications.ts` through `@corelithzw/module-notifications/service` (recipients and severity scale: `escalation.ts`); approval notices through a resolver for `emitApprovalNotice` in `@corelithzw/module-people/approval-notifications`.\n")
p = ROOT / "packages/modules/notifications/README.md"; s = p.read_text()
old = [l for l in s.splitlines() if "lib/notifications.ts" in l]
assert len(old) == 1, old
print("notifications README line:", old[0])
edit("packages/modules/notifications/README.md",
     "the registered manifests. The emitters that know those entities live with their\nmodules — until a module is extracted, in the host's `lib/notifications.ts`.\n",
     "the registered manifests. The emitters that know those entities live with their\nmodules (`notifications.ts` in each); what they share is here: `escalation.ts`,\nthe managers-and-the-clerk recipients rule and the incident severity scale. The\napproval emitter is the people module's (`approval-notifications.ts`), and a\nmodule with approvable entities of its own gives it a resolver.\n")
print("done")
