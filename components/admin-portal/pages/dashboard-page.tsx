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
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { fetchMetrics } from "@/components/admin-portal/api";
import { getQuickActions } from "@/components/admin-portal/shell/admin-config";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { AdminMetricCard } from "@/components/admin-portal/types";

const chartPalette = ["#2CA47C", "#4C64D4", "#FCB414", "#EC442C", "#111111", "#9A9A93"];

const fallbackCharts = {
  tiers: [
    { name: "Basic", value: 24 },
    { name: "Standard", value: 32 },
    { name: "Enterprise", value: 18 },
  ],
  addons: [
    { name: "CCTV Suite", value: 28 },
    { name: "Accounting", value: 22 },
    { name: "Analytics Pro", value: 18 },
    { name: "Compliance Pro", value: 12 },
    { name: "Gold Advanced", value: 9 },
  ],
  revenue: [
    { name: "Base Plans", value: 68 },
    { name: "Add-ons", value: 22 },
    { name: "Usage", value: 10 },
  ],
};

const fallbackAlerts = [
  { id: "a1", title: "Plans expiring this week", tone: "In review", hint: "Renewals: Axiom Mining, Kasiya Metals, Apex Drilling." },
  { id: "a2", title: "Clients in grace", tone: "In progress", hint: "Auto-disable of non-core features due within 48 hours." },
  { id: "a3", title: "Catalog drift detected", tone: "Failing", hint: "Review templates and feature bundles before the next billing cycle." },
  { id: "a4", title: "Billing retries pending", tone: "Need changes", hint: "Five webhook events still need replay." },
];

function metricPresentation(metric: AdminMetricCard) {
  if (metric.id === "revenue") {
    return `$${metric.value.toLocaleString()}`;
  }
  return metric.value.toLocaleString();
}

export function DashboardPage({ companyId }: { companyId?: string }) {
  const { activeCompany, activeCompanyId, companies, recentCompanies } = useAdminShell();
  const [metrics, setMetrics] = useState<AdminMetricCard[]>([]);
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const scopeCompanyId = companyId ?? activeCompanyId;
  const quickActions = useMemo(() => getQuickActions(scopeCompanyId), [scopeCompanyId]);

  useEffect(() => {
    void fetchMetrics(scopeCompanyId).then(setMetrics).catch(() => setMetrics([]));
  }, [scopeCompanyId]);

  const displayMetrics = useMemo(() => {
    if (metrics.length > 0) {
      return metrics.slice(0, 8);
    }

    return [
      { id: "clients", label: "Total Clients", value: 74, hint: "Active tenants across the platform." },
      { id: "subscriptions", label: "Active Subscriptions", value: 69, hint: "Includes clients in grace." },
      { id: "revenue", label: "Revenue Estimate", value: 1630, hint: "Monthly recurring USD." },
      { id: "support", label: "Support Sessions", value: 2, hint: "Active operator sessions." },
      { id: "expiring", label: "Expiring Soon", value: 3 },
      { id: "in-grace", label: "In Grace", value: 2 },
      { id: "past-due", label: "Past Due", value: 1 },
      { id: "health", label: "Open Incidents", value: 4 },
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
                  Quick stats, recent warnings, and high-confidence actions for production operations.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">
                {scopeCompanyId ? "Organization scope" : "Platform scope"}
              </Badge>
            </div>

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
            {workspaceRows.map((workspace) => (
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
            ))}
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle className="text-lg">Alerts and operator backlog</CardTitle>
              <CardDescription>Failures, upcoming expirations, and remediation pressure points that need attention.</CardDescription>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-[#EC442C]" />Escalations</div>
                <p className="mt-2 text-2xl font-semibold">4</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><LifeBuoy className="h-4 w-4 text-[#4C64D4]" />Support</div>
                <p className="mt-2 text-2xl font-semibold">2</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-[#F46414]" />Review</div>
                <p className="mt-2 text-2xl font-semibold">7</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {fallbackAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start justify-between gap-3 rounded-[18px] border border-[var(--border)] p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="text-xs text-[var(--text-muted)]">{alert.hint}</p>
                </div>
                <StatusChip status={alert.tone} showDot />
              </div>
            ))}
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fallbackCharts.tiers}>
                <XAxis dataKey="name" />
                <Tooltip cursor={{ fill: "var(--surface-muted)" }} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {fallbackCharts.tiers.map((entry, index) => (
                    <Cell key={entry.name} fill={chartPalette[index % chartPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fallbackCharts.addons}>
                <XAxis dataKey="name" />
                <Tooltip cursor={{ fill: "var(--surface-muted)" }} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {fallbackCharts.addons.map((entry, index) => (
                    <Cell key={entry.name} fill={chartPalette[(index + 1) % chartPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={fallbackCharts.revenue} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={4}>
                  {fallbackCharts.revenue.map((entry, index) => (
                    <Cell key={entry.name} fill={chartPalette[(index + 2) % chartPalette.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
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
            <Link href="/admin/subscriptions" className="rounded-[18px] border border-[var(--border)] p-4 hover:bg-[var(--surface-muted)]">
              <p className="text-sm font-semibold">Review subscription states</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Inspect grace windows, plan health, and monthly totals.</p>
            </Link>
            <Link href="/admin/feature-catalog" className="rounded-[18px] border border-[var(--border)] p-4 hover:bg-[var(--surface-muted)]">
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
            <Link href="/admin/audit-log" className="rounded-[18px] border border-[var(--border)] p-4 hover:bg-[var(--surface-muted)]">
              <p className="text-sm font-semibold">Audit recent actions</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Review operator history, action outcomes, and session evidence.</p>
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
