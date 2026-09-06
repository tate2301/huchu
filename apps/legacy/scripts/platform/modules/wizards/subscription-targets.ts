import type { OrganizationListItem, PlatformServices, SubscriptionStatusValue, SubscriptionSummary } from "../../types";

export interface SubscriptionTargetSummary {
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  status: SubscriptionStatusValue | null;
  planCode: string | null;
  planName: string | null;
}

function mapSubscriptionRows(rows: SubscriptionSummary[]): Map<string, SubscriptionSummary> {
  const byCompany = new Map<string, SubscriptionSummary>();
  for (const row of rows) {
    if (!byCompany.has(row.companyId)) {
      byCompany.set(row.companyId, row);
    }
  }
  return byCompany;
}

function toTargetSummary(company: OrganizationListItem, subscription: SubscriptionSummary | null): SubscriptionTargetSummary {
  return {
    companyId: company.id,
    companyName: company.name,
    companySlug: company.slug,
    status: subscription?.status ?? null,
    planCode: subscription?.planCode ?? null,
    planName: subscription?.planName ?? null,
  };
}

export async function loadSubscriptionTargets(
  services: PlatformServices,
  focusCompanyId: string | null,
): Promise<SubscriptionTargetSummary[]> {
  const [organizations, subscriptions] = await Promise.all([
    services.org.list({ limit: 100 }),
    services.subscription.list({ limit: 200 }),
  ]);

  const subscriptionsByCompany = mapSubscriptionRows(subscriptions);
  const targets = organizations
    .map((organization) => toTargetSummary(organization, subscriptionsByCompany.get(organization.id) ?? null))
    .sort((left, right) => (left.companyName || left.companySlug || "").localeCompare(right.companyName || right.companySlug || ""));

  if (!focusCompanyId) {
    return targets;
  }

  const focusedIndex = targets.findIndex(
    (row) => row.companyId === focusCompanyId || row.companySlug === focusCompanyId,
  );
  if (focusedIndex <= 0) {
    return targets;
  }

  const [focused] = targets.splice(focusedIndex, 1);
  targets.unshift(focused);
  return targets;
}
