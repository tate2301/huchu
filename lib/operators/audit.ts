import { writePlatformAuditEvent, type AuditClient } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

/**
 * How an operator is named in `PlatformAuditEvent.actor`. A prefix, because
 * the same column holds tenant user ids, and an operator is not one.
 */
export function operatorActor(operatorId: string): string {
  return `operator:${operatorId}`;
}

export function operatorIdFromActor(actor: string | null | undefined): string | null {
  return actor?.startsWith("operator:") ? actor.slice("operator:".length) : null;
}

/**
 * One line in the audit log for something an operator did. Inside a workspace
 * it joins that workspace's chain; anything else joins the portal's own.
 */
export async function recordOperatorEvent(
  args: {
    operatorId: string | null;
    eventType: string;
    companyId?: string | null;
    entityType?: string;
    entityId?: string;
    reason?: string;
    payload?: Record<string, unknown>;
  },
  client: AuditClient = prisma,
) {
  await writePlatformAuditEvent(
    {
      companyId: args.companyId ?? null,
      actorId: args.operatorId ? operatorActor(args.operatorId) : null,
      eventType: args.eventType,
      entityType: args.entityType,
      entityId: args.entityId,
      reason: args.reason,
      payload: args.payload,
    },
    client,
  );
}
