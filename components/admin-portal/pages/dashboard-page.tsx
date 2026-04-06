"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { LifeBuoy, ShieldAlert, Sparkles } from "lucide-react";
import {
  fetchCommercialCenter,
  fetchMetrics,
  fetchReliabilityCluster,
  fetchSupportAccessHub,
  fetchWorkspaceOverview,
} from "@/components/admin-portal/api";
import {
  AdminDistributionChart,
  AdminDonutChart,
  AdminStackedAreaChart,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";
import { FinancialProjectionsCard } from "@/components/charts/financial-projections-card";
import { getQuickActions } from "@/components/admin-portal/shell/admin-config";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type {
  AdminMetricCard,
  CommercialCenterData,
  ReliabilityClusterData,
  SupportAccessHubData,
  WorkspaceOverview,
} from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildRecentDayBuckets,
  buildRecentHourBuckets,
  resolveTimestamp,
} from "@/lib/admin-portal/chart-series";

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMetricValue(metric: {
  id: string;
  value: number;
  currency?: string;
}) {
  if (
    metric.id.includes("mrr") ||
    metric.id.includes("revenue") ||
    metric.id.includes("due") ||
    metric.id.includes("exposure")
  ) {
    return formatCurrency(metric.value, metric.currency ?? "USD");
  }
  return metric.value.toLocaleString();
}

function titleCaseToken(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Unknown";
  return normalized
    .toLowerCase()
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function countBy<T>(
  items: T[],
  getKey: (item: T) => string | null | undefined,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = String(getKey(item) || "Unknown");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

type DistributionDatum = {
  id: string;
  label: string;
  value: number;
  secondary?: string;
  tone?: "default" | "warning" | "danger" | "success";
};

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="admin-metric-card rounded-[14px]shadow-none">
      <p className="text-[11px] font-medium text-[var(--text-muted)] px-4 py-3">
        {label}
      </p>
      <div className="p-2 px-6">
        <p className="mt-3 font-mono text-[1.9rem] tracking-tight font-semibold text-[var(--text-strong)]">
          {value}
        </p>
        {hint ? (
          <p className="mt-4 border-t border-[var(--edge-subtle)] pt-3 text-[12px] text-[var(--text-muted)]">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className=" bg-[var(--surface-base)] shadow-none p-4 lg:pb-6 lg:pt-8 flex flex-col">
      <div className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
        <div className="admin-panel-header">
          <div>
            <p className="text-[15px] font-semibold text-[var(--text-strong)]">
              {title}
            </p>
          </div>
          {meta}
        </div>
      </div>
      <div className="pt-4 flex-1">{children}</div>
    </div>
  );
}

function SurfaceLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: ReactNode;
  detail: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-[var(--table-row-hover-bg)]"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[var(--text-strong)]">
          {title}
        </p>
      </div>
      <p className="mt-1 truncate text-[11px] text-[var(--text-muted)] font-medium">
        {detail}
      </p>
    </Link>
  );
}

export function DashboardPage({ companyId }: { companyId?: string }) {
  const { activeCompanyId, companies } = useAdminShell();
  const [metrics, setMetrics] = useState<AdminMetricCard[]>([]);
  const [commercial, setCommercial] = useState<CommercialCenterData | null>(
    null,
  );
  const [supportHub, setSupportHub] = useState<SupportAccessHubData | null>(
    null,
  );
  const [reliability, setReliability] = useState<ReliabilityClusterData | null>(
    null,
  );
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const scopeCompanyId = companyId ?? activeCompanyId;
  const isCompanyScope = Boolean(scopeCompanyId);
  const quickActions = useMemo(
    () => getQuickActions(scopeCompanyId),
    [scopeCompanyId],
  );

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      setIsLoading(true);
      setError(null);

      try {
        const [
          nextMetrics,
          nextCommercial,
          nextSupport,
          nextReliability,
          nextOverview,
        ] = await Promise.all([
          fetchMetrics(scopeCompanyId),
          fetchCommercialCenter(),
          fetchSupportAccessHub(scopeCompanyId),
          fetchReliabilityCluster(scopeCompanyId),
          scopeCompanyId
            ? fetchWorkspaceOverview(scopeCompanyId)
            : Promise.resolve(null),
        ]);

        if (!ignore) {
          setMetrics(nextMetrics);
          setCommercial(nextCommercial);
          setSupportHub(nextSupport);
          setReliability(nextReliability);
          setOverview(nextOverview);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load dashboard",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();
    return () => {
      ignore = true;
    };
  }, [scopeCompanyId, refreshKey]);

  const refresh = () => setRefreshKey((current) => current + 1);

  const headlineMetrics = useMemo(() => {
    if (!commercial) return [];

    if (isCompanyScope && overview) {
      return [
        {
          id: "workspace-monthly-total",
          label: "Monthly total",
          value: overview.pricing?.total ?? 0,
          currency: overview.pricing?.currency,
          hint: overview.subscription?.planName ?? "No plan",
        },
        {
          id: "workspace-sites",
          label: "Sites",
          value: overview.sites.length,
          hint: "Total",
        },
        {
          id: "workspace-admins",
          label: "Admins",
          value: overview.admins.length,
          hint: "Identity",
        },
        {
          id: "workspace-users",
          label: "Users",
          value: overview.users.length,
          hint: "Total",
        },
        {
          id: "workspace-addons",
          label: "Add-ons",
          value: overview.addons.length,
          hint: "Total",
        },
        {
          id: "workspace-features",
          label: "Enabled features",
          value: overview.features.filter((feature) => feature.enabled).length,
          hint: `${overview.features.length} mapped`,
        },
        {
          id: "workspace-support",
          label: "Support sessions",
          value: overview.supportSessions.length,
          hint: "Total",
        },
        {
          id: "workspace-incidents",
          label: "Incidents",
          value: overview.incidents.length,
          hint: "Reliability",
        },
        {
          id: "workspace-audit",
          label: "Audit events",
          value: overview.auditEvents.length,
          hint: "Recent events",
        },
      ];
    }

    const summary = commercial.overview.summary;
    const byId = new Map(metrics.map((metric) => [metric.id, metric]));
    return [
      {
        id: "committed-mrr",
        label: "Monthly revenue",
        value: summary.committedMrr,
        hint: `${summary.subscribedWorkspaceCount} with plan`,
      },
      {
        id: "due-this-month",
        label: "Due this month",
        value: summary.dueThisMonth,
        hint: "Current period",
      },
      {
        id: "overdue-exposure",
        label: "Past due",
        value: summary.overdueExposure,
        hint: "Needs follow-up",
      },
      {
        id: "at-risk-revenue",
        label: "Revenue at risk",
        value: summary.atRiskRevenue,
        hint: "Due soon or late",
      },
      {
        id: "renewals-30",
        label: "Renewals in 30 days",
        value: summary.next30RenewalValue,
        hint: `${summary.next30RenewalCount} workspaces`,
      },
      {
        id: "orgs",
        label: "Workspaces",
        value: byId.get("orgs")?.value ?? 0,
        hint: "Platform total",
      },
      {
        id: "admins",
        label: "Admins",
        value: byId.get("admins")?.value ?? 0,
        hint: "Identity",
      },
      {
        id: "users",
        label: "Users",
        value: byId.get("users")?.value ?? 0,
        hint: "Operators",
      },
      {
        id: "sites",
        label: "Sites",
        value: byId.get("sites")?.value ?? 0,
        hint: "Total",
      },
      {
        id: "support",
        label: "Support sessions",
        value: supportHub?.sessions.length ?? 0,
        hint: `${supportHub?.requests.length ?? 0} requests`,
      },
      {
        id: "incidents",
        label: "Incidents",
        value: reliability?.incidents.length ?? 0,
        hint: `${reliability?.metrics.length ?? 0} metric samples`,
      },
      {
        id: "audit",
        label: "Audit events",
        value: reliability?.auditEvents.length ?? 0,
        hint: `${reliability?.runbooks.length ?? 0} runbooks`,
      },
    ];
  }, [commercial, isCompanyScope, metrics, overview, reliability, supportHub]);

  const planMixRows = useMemo<DistributionDatum[]>(() => {
    if (!commercial) return [];
    return commercial.overview.planMix.slice(0, 6).map((plan) => ({
      id: plan.planCode,
      label: plan.planName,
      value: plan.workspaceCount,
      secondary: formatCurrency(plan.monthlyAmount),
    }));
  }, [commercial]);

  const subscriptionUpdatedAtByCompany = useMemo(() => {
    const timestamps = new Map<string, number>();
    for (const subscription of commercial?.subscriptions ?? []) {
      const updatedAt = resolveTimestamp(
        subscription.updatedAt,
        subscription.startedAt,
        subscription.endedAt,
        subscription.canceledAt,
      );
      if (updatedAt === null) continue;

      const previous = timestamps.get(subscription.companyId);
      if (previous === undefined || updatedAt > previous) {
        timestamps.set(subscription.companyId, updatedAt);
      }
    }
    return timestamps;
  }, [commercial?.subscriptions]);

  const supportSessionRows = useMemo<DistributionDatum[]>(() => {
    if (!supportHub) return [];
    return Array.from(countBy(supportHub.sessions, (row) => row.status))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "ACTIVE"
            ? "warning"
            : label === "APPROVED"
              ? "success"
              : "default";

        return {
          id: label,
          label: titleCaseToken(label),
          value,
          tone,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [supportHub]);

  const incidentRows = useMemo<DistributionDatum[]>(() => {
    if (!reliability) return [];
    return Array.from(countBy(reliability.incidents, (row) => row.riskLevel))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "CRITICAL" || label === "HIGH"
            ? "danger"
            : label === "MEDIUM"
              ? "warning"
              : "default";

        return {
          id: label,
          label: titleCaseToken(label),
          value,
          tone,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [reliability]);

  const supportAndRiskRows = useMemo(() => {
    if (!supportHub || !reliability) return [];

    const buckets = buildRecentHourBuckets(24, 2);
    const requestTimes = supportHub.requests
      .map((request) =>
        resolveTimestamp(
          request.requestedAt,
          request.createdAt,
          request.updatedAt,
        ),
      )
      .filter((value): value is number => value !== null);
    const sessionTimes = supportHub.sessions
      .map((session) =>
        resolveTimestamp(
          session.startedAt,
          session.createdAt,
          session.updatedAt,
        ),
      )
      .filter((value): value is number => value !== null);
    const riskTimes = reliability.incidents
      .filter((incident) => incident.riskLevel !== "LOW")
      .map((incident) => resolveTimestamp(incident.createdAt))
      .filter((value): value is number => value !== null);

    const countInRange = (times: number[], start: number, end: number) => {
      let total = 0;
      for (const time of times) {
        if (time >= start && time < end) total += 1;
      }
      return total;
    };

    return buckets.map((bucket) => ({
      label: bucket.label,
      tooltipLabel: bucket.tooltipLabel,
      supportSessions: countInRange(sessionTimes, bucket.start, bucket.end),
      supportRequests: countInRange(requestTimes, bucket.start, bucket.end),
      riskLevel: countInRange(riskTimes, bucket.start, bucket.end),
    }));
  }, [reliability, supportHub]);

  const commercialHealthRows = useMemo(() => {
    if (!commercial || !reliability) return [];

    const buckets = buildRecentDayBuckets(84, 7);

    return buckets.map((bucket) => {
      let riskLevel = 0;
      let workspaceStatus = 0;
      let contractState = 0;

      for (const workspace of commercial.overview.workspaces) {
        const updatedAt =
          subscriptionUpdatedAtByCompany.get(workspace.companyId) ??
          resolveTimestamp(workspace.lastPriceComputedAt);

        if (
          updatedAt === null ||
          updatedAt === undefined ||
          updatedAt < bucket.start ||
          updatedAt >= bucket.end
        ) {
          continue;
        }

        if (
          workspace.riskBucket === "AT_RISK" ||
          workspace.riskBucket === "OVERDUE" ||
          workspace.riskBucket === "MISSING"
        ) {
          riskLevel += 1;
        }
      }

      for (const company of companies) {
        const updatedAt = resolveTimestamp(company.updatedAt);
        if (
          updatedAt === null ||
          updatedAt < bucket.start ||
          updatedAt >= bucket.end
        ) {
          continue;
        }

        if (company.status && company.status !== "ACTIVE") {
          workspaceStatus += 1;
        }
      }

      for (const evaluation of reliability.contractEvaluations) {
        const updatedAt = resolveTimestamp(
          evaluation.currentStateUpdatedAt,
          evaluation.subscriptionUpdatedAt,
        );
        if (
          updatedAt === null ||
          updatedAt < bucket.start ||
          updatedAt >= bucket.end
        ) {
          continue;
        }

        if (
          evaluation.currentState !== "ACTIVE" ||
          evaluation.recommendedState !== "ACTIVE"
        ) {
          contractState += 1;
        }
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        riskLevel,
        workspaceStatus,
        contractState,
      };
    });
  }, [commercial, companies, reliability, subscriptionUpdatedAtByCompany]);

  const pricingCompositionRows = useMemo<DistributionDatum[]>(() => {
    if (!overview?.pricing) return [];
    const totals = new Map<string, number>();
    for (const line of overview.pricing.lineItems) {
      totals.set(line.type, (totals.get(line.type) ?? 0) + line.amount);
    }
    return Array.from(totals.entries())
      .map(([label, value]) => ({
        id: label,
        label: titleCaseToken(label),
        value,
        secondary: formatCurrency(value, overview.pricing?.currency),
      }))
      .sort((a, b) => b.value - a.value);
  }, [overview]);

  const featureDomainRows = useMemo<DistributionDatum[]>(() => {
    if (!overview) return [];
    return Array.from(
      countBy(
        overview.features.filter((feature) => feature.enabled),
        (feature) => feature.feature.split(".")[0] ?? "general",
      ),
    )
      .map(([label, value]) => ({
        id: label,
        label: titleCaseToken(label),
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [overview]);

  const auditRows = useMemo<DistributionDatum[]>(() => {
    if (!overview) return [];
    return Array.from(
      countBy(
        overview.auditEvents,
        (event) => event.action?.split(".").slice(0, 2).join(".") ?? "Unknown",
      ),
    )
      .map(([label, value]) => ({
        id: label,
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [overview]);

  const operatorSignals = useMemo(() => {
    if (isCompanyScope && overview) {
      return [
        {
          id: "contract",
          label: "Billing state",
          value: overview.contractState,
          hint: overview.subscriptionHealth?.state ?? "Unknown",
          href: `/admin/company/${scopeCompanyId}/commercial`,
        },
        {
          id: "support",
          label: "Support",
          value: `${overview.supportSessions.length}`,
          hint: "Live sessions",
          href: `/admin/company/${scopeCompanyId}/support-access`,
        },
        {
          id: "reliability",
          label: "Incidents",
          value: `${overview.incidents.length}`,
          hint: "Open",
          href: `/admin/company/${scopeCompanyId}/reliability`,
        },
      ];
    }

    return [
      {
        id: "support-requests",
        label: "Support requests",
        value: `${supportHub?.requests.length ?? 0}`,
        hint: "Waiting",
        href: "/admin/support-access",
      },
      {
        id: "support-sessions",
        label: "Support sessions",
        value: `${supportHub?.sessions.length ?? 0}`,
        hint: "Live",
        href: "/admin/support-access",
      },
      {
        id: "runbooks",
        label: "Runbooks",
        value: `${reliability?.runbooks.length ?? 0}`,
        hint: `${reliability?.executions.length ?? 0} runs`,
        href: "/admin/reliability",
      },
    ];
  }, [isCompanyScope, overview, reliability, scopeCompanyId, supportHub]);

  if (isLoading) {
    return (
      <AdminModuleLoading
        label={
          isCompanyScope
            ? "Loading workspace dashboard"
            : "Loading operations dashboard"
        }
        description="Pulling the latest admin metrics, commercial signals, and reliability activity."
      />
    );
  }

  if (error || !commercial || !supportHub || !reliability) {
    return (
      <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">
            {error ?? "Dashboard data is unavailable."}
          </p>
          <Button variant="outline" onClick={refresh}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="admin-page space-y-12">
      <div>
        <div className="admin-page-header mb-6">
          <h2 className="admin-page-title">
            {isCompanyScope ? "Your summary" : "Operations"}
          </h2>
        </div>

        {!isCompanyScope && (
          <FinancialProjectionsCard
            projections={commercial.overview.projections}
            currency={commercial.overview.workspaces[0]?.currency ?? "USD"}
          />
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {headlineMetrics.map((metric) => (
            <MetricTile
              key={metric.id}
              label={metric.label}
              value={formatMetricValue(metric)}
              hint={metric.hint}
            />
          ))}
        </div>
      </div>

      {!isCompanyScope ? (
        <div className="divide-y">
          <div className="grid gap-3 xl:grid-cols-2 xl:gap-0 xl:[&>*]:py-1 xl:[&>*+*]:border-l xl:[&>*+*]:border-[var(--edge-subtle)] xl:[&>*+*]:pl-6">
            <ChartCard title="Commercial health">
              <AdminStackedAreaChart
                rows={commercialHealthRows}
                series={[
                  {
                    key: "riskLevel",
                    label: "Risk level",
                    color: "var(--warning-500)",
                  },
                  {
                    key: "workspaceStatus",
                    label: "Workspace status",
                    color: "var(--accent-500)",
                  },
                  {
                    key: "contractState",
                    label: "Contract state",
                    color: "var(--danger-500)",
                  },
                ]}
                valueFormatter={(value) => value.toLocaleString()}
                yTickFormatter={(value) => value.toLocaleString()}
                xTickInterval={0}
              />
            </ChartCard>
            <div className="grid gap-3">
              <ChartCard
                title="Plan mix"
                meta={
                  <Badge
                    variant="outline"
                    className="rounded-full px-2 py-0 text-[10px]"
                  >
                    {commercial.overview.planMix.length}
                  </Badge>
                }
              >
                <AdminDonutChart rows={planMixRows} valueLabel="Workspaces" />
              </ChartCard>
            </div>
          </div>

          <div className="grid">
            <ChartCard title="Support and risk">
              <AdminTrendChart
                rows={supportAndRiskRows}
                series={[
                  {
                    key: "supportSessions",
                    label: "Support sessions",
                    color: "var(--primary-500)",
                  },
                  {
                    key: "supportRequests",
                    label: "Support requests",
                    color: "var(--accent-500)",
                  },
                  {
                    key: "riskLevel",
                    label: "Risk level",
                    color: "var(--warning-500)",
                  },
                ]}
                valueFormatter={(value) => value.toLocaleString()}
                yTickFormatter={(value) => value.toLocaleString()}
                xTickInterval={0}
              />
            </ChartCard>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] xl:gap-0 xl:[&>*]:py-1 xl:[&>*+*]:border-l xl:[&>*+*]:border-[var(--edge-subtle)] xl:[&>*+*]:pl-6">
            <ChartCard
              title="Pricing composition"
              meta={
                <Badge
                  variant="outline"
                  className="rounded-full px-2 py-0 text-[10px]"
                >
                  {overview?.pricing?.lineItems.length ?? 0}
                </Badge>
              }
            >
              <AdminDonutChart
                rows={pricingCompositionRows}
                valueLabel="Amount"
              />
            </ChartCard>
            <ChartCard
              title="Feature domains"
              meta={<Sparkles className="h-4 w-4 text-[var(--text-muted)]" />}
            >
              <AdminDonutChart rows={featureDomainRows} valueLabel="Features" />
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <ChartCard
              title="Support"
              meta={<LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />}
            >
              <AdminDistributionChart
                rows={supportSessionRows}
                valueLabel="Sessions"
              />
            </ChartCard>
            <ChartCard
              title="Incidents"
              meta={
                <ShieldAlert className="h-4 w-4 text-[var(--text-muted)]" />
              }
            >
              <AdminDistributionChart
                rows={incidentRows}
                valueLabel="Incidents"
              />
            </ChartCard>
            <ChartCard
              title="Audit events"
              meta={
                <Badge
                  variant="outline"
                  className="rounded-full px-2 py-0 text-[10px]"
                >
                  {overview?.auditEvents.length ?? 0}
                </Badge>
              }
            >
              <AdminDistributionChart rows={auditRows} valueLabel="Events" />
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-0 xl:[&>*]:py-1 xl:[&>*+*]:border-l xl:[&>*+*]:border-[var(--edge-subtle)] xl:[&>*+*]:pl-6">
            <ChartCard title="Operator signals">
              <div className="space-y-2">
                {operatorSignals.map((signal) => (
                  <SurfaceLink
                    key={signal.id}
                    href={signal.href}
                    title={`${signal.label}: ${signal.value}`}
                    detail={signal.hint}
                  />
                ))}
              </div>
            </ChartCard>
            <ChartCard title="Quick links">
              <div className="space-y-2">
                {quickActions.slice(0, 6).map((action) => (
                  <SurfaceLink
                    key={action.id}
                    href={action.href}
                    title={action.label}
                    detail={action.description}
                  />
                ))}
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </section>
  );
}
