import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPlatformServices } from "@/scripts/platform/services";
import { computeSubscriptionPricing } from "@/scripts/platform/domain/commercial-service";
import { requirePlatformAdminAccess } from "../../../_auth";

export const runtime = "nodejs";

type Params = Promise<{ companyId: string }>;

export async function GET(request: Request, context: { params: Params }) {
  const access = await requirePlatformAdminAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { companyId } = await context.params;
  const services = createPlatformServices();

  try {
    const [
      company,
      reservation,
      contractState,
      subscriptions,
      addons,
      features,
      admins,
      users,
      sites,
      supportSessions,
      auditEvents,
      incidents,
    ] = await Promise.all([
      services.org.detail(companyId),
      services.org.getSubdomainReservation(companyId),
      services.contract.getState(companyId),
      services.subscription.list({ companyId, limit: 5 }),
      services.subscription.listAddons({ companyId }),
      services.feature.list({ companyId }),
      services.admin.list({ companyId, limit: 50 }),
      services.user.list({ companyId, limit: 100 }),
      services.site.list({ companyId, limit: 100 }),
      services.support.listSessions(companyId),
      services.audit.list({ companyId, limit: 25 }),
      services.health.listIncidents({ companyId, limit: 25 }),
    ]);

    const subscription = subscriptions[0] ?? null;
    const subscriptionHealth = subscription ? await services.subscription.health(companyId) : null;
    const latestPricingSnapshot = subscription
      ? await prisma.companySubscription.findFirst({
          where: { companyId },
          orderBy: [{ updatedAt: "desc" }],
          select: {
            effectiveMonthlyAmount: true,
            lastPriceComputedAt: true,
          },
        })
      : null;
    const pricingSummary = subscription ? await computeSubscriptionPricing(companyId) : null;

    return NextResponse.json({
      company,
      reservation,
      contractState,
      subscription,
      subscriptionHealth,
      pricing: pricingSummary
        ? {
            tierBase: pricingSummary.baseAmount,
            siteOverage: pricingSummary.tierSiteOverageAmount,
            addonBaseTotal: pricingSummary.addonBaseAmount,
            addonSiteTotal: pricingSummary.addonSiteAmount,
            featureTotal: pricingSummary.featureAmount,
            total: pricingSummary.totalAmount,
            currency: pricingSummary.currency,
            computedAt: latestPricingSnapshot?.lastPriceComputedAt?.toISOString() ?? pricingSummary.computedAt,
            snapshotTotal: latestPricingSnapshot?.effectiveMonthlyAmount ?? null,
            lineItems: pricingSummary.lineItems,
          }
        : null,
      addons,
      features,
      admins,
      users,
      sites,
      supportSessions,
      auditEvents,
      incidents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load workspace overview";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
