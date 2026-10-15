import type { WorkOrderPriority } from "@prisma/client";
import { z } from "zod";

import { emitWorkOrderStatusNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/**
 * Equipment work orders, as Vane drafts them and a person raises them (the
 * PageVaneMine board). A draft is the workshop's not yet: it has no maker, it
 * says what Vane found, and nobody is told of it until a person raises it.
 */

/** A part a work order needs: from stores (`itemId`) or named only. */
export const partSchema = z.object({
  name: z.string().trim().min(1).max(200),
  itemId: z.string().min(1).optional(),
  quantity: z.number().positive(),
});
export type WorkOrderPart = z.infer<typeof partSchema>;

/** The parts on a work order, from its `partsUsed` JSON; what does not read as parts is none. */
export function partsOf(partsUsed: string | null): WorkOrderPart[] {
  if (!partsUsed) return [];
  try {
    const parsed = z.array(partSchema).safeParse(JSON.parse(partsUsed));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Why a work order could not be drafted, raised or deleted, in a sentence. */
export class WorkOrderRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkOrderRefused";
  }
}

export type WorkOrderDraft = {
  equipmentId: string;
  issue: string;
  /** What Vane found, in a sentence or two. */
  note: string;
  priority: WorkOrderPriority;
  technicianId?: string | null;
  /** When the breakdown it is about began; now when not said. */
  downtimeStart?: Date;
  parts: WorkOrderPart[];
};

/** Vane's draft of a work order, through the same checks a person's goes through: the equipment, the technician and the parts are this workspace's. */
export async function draftWorkOrderForVane(companyId: string, draft: WorkOrderDraft) {
  const equipment = await prisma.equipment.findFirst({
    where: { id: draft.equipmentId, site: { companyId } },
    select: { id: true, name: true, equipmentCode: true, isActive: true, siteId: true },
  });
  if (!equipment) throw new WorkOrderRefused("There is no such equipment in this workspace.");
  if (!equipment.isActive) throw new WorkOrderRefused(`${equipment.name} is retired, so it takes no work orders.`);
  if (draft.technicianId) {
    const technician = await prisma.employee.findFirst({ where: { id: draft.technicianId, companyId, isActive: true }, select: { id: true } });
    if (!technician) throw new WorkOrderRefused("That technician is not active in this workspace.");
  }
  const itemIds = draft.parts.flatMap((part) => (part.itemId ? [part.itemId] : []));
  if (itemIds.length) {
    const found = await prisma.inventoryItem.count({ where: { id: { in: itemIds }, site: { companyId } } });
    if (found !== new Set(itemIds).size) throw new WorkOrderRefused("A part is not one of this workspace's stock items.");
  }
  return prisma.workOrder.create({
    data: {
      companyId,
      equipmentId: equipment.id,
      issue: draft.issue,
      vaneNote: draft.note,
      priority: draft.priority,
      technicianId: draft.technicianId ?? null,
      downtimeStart: draft.downtimeStart ?? new Date(),
      partsUsed: draft.parts.length ? JSON.stringify(draft.parts) : null,
      status: "DRAFT",
      madeByVane: true,
      createdById: null,
    },
    select: { id: true, issue: true, priority: true, equipment: { select: { name: true, equipmentCode: true } } },
  });
}

/** A person raises a draft: it becomes an open work order the workshop is told of. Only a draft can be raised, once. */
export async function raiseWorkOrder(actor: { companyId: string; userId: string; role: string }, id: string) {
  const { count } = await prisma.workOrder.updateMany({ where: { id, companyId: actor.companyId, status: "DRAFT" }, data: { status: "OPEN" } });
  const order = await prisma.workOrder.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true, issue: true, status: true, equipment: { select: { id: true, equipmentCode: true, name: true } } },
  });
  if (!order) throw new WorkOrderRefused("There is no such work order in this workspace.");
  if (count === 0) throw new WorkOrderRefused("That work order was raised already.");
  await emitWorkOrderStatusNotification(prisma, { companyId: actor.companyId, actorId: actor.userId, actorRole: actor.role, workOrder: order });
  return order;
}

/** Deletes one of Vane's drafts. A raised work order, or one a person made, is not Vane's to delete. */
export async function deleteVaneDraftWorkOrder(companyId: string, id: string) {
  const { count } = await prisma.workOrder.deleteMany({ where: { id, companyId, status: "DRAFT", madeByVane: true } });
  if (count === 0) throw new WorkOrderRefused("That work order was raised, or is not Vane's draft, so it stays.");
}
