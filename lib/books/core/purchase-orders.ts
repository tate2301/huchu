import { Prisma, type RetailPurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

import { approvalNote, decideApproval, moneyLimits, otherOwners, othersWhoCan, recordApproval } from "./approvals";
import { canDo, tierOf, type BooksActor } from "./can-do";

/**
 * A purchase order, one table for the shop and everyone else (D11,
 * books-final §4.7): Draft → (over the limit) To approve → Sent → Part
 * received → Received → Closed; Draft, To approve and Sent may be cancelled.
 * A Books order has no shop (`siteId` null) and may carry service lines (no
 * stock item). A PO is a commitment and never posts.
 *
 * Retail's own buying (`lib/retail/buying/orders.ts`) sends and receives its
 * orders as it did; its money is approved on the requisition that pays for
 * it, under the same limits. These functions move a Books order, and check
 * every move against the same table.
 */

export class PurchaseOrderRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "PurchaseOrderRefused";
  }
}

const MOVES: Record<RetailPurchaseOrderStatus, readonly RetailPurchaseOrderStatus[]> = {
  DRAFT: ["TO_APPROVE", "SENT", "CANCELLED"],
  // Approved: sent. Rejected or withdrawn: back to a draft.
  TO_APPROVE: ["SENT", "DRAFT", "CANCELLED"],
  SENT: ["PARTIAL", "RECEIVED", "CANCELLED", "CLOSED"],
  PARTIAL: ["RECEIVED", "CLOSED"],
  RECEIVED: ["CLOSED"],
  // Reopened by a manager.
  CLOSED: ["RECEIVED"],
  CANCELLED: [],
};

export function canMovePurchaseOrder(from: RetailPurchaseOrderStatus, to: RetailPurchaseOrderStatus): boolean {
  return MOVES[from].includes(to);
}

const WORD: Record<RetailPurchaseOrderStatus, string> = {
  DRAFT: "a draft",
  TO_APPROVE: "waiting for approval",
  SENT: "sent",
  PARTIAL: "part received",
  RECEIVED: "received",
  CLOSED: "closed",
  CANCELLED: "cancelled",
};

export function assertPurchaseOrderMove(poNo: string, from: RetailPurchaseOrderStatus, to: RetailPurchaseOrderStatus) {
  if (!canMovePurchaseOrder(from, to)) throw new PurchaseOrderRefused(`${poNo} is ${WORD[from]}, so it cannot be ${WORD[to] === "sent" ? "sent" : `made ${WORD[to]}`}.`);
}

export const purchaseOrderSchema = z.object({
  vendorId: z.string().uuid(),
  siteId: z.string().uuid().nullable().optional(),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  noteToSupplier: z.string().trim().max(1000).nullable().optional(),
  lines: z
    .array(
      z.object({
        /** None for a service (a fitter's day, transport). */
        inventoryItemId: z.string().uuid().nullable().optional(),
        itemName: z.string().trim().min(1).max(200),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
        vatRate: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1)
    .max(200),
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

const money = (value: number) => Math.round(value * 100) / 100;

/** What an order comes to with VAT: what is compared with the limit. */
export function purchaseOrderTotal(lines: Array<{ lineTotal: Prisma.Decimal | number; vatRate: Prisma.Decimal | number }>): number {
  return money(lines.reduce((sum, line) => sum + Number(line.lineTotal) * (1 + Number(line.vatRate) / 100), 0));
}

/** A Books order, as a draft: no shop needed, service lines allowed. */
export async function createPurchaseOrder(actor: BooksActor, input: PurchaseOrderInput) {
  const allowed = canDo(actor, "draft.create", { kind: "purchase-order" });
  if (!allowed.allowed) throw new PurchaseOrderRefused(allowed.reason, 403);
  const vendor = await prisma.vendor.findFirst({ where: { id: input.vendorId, companyId: actor.companyId }, select: { id: true } });
  if (!vendor) throw new PurchaseOrderRefused("That supplier is not here any more.", 404);
  if (input.siteId) {
    const site = await prisma.site.findFirst({ where: { id: input.siteId, companyId: actor.companyId }, select: { id: true } });
    if (!site) throw new PurchaseOrderRefused("That site is not here any more.", 404);
  }
  return prisma.$transaction(async (tx) => {
    const poNo = await reserveIdentifier(tx, { companyId: actor.companyId, entity: "RETAIL_PURCHASE_ORDER" });
    return tx.retailPurchaseOrder.create({
      data: {
        companyId: actor.companyId,
        poNo,
        siteId: input.siteId ?? null,
        vendorId: vendor.id,
        status: "DRAFT",
        expectedDate: input.expectedDate ? new Date(`${input.expectedDate}T00:00:00.000Z`) : null,
        noteToSupplier: input.noteToSupplier ?? null,
        createdById: actor.userId,
        lines: {
          create: input.lines.map((line, index) => ({
            companyId: actor.companyId,
            inventoryItemId: line.inventoryItemId ?? null,
            itemName: line.itemName,
            quantity: line.quantity,
            unitCost: line.unitCost,
            lineTotal: money(line.quantity * line.unitCost),
            vatRate: line.vatRate,
            sortOrder: index,
          })),
        },
      },
      include: { lines: true },
    });
  });
}

async function readOrder(companyId: string, id: string) {
  const order = await prisma.retailPurchaseOrder.findFirst({ where: { id, companyId }, include: { lines: true } });
  if (!order) throw new PurchaseOrderRefused("Purchase order not found", 404);
  return order;
}

/**
 * Submit: over the limit for anyone but the owner it waits, "To approve", with
 * the limit and the approver as they are now; otherwise it is sent.
 */
export async function submitPurchaseOrder(actor: BooksActor, id: string, at = new Date()) {
  const order = await readOrder(actor.companyId, id);
  assertPurchaseOrderMove(order.poNo, order.status, "SENT");
  const limits = await moneyLimits(actor.companyId);
  const total = purchaseOrderTotal(order.lines);
  const over = total > limits.requisitionOwnerOver + 0.004 && tierOf(actor) !== "owner";
  return prisma.$transaction(async (tx) => {
    const moved = await tx.retailPurchaseOrder.updateMany({
      where: { id, status: "DRAFT" },
      data: over
        ? { status: "TO_APPROVE", submittedAt: at, approvalLimit: limits.requisitionOwnerOver, approverId: limits.ownerApprover?.id ?? null }
        : { status: "SENT", submittedAt: at, sentAt: at, sentById: actor.userId, sentVia: "BY_HAND", firstExpectedDate: order.expectedDate },
    });
    if (moved.count === 0) throw new PurchaseOrderRefused(`${order.poNo} has changed. Open it again.`);
    await recordApproval(tx, { companyId: actor.companyId, kind: "purchase-order", entityId: id, action: "SUBMIT", from: "DRAFT", to: over ? "TO_APPROVE" : "SENT", actedById: actor.userId });
    return tx.retailPurchaseOrder.findUniqueOrThrow({ where: { id } });
  });
}

/** Approve (sent) or reject (back to a draft): not the maker, and over the limit only the owner. */
export async function decidePurchaseOrder(actor: BooksActor, id: string, input: { approve: boolean; note?: string | null }, at = new Date()) {
  const order = await readOrder(actor.companyId, id);
  const to: RetailPurchaseOrderStatus = input.approve ? "SENT" : "DRAFT";
  if (order.status !== "TO_APPROVE") throw new PurchaseOrderRefused(`${order.poNo} is not waiting for approval.`);
  const limits = await moneyLimits(actor.companyId);
  const decision = decideApproval(
    actor,
    {
      kind: "purchase-order",
      module: order.siteId ? "retail" : "books",
      requestedById: order.createdById,
      amount: purchaseOrderTotal(order.lines),
      limit: order.approvalLimit != null ? Number(order.approvalLimit) : limits.requisitionOwnerOver,
    },
    {
      othersWhoCanApprove: await othersWhoCan(prisma, actor.companyId, { module: order.siteId ? "retail" : "books", except: [order.createdById] }),
      otherOwners: await otherOwners(prisma, actor.companyId, [order.createdById]),
      ownerName: limits.ownerApprover?.name ?? null,
    },
  );
  if (!decision.allowed) throw new PurchaseOrderRefused(decision.reason, 403);
  if (!input.approve && !input.note?.trim()) throw new PurchaseOrderRefused("Say why it is sent back, so the maker can change it.", 400);
  return prisma.$transaction(async (tx) => {
    const moved = await tx.retailPurchaseOrder.updateMany({
      where: { id, status: "TO_APPROVE" },
      data: input.approve
        ? { status: "SENT", approvedById: actor.userId, approvedAt: at, decisionNote: input.note ?? null, sentAt: at, sentById: actor.userId, sentVia: "BY_HAND", firstExpectedDate: order.expectedDate }
        : { status: "DRAFT", decisionNote: input.note ?? null },
    });
    if (moved.count === 0) throw new PurchaseOrderRefused(`${order.poNo} has changed. Open it again.`);
    await recordApproval(tx, {
      companyId: actor.companyId,
      kind: "purchase-order",
      entityId: id,
      action: input.approve ? "APPROVE" : "REJECT",
      from: "TO_APPROVE",
      to,
      actedById: actor.userId,
      note: approvalNote(decision, input.note),
    });
    return tx.retailPurchaseOrder.findUniqueOrThrow({ where: { id } });
  });
}

/** Cancel a draft, one waiting or one sent: its maker, or someone who may approve. */
export async function cancelPurchaseOrder(actor: BooksActor, id: string, at = new Date()) {
  const order = await readOrder(actor.companyId, id);
  assertPurchaseOrderMove(order.poNo, order.status, "CANCELLED");
  if (order.createdById !== actor.userId && !canDo(actor, "approve", { kind: "purchase-order", module: order.siteId ? "retail" : "books" }).allowed) {
    throw new PurchaseOrderRefused("Only whoever made it, or someone who approves orders, can cancel it.", 403);
  }
  return prisma.retailPurchaseOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: at, cancelledById: actor.userId } });
}

/** Close one received or part received: nothing more is expected. Reopen is a manager's. */
export async function closePurchaseOrder(actor: BooksActor, id: string, input: { reopen?: boolean; note?: string | null } = {}, at = new Date()) {
  const order = await readOrder(actor.companyId, id);
  if (input.reopen) {
    assertPurchaseOrderMove(order.poNo, order.status, "RECEIVED");
    const tier = tierOf(actor);
    if (tier !== "owner" && tier !== "manager") throw new PurchaseOrderRefused("Only a manager can reopen a closed order.", 403);
    return prisma.retailPurchaseOrder.update({ where: { id }, data: { status: "RECEIVED", closedAt: null, closedById: null, closeNote: null } });
  }
  assertPurchaseOrderMove(order.poNo, order.status, "CLOSED");
  return prisma.retailPurchaseOrder.update({ where: { id }, data: { status: "CLOSED", closedAt: at, closedById: actor.userId, closeNote: input.note ?? null } });
}
