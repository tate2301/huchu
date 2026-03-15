"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, LifeBuoy, RefreshCcw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { fetchWorkspaceOverview } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { WorkspaceOverview } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import {
  CreateSiteDialog,
  OrgStatusDialog,
  ReserveSubdomainDialog,
  SiteStatusDialog,
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

function getInitialView() {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace("#", "");
  if (hash === "subscription" || hash === "addons") return "commercial";
  if (hash === "features") return "features";
  if (hash === "audit") return "audit";
  return "overview";
}

export function ClientDetailsPage({ companyId }: { companyId: string }) {
  const { actorEmail, companies } = useAdminShell();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [view, setView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setView(getInitialView());
    const onHashChange = () => setView(getInitialView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
  const items = [
    { id: "overview", label: "Overview" },
    { id: "commercial", label: "Commercial", count: overview?.addons.length ?? 0 },
    { id: "features", label: "Features", count: overview?.features.length ?? 0 },
    { id: "sites", label: "Sites", count: overview?.sites.length ?? 0 },
    { id: "identity", label: "Identity", count: (overview?.admins.length ?? 0) + (overview?.users.length ?? 0) },
    { id: "audit", label: "Audit", count: overview?.auditEvents.length ?? 0 },
  ];

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
            <Link href="/admin/clients">Back to clients</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { company, reservation, contractState, subscription, subscriptionHealth, pricing, addons, features, admins, users, sites, supportSessions, auditEvents, incidents } = overview;
  const enabledAddons = addons.filter((addon) => addon.enabled);
  const activeAdmins = admins.filter((admin) => admin.isActive).length;
  const activeUsers = users.filter((user) => user.isActive).length;
  const activeSites = sites.filter((site) => site.isActive).length;
  const activeSessions = supportSessions.filter((session) => session.status === "ACTIVE").length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">Organization workspace</Badge>
            <StatusBadge value={company.tenantStatus} />
            <StatusBadge value={contractState} />
            {subscriptionHealth ? <StatusBadge value={subscriptionHealth.state} /> : null}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{company.name}</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Service-backed workspace overview for pricing, identity, sites, support, and audit.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
            <span>{company.slug}</span>
            <span>|</span>
            <span>{company.counts.activeSites} active sites</span>
            <span>|</span>
            <span>{company.counts.activeUsers} active users</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/company/${companyId}/identity`}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Identity hub
            </Link>
          </Button>
          <SupportRequestDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={companyId} triggerLabel="Request support" buttonVariant="outline" onCompleted={refresh} />
          <CreateSiteDialog actorEmail={actorEmail} companyId={companyId} companyName={company.name} triggerLabel="Create site" onCompleted={refresh} />
          <ReserveSubdomainDialog actorEmail={actorEmail} companyId={companyId} companyName={company.name} currentSubdomain={reservation?.subdomain ?? company.slug} triggerLabel="Reserve subdomain" buttonVariant="outline" onCompleted={refresh} />
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardDescription>Monthly total</CardDescription>
            <CardTitle className="font-mono text-2xl">{pricing ? `${formatCurrency(pricing.total)}/mo` : "No plan"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{subscription?.planName ?? "No plan assigned"} | {enabledAddons.length} enabled add-ons</CardContent>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardDescription>Identity</CardDescription>
            <CardTitle className="text-2xl">{activeAdmins + activeUsers}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{activeAdmins} active admins | {activeUsers} active users</CardContent>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardDescription>Sites and support</CardDescription>
            <CardTitle className="text-2xl">{activeSites + activeSessions}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{activeSites} active sites | {activeSessions} active support sessions</CardContent>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardDescription>Health posture</CardDescription>
            <CardTitle className="text-lg">{subscriptionHealth?.state ?? "No health signal"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-muted)]">{incidents.length} incidents | {reservation ? reservation.status : "No reservation record"}</CardContent>
        </Card>
      </div>

      <VerticalDataViews items={items} value={view} onValueChange={setView} railLabel="Workspace views">
        {view === "overview" ? (
          <div className="space-y-4">
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardTitle className="text-base">Workspace state</CardTitle>
                <CardDescription>Operational state, contract posture, subscription health, and recommended next actions.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Subscription</p>
                  <p className="text-sm font-medium">{subscription?.planName ?? "No plan assigned"}</p>
                  <p className="text-xs text-[var(--text-muted)]">{subscriptionHealth?.reason ?? "No subscription health record found."}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Subdomain</p>
                  <p className="text-sm font-medium">{reservation?.subdomain ?? company.slug}</p>
                  <p className="text-xs text-[var(--text-muted)]">{reservation ? `${reservation.status} via ${reservation.provider}` : "No reservation recorded."}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Provisioning</p>
                  <p className="text-sm font-medium">{company.isProvisioned ? "Provisioned" : "Provisioning pending"}</p>
                  <p className="text-xs text-[var(--text-muted)]">Created {formatDate(company.createdAt)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Next actions</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm"><Link href={`/admin/company/${companyId}/identity`}>Open identity</Link></Button>
                    <Button asChild variant="outline" size="sm"><Link href={`/admin/company/${companyId}/commercial`}>Open commercial center</Link></Button>
                    <Button asChild variant="outline" size="sm"><Link href={`/admin/company/${companyId}/reliability`}>Open reliability</Link></Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {subscriptionHealth?.shouldBlock || incidents.length > 0 ? (
              <Card className="border-[var(--border)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TriangleAlert className="h-4 w-4 text-[#EC442C]" />
                    Attention needed
                  </CardTitle>
                  <CardDescription>Signals that could affect access, billing, or rollout safety for this workspace.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {subscriptionHealth?.shouldBlock ? (
                    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                      <p className="font-semibold">{subscriptionHealth.state.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-[var(--text-muted)]">{subscriptionHealth.reason}</p>
                    </div>
                  ) : null}
                  {incidents.slice(0, 3).map((incident) => (
                    <div key={incident.id} className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">{incident.metricKey}</p>
                        <StatusBadge value={incident.status} />
                      </div>
                      <p className="mt-1 text-[var(--text-muted)]">{incident.message}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}

        {view === "commercial" ? (
          <Card className="border-[var(--border)]" id="subscription">
            <CardHeader>
              <CardTitle className="text-base">Commercial state</CardTitle>
              <CardDescription>Pricing breakdown and add-on posture for this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Plan</p>
                  <p className="mt-2 font-semibold">{subscription?.planName ?? "No plan"}</p>
                  <p className="mt-1 text-[var(--text-muted)]">{subscription?.status ?? "No subscription record"}</p>
                </div>
                <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Pricing</p>
                  <p className="mt-2 font-mono text-lg">{pricing ? `${formatCurrency(pricing.total)}/mo` : "Unavailable"}</p>
                  <p className="mt-1 text-[var(--text-muted)]">Tier base {pricing ? formatCurrency(pricing.tierBase) : "N/A"}</p>
                </div>
                <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Usage</p>
                  <p className="mt-2 font-semibold">{activeSites} active sites</p>
                  <p className="mt-1 text-[var(--text-muted)]">{enabledAddons.length} enabled add-ons</p>
                </div>
              </div>

              <table className="w-full text-sm" id="addons">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Add-on</th>
                    <th className="px-3 py-2">Base</th>
                    <th className="px-3 py-2">Per site</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {addons.map((addon) => (
                    <tr key={addon.code} className="border-t">
                      <td className="px-3 py-3"><p className="font-medium">{addon.name}</p><p className="text-xs text-[var(--text-muted)]">{addon.code}</p></td>
                      <td className="px-3 py-3 font-mono">{formatCurrency(addon.monthlyPrice)}</td>
                      <td className="px-3 py-3 font-mono">{formatCurrency(addon.additionalSiteMonthlyPrice)}</td>
                      <td className="px-3 py-3"><StatusBadge value={addon.enabled ? "ACTIVE" : "INACTIVE"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {view === "features" ? (
          <Card className="border-[var(--border)]" id="features">
            <CardHeader>
              <CardTitle className="text-base">Effective features</CardTitle>
              <CardDescription>Resolved feature access for this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Feature</th>
                    <th className="px-3 py-2">Platform active</th>
                    <th className="px-3 py-2">Enabled</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((feature) => (
                    <tr key={feature.feature} className="border-t">
                      <td className="px-3 py-3"><p className="font-medium">{feature.featureLabel}</p><p className="text-xs text-[var(--text-muted)]">{feature.feature}</p></td>
                      <td className="px-3 py-3"><StatusBadge value={feature.platformActive ? "ACTIVE" : "INACTIVE"} /></td>
                      <td className="px-3 py-3"><StatusBadge value={feature.enabled ? "ACTIVE" : "INACTIVE"} /></td>
                      <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{feature.reason ?? "No note"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {view === "sites" ? (
          <Card className="border-[var(--border)]">
            <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">Sites</CardTitle>
                <CardDescription>Workspace sites with activation controls.</CardDescription>
              </div>
              <CreateSiteDialog actorEmail={actorEmail} companyId={companyId} companyName={company.name} triggerLabel="Create site" onCompleted={refresh} />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id} className="border-t">
                      <td className="px-3 py-3"><p className="font-medium">{site.name}</p><p className="text-xs text-[var(--text-muted)]">{site.code}</p></td>
                      <td className="px-3 py-3 text-[var(--text-muted)]">{site.location ?? "Not set"}</td>
                      <td className="px-3 py-3"><Badge variant="outline">{site.measurementUnit}</Badge></td>
                      <td className="px-3 py-3"><StatusBadge value={site.isActive ? "ACTIVE" : "INACTIVE"} /></td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end">
                          {site.isActive ? (
                            <SiteStatusDialog actorEmail={actorEmail} site={site} activate={false} triggerLabel="Deactivate" onCompleted={refresh} />
                          ) : (
                            <SiteStatusDialog actorEmail={actorEmail} site={site} activate={true} triggerLabel="Activate" onCompleted={refresh} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {view === "identity" ? (
          <Card className="border-[var(--border)]">
            <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">Identity snapshot</CardTitle>
                <CardDescription>Admins, users, and support sessions for this workspace.</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/company/${companyId}/identity`}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Open identity hub
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Admins</p>
                <p className="mt-2 text-2xl font-semibold">{admins.length}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Users</p>
                <p className="mt-2 text-2xl font-semibold">{users.length}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Support sessions</p>
                <p className="mt-2 text-2xl font-semibold">{supportSessions.length}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {view === "audit" ? (
          <Card className="border-[var(--border)]" id="audit">
            <CardHeader>
              <CardTitle className="text-base">Audit timeline</CardTitle>
              <CardDescription>Recent workspace actions and operator history.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Actor</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.map((event) => (
                    <tr key={event.id} className="border-t">
                      <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{formatDate(event.timestamp)}</td>
                      <td className="px-3 py-3">{event.actor ?? "Unknown actor"}</td>
                      <td className="px-3 py-3">{event.action ?? "Unknown action"}</td>
                      <td className="px-3 py-3">{event.entityType ?? "Unknown"} {event.entityId ? `| ${event.entityId}` : ""}</td>
                      <td className="px-3 py-3 text-[var(--text-muted)]">{event.reason ?? "No reason provided"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}
      </VerticalDataViews>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]">
        <LifeBuoy className="h-4 w-4" />
        Move between workspace overview, identity, commercial, support, and reliability from here.
        <Link href="/admin/settings" className="ml-auto inline-flex items-center gap-2 font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
          Open settings
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
