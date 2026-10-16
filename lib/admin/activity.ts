import type { Prisma, SubscriptionStatus } from "@prisma/client";

import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/admin/billing-words";
import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { operatorIdFromActor } from "@/lib/operators/audit";
import { prisma } from "@/lib/prisma";

/**
 * The audit log, read as sentences.
 *
 * `PlatformAuditEvent` is written by every module in its own vocabulary —
 * `RETAIL_PRICE.CHANGED`, `schools.fee.invoice.written-off`, `operator.signed_in`.
 * The portal's own events get written sentences; everything else gets its
 * event type read aloud, which is always understandable and never wrong.
 */

const statusWord = (value: unknown) => (SUBSCRIPTION_STATUS_LABEL[value as SubscriptionStatus] ?? String(value)).toLowerCase();

export type ActivityActor = { kind: "operator" | "member" | "system"; name: string };

export type ActivityItem = {
  id: string;
  at: Date;
  actor: ActivityActor;
  /** What happened, without the actor: "signed in as Rutendo Nyathi". */
  did: string;
  reason: string | null;
  eventType: string;
  companyId: string | null;
  hash: string;
  /** Joins the chain to the row before it in the same chain. */
  linked: boolean;
};

type Payload = Record<string, unknown>;

/** The portal's own events, worded. Each takes the event's payload. */
const WORDS: Record<string, (payload: Payload) => string> = {
  "operator.signed_in": () => "signed in to the admin portal",
  "operator.signed_out": () => "signed out of the admin portal",
  "operator.sign_in_refused": (p) => (p.step === "code" ? "entered a wrong authenticator code" : "entered a wrong password"),
  "operator.sign_in_locked": () => "was locked out of the admin portal for 15 minutes",
  "operator.authenticator_set_up": () => "set up their authenticator",
  "operator.added": (p) => `added ${String(p.email ?? "an operator")} as an operator`,
  "operator.invited": (p) => `invited ${String(p.name)} as ${String(p.role).toLowerCase()}`,
  "operator.invite_resent": (p) => `sent ${String(p.name)} a new invite`,
  "operator.authenticator_reset": (p) => `reset ${String(p.name)}'s authenticator`,
  "operator.role_changed": (p) => `changed ${String(p.name)}'s role from ${String(p.from)} to ${String(p.to)}`,
  "operator.removed": (p) => `removed ${String(p.name)} as an operator`,
  "operator.password_set": () => "chose a password",
  "operator.member.role_changed": (p) => `changed ${String(p.member)}'s role from ${String(p.from)} to ${String(p.to)}`,
  "operator.member.signed_out": (p) => `signed ${String(p.member)} out everywhere`,
  "operator.member.access_removed": (p) => `removed ${String(p.member)}'s access`,
  "operator.member.access_restored": (p) => `gave ${String(p.member)} access back`,
  "operator.sign_in_as.started": (p) =>
    `signed in as ${String(p.member)}, ${p.mode === "LOOK" ? "to look only" : "able to make changes"} (${String(p.session)})`,
  "operator.sign_in_as.ended": (p) =>
    p.by === "OWNER"
      ? `ended ${String(p.session)}, Corelith support's session as ${String(p.member)}`
      : p.by === "SIGNED_OUT"
        ? `ended ${String(p.session)} by signing ${String(p.member)} out`
        : `ended ${String(p.session)}, signed in as ${String(p.member)}`,
  "operator.billing.trial_extended": (p) => `extended the trial by ${String(p.days)} days`,
  "operator.billing.plan_changed": (p) => `changed the plan from ${String(p.from)} to ${String(p.to)}`,
  "operator.billing.addon_on": (p) => `turned on ${String(p.addOn)}`,
  "operator.billing.addon_off": (p) => `turned off ${String(p.addOn)}`,
  "operator.billing.status_set": (p) => `set the subscription from ${statusWord(p.from)} to ${statusWord(p.to)}: “${String(p.reason)}”`,
  "billing.payment.paid": (p) =>
    `recorded ${p.amount ? `$${String(p.amount)}` : "a payment"} as paid${p.periodMonths ? `, for ${String(p.periodMonths)} ${Number(p.periodMonths) === 1 ? "month" : "months"}` : ""}`,
  "billing.payment.failed": () => "marked a payment as failed",
  "billing.payment.initiated": (p) => `started a payment${p.amount ? ` of $${String(p.amount)}` : ""}`,
  "billing.payment.pending": () => "marked a payment as waiting for the gateway",
  "billing.payment.cancelled": () => "cancelled a payment",
  "billing.subscription.paid": (p) =>
    `took $${String(p.amount)} and extended the subscription${p.currentPeriodEnd ? ` to ${new Date(String(p.currentPeriodEnd)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Harare" })}` : ""}`,
  "operator.workspace.renamed": (p) => `renamed the workspace from ${String(p.from)} to ${String(p.to)}`,
  "operator.workspace.signed_everyone_out": () => "signed every member out",
  "operator.workspace.suspended": () => "suspended the workspace",
  "operator.workspace.reinstated": () => "reinstated the workspace",
  "operator.workspace.closed": () => "closed the workspace",
  "operator.workspace.access_record_exported": () => "exported the access record",
  "operator.workspace.address_changed": (p) => `changed the address from ${String(p.from)} to ${String(p.to)}`,
  ORG_RESET_WORKSPACE: (p) => {
    const after = (p.after ?? {}) as { selectedGroupLabels?: string[]; totalRowsDeleted?: number };
    const rows = Number(after.totalRowsDeleted ?? 0);
    return `deleted the workspace's data${after.selectedGroupLabels?.length ? ` (${after.selectedGroupLabels.join(", ")})` : ""}: ${rows.toLocaleString("en-GB")} ${rows === 1 ? "row" : "rows"}`;
  },
  "operator.site.created": (p) => `added the site ${String(p.name)} (${String(p.code)})`,
  "operator.site.changed": (p) => `changed the site ${String(p.name)}`,
  "operator.site.closed": (p) => `closed the site ${String(p.name)}`,
  "operator.site.reopened": (p) => `reopened the site ${String(p.name)}`,
  PLATFORM_TENANT_PROVISIONED: () => "set up the workspace",
  "signup.workspace-created": () => "signed up and the workspace was set up",
  [LOGIN_SUCCESS_EVENT]: () => "signed in",
};

/** `RETAIL_PRICE.CHANGED` → "retail price changed". */
export function readEventType(eventType: string): string {
  return eventType
    .split(/[._:-]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
    .join(" ");
}

function parsePayload(json: string | null): Payload {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Payload;
    // `appendAuditEvent` nests the caller's payload under `metadata`.
    return { ...parsed, ...((parsed.metadata as Payload | undefined) ?? {}) };
  } catch {
    return {};
  }
}

async function nameActors(actors: string[]) {
  const operatorIds = actors.flatMap((actor) => operatorIdFromActor(actor) ?? []);
  const emails = actors.filter((actor) => actor.includes("@"));
  const userIds = actors.filter((actor) => !actor.includes("@") && !operatorIdFromActor(actor));
  const [operators, users] = await Promise.all([
    operatorIds.length
      ? prisma.operator.findMany({ where: { id: { in: operatorIds } }, select: { id: true, name: true } })
      : [],
    emails.length || userIds.length
      ? prisma.user.findMany({
          where: { OR: [{ email: { in: emails } }, { id: { in: userIds } }] },
          select: { id: true, email: true, name: true },
        })
      : [],
  ]);
  const names = new Map<string, ActivityActor>();
  for (const operator of operators) names.set(`operator:${operator.id}`, { kind: "operator", name: operator.name });
  for (const user of users) {
    names.set(user.id, { kind: "member", name: user.name });
    if (user.email) names.set(user.email, { kind: "member", name: user.name });
  }
  return names;
}

export async function readActivity(
  where: Prisma.PlatformAuditEventWhereInput,
  options: { take?: number; before?: Date } = {},
): Promise<ActivityItem[]> {
  const rows = await prisma.platformAuditEvent.findMany({
    where: { ...where, ...(options.before ? { createdAt: { lt: options.before } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.take ?? 50,
  });
  const names = await nameActors([...new Set(rows.flatMap((row) => (row.actor ? [row.actor] : [])))]);
  return rows.map((row) => {
    const payload = parsePayload(row.payloadJson);
    const words = WORDS[row.eventType];
    return {
      id: row.id,
      at: row.createdAt,
      actor: row.actor
        ? (names.get(row.actor) ?? { kind: operatorIdFromActor(row.actor) ? "operator" : "member", name: row.actor })
        : // The owner's "end it" link names nobody; holding the email is the authority.
          payload.by === "OWNER"
          ? { kind: "member", name: "The owner" }
          : { kind: "system", name: "Corelith" },
      did: words ? words(payload) : readEventType(row.eventType),
      reason: row.reason,
      eventType: row.eventType,
      companyId: row.companyId,
      hash: row.eventHash,
      linked: Boolean(row.prevEventHash),
    };
  });
}

/** What happened in one workspace, newest first, without the sign-ins (the rail has the last one). */
export function workspaceActivity(companyId: string, take = 40) {
  return readActivity({ companyId, eventType: { notIn: [LOGIN_SUCCESS_EVENT, "auth.guard.denied"] } }, { take });
}
