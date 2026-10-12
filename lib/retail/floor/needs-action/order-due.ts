import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { orderTotals } from "@/lib/retail/buying/figures";
import { startOfDayIn } from "@/lib/reports/list-query";
import { DEFAULT_TIME_ZONE, formatCount, formatMoney } from "@/lib/workspace/format";

import type { NeedsActionProvider, NeedsActionRow } from "./types";
import { countTitle } from "./words";

/**
 * "Purchase order PO-0031 due today" (50-floor §4.1 row 8): orders expected
 * today that are still to come in full (sent or part delivered). One opens
 * its order; several open Orders.
 */
export function orderDueRow(orders: Array<{ id: string; poNo: string; supplier: string; lines: number; value: number }>): NeedsActionRow | null {
  if (orders.length === 0) return null;
  const total = orders.reduce((sum, order) => sum + order.value, 0);
  if (orders.length === 1) {
    const order = orders[0]!;
    return {
      key: "order-due",
      tone: "info",
      title: `Purchase order ${order.poNo} due today`,
      meta: `${order.supplier} · ${formatCount(order.lines)} ${order.lines === 1 ? "line" : "lines"} · not yet received`,
      figure: formatMoney(order.value),
      figureTone: "ink",
      href: `/retail/buying/orders/${order.id}`,
    };
  }
  return {
    key: "order-due",
    tone: "info",
    title: `${countTitle(orders.length, "purchase order", "purchase orders")} due today`,
    meta: [...new Set(orders.map((order) => order.supplier))].join(", "),
    figure: formatMoney(total),
    figureTone: "ink",
    href: "/retail/buying/orders?tab=open",
  };
}

export const orderDue: NeedsActionProvider = {
  key: "order-due",
  can: ["retail.purchasing", "view"],
  load: async (ctx) => {
    const end = startOfDayIn(ctx.tomorrow, DEFAULT_TIME_ZONE);
    const start = new Date(end.getTime() - 86_400_000);
    const due = await prisma.retailPurchaseOrder.findMany({
      where: {
        companyId: ctx.companyId,
        ...(ctx.siteIds ? { siteId: { in: ctx.siteIds } } : {}),
        archivedAt: null,
        status: { in: ["SENT", "PARTIAL"] },
        expectedDate: { gte: start, lt: end },
      },
      orderBy: { poNo: "asc" },
      select: { id: true, poNo: true, vendor: { select: { name: true } }, lines: { select: { quantity: true, unitCost: true, vatRate: true } } },
    });
    const row = orderDueRow(
      due.map((order) => ({
        id: order.id,
        poNo: order.poNo,
        supplier: order.vendor.name,
        lines: order.lines.length,
        value: toNumberOrZero(orderTotals(order.lines).total),
      })),
    );
    return row ? [row] : [];
  },
};
