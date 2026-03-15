"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Sparkles, TriangleAlert } from "lucide-react";
import { executeOperation, fetchCommercialCenter, fetchWorkspaceOverview } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { CommercialCenterData, WorkspaceOverview } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import {
  AddonStateDialog,
  ApplyTemplateDialog,
  AssignTierDialog,
  BundleFeatureMapDialog,
  BundleUpsertDialog,
  CatalogSyncDialog,
  RecomputePricingDialog,
  SubscriptionStatusDialog,
} from "@/components/admin-portal/wizards/commercial-center-wizards";

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString();
}

function getPlatformInitialView(view?: string) {
  if (view === "templates" || view === "bundles" || view === "catalog") return view;
  return "subscriptions";
}

function getCompanyInitialView(view?: string) {
  if (view === "templates" || view === "addons" || view === "features") return view;
  return "subscription";
}

function featureGroupKey(featureKey: string) {
  const [domain] = featureKey.split(".");
  return domain?.toUpperCase() || "GENERAL";
}

export function CommercialCenterPage({
  companyId,
  initialView,
}: {
  companyId?: string;
  initialView?: string;
}) {
  const { actorEmail, companies } = useAdminShell();
  const [commercial, setCommercial] = useState<CommercialCenterData | null>(null);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [featureSearch, setFeatureSearch] = useState("");
  const [featureReason, setFeatureReason] = useState("");
  const [featureDraft, setFeatureDraft] = useState<Record<string, boolean>>({});
  const [savingFeatures, setSavingFeatures] = useState(false);

  const isCompanyScope = Boolean(companyId);
  const [view, setView] = useState(() => (companyId ? getCompanyInitialView(initialView) : getPlatformInitialView(initialView)));

  useEffect(() => {
    setView(companyId ? getCompanyInitialView(initialView) : getPlatformInitialView(initialView));
  }, [companyId, initialView]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [commercialPayload, workspacePayload] = await Promise.all([
          fetchCommercialCenter(),
          companyId ? fetchWorkspaceOverview(companyId) : Promise.resolve(null),
        ]);

        if (!ignore) {
          setCommercial(commercialPayload);
          setOverview(workspacePayload);
          setFeatureDraft(
            workspacePayload
              ? Object.fromEntries(workspacePayload.features.map((feature) => [feature.feature, feature.enabled]))
              : {},
          );
          setFeatureReason("");
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load commercial center");
          setCommercial(null);
          setOverview(null);
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

  const items = isCompanyScope
    ? [
        { id: "subscription", label: "Subscription" },
        { id: "templates", label: "Templates", count: commercial?.templates.length ?? 0 },
        { id: "addons", label: "Add-ons", count: overview?.addons.length ?? 0 },
        { id: "features", label: "Feature Access", count: overview?.features.length ?? 0 },
      ]
    : [
        { id: "subscriptions", label: "Subscriptions", count: commercial?.subscriptions.length ?? 0 },
        { id: "templates", label: "Templates", count: commercial?.templates.length ?? 0 },
        { id: "bundles", label: "Bundles", count: commercial?.bundleCatalog.length ?? 0 },
        { id: "catalog", label: "Feature Catalog", count: commercial?.featureCatalog.length ?? 0 },
      ];

  const pendingFeatureChanges = useMemo(() => {
    if (!overview) return 0;
    return overview.features.filter((feature) => featureDraft[feature.feature] !== feature.enabled).length;
  }, [featureDraft, overview]);

  const filteredFeatureGroups = useMemo(() => {
    if (!overview) return [];

    const normalized = featureSearch.trim().toLowerCase();
    const filtered = overview.features.filter((feature) => {
      if (!normalized) return true;
      const haystack = `${feature.featureLabel} ${feature.feature} ${feature.reason ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });

    const groups = new Map<string, typeof filtered>();
    filtered.forEach((feature) => {
      const key = featureGroupKey(feature.feature);
      const bucket = groups.get(key) ?? [];
      bucket.push(feature);
      groups.set(key, bucket);
    });

    return Array.from(groups.entries());
  }, [featureSearch, overview]);

  const saveFeatureDraft = async () => {
    if (!overview || !companyId || pendingFeatureChanges === 0) return;

    setSavingFeatures(true);
    setError(null);
    try {
      for (const feature of overview.features) {
        const nextValue = featureDraft[feature.feature];
        if (nextValue === feature.enabled) continue;
        await executeOperation({
          module: "feature",
          action: "set",
          payload: {
            actor: actorEmail,
            companyId,
            featureKey: feature.feature,
            enabled: nextValue,
            reason: featureReason || undefined,
          },
        });
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save feature changes");
    } finally {
      setSavingFeatures(false);
    }
  };

  const discardFeatureDraft = () => {
    if (!overview) return;
    setFeatureDraft(Object.fromEntries(overview.features.map((feature) => [feature.feature, feature.enabled])));
    setFeatureReason("");
  };

  const resetFeatureDraft = () => {
    refresh();
  };

  if (loading) {
    return (
      <Card className="border-[var(--border)]">
        <CardContent className="py-10 text-sm text-[var(--text-muted)]">Loading commercial center...</CardContent>
      </Card>
    );
  }

  if (error || !commercial || (isCompanyScope && !overview)) {
    return (
      <Card className="border-[var(--border)]">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">{error ?? "Commercial center data is unavailable."}</p>
          <Button variant="outline" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const scopeTitle = isCompanyScope ? `${overview?.company.name ?? "Workspace"} commercial center` : "Commercial Center";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">{isCompanyScope ? "Organization scope" : "Platform scope"}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">Commercial center</Badge>
          </div>
          <h1 className="text-2xl font-semibold">{scopeTitle}</h1>
          <p className="max-w-3xl text-sm text-[var(--text-muted)]">
            Manage plans, templates, bundles, add-ons, and effective feature access with typed flows and pricing-aware reviews.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isCompanyScope ? (
            <>
              <AssignTierDialog
                actorEmail={actorEmail}
                companies={companies}
                plans={commercial.plans}
                fixedCompanyId={companyId}
                defaultTierCode={overview?.subscription?.planCode}
                triggerLabel="Change tier"
                onCompleted={refresh}
              />
              <ApplyTemplateDialog
                actorEmail={actorEmail}
                companies={companies}
                templates={commercial.templates}
                fixedCompanyId={companyId}
                triggerLabel="Apply template"
                buttonVariant="outline"
                onCompleted={refresh}
              />
              <RecomputePricingDialog
                companyId={companyId!}
                companyName={overview?.company.name ?? "Workspace"}
                triggerLabel="Recompute pricing"
                buttonVariant="outline"
                onCompleted={refresh}
              />
            </>
          ) : (
            <>
              <CatalogSyncDialog actorEmail={actorEmail} triggerLabel="Sync catalog" onCompleted={refresh} />
              <BundleUpsertDialog actorEmail={actorEmail} triggerLabel="Create bundle" buttonVariant="outline" onCompleted={refresh} />
              <ApplyTemplateDialog actorEmail={actorEmail} companies={companies} templates={commercial.templates} triggerLabel="Apply template" buttonVariant="outline" onCompleted={refresh} />
            </>
          )}
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <VerticalDataViews items={items} value={view} onValueChange={setView} railLabel="Commercial views">
        {!isCompanyScope && view === "subscriptions" ? (
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Subscriptions</CardTitle>
              <CardDescription>Workspace subscription state, current tier, and direct commercial actions.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Workspace</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Period End</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {commercial.subscriptions.map((subscription) => (
                    <tr key={subscription.id} className="border-t align-top">
                      <td className="px-3 py-3">
                        <Link href={`/admin/clients/${subscription.companyId}`} className="font-medium underline-offset-4 hover:underline">
                          {subscription.companyName ?? subscription.companyId}
                        </Link>
                        <p className="text-xs text-[var(--text-muted)]">{subscription.companySlug ?? subscription.companyId}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p>{subscription.planName ?? "No plan"}</p>
                        <p className="text-xs text-[var(--text-muted)]">{subscription.planCode ?? "No code"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">{subscription.status}</Badge>
                      </td>
                      <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{formatDate(subscription.currentPeriodEnd)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <AssignTierDialog actorEmail={actorEmail} companies={companies} plans={commercial.plans} fixedCompanyId={subscription.companyId} defaultTierCode={subscription.planCode} triggerLabel="Change tier" onCompleted={refresh} />
                          <SubscriptionStatusDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={subscription.companyId} defaultStatus={subscription.status} triggerLabel="Set status" onCompleted={refresh} />
                          <ApplyTemplateDialog actorEmail={actorEmail} companies={companies} templates={commercial.templates} fixedCompanyId={subscription.companyId} triggerLabel="Apply template" onCompleted={refresh} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {view === "templates" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {commercial.templates.map((template) => (
              <Card key={template.code} className="border-[var(--border)]">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{template.label}</CardTitle>
                      <CardDescription>{template.code}</CardDescription>
                    </div>
                    <Badge variant="outline">{template.recommendedTierCode}</Badge>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">{template.description}</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-[var(--text-muted)]">{template.bundleCodes.length} bundles • {template.featureCount} features</p>
                  <div className="flex flex-wrap gap-2">
                    {template.bundleCodes.slice(0, 3).map((bundleCode) => (
                      <Badge key={bundleCode} variant="outline">{bundleCode}</Badge>
                    ))}
                  </div>
                  <ApplyTemplateDialog
                    actorEmail={actorEmail}
                    companies={companies}
                    templates={commercial.templates}
                    fixedCompanyId={companyId}
                    defaultTemplateCode={template.code}
                    triggerLabel={isCompanyScope ? "Apply to workspace" : "Apply template"}
                    onCompleted={refresh}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {!isCompanyScope && view === "bundles" ? (
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Bundle catalog</CardTitle>
              <CardDescription>Global bundle definitions, pricing, and feature mapping.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Bundle</th>
                    <th className="px-3 py-2">Pricing</th>
                    <th className="px-3 py-2">Features</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {commercial.bundleCatalog.map((bundle) => (
                    <tr key={bundle.code} className="border-t align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium">{bundle.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{bundle.code}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-mono">{formatCurrency(bundle.monthlyPrice)}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatCurrency(bundle.additionalSiteMonthlyPrice)}/site</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{bundle.featureKeys.length}</td>
                      <td className="px-3 py-3"><Badge variant="outline">{bundle.source}</Badge></td>
                      <td className="px-3 py-3"><Badge variant={bundle.isActive ? "secondary" : "outline"}>{bundle.isActive ? "ACTIVE" : "INACTIVE"}</Badge></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <BundleUpsertDialog actorEmail={actorEmail} bundle={bundle} triggerLabel="Edit" onCompleted={refresh} />
                          <BundleFeatureMapDialog actorEmail={actorEmail} bundle={bundle} featureCatalog={commercial.featureCatalog} triggerLabel="Map features" onCompleted={refresh} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {!isCompanyScope && view === "catalog" ? (
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Feature catalog</CardTitle>
              <CardDescription>Platform-level feature definitions used by bundles and entitlements.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Feature</th>
                    <th className="px-3 py-2">Key</th>
                    <th className="px-3 py-2">Platform active</th>
                  </tr>
                </thead>
                <tbody>
                  {commercial.featureCatalog.map((feature) => (
                    <tr key={feature.feature} className="border-t">
                      <td className="px-3 py-3">{feature.featureLabel}</td>
                      <td className="px-3 py-3 font-mono text-xs">{feature.feature}</td>
                      <td className="px-3 py-3"><Badge variant={feature.platformActive ? "secondary" : "outline"}>{feature.platformActive ? "ACTIVE" : "INACTIVE"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {isCompanyScope && view === "subscription" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="border-[var(--border)]">
                <CardHeader>
                  <CardDescription>Plan</CardDescription>
                  <CardTitle className="text-lg">{overview?.subscription?.planName ?? "No plan assigned"}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[var(--text-muted)]">{overview?.subscription?.status ?? "No subscription record"}</CardContent>
              </Card>
              <Card className="border-[var(--border)]">
                <CardHeader>
                  <CardDescription>Monthly total</CardDescription>
                  <CardTitle className="font-mono text-lg">{overview?.pricing ? `${formatCurrency(overview.pricing.total)}/mo` : "Unavailable"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-[var(--text-muted)]">
                  <p>Tier base: {overview?.pricing ? formatCurrency(overview.pricing.tierBase) : "N/A"}</p>
                  <p>Add-ons: {overview?.pricing ? formatCurrency(overview.pricing.addonBaseTotal + overview.pricing.addonSiteTotal) : "N/A"}</p>
                </CardContent>
              </Card>
              <Card className="border-[var(--border)]">
                <CardHeader>
                  <CardDescription>Subscription health</CardDescription>
                  <CardTitle className="text-lg">{overview?.subscriptionHealth?.state ?? "No health signal"}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[var(--text-muted)]">{overview?.subscriptionHealth?.reason ?? "No subscription health record found."}</CardContent>
              </Card>
            </div>

            {overview?.subscriptionHealth?.shouldBlock ? (
              <Card className="border-[var(--border)]">
                <CardContent className="flex items-center gap-2 py-4 text-sm text-[#8a1c12]">
                  <TriangleAlert className="h-4 w-4" />
                  {overview.subscriptionHealth.reason}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}

        {isCompanyScope && view === "addons" ? (
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Add-ons</CardTitle>
              <CardDescription>Workspace add-ons, pricing contribution, and enable/disable actions.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Add-on</th>
                    <th className="px-3 py-2">Pricing</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.addons.map((addon) => (
                    <tr key={addon.code} className="border-t align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium">{addon.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{addon.code}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-mono">{formatCurrency(addon.monthlyPrice)}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatCurrency(addon.additionalSiteMonthlyPrice)}/site</p>
                      </td>
                      <td className="px-3 py-3"><Badge variant={addon.enabled ? "secondary" : "outline"}>{addon.enabled ? "ENABLED" : "DISABLED"}</Badge></td>
                      <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{addon.reason ?? "No note"}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end">
                          {addon.enabled ? (
                            <AddonStateDialog actorEmail={actorEmail} companyId={companyId!} addon={addon} enable={false} triggerLabel="Disable" onCompleted={refresh} />
                          ) : (
                            <AddonStateDialog actorEmail={actorEmail} companyId={companyId!} addon={addon} enable={true} triggerLabel="Enable" onCompleted={refresh} />
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

        {isCompanyScope && view === "features" ? (
          <Card className="border-[var(--border)]">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Feature access draft</CardTitle>
                  <CardDescription>Advanced commercial overrides for effective feature state. Save applies only changed flags.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{pendingFeatureChanges} pending</Badge>
                  <Button size="sm" variant="outline" onClick={discardFeatureDraft} disabled={pendingFeatureChanges === 0 || savingFeatures}>Discard</Button>
                  <Button size="sm" variant="outline" onClick={resetFeatureDraft} disabled={savingFeatures}>Reset</Button>
                  <Button size="sm" onClick={() => void saveFeatureDraft()} disabled={pendingFeatureChanges === 0 || savingFeatures}>
                    {savingFeatures ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="space-y-1">
                  <Label>Search features</Label>
                  <Input value={featureSearch} onChange={(event) => setFeatureSearch(event.target.value)} placeholder="Search feature label or key" />
                </div>
                <div className="space-y-1">
                  <Label>Reason for changes</Label>
                  <Input value={featureReason} onChange={(event) => setFeatureReason(event.target.value)} placeholder="Optional reason for this batch" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredFeatureGroups.map(([group, features]) => (
                <div key={group} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{group}</Badge>
                    <span className="text-xs text-[var(--text-muted)]">{features.length} features</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {features.map((feature) => {
                      const value = featureDraft[feature.feature] ?? feature.enabled;
                      const changed = value !== feature.enabled;
                      return (
                        <button
                          key={feature.feature}
                          type="button"
                          onClick={() => setFeatureDraft((current) => ({ ...current, [feature.feature]: !value }))}
                          className={`rounded-[18px] border px-4 py-3 text-left ${changed ? "border-[var(--border-strong)] bg-[var(--surface-muted)]" : "border-[var(--border)] bg-[var(--surface-base)]"}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{feature.featureLabel}</p>
                              <p className="text-xs text-[var(--text-muted)]">{feature.feature}</p>
                            </div>
                            <Badge variant={value ? "secondary" : "outline"}>{value ? "Enabled" : "Disabled"}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-[var(--text-muted)]">{feature.reason ?? "No restriction note"}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </VerticalDataViews>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]">
        <Sparkles className="h-4 w-4" />
        Commercial flows are now typed and guided. Remaining uncovered actions live in advanced tools, not the default operator path.
        {isCompanyScope ? (
          <Link href={`/admin/company/${companyId}/advanced`} className="ml-auto font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
            Open advanced tools
          </Link>
        ) : (
          <Link href="/admin/advanced" className="ml-auto font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
            Open advanced tools
          </Link>
        )}
      </div>
    </section>
  );
}
