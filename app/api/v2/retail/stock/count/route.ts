import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import {
  ensureInventoryItemAccess,
  ensureSiteAccess,
  postRetailJournal,
  recordRetailInventoryMovement,
  requireRetailStock,
  requireRetailSession,
} from "../../_helpers";

const stockCountSchema = z.object({
  siteId: z.string().uuid(),
  itemId: z.string().uuid(),
  countedStock: z.number().min(0),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailStock(session);
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = stockCountSchema.parse(body);

    const site = await ensureSiteAccess(session.user.companyId, input.siteId);
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const item = await ensureInventoryItemAccess(session.user.companyId, input.itemId);
    if (!item || item.siteId !== site.id) {
      return errorResponse("Invalid inventory item for the selected site", 400);
    }

    const variance = Number((input.countedStock - item.currentStock).toFixed(2));
    if (variance === 0) {
      return errorResponse("Counted stock matches current stock; no adjustment needed", 400);
    }

    const movement = await recordRetailInventoryMovement({
      companyId: session.user.companyId,
      userId: session.user.id,
      itemId: item.id,
      movementType: "ADJUSTMENT",
      quantity: variance,
      unit: item.unit,
      unitCost: item.unitCost ?? 0,
      notes: input.notes?.trim() || `Retail stock count adjustment for ${item.name}`,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId: `stock-adjustment:${item.id}:${Date.now()}`,
    });

    const adjustmentValue = Math.abs(variance) * Math.abs(item.unitCost ?? 0);
    const accounting =
      adjustmentValue > 0
        ? await postRetailJournal({
            companyId: session.user.companyId,
            sourceType: "RETAIL_STOCK_ADJUSTMENT",
            sourceId: movement.id,
            sourceSubtype: variance < 0 ? "LOSS" : "GAIN",
            siteId: site.id,
            entryDate: new Date(),
            description: `Retail stock adjustment ${movement.referenceId}`,
            createdById: session.user.id,
            actorRole: session.user.role,
            periodOverrideReason: input.periodOverrideReason ?? null,
            amount: adjustmentValue,
            netAmount: adjustmentValue,
            taxAmount: 0,
            grossAmount: adjustmentValue,
            invertDirection: variance < 0,
            inventory: {
              lines: [
                {
                  inventoryItemId: item.id,
                  itemName: item.name,
                  quantity: Math.abs(variance),
                  unitCost: Math.abs(item.unitCost ?? 0),
                  totalCost: adjustmentValue,
                },
              ],
              totalCost: adjustmentValue,
            },
          })
        : { accountingStatus: "POSTED", accountingError: null };

    return successResponse(
      {
        movementId: movement.id,
        referenceId: movement.referenceId,
        itemId: item.id,
        previousStock: item.currentStock,
        countedStock: input.countedStock,
        variance,
        accountingStatus: accounting.accountingStatus,
        accountingError: accounting.accountingError,
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to post stock count", 400);
  }
}
