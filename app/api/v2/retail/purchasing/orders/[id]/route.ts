import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { ensureInventoryItemAccess, ensureSiteAccess, requireRetailManager, requireRetailStock, requireRetailSession } from "../../../_helpers";

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
  status: z.string().min(1).max(40).optional(),
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

  const gate = requireRetailStock(session);
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
                inventoryItemId: inventoryItem.id,
                itemName: line.itemName?.trim() || inventoryItem.name,
                quantity: line.quantity,
                unitCost: line.unitCost,
                lineTotal: line.quantity * line.unitCost,
              };
            }

            if (!line.itemName?.trim()) {
              throw new Error("Each line needs an item or item name.");
            }

            return {
              inventoryItemId: null,
              itemName: line.itemName.trim(),
              quantity: line.quantity,
              unitCost: line.unitCost,
              lineTotal: line.quantity * line.unitCost,
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
          status: input.status?.trim(),
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

  const gate = requireRetailManager(session);
  if (gate) return gate;

  const { id } = await params;
  const existing = await getOrder(session.user.companyId, id);
  if (!existing) {
    return errorResponse("Purchase order not found", 404);
  }

  await prisma.retailPurchaseOrder.delete({ where: { id: existing.id } });
  return successResponse({ success: true });
}
