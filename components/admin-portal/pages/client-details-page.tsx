"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  Globe,
  LifeBuoy,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { fetchWorkspaceOverview } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { WorkspaceOverview } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CreateSiteDialog,
  OrgStatusDialog,
  ReserveSubdomainDialog,
  SupportRequestDialog,
} from "@/components/admin-portal/wizards/identity-hub-wizards";
import { WorkspaceResetDialog } from "@/components/admin-portal/wizards/workspace-reset-dialog";
import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

function StatusBadge({ value }: { value: unknown }) {
  const label =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? "UNKNOWN"
        : String(value);
  const normalized = label.toUpperCase();
  const variant =
    normalized === "ACTIVE" || normalized === "OPEN"
      ? "secondary"
      : normalized === "DISABLED" || normalized === "SUSPENDED"
        ? "destructive"
        : "outline";
  return <Badge variant={variant}>{label.replaceAll("_", " ")}</Badge>;
}

export function ClientDetailsPage({ companyId }: { companyId: string }) {
  const { actorEmail, companies, roleLabel } = useAdminShell();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchWorkspaceOverview(companyId);
        if (!ignore) {
          setOverview(payload);
        }
      } catch (err) {
        if (!ignore) {
          setOverview(null);
          setError(err instanceof Error ? err.message : "Failed to load workspace overview");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [companyId, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);

  if (loading) {
    return (
      <AdminModuleLoading
        label="Loading workspace overview"
      />
    );
  }

  if (!overview || error) {
    return (
      <Card className="border-[var(--border)]">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">{error ?? "Workspace not found"}</p>
          <Button asChild variant="outline">
            <Link href="/admin/clients">Back to workspaces</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const {
    company,
    reservation,
    contractState,
    subscription,
    subscriptionHealth,
    pricing,
    addons,
    features,
    admins,
    users,
    sites,
    supportSessions,
    auditEvents,
    incidents,
  } = overview;

  const enabledAddons = addons.filter((addon) => addon.enabled);
  const activeSessions = supportSessions.filter((session) => session.status === "ACTIVE");
  const activeSites = sites.filter((site) => site.isActive);
  const activeUsers = users.filter((user) => user.isActive);
  const featurePreview = features.filter((feature) => feature.enabled).slice(0, 6);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">
              Workspace overview
            </Badge>
            <StatusBadge value={company.tenantStatus} />
            <StatusBadge value={contractState} />
            {subscriptionHealth ? <StatusBadge value={subscriptionHealth.state} /> : null}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{company.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
            <span>{company.slug}</span>
            <span>|</span>
            <span>{activeSites.length} active sites</span>
            <span>|</span>
            <span>{activeUsers.length} active users</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SupportRequestDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={companyId} triggerLabel="Request support" onCompleted={refresh} />
          <CreateSiteDialog actorEmail={actorEmail} companyId={companyId} companyName={company.name} triggerLabel="Create site" onCompleted={refresh} />
          <ReserveSubdomainDialog
            actorEmail={actorEmail}
            companyId={companyId}
            companyName={company.name}
            currentSubdomain={reservation?.subdomain ?? company.slug}
            triggerLabel="Reserve subdomain"
            buttonVariant="outline"
            onCompleted={refresh}
          />
          {company.tenantStatus === "ACTIVE" ? (
            <OrgStatusDialog actorEmail={actorEmail} companyId={companyId} companyName={company.name} action="suspend" triggerLabel="Suspend" onCompleted={refresh} />
          ) : (
            <OrgStatusDialog actorEmail={actorEmail} companyId={companyId} companyName={company.name} action="activate" triggerLabel="Activate" onCompleted={refresh} />
          )}
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardHeader className="space-y-1 pb-1">
            <CardDescription>Monthly</CardDescription>
            <CardTitle className="font-mono text-2xl">{pricing ? `${formatCurrency(pricing.total)}/mo` : "No plan"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{subscription?.planName ?? "Unassigned"}</CardContent>
        </Card>
        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardHeader className="space-y-1 pb-1">
            <CardDescription>Support</CardDescription>
            <CardTitle className="font-mono text-2xl">{activeSessions.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{activeSessions.length > 0 ? "Active sessions" : "No live sessions"}</CardContent>
        </Card>
        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardHeader className="space-y-1 pb-1">
            <CardDescription>Identity</CardDescription>
            <CardTitle className="font-mono text-2xl">{admins.length + users.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{admins.length} admins | {users.length} users</CardContent>
        </Card>
        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardHeader className="space-y-1 pb-1">
            <CardDescription>Incidents</CardDescription>
            <CardTitle className="font-mono text-2xl">{incidents.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">
            {subscriptionHealth?.reason ?? "Clear"}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          {subscriptionHealth?.shouldBlock || incidents.length > 0 ? (
            <Card className="bg-[var(--surface-base)] shadow-none">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TriangleAlert className="h-5 w-5 text-[#EC442C]" />
                  Attention needed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {subscriptionHealth?.shouldBlock ? (
                  <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                    <p className="text-sm font-semibold text-[var(--text-strong)]">{subscriptionHealth.state.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{subscriptionHealth.reason}</p>
                  </div>
                ) : null}
                {incidents.slice(0, 3).map((incident) => (
                  <div key={incident.id} className="rounded-xl bg-[var(--surface-muted)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">{incident.metricKey}</p>
                      <StatusBadge value={incident.status} />
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">{incident.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="pb-1">
              <CardTitle className="text-lg">State</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Subscription</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{subscription?.planName ?? "No plan assigned"}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{subscription?.status ?? "No record"}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Subdomain</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{reservation?.subdomain ?? company.slug}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{reservation ? `${reservation.status} via ${reservation.provider}` : "No record"}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Provisioning</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{company.isProvisioned ? "Provisioned" : "Provisioning pending"}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Created {formatDate(company.createdAt)}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Commercial footprint</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{enabledAddons.length} enabled add-ons</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{featurePreview.length} enabled features</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="bg-[var(--surface-base)] shadow-none">
              <CardHeader className="pb-1">
                <CardTitle className="text-lg">Sites</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sites.length === 0 ? (
                  <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-5 text-sm text-[var(--text-muted)]">
                    No sites.
                  </p>
                ) : (
                  sites.slice(0, 4).map((site) => (
                    <div key={site.id} className="rounded-xl bg-[var(--surface-muted)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-strong)]">{site.name}</p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{site.code} | {site.location ?? "No location"}</p>
                        </div>
                        <StatusBadge value={site.isActive ? "ACTIVE" : "INACTIVE"} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="bg-[var(--surface-base)] shadow-none">
              <CardHeader className="pb-1">
                <CardTitle className="text-lg">Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {featurePreview.length === 0 ? (
                  <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-5 text-sm text-[var(--text-muted)]">
                    No enabled features.
                  </p>
                ) : (
                  featurePreview.map((feature) => (
                    <div key={feature.feature} className="rounded-xl bg-[var(--surface-muted)] p-3">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">{feature.featureLabel}</p>
                      <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{feature.feature}</p>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{feature.reason ?? "Enabled"}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-[5rem] xl:self-start">
          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="pb-1">
              <CardTitle className="text-lg">Next actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild className="justify-between rounded-xl shadow-none">
                <Link href={`/admin/company/${companyId}/identity`}>
                  Identity hub
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between rounded-xl shadow-none">
                <Link href={`/admin/company/${companyId}/support-access`}>
                  Support access
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between rounded-xl shadow-none">
                <Link href={`/admin/company/${companyId}/reliability`}>
                  Reliability
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between rounded-xl shadow-none">
                <Link href={`/admin/company/${companyId}/commercial`}>
                  Commercial
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="pb-1">
              <CardTitle className="text-lg">Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
                  <LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />
                  Support state
                </div>
                <p className="mt-2 text-[var(--text-muted)]">
                  {activeSessions.length > 0 ? `${activeSessions.length} active` : "None"}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
                  <ShieldCheck className="h-4 w-4 text-[var(--text-muted)]" />
                  Identity state
                </div>
                <p className="mt-2 text-[var(--text-muted)]">{admins.length} admins | {users.length} users</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
                  <Globe className="h-4 w-4 text-[var(--text-muted)]" />
                  Domain posture
                </div>
                <p className="mt-2 text-[var(--text-muted)]">{reservation ? `${reservation.status}` : "None"}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
                  <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                  Audit trail
                </div>
                <p className="mt-2 text-[var(--text-muted)]">{auditEvents.length} events</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-[var(--surface-base)] shadow-none">
            <CardHeader className="pb-1">
              <CardTitle className="text-lg text-red-700">Danger zone</CardTitle>
              <CardDescription>
                Permanently clear tenant-scoped module data or wipe the full workspace while keeping the company shell and SUPERADMIN access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">
                Use this when you need to clear specific module data or start the tenant over from a clean state.
              </div>
              {roleLabel === "SUPERADMIN" ? (
                <WorkspaceResetDialog
                  actorEmail={actorEmail}
                  companyId={companyId}
                  companyName={company.name}
                  onCompleted={refresh}
                />
              ) : (
                <div className="rounded-xl border border-red-200 bg-white px-3 py-3 text-sm text-red-700">
                  Only SUPERADMIN accounts can open the workspace reset flow.
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
