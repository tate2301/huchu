import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  ensureInventoryItemAccess,
  ensureLocationAccess,
  ensureSiteAccess,
  recordRetailInventoryMovement,
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
  siteId: z.string().uuid(),
  supplierName: z.string().min(1).max(200),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(receiptLineSchema).min(1),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

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
      totalValue: receipt.lines.reduce((total, line) => total + line.lineTotal, 0),
      totalQuantity: receipt.lines.reduce((total, line) => total + line.quantity, 0),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const body = await request.json();
    const input = receiptSchema.parse(body);
    const site = await ensureSiteAccess(session.user.companyId, input.siteId);
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
        const receipt = await prisma.retailGoodsReceipt.create({
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
                inventoryItemId: line.inventoryItem.id,
                itemName: line.inventoryItem.name,
                quantity: line.quantity,
                unitCost: line.unitCost,
                lineTotal: line.quantity * line.unitCost,
              })),
            },
          },
          include: { lines: true },
        });

        for (const line of normalizedLines) {
          await recordRetailInventoryMovement({
            companyId: session.user.companyId,
            userId: session.user.id,
            itemId: line.inventoryItem.id,
            movementType: "RECEIPT",
            quantity: line.quantity,
            unit: line.inventoryItem.unit,
            unitCost: line.unitCost,
            toLocationId: line.location.id,
            notes: `Retail receipt ${receipt.receiptNo}`,
            sourceType: "RETAIL_GOODS_RECEIPT",
            sourceId: `${receipt.id}:${line.inventoryItem.id}`,
            entryDate: receipt.postedAt ?? new Date(),
          });
        }

        if (purchaseOrder) {
          for (const line of normalizedLines) {
            const matchingLine = purchaseOrder.lines.find(
              (orderLine) => orderLine.inventoryItemId === line.inventoryItem.id,
            );
            if (matchingLine) {
              await prisma.retailPurchaseOrderLine.update({
                where: { id: matchingLine.id },
                data: {
                  receivedQuantity: {
                    increment: line.quantity,
                  },
                },
              });
            }
          }

          const refreshedLines = await prisma.retailPurchaseOrderLine.findMany({
            where: { purchaseOrderId: purchaseOrder.id },
          });
          const allReceived = refreshedLines.every(
            (line) => line.receivedQuantity >= line.quantity,
          );
          await prisma.retailPurchaseOrder.update({
            where: { id: purchaseOrder.id },
            data: { status: allReceived ? "RECEIVED" : "PARTIAL" },
          });
        }

        return successResponse(receipt, 201);
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
