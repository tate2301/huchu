import { NextRequest, NextResponse } from "next/server";
import { Prisma, RetailPurchaseOrderStatus } from "@corelithzw/db";
import { z } from "zod";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { money, multiplyMoney, sumMoney, toNumberOrZero } from "@corelithzw/platform/money";
import { normalizeProvidedId, reserveIdentifier } from "@corelithzw/platform/id-generator";
import { prisma } from "@corelithzw/db/client";
import { requireRetailPermission } from "../../../../../permissions";
import {
  ensureInventoryItemAccess,
  resolveRetailSite,
  requireRetailSession,
} from "../../_helpers";

const lineSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  itemName: z.string().min(1).max(200).optional(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
});

const purchaseOrderSchema = z.object({
  poNo: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid().optional(),
  supplierName: z.string().min(1).max(200),
  expectedDate: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(RetailPurchaseOrderStatus).optional(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Purchase orders carry supplier and unit cost. A stock clerk sees them
  // because they cannot book a delivery in against an order they cannot see; a
  // cashier has no business knowing what the shop pays Delta.
  const gate = requireRetailPermission(session, "retail.purchasing", "view");
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim();
  const search = searchParams.get("search")?.trim();

  const where: Prisma.RetailPurchaseOrderWhereInput = {
    companyId: session.user.companyId,
  };
  if (status && status !== "all") {
    const parsed = RetailPurchaseOrderStatus[status as keyof typeof RetailPurchaseOrderStatus];
    if (!parsed) return errorResponse(`Unknown status "${status}"`, 400);
    where.status = parsed;
  }
  if (search) {
    where.OR = [
      { poNo: { contains: search, mode: "insensitive" } },
      { supplierName: { contains: search, mode: "insensitive" } },
    ];
  }

  const orders = await prisma.retailPurchaseOrder.findMany({
    where,
    include: { lines: true },
    orderBy: { createdAt: "desc" },
  });

  const sites = await prisma.site.findMany({
    where: { id: { in: orders.map((order) => order.siteId) } },
    select: { id: true, name: true, code: true },
  });
  const siteMap = new Map(sites.map((site) => [site.id, site]));

  return successResponse({
    data: orders.map((order) => ({
      ...order,
      site: siteMap.get(order.siteId) ?? null,
      totalValue: toNumberOrZero(sumMoney(order.lines.map((line) => line.lineTotal))),
      totalQuantity: toNumberOrZero(sumMoney(order.lines.map((line) => line.quantity))),
      receivedQuantity: toNumberOrZero(
        sumMoney(order.lines.map((line) => line.receivedQuantity)),
      ),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  /*
    R-2.4, and a deliberate narrowing.

    This was `requireRetailStock`, which admits STOCK_CLERK. The matrix does
    not: `BOOK_A_DELIVERY_IN` is `view` and `receive`, and the note beside it
    says why — deciding what the shop buys, and at what price, is not the
    clerk's. Raising an order is now a manager's act, which is what the matrix
    has said since R-2.1 and what the route has been contradicting.
  */
  const gate = requireRetailPermission(session, "retail.purchasing", "create");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = purchaseOrderSchema.parse(body);
    const { site, response: siteResponse } = await resolveRetailSite(
      session.user.companyId,
      input.siteId,
    );
    if (siteResponse || !site) return siteResponse ?? errorResponse("Invalid site", 400);

    const providedCode = input.poNo
      ? normalizeProvidedId(input.poNo, "RETAIL_PURCHASE_ORDER")
      : null;

    const normalizedLines = await Promise.all(
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
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const poNo =
        providedCode ??
        (await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "RETAIL_PURCHASE_ORDER",
          siteId: site.id,
        }));

      try {
        const order = await prisma.retailPurchaseOrder.create({
          data: {
            companyId: session.user.companyId,
            poNo,
            siteId: site.id,
            supplierName: input.supplierName.trim(),
            status: input.status ?? RetailPurchaseOrderStatus.DRAFT,
            expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
            notes: input.notes?.trim() || null,
            createdById: session.user.id,
            lines: {
              create: normalizedLines,
            },
          },
          include: { lines: true },
        });

        return successResponse(order, 201);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          if (providedCode) {
            return errorResponse("Purchase order number already exists", 409);
          }
          continue;
        }
        throw error;
      }
    }

    return errorResponse("Unable to generate purchase order number", 409);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to create purchase order", 400);
  }
}
