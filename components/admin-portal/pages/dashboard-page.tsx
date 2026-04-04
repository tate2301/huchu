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
    <div className="admin-metric-card rounded-[14px] px-4 py-3 shadow-none">
      <p className="text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-3 font-mono text-[1.9rem] font-semibold leading-none tracking-[-0.04em] text-[var(--text-strong)]">{value}</p>
      {hint ? <p className="mt-4 border-t border-[var(--edge-subtle)] pt-3 text-[12px] text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  meta,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
      <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
        <div className="admin-panel-header">
          <div>
            <CardTitle className="text-[15px] font-semibold text-[var(--text-strong)]">{title}</CardTitle>
            {subtitle ? <p className="admin-panel-subtitle">{subtitle}</p> : null}
          </div>
          {meta}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function SurfaceLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-3 py-3 transition-colors hover:bg-[var(--table-row-hover-bg)]"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[var(--text-strong)]">{title}</p>
        <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{detail}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
    </Link>
  );
}

function LoadingMetricTile() {
  return (
    <div className="admin-metric-card rounded-[14px] px-4 py-3 shadow-none">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-8 w-24" />
      <Skeleton className="mt-4 h-3 w-24" />
    </div>
  );
}

function LoadingSurface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("admin-surface shadow-none", className)}>
      <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
        <div className="admin-panel-header">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {children}
      </CardContent>
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
    <section className="admin-page">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-64" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <LoadingMetricTile key={index} />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <LoadingSurface className="h-full">
          <Skeleton className="h-56 w-full rounded-[12px]" />
        </LoadingSurface>
        <div className="grid gap-3">
          <LoadingSurface>
            <Skeleton className="h-24 w-full rounded-[12px]" />
          </LoadingSurface>
          <LoadingSurface>
            <Skeleton className="h-24 w-full rounded-[12px]" />
          </LoadingSurface>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <LoadingSurface>
          <Skeleton className="h-52 w-full rounded-[12px]" />
        </LoadingSurface>
        <LoadingSurface>
          <Skeleton className="h-52 w-full rounded-[12px]" />
        </LoadingSurface>
        <LoadingSurface>
          <Skeleton className="h-52 w-full rounded-[12px]" />
        </LoadingSurface>
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
      <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">{error ?? "Dashboard data is unavailable."}</p>
          <Button variant="outline" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="admin-page-kicker">
              {isCompanyScope
                ? activeCompany?.name ?? "Workspace control surface"
                : isLoadingCompanies
                  ? "Loading workspace index"
                  : `${companies.length} workspaces in view`}
            </p>
            <h2 className="admin-page-title">
              {isCompanyScope ? "Your summary" : "Operations dashboard"}
            </h2>
          </div>
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

      {!isCompanyScope ? (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <ChartCard
              title="Revenue forecast"
              subtitle="Committed value and at-risk exposure over the current planning horizon."
              meta={<StatusChip status="Live" showDot />}
            >
              <ProjectionStrip projections={commercial.overview.projections} />
            </ChartCard>

            <div className="grid gap-3">
              <ChartCard
                title="Plan mix"
                subtitle="Subscribed workspaces by commercial tier."
                meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{commercial.overview.planMix.length}</Badge>}
              >
                <DistributionBars rows={planMixRows} />
              </ChartCard>
              <ChartCard
                title="Contract pressure"
                subtitle="Upcoming billing and overdue exposure that needs operator attention."
                meta={<TriangleAlert className="h-4 w-4 text-[var(--text-muted)]" />}
              >
                <DistributionBars rows={contractRows} />
              </ChartCard>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <ChartCard title="Due buckets" subtitle="Workspaces grouped by billing timing." meta={<Sparkles className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={dueRows} />
            </ChartCard>
            <ChartCard title="Risk buckets" subtitle="Commercial health ranked by urgency." meta={<ShieldAlert className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={riskRows} />
            </ChartCard>
            <ChartCard title="Fleet status" subtitle="Workspace contract state across the fleet." meta={<Building2 className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={workspaceStatusRows} />
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <ChartCard title="Support requests" subtitle="Request volume by queue status." meta={<LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={supportRequestRows} />
            </ChartCard>
            <ChartCard title="Support sessions" subtitle="Live and expired sessions by current state." meta={<LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={supportSessionRows} />
            </ChartCard>
            <ChartCard title="Incident severity" subtitle="Open incident distribution across the platform." meta={<ShieldAlert className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={incidentRows} />
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <ChartCard
              title="Runbook executions"
              subtitle="Recent automation activity and operator-triggered remediations."
              meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{reliability.executions.length}</Badge>}
            >
              <DistributionBars rows={runbookRows} />
            </ChartCard>

            <ChartCard
              title="Workspace jump"
              subtitle="Search and move directly into a workspace command surface."
              meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{companies.length}</Badge>}
            >
              <div className="space-y-2">
                <div className="admin-table-search">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    value={workspaceQuery}
                    onChange={(event) => setWorkspaceQuery(event.target.value)}
                    placeholder="Search workspace"
                    className="h-9 pl-10 shadow-none"
                  />
                </div>
                <div className="space-y-2">
                  {workspaceRows.map((workspace) => (
                    <SurfaceLink
                      key={workspace.id}
                      href={`/admin/clients/${workspace.id}`}
                      title={workspace.name}
                      detail={workspace.slug ?? workspace.id}
                    />
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <ChartCard
              title="Pricing composition"
              subtitle="Recurring pricing lines that define this workspace contract."
              meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{overview?.pricing?.lineItems.length ?? 0}</Badge>}
            >
              <DistributionBars rows={pricingCompositionRows} />
            </ChartCard>
            <ChartCard title="Feature domains" subtitle="Enabled features grouped by product domain." meta={<Sparkles className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={featureDomainRows} />
            </ChartCard>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <ChartCard title="Support" subtitle="Current support request and session distribution." meta={<LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={supportSessionRows} />
            </ChartCard>
            <ChartCard title="Reliability" subtitle="Incident exposure for the active workspace." meta={<ShieldAlert className="h-4 w-4 text-[var(--text-muted)]" />}>
              <DistributionBars rows={incidentRows} />
            </ChartCard>
            <ChartCard title="Audit actions" subtitle="Recent audit trail volume and verification activity." meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{overview?.auditEvents.length ?? 0}</Badge>}>
              <DistributionBars rows={auditRows} />
            </ChartCard>
          </div>
        </>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <ChartCard title="Action queue" subtitle="Direct links into the highest-value operator workflows." meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{quickActions.length}</Badge>}>
          <div className="grid gap-2 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                asChild
                variant="outline"
                className="h-auto justify-between rounded-[12px] border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-3 py-3 text-left shadow-none"
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

        <ChartCard title="Signals" subtitle="Operator-facing alerts and follow-up work across admin modules." meta={<Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">{operatorSignals.length}</Badge>}>
          <div className="space-y-2">
            {operatorSignals.map((signal) => (
              <SurfaceLink
                key={signal.id}
                href={signal.href}
                title={signal.label}
                detail={`${signal.value} - ${signal.hint}`}
              />
            ))}
          </div>
        </ChartCard>
      </div>
    </section>
  );
}
