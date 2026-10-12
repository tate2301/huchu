import { Prisma } from "@prisma/client";

import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, multiplyMoney, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditGoodsReceived, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { isOpenForDelivery, matchDeliveryToOrder, orderStatusFor, outstanding } from "@/lib/retail/purchase-orders";

/**
 * Receiving a delivery (40-buying W-33), first layer (BUY-02): the body of
 * the old `POST /purchasing/receipts`, moved into a service unchanged in
 * behaviour. A delivery is posted at once: stock comes in as `RECEIPT`
 * movements (reason `RECEIVED`), the order's lines fill through
 * `matchDeliveryToOrder` and its state follows `orderStatusFor`; the journal
 * (Dr Inventory / Cr GRNI) is posted after the goods commit. Receiving a draft
 * marks it sent by hand first: the supplier had it. The Receive page (BUY-06)
 * grows this into count and check.
 */

export class DeliveryRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "DeliveryRefusal";
  }
}

export type DeliveryLineInput = {
  inventoryItemId: string;
  quantity: number;
  unitCost: number;
  locationId?: string | null;
  /** The order line this fills, when the form knew it. */
  purchaseOrderLineId?: string | null;
};

export type DeliveryInput = {
  receiptNo?: string;
  purchaseOrderId?: string | null;
  siteId: string;
  /** The supplier; an order's own wins. Required with no order. */
  vendorId?: string | null;
  notes?: string | null;
  lines: DeliveryLineInput[];
  /** The order is complete with this delivery: stop waiting for whatever it still owes. */
  closeRest?: boolean;
  periodOverrideReason?: string | null;
  /** When it came (the seed's dates); now when absent. */
  at?: Date;
};

/** How the delivery's journal goes to the books: the retail routes' `postRetailJournal`. */
export type PostJournal = (input: {
  companyId: string;
  sourceType: "RETAIL_GOODS_RECEIPT";
  sourceId: string;
  sourceSubtype: string;
  siteId: string;
  entryDate: Date;
  description: string;
  createdById: string;
  actorRole?: string | null;
  periodOverrideReason: string | null;
  amount: number;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  inventory: {
    lines: Array<{ inventoryItemId: string; itemName: string; quantity: number; unitCost: number; totalCost: number }>;
    totalCost: number;
  };
}) => Promise<{ accountingStatus: string; accountingError: string | null }>;

const RECEIPT_INCLUDE = { lines: true } satisfies Prisma.RetailGoodsReceiptInclude;
export type ReceivedDelivery = Prisma.RetailGoodsReceiptGetPayload<{ include: typeof RECEIPT_INCLUDE }> & {
  accountingStatus: string;
  accountingError: string | null;
};

/** Post a delivery to stock. Throws `DeliveryRefusal` (and `OrderRefused` from the order rules). */
export async function receiveDelivery(actor: RetailAuditActor, input: DeliveryInput, post: PostJournal): Promise<ReceivedDelivery> {
  const companyId = actor.companyId;
  const at = input.at ?? new Date();
  if (input.lines.length === 0) throw new DeliveryRefusal(400, "Add at least one line.");

  const purchaseOrder = input.purchaseOrderId
    ? await prisma.retailPurchaseOrder.findFirst({
        where: { id: input.purchaseOrderId, companyId, archivedAt: null },
        include: { lines: true },
      })
    : null;
  if (input.purchaseOrderId && !purchaseOrder) throw new DeliveryRefusal(404, "Purchase order not found");
  if (purchaseOrder && !isOpenForDelivery(purchaseOrder.status)) {
    throw new DeliveryRefusal(
      409,
      purchaseOrder.status === "CLOSED"
        ? `${purchaseOrder.poNo} is closed. Reopen it to book a delivery against it.`
        : purchaseOrder.status === "CANCELLED"
          ? `${purchaseOrder.poNo} was cancelled.`
          : `Everything on ${purchaseOrder.poNo} has already come.`,
    );
  }
  if (purchaseOrder && purchaseOrder.siteId !== input.siteId) throw new DeliveryRefusal(409, `${purchaseOrder.poNo} is for another branch.`);

  const vendorId = purchaseOrder?.vendorId ?? input.vendorId ?? null;
  if (!vendorId) throw new DeliveryRefusal(400, "Say who it came from.");
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, companyId }, select: { id: true, name: true } });
  if (!vendor) throw new DeliveryRefusal(404, "Supplier not found");

  const normalizedLines = await Promise.all(
    input.lines.map(async (line) => {
      if (!(line.quantity > 0)) throw new DeliveryRefusal(400, "Each line needs a quantity.");
      if (!(line.unitCost >= 0)) throw new DeliveryRefusal(400, "Each line needs a cost.");
      const inventoryItem = await prisma.inventoryItem.findFirst({
        where: { id: line.inventoryItemId, site: { companyId } },
        select: { id: true, name: true, unit: true, siteId: true, locationId: true },
      });
      if (!inventoryItem) throw new DeliveryRefusal(400, "One of the selected inventory items is invalid.");
      const locationId = line.locationId ?? inventoryItem.locationId;
      if (!locationId) throw new DeliveryRefusal(400, `No stock location is configured for ${inventoryItem.name}.`);
      const location = await prisma.stockLocation.findFirst({
        where: { id: locationId, siteId: inventoryItem.siteId, isActive: true },
        select: { id: true },
      });
      if (!location) throw new DeliveryRefusal(400, "Invalid stock location.");
      return {
        inventoryItem,
        locationId: location.id,
        quantity: line.quantity,
        unitCost: line.unitCost,
        purchaseOrderLineId: line.purchaseOrderLineId ?? null,
      };
    }),
  );

  const providedCode = input.receiptNo ? normalizeProvidedId(input.receiptNo, "RETAIL_GOODS_RECEIPT") : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Outside the transaction: a rolled-back sequence would hand the number out
    // twice, and a caught P2002 inside a Postgres transaction aborts it.
    const receiptNo = providedCode ?? (await reserveIdentifier(prisma, { companyId, entity: "RETAIL_GOODS_RECEIPT" }));
    try {
      // Everything that is a fact about the goods, in one transaction.
      const receipt = await prisma.$transaction(async (tx) => {
        // Matched against the order as it is now, so two deliveries booked at
        // once cannot both fill the same shortfall.
        const orderLines = purchaseOrder
          ? await tx.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: purchaseOrder.id }, orderBy: { sortOrder: "asc" } })
          : [];
        const matched = purchaseOrder
          ? matchDeliveryToOrder(
              orderLines,
              normalizedLines.map((line) => ({
                inventoryItemId: line.inventoryItem.id,
                quantity: line.quantity,
                purchaseOrderLineId: line.purchaseOrderLineId,
              })),
            )
          : normalizedLines.map(() => null);

        const created = await tx.retailGoodsReceipt.create({
          data: {
            companyId,
            receiptNo,
            purchaseOrderId: purchaseOrder?.id ?? null,
            siteId: input.siteId,
            vendorId: vendor.id,
            status: "POSTED",
            notes: input.notes?.trim() || null,
            receivedById: actor.userId,
            createdAt: at,
            postedAt: at,
            lines: {
              create: normalizedLines.map((line, index) => ({
                companyId,
                inventoryItemId: line.inventoryItem.id,
                purchaseOrderLineId: matched[index],
                itemName: line.inventoryItem.name,
                quantity: line.quantity,
                unitCost: line.unitCost,
                lineTotal: multiplyMoney(money(line.quantity), money(line.unitCost)),
              })),
            },
          },
          include: RECEIPT_INCLUDE,
        });

        for (const line of normalizedLines) {
          await recordStockMovement({
            companyId,
            userId: actor.userId,
            itemId: line.inventoryItem.id,
            movementType: "RECEIPT",
            quantity: line.quantity,
            unit: line.inventoryItem.unit,
            unitCost: line.unitCost,
            toLocationId: line.locationId,
            notes: `Retail receipt ${created.receiptNo}`,
            sourceType: "RETAIL_GOODS_RECEIPT",
            reason: "RECEIVED",
            reference: created.receiptNo,
            sourceId: `${created.id}:${line.inventoryItem.id}`,
            entryDate: at,
            tx,
          });
        }

        if (purchaseOrder) {
          // A draft taken in was in the supplier's hands: sent by hand.
          if (purchaseOrder.status === "DRAFT") {
            await tx.retailPurchaseOrder.update({
              where: { id: purchaseOrder.id },
              data: {
                sentAt: at,
                sentById: actor.userId,
                sentVia: "BY_HAND",
                firstExpectedDate: purchaseOrder.firstExpectedDate ?? purchaseOrder.expectedDate,
              },
            });
            for (const line of orderLines) {
              await tx.retailPurchaseOrderLine.update({ where: { id: line.id }, data: { sentQuantity: line.quantity } });
            }
          }
          for (const [index, line] of normalizedLines.entries()) {
            const orderLineId = matched[index];
            if (!orderLineId) continue;
            const orderLine = orderLines.find((row) => row.id === orderLineId)!;
            await tx.retailPurchaseOrderLine.update({
              where: { id: orderLineId },
              data: {
                receivedQuantity: { increment: line.quantity },
                // A line ordered by name becomes the product that came.
                ...(orderLine.inventoryItemId ? {} : { inventoryItemId: line.inventoryItem.id }),
              },
            });
          }

          const refreshedLines = await tx.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: purchaseOrder.id } });
          const status = orderStatusFor(refreshedLines, { closed: false, sent: true });
          const closing = input.closeRest === true && status === "PARTIAL";
          if (closing) {
            const owed = refreshedLines.filter((line) => outstanding(line).greaterThan(0));
            await tx.retailPurchaseOrderLine.updateMany({
              where: { id: { in: owed.map((line) => line.id) } },
              data: { closedShortAt: at, closedShortById: actor.userId },
            });
            await tx.retailPurchaseOrder.update({
              where: { id: purchaseOrder.id },
              data: { status: "CLOSED", closedAt: at, closedById: actor.userId, closeNote: `Closed on delivery ${receiptNo}` },
            });
            await writeRetailAuditEvent(tx, {
              actor,
              eventType: RETAIL_AUDIT_EVENTS.orderClosed,
              entityType: "RetailPurchaseOrder",
              entityId: purchaseOrder.id,
              reason: `Closed on delivery ${receiptNo}`,
              payload: {
                poNo: purchaseOrder.poNo,
                supplier: vendor.name,
                owed: owed.map((line) => ({ itemName: line.itemName, quantity: outstanding(line).toString() })),
              },
            });
          } else {
            await tx.retailPurchaseOrder.update({ where: { id: purchaseOrder.id }, data: { status } });
          }
        }

        // Receiving is where cost enters the shop: who booked it, at what value.
        await auditGoodsReceived(tx, {
          actor,
          receiptId: created.id,
          receiptNo: created.receiptNo,
          purchaseOrderId: created.purchaseOrderId,
          siteId: created.siteId,
          supplier: vendor.name,
          totalValue: sumMoney(created.lines.map((line) => line.lineTotal)),
          lineCount: created.lines.length,
          units: toNumberOrZero(sumMoney(created.lines.map((line) => line.quantity))),
        });

        return created;
      });

      // After the goods commit: a locked period is not a reason to refuse a delivery that arrived.
      const receiptValue = toNumberOrZero(sumMoney(receipt.lines.map((line) => line.lineTotal)));
      const accounting =
        receiptValue > 0
          ? await post({
              companyId,
              sourceType: "RETAIL_GOODS_RECEIPT",
              sourceId: receipt.id,
              sourceSubtype: "RECEIPT",
              siteId: receipt.siteId,
              entryDate: at,
              description: `Retail goods receipt ${receipt.receiptNo}`,
              createdById: actor.userId,
              actorRole: actor.userRole ?? null,
              periodOverrideReason: input.periodOverrideReason ?? null,
              amount: receiptValue,
              netAmount: receiptValue,
              taxAmount: 0,
              grossAmount: receiptValue,
              inventory: {
                lines: receipt.lines.map((line) => ({
                  inventoryItemId: line.inventoryItemId,
                  itemName: line.itemName,
                  quantity: toNumberOrZero(line.quantity),
                  unitCost: toNumberOrZero(line.unitCost),
                  totalCost: toNumberOrZero(line.lineTotal),
                })),
                totalCost: receiptValue,
              },
            })
          : { accountingStatus: "POSTED", accountingError: null };

      return { ...receipt, ...accounting };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (providedCode) throw new DeliveryRefusal(409, "Receipt number already exists");
        continue;
      }
      throw error;
    }
  }
  throw new DeliveryRefusal(409, "Unable to generate receipt number");
}
