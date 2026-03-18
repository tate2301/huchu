"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  LifeBuoy,
  RefreshCcw,
  Search,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  fetchCommercialCenter,
  fetchMetrics,
  fetchReliabilityCluster,
  fetchSupportAccessHub,
  fetchWorkspaceOverview,
} from "@/components/admin-portal/api";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMetricValue(metric: { id: string; value: number; currency?: string }) {
  if (metric.id.includes("mrr") || metric.id.includes("revenue") || metric.id.includes("due") || metric.id.includes("exposure")) {
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

function countBy<T>(items: T[], getKey: (item: T) => string | null | undefined) {
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

function toneClass(tone: DistributionDatum["tone"]) {
  if (tone === "danger") return "bg-[#d9785d]";
  if (tone === "warning") return "bg-[#f3c453]";
  if (tone === "success") return "bg-[#7dbb95]";
  return "bg-[var(--text-strong)]";
}

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
    <div className="rounded-2xl bg-[var(--surface-base)] px-3 py-3 shadow-none">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-[var(--text-strong)]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p> : null}
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
    <Card className="border-none bg-[var(--surface-base)] shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <CardTitle className="text-[15px]">{title}</CardTitle>
        {meta}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DistributionBars({
  rows,
  emptyLabel = "No data",
}: {
  rows: DistributionDatum[];
  emptyLabel?: string;
}) {
  const peak = Math.max(...rows.map((row) => row.value), 1);

  if (rows.length === 0) {
    return <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-8 text-sm text-[var(--text-muted)]">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-[var(--text-strong)]">{row.label}</p>
              {row.secondary ? <p className="truncate text-[11px] text-[var(--text-muted)]">{row.secondary}</p> : null}
            </div>
            <p className="shrink-0 font-mono text-[12px] text-[var(--text-strong)]">{row.value.toLocaleString()}</p>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-subtle)]">
            <div
              className={cn("h-2 rounded-full transition-[width] duration-200 ease-out", toneClass(row.tone))}
              style={{ width: `${Math.max((row.value / peak) * 100, row.value > 0 ? 8 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectionStrip({ projections }: { projections: CommercialCenterData["overview"]["projections"] }) {
  const peak = Math.max(...projections.map((bucket) => bucket.committedAmount), 1);

  return (
    <div className="grid gap-2 md:grid-cols-4">
      {projections.map((bucket) => {
        const committedHeight = Math.max(8, Math.round((bucket.committedAmount / peak) * 52));
        const atRiskHeight = Math.max(0, Math.round((bucket.atRiskAmount / peak) * 52));

        return (
          <div key={bucket.id} className="rounded-2xl bg-[var(--surface-subtle)] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{bucket.label}</p>
              <p className="font-mono text-[11px] text-[var(--text-muted)]">{bucket.workspaceCount}</p>
            </div>
            <div className="mt-3 flex h-14 items-end gap-1.5">
              <div className="w-6 rounded-full bg-[var(--text-strong)]" style={{ height: committedHeight }} />
              <div className="w-6 rounded-full bg-[#f3c453]" style={{ height: atRiskHeight }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-muted)]">Committed</span>
              <span className="font-mono text-[var(--text-strong)]">{formatCurrency(bucket.committedAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-muted)]">At risk</span>
              <span className="font-mono text-[var(--text-strong)]">{formatCurrency(bucket.atRiskAmount)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoadingDashboard() {
  return (
    <section className="space-y-3">
      <div className="grid gap-2 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="rounded-2xl bg-[var(--surface-base)] px-3 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-16" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid gap-3">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </section>
  );
}

export function DashboardPage({ companyId }: { companyId?: string }) {
  const { activeCompany, activeCompanyId, companies, recentCompanies, isLoadingCompanies } = useAdminShell();
  const [metrics, setMetrics] = useState<AdminMetricCard[]>([]);
  const [commercial, setCommercial] = useState<CommercialCenterData | null>(null);
  const [supportHub, setSupportHub] = useState<SupportAccessHubData | null>(null);
  const [reliability, setReliability] = useState<ReliabilityClusterData | null>(null);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const scopeCompanyId = companyId ?? activeCompanyId;
  const isCompanyScope = Boolean(scopeCompanyId);
  const quickActions = useMemo(() => getQuickActions(scopeCompanyId), [scopeCompanyId]);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      setIsLoading(true);
      setError(null);

      try {
        const [nextMetrics, nextCommercial, nextSupport, nextReliability, nextOverview] = await Promise.all([
          fetchMetrics(scopeCompanyId),
          fetchCommercialCenter(),
          fetchSupportAccessHub(scopeCompanyId),
          fetchReliabilityCluster(scopeCompanyId),
          scopeCompanyId ? fetchWorkspaceOverview(scopeCompanyId) : Promise.resolve(null),
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
          setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
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

  const workspaceRows = useMemo(() => {
    const trimmed = workspaceQuery.trim().toLowerCase();
    const preferredRows = recentCompanies.length > 0 ? recentCompanies : companies;
    if (!trimmed) {
      return preferredRows.slice(0, 8);
    }

    return companies
      .filter((company) => {
        const haystack = `${company.name} ${company.slug ?? ""} ${company.id}`.toLowerCase();
        return haystack.includes(trimmed);
      })
      .slice(0, 8);
  }, [companies, recentCompanies, workspaceQuery]);

  const headlineMetrics = useMemo(() => {
    if (!commercial) return [];

    if (isCompanyScope && overview) {
      return [
        { id: "workspace-monthly-total", label: "Monthly Total", value: overview.pricing?.total ?? 0, currency: overview.pricing?.currency, hint: overview.subscription?.planName ?? "No plan" },
        { id: "workspace-sites", label: "Sites", value: overview.sites.length, hint: "Active footprint" },
        { id: "workspace-admins", label: "Admins", value: overview.admins.length, hint: "Identity" },
        { id: "workspace-users", label: "Users", value: overview.users.length, hint: "Operators" },
        { id: "workspace-addons", label: "Add-ons", value: overview.addons.length, hint: "Commercial" },
        { id: "workspace-features", label: "Enabled Features", value: overview.features.filter((feature) => feature.enabled).length, hint: `${overview.features.length} mapped` },
        { id: "workspace-support", label: "Support Sessions", value: overview.supportSessions.length, hint: "Current scope" },
        { id: "workspace-incidents", label: "Incidents", value: overview.incidents.length, hint: "Reliability" },
        { id: "workspace-audit", label: "Audit Events", value: overview.auditEvents.length, hint: "Recent" },
      ];
    }

    const summary = commercial.overview.summary;
    const byId = new Map(metrics.map((metric) => [metric.id, metric]));
    return [
      { id: "committed-mrr", label: "Committed MRR", value: summary.committedMrr, hint: `${summary.subscribedWorkspaceCount} subscribed` },
      { id: "due-this-month", label: "Due This Month", value: summary.dueThisMonth, hint: "Current cycle" },
      { id: "overdue-exposure", label: "Overdue", value: summary.overdueExposure, hint: "Past due" },
      { id: "at-risk-revenue", label: "At Risk", value: summary.atRiskRevenue, hint: "Grace or expiry" },
      { id: "renewals-30", label: "Renewals 30d", value: summary.next30RenewalValue, hint: `${summary.next30RenewalCount} workspaces` },
      { id: "orgs", label: "Workspaces", value: byId.get("orgs")?.value ?? 0, hint: "Platform total" },
      { id: "admins", label: "Admins", value: byId.get("admins")?.value ?? 0, hint: "Identity" },
      { id: "users", label: "Users", value: byId.get("users")?.value ?? 0, hint: "Operators" },
      { id: "sites", label: "Sites", value: byId.get("sites")?.value ?? 0, hint: "Network" },
      { id: "support", label: "Support", value: supportHub?.sessions.length ?? 0, hint: `${supportHub?.requests.length ?? 0} requests` },
      { id: "incidents", label: "Incidents", value: reliability?.incidents.length ?? 0, hint: `${reliability?.metrics.length ?? 0} metric samples` },
      { id: "audit", label: "Audit", value: reliability?.auditEvents.length ?? 0, hint: `${reliability?.runbooks.length ?? 0} runbooks` },
    ];
  }, [commercial, isCompanyScope, metrics, overview, reliability, supportHub]);

  const planMixRows = useMemo<DistributionDatum[]>(() => {
    if (!commercial) return [];
    return commercial.overview.planMix
      .slice(0, 6)
      .map((plan) => ({
        id: plan.planCode,
        label: plan.planName,
        value: plan.workspaceCount,
        secondary: formatCurrency(plan.monthlyAmount),
      }));
  }, [commercial]);

  const dueRows = useMemo<DistributionDatum[]>(() => {
    if (!commercial) return [];
    return Array.from(countBy(commercial.overview.workspaces, (row) => row.dueBucket))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "OVERDUE"
            ? "danger"
            : label === "DUE_THIS_MONTH" || label === "NEXT_30_DAYS"
              ? "warning"
              : label === "FUTURE"
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
  }, [commercial]);

  const riskRows = useMemo<DistributionDatum[]>(() => {
    if (!commercial) return [];
    return Array.from(countBy(commercial.overview.workspaces, (row) => row.riskBucket))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "OVERDUE" ? "danger" : label === "AT_RISK" ? "warning" : label === "HEALTHY" ? "success" : "default";

        return {
          id: label,
          label: titleCaseToken(label),
          value,
          tone,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [commercial]);

  const supportRequestRows = useMemo<DistributionDatum[]>(() => {
    if (!supportHub) return [];
    return Array.from(countBy(supportHub.requests, (row) => row.status))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "PENDING" ? "warning" : label === "ACTIVE" || label === "APPROVED" ? "success" : "default";

        return {
          id: label,
          label: titleCaseToken(label),
          value,
          tone,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [supportHub]);

  const supportSessionRows = useMemo<DistributionDatum[]>(() => {
    if (!supportHub) return [];
    return Array.from(countBy(supportHub.sessions, (row) => row.status))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "ACTIVE" ? "warning" : label === "APPROVED" ? "success" : "default";

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
          label === "CRITICAL" || label === "HIGH" ? "danger" : label === "MEDIUM" ? "warning" : "default";

        return {
          id: label,
          label: titleCaseToken(label),
          value,
          tone,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [reliability]);

  const runbookRows = useMemo<DistributionDatum[]>(() => {
    if (!reliability) return [];
    return Array.from(countBy(reliability.executions, (row) => row.status))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "FAILED" ? "danger" : label === "RUNNING" ? "warning" : label === "SUCCEEDED" ? "success" : "default";

        return {
          id: label,
          label: titleCaseToken(label),
          value,
          tone,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [reliability]);

  const workspaceStatusRows = useMemo<DistributionDatum[]>(() => {
    return Array.from(countBy(companies, (row) => row.status ?? "UNKNOWN"))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "ACTIVE"
            ? "success"
            : label === "SUSPENDED" || label === "PAST_DUE"
              ? "warning"
              : label === "DISABLED"
                ? "danger"
                : "default";

        return {
          id: label,
          label: titleCaseToken(label),
          value,
          tone,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [companies]);

  const contractRows = useMemo<DistributionDatum[]>(() => {
    if (!reliability) return [];
    return Array.from(countBy(reliability.contractEvaluations, (row) => row.recommendedState))
      .map(([label, value]) => {
        const tone: DistributionDatum["tone"] =
          label === "BLOCKED" ? "danger" : label === "WARNING" ? "warning" : "success";

        return {
          id: label,
          label: titleCaseToken(label),
          value,
          tone,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [reliability]);

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
    return Array.from(countBy(overview.auditEvents, (event) => event.action?.split(".").slice(0, 2).join(".") ?? "Unknown"))
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
          label: "Contract",
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
          label: "Reliability",
          value: `${overview.incidents.length}`,
          hint: "Open incidents",
          href: `/admin/company/${scopeCompanyId}/reliability`,
        },
      ];
    }

    return [
      {
        id: "support-requests",
        label: "Support requests",
        value: `${supportHub?.requests.length ?? 0}`,
        hint: "Queue",
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
        hint: `${reliability?.executions.length ?? 0} executions`,
        href: "/admin/reliability",
      },
    ];
  }, [isCompanyScope, overview, reliability, scopeCompanyId, supportHub]);

  if (isLoading) {
    return <LoadingDashboard />;
  }

  if (error || !commercial || !supportHub || !reliability) {
    return (
      <Card className="border-none bg-[var(--surface-base)] shadow-none">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">{error ?? "Dashboard data is unavailable."}</p>
          <Button variant="outline" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">
              {isCompanyScope ? "Workspace" : "Platform"}
            </Badge>
            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">
              {isLoadingCompanies ? "Loading" : `${companies.length} workspaces`}
            </Badge>
          </div>
          <h2 className="text-[1.85rem] font-semibold tracking-tight text-[var(--text-strong)]">
            {isCompanyScope ? `${activeCompany?.name ?? "Workspace"} dashboard` : "Operations dashboard"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={isCompanyScope ? `/admin/company/${scopeCompanyId}/commercial` : "/admin/commercial"}>
              Open commercial
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-6">
        {headlineMetrics.map((metric) => (
          <MetricTile
            key={metric.id}
            label={metric.label}
            value={formatMetricValue(metric)}
            hint={metric.hint}
          />
        ))}
      </div>

      {!isCompanyScope ? (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <ChartCard
              title="Revenue forecast"
              meta={<StatusChip status="Live" showDot />}
            >
              <ProjectionStrip projections={commercial.overview.projections} />
            </ChartCard>

            <div className="grid gap-3">
              <ChartCard title="Plan mix" meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{commercial.overview.planMix.length}</Badge>}>
                <DistributionBars rows={planMixRows} />
              </ChartCard>
              <ChartCard title="Contract pressure" meta={<TriangleAlert className="h-4 w-4 text-[var(--text-muted)]" />}>
                <DistributionBars rows={contractRows} />
              </ChartCard>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <ChartCard title="Due buckets" meta={<Sparkles className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={dueRows} />
            </ChartCard>
            <ChartCard title="Risk buckets" meta={<ShieldAlert className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={riskRows} />
            </ChartCard>
            <ChartCard title="Fleet status" meta={<Building2 className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={workspaceStatusRows} />
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <ChartCard title="Support requests" meta={<LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={supportRequestRows} />
            </ChartCard>
            <ChartCard title="Support sessions" meta={<LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={supportSessionRows} />
            </ChartCard>
            <ChartCard title="Incident severity" meta={<ShieldAlert className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={incidentRows} />
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <ChartCard title="Runbook executions" meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{reliability.executions.length}</Badge>}>
              <DistributionBars rows={runbookRows} />
            </ChartCard>

            <ChartCard title="Workspace jump" meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{companies.length}</Badge>}>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    value={workspaceQuery}
                    onChange={(event) => setWorkspaceQuery(event.target.value)}
                    placeholder="Search workspace"
                    className="h-9 rounded-xl border-none bg-[var(--surface-subtle)] pl-10 shadow-none"
                  />
                </div>
                <div className="space-y-2">
                  {workspaceRows.map((workspace) => (
                    <Link
                      key={workspace.id}
                      href={`/admin/clients/${workspace.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-subtle)] px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.84)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--text-strong)]">{workspace.name}</p>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">{workspace.slug ?? workspace.id}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                    </Link>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <ChartCard title="Pricing composition" meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{overview?.pricing?.lineItems.length ?? 0}</Badge>}>
              <DistributionBars rows={pricingCompositionRows} />
            </ChartCard>
            <ChartCard title="Feature domains" meta={<Sparkles className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={featureDomainRows} />
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <ChartCard title="Support" meta={<LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={supportSessionRows} />
            </ChartCard>
            <ChartCard title="Reliability" meta={<ShieldAlert className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={incidentRows} />
            </ChartCard>
            <ChartCard title="Audit actions" meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{overview?.auditEvents.length ?? 0}</Badge>}>
              <DistributionBars rows={auditRows} />
            </ChartCard>
          </div>
        </>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <ChartCard title="Action queue" meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{quickActions.length}</Badge>}>
          <div className="grid gap-2 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                asChild
                variant="outline"
                className="h-auto justify-between rounded-2xl border-none bg-[var(--surface-subtle)] px-3 py-3 text-left shadow-none"
              >
                <Link href={action.href}>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{action.label}</span>
                    <span className="mt-1 block text-[11px] text-[var(--text-muted)]">{action.scope}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              </Button>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Signals" meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{operatorSignals.length}</Badge>}>
          <div className="space-y-2">
            {operatorSignals.map((signal) => (
              <Link
                key={signal.id}
                href={signal.href}
                className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-subtle)] px-3 py-3 transition-colors hover:bg-[rgba(255,255,255,0.84)]"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--text-strong)]">{signal.label}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{signal.hint}</p>
                </div>
                <p className="font-mono text-base font-semibold text-[var(--text-strong)]">{signal.value}</p>
              </Link>
            ))}
          </div>
        </ChartCard>
      </div>
    </section>
  );
}
