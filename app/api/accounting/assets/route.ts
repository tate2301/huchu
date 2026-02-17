import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const assetSchema = z.object({
  assetCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  acquisitionDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  cost: z.number().min(0),
  salvageValue: z.number().min(0).optional(),
  usefulLifeMonths: z.number().int().min(1).optional(),
  depreciationMethod: z.enum(["STRAIGHT_LINE"]).optional(),
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

    const [assets, total] = await Promise.all([
      prisma.fixedAsset.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.fixedAsset.count({ where }),
    ]);

    return successResponse(paginationResponse(assets, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/assets error:", error);
    return errorResponse("Failed to fetch assets");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = assetSchema.parse(body);

    const asset = await prisma.fixedAsset.create({
      data: {
        companyId: session.user.companyId,
        assetCode: validated.assetCode,
        name: validated.name,
        category: validated.category,
        acquisitionDate: new Date(validated.acquisitionDate),
        cost: validated.cost,
        salvageValue: validated.salvageValue ?? 0,
        usefulLifeMonths: validated.usefulLifeMonths ?? 36,
        depreciationMethod: validated.depreciationMethod ?? "STRAIGHT_LINE",
        isActive: validated.isActive ?? true,
      },
    });

    return successResponse(asset, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/assets error:", error);
    return errorResponse("Failed to create asset");
  }
}
