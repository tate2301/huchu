"""Phase 2.3c: the notifications module. The generic service, the centre and its hook and API client move;
the emitters that name payroll, gold, compliance, maintenance and the CRM stay in the host until their
modules move; view paths and approval actions become manifest data."""
import os, re, subprocess, sys, json
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/notifications"; PLAT=f"{ROOT}/packages/platform"
SCRATCH="/tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad"
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def edit(path, pairs):
    s=open(path).read()
    for old,new,count in pairs:
        n=s.count(old); assert n==count,(path,old[:70],n,count)
    for old,new,count in pairs: s=s.replace(old,new)
    open(path,"w").write(s)
def between(s, start_marker, end_marker):
    a=s.index(start_marker); b=s.index(end_marker, a); return s[a:b]
steps=sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps

if want("kernel"):
    # 1. the manifest carries what the notification centre needs to render a module's notices
    edit(f"{PLAT}/manifest.ts", [
        ('''export type ModuleId = string;
''', '''export type ModuleId = string;

/**
 * An action the notification centre offers on a notice, as a template: `{id}`
 * in `href` is the entity's id. Data, so a manifest can carry it.
 */
export type NotificationActionTemplate = {
  key: string;
  label: string;
  kind: "api" | "link";
  href: string;
  method?: "POST" | "PATCH" | "DELETE";
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  confirmMessage?: string;
};
''', 1),
        ('''  permissions?: {
    /** What a person may do inside the module, as the permission catalog lists it. */
    capabilities?: CapabilitySet;
  };
};''', '''  permissions?: {
    /** What a person may do inside the module, as the permission catalog lists it. */
    capabilities?: CapabilitySet;
  };
  notifications?: {
    /** Where a notice about one of the module's entities opens: entity type → path template with `{id}`. */
    viewPaths?: Readonly<Record<string, string>>;
    /** What an approver can do from the notice itself: notification type → action templates. */
    approvalActions?: Readonly<Record<string, readonly NotificationActionTemplate[]>>;
  };
};''', 1),
    ])
    # 2. query helpers every module's API client needs live in the kernel
    edit(f"{PLAT}/api-client.ts", [("", "", 0)]) if False else None
    s=open(f"{PLAT}/api-client.ts").read()
    s=s.rstrip("\n")+'''

/** A page of results, as every list endpoint returns it. */
export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
};

export type Pagination<T> = {
  data: T[];
  pagination: PaginationMeta;
};

/** `?a=1&b=2` from an object, skipping what is unset. */
export function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}
'''
    open(f"{PLAT}/api-client.ts","w").write(s)
    edit(f"{APP}/lib/api.ts", [
        ('''import { fetchJson } from "@corelithzw/platform/api-client";
''', '''import { buildQuery, fetchJson, type PaginationMeta } from "@corelithzw/platform/api-client";

export type { Pagination, PaginationMeta } from "@corelithzw/platform/api-client";
''', 1),
        ('''export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
};

export type Pagination<T> = {
  data: T[];
  pagination: PaginationMeta;
};

''', "", 1),
        ('''function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

''', "", 1),
    ])
    print("kernel: manifest notifications section, query helpers")

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py notifications")
    os.makedirs(f"{PKG}/components", exist_ok=True); os.makedirs(f"{PKG}/hooks", exist_ok=True)
    sh(f'git mv "{APP}/components/notifications/notification-center.tsx" "{PKG}/components/notification-center.tsx"')
    sh(f'git mv "{APP}/components/notifications/notification-renderers.tsx" "{PKG}/components/notification-renderers.tsx"')
    sh(f'git mv "{APP}/hooks/use-notification-stream.ts" "{PKG}/hooks/use-notification-stream.ts"')
    os.rmdir(f"{APP}/components/notifications")
    print("moved the centre and its hook")

if want("split"):
    src=open(f"{APP}/lib/notifications.ts").read()
    head=src[:src.index("function mapApprovalToNotificationType(")]
    emitters_workflow=between(src, "function mapApprovalToNotificationType(", "function payloadViewPath(")
    actions=between(src, "function payloadViewPath(", "async function getManagerIds(")
    managers=between(src, "async function getManagerIds(", "export async function emitGoldExceptionNotification(")
    emitters_rest=src[src.index("export async function emitGoldExceptionNotification("):]

    # ---- module: service.ts -------------------------------------------------------------
    service_head=head
    service_head=service_head.replace('''export type WorkflowNotificationInput = {
  companyId: string
  entityType: ApprovalTargetType
  entityId: string
  action: ApprovalActionType
  actedById: string
}

''', "")
    service_head=service_head.replace('''import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceAction,
  NotificationType,
  Prisma,
  PrismaClient,
  type ApprovalActionType,
  type ApprovalTargetType,
  type UserNotificationPreference,
} from "@corelithzw/db"
import { prisma } from "@corelithzw/db/client"

type DbClient = Prisma.TransactionClient | PrismaClient

type NotificationCategory = "HR" | "OPS" | "CRM"
''', '''/**
 * Notifications: who is told what, and what they can do about it.
 *
 * The service is generic — it writes a notice, fans it out to the recipients
 * whose preferences allow it, and turns a stored notice into the actions the
 * centre renders. It names no module. What a notice about a payroll run opens,
 * and what an approver may do from it, is data the owning module's manifest
 * carries (`notifications.viewPaths`, `notifications.approvalActions`); the
 * emitters that know those entities live with their modules.
 */
import {
  type NotificationEntityType,
  type NotificationSeverity,
  type NotificationSourceAction,
  type NotificationType,
  Prisma,
  PrismaClient,
  type UserNotificationPreference,
} from "@corelithzw/db"
import { prisma } from "@corelithzw/db/client"
import { registeredModules, type NotificationActionTemplate } from "@corelithzw/platform/manifest"

export type DbClient = Prisma.TransactionClient | PrismaClient

export type NotificationCategory = "HR" | "OPS" | "CRM"
''')
    service_head=service_head.replace("type CreateNotificationInput = {", "export type CreateNotificationInput = {")
    service_head=service_head.replace("function isApproverRole(role: string | undefined) {", "export function isApproverRole(role: string | undefined) {")
    service_head=service_head.replace("async function filterRecipientsForCategory(", "export async function filterRecipientsForCategory(")
    service_head=service_head.replace("async function createNotification(", "export async function createNotification(")
    assert "export async function createNotification(" in service_head and "export function isApproverRole" in service_head

    # the two module-naming functions become manifest lookups
    a=actions.index("function defaultViewPath("); b=actions.index("function approvalApiActions(")
    c=actions.index("export function parseNotificationPayload(")
    actions_new=actions[:a]+'''function fillTemplate(template: string, entityId: string) {
  return template.replace(/\\{id\\}/g, encodeURIComponent(entityId))
}

/** Where a notice opens, from the manifest of the module that owns the entity. */
function defaultViewPath(entityType?: NotificationEntityType | null, entityId?: string | null) {
  if (!entityType || !entityId) return undefined
  for (const manifest of registeredModules()) {
    const template = manifest.notifications?.viewPaths?.[entityType]
    if (template) return fillTemplate(template, entityId)
  }
  return undefined
}

/** What an approver can do from the notice, from the owning module's manifest. */
function approvalApiActions(type: NotificationType, entityId: string): NotificationActionDescriptor[] {
  for (const manifest of registeredModules()) {
    const templates = manifest.notifications?.approvalActions?.[type]
    if (templates) {
      return templates.map((template: NotificationActionTemplate) => ({
        ...template,
        href: fillTemplate(template.href, entityId),
      }))
    }
  }
  return []
}

'''+actions[c:]
    managers_new=managers.replace("async function getManagerIds(", "/** The managers of a company, who approve things; the usual recipients of a notice. */\nexport async function getManagerIds(")
    open(f"{PKG}/service.ts","w").write(service_head+actions_new+managers_new.rstrip("\n")+"\n")

    # ---- host: lib/notifications.ts keeps the emitters ------------------------------------
    host='''/**
 * The emitters this host's modules have not taken with them yet.
 *
 * Each names the entities of one module — payroll runs, gold allocations,
 * permits, work orders, leads — and moves into that module when it is
 * extracted. The service they write through is `@corelithzw/module-notifications`.
 */
import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceAction,
  NotificationType,
  type ApprovalActionType,
  type ApprovalTargetType,
} from "@corelithzw/db"
import { prisma } from "@corelithzw/db/client"
import {
  createNotification,
  getManagerIds,
  type DbClient,
} from "@corelithzw/module-notifications/service"

export {
  buildNotificationActions,
  parseNotificationPayload,
  type NotificationActionDescriptor,
} from "@corelithzw/module-notifications/service"

export type WorkflowNotificationInput = {
  companyId: string
  entityType: ApprovalTargetType
  entityId: string
  action: ApprovalActionType
  actedById: string
}

'''+emitters_workflow+emitters_rest
    open(f"{APP}/lib/notifications.ts","w").write(host)
    print("split: service.ts in the module; emitters stay in the host")

if want("client"):
    # the API client functions and their types move to the module; lib/api.ts re-exports them
    api=open(f"{APP}/lib/api.ts").read()
    types=between(api, "export type NotificationType =", "export type EmployeePayment = {")
    fns=between(api, "export async function fetchNotifications(", "export async function saveWebPushSubscription(")
    client='''/**
 * The notification centre's client: what the browser asks of `/api/notifications`.
 */
import { buildQuery, fetchJson, type PaginationMeta } from "@corelithzw/platform/api-client";

'''+types+fns
    open(f"{PKG}/api-client.ts","w").write(client.rstrip("\n")+"\n")
    api=api.replace(types, "").replace(fns, "")
    api=api.replace('''export type { Pagination, PaginationMeta } from "@corelithzw/platform/api-client";
''', '''export type { Pagination, PaginationMeta } from "@corelithzw/platform/api-client";
export {
  archiveNotifications,
  fetchNotificationPreferences,
  fetchNotifications,
  markNotificationsRead,
  updateNotificationPreferences,
  type NotificationAction,
  type NotificationEntityType,
  type NotificationListItem,
  type NotificationListResponse,
  type NotificationSeverity,
  type NotificationType,
  type UserNotificationPreferences,
} from "@corelithzw/module-notifications/api-client";
''', 1)
    open(f"{APP}/lib/api.ts","w").write(api)
    # the centre, the renderers and the hook import their own package
    for f, pairs in {
        f"{PKG}/components/notification-center.tsx": [
            ('from "@/components/notifications/notification-renderers"', 'from "./notification-renderers"', 1),
            ('from "@/hooks/use-notification-stream"', 'from "../hooks/use-notification-stream"', 1),
            ('} from "@/lib/api";', '} from "../api-client";', 1)],
        f"{PKG}/components/notification-renderers.tsx": [
            ('from "@/lib/api"', 'from "../api-client"', 1)],
    }.items(): edit(f, pairs)
    print("client: api-client.ts in the module; lib/api.ts re-exports")

if want("rewrite"):
    n=0
    for dp,dn,fn in os.walk(APP):
        dn[:]=[d for d in dn if d not in ("node_modules",".next",".turbo")]
        for f in fn:
            if not f.endswith((".ts",".tsx")): continue
            p=os.path.join(dp,f); s=open(p).read()
            new=s.replace('"@/components/notifications/notification-center"', '"@corelithzw/module-notifications/components/notification-center"')
            new=new.replace('"@/hooks/use-notification-stream"', '"@corelithzw/module-notifications/hooks/use-notification-stream"')
            if new!=s: open(p,"w").write(new); n+=1
    # the API route reads the service directly
    edit(f"{APP}/app/api/notifications/route.ts", [('} from "@/lib/notifications"', '} from "@corelithzw/module-notifications/service"', 1)])
    print("rewritten app files:", n)

if want("manifests"):
    open(f"{PKG}/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Notifications: the notice itself, who receives it, and the centre that shows
 * it. What a notice is about is the owning module's business, declared in that
 * module's manifest (`notifications.viewPaths`, `notifications.approvalActions`).
 */
export const manifest: ModuleManifest = {
  id: "notifications",
};
''')
    open(f"{PKG}/index.ts","w").write('''// Deep imports are the norm (`@corelithzw/module-notifications/service`); this
// entry carries the manifest a host composes with.
export { manifest } from "./manifest";
''')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-notifications

Who is told what, and what they can do about it.

```
service.ts                       createNotification, recipient filtering by preference, the actions a notice offers
api-client.ts                    the browser's client for /api/notifications, and the list item types
components/notification-center   the bell and the list
components/notification-renderers
hooks/use-notification-stream    the server-sent stream
manifest.ts                      id "notifications"; requires nothing
```

Import by path: `import { createNotification } from "@corelithzw/module-notifications/service"`.

The service names no module. Where a notice about a payroll run opens, and what
an approver may do from it, is data in the payroll module's manifest
(`notifications.viewPaths`, `notifications.approvalActions`); the service reads
the registered manifests. The emitters that know those entities live with their
modules — until a module is extracted, in the host's `lib/notifications.ts`.
''')
    # the modules whose entities notices are about: manifests ahead of their moves
    os.makedirs(f"{APP}/lib/compliance", exist_ok=True); os.makedirs(f"{APP}/lib/maintenance", exist_ok=True)
    def action(key,label,href,variant,confirm=None):
        d={"key":key,"label":label,"kind":"api","href":href,"method":"POST","variant":variant}
        if confirm: d["confirmMessage"]=confirm
        return d
    def ts(obj, indent=2):
        return json.dumps(obj, indent=indent, ensure_ascii=False)
    people_actions={
      "HR_PAYROLL_SUBMITTED":[action("approve_payroll_run","Approve","/api/payroll/runs/{id}/approve","default"),action("reject_payroll_run","Reject","/api/payroll/runs/{id}/reject","destructive","Reject this payroll run?")],
      "HR_DISBURSEMENT_SUBMITTED":[action("approve_disbursement_batch","Approve","/api/disbursements/batches/{id}/approve","default")],
      "HR_ADJUSTMENT_SUBMITTED":[action("approve_adjustment","Approve","/api/adjustments/{id}/approve","default"),action("reject_adjustment","Reject","/api/adjustments/{id}/reject","destructive","Reject this adjustment?")],
      "HR_COMP_PROFILE_SUBMITTED":[action("approve_comp_profile","Approve","/api/compensation/profiles/{id}/approve","default"),action("reject_comp_profile","Reject","/api/compensation/profiles/{id}/reject","destructive","Reject this compensation profile?")],
      "HR_COMP_RULE_SUBMITTED":[action("approve_comp_rule","Approve","/api/compensation/rules/{id}/approve","default"),action("reject_comp_rule","Reject","/api/compensation/rules/{id}/reject","destructive","Reject this compensation rule?")],
      "HR_DISCIPLINARY_SUBMITTED":[action("approve_disciplinary_action","Approve","/api/hr/disciplinary-actions/{id}/approve","default"),action("reject_disciplinary_action","Reject","/api/hr/disciplinary-actions/{id}/reject","destructive","Reject this disciplinary action?")],
    }
    people_paths={"PAYROLL_RUN":"/payroll/runs?runId={id}","DISBURSEMENT_BATCH":"/payroll/disbursements?batchId={id}","ADJUSTMENT_ENTRY":"/payroll/runs?adjustmentId={id}","COMPENSATION_PROFILE":"/payroll/compensation?profileId={id}","COMPENSATION_RULE":"/payroll/compensation?ruleId={id}","DISCIPLINARY_ACTION":"/people/incidents?disciplinaryId={id}","HR_INCIDENT":"/people/incidents?incidentId={id}"}
    gold_actions={"HR_GOLD_PAYOUT_SUBMITTED":[action("approve_gold_payout_allocation","Approve","/api/gold/shift-allocations/{id}/approve","default"),action("reject_gold_payout_allocation","Reject","/api/gold/shift-allocations/{id}/reject","destructive","Reject this settlement allocation? You can add a note from the allocation screen.")]}
    gold_paths={"GOLD_SHIFT_ALLOCATION":"/gold/settlement/approvals?allocationId={id}"}
    def manifest_file(path, mid, doc, paths, acts):
        body=f'''import type {{ ModuleManifest }} from "@corelithzw/platform/manifest";

/**
 * {doc}
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {{
  id: "{mid}",
  notifications: {{
    viewPaths: {ts(paths, 4).replace(chr(10), chr(10)+"    ")},
'''
        if acts: body+=f"    approvalActions: {ts(acts, 4).replace(chr(10), chr(10)+'    ')},\n"
        body+="  },\n};\n"
        open(path,"w").write(body)
    manifest_file(f"{APP}/lib/people/manifest.ts","people","People and payroll: employees, leave, attendance, payroll runs, disbursements, adjustments, compensation, disciplinary actions.",people_paths,people_actions)
    manifest_file(f"{APP}/lib/gold/manifest.ts","gold","Gold: the mine's shifts, allocations, settlements and the gold books. Composed only into this host.",gold_paths,gold_actions)
    manifest_file(f"{APP}/lib/compliance/manifest.ts","compliance","Compliance: permits, inspections, incidents and training records.",{"INCIDENT":"/compliance/incidents?createdId={id}","PERMIT":"/compliance/permits?createdId={id}"},None)
    manifest_file(f"{APP}/lib/maintenance/manifest.ts","maintenance","Maintenance: work orders, equipment, breakdowns and the schedule.",{"WORK_ORDER":"/maintenance/work-orders?workOrderId={id}"},None)
    edit(f"{APP}/manifests.ts", [
        ('import { manifest as workflow } from "@corelithzw/module-workflow";\n',
         'import { manifest as notifications } from "@corelithzw/module-notifications";\nimport { manifest as workflow } from "@corelithzw/module-workflow";\n', 1),
        ('import { manifest as crm } from "@/lib/crm/manifest";\n',
         'import { manifest as compliance } from "@/lib/compliance/manifest";\nimport { manifest as crm } from "@/lib/crm/manifest";\nimport { manifest as gold } from "@/lib/gold/manifest";\nimport { manifest as maintenance } from "@/lib/maintenance/manifest";\nimport { manifest as people } from "@/lib/people/manifest";\n', 1),
        ('registerModules([workflow, crm]);\n', 'registerModules([workflow, notifications, crm, people, gold, compliance, maintenance]);\n', 1),
    ])
    print("manifests: notifications, and people/gold/compliance/maintenance ahead of their moves")

if want("check"):
    left=[]
    for dp,dn,fn in os.walk(PKG):
        for f in fn:
            if f.endswith((".ts",".tsx")) and re.search(r'["\']@/', open(os.path.join(dp,f)).read()): left.append(f)
    print("package files importing '@/':", left or "none")
