import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import type { PosDevice } from "@/lib/retail/devices";
import { approvalFor, type Approval, type ApproverInput } from "@/lib/retail/manager-pin";
import { checkTillRule, loadTillRules } from "@/lib/retail/till-rules";

/**
 * The drawer opened without a sale (SET-06, `POST /api/v2/retail/pos/drawer/open`;
 * FLR-09 draws the button and its PIN dialog). "Open the drawer without a
 * sale" off: a manager's PIN, or someone who holds the approve right. Every
 * opening is one `RETAIL_DRAWER.OPENED` on the till — Insights › Losses counts
 * them as no-sale opens by the person at the till.
 */

/** 409: this till has no cash drawer to open. */
export class NoDrawer extends Error {
  readonly status = 409;
  constructor(tillName: string) {
    super(`${tillName} has no cash drawer.`);
    this.name = "NoDrawer";
  }
}

export async function openDrawerWithoutSale(input: {
  actor: RetailAuditActor;
  device: PosDevice;
  approver?: ApproverInput | null;
  now?: Date;
}): Promise<{ openedAt: Date; approvedBy: Approval | null; shiftNo: string | null }> {
  const { actor, device } = input;
  if (!device.register.hasDrawer) throw new NoDrawer(device.register.name);
  const rules = await loadTillRules(actor.companyId);
  const approvedBy = await approvalFor({
    companyId: actor.companyId,
    actorRole: actor.userRole,
    decision: checkTillRule(rules, { act: "drawer" }),
    approver: input.approver,
    place: { registerId: device.registerId },
  });
  const openedAt = input.now ?? new Date();
  const shift = await prisma.retailShift.findFirst({
    where: { companyId: actor.companyId, registerId: device.registerId, cashierId: actor.userId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
    select: { id: true, shiftNo: true },
  });
  await prisma.$transaction((tx) =>
    writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.drawerOpened,
      entityType: "RetailRegister",
      entityId: device.registerId,
      payload: {
        registerName: device.register.name,
        siteId: device.register.site.id,
        deviceId: device.id,
        shiftId: shift?.id ?? null,
        shiftNo: shift?.shiftNo ?? null,
        approvedById: approvedBy?.id ?? null,
        approvedByName: approvedBy?.name ?? null,
      },
    }),
  );
  return { openedAt, approvedBy, shiftNo: shift?.shiftNo ?? null };
}
