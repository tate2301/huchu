import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { DeliveryRefusal, mayPost, receiveDelivery } from "@/lib/retail/buying/deliveries";
import { buyingActor } from "@/lib/retail/buying/routes";
import { createSupplier, SupplierRefusal } from "@/lib/retail/buying/suppliers";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { OrderRefused } from "@/lib/retail/purchase-orders";
import { postRetailJournal, resolveRetailSite, requireRetailSession } from "../../_helpers";

/**
 * The Deliveries page's register and its "No order" receive dialog, until the
 * Deliveries list and the intake sheet (BUY-08) replace them. A delivery
 * against an order is received from the order (BUY-06's Receive page); this
 * refuses one. Posting is `receiveDelivery`'s (counted for checking when the
 * role may not post); the supplier is named, which finds the supplier of that
 * name still bought from, or adds one.
 */

const receiptLineSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
  locationId: z.string().uuid().optional().nullable(),
});

const receiptSchema = z.object({
  receiptNo: z.string().min(1).max(50).optional(),
  /** Refused: a delivery against an order is received from the order. */
  purchaseOrderId: z.string().uuid().optional().nullable(),
  siteId: z.string().uuid().optional(),
  /** Read only with no order: the order's supplier wins. */
  supplierName: z.string().max(200).optional(),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(receiptLineSchema).min(1),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Goods received, with unit cost. Same audience as the orders they settle.
  const gate = requireRetailPermission(session, "retail.purchasing", "view");
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const siteId = searchParams.get("siteId")?.trim();

  const where: Prisma.RetailGoodsReceiptWhereInput = { companyId: session.user.companyId };
  if (siteId) where.siteId = siteId;
  if (search) {
    where.OR = [
      { receiptNo: { contains: search, mode: "insensitive" } },
      { vendor: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const receipts = await prisma.retailGoodsReceipt.findMany({
    where,
    include: {
      lines: true,
      vendor: { select: { name: true } },
      site: { select: { id: true, name: true, code: true } },
      purchaseOrder: { select: { poNo: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return successResponse({
    data: receipts.map(({ vendor, purchaseOrder, ...receipt }) => ({
      ...receipt,
      supplierName: vendor.name,
      poNo: purchaseOrder?.poNo ?? null,
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

  // R-2.4. Booking a delivery in *is* the clerk's job — `receive`, not `create`.
  const gate = requireRetailPermission(session, "retail.purchasing", "receive");
  if (gate) return gate;

  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);
  const input = parsed.data;
  if (input.purchaseOrderId) return errorResponse("Receive it from the order.", 409);
  const { site, response: siteResponse } = await resolveRetailSite(session.user.companyId, input.siteId);
  if (siteResponse) return siteResponse;
  if (!site) return errorResponse("Invalid site", 400);

  const actor = buyingActor(session);
  try {
    const supplierId = await supplierNamed(actor, input.supplierName ?? "");
    const receipt = await receiveDelivery(
      actor,
      {
        receiptNo: input.receiptNo,
        siteId: site.id,
        supplierId,
        notes: input.notes ?? null,
        lines: input.lines,
        post: mayPost(actor),
        periodOverrideReason: input.periodOverrideReason ?? null,
      },
      (journal) => postRetailJournal(journal),
    );
    return successResponse(receipt, 201);
  } catch (error) {
    if (error instanceof DeliveryRefusal) return errorResponse(error.message, error.status);
    if (error instanceof SupplierRefusal) return errorResponse(Object.values(error.fieldErrors ?? {})[0] ?? error.message, error.status);
    if (error instanceof OrderRefused) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/retail/purchasing/receipts error:", error);
    return errorResponse("The delivery could not be saved. Nothing was booked; try again.");
  }
}

/** The supplier still bought from with this name (any case), or a new one of that name. */
async function supplierNamed(actor: ReturnType<typeof buyingActor>, typed: string): Promise<string> {
  const name = typed.trim();
  if (!name) throw new DeliveryRefusal(400, "Say who it came from.");
  const found = await prisma.vendor.findFirst({
    where: { companyId: actor.companyId, stoppedAt: null, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (found) return found.id;
  const created = await prisma.$transaction((tx) => createSupplier(tx, actor, { name }));
  return created.id;
}
