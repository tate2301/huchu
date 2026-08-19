import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, multiplyMoney, quantity, toNumberOrZero, ZERO } from "@/lib/money";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  ensureInventoryItemAccess,
  resolveRetailSite,
  postRetailJournal,
  requireRetailSession,
} from "../../_helpers";

const stockCountSchema = z.object({
  siteId: z.string().uuid().optional(),
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

  // R-2.4. Posting a counted-vs-system variance is an `ADJUSTMENT` on the stock
  // ledger — `create` on `retail.stock`, which is what `MOVE_STOCK` grants a
  // clerk and withholds from everybody at a till.
  const gate = requireRetailPermission(session, "retail.stock", "create");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = stockCountSchema.parse(body);

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

    /*
      S-1. This was `Number((counted - onHand).toFixed(2))` — a subtraction of
      two doubles rounded to two places, then compared with `=== 0`. Two of
      those three steps were wrong: the rounding threw away the two further
      places the column actually holds, and `=== 0` on a float difference is the
      comparison R-1.1 exists to end. A count that matched to four places and
      differed at the fifth reported "no adjustment needed" or posted a
      phantom one, depending on which way the double fell.
    */
    const variance = quantity(input.countedStock).minus(quantity(item.currentStock));
    if (variance.isZero()) {
      return errorResponse("Counted stock matches current stock; no adjustment needed", 400);
    }

    const { movement } = await recordStockMovement({
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

    const adjustmentValue = multiplyMoney(variance.abs(), money(item.unitCost ?? 0).abs());
    const accounting =
      adjustmentValue.greaterThan(ZERO)
        ? await postRetailJournal({
            companyId: session.user.companyId,
            sourceType: "RETAIL_STOCK_ADJUSTMENT",
            sourceId: movement.id,
            sourceSubtype: variance.isNegative() ? "LOSS" : "GAIN",
            siteId: site.id,
            entryDate: new Date(),
            description: `Retail stock adjustment ${movement.referenceId}`,
            createdById: session.user.id,
            actorRole: session.user.role,
            periodOverrideReason: input.periodOverrideReason ?? null,
            amount: toNumberOrZero(adjustmentValue),
            netAmount: toNumberOrZero(adjustmentValue),
            taxAmount: 0,
            grossAmount: toNumberOrZero(adjustmentValue),
            invertDirection: variance.isNegative(),
            inventory: {
              lines: [
                {
                  inventoryItemId: item.id,
                  itemName: item.name,
                  quantity: toNumberOrZero(variance.abs()),
                  unitCost: toNumberOrZero(money(item.unitCost ?? 0).abs()),
                  totalCost: toNumberOrZero(adjustmentValue),
                },
              ],
              totalCost: toNumberOrZero(adjustmentValue),
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
