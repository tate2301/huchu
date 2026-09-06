import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "../../../api-utils";
import { getSubscriptionHealth } from "../../../subscription";
import { prisma } from "@corelithzw/db/client";

const BILLING_VIEW_ROLES = new Set(["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"]);

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!BILLING_VIEW_ROLES.has(session.user.role)) {
      return errorResponse("Insufficient permissions to view billing", 403);
    }

    const companyId = session.user.companyId;

    const [company, subscription, addons, activeSites, totalSites, activeUsers, totalUsers, health] =
      await Promise.all([
        prisma.company.findUnique({
          where: { id: companyId },
          select: {
            id: true,
            name: true,
            slug: true,
            tenantStatus: true,
            workspaceProfile: true,
          },
        }),
        prisma.companySubscription.findFirst({
          where: { companyId },
          include: { plan: true },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.companySubscriptionAddon.findMany({
          where: { companyId, isEnabled: true },
          include: { bundle: true },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.site.count({ where: { companyId, isActive: true } }),
        prisma.site.count({ where: { companyId } }),
        prisma.user.count({ where: { companyId, isActive: true } }),
        prisma.user.count({ where: { companyId } }),
        getSubscriptionHealth(companyId),
      ]);

    if (!company) {
      return errorResponse("Workspace not found", 404);
    }

    return successResponse({
      company,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startedAt: subscription.startedAt,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            effectiveMonthlyAmount: subscription.effectiveMonthlyAmount,
            lastPriceComputedAt: subscription.lastPriceComputedAt,
          }
        : null,
      plan: subscription?.plan
        ? {
            id: subscription.plan.id,
            code: subscription.plan.code,
            name: subscription.plan.name,
            description: subscription.plan.description,
            monthlyPrice: subscription.plan.monthlyPrice,
            annualPrice: subscription.plan.annualPrice,
            currency: subscription.plan.currency,
            maxSites: subscription.plan.maxSites,
            maxUsers: subscription.plan.maxUsers,
          }
        : null,
      addons: addons.map((addon) => ({
        id: addon.id,
        isEnabled: addon.isEnabled,
        name: addon.bundle.name,
        code: addon.bundle.code,
        monthlyPrice: addon.bundle.monthlyPrice,
        additionalSiteMonthlyPrice: addon.bundle.additionalSiteMonthlyPrice,
      })),
      usage: {
        activeSites,
        totalSites,
        activeUsers,
        totalUsers,
        maxSites: subscription?.plan.maxSites ?? null,
        maxUsers: subscription?.plan.maxUsers ?? null,
      },
      health,
      payments: {
        onlinePaymentsSupported: false,
        methods: ["Cash", "Cheque"],
        guidance:
          "Payments are handled offline by cash or cheque. Confirm payment with your Huchu account contact before the renewal date.",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/preferences/billing error:", error);
    return errorResponse("Failed to fetch billing preferences");
  }
}
