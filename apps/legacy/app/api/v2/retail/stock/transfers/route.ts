import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { captureAccountingEvent } from "@corelithzw/module-books/integration";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { recordStockMovement } from "@corelithzw/module-stock/stock-movements";
import { multiplyMoney, toNumberOrZero } from "@corelithzw/platform/money";
import { requireRetailPermission } from "@corelithzw/module-sell/permissions";
import {
  ensureInventoryItemAccess,
  resolveRetailSite,
  requireRetailSession,
} from "../../_helpers";

const transferSchema = z.object({
  siteId: z.string().uuid().optional(),
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

  // R-2.4. A transfer moves stock between locations. Same grant as a count.
  const gate = requireRetailPermission(session, "retail.stock", "create");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = transferSchema.parse(body);

    const { site, response: siteResponse } = await resolveRetailSite(
      session.user.companyId,
      input.siteId,
    );
    if (siteResponse) return siteResponse;
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const item = await ensureInventoryItemAccess(session.user.companyId, input.itemId);
    if (!item || item.siteId !== site.id) {
      return errorResponse("Invalid inventory item for the selected site", 400);
    }

    // The destination, the same-site rule and the whole-line rule all live in
    // `recordStockMovement` now — one movement service, one set of rules. It
    // throws with a message the catch below turns into a 400.
    const fromLocationId = item.locationId;
    const { movement } = await recordStockMovement({
      companyId: session.user.companyId,
      userId: session.user.id,
      itemId: item.id,
      movementType: "TRANSFER",
      quantity: input.quantity,
      unit: item.unit,
      unitCost: item.unitCost ?? 0,
      notes: input.notes?.trim() || `Retail transfer of ${item.name}`,
      toLocationId: input.toLocationId,
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
      // S-1. `unitCost` is `Decimal(14,2)`; this is the value posted to the
      // ledger for the move.
      amount: toNumberOrZero(multiplyMoney(input.quantity, item.unitCost ?? 0).abs()),
      payload: {
        movementId: movement.id,
        movementReference: movement.referenceId,
        itemId: item.id,
        itemName: item.name,
        quantity: input.quantity,
        fromLocationId,
        toLocationId: input.toLocationId,
        movementType: "TRANSFER",
      },
      createdById: session.user.id,
      status: "POSTED",
    });

    return successResponse(
      {
        movementId: movement.id,
        referenceId: movement.referenceId,
        itemId: item.id,
        quantity: input.quantity,
        fromLocationId,
        toLocationId: input.toLocationId,
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
