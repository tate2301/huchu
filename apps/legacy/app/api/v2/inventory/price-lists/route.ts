import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { priceListSchema, validatePriceList } from "@corelithzw/module-stock/catalogue";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const lists = await prisma.priceList.findMany({
      where: { companyId: session.user.companyId },
      include: { _count: { select: { entries: true } } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return successResponse({ data: lists });
  } catch (error) {
    console.error("[API] GET /api/v2/inventory/price-lists error:", error);
    return errorResponse("Failed to fetch price lists");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = priceListSchema.parse(await request.json());

    const problem = validatePriceList(data);
    if (problem) return errorResponse(problem, 400);

    const clash = await prisma.priceList.findFirst({
      where: { companyId, name: data.name },
      select: { id: true },
    });
    if (clash) return errorResponse(`There's already a list called "${data.name}"`, 409);

    const list = await prisma.$transaction(async (tx) => {
      // Exactly one default. Two would make "the usual price" ambiguous, which
      // is the one thing a price list must never be.
      if (data.isDefault) {
        await tx.priceList.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.priceList.create({
        data: {
          companyId,
          name: data.name,
          kind: data.kind ?? "STANDARD",
          isDefault: data.isDefault ?? false,
          region: data.region ?? undefined,
          currency: data.currency ?? "USD",
          isActive: data.isActive ?? true,
        },
      });
    });

    return successResponse(list, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/inventory/price-lists error:", error);
    return errorResponse("Failed to create the price list");
  }
}
