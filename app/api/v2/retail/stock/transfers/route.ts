import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { captureAccountingEvent } from "@/lib/accounting/integration";
import { errorResponse, successResponse } from "@/lib/api-utils";
import {
  ensureInventoryItemAccess,
  ensureLocationAccess,
  ensureSiteAccess,
  recordRetailInventoryMovement,
  requireRetailSession,
} from "../../_helpers";

const transferSchema = z.object({
  siteId: z.string().uuid(),
  itemId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const body = await request.json();
    const input = transferSchema.parse(body);

    const site = await ensureSiteAccess(session.user.companyId, input.siteId);
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const item = await ensureInventoryItemAccess(session.user.companyId, input.itemId);
    if (!item || item.siteId !== site.id) {
      return errorResponse("Invalid inventory item for the selected site", 400);
    }

    const destination = await ensureLocationAccess(site.id, input.toLocationId);
    if (!destination) {
      return errorResponse("Invalid destination location", 400);
    }

    if (destination.id === item.locationId) {
      return errorResponse("Destination location must differ from source location", 400);
    }

    if (input.quantity > item.currentStock) {
      return errorResponse("Transfer quantity cannot exceed current stock", 400);
    }

    const movement = await recordRetailInventoryMovement({
      companyId: session.user.companyId,
      userId: session.user.id,
      itemId: item.id,
      movementType: "TRANSFER",
      quantity: input.quantity,
      unit: item.unit,
      unitCost: item.unitCost ?? 0,
      notes: input.notes?.trim() || `Retail transfer of ${item.name}`,
      toLocationId: destination.id,
      sourceType: "RETAIL_STOCK_TRANSFER",
      sourceId: `stock-transfer:${item.id}:${Date.now()}`,
    });

    await captureAccountingEvent({
      companyId: session.user.companyId,
      sourceDomain: "retail",
      sourceAction: "stock-transfer",
      sourceType: "RETAIL_STOCK_TRANSFER",
      sourceId: movement.id,
      sourceSubtype: "SAME_SITE",
      siteId: site.id,
      entryDate: new Date(),
      description: `Retail stock transfer ${movement.referenceId}`,
      amount: Math.abs(input.quantity * (item.unitCost ?? 0)),
      payload: {
        movementId: movement.id,
        movementReference: movement.referenceId,
        itemId: item.id,
        itemName: item.name,
        quantity: input.quantity,
        fromLocationId: item.locationId,
        toLocationId: destination.id,
        movementType: "TRANSFER",
      },
      createdById: session.user.id,
      status: "IGNORED",
    });

    return successResponse(
      {
        movementId: movement.id,
        referenceId: movement.referenceId,
        itemId: item.id,
        quantity: input.quantity,
        fromLocationId: item.locationId,
        toLocationId: destination.id,
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to post stock transfer", 400);
  }
}
