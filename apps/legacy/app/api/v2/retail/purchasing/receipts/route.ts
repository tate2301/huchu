import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, multiplyMoney, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@corelithzw/db/client";
import { auditGoodsReceived } from "@/lib/retail/audit";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  ensureInventoryItemAccess,
  ensureLocationAccess,
  resolveRetailSite,
  postRetailJournal,
  requireRetailSession,
} from "../../_helpers";

const receiptLineSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
  locationId: z.string().uuid().optional().nullable(),
});

const receiptSchema = z.object({
  receiptNo: z.string().min(1).max(50).optional(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  siteId: z.string().uuid().optional(),
  supplierName: z.string().min(1).max(200),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(receiptLineSchema).min(1),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Goods received, with unit cost. Same audience as the orders they
  // settle.
  const gate = requireRetailPermission(session, "retail.purchasing", "view");
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const siteId = searchParams.get("siteId")?.trim();

  const where: Prisma.RetailGoodsReceiptWhereInput = {
    companyId: session.user.companyId,
  };
  if (siteId) where.siteId = siteId;
  if (search) {
    where.OR = [
      { receiptNo: { contains: search, mode: "insensitive" } },
      { supplierName: { contains: search, mode: "insensitive" } },
    ];
  }

  const receipts = await prisma.retailGoodsReceipt.findMany({
    where,
    include: { lines: true },
    orderBy: { createdAt: "desc" },
  });

  const sites = await prisma.site.findMany({
    where: { id: { in: receipts.map((receipt) => receipt.siteId) } },
    select: { id: true, name: true, code: true },
  });
  const siteMap = new Map(sites.map((site) => [site.id, site]));

  return successResponse({
    data: receipts.map((receipt) => ({
      ...receipt,
      site: siteMap.get(receipt.siteId) ?? null,
      totalValue: toNumberOrZero(sumMoney(receipt.lines.map((line) => line.lineTotal))),
      totalQuantity: toNumberOrZero(sumMoney(receipt.lines.map((line) => line.quantity))),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.4. Booking a delivery in *is* the clerk's job — `receive`, not
  // `create`, which is the distinction the matrix draws and the role set could
  // not.
  const gate = requireRetailPermission(session, "retail.purchasing", "receive");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = receiptSchema.parse(body);
    const { site, response: siteResponse } = await resolveRetailSite(
      session.user.companyId,
      input.siteId,
    );
    if (siteResponse) return siteResponse;
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const purchaseOrder = input.purchaseOrderId
      ? await prisma.retailPurchaseOrder.findFirst({
          where: {
            id: input.purchaseOrderId,
            companyId: session.user.companyId,
          },
          include: { lines: true },
        })
      : null;

    const normalizedLines = await Promise.all(
      input.lines.map(async (line) => {
        const inventoryItem = await ensureInventoryItemAccess(
          session.user.companyId,
          line.inventoryItemId,
        );
        if (!inventoryItem) {
          throw new Error("One of the selected inventory items is invalid.");
        }
        const locationId = line.locationId ?? inventoryItem.locationId;
        if (!locationId) {
          throw new Error(`No stock location is configured for ${inventoryItem.name}.`);
        }
        const location = await ensureLocationAccess(inventoryItem.siteId, locationId);
        if (!location) {
          throw new Error("Invalid stock location.");
        }
        return {
          inventoryItem,
          location,
          quantity: line.quantity,
          unitCost: line.unitCost,
        };
      }),
    );

    const providedCode = input.receiptNo
      ? normalizeProvidedId(input.receiptNo, "RETAIL_GOODS_RECEIPT")
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const receiptNo =
        providedCode ??
        (await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "RETAIL_GOODS_RECEIPT",
          siteId: site.id,
        }));

      try {
        // S-2 / 0.3(3). This used to be four sequential awaits — create the
        // receipt, add the stock, tick off the order lines, close the order —
        // with nothing holding them together. A failure after the second left
        // stock on the shelf against a receipt that said it had not arrived, and
        // a purchase order still showing everything outstanding. One transaction.
        //
        // Inside: everything that is a fact about the goods. Outside: the two
        // things that must not be rolled back with them —
        //
        //  - `reserveIdentifier` for the receipt number, above. It is an atomic
        //    sequence increment; rolling it back would rewind the counter and
        //    hand the same number to the next receipt. Burning a number on a
        //    failed attempt is the correct cost. It also has to be outside so the
        //    P2002 retry can catch and continue — a caught error inside a
        //    Postgres transaction leaves it aborted and every later query fails.
        //
        //  - `postRetailJournal`, below. It writes through the global client, so
        //    it could not join this transaction anyway, and it must not: it is
        //    designed to degrade, returning PENDING when the accounting period is
        //    locked. A locked period is not a reason to refuse a delivery that
        //    physically arrived. The goods facts commit first; the journal is
        //    posted against the committed receipt and its status is reported.
        const receipt = await prisma.$transaction(async (tx) => {
          const created = await tx.retailGoodsReceipt.create({
            data: {
              companyId: session.user.companyId,
              receiptNo,
              purchaseOrderId: purchaseOrder?.id ?? null,
              siteId: site.id,
              supplierName: input.supplierName.trim(),
              status: "POSTED",
              notes: input.notes?.trim() || null,
              receivedById: session.user.id,
              postedAt: new Date(),
              lines: {
                create: normalizedLines.map((line) => ({
                  companyId: session.user.companyId,
                  inventoryItemId: line.inventoryItem.id,
                  itemName: line.inventoryItem.name,
                  quantity: line.quantity,
                  unitCost: line.unitCost,
                  lineTotal: multiplyMoney(money(line.quantity), money(line.unitCost)),
                })),
              },
            },
            include: { lines: true },
          });

          for (const line of normalizedLines) {
            await recordStockMovement({
              companyId: session.user.companyId,
              userId: session.user.id,
              itemId: line.inventoryItem.id,
              movementType: "RECEIPT",
              quantity: line.quantity,
              unit: line.inventoryItem.unit,
              unitCost: line.unitCost,
              toLocationId: line.location.id,
              notes: `Retail receipt ${created.receiptNo}`,
              sourceType: "RETAIL_GOODS_RECEIPT",
              sourceId: `${created.id}:${line.inventoryItem.id}`,
              entryDate: created.postedAt ?? new Date(),
              tx,
            });
          }

          if (purchaseOrder) {
            for (const line of normalizedLines) {
              const matchingLine = purchaseOrder.lines.find(
                (orderLine) => orderLine.inventoryItemId === line.inventoryItem.id,
              );
              if (matchingLine) {
                await tx.retailPurchaseOrderLine.update({
                  where: { id: matchingLine.id },
                  data: {
                    receivedQuantity: {
                      increment: line.quantity,
                    },
                  },
                });
              }
            }

            const refreshedLines = await tx.retailPurchaseOrderLine.findMany({
              where: { purchaseOrderId: purchaseOrder.id },
            });
            const allReceived = refreshedLines.every(
              (line) => line.receivedQuantity >= line.quantity,
            );
            await tx.retailPurchaseOrder.update({
              where: { id: purchaseOrder.id },
              data: { status: allReceived ? "RECEIVED" : "PARTIAL" },
            });
          }

          /*
            R-3.3. Receiving is where stock and cost enter the shop, and where
            the cost side of every margin figure is set — the receipt overwrites
            `InventoryItem.unitCost` wholesale. A clerk who books in a delivery
            at the wrong price moves the margin on everything sold afterwards,
            and this is the row that says who booked it and at what value.
          */
          await auditGoodsReceived(tx, {
            actor: {
              companyId: session.user.companyId,
              userId: session.user.id,
              userName: session.user.name ?? null,
              userRole: session.user.role ?? null,
            },
            receiptId: created.id,
            receiptNo: created.receiptNo,
            purchaseOrderId: created.purchaseOrderId,
            siteId: created.siteId,
            supplier: created.supplierName,
            totalValue: sumMoney(created.lines.map((line) => line.lineTotal)),
            lineCount: created.lines.length,
          });

          return created;
        });

        const receiptValue = toNumberOrZero(
          sumMoney(receipt.lines.map((line) => line.lineTotal)),
        );
        const accounting =
          receiptValue > 0
            ? await postRetailJournal({
                companyId: session.user.companyId,
                sourceType: "RETAIL_GOODS_RECEIPT",
                sourceId: receipt.id,
                sourceSubtype: "RECEIPT",
                siteId: receipt.siteId,
                entryDate: receipt.postedAt ?? new Date(),
                description: `Retail goods receipt ${receipt.receiptNo}`,
                createdById: session.user.id,
                actorRole: session.user.role,
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

        return successResponse({ ...receipt, ...accounting }, 201);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          if (providedCode) {
            return errorResponse("Receipt number already exists", 409);
          }
          continue;
        }
        throw error;
      }
    }

    return errorResponse("Unable to generate receipt number", 409);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to post receipt", 400);
  }
}
