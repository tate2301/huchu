import type { PrismaClient, WorkOrderPriority, WorkOrderStatus } from "@prisma/client";

import { partsOf } from "./work-orders";

/**
 * One equipment work order (the PageVaneMine board): what to do and why, the
 * equipment, who fixes it and how urgently, what happened to that equipment
 * before, and the parts it needs against what stores hold.
 */

export type WorkOrderRecord = {
  id: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  madeByVane: boolean;
  issue: string;
  /** What Vane found, on Vane's drafts. */
  note: string | null;
  equipment: { id: string; label: string; site: string };
  technician: { id: string; name: string } | null;
  madeBy: string;
  started: string;
  /** Earlier work orders on the same equipment, newest first. */
  history: Array<{ id: string; date: string; issue: string; hours: number | null; workDone: string | null; status: WorkOrderStatus }>;
  parts: Array<{ name: string; needed: number; onHand: number | null; unit: string | null }>;
  /** Who it can be assigned to: the workspace's active people. */
  technicians: Array<{ id: string; name: string }>;
};

type Db = Pick<PrismaClient, "workOrder" | "inventoryItem" | "employee">;

const day = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Harare" });
const hoursBetween = (start: Date, end: Date | null) => (end ? Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 10) / 10 : null);

export async function readWorkOrderRecord(db: Db, companyId: string, id: string): Promise<WorkOrderRecord | null> {
  const order = await db.workOrder.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      status: true,
      priority: true,
      madeByVane: true,
      issue: true,
      vaneNote: true,
      partsUsed: true,
      downtimeStart: true,
      createdAt: true,
      equipment: { select: { id: true, name: true, equipmentCode: true, site: { select: { name: true } } } },
      technician: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!order) return null;

  const parts = partsOf(order.partsUsed);
  const itemIds = parts.flatMap((part) => (part.itemId ? [part.itemId] : []));
  const [history, items, technicians] = await Promise.all([
    db.workOrder.findMany({
      where: { companyId, equipmentId: order.equipment.id, id: { not: order.id }, status: { not: "DRAFT" } },
      orderBy: { downtimeStart: "desc" },
      take: 12,
      select: { id: true, downtimeStart: true, downtimeEnd: true, issue: true, workDone: true, status: true },
    }),
    itemIds.length
      ? db.inventoryItem.findMany({ where: { id: { in: itemIds }, site: { companyId } }, select: { id: true, currentStock: true, unit: true } })
      : Promise.resolve([]),
    db.employee.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } }),
  ]);
  const stock = new Map(items.map((item) => [item.id, item]));

  return {
    id: order.id,
    status: order.status,
    priority: order.priority,
    madeByVane: order.madeByVane,
    issue: order.issue,
    note: order.vaneNote,
    equipment: { id: order.equipment.id, label: `${order.equipment.name}, ${order.equipment.equipmentCode}`, site: order.equipment.site.name },
    technician: order.technician,
    madeBy: order.madeByVane ? `Vane, ${day(order.createdAt)}` : (order.createdBy?.name ?? "Someone in the workspace"),
    started: day(order.downtimeStart),
    history: history.map((row) => ({
      id: row.id,
      date: day(row.downtimeStart),
      issue: row.issue,
      hours: hoursBetween(row.downtimeStart, row.downtimeEnd),
      workDone: row.workDone,
      status: row.status,
    })),
    parts: parts.map((part) => {
      const item = part.itemId ? stock.get(part.itemId) : undefined;
      return { name: part.name, needed: part.quantity, onHand: item ? Number(item.currentStock) : null, unit: item?.unit ?? null };
    }),
    technicians,
  };
}
