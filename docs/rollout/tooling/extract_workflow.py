"""Phase 2.3b: lib/workflow -> packages/modules/workflow, a leaf module with an approval-action listener hook."""
import os, re, subprocess, sys
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/workflow"
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def edit(path, pairs):
    s=open(path).read()
    for old,new,count in pairs:
        n=s.count(old); assert n==count,(path,old[:70],n,count)
    for old,new,count in pairs: s=s.replace(old,new)
    open(path,"w").write(s)
steps=sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps

if want("move"):
    sh(f"python3 /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/new_module.py workflow")
    for f in sorted(os.listdir(f"{APP}/lib/workflow")):
        sh(f'git mv "{APP}/lib/workflow/{f}" "{PKG}/{f}"')
    os.rmdir(f"{APP}/lib/workflow")
    print("moved")

if want("rewrite"):
    SPEC=re.compile(r'(["\'])@/lib/workflow(/[^"\']*)?\1')
    n=0
    for dp,dn,fn in os.walk(APP):
        dn[:]=[d for d in dn if d not in ("node_modules",".next",".turbo")]
        for f in fn:
            if not f.endswith((".ts",".tsx",".mjs",".js")): continue
            p=os.path.join(dp,f); s=open(p).read()
            new=SPEC.sub(lambda m: f'{m.group(1)}@corelithzw/module-workflow{m.group(2) or ""}{m.group(1)}', s)
            if new!=s: open(p,"w").write(new); n+=1
    print("app files rewritten:", n)

if want("seams"):
    # the notification on an approval action becomes a listener the host registers
    p=f"{PKG}/approvals.ts"
    edit(p, [
        ('import type { AuthenticatedSession } from "@corelithzw/platform/api-utils"\nimport { emitWorkflowNotificationFromApprovalAction } from "@/lib/notifications"\n',
         'import type { AuthenticatedSession } from "@corelithzw/platform/api-utils"\nimport { registry } from "@corelithzw/platform/registry"\n', 1),
        ('''export type StandardWorkflowStatus =''', '''/**
 * What happened, for whoever wants to know.
 *
 * Recording an approval action and telling people about it were one function,
 * which made this module import the notifications module and, through it, the
 * payroll, gold and settlement entities those notifications describe. Now the
 * module records and fires; a host registers the listeners it composes
 * (`onApprovalAction` from its `modules.ts`), and the notifications module is
 * the first of them. Listeners run inside the caller's transaction, in
 * registration order, so a workflow step is never recorded but silent.
 */
export type ApprovalActionEvent = Pick<
  ApprovalActionInput,
  "companyId" | "entityType" | "entityId" | "action" | "actedById"
>

export type ApprovalActionListener = (
  tx: Prisma.TransactionClient,
  event: ApprovalActionEvent,
) => Promise<unknown>

const listeners = registry<Set<ApprovalActionListener>>(
  "workflow.approval-action-listeners",
  () => new Set(),
)

export function onApprovalAction(listener: ApprovalActionListener) {
  listeners.add(listener)
}

export type StandardWorkflowStatus =''', 1),
        ('''/**
 * Write the audit row and notify.
 *
 * Both, always, and inside the caller's transaction. Splitting the notification
 * out would mean a workflow step that is recorded but silent, which is how an
 * approval waiting on someone goes unnoticed.
 */''', '''/**
 * Write the audit row and tell the listeners.
 *
 * Both, always, and inside the caller's transaction. Splitting the listeners
 * out would mean a workflow step that is recorded but silent, which is how an
 * approval waiting on someone goes unnoticed.
 */''', 1),
        ('''  await emitWorkflowNotificationFromApprovalAction(tx, {
    companyId: input.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actedById: input.actedById,
  })
}''', '''  const event: ApprovalActionEvent = {
    companyId: input.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actedById: input.actedById,
  }
  for (const listener of listeners) {
    await listener(tx, event)
  }
}''', 1),
    ])
    # the enum-retirement test greps the whole workspace now, not the host it used to live in
    p=f"{PKG}/approvals.test.ts"
    edit(p, [
        ('''    const hits = execSync(
      `grep -rn "${value}" --include=*.ts --include=*.tsx app components lib || true`,
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\\n")
      .filter(Boolean)
      .filter((line) => !line.startsWith("lib/workflow/approvals.test.ts"))''',
         '''    const hits = execSync(
      `grep -rn "${value}" --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next apps packages || true`,
      { cwd: WORKSPACE_ROOT, encoding: "utf8" },
    )
      .split("\\n")
      .filter(Boolean)
      .filter((line) => !line.startsWith("packages/modules/workflow/approvals.test.ts"))''', 1),
        ('''import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
''', '''import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
''', 1),
        ('''const RETIRED_BUT_DECLARED = ["IRREGULAR_PAYOUT_BATCH"] as const;
''', '''const RETIRED_BUT_DECLARED = ["IRREGULAR_PAYOUT_BATCH"] as const;

/** Every host and every module: the rule is product-wide, wherever the code lives. */
const WORKSPACE_ROOT = resolve(__dirname, "../../..");
''', 1),
    ])
    # manifest + host registration of the notifications listener
    open(f"{PKG}/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Approvals: the submit → approve → reject workflow and its audit trail, which
 * eight domains write to. A leaf: it requires no other module, and what happens
 * after an action is up to the listeners a host registers (`onApprovalAction`).
 */
export const manifest: ModuleManifest = {
  id: "workflow",
};
''')
    open(f"{PKG}/index.ts","w").write('''// Deep imports are the norm (`@corelithzw/module-workflow/approvals`); this entry
// carries the manifest a host composes with and the hook it fills.
export { manifest } from "./manifest";
export { onApprovalAction, type ApprovalActionEvent, type ApprovalActionListener } from "./approvals";
''')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-workflow

The submit → approve → reject workflow and its audit trail (`ApprovalAction`),
written to by payroll runs, disbursements, adjustments, compensation, gold
allocations, settlements and disciplinary actions.

```
approvals.ts   transitions, approver checks, createApprovalAction, the onApprovalAction hook
periods.ts     period keys for payroll cycles
manifest.ts    id "workflow"; requires nothing
```

Import by path: `import { createApprovalAction } from "@corelithzw/module-workflow/approvals"`.

A leaf module. Recording an action fires the listeners a host registered from
its `modules.ts` (`onApprovalAction`), inside the caller's transaction; the
notifications module registers the one that tells the approvers.
''')
    p=f"{APP}/modules.ts"
    edit(p, [
        ('import { registerModules, unmetModuleRequirements } from "@corelithzw/platform/manifest";\n',
         'import { registerModules, unmetModuleRequirements } from "@corelithzw/platform/manifest";\nimport { manifest as workflow, onApprovalAction } from "@corelithzw/module-workflow";\n', 1),
        ('registerModules([crm]);\n', 'registerModules([workflow, crm]);\n\n// Code the modules hook into each other with, wired here and imported on first\n// use, so reading the composition costs nothing but the manifests. After an\n// approval action, for this host: the approvers are told.\nonApprovalAction(async (tx, event) =>\n  (await import("@/lib/notifications")).emitWorkflowNotificationFromApprovalAction(tx, event),\n);\n', 1),
    ])
    print("seams done")

if want("check"):
    left=[]
    for dp,dn,fn in os.walk(PKG):
        for f in fn:
            if f.endswith((".ts",".tsx")) and '"@/' in open(os.path.join(dp,f)).read(): left.append(f)
    print("package files importing '@/':", left or "none")
