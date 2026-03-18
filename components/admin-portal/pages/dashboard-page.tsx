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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        hint: incidentCount > 0 ? `${incidentCount} incident(s) need review in reliability.` : "No open reliability incidents right now.",
        href: scopeCompanyId ? `/admin/company/${scopeCompanyId}/reliability` : "/admin/reliability",
        icon: AlertTriangle,
      },
      {
        id: "support",
        label: "Support sessions",
        value: supportCount,
        tone: supportCount > 0 ? "In progress" : "Pending",
        hint: supportCount > 0 ? `${supportCount} active support session(s) are live.` : "No live support sessions are running.",
        href: scopeCompanyId ? `/admin/company/${scopeCompanyId}/support-access` : "/admin/support-access",
        icon: LifeBuoy,
      },
      {
        id: "audit",
        label: "Audit review",
        value: auditCount,
        tone: auditCount > 0 ? "In review" : "Pending",
        hint: auditCount > 0 ? `${auditCount} recent audit event(s) are available for review.` : "No recent audit events were returned.",
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
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {scopeCompanyId ? "Workspace scope" : "Platform scope"}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Operations first
            </Badge>
          </div>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              {scopeCompanyId ? `${activeCompany?.name ?? "Workspace"} command center` : "Operator command center"}
            </h2>
            <p className="max-w-3xl text-sm text-[var(--text-muted)]">
              Start with active queues, workspace state, and the next safe action. This surface is optimized for support,
              incident triage, and workspace management.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Core signals</CardTitle>
            <CardDescription>Revenue, clients, support, and reliability metrics for the active scope.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingMetrics ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-3 h-8 w-20" />
                    <Skeleton className="mt-3 h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : metricsError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                {metricsError}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {displayMetrics.map((metric) => (
                  <div key={metric.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{metric.label}</p>
                    <p className="mt-2 font-mono text-3xl font-semibold text-[var(--text-strong)]">
                      {metricPresentation(metric)}
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{metric.hint ?? "Live metric"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick actions</CardTitle>
            <CardDescription>Launch the highest-confidence workflows without browsing the full portal.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                asChild
                variant={action.scope === "platform" ? "secondary" : "outline"}
                className="h-auto justify-between rounded-2xl px-4 py-3 text-left"
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
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Operator backlog</CardTitle>
                <CardDescription>Review the queues that most often drive production intervention.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setWorkspaceQuery("")}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {operatorSignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <Link
                  key={signal.id}
                  href={signal.href}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4 transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
                      <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">{signal.label}</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{signal.hint}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="font-mono text-2xl font-semibold text-[var(--text-strong)]">{signal.value}</p>
                    <StatusChip status={signal.tone} showDot />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Workspace jump</CardTitle>
                <CardDescription>Recent and matching workspaces for fast triage handoffs.</CardDescription>
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
          <CardContent className="space-y-2">
            {isLoadingCompanies ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-[var(--border)] p-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-3 h-3 w-28" />
                </div>
              ))
            ) : workspaceRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-8 text-sm text-[var(--text-muted)]">
                No workspaces match the current search.
              </div>
            ) : (
              workspaceRows.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/admin/clients/${workspace.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
                      <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{workspace.name}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{workspace.slug ?? workspace.id}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {workspace.status ? <Badge variant="outline">{workspace.status}</Badge> : null}
                    <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
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
