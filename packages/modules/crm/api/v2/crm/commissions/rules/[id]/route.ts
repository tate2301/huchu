import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { isCompanyUser, requireCrmCapability } from "../../../_helpers";

const tierSchema = z.object({
  thresholdFrom: z.number().finite().nonnegative(),
  ratePercent: z.number().finite().min(0).max(100),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  basis: z.enum(["INVOICED", "PAID"]).optional(),
  appliesToUserId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
  tiers: z.array(tierSchema).min(1).max(20).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "commissions.manage")) return errorResponse("Manager access required", 403);
    const { id } = await params;

    const existing = await prisma.crmCommissionRule.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Commission rule not found", 404);

    const data = updateSchema.parse(await request.json());
    if (!(await isCompanyUser(session.user.companyId, data.appliesToUserId))) {
      return errorResponse("Invalid rule target user", 400);
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (data.tiers) {
        const sorted = [...data.tiers].sort((a, b) => a.thresholdFrom - b.thresholdFrom);
        await tx.crmCommissionTier.deleteMany({ where: { ruleId: id } });
        await tx.crmCommissionTier.createMany({
          data: sorted.map((tier, index) => ({
            ruleId: id,
            thresholdFrom: tier.thresholdFrom,
            ratePercent: tier.ratePercent,
            sortOrder: index,
          })),
        });
      }
      return tx.crmCommissionRule.update({
        where: { id },
        data: {
          name: data.name,
          basis: data.basis,
          appliesToUserId: data.appliesToUserId ?? undefined,
          isActive: data.isActive,
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : undefined,
          effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
        },
        include: { tiers: { orderBy: { sortOrder: "asc" } } },
      });
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/commissions/rules/[id] error:", error);
    return errorResponse("Failed to update commission rule");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "commissions.manage")) return errorResponse("Manager access required", 403);
    const { id } = await params;

    const existing = await prisma.crmCommissionRule.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Commission rule not found", 404);

    await prisma.crmCommissionRule.update({ where: { id }, data: { isActive: false } });
    return successResponse({ id, deactivated: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/commissions/rules/[id] error:", error);
    return errorResponse("Failed to deactivate commission rule");
  }
}
