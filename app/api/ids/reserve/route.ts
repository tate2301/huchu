import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { reserveIdentifier, type ReservableIdEntity, ID_ENTITY_CONFIG } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

const reserveSchema = z.object({
  entity: z.enum([
    "SITE",
    "DEPARTMENT",
    "JOB_GRADE",
    "DOWNTIME_CODE",
    "EQUIPMENT",
    "CHART_OF_ACCOUNT",
    "COST_CENTER",
    "TAX_CODE",
    "FIXED_ASSET",
    "INVENTORY_ITEM",
    "STOCK_LOCATION",
    "STOCK_MOVEMENT",
    "GOLD_POUR",
    "GOLD_RECEIPT",
    "GOLD_PURCHASE",
  ]),
  siteId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = reserveSchema.parse(body);
    const entity = validated.entity as ReservableIdEntity;
    const entityConfig = ID_ENTITY_CONFIG[entity];

    if (entityConfig.requiresSiteId && !validated.siteId) {
      return errorResponse("siteId is required for this entity", 400);
    }

    if (validated.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true },
      });
      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403);
      }
    }

    const code = await reserveIdentifier(prisma, {
      companyId: session.user.companyId,
      entity,
      siteId: validated.siteId,
    });

    return successResponse({
      entity,
      code,
      prefix: entityConfig.prefix,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/ids/reserve error:", error);
    return errorResponse("Failed to reserve ID");
  }
}
