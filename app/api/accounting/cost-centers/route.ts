import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";

const costCenterSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (active !== null) where.isActive = active === "true";

    const [costCenters, total] = await Promise.all([
      prisma.costCenter.findMany({
        where,
        orderBy: [{ code: "asc" }],
        skip,
        take: limit,
      }),
      prisma.costCenter.count({ where }),
    ]);

    return successResponse(paginationResponse(costCenters, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/cost-centers error:", error);
    return errorResponse("Failed to fetch cost centers");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = costCenterSchema.parse(body);
    const code = validated.code
      ? normalizeProvidedId(validated.code, "COST_CENTER")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "COST_CENTER",
        });

    const existing = await prisma.costCenter.findFirst({
      where: { companyId: session.user.companyId, code },
      select: { id: true },
    });
    if (existing) {
      return errorResponse("Cost center code already exists", 409);
    }

    const costCenter = await prisma.costCenter.create({
      data: {
        companyId: session.user.companyId,
        code,
        name: validated.name,
        isActive: validated.isActive ?? true,
      },
    });

    return successResponse(costCenter, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/cost-centers error:", error);
    return errorResponse("Failed to create cost center");
  }
}
