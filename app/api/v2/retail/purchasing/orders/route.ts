import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { ensureInventoryItemAccess, ensureSiteAccess, requireRetailSession } from "../../_helpers";

const lineSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  itemName: z.string().min(1).max(200).optional(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
});

const purchaseOrderSchema = z.object({
  poNo: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid(),
  supplierName: z.string().min(1).max(200),
  expectedDate: z.string().datetime().optional().nullable(),
  status: z.string().min(1).max(40).optional(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim();
  const search = searchParams.get("search")?.trim();

  const where: Prisma.RetailPurchaseOrderWhereInput = {
    companyId: session.user.companyId,
  };
  if (status && status !== "all") where.status = status;
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
      totalValue: order.lines.reduce((total, line) => total + line.lineTotal, 0),
      totalQuantity: order.lines.reduce((total, line) => total + line.quantity, 0),
      receivedQuantity: order.lines.reduce((total, line) => total + line.receivedQuantity, 0),
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
    const input = purchaseOrderSchema.parse(body);
    const site = await ensureSiteAccess(session.user.companyId, input.siteId);
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

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
            status: input.status?.trim() || "DRAFT",
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
