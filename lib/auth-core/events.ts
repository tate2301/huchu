import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { AuthEventInput } from "@/lib/auth-core/types";

function buildEventHash(input: AuthEventInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...input,
        nonce: randomUUID(),
        at: Date.now(),
      }),
    )
    .digest("hex");
}

export async function logAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    await prisma.platformAuditEvent.create({
      data: {
        companyId: input.companyId ?? null,
        actor: input.actor ?? null,
        eventType: input.eventType,
        entityType: input.entityType ?? "auth",
        entityId: input.entityId ?? null,
        reason: input.reason ?? null,
        payloadJson: input.payload ? JSON.stringify(input.payload) : null,
        eventHash: buildEventHash(input),
        prevEventHash: null,
      },
    });
  } catch (error) {
    console.error("[auth] failed to record auth event", error);
  }
}
