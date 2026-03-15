import { NextResponse } from "next/server";
import { createPlatformServices } from "@/scripts/platform/services";
import { requirePlatformAdminAccess } from "../../../_auth";

export const runtime = "nodejs";

type Params = Promise<{ companyId: string }>;

export async function GET(_request: Request, context: { params: Params }) {
  const access = await requirePlatformAdminAccess();
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
      plans,
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
      services.subscription.listPlans(),
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
    const plan = subscription?.planCode ? plans.find((row) => row.code === subscription.planCode) ?? null : null;
    const activeSiteCount = sites.filter((site) => site.isActive).length;
    const enabledAddons = addons.filter((addon) => addon.enabled);

    const tierBase = plan?.monthlyPrice ?? 0;
    const siteOverageRate = plan?.additionalSiteMonthlyPrice ?? 0;
    const includedSites = plan?.includedSites ?? 0;
    const siteOverage = Math.max(0, activeSiteCount - includedSites) * siteOverageRate;
    const addonBaseTotal = enabledAddons.reduce((sum, row) => sum + row.monthlyPrice, 0);
    const addonSiteTotal = enabledAddons.reduce((sum, row) => sum + row.additionalSiteMonthlyPrice * activeSiteCount, 0);

    return NextResponse.json({
      company,
      reservation,
      contractState,
      subscription,
      subscriptionHealth,
      pricing: subscription
        ? {
            tierBase,
            siteOverage,
            addonBaseTotal,
            addonSiteTotal,
            total: tierBase + siteOverage + addonBaseTotal + addonSiteTotal,
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
  } finally {
    await services.disconnect();
  }
}
