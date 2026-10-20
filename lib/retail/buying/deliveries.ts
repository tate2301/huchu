import { Prisma, type RetailDeliveryPaying } from "@prisma/client";

import { draftBillFromGoodsReceipt } from "@/lib/books/core/bills";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, multiplyMoney, quantity as units, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { notifyApprover } from "@/lib/retail/approvals/notify";
import {
  auditGoodsReceived,
  auditRecordEdited,
  RETAIL_AUDIT_EVENTS,
  writeRetailAuditEvent,
  type RetailAuditActor,
} from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { repriceCostFollowers } from "@/lib/retail/prices/change";
import { matchDeliveryToOrder, OrderRefused, orderStatusFor, outstanding } from "@/lib/retail/purchase-orders";
import { bookEmptiesReturn } from "@/lib/retail/stock/empties";

import { recordAttachment, type UploadedFile } from "./attachments";

/**
 * Receiving a delivery (40-buying W-33, BUY-06): count what came, put
 * breakages aside, keep or close the rest, post to stock.
 *
 * A delivery is counted first (`COUNTED`: nothing has moved) and posted by
 * someone who may approve buying (`POSTED`). An owner or manager does both
 * at once and is counter and checker; a stock clerk's count waits for them
 * ("Send for checking"), who are told. Posting (`postDelivery`) runs against
 * the order as it is then, under the order's and the delivery's row locks:
 *
 * - stock in is what came less what came broken (`quantity`), at the
 *   delivered cost, as `RECEIPT` movements (reason `RECEIVED`) under the GRN
 *   number. **Damaged units never enter stock**: each damaged line becomes a
 *   `BROKEN` difference at receiving (settled by a credit), claimed from the
 *   supplier, and is in neither stock nor GRNI;
 * - the order counts what came, damaged included (it was delivered, and is
 *   claimed): `receivedQuantity += this time`; lines marked Close stop being
 *   expected, and the order closes when every remaining line was closed;
 * - the stock line's and the product's cost become the delivered cost (cost
 *   followers priced again), and a product with no supplier gets this one;
 * - crates sent back with the driver go on the Empties ledger.
 *
 * The GRN number is reserved outside the transaction; the journal (Dr Stock,
 * Cr 2300 GRNI at Σ quantity × cost ex VAT) goes after the goods commit.
 */

type Tx = Prisma.TransactionClient;

export class DeliveryRefusal extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "DeliveryRefusal";
  }
}

/** The refusal a role that may count but not post gets for `post: true`. */
export const CANNOT_POST = "Your role cannot approve purchase orders";

/** Whether this person may post a delivery to stock (owner, manager). */
export const mayPost = (actor: Pick<RetailAuditActor, "userRole">) => canRetailRoleDo(actor.userRole, "retail.purchasing", "approve");

export const alreadyInStock = (receiptNo: string) => `${receiptNo} is already in stock.`;

export type DeliveryLineInput = {
  inventoryItemId: string;
  /** "This time": what came, damaged included. */
  quantity: number;
  /** Of what came, broken at the door. */
  damaged?: number;
  /** Ex VAT. Absent on a line the order did not have: the stock line's cost. */
  unitCost?: number | null;
  /** The order line this fills, when the page knew it. */
  purchaseOrderLineId?: string | null;
  /** What happens to whatever is still to come on its order line once posted. */
  rest?: "KEEP" | "CLOSE";
  locationId?: string | null;
};

export type DeliveryInput = {
  receiptNo?: string;
  purchaseOrderId?: string | null;
  /** With no order: where it came in, and who from. An order's own win. */
  siteId?: string | null;
  supplierId?: string | null;
  noteNumber?: string | null;
  driver?: string | null;
  /** "Counted by"; the one booking it when absent. */
  countedById?: string | null;
  /** The signed delivery note, as the attachments route answered it. */
  photo?: UploadedFile | null;
  /** Crates going back with the driver (a liquor store taking deposits). */
  empties?: { crates: number } | null;
  /** "Paid in cash instead?": a paid-out requisition for this supplier. */
  requisitionId?: string | null;
  paying?: RetailDeliveryPaying | null;
  notes?: string | null;
  lines: DeliveryLineInput[];
  /** Post to stock now (owner, manager); false: counted, for checking. */
  post: boolean;
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

/** What `POST /deliveries` and the posting routes answer (40-buying 4.4). */
export type DeliveryOutcome = {
  id: string;
  receiptNo: string;
  status: "COUNTED" | "POSTED";
  /** Units into stock (posted), or counted. */
  units: number;
  /** Σ quantity × cost ex VAT. */
  value: number;
  /** Units still to come on its order after this; 0 with no order. */
  stillOnOrder: number;
  orderClosed: boolean;
  /** Counting only: who was told to check and post it ("Tafara Nyathi or Tendai Mhlanga"). */
  checkers: string[];
  accountingStatus: string;
  accountingError: string | null;
};

type OrderState = { poNo: string; status: string };

/** Refuses an order no delivery can be booked against now. */
function assertReceivable(order: OrderState) {
  if (order.status === "CLOSED") throw new DeliveryRefusal(409, `${order.poNo} is closed. Reopen it to book a delivery against it.`);
  if (order.status === "CANCELLED") throw new DeliveryRefusal(409, `${order.poNo} was cancelled.`);
  if (order.status === "RECEIVED") throw new DeliveryRefusal(409, `Everything on ${order.poNo} has already come.`);
}

/** Matched against the order's lines, its sentences as 409s. */
function matched(orderLines: Parameters<typeof matchDeliveryToOrder>[0], delivered: Parameters<typeof matchDeliveryToOrder>[1]) {
  try {
    return matchDeliveryToOrder(orderLines, delivered);
  } catch (error) {
    if (error instanceof OrderRefused) throw new DeliveryRefusal(409, error.message);
    throw error;
  }
}

const lockOrder = (tx: Tx, id: string) => tx.$queryRaw`SELECT "id" FROM "RetailPurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
const lockReceipt = (tx: Tx, id: string) => tx.$queryRaw`SELECT "id" FROM "RetailGoodsReceipt" WHERE "id" = ${id} FOR UPDATE`;

/* ── Count, and post when allowed (POST /deliveries) ────────────────────── */

export async function receiveDelivery(actor: RetailAuditActor, input: DeliveryInput, post: PostJournal): Promise<DeliveryOutcome> {
  const companyId = actor.companyId;
  const at = input.at ?? new Date();
  if (input.post && !mayPost(actor)) throw new DeliveryRefusal(403, CANNOT_POST);
  for (const line of input.lines) {
    if (!(line.quantity >= 0)) throw new DeliveryRefusal(400, "Each line needs what came.");
    if (!((line.damaged ?? 0) >= 0)) throw new DeliveryRefusal(400, "Damaged cannot be below nothing.");
    if (line.unitCost !== undefined && line.unitCost !== null && !(line.unitCost >= 0)) throw new DeliveryRefusal(400, "Each line needs a cost.");
  }
  const coming = input.lines.filter((line) => line.quantity > 0);
  if (coming.length === 0) throw new DeliveryRefusal(400, "Nothing is counted yet. Type what came on at least one line.");

  const purchaseOrder = input.purchaseOrderId
    ? await prisma.retailPurchaseOrder.findFirst({
        where: { id: input.purchaseOrderId, companyId, archivedAt: null },
        select: { id: true, poNo: true, status: true, siteId: true, vendorId: true },
      })
    : null;
  if (input.purchaseOrderId && !purchaseOrder) throw new DeliveryRefusal(404, "Purchase order not found");
  if (purchaseOrder) {
    assertReceivable(purchaseOrder);
    if (input.siteId && input.siteId !== purchaseOrder.siteId) throw new DeliveryRefusal(409, `${purchaseOrder.poNo} is for another branch.`);
  }
  const siteId = purchaseOrder?.siteId ?? input.siteId ?? null;
  if (!siteId) throw new DeliveryRefusal(400, "Say where it came in.");
  const site = await prisma.site.findFirst({ where: { id: siteId, companyId }, select: { id: true, name: true } });
  if (!site) throw new DeliveryRefusal(404, "Site not found");

  const vendorId = purchaseOrder?.vendorId ?? input.supplierId ?? null;
  if (!vendorId) throw new DeliveryRefusal(400, "Say who it came from.");
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, companyId }, select: { id: true, name: true } });
  if (!vendor) throw new DeliveryRefusal(404, "Supplier not found");

  const countedById = input.countedById || actor.userId;
  const counter = await prisma.user.findFirst({ where: { id: countedById, companyId }, select: { id: true } });
  if (!counter) throw new DeliveryRefusal(400, "Say who counted it.");

  if (input.requisitionId) {
    const requisition = await prisma.crmRequisition.findFirst({
      where: { id: input.requisitionId, companyId, siteId: { not: null } },
      select: { requisitionNo: true, status: true, payeeVendorId: true, purchaseOrderId: true, deliveries: { select: { id: true }, take: 1 } },
    });
    if (!requisition) throw new DeliveryRefusal(404, "Requisition not found");
    if (requisition.status !== "DISBURSED") throw new DeliveryRefusal(409, `${requisition.requisitionNo} has not been paid out.`);
    const forThem = requisition.payeeVendorId === vendor.id || (purchaseOrder !== null && requisition.purchaseOrderId === purchaseOrder.id);
    if (!forThem) throw new DeliveryRefusal(409, `${requisition.requisitionNo} is not money for ${vendor.name}.`);
    if (requisition.deliveries.length > 0) throw new DeliveryRefusal(409, `${requisition.requisitionNo} already pays for another delivery.`);
  }

  const normalized = await Promise.all(
    input.lines.map(async (line) => {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: line.inventoryItemId, site: { companyId } },
        select: {
          id: true,
          name: true,
          siteId: true,
          locationId: true,
          unitCost: true,
          product: { select: { name: true, costPrice: true, defaultTaxRate: true } },
        },
      });
      if (!item) throw new DeliveryRefusal(400, "One of the products is not kept here.");
      const name = item.product?.name ?? item.name;
      if (item.siteId !== siteId) throw new DeliveryRefusal(400, `${name} is not kept at ${site.name}.`);
      const damaged = line.damaged ?? 0;
      if (damaged > line.quantity) throw new DeliveryRefusal(400, `More damaged than came on ${name}.`);
      const locationId = line.locationId ?? item.locationId;
      if (line.quantity > 0) {
        if (!locationId) throw new DeliveryRefusal(400, `No stock location is configured for ${name}.`);
        const location = await prisma.stockLocation.findFirst({ where: { id: locationId, siteId: item.siteId, isActive: true }, select: { id: true } });
        if (!location) throw new DeliveryRefusal(400, "Invalid stock location.");
      }
      const unitCost = money(line.unitCost ?? item.unitCost ?? item.product?.costPrice ?? 0);
      return {
        inventoryItemId: item.id,
        name,
        quantity: line.quantity,
        damaged,
        unitCost,
        vatRate: item.product?.defaultTaxRate ?? new Prisma.Decimal(0),
        purchaseOrderLineId: line.purchaseOrderLineId ?? null,
        close: line.rest === "CLOSE",
      };
    }),
  );
  const inLines = normalized.filter((line) => line.quantity > 0);

  const providedCode = input.receiptNo ? normalizeProvidedId(input.receiptNo, "RETAIL_GOODS_RECEIPT") : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Outside the transaction: a rolled-back sequence would hand the number out
    // twice, and a caught P2002 inside a Postgres transaction aborts it.
    const receiptNo = providedCode ?? (await reserveIdentifier(prisma, { companyId, entity: "RETAIL_GOODS_RECEIPT" }));
    try {
      const outcome = await prisma.$transaction(
        async (tx) => {
          let fills: Array<string | null> = inLines.map(() => null);
          const close = new Set<string>();
          if (purchaseOrder) {
            // Matched against the order as it is now, under its lock, so two
            // deliveries booked at once cannot both fill the same shortfall.
            await lockOrder(tx, purchaseOrder.id);
            const now = await tx.retailPurchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrder.id }, select: { poNo: true, status: true } });
            assertReceivable(now);
            const orderLines = await tx.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: purchaseOrder.id }, orderBy: { sortOrder: "asc" } });
            fills = matched(
              orderLines,
              inLines.map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: line.quantity, purchaseOrderLineId: line.purchaseOrderLineId })),
            );
            const ids = new Set(orderLines.map((line) => line.id));
            inLines.forEach((line, index) => {
              if (line.close && fills[index]) close.add(fills[index]!);
            });
            for (const line of normalized) {
              if (line.close && line.quantity === 0 && line.purchaseOrderLineId && ids.has(line.purchaseOrderLineId)) close.add(line.purchaseOrderLineId);
            }
          }

          const created = await tx.retailGoodsReceipt.create({
            data: {
              companyId,
              receiptNo,
              purchaseOrderId: purchaseOrder?.id ?? null,
              siteId,
              vendorId: vendor.id,
              status: "COUNTED",
              notes: input.notes?.trim() || null,
              noteNumber: input.noteNumber?.trim() || null,
              driver: input.driver?.trim() || null,
              receivedById: actor.userId,
              countedById,
              paying: input.paying ?? null,
              requisitionId: input.requisitionId ?? null,
              createdAt: at,
              lines: {
                create: inLines.map((line, index) => {
                  const inStock = units(line.quantity).minus(line.damaged);
                  return {
                    companyId,
                    inventoryItemId: line.inventoryItemId,
                    purchaseOrderLineId: fills[index] ?? null,
                    itemName: line.name,
                    noteQuantity: line.quantity,
                    damagedQuantity: line.damaged,
                    quantity: inStock,
                    unitCost: line.unitCost,
                    vatRate: line.vatRate,
                    lineTotal: multiplyMoney(inStock, line.unitCost),
                  };
                }),
              },
            },
            include: { lines: true },
          });
          if (input.photo) {
            await recordAttachment(tx, actor, { entityType: "RetailGoodsReceipt", entityId: created.id, kind: "DELIVERY_NOTE", file: input.photo });
          }

          if (input.post) return postDelivery(tx, actor, created.id, { close, empties: input.empties ?? null, at });

          await writeRetailAuditEvent(tx, {
            actor,
            eventType: RETAIL_AUDIT_EVENTS.goodsCounted,
            entityType: "RetailGoodsReceipt",
            entityId: created.id,
            payload: {
              receiptNo,
              supplier: vendor.name,
              purchaseOrderId: purchaseOrder?.id ?? null,
              units: toNumberOrZero(sumMoney(created.lines.map((line) => line.noteQuantity))),
            },
          });
          return {
            id: created.id,
            receiptNo,
            status: "COUNTED" as const,
            units: toNumberOrZero(sumMoney(created.lines.map((line) => line.noteQuantity))),
            value: toNumberOrZero(sumMoney(created.lines.map((line) => line.lineTotal))),
            stillOnOrder: 0,
            orderClosed: false,
            siteId,
          };
        },
        { timeout: 30_000 },
      );

      if (outcome.status === "POSTED") {
        const accounting = await postReceiptJournal(actor, outcome.id, at, input.periodOverrideReason ?? null, post);
        return { ...outcome, checkers: [], ...accounting };
      }
      const checkers = await tellCheckers(actor, { id: outcome.id, receiptNo, supplier: vendor.name, siteId });
      return { ...outcome, checkers, accountingStatus: "NOT_POSTED", accountingError: null };
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

/** Owners and managers of the site are told a counted delivery waits for them; their names, for "Tafara Nyathi or Tendai Mhlanga will post it." */
async function tellCheckers(actor: RetailAuditActor, delivery: { id: string; receiptNo: string; supplier: string; siteId: string }): Promise<string[]> {
  const told = await notifyApprover({
    companyId: actor.companyId,
    level: "manager",
    siteId: delivery.siteId,
    type: "RETAIL_DELIVERY_TO_CHECK",
    title: `${delivery.receiptNo} is waiting to be checked`,
    summary: `${delivery.receiptNo} from ${delivery.supplier} is counted and waiting to be checked.`,
    entityType: "RETAIL_GOODS_RECEIPT",
    entityId: delivery.id,
    viewPath: `/retail/buying/deliveries/${delivery.id}`,
    severity: "INFO",
    askedById: actor.userId,
  });
  if (told.recipientIds.length === 0) return [];
  const people = await prisma.user.findMany({ where: { id: { in: told.recipientIds } }, select: { id: true, name: true } });
  return told.recipientIds.map((id) => people.find((person) => person.id === id)?.name ?? "").filter(Boolean);
}

/* ── Post (the posting half; POST /deliveries/[id]/post) ────────────────── */

export type PostOptions = {
  /** Order lines whose rest stops being expected. */
  close?: ReadonlySet<string>;
  empties?: { crates: number } | null;
  at?: Date;
};

type Posted = {
  id: string;
  receiptNo: string;
  status: "POSTED";
  units: number;
  value: number;
  stillOnOrder: number;
  orderClosed: boolean;
  siteId: string;
};

const readOrder = (tx: Tx, id: string) =>
  tx.retailPurchaseOrder.findUniqueOrThrow({
    where: { id },
    select: { id: true, poNo: true, status: true, firstExpectedDate: true, expectedDate: true, lines: { orderBy: { sortOrder: "asc" } } },
  });

/**
 * Posts a counted delivery in the caller's transaction, against its order as
 * it is now; the poster is its checker. Refuses one already in stock (409).
 */
export async function postDelivery(tx: Tx, actor: RetailAuditActor, receiptId: string, options: PostOptions = {}): Promise<Posted> {
  const companyId = actor.companyId;
  const at = options.at ?? new Date();
  await lockReceipt(tx, receiptId);
  const receipt = await tx.retailGoodsReceipt.findFirst({
    where: { id: receiptId, companyId },
    include: {
      lines: { orderBy: { createdAt: "asc" }, include: { inventoryItem: { select: { unit: true, locationId: true, productId: true } } } },
      vendor: { select: { id: true, name: true } },
    },
  });
  if (!receipt) throw new DeliveryRefusal(404, "Delivery not found");
  if (receipt.status !== "COUNTED") throw new DeliveryRefusal(409, alreadyInStock(receipt.receiptNo));

  let order: Awaited<ReturnType<typeof readOrder>> | null = null;
  if (receipt.purchaseOrderId) {
    await lockOrder(tx, receipt.purchaseOrderId);
    order = await readOrder(tx, receipt.purchaseOrderId);
    assertReceivable(order);
    // What it fills must still be owed now (another delivery may have come since it was counted).
    const filling = receipt.lines.filter((line) => line.purchaseOrderLineId);
    matched(
      order.lines,
      filling.map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: toNumberOrZero(line.noteQuantity), purchaseOrderLineId: line.purchaseOrderLineId })),
    );
  }

  await tx.retailGoodsReceipt.update({
    where: { id: receipt.id },
    data: { status: "POSTED", checkedById: actor.userId, checkedAt: at, postedAt: at },
  });

  // Stock: what came less what came broken.
  for (const line of receipt.lines) {
    if (!line.quantity.greaterThan(0)) continue;
    if (!line.inventoryItem.locationId) throw new DeliveryRefusal(400, `No stock location is configured for ${line.itemName}.`);
    await recordStockMovement({
      companyId,
      userId: actor.userId,
      itemId: line.inventoryItemId,
      movementType: "RECEIPT",
      quantity: line.quantity,
      unit: line.inventoryItem.unit,
      unitCost: line.unitCost,
      toLocationId: line.inventoryItem.locationId,
      notes: `Retail receipt ${receipt.receiptNo}`,
      sourceType: "RETAIL_GOODS_RECEIPT",
      reason: "RECEIVED",
      reference: receipt.receiptNo,
      sourceId: `${receipt.id}:${line.inventoryItemId}`,
      entryDate: at,
      tx,
    });
  }

  // Cost: the stock line and the product cost what was paid this time; a product with no supplier gets this one.
  for (const line of receipt.lines) {
    await tx.inventoryItem.update({ where: { id: line.inventoryItemId }, data: { unitCost: line.unitCost } });
    const productId = line.inventoryItem.productId;
    if (!productId) continue;
    const product = await tx.product.findUnique({ where: { id: productId }, select: { costPrice: true, supplierId: true } });
    if (!product) continue;
    const moved = !product.costPrice || !product.costPrice.equals(line.unitCost);
    await tx.product.update({ where: { id: productId }, data: { costPrice: line.unitCost, ...(product.supplierId ? {} : { supplierId: receipt.vendorId }) } });
    if (moved) await repriceCostFollowers(tx, companyId, productId, actor);
  }

  let stillOnOrder = 0;
  let orderClosed = false;
  if (order) {
    // A draft taken in was in the supplier's hands: sent by hand.
    if (order.status === "DRAFT") {
      await tx.retailPurchaseOrder.update({
        where: { id: order.id },
        data: { sentAt: at, sentById: actor.userId, sentVia: "BY_HAND", firstExpectedDate: order.firstExpectedDate ?? order.expectedDate },
      });
      for (const line of order.lines) await tx.retailPurchaseOrderLine.update({ where: { id: line.id }, data: { sentQuantity: line.quantity } });
    }
    // The order counts what came, damaged included: it was delivered, and is claimed.
    for (const line of receipt.lines) {
      if (!line.purchaseOrderLineId) continue;
      const orderLine = order.lines.find((row) => row.id === line.purchaseOrderLineId);
      await tx.retailPurchaseOrderLine.update({
        where: { id: line.purchaseOrderLineId },
        data: { receivedQuantity: { increment: line.noteQuantity }, ...(orderLine && !orderLine.inventoryItemId ? { inventoryItemId: line.inventoryItemId } : {}) },
      });
    }
    let refreshed = await tx.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id }, orderBy: { sortOrder: "asc" } });
    const closing = refreshed.filter((line) => options.close?.has(line.id) && outstanding(line).greaterThan(0));
    if (closing.length > 0) {
      await tx.retailPurchaseOrderLine.updateMany({ where: { id: { in: closing.map((line) => line.id) } }, data: { closedShortAt: at, closedShortById: actor.userId } });
      refreshed = await tx.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id }, orderBy: { sortOrder: "asc" } });
    }
    const status = orderStatusFor(refreshed, { closed: false, sent: true });
    if (status === "CLOSED") {
      orderClosed = true;
      await tx.retailPurchaseOrder.update({
        where: { id: order.id },
        data: { status, closedAt: at, closedById: actor.userId, closeNote: `Closed on delivery ${receipt.receiptNo}` },
      });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.orderClosed,
        entityType: "RetailPurchaseOrder",
        entityId: order.id,
        reason: `Closed on delivery ${receipt.receiptNo}`,
        payload: {
          poNo: order.poNo,
          supplier: receipt.vendor.name,
          owed: closing.map((line) => ({ itemName: line.itemName, quantity: outstanding({ ...line, closedShortAt: null }).toString() })),
        },
      });
    } else {
      await tx.retailPurchaseOrder.update({ where: { id: order.id }, data: { status } });
      stillOnOrder = toNumberOrZero(sumMoney(refreshed.map((line) => outstanding(line))));
    }
  }

  // What came broken is a claim on the supplier: never stock, never GRNI.
  for (const line of receipt.lines) {
    if (!line.damagedQuantity.greaterThan(0)) continue;
    await tx.retailDeliveryDifference.create({
      data: {
        companyId,
        receiptId: receipt.id,
        receiptLineId: line.id,
        kind: "BROKEN",
        quantity: line.damagedQuantity.negated(),
        value: multiplyMoney(line.damagedQuantity, line.unitCost),
        settle: "CREDIT",
        atReceiving: true,
        createdById: actor.userId,
        createdAt: at,
      },
    });
  }

  if (options.empties && options.empties.crates > 0) {
    await bookEmptiesReturn(tx, {
      actor: { ...actor, userName: actor.userName ?? null },
      siteId: receipt.siteId,
      supplierId: receipt.vendorId,
      bottles: 0,
      crates: options.empties.crates,
      goodsReceiptId: receipt.id,
      reference: receipt.receiptNo,
      note: order ? `Back with ${order.poNo}'s delivery` : null,
      at,
    });
  }

  // D12: the supplier's bill for it, a draft until their fiscal tax invoice comes (books-final §4.7).
  await draftBillFromGoodsReceipt(tx, companyId, receipt.id, actor.userId);

  const inStock = sumMoney(receipt.lines.map((line) => line.quantity));
  const value = sumMoney(receipt.lines.map((line) => line.lineTotal));
  const damaged = sumMoney(receipt.lines.map((line) => line.damagedQuantity));
  const short = sumMoney(
    receipt.lines.map((line) => {
      const gap = line.noteQuantity.minus(line.damagedQuantity).minus(line.quantity);
      return gap.isNegative() ? 0 : gap;
    }),
  );
  await auditGoodsReceived(tx, {
    actor,
    receiptId: receipt.id,
    receiptNo: receipt.receiptNo,
    purchaseOrderId: receipt.purchaseOrderId,
    siteId: receipt.siteId,
    supplier: receipt.vendor.name,
    totalValue: value,
    lineCount: receipt.lines.length,
    units: toNumberOrZero(inStock),
    short: toNumberOrZero(short),
    damaged: toNumberOrZero(damaged),
  });

  return {
    id: receipt.id,
    receiptNo: receipt.receiptNo,
    status: "POSTED",
    units: toNumberOrZero(inStock),
    value: toNumberOrZero(value),
    stillOnOrder,
    orderClosed,
    siteId: receipt.siteId,
  };
}

/** After the goods commit: Dr Stock / Cr 2010 Goods received, not billed at Σ quantity × cost ex VAT. A locked period is not a reason to refuse a delivery that arrived. */
async function postReceiptJournal(actor: RetailAuditActor, receiptId: string, at: Date, periodOverrideReason: string | null, post: PostJournal) {
  const receipt = await prisma.retailGoodsReceipt.findUniqueOrThrow({ where: { id: receiptId }, include: { lines: true } });
  const value = toNumberOrZero(sumMoney(receipt.lines.map((line) => line.lineTotal)));
  if (value <= 0) return { accountingStatus: "POSTED", accountingError: null };
  return post({
    companyId: actor.companyId,
    sourceType: "RETAIL_GOODS_RECEIPT",
    sourceId: receipt.id,
    sourceSubtype: "RECEIPT",
    siteId: receipt.siteId,
    entryDate: at,
    description: `Retail goods receipt ${receipt.receiptNo}`,
    createdById: actor.userId,
    actorRole: actor.userRole ?? null,
    periodOverrideReason,
    amount: value,
    netAmount: value,
    taxAmount: 0,
    grossAmount: value,
    inventory: {
      lines: receipt.lines
        .filter((line) => line.quantity.greaterThan(0))
        .map((line) => ({
          inventoryItemId: line.inventoryItemId,
          itemName: line.itemName,
          quantity: toNumberOrZero(line.quantity),
          unitCost: toNumberOrZero(line.unitCost),
          totalCost: toNumberOrZero(line.lineTotal),
        })),
      totalCost: value,
    },
  });
}

/** "Post to stock" on a counted delivery: the poster checks it. */
export async function postCountedDelivery(actor: RetailAuditActor, id: string, post: PostJournal, at: Date = new Date()): Promise<DeliveryOutcome> {
  if (!mayPost(actor)) throw new DeliveryRefusal(403, CANNOT_POST);
  const posted = await prisma.$transaction((tx) => postDelivery(tx, actor, id, { at }), { timeout: 30_000 });
  const accounting = await postReceiptJournal(actor, posted.id, at, null, post);
  return { ...posted, checkers: [], ...accounting };
}

/** Deliveries' bulk "Post to stock": each counted one posted; the rest skipped with why. */
export async function postCountedDeliveries(actor: RetailAuditActor, ids: string[], post: PostJournal) {
  const posted: Array<{ receiptNo: string; units: number }> = [];
  const skipped: Array<{ id: string; why: string }> = [];
  for (const id of ids) {
    try {
      const done = await postCountedDelivery(actor, id, post);
      posted.push({ receiptNo: done.receiptNo, units: done.units });
    } catch (error) {
      if (error instanceof DeliveryRefusal) skipped.push({ id, why: error.message });
      else throw error;
    }
  }
  return { posted, skipped };
}

/* ── Mark received (Orders' bulk) ───────────────────────────────────────── */

/** Each open order received in full as ordered, posted: everything still to come goes into stock at the order's costs. */
export async function markReceived(actor: RetailAuditActor, ids: string[], post: PostJournal) {
  if (!mayPost(actor)) throw new DeliveryRefusal(403, CANNOT_POST);
  const orders = await prisma.retailPurchaseOrder.findMany({
    where: { id: { in: ids }, companyId: actor.companyId, archivedAt: null },
    select: { id: true, poNo: true, status: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  const posted: Array<{ poNo: string; receiptNo: string }> = [];
  const skipped: Array<{ poNo: string; why: string }> = [];
  for (const order of orders) {
    const owed = order.lines.filter((line) => line.inventoryItemId && outstanding(line).greaterThan(0));
    if (order.status !== "SENT" && order.status !== "PARTIAL" && order.status !== "DRAFT") {
      skipped.push({ poNo: order.poNo, why: order.status === "RECEIVED" ? `Everything on ${order.poNo} has already come.` : `${order.poNo} is not open.` });
      continue;
    }
    if (owed.length === 0) {
      skipped.push({ poNo: order.poNo, why: `Nothing is still to come on ${order.poNo}.` });
      continue;
    }
    try {
      const done = await receiveDelivery(
        actor,
        {
          purchaseOrderId: order.id,
          lines: owed.map((line) => ({
            purchaseOrderLineId: line.id,
            inventoryItemId: line.inventoryItemId!,
            quantity: toNumberOrZero(outstanding(line)),
            unitCost: toNumberOrZero(line.unitCost),
          })),
          post: true,
        },
        post,
      );
      posted.push({ poNo: order.poNo, receiptNo: done.receiptNo });
    } catch (error) {
      if (error instanceof DeliveryRefusal) skipped.push({ poNo: order.poNo, why: error.message });
      else throw error;
    }
  }
  return { posted, skipped };
}

/* ── Change a value on the rail (PATCH /deliveries/[id]) ────────────────── */

export type DeliveryChange = { noteNumber?: string | null; driver?: string | null; countedById?: string | null };

const LABELS = { noteNumber: "Note number", driver: "Driver", countedById: "Counted by" } as const;

export async function changeDelivery(actor: RetailAuditActor, id: string, change: DeliveryChange): Promise<{ changed: string[] }> {
  const fields = (Object.keys(change) as Array<keyof DeliveryChange>).filter((key) => key in LABELS);
  if (fields.length !== 1) throw new DeliveryRefusal(400, "Change one value at a time.");
  const field = fields[0]!;
  return prisma.$transaction(async (tx) => {
    await lockReceipt(tx, id);
    const receipt = await tx.retailGoodsReceipt.findFirst({
      where: { id, companyId: actor.companyId },
      select: { id: true, status: true, noteNumber: true, driver: true, countedById: true, countedBy: { select: { name: true } } },
    });
    if (!receipt) throw new DeliveryRefusal(404, "Delivery not found");
    if (field === "countedById") {
      if (receipt.status !== "COUNTED") throw new DeliveryRefusal(400, "Who counted it is kept once it is checked.");
      const to = change.countedById ?? null;
      if (!to) throw new DeliveryRefusal(400, "Say who counted it.");
      const person = await tx.user.findFirst({ where: { id: to, companyId: actor.companyId }, select: { id: true, name: true } });
      if (!person) throw new DeliveryRefusal(400, "Say who counted it.");
      if (person.id === receipt.countedById) return { changed: [] };
      await tx.retailGoodsReceipt.update({ where: { id }, data: { countedById: person.id } });
      await auditRecordEdited(tx, { actor, entityType: "RetailGoodsReceipt", entityId: id, field, label: LABELS[field], from: receipt.countedBy?.name ?? null, to: person.name });
      return { changed: [field] };
    }
    const to = change[field]?.trim() || null;
    if (to && to.length > (field === "driver" ? 120 : 60)) throw new DeliveryRefusal(400, `${LABELS[field]} is too long.`);
    const from = receipt[field];
    if (from === to) return { changed: [] };
    await tx.retailGoodsReceipt.update({ where: { id }, data: { [field]: to } });
    await auditRecordEdited(tx, { actor, entityType: "RetailGoodsReceipt", entityId: id, field, label: LABELS[field], from, to });
    return { changed: [field] };
  });
}
