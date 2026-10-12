import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/workspace/format";

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
 */

export type FollowUps = { reminded: number; cancelled: number };

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
  const done: FollowUps = { reminded: 0, cancelled: 0 };
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
  return done;
}

/** The worker's job: every shop with a chased order waiting on its follow-up. */
export async function runBuyingFollowUpsForAll(now: Date = new Date()): Promise<string> {
  const companies = await prisma.retailPurchaseOrder.findMany({
    where: { chaseAction: { not: null }, followUpDoneAt: null, status: { in: ["SENT", "PARTIAL"] }, archivedAt: null },
    distinct: ["companyId"],
    select: { companyId: true },
  });
  const total: FollowUps = { reminded: 0, cancelled: 0 };
  for (const { companyId } of companies) {
    const done = await runBuyingFollowUps(companyId, now);
    total.reminded += done.reminded;
    total.cancelled += done.cancelled;
  }
  return `${total.reminded} reminded, ${total.cancelled} cancelled`;
}
