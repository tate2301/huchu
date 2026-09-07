import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { isCompanyUser, requireCrmCapability } from "../../_helpers";

const tierSchema = z.object({
  thresholdFrom: z.number().finite().nonnegative(),
  ratePercent: z.number().finite().min(0).max(100),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  basis: z.enum(["INVOICED", "PAID"]).optional(),
  appliesToUserId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
  tiers: z.array(tierSchema).min(1).max(20),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "commissions.manage")) return errorResponse("Manager access required", 403);

    const rules = await prisma.crmCommissionRule.findMany({
      where: { companyId: session.user.companyId },
      include: { tiers: { orderBy: { sortOrder: "asc" } }, appliesToUser: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return successResponse({ data: rules });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/commissions/rules error:", error);
    return errorResponse("Failed to fetch commission rules");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "commissions.manage")) return errorResponse("Manager access required", 403);

    const data = createSchema.parse(await request.json());
    if (!(await isCompanyUser(session.user.companyId, data.appliesToUserId))) {
      return errorResponse("Invalid rule target user", 400);
    }
    const sortedTiers = [...data.tiers].sort((a, b) => a.thresholdFrom - b.thresholdFrom);

    const rule = await prisma.crmCommissionRule.create({
      data: {
        companyId: session.user.companyId,
        name: data.name,
        basis: data.basis ?? "INVOICED",
        appliesToUserId: data.appliesToUserId ?? undefined,
        isActive: data.isActive ?? true,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : undefined,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
        tiers: {
          create: sortedTiers.map((tier, index) => ({
            thresholdFrom: tier.thresholdFrom,
            ratePercent: tier.ratePercent,
            sortOrder: index,
          })),
        },
      },
      include: { tiers: true },
    });
    return successResponse(rule, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/commissions/rules error:", error);
    return errorResponse("Failed to create commission rule");
  }
}
