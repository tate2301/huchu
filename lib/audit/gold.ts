import { createHash, randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

export type GoldAuditArgs = {
  companyId: string
  actorId: string
  eventType: string
  entityType?: string
  entityId?: string
  payload?: Record<string, unknown>
}

function buildEventHash(args: {
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

export async function writeGoldAuditEvent(args: GoldAuditArgs): Promise<void> {
  try {
    const prev = await prisma.platformAuditEvent.findFirst({
      where: { companyId: args.companyId },
      orderBy: { createdAt: "desc" },
      select: { eventHash: true },
    })
    const prevEventHash = prev?.eventHash ?? null
    const nonce = randomUUID()
    const at = Date.now()
    const eventHash = buildEventHash({
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
    await prisma.platformAuditEvent.create({
      data: {
        companyId: args.companyId,
        actor: args.actorId,
        eventType: args.eventType,
        entityType: args.entityType ?? null,
        entityId: args.entityId ?? null,
        payloadJson: args.payload ? JSON.stringify(args.payload) : null,
        eventHash,
        prevEventHash,
      },
    })
  } catch (error) {
    console.error("[audit] writeGoldAuditEvent failed", error)
  }
}
