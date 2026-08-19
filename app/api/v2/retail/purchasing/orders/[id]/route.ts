import { NextRequest, NextResponse } from "next/server";
import { RetailPurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { money, multiplyMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { ensureInventoryItemAccess, ensureSiteAccess, requireRetailSession } from "../../../_helpers";

const lineSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  itemName: z.string().min(1).max(200).optional(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
});

const patchSchema = z.object({
  siteId: z.string().uuid().optional(),
  supplierName: z.string().min(1).max(200).optional(),
  expectedDate: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(RetailPurchaseOrderStatus).optional(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1).optional(),
});

async function getOrder(companyId: string, id: string) {
  return prisma.retailPurchaseOrder.findFirst({
    where: { id, companyId },
    include: { lines: true },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.4. Amending an order — quantities, prices, the supplier — is the same
  // decision as raising one, and the matrix puts both behind `retail.purchasing`
  // rather than behind "is this person a stock person".
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;

  try {
    const { id } = await params;
    const existing = await getOrder(session.user.companyId, id);
    if (!existing) {
      return errorResponse("Purchase order not found", 404);
    }

    const body = await request.json();
    const input = patchSchema.parse(body);
    const nextSiteId = input.siteId ?? existing.siteId;
    const site = await ensureSiteAccess(session.user.companyId, nextSiteId);
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const lines = input.lines
      ? await Promise.all(
          input.lines.map(async (line) => {
            if (line.inventoryItemId) {
              const inventoryItem = await ensureInventoryItemAccess(
                session.user.companyId,
                line.inventoryItemId,
              );
              if (!inventoryItem) {
                throw new Error("One of the selected inventory items is invalid.");
              }
              return {
                companyId: session.user.companyId,
                inventoryItemId: inventoryItem.id,
                itemName: line.itemName?.trim() || inventoryItem.name,
                quantity: line.quantity,
                unitCost: line.unitCost,
                lineTotal: multiplyMoney(money(line.quantity), money(line.unitCost)),
              };
            }

            if (!line.itemName?.trim()) {
              throw new Error("Each line needs an item or item name.");
            }

            return {
              companyId: session.user.companyId,
              inventoryItemId: null,
              itemName: line.itemName.trim(),
              quantity: line.quantity,
              unitCost: line.unitCost,
              lineTotal: multiplyMoney(money(line.quantity), money(line.unitCost)),
            };
          }),
        )
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.retailPurchaseOrderLine.deleteMany({
          where: { purchaseOrderId: existing.id },
        });
      }

      return tx.retailPurchaseOrder.update({
        where: { id: existing.id },
        data: {
          siteId: site.id,
          supplierName: input.supplierName?.trim(),
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : input.expectedDate,
          status: input.status,
          notes: input.notes?.trim() ?? input.notes,
          ...(lines
            ? {
                lines: {
                  create: lines,
                },
              }
            : {}),
        },
        include: { lines: true },
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to update purchase order", 400);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.purchasing", "delete");
  if (gate) return gate;

  const { id } = await params;
  const existing = await getOrder(session.user.companyId, id);
  if (!existing) {
    return errorResponse("Purchase order not found", 404);
  }

  await prisma.retailPurchaseOrder.delete({ where: { id: existing.id } });
  return successResponse({ success: true });
}
