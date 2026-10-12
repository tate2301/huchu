import type { MoneyLike } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import type { FigureBill, FigureDelivery, FigureOrder, OrderState } from "./figures";

/**
 * What each supplier's figures are computed from (40-buying 3.2): its
 * orders, posted deliveries, bills and the credits against them. Orders and
 * deliveries name their supplier (BUY-02); bills, payments and credits arrive
 * with BUY-07 and return credits with BUY-09, so until then Owed reads 0.
 * A delivery line's VAT is its order line's, else its product's.
 */
export type SupplierActivity = {
  orders: FigureOrder[];
  deliveries: FigureDelivery[];
  bills: FigureBill[];
  credits: { payments: MoneyLike[]; returns: MoneyLike[] };
};

export const NO_ACTIVITY: SupplierActivity = { orders: [], deliveries: [], bills: [], credits: { payments: [], returns: [] } };

/** Each supplier's activity, by id. */
export async function supplierActivity(companyId: string, vendorIds: string[]): Promise<Map<string, SupplierActivity>> {
  const activity = new Map<string, SupplierActivity>(
    vendorIds.map((id) => [id, { orders: [], deliveries: [], bills: [], credits: { payments: [], returns: [] } }]),
  );
  if (vendorIds.length === 0) return activity;
  const [orders, receipts] = await Promise.all([
    prisma.retailPurchaseOrder.findMany({
      where: { companyId, vendorId: { in: vendorIds } },
      select: {
        vendorId: true,
        status: true,
        archivedAt: true,
        firstExpectedDate: true,
        closedAt: true,
        receipts: { where: { status: "POSTED" }, select: { postedAt: true } },
        lines: { select: { quantity: true, receivedQuantity: true, sentQuantity: true, unitCost: true, vatRate: true, closedShortAt: true } },
      },
    }),
    prisma.retailGoodsReceipt.findMany({
      where: { companyId, vendorId: { in: vendorIds }, status: "POSTED" },
      select: {
        vendorId: true,
        postedAt: true,
        createdAt: true,
        lines: {
          select: {
            quantity: true,
            unitCost: true,
            purchaseOrderLine: { select: { vatRate: true } },
            inventoryItem: { select: { product: { select: { defaultTaxRate: true } } } },
          },
        },
      },
    }),
  ]);
  for (const order of orders) {
    const last = order.receipts.reduce<Date | null>((latest, r) => (r.postedAt && (!latest || r.postedAt > latest) ? r.postedAt : latest), null);
    const state = order.status as OrderState;
    activity.get(order.vendorId)?.orders.push({
      state,
      binned: order.archivedAt !== null,
      firstExpectedDate: order.firstExpectedDate,
      lastDeliveryAt: last,
      doneAt: state === "CLOSED" ? order.closedAt : state === "RECEIVED" ? last : null,
      lines: order.lines.map((line) => ({
        quantity: line.quantity,
        receivedQuantity: line.receivedQuantity,
        sentQuantity: line.sentQuantity ?? line.quantity,
        unitCost: line.unitCost,
        vatRate: line.vatRate,
        closedShort: line.closedShortAt !== null,
      })),
    });
  }
  for (const receipt of receipts) {
    activity.get(receipt.vendorId)?.deliveries.push({
      postedAt: receipt.postedAt ?? receipt.createdAt,
      lines: receipt.lines.map((line) => ({
        quantity: line.quantity,
        unitCost: line.unitCost,
        vatRate: line.purchaseOrderLine?.vatRate ?? line.inventoryItem?.product?.defaultTaxRate ?? 0,
      })),
    });
  }
  return activity;
}
