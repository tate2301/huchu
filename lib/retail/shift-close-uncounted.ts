import type { Prisma } from "@prisma/client";

import { auditAmount, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

/**
 * Close an open shift without a count (80-admin W-57, Remove access): the
 * drawer was not counted, so there is no counted cash, no variance and no
 * variance journal; the Shifts list reads it "Not counted" for a manager to
 * sign off. Inside the caller's transaction, with its `RETAIL_SHIFT.CLOSED`
 * event (`uncounted`, and why). The floor's close-uncounted (FLR-04) is this
 * same act from the shift's own menu.
 */
export async function closeShiftUncounted(
  tx: Prisma.TransactionClient,
  input: { actor: RetailAuditActor; shiftId: string; reason: string; now?: Date },
): Promise<{ shiftNo: string; registerName: string } | null> {
  const shift = await tx.retailShift.findFirst({
    where: { id: input.shiftId, companyId: input.actor.companyId, status: "OPEN" },
    select: { id: true, shiftNo: true, registerName: true, cashierId: true, expectedCash: true, notes: true },
  });
  if (!shift) return null;
  await tx.retailShift.update({
    where: { id: shift.id },
    data: {
      status: "CLOSED",
      closedAt: input.now ?? new Date(),
      countedCash: null,
      variance: null,
      notes: shift.notes ? `${shift.notes}\n${input.reason}` : input.reason,
    },
  });
  await writeRetailAuditEvent(tx, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.shiftClosed,
    entityType: "RetailShift",
    entityId: shift.id,
    reason: input.reason,
    payload: {
      shiftNo: shift.shiftNo,
      cashierId: shift.cashierId,
      expectedCash: auditAmount(shift.expectedCash),
      countedCash: null,
      variance: null,
      uncounted: true,
      closedByOwner: input.actor.userId === shift.cashierId,
    },
  });
  return { shiftNo: shift.shiftNo, registerName: shift.registerName };
}
