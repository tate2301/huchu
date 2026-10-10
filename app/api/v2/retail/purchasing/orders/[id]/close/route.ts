import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { toNumberOrZero, sumMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { orderStatusFor, outstanding } from "@/lib/retail/purchase-orders";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../../_helpers";

const closeSchema = z.object({
  /** Why the rest is not coming. Shown on the order. */
  note: z.string().trim().max(500).optional().nullable(),
});

type Session = NonNullable<Awaited<ReturnType<typeof requireRetailSession>>["session"]>;

async function load(session: Session, params: Promise<{ id: string }>) {
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return { response: path.response };
  const order = await prisma.retailPurchaseOrder.findFirst({
    where: { id: path.data.id, companyId: session.user.companyId },
    include: { lines: true },
  });
  if (!order) return { response: errorResponse("Purchase order not found", 404) };
  return { order };
}

function actorOf(session: Session) {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
}

/**
 * Stop waiting for the rest of an order.
 *
 * The supplier ran out, or the rest is not coming. What was delivered stays
 * delivered; the order stops showing as owed and no delivery can be booked
 * against it until it is reopened.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;

  const loaded = await load(session, params);
  if (loaded.response) return loaded.response;
  const { order } = loaded;
  if (order.status === "CLOSED") return errorResponse("This order is already closed", 409);
  if (order.status === "RECEIVED") return errorResponse("Everything on this order has come; there is nothing to close", 409);

  let input: z.infer<typeof closeSchema>;
  try {
    input = closeSchema.parse(await request.json().catch(() => ({})));
  } catch (error) {
    return errorResponse("Validation failed", 400, error instanceof z.ZodError ? error.issues : undefined);
  }

  const owed = order.lines.map((line) => ({ itemName: line.itemName, outstanding: outstanding(line) }));
  const closed = await prisma.$transaction(async (tx) => {
    const updated = await tx.retailPurchaseOrder.update({
      where: { id: order.id },
      data: { status: "CLOSED", closedAt: new Date(), closedById: session.user.id, closeNote: input.note || null },
      include: { lines: true },
    });
    await writeRetailAuditEvent(tx, {
      actor: actorOf(session),
      eventType: RETAIL_AUDIT_EVENTS.orderClosed,
      entityType: "RetailPurchaseOrder",
      entityId: order.id,
      reason: input.note || null,
      payload: {
        poNo: order.poNo,
        supplier: order.supplierName,
        owedValue: toNumberOrZero(
          sumMoney(order.lines.map((line) => outstanding(line).times(line.unitCost))),
        ).toFixed(2),
        owed: owed
          .filter((line) => line.outstanding.greaterThan(0))
          .map((line) => ({ itemName: line.itemName, quantity: line.outstanding.toString() })),
      },
    });
    return updated;
  });

  return successResponse(closed);
}

/** Start waiting again: the rest is coming after all. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;

  const loaded = await load(session, params);
  if (loaded.response) return loaded.response;
  const { order } = loaded;
  if (order.status !== "CLOSED") return errorResponse("This order is not closed", 409);

  const reopened = await prisma.$transaction(async (tx) => {
    const updated = await tx.retailPurchaseOrder.update({
      where: { id: order.id },
      data: { status: orderStatusFor(order.lines, false), closedAt: null, closedById: null, closeNote: null },
      include: { lines: true },
    });
    await writeRetailAuditEvent(tx, {
      actor: actorOf(session),
      eventType: RETAIL_AUDIT_EVENTS.orderReopened,
      entityType: "RetailPurchaseOrder",
      entityId: order.id,
      payload: { poNo: order.poNo, closedAt: order.closedAt?.toISOString() ?? null },
    });
    return updated;
  });

  return successResponse(reopened);
}
