#!/usr/bin/env python3
"""3.1b-1: the host's API client barrel (lib/api.ts) and its notification emitters (lib/notifications.ts) go to their owners."""
import re, json, subprocess, pathlib, sys
ROOT = pathlib.Path("/home/user/huchu"); APP = ROOT / "apps/legacy"; PK = ROOT / "packages"
S = pathlib.Path("/tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad")

def sh(*args):
    return subprocess.run(list(args), capture_output=True, text=True, check=True).stdout

def ranges(file, names):
    found = {b["name"]: b for b in json.loads(sh("node", str(S / "tsslice_any.mjs"), str(file), ",".join(names)))}
    missing = [n for n in names if n not in found]
    assert not missing, f"not found in {file}: {missing}"
    return found

def blocks(file, names):
    src = file.read_text(); f = ranges(file, names)
    return {n: src[f[n]["start"]:f[n]["end"]].strip("\n") for n in names}

def all_decls(file):
    return [d["name"] for d in json.loads(sh("node", str(S / "tsdeps.mjs"), str(file)))]

def assert_no_collision(target, names):
    if not target.exists(): return
    s = target.read_text()
    for n in names:
        assert not re.search(r'^export (?:async )?(?:function|const|type|interface|class) ' + re.escape(n) + r'\b', s, re.M), f"{target} already exports {n}"

def ensure_client_imports(path, added, rel):
    """The appended code's needs from the kernel's api-client, merged into the target's existing import of it."""
    s = path.read_text()
    need_values = [n for n in ("buildQuery", "fetchJson") if re.search(r'\b' + n + r'\b', added)]
    need_types = [n for n in ("Pagination", "PaginationMeta") if re.search(r'\b' + n + r'\b', added)]
    m = re.search(r'^import \{([^}]*)\} from "' + re.escape(rel) + r'";', s, re.M)
    if m:
        have = [x.strip() for x in m.group(1).split(",") if x.strip()]
        have_names = {x.removeprefix("type ").strip() for x in have}
        add = [n for n in need_values if n not in have_names] + [f"type {n}" for n in need_types if n not in have_names]
        if add:
            s = s[:m.start()] + "import { " + ", ".join(have + add) + ' } from "' + rel + '";' + s[m.end():]
    else:
        parts = need_values + [f"type {n}" for n in need_types]
        if parts:
            line = "import { " + ", ".join(parts) + ' } from "' + rel + '";\n'
            last = None
            for im in re.finditer(r'^import .*?;\n', s, re.M | re.S): last = im
            s = s[:last.end()] + line + s[last.end():] if last else line + s
    path.write_text(s)

# ---------------------------------------------------------------- A. lib/api.ts
API = APP / "lib/api.ts"; api_src = API.read_text()
reexp = {}
for m in re.finditer(r'^export (?:type )?\{([^}]*)\} from "([^"]+)";', api_src, re.M):
    for n in m.group(1).split(","):
        n = n.strip()
        if n: reexp[n.removeprefix("type ").strip()] = m.group(2)

SLICES = [
    (PK / "platform/client/sites.ts", "../api-client", "@corelithzw/platform/client/sites",
     ["fetchSitesList", "createSite", "updateSite", "deleteSite"], None),
    (PK / "platform/client/managed-users.ts", "../api-client", "@corelithzw/platform/client/managed-users",
     ["ManagedUserRole", "CreateManagedUserInput", "SetManagedUserStatusInput", "ResetManagedUserPasswordInput", "ChangeManagedUserRoleInput",
      "createManagedUser", "setManagedUserStatus", "resetManagedUserPassword", "changeManagedUserRole"],
     '/**\n * The browser\'s client for the tenant\'s user management: creating a member,\n * suspending one, resetting a password, changing a role. Reads `/api/users/*`.\n */\nimport { fetchJson } from "../api-client";\nimport type { UserRole } from "../roles";\nimport type { UserSummary } from "./users";\n\n'),
    (PK / "modules/people/api-client.ts", "@corelithzw/platform/api-client", "@corelithzw/module-people/api-client",
     ["ApprovalHistoryRecord", "fetchApprovalHistory"], None),
    (PK / "modules/notifications/api-client.ts", "@corelithzw/platform/api-client", "@corelithzw/module-notifications/api-client",
     ["saveWebPushSubscription", "removeWebPushSubscription"], None),
    (PK / "modules/gold/api-client.ts", "@corelithzw/platform/api-client", "@corelithzw/module-gold/api-client",
     ["SectionSummary", "DowntimeCode", "ShiftReportSummary", "PlantReportDowntimeEvent", "PlantReport", "DowntimeAnalytics",
      "fetchSections", "createSection", "updateSection", "deleteSection", "fetchDowntimeCodes", "createDowntimeCode", "updateDowntimeCode",
      "deleteDowntimeCode", "fetchDowntimeAnalytics", "fetchShiftReports", "fetchPlantReports", "createGoldExpenseType", "updateGoldExpenseType",
      "deleteGoldExpenseType"], None),
    (PK / "modules/books/api-client.ts", "@corelithzw/platform/api-client", "@corelithzw/module-books/api-client",
     ["RetailAccountingBackfillResult", "CustomerRecord", "VendorRecord", "DebitNoteLineRecord", "DebitNoteRecord", "CashFlowReport",
      "StatementLineRecord", "StatementReport", "runSeedPack", "fetchIntegrationEvents", "replayIntegrationEvents", "backfillRetailAccounting",
      "fetchTenderMappings", "fetchCustomers", "fetchVendors", "fetchDebitNotes", "fetchCashFlowReport", "fetchCustomerStatement",
      "fetchVendorStatement", "importOpeningBalances"], None),
]
sliced = [n for _, _, _, names, _ in SLICES for n in names]
decls = all_decls(API)
left = sorted(set(decls) - set(sliced))
assert not left, f"lib/api.ts declarations without an owner: {left}"
owner = dict(reexp)
for _, _, spec, names, _ in SLICES:
    for n in names: owner[n] = spec

api_blocks = blocks(API, sliced)
for target, rel, spec, names, header in SLICES:
    assert_no_collision(target, names)
    added = "\n\n".join(api_blocks[n] for n in names) + "\n"
    if target.exists():
        s = target.read_text()
        target.write_text(s.rstrip("\n") + "\n\n" + added)
    else:
        target.write_text(header + added)
    ensure_client_imports(target, added, rel)
    print("sliced", len(names), "into", target.relative_to(ROOT))

# every importer of the barrel imports from the owner instead
IMP = re.compile(r'^import (type )?\{([^}]*)\} from "@/lib/api";?\n', re.M)
rewritten = 0
for p in sorted(APP.rglob("*.ts*")):
    if "node_modules" in p.parts or ".next" in p.parts or p == API: continue
    s = p.read_text()
    if '"@/lib/api"' not in s: continue
    def repl(m):
        type_only = bool(m.group(1))
        names = [n.strip() for n in m.group(2).replace("\n", " ").split(",") if n.strip()]
        groups = {}
        for n in names:
            bare = n.removeprefix("type ").strip()
            assert bare in owner, f"{p}: {bare} has no owner"
            groups.setdefault(owner[bare], []).append(n)
        return "".join(("import type { " if type_only else "import { ") + ", ".join(ns) + ' } from "' + path + '";\n' for path, ns in groups.items())
    s2 = IMP.sub(repl, s)
    assert '"@/lib/api"' not in s2, p
    # two value imports from one path, both on one line, become one
    for path in set(owner.values()):
        pat = re.compile(r'^import \{ ([^}\n]*) \} from "' + re.escape(path) + r'";\n', re.M)
        ms = pat.findall(s2)
        if len(ms) > 1:
            merged = "import { " + ", ".join(dict.fromkeys(n.strip() for m_ in ms for n in m_.split(","))) + ' } from "' + path + '";\n'
            s2 = pat.sub("", s2, count=len(ms) - 1)
            s2 = pat.sub(merged, s2, count=1)
    p.write_text(s2); rewritten += 1
print("rewrote", rewritten, "importers of @/lib/api")
sh("git", "-C", str(ROOT), "rm", "-q", str(API))

# ---------------------------------------------------------------- B. lib/notifications.ts
NOTIF = APP / "lib/notifications.ts"
ndecls = all_decls(NOTIF)
nb = blocks(NOTIF, ndecls)

def db_imports(text):
    lines = []
    enums = [n for n in ("NotificationEntityType", "NotificationSeverity", "NotificationSourceAction", "NotificationType") if re.search(r'\b' + n + r'\.', text)]
    types = [n for n in ("ApprovalActionType", "ApprovalTargetType") if re.search(r'\b' + n + r'\b', text)]
    if enums or types: lines.append("import { " + ", ".join(enums + [f"type {t}" for t in types]) + ' } from "@corelithzw/db"')
    if re.search(r'\bprisma\b', text): lines.append('import { prisma } from "@corelithzw/db/client"')
    svc = [n for n in ("createNotification", "getManagerIds") if re.search(r'\b' + n + r'\(', text)]
    svc_types = [n for n in ("DbClient", "NotificationCategory") if re.search(r'\b' + n + r'\b', text)]
    if svc or svc_types: lines.append("import { " + ", ".join(svc + [f"type {t}" for t in svc_types]) + ' } from "@corelithzw/module-notifications/service"')
    esc = [n for n in ("escalationRecipientIds", "severityFromIncidentLevel") if re.search(r'\b' + n + r'\(', text)]
    if esc: lines.append("import { " + ", ".join(esc) + ' } from "@corelithzw/module-notifications/escalation"')
    return "\n".join(lines) + "\n\n"

def emitter_file(path, doc, names, subs=(), extra_imports=""):
    body = "\n\n".join(nb[n] for n in names)
    for a, b in subs:
        assert a in body, f"{path}: {a} not in body"
        body = body.replace(a, b)
    path.write_text(doc + db_imports(body).replace("\n\n", "\n" + extra_imports + "\n", 1) + body + "\n")
    print("wrote", path.relative_to(ROOT))

# the recipients rule and the incident severity scale, once, in the notifications module
esc_body = nb["getOpsRecipientIds"].replace("async function getOpsRecipientIds(", "export async function escalationRecipientIds(")
sev_body = nb["normalizeIncidentSeverity"].replace("function normalizeIncidentSeverity(", "export function severityFromIncidentLevel(")
assert esc_body != nb["getOpsRecipientIds"] and sev_body != nb["normalizeIncidentSeverity"]
assert nb["getHrRecipientIds"].replace("getHrRecipientIds", "x") == nb["getOpsRecipientIds"].replace("getOpsRecipientIds", "x"), "the two recipient helpers were the same function"
(PK / "modules/notifications/escalation.ts").write_text(
    '/**\n * Who an operational notice escalates to, and how loud it is.\n *\n * The managers and superadmins of the company, plus the clerk who raised it\n * unless the matter is critical, in which case the clerk is not told twice.\n * The people, compliance and maintenance modules all notify this way; the\n * scale below turns a module\'s own severity words into the centre\'s.\n */\n'
    'import { NotificationSeverity } from "@corelithzw/db"\nimport type { DbClient } from "./service"\n\n'
    + '/** The managers and superadmins, plus the clerk who raised it unless it is critical. */\n' + esc_body + "\n\n"
    + '/** CRITICAL and HIGH escalate, MEDIUM warns, the rest inform. */\n' + sev_body + "\n")
print("wrote packages/modules/notifications/escalation.ts")

emitter_file(PK / "modules/people/hr/notifications.ts",
    '/**\n * What the HR module tells people about: an incident reported against an\n * employee, and its status changing. Approval notices are in\n * `../approval-notifications.ts`.\n */\n',
    ["emitHrIncidentNotification"],
    [("getHrRecipientIds(", "escalationRecipientIds("), ("normalizeIncidentSeverity(", "severityFromIncidentLevel(")])
emitter_file(PK / "modules/compliance/notifications.ts",
    '/**\n * What the compliance module tells people about: an incident reported or\n * moved, and a permit expiring or expired.\n */\n',
    ["normalizePermitSeverity", "emitIncidentNotification", "emitPermitRiskNotification"],
    [("getOpsRecipientIds(", "escalationRecipientIds("), ("normalizeIncidentSeverity(", "severityFromIncidentLevel(")])
emitter_file(PK / "modules/maintenance/notifications.ts",
    '/**\n * What the maintenance module tells people about: a work order opened, and\n * one started.\n */\n',
    ["normalizeWorkOrderSeverity", "emitWorkOrderStatusNotification"],
    [("getOpsRecipientIds(", "escalationRecipientIds(")])
emitter_file(PK / "modules/gold/notifications.ts",
    '/**\n * What the gold module tells the managers about: a critical exception, an\n * import that finished with failures, a dispatch the buyer receipted. Approval\n * notices are in `./approval-notifications.ts`.\n */\n',
    ["emitGoldExceptionNotification", "emitGoldImportFailedNotification", "emitGoldDispatchReceiptedNotification"])

# the approval notices: the emitter and the people module's entities in people, the settlement allocation in gold
def cut(text, pattern, count):
    found = re.findall(pattern, text, re.M)
    assert len(found) == count, f"expected {count} of {pattern!r}, found {len(found)}"
    return re.sub(pattern, "", text, flags=re.M)
GOLD_IF = r"^  if \((?:input\.)?entityType === \"GOLD_SHIFT_ALLOCATION\"\) \{\n(?:    .*\n|\n)+?  \}\n"
map_fn = cut(nb["mapApprovalToNotificationType"], GOLD_IF, 1).replace("function mapApprovalToNotificationType(", "function mapPeopleApproval(")
ent_fn = cut(nb["toNotificationEntityType"], GOLD_IF, 1).replace("function toNotificationEntityType(", "function toPeopleEntityType(")
ctx_fn = cut(nb["getWorkflowEntityContext"], GOLD_IF, 1).replace("async function getWorkflowEntityContext(", "async function getPeopleEntityContext(").replace("Promise<WorkflowEntityContext | null>", "Promise<ApprovalEntityContext | null>")
copy_fn = cut(nb["buildWorkflowCopy"], r'    case NotificationType\.HR_GOLD_PAYOUT_[A-Z]+:\n      return \{\n(?:        .*\n)+?      \}\n', 3).replace("function buildWorkflowCopy(", "function buildPeopleCopy(")
input_t = nb["WorkflowNotificationInput"].replace("export type WorkflowNotificationInput = {", "export type ApprovalNoticeInput = {")
ctx_t = nb["WorkflowEntityContext"].replace("type WorkflowEntityContext = {", "export type ApprovalEntityContext = {")
sev_fn = nb["buildWorkflowSeverity"].replace("function buildWorkflowSeverity(", "function approvalSeverity(")
for text, must in ((map_fn, "GOLD"), (ent_fn, "GOLD"), (ctx_fn, "goldShiftAllocation"), (copy_fn, "GOLD")):
    assert must not in text, f"{must} survived the cut"
assert "DISCIPLINARY_ACTION" in ctx_fn and "compensationRule" in ctx_fn
people_file = PK / "modules/people/approval-notifications.ts"
people_file.write_text('''/**
 * An approval action, told to the people it concerns.
 *
 * A module that owns approvable entities describes each notice with a
 * resolver — the notification type, the entity's label and where to view it,
 * the copy — and `emitApprovalNotice` writes it: to the approvers on a
 * submission, to the submitter and everyone who acted before on an approval or
 * a rejection. The people module resolves its own entities below (payroll
 * runs, disbursement batches, adjustments, compensation profiles and rules,
 * disciplinary actions); the gold module resolves its settlement allocations
 * with the same emitter. A host registers each module's emitter with the
 * workflow module's `onApprovalAction`.
 */
import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceAction,
  NotificationType,
  type ApprovalActionType,
  type ApprovalTargetType,
} from "@corelithzw/db"
import { createNotification, type DbClient, type NotificationCategory } from "@corelithzw/module-notifications/service"

''' + input_t + "\n\n" + ctx_t + '''

export type ApprovalNotice = {
  type: NotificationType
  entityType: NotificationEntityType
  category: NotificationCategory
  context: ApprovalEntityContext
  /** The title and the summary, once the actor's name is known. */
  copy: (actorName: string) => { title: string; summary: string }
}

/** Null when the module does not own the entity, or the action is not one it announces. */
export type ApprovalNoticeResolver = (db: DbClient, input: ApprovalNoticeInput) => Promise<ApprovalNotice | null>

''' + nb["approvalSourceAction"] + "\n\n" + sev_fn + '''

export async function emitApprovalNotice(db: DbClient, input: ApprovalNoticeInput, resolve: ApprovalNoticeResolver) {
  try {
    const notice = await resolve(db, input)
    if (!notice) return null

    const actor = await db.user.findUnique({
      where: { id: input.actedById },
      select: { id: true, name: true, role: true },
    })
    if (!actor) return null

    let recipientIds: string[] = []

    if (input.action === "SUBMIT") {
      const approvers = await db.user.findMany({
        where: {
          companyId: input.companyId,
          role: { in: ["MANAGER", "SUPERADMIN"] },
          isActive: true,
        },
        select: { id: true },
      })
      recipientIds = approvers
        .map((user) => user.id)
        .filter((userId) => userId !== actor.id || actor.role === "SUPERADMIN")
    } else if (input.action === "APPROVE" || input.action === "REJECT") {
      const priorActors = await db.approvalAction.findMany({
        where: {
          companyId: input.companyId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
        select: { actedById: true },
      })
      recipientIds = Array.from(
        new Set([
          notice.context.submittedById ?? "",
          notice.context.createdById ?? "",
          ...priorActors.map((entry) => entry.actedById),
        ]),
      ).filter((userId) => userId && userId !== actor.id)
    } else {
      return null
    }

    const copy = notice.copy(actor.name)

    return createNotification(db, {
      companyId: input.companyId,
      type: notice.type,
      title: copy.title,
      summary: copy.summary,
      severity: approvalSeverity(notice.type),
      category: notice.category,
      recipientIds,
      payload: {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        label: notice.context.label,
        viewPath: notice.context.viewPath,
        ...notice.context.payload,
      },
      entityType: notice.entityType,
      entityId: input.entityId,
      sourceAction: approvalSourceAction(input.action),
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit workflow notification:", error)
    return null
  }
}

// ---- The people module's own entities.

''' + map_fn + "\n\n" + ent_fn + "\n\n" + nb["safeIdPrefix"] + "\n\n" + ctx_fn + "\n\n" + copy_fn + '''

export const resolvePeopleApprovalNotice: ApprovalNoticeResolver = async (db, input) => {
  const type = mapPeopleApproval(input.entityType, input.action)
  if (!type) return null
  const context = await getPeopleEntityContext(db, { entityType: input.entityType, entityId: input.entityId })
  if (!context) return null
  return {
    type,
    entityType: toPeopleEntityType(input.entityType),
    category: "HR",
    context,
    copy: (actorName) => buildPeopleCopy({ type, actorName, label: context.label }),
  }
}

/**
 * After an approval action on a payroll run, a disbursement batch, an
 * adjustment, a compensation profile or rule, or a disciplinary action: the
 * approvers, or the submitter and the prior approvers, are told.
 */
export function emitPeopleApprovalNotification(db: DbClient, input: ApprovalNoticeInput) {
  return emitApprovalNotice(db, input, resolvePeopleApprovalNotice)
}
''')
print("wrote", people_file.relative_to(ROOT))

(PK / "modules/gold/approval-notifications.ts").write_text('''/**
 * The settlement allocation's approval notices: the one approvable entity the
 * gold module owns, told through the people module's approval emitter (the
 * payout is the workers', and the notice reads as HR's). A host registers
 * `emitGoldApprovalNotification` with the workflow module's `onApprovalAction`.
 */
import { NotificationEntityType, NotificationType, type ApprovalActionType } from "@corelithzw/db"
import type { DbClient } from "@corelithzw/module-notifications/service"
import {
  emitApprovalNotice,
  type ApprovalNoticeInput,
  type ApprovalNoticeResolver,
} from "@corelithzw/module-people/approval-notifications"

function mapAllocationApproval(action: ApprovalActionType): NotificationType | null {
  if (action === "SUBMIT") return NotificationType.HR_GOLD_PAYOUT_SUBMITTED
  if (action === "APPROVE") return NotificationType.HR_GOLD_PAYOUT_APPROVED
  if (action === "REJECT") return NotificationType.HR_GOLD_PAYOUT_REJECTED
  return null
}

function allocationCopy(type: NotificationType, actorName: string, label: string) {
  switch (type) {
    case NotificationType.HR_GOLD_PAYOUT_SUBMITTED:
      return { title: "Settlement allocation pending approval", summary: `${actorName} submitted ${label}.` }
    case NotificationType.HR_GOLD_PAYOUT_APPROVED:
      return { title: "Settlement allocation approved", summary: `${actorName} approved ${label}.` }
    case NotificationType.HR_GOLD_PAYOUT_REJECTED:
      return { title: "Settlement allocation rejected", summary: `${actorName} rejected ${label}.` }
    default:
      return { title: "Workflow update", summary: `${actorName} updated ${label}.` }
  }
}

export const resolveGoldApprovalNotice: ApprovalNoticeResolver = async (db, input) => {
  if (input.entityType !== "GOLD_SHIFT_ALLOCATION") return null
  const type = mapAllocationApproval(input.action)
  if (!type) return null

  const allocation = await db.goldShiftAllocation.findUnique({
    where: { id: input.entityId },
    select: {
      id: true,
      date: true,
      shift: true,
      totalWeight: true,
      netWeight: true,
      workerShareWeight: true,
      submittedById: true,
      createdById: true,
      site: { select: { code: true, name: true } },
    },
  })
  if (!allocation) return null
  const shiftDate = allocation.date.toISOString().slice(0, 10)
  const label = `${shiftDate} ${allocation.shift} - ${allocation.site.code}`
  return {
    type,
    entityType: NotificationEntityType.GOLD_SHIFT_ALLOCATION,
    category: "HR",
    context: {
      submittedById: allocation.submittedById,
      createdById: allocation.createdById,
      label,
      viewPath: `/gold/settlement/approvals?allocationId=${allocation.id}`,
      payload: {
        shiftDate,
        shift: allocation.shift,
        siteCode: allocation.site.code,
        siteName: allocation.site.name,
        totalWeight: allocation.totalWeight,
        netWeight: allocation.netWeight,
        workerShareWeight: allocation.workerShareWeight,
      },
    },
    copy: (actorName) => allocationCopy(type, actorName, label),
  }
}

/** After an approval action on a settlement allocation: the approvers, or the submitter and the prior approvers, are told. */
export function emitGoldApprovalNotification(db: DbClient, input: ApprovalNoticeInput) {
  return emitApprovalNotice(db, input, resolveGoldApprovalNotice)
}
''')
print("wrote packages/modules/gold/approval-notifications.ts")

# the routes and the host's wiring import the owners
EMITTER_OWNER = {
    "emitGoldExceptionNotification": "@corelithzw/module-gold/notifications", "emitGoldImportFailedNotification": "@corelithzw/module-gold/notifications",
    "emitGoldDispatchReceiptedNotification": "@corelithzw/module-gold/notifications",
    "emitHrIncidentNotification": "@corelithzw/module-people/hr/notifications",
    "emitIncidentNotification": "@corelithzw/module-compliance/notifications", "emitPermitRiskNotification": "@corelithzw/module-compliance/notifications",
    "emitWorkOrderStatusNotification": "@corelithzw/module-maintenance/notifications",
}
NIMP = re.compile(r'^import \{([^}]*)\} from "@/lib/notifications";?\n', re.M)
for p in sorted((APP / "app").rglob("*.ts")):
    s = p.read_text()
    if '"@/lib/notifications"' not in s: continue
    def repl(m):
        names = [n.strip() for n in m.group(1).split(",") if n.strip()]
        paths = {EMITTER_OWNER[n] for n in names}
        assert len(paths) == 1, (p, names)
        return "import { " + ", ".join(names) + ' } from "' + paths.pop() + '";\n'
    s2 = NIMP.sub(repl, s); assert "@/lib/notifications" not in s2, p
    p.write_text(s2); print("rewired", p.relative_to(APP))

mods = APP / "modules.ts"; ms = mods.read_text()
old = '''// Code the modules hook into each other with, wired here and imported on first
// use, so reading the composition costs nothing but the manifests. After an
// approval action, for this host: the approvers are told.
onApprovalAction(async (tx, event) =>
  (await import("@/lib/notifications")).emitWorkflowNotificationFromApprovalAction(tx, event),
);
'''
new = '''// Code the modules hook into each other with, wired here and imported on first
// use, so reading the composition costs nothing but the manifests. After an
// approval action, for this host: the people the entity concerns are told —
// the people module's entities by its emitter, the gold module's settlement
// allocations by its own. Each returns at once for an entity it does not own.
onApprovalAction(async (tx, event) => {
  const [{ emitPeopleApprovalNotification }, { emitGoldApprovalNotification }] = await Promise.all([
    import("@corelithzw/module-people/approval-notifications"),
    import("@corelithzw/module-gold/approval-notifications"),
  ]);
  await emitPeopleApprovalNotification(tx, event);
  await emitGoldApprovalNotification(tx, event);
});
'''
assert ms.count(old) == 1; ms = ms.replace(old, new)
old2 = '    import("@/lib/notifications"),\n'; assert ms.count(old2) == 1
ms = ms.replace(old2, '    import("@corelithzw/module-compliance/notifications"),\n')
mods.write_text(ms); print("rewired modules.ts")

sh("git", "-C", str(ROOT), "rm", "-q", str(NOTIF))
sh("git", "-C", str(ROOT), "mv", str(APP / "lib/notifications.test.ts"), str(PK / "modules/gold/notifications.test.ts"))
print("moved the gold emitter test")

# manifests and package dependencies
for mod in ("people", "compliance", "maintenance", "gold"):
    mf = PK / f"modules/{mod}/manifest.ts"; s = mf.read_text()
    m = re.search(r'requires: \[([^\]]*)\]', s); assert m, mod
    reqs = [x.strip().strip('"') for x in m.group(1).split(",") if x.strip()]
    if "notifications" not in reqs:
        reqs.append("notifications")
        s = s[:m.start()] + "requires: [" + ", ".join(f'"{r}"' for r in reqs) + "]" + s[m.end():]
        mf.write_text(s); print("manifest", mod, "requires", reqs)
    pj = PK / f"modules/{mod}/package.json"; d = json.loads(pj.read_text())
    changed = False
    for dep in ("@corelithzw/db", "@corelithzw/module-notifications"):
        if dep not in d["dependencies"]:
            d["dependencies"][dep] = "workspace:*"; changed = True
    if mod == "gold" and "@corelithzw/module-people" not in d["dependencies"]:
        d["dependencies"]["@corelithzw/module-people"] = "workspace:*"; changed = True
    if changed:
        d["dependencies"] = dict(sorted(d["dependencies"].items()))
        pj.write_text(json.dumps(d, indent=2) + "\n"); print("package.json", mod, "deps added")
print("DONE")
