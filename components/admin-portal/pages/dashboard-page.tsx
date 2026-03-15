"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Coins,
  CreditCard,
  LifeBuoy,
  LineChart,
  RefreshCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { fetchMetrics } from "@/components/admin-portal/api";
import { getQuickActions } from "@/components/admin-portal/shell/admin-config";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { AdminMetricCard } from "@/components/admin-portal/types";

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

  const displayMetrics = useMemo(() => metrics.slice(0, 8), [metrics]);

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
        hint: incidentCount > 0 ? `${incidentCount} open incident(s) need review in reliability.` : "No open reliability incidents right now.",
        icon: AlertTriangle,
        iconClassName: "text-[#EC442C]",
      },
      {
        id: "support",
        label: "Support",
        value: supportCount,
        tone: supportCount > 0 ? "In progress" : "Pending",
        hint: supportCount > 0 ? `${supportCount} live support session(s) are active.` : "No live support sessions are running.",
        icon: LifeBuoy,
        iconClassName: "text-[#4C64D4]",
      },
      {
        id: "audit",
        label: "Review",
        value: auditCount,
        tone: auditCount > 0 ? "In review" : "Pending",
        hint: auditCount > 0 ? `${auditCount} recent audit event(s) are available for review.` : "No recent audit events were returned.",
        icon: ShieldAlert,
        iconClassName: "text-[#F46414]",
      },
    ];
  }, [metrics]);

  const workspaceRows = useMemo(() => {
    const trimmed = workspaceQuery.trim().toLowerCase();
    const preferredRows = recentCompanies.length > 0 ? recentCompanies : companies;
    if (!trimmed) {
      return preferredRows.slice(0, 8);
    }

    return companies.filter((company) => {
      const haystack = `${company.name} ${company.slug ?? ""} ${company.id}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [companies, recentCompanies, workspaceQuery]);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <Card className="border-[var(--border)]">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">
                  {scopeCompanyId ? `${activeCompany?.name ?? "Workspace"} command center` : "Platform command center"}
                </CardTitle>
                <CardDescription>
                  Quick stats, live operational signals, and high-confidence actions for production operations.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">
                {scopeCompanyId ? "Organization scope" : "Platform scope"}
              </Badge>
            </div>

            {isLoadingMetrics ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-3 h-8 w-20" />
                    <Skeleton className="mt-3 h-3 w-36" />
                  </div>
                ))}
              </div>
            ) : metricsError ? (
              <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                {metricsError}
              </div>
            ) : displayMetrics.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
                Live dashboard metrics are not available yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {displayMetrics.map((metric) => (
                  <div
                    key={metric.id}
                    className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{metric.label}</p>
                    <p className="mt-2 font-mono text-2xl font-semibold text-[var(--text-strong)]">
                      {metricPresentation(metric)}
                    </p>
                    {metric.hint ? <p className="mt-2 text-xs text-[var(--text-muted)]">{metric.hint}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </CardHeader>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Quick actions</CardTitle>
                <CardDescription>Launch the most common control-plane workflows without browsing the full catalog.</CardDescription>
              </div>
              <RefreshCcw className="h-4 w-4 text-[var(--text-muted)]" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {quickActions.map((action) => (
                <Button
                  key={action.id}
                  asChild
                  variant={action.scope === "platform" ? "secondary" : "outline"}
                  className="h-auto justify-between rounded-[18px] px-4 py-3 text-left"
                >
                  <Link href={action.href}>
                    <span>
                      <span className="block text-sm font-semibold">{action.label}</span>
                      <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{action.description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </Link>
                </Button>
              ))}
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <Card className="border-[var(--border)]">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Workspace jump</CardTitle>
                <CardDescription>Browse recent organizations and jump into the right operational context quickly.</CardDescription>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {companies.length} workspaces
              </Badge>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={workspaceQuery}
                onChange={(event) => setWorkspaceQuery(event.target.value)}
                placeholder="Search workspace name, slug, or id"
                className="h-11 rounded-2xl pl-10"
              />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {isLoadingCompanies ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-base)] p-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-3 h-3 w-28" />
                  <Skeleton className="mt-5 h-3 w-24" />
                </div>
              ))
            ) : workspaceRows.length === 0 ? (
              <div className="col-span-full rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--surface-base)] px-4 py-6 text-sm text-[var(--text-muted)]">
                No workspaces match the current search.
              </div>
            ) : (
              workspaceRows.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/admin/clients/${workspace.id}`}
                  className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-base)] p-4 transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                        <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{workspace.name}</p>
                      </div>
                      <p className="mt-2 truncate text-xs text-[var(--text-muted)]">{workspace.slug ?? workspace.id}</p>
                    </div>
                    {workspace.status ? <Badge variant="outline">{workspace.status}</Badge> : null}
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>Open workspace</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle className="text-lg">Alerts and operator backlog</CardTitle>
              <CardDescription>Live counts and operational pressure points from the current admin services.</CardDescription>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {isLoadingMetrics ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="mt-3 h-8 w-12" />
                  </div>
                ))
              ) : (
                operatorSignals.map((signal) => {
                  const Icon = signal.icon;
                  return (
                    <div key={signal.id} className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Icon className={`h-4 w-4 ${signal.iconClassName}`} />
                        {signal.label}
                      </div>
                      <p className="mt-2 text-2xl font-semibold">{signal.value}</p>
                    </div>
                  );
                })
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingMetrics ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-[18px] border border-[var(--border)] p-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-3 h-3 w-60" />
                </div>
              ))
            ) : (
              operatorSignals.map((signal) => (
                <div key={signal.id} className="flex items-start justify-between gap-3 rounded-[18px] border border-[var(--border)] p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{signal.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{signal.hint}</p>
                  </div>
                  <StatusChip status={signal.tone} showDot />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" />
              Clients by tier
            </CardTitle>
            <CardDescription>Distribution by plan level.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-6 text-center text-sm text-[var(--text-muted)]">
              {isLoadingMetrics ? "Loading live tier distribution..." : "Live tier distribution will appear here once the analytics feed is connected."}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChart className="h-4 w-4 text-[var(--text-muted)]" />
              Add-on usage
            </CardTitle>
            <CardDescription>Adoption across active workspaces.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-6 text-center text-sm text-[var(--text-muted)]">
              {isLoadingMetrics ? "Loading live add-on analytics..." : "Live add-on adoption will appear here once the analytics feed is connected."}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-[var(--text-muted)]" />
              Revenue mix
            </CardTitle>
            <CardDescription>Plans, add-ons, and usage share.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-6 text-center text-sm text-[var(--text-muted)]">
              {isLoadingMetrics ? "Loading live revenue mix..." : "Live revenue mix will appear here once the billing analytics feed is connected."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-[var(--text-muted)]" />
              Subscription signals
            </CardTitle>
            <CardDescription>Queue the actions that most often impact access and billing confidence.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/admin/commercial?view=subscriptions" className="rounded-[18px] border border-[var(--border)] p-4 hover:bg-[var(--surface-muted)]">
              <p className="text-sm font-semibold">Review subscription states</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Inspect live plan health, renewal timing, and service state.</p>
            </Link>
            <Link href="/admin/commercial?view=bundles" className="rounded-[18px] border border-[var(--border)] p-4 hover:bg-[var(--surface-muted)]">
              <p className="text-sm font-semibold">Inspect catalog drift</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Align bundles, templates, and feature access before changes roll out.</p>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />
              Support and impersonation
            </CardTitle>
            <CardDescription>Launch operator sessions with clear actor context and expiration controls.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/admin/support-access" className="rounded-[18px] border border-[var(--border)] p-4 hover:bg-[var(--surface-muted)]">
              <p className="text-sm font-semibold">Start support access</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Request, approve, shadow, or impersonate with guided safeguards.</p>
            </Link>
            <Link href="/admin/reliability?view=audit" className="rounded-[18px] border border-[var(--border)] p-4 hover:bg-[var(--surface-muted)]">
              <p className="text-sm font-semibold">Audit recent actions</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Review operator history, contract posture, and execution evidence.</p>
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
