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

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const variant =
    normalized === "ACTIVE" || normalized === "OPEN"
      ? "secondary"
      : normalized === "DISABLED" || normalized === "SUSPENDED"
        ? "destructive"
        : "outline";
  return <Badge variant={variant}>{value.replaceAll("_", " ")}</Badge>;
}

export function ClientDetailsPage({ companyId }: { companyId: string }) {
  const { actorEmail, companies } = useAdminShell();
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
      <Card className="border-[var(--border)]">
        <CardContent className="py-10 text-sm text-[var(--text-muted)]">Loading workspace overview...</CardContent>
      </Card>
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
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Workspace overview
            </Badge>
            <StatusBadge value={company.tenantStatus} />
            <StatusBadge value={contractState} />
            {subscriptionHealth ? <StatusBadge value={subscriptionHealth.state} /> : null}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{company.name}</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Workspace summary for health, pricing, identity, support posture, and the next operational action.
            </p>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[var(--border)]">
          <CardHeader className="pb-2">
            <CardDescription>Monthly total</CardDescription>
            <CardTitle className="font-mono text-2xl">{pricing ? `${formatCurrency(pricing.total)}/mo` : "No plan"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{subscription?.planName ?? "No plan assigned"}</CardContent>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader className="pb-2">
            <CardDescription>Support posture</CardDescription>
            <CardTitle className="text-2xl">{activeSessions.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">
            {activeSessions.length > 0 ? "Active support sessions" : "No active support sessions"}
          </CardContent>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader className="pb-2">
            <CardDescription>Identity footprint</CardDescription>
            <CardTitle className="text-2xl">{admins.length + users.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{admins.length} admins | {users.length} users</CardContent>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader className="pb-2">
            <CardDescription>Open incidents</CardDescription>
            <CardTitle className="text-2xl">{incidents.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">
            {subscriptionHealth?.reason ?? "No blocking subscription signal"}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          {subscriptionHealth?.shouldBlock || incidents.length > 0 ? (
            <Card className="border-[var(--border)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TriangleAlert className="h-5 w-5 text-[#EC442C]" />
                  Attention needed
                </CardTitle>
                <CardDescription>These items can affect access, support safety, or commercial state for this workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {subscriptionHealth?.shouldBlock ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <p className="text-sm font-semibold text-[var(--text-strong)]">{subscriptionHealth.state.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{subscriptionHealth.reason}</p>
                  </div>
                ) : null}
                {incidents.slice(0, 3).map((incident) => (
                  <div key={incident.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
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

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Workspace state</CardTitle>
              <CardDescription>Summary of operational readiness, access posture, and delivery context.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Subscription</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{subscription?.planName ?? "No plan assigned"}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{subscription?.status ?? "No subscription record"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Subdomain</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{reservation?.subdomain ?? company.slug}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{reservation ? `${reservation.status} via ${reservation.provider}` : "No reservation recorded"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Provisioning</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{company.isProvisioned ? "Provisioned" : "Provisioning pending"}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Created {formatDate(company.createdAt)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Commercial footprint</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{enabledAddons.length} enabled add-ons</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{featurePreview.length} effective features shown below</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-[var(--border)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Sites and reach</CardTitle>
                <CardDescription>Current operating locations and activation state.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sites.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
                    No sites exist for this workspace yet.
                  </p>
                ) : (
                  sites.slice(0, 4).map((site) => (
                    <div key={site.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-strong)]">{site.name}</p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{site.code} | {site.location ?? "Location not set"}</p>
                        </div>
                        <StatusBadge value={site.isActive ? "ACTIVE" : "INACTIVE"} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-[var(--border)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Feature access snapshot</CardTitle>
                <CardDescription>Enabled features that define the current workspace footprint.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {featurePreview.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
                    No enabled features were returned for this workspace.
                  </p>
                ) : (
                  featurePreview.map((feature) => (
                    <div key={feature.feature} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">{feature.featureLabel}</p>
                      <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{feature.feature}</p>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{feature.reason ?? "Enabled through tier, template, or direct access."}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[6.25rem] xl:self-start">
          <Card className="border-[var(--border)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Next actions</CardTitle>
              <CardDescription>Use the focused route for the job you need to do next.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button asChild className="justify-between rounded-2xl">
                <Link href={`/admin/company/${companyId}/identity`}>
                  Identity hub
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between rounded-2xl">
                <Link href={`/admin/company/${companyId}/support-access`}>
                  Support access
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between rounded-2xl">
                <Link href={`/admin/company/${companyId}/reliability`}>
                  Reliability
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between rounded-2xl">
                <Link href={`/admin/company/${companyId}/commercial`}>
                  Commercial
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Context</CardTitle>
              <CardDescription>Keep operational evidence visible while you work.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
                  <LifeBuoy className="h-4 w-4 text-[var(--text-muted)]" />
                  Support state
                </div>
                <p className="mt-2 text-[var(--text-muted)]">
                  {activeSessions.length > 0 ? `${activeSessions.length} active support session(s)` : "No active support sessions"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
                  <ShieldCheck className="h-4 w-4 text-[var(--text-muted)]" />
                  Identity state
                </div>
                <p className="mt-2 text-[var(--text-muted)]">{admins.length} admins and {users.length} users in this workspace.</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
                  <Globe className="h-4 w-4 text-[var(--text-muted)]" />
                  Domain posture
                </div>
                <p className="mt-2 text-[var(--text-muted)]">{reservation ? `${reservation.status} subdomain reservation` : "No subdomain reservation recorded"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
                  <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                  Audit trail
                </div>
                <p className="mt-2 text-[var(--text-muted)]">{auditEvents.length} recent audit event(s) available for review.</p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
