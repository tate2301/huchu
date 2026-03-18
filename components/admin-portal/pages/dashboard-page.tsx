"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  LifeBuoy,
  RefreshCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { fetchMetrics } from "@/components/admin-portal/api";
import { getQuickActions } from "@/components/admin-portal/shell/admin-config";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { AdminMetricCard } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";

function metricPresentation(metric: AdminMetricCard) {
  if (metric.id === "revenue") {
    return `$${metric.value.toLocaleString()}`;
  }
  return metric.value.toLocaleString();
}

export function DashboardPage({ companyId }: { companyId?: string }) {
  const { activeCompany, activeCompanyId, companies, recentCompanies, isLoadingCompanies } = useAdminShell();
  const [metrics, setMetrics] = useState<AdminMetricCard[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const scopeCompanyId = companyId ?? activeCompanyId;
  const quickActions = useMemo(() => getQuickActions(scopeCompanyId), [scopeCompanyId]);

  useEffect(() => {
    let ignore = false;

    async function loadMetrics() {
      setIsLoadingMetrics(true);
      setMetricsError(null);
      try {
        const nextMetrics = await fetchMetrics(scopeCompanyId);
        if (!ignore) {
          setMetrics(nextMetrics);
        }
      } catch (error) {
        if (!ignore) {
          setMetrics([]);
          setMetricsError(error instanceof Error ? error.message : "Failed to load dashboard metrics");
        }
      } finally {
        if (!ignore) {
          setIsLoadingMetrics(false);
        }
      }
    }

    void loadMetrics();
    return () => {
      ignore = true;
    };
  }, [scopeCompanyId]);

  const displayMetrics = useMemo(() => metrics.slice(0, 4), [metrics]);

  const operatorSignals = useMemo(() => {
    const lookup = new Map(metrics.map((metric) => [metric.id, metric]));
    const incidentCount = lookup.get("health")?.value ?? 0;
    const supportCount = lookup.get("support")?.value ?? 0;
    const auditCount = lookup.get("audit")?.value ?? 0;

    return [
      {
        id: "health",
        label: "Escalations",
        value: incidentCount,
        tone: incidentCount > 0 ? "Need changes" : "Passing",
        hint: incidentCount > 0 ? `${incidentCount} open incident${incidentCount === 1 ? "" : "s"}` : "No open incidents",
        href: scopeCompanyId ? `/admin/company/${scopeCompanyId}/reliability` : "/admin/reliability",
        icon: AlertTriangle,
      },
      {
        id: "support",
        label: "Support sessions",
        value: supportCount,
        tone: supportCount > 0 ? "In progress" : "Pending",
        hint: supportCount > 0 ? `${supportCount} active session${supportCount === 1 ? "" : "s"}` : "No live sessions",
        href: scopeCompanyId ? `/admin/company/${scopeCompanyId}/support-access` : "/admin/support-access",
        icon: LifeBuoy,
      },
      {
        id: "audit",
        label: "Audit review",
        value: auditCount,
        tone: auditCount > 0 ? "In review" : "Pending",
        hint: auditCount > 0 ? `${auditCount} recent event${auditCount === 1 ? "" : "s"}` : "No recent events",
        href: scopeCompanyId ? `/admin/company/${scopeCompanyId}/reliability?view=audit` : "/admin/reliability?view=audit",
        icon: ShieldAlert,
      },
    ];
  }, [metrics, scopeCompanyId]);

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

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">
              {scopeCompanyId ? "Workspace scope" : "Platform scope"}
            </Badge>
            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">{isLoadingCompanies ? "Loading" : `${companies.length} workspaces`}</Badge>
          </div>
          <div>
            <h2 className="text-[1.75rem] font-semibold tracking-tight">
              {scopeCompanyId ? `${activeCompany?.name ?? "Workspace"} command center` : "Operator command center"}
            </h2>
            {scopeCompanyId ? <p className="text-sm text-[var(--text-muted)]">{activeCompany?.slug ?? scopeCompanyId}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" asChild>
            <Link href={scopeCompanyId ? `/admin/company/${scopeCompanyId}/support-access` : "/admin/support-access"}>
              Open support queue
            </Link>
          </Button>
          <Button asChild>
            <Link href={scopeCompanyId ? `/admin/clients/${scopeCompanyId}` : "/admin/clients"}>
              {scopeCompanyId ? "Open workspace" : "Open workspaces"}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-1">
            <CardTitle className="text-lg">Signals</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingMetrics ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-xl bg-[var(--surface-muted)] p-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-8 w-20" />
                    <Skeleton className="mt-2 h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : metricsError ? (
              <div className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">
                {metricsError}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {displayMetrics.map((metric) => (
                  <div key={metric.id} className="rounded-xl bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{metric.label}</p>
                    <p className="mt-1.5 font-mono text-[1.75rem] font-semibold text-[var(--text-strong)]">
                      {metricPresentation(metric)}
                    </p>
                    {metric.hint ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{metric.hint}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-1">
            <CardTitle className="text-lg">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                asChild
                variant={action.scope === "platform" ? "secondary" : "outline"}
                className="h-auto justify-between rounded-xl px-3 py-2 text-left shadow-none"
              >
                <Link href={action.href}>
                  <span className="flex items-center gap-2">
                    <span className="block text-sm font-semibold">{action.label}</span>
                    <Badge variant="outline" className="rounded-full">{action.scope}</Badge>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Queues</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setWorkspaceQuery("")}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {operatorSignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <Link
                  key={signal.id}
                  href={signal.href}
                  className="flex items-start justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.82)]"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.76)]">
                      <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text-strong)]">{signal.label}</p>
                      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{signal.hint}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="font-mono text-xl font-semibold text-[var(--text-strong)]">{signal.value}</p>
                    <StatusChip status={signal.tone} showDot />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Workspace jump</CardTitle>
              </div>
              <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">
                {companies.length} workspaces
              </Badge>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={workspaceQuery}
                onChange={(event) => setWorkspaceQuery(event.target.value)}
                placeholder="Search workspace"
                className="h-9 rounded-xl border-none bg-[var(--surface-muted)] pl-10 shadow-none"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoadingCompanies ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-xl bg-[var(--surface-muted)] p-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </div>
              ))
            ) : workspaceRows.length === 0 ? (
              <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-6 text-sm text-[var(--text-muted)]">
                No workspaces match the current search.
              </div>
            ) : (
              workspaceRows.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/admin/clients/${workspace.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.82)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.76)]">
                      <Building2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--text-strong)]">{workspace.name}</p>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">{workspace.slug ?? workspace.id}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {workspace.status ? <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">{workspace.status}</Badge> : null}
                    <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
