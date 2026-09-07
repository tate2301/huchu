import { createHash, randomUUID } from "crypto"
import type { Prisma } from "@corelithzw/db"
import { prisma } from "@corelithzw/db/client"

/**
 * The hash-chained `PlatformAuditEvent` writer.
 *
 * This was written for Gold and lived in `lib/audit/gold.ts`, where the name
 * was the only thing about it that was gold-specific. Schools needs the same
 * chain for the same reason — a privileged money action has to leave a record
 * that cannot be edited without breaking the chain behind it — so the mechanism
 * moved here and `writeGoldAuditEvent` became a one-line delegate.
 *
 * Two differences from the Gold entry point, both deliberate:
 *
 *   * it accepts a client, so an audit row can be written **inside** the
 *     transaction that performs the action. A refund and its audit event commit
 *     together or not at all;
 *   * it does not swallow. `writeGoldAuditEvent` catches and logs, which is the
 *     right trade for a background import and the wrong one for money leaving a
 *     school.
 */

/** Anything with the audit table on it — the global client or a transaction. */
export type AuditClient = Pick<Prisma.TransactionClient, "platformAuditEvent">

export type PlatformAuditArgs = {
  companyId: string
  actorId: string
  eventType: string
  entityType?: string
  entityId?: string
  reason?: string
  payload?: Record<string, unknown>
}

export function buildAuditEventHash(args: {
  companyId: string
  actorId: string
  eventType: string
  entityType?: string
  entityId?: string
  payload?: Record<string, unknown>
  prevEventHash: string | null
  nonce: string
  at: number
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        companyId: args.companyId,
        actor: args.actorId,
        eventType: args.eventType,
        entityType: args.entityType ?? null,
        entityId: args.entityId ?? null,
        payload: args.payload ?? null,
        prevEventHash: args.prevEventHash,
        nonce: args.nonce,
        at: args.at,
      }),
    )
    .digest("hex")
}

/**
 * Append one event to a company's chain.
 *
 * The previous hash is read and the new row written without a lock, so two
 * simultaneous events can share a predecessor and fork the chain rather than
 * extending it. That is the pre-existing behaviour and it is tolerable: the
 * nonce keeps `eventHash` unique, and a fork is still tamper-evident — what the
 * chain proves is that no row was altered after the fact, not that the ordering
 * is total.
 */
export async function writePlatformAuditEvent(
  args: PlatformAuditArgs,
  client: AuditClient = prisma,
): Promise<void> {
  const prev = await client.platformAuditEvent.findFirst({
    where: { companyId: args.companyId },
    orderBy: { createdAt: "desc" },
    select: { eventHash: true },
  })
  const prevEventHash = prev?.eventHash ?? null
  const nonce = randomUUID()
  const at = Date.now()
  const eventHash = buildAuditEventHash({
    companyId: args.companyId,
    actorId: args.actorId,
    eventType: args.eventType,
    entityType: args.entityType,
    entityId: args.entityId,
    payload: args.payload,
    prevEventHash,
    nonce,
    at,
  })
  await client.platformAuditEvent.create({
    data: {
      companyId: args.companyId,
      actor: args.actorId,
      eventType: args.eventType,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
      reason: args.reason ?? null,
      payloadJson: args.payload ? JSON.stringify(args.payload) : null,
      eventHash,
      prevEventHash,
    },
  })
}
