import type { Prisma, PrismaClient, VaneActionStatus } from "@prisma/client";

import { operationsFor } from "@/lib/integrations/types";
import { findOperation } from "@/lib/operations/registry";
import { OperationRefused, outcomeWords, type Operation, type OperationActor, type OperationField } from "@/lib/operations/types";

import { VANE_INTEGRATION } from "../integration";

/**
 * Vane's actions (`VaneAction`): the operations it proposes on a card or in a
 * chat answer (`lib/operations`), and a person's decision. Nothing runs until
 * a person approves it, and then the operation runs through the module's own
 * code as that person, through Vane (the request that approves it carries
 * their session, so the app's activity log records it as theirs). Denied
 * actions are kept, so Vane does not ask again.
 */

type Db = Pick<PrismaClient, "vaneAction" | "vaneItem">;
type Registry = readonly Operation<never>[];

/**
 * The operations Vane may propose: those its integration names. Read when
 * asked, not when this file loads: the registry imports Vane's own operation,
 * which comes back here.
 */
export function vaneOperations(): Registry {
  return operationsFor(VANE_INTEGRATION);
}

/** Who an approved action runs as: the person who approved it, through Vane. */
export type ApproverContext = Omit<OperationActor, "via">;

export type VaneActionView = {
  id: string;
  kind: string;
  module: string;
  title: string;
  /** The approve button's words: "Set the due date". */
  verb: string;
  /** The page it acts on, filtered to its records. */
  target: string | null;
  /** What a person may change before approving, with the values Vane proposed. */
  fields: Array<OperationField & { value: unknown }>;
  status: "proposed" | "approved" | "done" | "failed" | "denied";
  result: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
};

const STATUS: Record<VaneActionStatus, VaneActionView["status"]> = {
  PROPOSED: "proposed",
  APPROVED: "approved",
  DONE: "done",
  FAILED: "failed",
  DENIED: "denied",
};

const find = (registry: Registry, key: string) => findOperation(key, registry);

const asParams = (value: Prisma.JsonValue): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

type ActionRow = {
  id: string;
  kind: string;
  title: string;
  params: Prisma.JsonValue;
  status: VaneActionStatus;
  result: string | null;
  decidedAt: Date | null;
  decidedBy: { name: string } | null;
};

export function toActionView(row: ActionRow, registry: Registry = vaneOperations()): VaneActionView {
  const action = find(registry, row.kind);
  const params = asParams(row.params);
  const parsed = action?.input.safeParse(params);
  return {
    id: row.id,
    kind: row.kind,
    module: action?.product ?? row.kind.split(".")[0] ?? "vane",
    title: row.title,
    verb: action && parsed?.success ? action.verb(parsed.data) : "Approve",
    target: action && parsed?.success ? action.target(parsed.data, row.id) : null,
    fields: (action?.fields ?? []).map((field) => ({ ...field, value: params[field.name] ?? null })),
    status: STATUS[row.status],
    result: row.result,
    decidedBy: row.decidedBy?.name ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export const ACTION_SELECT = {
  id: true,
  kind: true,
  title: true,
  params: true,
  status: true,
  result: true,
  decidedAt: true,
  itemId: true,
  messageId: true,
  decidedBy: { select: { name: true } },
} as const;

export type ActionProposal = { kind: string; params: Record<string, unknown> };

/**
 * Writes Vane's proposals on a card or a chat answer, each checked against
 * its kind. A proposal that does not fit comes back refused, with why, for
 * Claude to correct.
 */
export async function proposeActions(
  db: Pick<PrismaClient, "vaneAction">,
  where: { companyId: string; itemId?: string | null; messageId?: string | null },
  proposals: ActionProposal[],
  registry: Registry = vaneOperations(),
): Promise<{ proposed: Array<{ id: string; title: string }>; refused: Array<{ kind: string; why: string }> }> {
  const proposed: Array<{ id: string; title: string }> = [];
  const refused: Array<{ kind: string; why: string }> = [];
  for (const proposal of proposals) {
    const action = find(registry, proposal.kind);
    if (!action) {
      refused.push({ kind: proposal.kind, why: `There is no operation ${proposal.kind} that Vane may use.` });
      continue;
    }
    const parsed = action.input.safeParse(proposal.params);
    if (!parsed.success) {
      refused.push({ kind: proposal.kind, why: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") });
      continue;
    }
    const row = await db.vaneAction.create({
      data: {
        companyId: where.companyId,
        itemId: where.itemId ?? null,
        messageId: where.messageId ?? null,
        kind: action.key,
        title: action.title(parsed.data),
        params: parsed.data as Prisma.InputJsonValue,
      },
      select: { id: true, title: true },
    });
    proposed.push(row);
  }
  return { proposed, refused };
}

export type ActionDecision = { approve: false } | { approve: true; changes?: Record<string, unknown> };

export type DecisionOutcome =
  | { ok: true; action: VaneActionView }
  | { ok: false; status: 403 | 404 | 409 | 400; error: string };

/**
 * A person decides on one action. Deny keeps it, denied. Approve takes the
 * changes they made to its editable inputs, checks them and their role, and
 * runs it as them: done with what happened, or failed with why. An action
 * already decided is not decided twice. When the last action on a card is
 * done, the card is taken further, by that person.
 */
export async function decideAction(
  db: Db,
  approver: ApproverContext,
  id: string,
  decision: ActionDecision,
  registry: Registry = vaneOperations(),
  now: () => Date = () => new Date(),
): Promise<DecisionOutcome> {
  const row = await db.vaneAction.findFirst({ where: { id, companyId: approver.companyId }, select: ACTION_SELECT });
  if (!row) return { ok: false, status: 404, error: "There is no such action in this workspace." };
  const view = () => db.vaneAction.findUniqueOrThrow({ where: { id }, select: ACTION_SELECT }).then((fresh) => toActionView(fresh, registry));
  // A failed action can be approved again (the module refused it; the person may have fixed why).
  const open = row.status === "PROPOSED" || (decision.approve && row.status === "FAILED");
  if (!open) return { ok: false, status: 409, error: "Someone has already decided on this." };

  if (!decision.approve) {
    await db.vaneAction.updateMany({
      where: { id, status: "PROPOSED" },
      data: { status: "DENIED", decidedById: approver.userId, decidedAt: now() },
    });
    return { ok: true, action: await view() };
  }

  const action = find(registry, row.kind);
  if (!action) return { ok: false, status: 400, error: "Vane no longer knows how to do this." };
  const editable = new Set([...action.fields.map((field) => field.name), ...(action.pageFields ?? [])]);
  const changes = Object.fromEntries(Object.entries(decision.changes ?? {}).filter(([name]) => editable.has(name)));
  const parsed = action.input.safeParse({ ...asParams(row.params), ...changes });
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Those inputs are not right." };
  const context: OperationActor = { ...approver, via: { kind: "integration", integration: VANE_INTEGRATION.key } };
  const refusal = await action.authorize(context, parsed.data);
  if (refusal) return { ok: false, status: 403, error: refusal };

  const { count } = await db.vaneAction.updateMany({
    where: { id, status: { in: ["PROPOSED", "FAILED"] } },
    data: {
      status: "APPROVED",
      params: parsed.data as Prisma.InputJsonValue,
      title: action.title(parsed.data),
      decidedById: context.userId,
      decidedAt: now(),
    },
  });
  if (count === 0) return { ok: false, status: 409, error: "Someone has already decided on this." };

  try {
    const result = outcomeWords(await action.run(context, parsed.data));
    await db.vaneAction.update({ where: { id }, data: { status: "DONE", result, doneAt: now() } });
  } catch (error) {
    const why =
      error instanceof OperationRefused
        ? error.message
        : `It did not work: ${error instanceof Error ? error.message : "the module refused it"}.`;
    if (!(error instanceof OperationRefused)) console.error(`[vane] action ${row.kind} failed`, error);
    await db.vaneAction.update({ where: { id }, data: { status: "FAILED", result: why } });
  }

  if (row.itemId) await closeCardWhenDone(db, row.itemId, context.userId, now());
  return { ok: true, action: await view() };
}

/** A card whose actions are all decided, at least one of them done, is taken further by the person who finished it. */
async function closeCardWhenDone(db: Db, itemId: string, userId: string, at: Date): Promise<void> {
  const actions = await db.vaneAction.findMany({ where: { itemId }, select: { status: true } });
  const waiting = actions.some((action) => action.status === "PROPOSED" || action.status === "APPROVED" || action.status === "FAILED");
  if (waiting || !actions.some((action) => action.status === "DONE")) return;
  await db.vaneItem.updateMany({ where: { id: itemId, status: "OPEN" }, data: { status: "DONE", resolvedAt: at, resolvedById: userId } });
}

/** The actions on these cards and chat answers, oldest first, by where they hang. */
export async function actionsFor(
  db: Pick<PrismaClient, "vaneAction">,
  companyId: string,
  where: { itemIds?: string[]; messageIds?: string[] },
  registry: Registry = vaneOperations(),
): Promise<{ byItem: Map<string, VaneActionView[]>; byMessage: Map<string, VaneActionView[]> }> {
  const byItem = new Map<string, VaneActionView[]>();
  const byMessage = new Map<string, VaneActionView[]>();
  const or = [
    ...(where.itemIds?.length ? [{ itemId: { in: where.itemIds } }] : []),
    ...(where.messageIds?.length ? [{ messageId: { in: where.messageIds } }] : []),
  ];
  if (or.length === 0) return { byItem, byMessage };
  const rows = await db.vaneAction.findMany({ where: { companyId, OR: or }, orderBy: { createdAt: "asc" }, select: ACTION_SELECT });
  for (const row of rows) {
    const view = toActionView(row, registry);
    if (row.itemId) byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), view]);
    if (row.messageId) byMessage.set(row.messageId, [...(byMessage.get(row.messageId) ?? []), view]);
  }
  return { byItem, byMessage };
}
