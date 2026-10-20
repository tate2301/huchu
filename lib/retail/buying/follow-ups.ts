import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { addDays, dayKey } from "@/lib/workspace/format";

import { cancelRest, dayStart, OrderRefusal } from "./orders";
import { dayMonth } from "./words";

/**
 * The morning's order follow-ups (40-buying W-34, 4.9): every order someone
 * chased whose promised day has passed with something still to come. "Remind
 * me" tells whoever chased it; "Cancel the rest" cancels what is left, with
 * nobody as the actor ("Automatic"), and asks the supplier to cancel it too.
 * Each order is followed up once: `followUpDoneAt` is claimed before acting,
 * so a second run (or a second worker) finds nothing. Days are the shop's
 * (Africa/Harare): a promise for today is not late until tomorrow.
 *
 * Then the receipts (BUY-05): a requisition paid out and not accounted for
 * once its receipts day has passed tells the asker, once ("REQ-0012: receipts
 * were due yesterday."). The notice itself is the mark: one already sent for
 * the requisition is not sent again.
 */

export type FollowUps = { reminded: number; cancelled: number; receiptsOverdue: number };

/** "REQ-0012: receipts were due yesterday." / "… were due on 2 October." */
export function receiptsOverdueTitle(requisitionNo: string, due: Date, now: Date): string {
  const yesterday = addDays(dayKey(now), -1);
  return dayKey(due) === yesterday ? `${requisitionNo}: receipts were due yesterday.` : `${requisitionNo}: receipts were due on ${dayMonth(due)}.`;
}

/** Paid-out requisitions past their receipts day: the asker is told once each. */
async function chaseReceipts(companyId: string, now: Date): Promise<number> {
  const today = dayStart(dayKey(now));
  const late = await prisma.crmRequisition.findMany({
    where: { companyId, siteId: { not: null }, status: "DISBURSED", receiptsDueAt: { lt: today } },
    orderBy: { requisitionNo: "asc" },
    select: { id: true, requisitionNo: true, receiptsDueAt: true, requestedById: true },
  });
  let told = 0;
  for (const requisition of late) {
    const sent = await prisma.notification.findFirst({
      where: { companyId, type: "CRM_REQUISITION_DECIDED", entityId: requisition.id, title: { contains: "receipts were due" } },
      select: { id: true },
    });
    if (sent) continue;
    await emitRetailNotification({
      companyId,
      recipientIds: [requisition.requestedById],
      type: "CRM_REQUISITION_DECIDED",
      title: receiptsOverdueTitle(requisition.requisitionNo ?? "Requisition", requisition.receiptsDueAt!, now),
      summary: "Account for it: what was spent, the receipt and any change.",
      entityType: "CRM_REQUISITION",
      entityId: requisition.id,
      viewPath: `/retail/buying/requisitions/${requisition.id}`,
      severity: "WARNING",
    });
    told += 1;
  }
  return told;
}

export async function runBuyingFollowUps(companyId: string, now: Date = new Date()): Promise<FollowUps> {
  const today = dayStart(dayKey(now));
  const due = await prisma.retailPurchaseOrder.findMany({
    where: {
      companyId,
      archivedAt: null,
      status: { in: ["SENT", "PARTIAL"] },
      chaseAction: { not: null },
      followUpDoneAt: null,
      expectedDate: { lt: today },
    },
    orderBy: { poNo: "asc" },
    select: { id: true, poNo: true, chaseAction: true, chasedById: true, expectedDate: true, vendor: { select: { name: true } } },
  });
  const done: FollowUps = { reminded: 0, cancelled: 0, receiptsOverdue: 0 };
  for (const order of due) {
    const claimed = await prisma.retailPurchaseOrder.updateMany({
      where: { id: order.id, followUpDoneAt: null, status: { in: ["SENT", "PARTIAL"] } },
      data: { followUpDoneAt: now },
    });
    if (claimed.count === 0) continue;
    if (order.chaseAction === "CANCEL_REST") {
      try {
        await cancelRest({ companyId, userId: null }, order.id, { automatic: true, now });
        done.cancelled += 1;
      } catch (error) {
        // Received or closed meanwhile: nothing is left to cancel.
        if (!(error instanceof OrderRefusal)) throw error;
      }
      continue;
    }
    if (order.chasedById) {
      await emitRetailNotification({
        companyId,
        recipientIds: [order.chasedById],
        type: "RETAIL_ORDER_FOLLOW_UP",
        title: `${order.poNo} has not come. ${order.vendor.name} promised it for ${order.expectedDate ? dayMonth(order.expectedDate) : "an earlier day"}.`,
        summary: "Send another reminder, or cancel what is left.",
        entityType: "RETAIL_PURCHASE_ORDER",
        entityId: order.id,
        viewPath: `/retail/buying/orders/${order.id}`,
      });
    }
    done.reminded += 1;
  }
  done.receiptsOverdue = await chaseReceipts(companyId, now);
  return done;
}

/** The worker's job: every shop with a chased order waiting on its follow-up. */
export async function runBuyingFollowUpsForAll(now: Date = new Date()): Promise<string> {
  const [chased, paidOut] = await Promise.all([
    prisma.retailPurchaseOrder.findMany({
      where: { chaseAction: { not: null }, followUpDoneAt: null, status: { in: ["SENT", "PARTIAL"] }, archivedAt: null },
      distinct: ["companyId"],
      select: { companyId: true },
    }),
    prisma.crmRequisition.findMany({
      where: { siteId: { not: null }, status: "DISBURSED", receiptsDueAt: { lt: dayStart(dayKey(now)) } },
      distinct: ["companyId"],
      select: { companyId: true },
    }),
  ]);
  const companies = [...new Set([...chased, ...paidOut].map((row) => row.companyId))];
  const total: FollowUps = { reminded: 0, cancelled: 0, receiptsOverdue: 0 };
  for (const companyId of companies) {
    const done = await runBuyingFollowUps(companyId, now);
    total.reminded += done.reminded;
    total.cancelled += done.cancelled;
    total.receiptsOverdue += done.receiptsOverdue;
  }
  return `${total.reminded} reminded, ${total.cancelled} cancelled, ${total.receiptsOverdue} told their receipts are late`;
}
