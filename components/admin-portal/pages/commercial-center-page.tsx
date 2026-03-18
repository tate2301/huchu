"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { executeOperation, fetchCommercialCenter, fetchWorkspaceOverview } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { CommercialCenterData, WorkspaceOverview } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [bundleSearch, setBundleSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [addonSearch, setAddonSearch] = useState("");
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

  const filteredSubscriptions = useMemo(() => {
    const normalized = subscriptionSearch.trim().toLowerCase();
    return commercial?.subscriptions.filter((subscription) => {
      if (!normalized) return true;
      const haystack = `${subscription.companyName ?? ""} ${subscription.companySlug ?? ""} ${subscription.planName ?? ""} ${subscription.planCode ?? ""} ${subscription.status}`.toLowerCase();
      return haystack.includes(normalized);
    }) ?? [];
  }, [commercial?.subscriptions, subscriptionSearch]);

  const filteredTemplates = useMemo(() => {
    const normalized = templateSearch.trim().toLowerCase();
    return commercial?.templates.filter((template) => {
      if (!normalized) return true;
      const haystack = `${template.label} ${template.code} ${template.description} ${template.recommendedTierCode} ${template.bundleCodes.join(" ")}`.toLowerCase();
      return haystack.includes(normalized);
    }) ?? [];
  }, [commercial?.templates, templateSearch]);

  const filteredBundles = useMemo(() => {
    const normalized = bundleSearch.trim().toLowerCase();
    return commercial?.bundleCatalog.filter((bundle) => {
      if (!normalized) return true;
      const haystack = `${bundle.name} ${bundle.code} ${bundle.source} ${bundle.featureKeys.join(" ")}`.toLowerCase();
      return haystack.includes(normalized);
    }) ?? [];
  }, [bundleSearch, commercial?.bundleCatalog]);

  const filteredCatalog = useMemo(() => {
    const normalized = catalogSearch.trim().toLowerCase();
    return commercial?.featureCatalog.filter((feature) => {
      if (!normalized) return true;
      const haystack = `${feature.featureLabel} ${feature.feature}`.toLowerCase();
      return haystack.includes(normalized);
    }) ?? [];
  }, [catalogSearch, commercial?.featureCatalog]);

  const filteredAddons = useMemo(() => {
    if (!overview) return [];
    const normalized = addonSearch.trim().toLowerCase();
    return overview.addons.filter((addon) => {
      if (!normalized) return true;
      const haystack = `${addon.name} ${addon.code} ${addon.reason ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [addonSearch, overview]);

  const filteredFeatures = useMemo(() => {
    if (!overview) return [];
    const normalized = featureSearch.trim().toLowerCase();
    return overview.features.filter((feature) => {
      if (!normalized) return true;
      const haystack = `${feature.featureLabel} ${feature.feature} ${feature.reason ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
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
      <Card className="bg-[var(--surface-base)] shadow-none">
        <CardContent className="py-10 text-sm text-[var(--text-muted)]">Loading commercial center...</CardContent>
      </Card>
    );
  }

  if (error || !commercial || (isCompanyScope && !overview)) {
    return (
      <Card className="bg-[var(--surface-base)] shadow-none">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">{error ?? "Commercial center data is unavailable."}</p>
          <Button variant="outline" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const scopeTitle = isCompanyScope ? `${overview?.company.name ?? "Workspace"} commercial center` : "Commercial Center";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">{isCompanyScope ? "Organization scope" : "Platform scope"}</Badge>
            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">Commercial center</Badge>
          </div>
          <h1 className="text-2xl font-semibold">{scopeTitle}</h1>
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
          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Workspace subscriptions</CardTitle>
                  </div>
                <Badge variant="outline" className="font-mono">{filteredSubscriptions.length} workspaces</Badge>
              </div>
              <div className="w-full md:w-80">
                <Input value={subscriptionSearch} onChange={(event) => setSubscriptionSearch(event.target.value)} placeholder="Search workspace, plan, or status" className="h-9 rounded-xl border-none bg-[var(--surface-muted)] shadow-none" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Workspace</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Period End</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions.map((subscription) => (
                    <tr key={subscription.id} className="border-t border-[var(--border)] align-top">
                      <td className="px-4 py-3">
                        <Link href={`/admin/clients/${subscription.companyId}`} className="font-medium underline-offset-4 hover:underline">
                          {subscription.companyName ?? subscription.companyId}
                        </Link>
                        <p className="text-xs text-[var(--text-muted)]">{subscription.companySlug ?? subscription.companyId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{subscription.planName ?? "No plan"}</p>
                        <p className="text-xs text-[var(--text-muted)]">{subscription.planCode ?? "No code"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{subscription.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{formatDate(subscription.currentPeriodEnd)}</td>
                      <td className="px-4 py-3">
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
          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Template catalog</CardTitle>
                  </div>
                <Badge variant="outline" className="font-mono">{filteredTemplates.length} templates</Badge>
              </div>
              <div className="w-full md:w-80">
                <Input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Search template, tier, or bundle" className="h-9 rounded-xl border-none bg-[var(--surface-muted)] shadow-none" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Recommended tier</th>
                    <th className="px-4 py-3">Bundles</th>
                    <th className="px-4 py-3">Features</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((template) => (
                    <tr key={template.code} className="border-t border-[var(--border)] align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium">{template.label}</p>
                        <p className="text-xs text-[var(--text-muted)]">{template.code}</p>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline">{template.recommendedTierCode}</Badge></td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{template.bundleCodes.join(", ") || "No bundles"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{template.featureCount}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{template.description}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <ApplyTemplateDialog actorEmail={actorEmail} companies={companies} templates={commercial.templates} fixedCompanyId={companyId} defaultTemplateCode={template.code} triggerLabel={isCompanyScope ? "Apply to workspace" : "Apply template"} onCompleted={refresh} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {!isCompanyScope && view === "bundles" ? (
          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Bundle catalog</CardTitle>
                  </div>
                <Badge variant="outline" className="font-mono">{filteredBundles.length} bundles</Badge>
              </div>
              <div className="w-full md:w-80">
                <Input value={bundleSearch} onChange={(event) => setBundleSearch(event.target.value)} placeholder="Search bundle, code, source, or feature" className="h-9 rounded-xl border-none bg-[var(--surface-muted)] shadow-none" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
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
                  {filteredBundles.map((bundle) => (
                    <tr key={bundle.code} className="border-t border-[var(--border)] align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium">{bundle.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{bundle.code}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono">{formatCurrency(bundle.monthlyPrice)}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatCurrency(bundle.additionalSiteMonthlyPrice)}/site</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{bundle.featureKeys.length}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{bundle.source}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={bundle.isActive ? "secondary" : "outline"}>{bundle.isActive ? "ACTIVE" : "INACTIVE"}</Badge></td>
                      <td className="px-4 py-3">
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
          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Feature catalog</CardTitle>
                  </div>
                <Badge variant="outline" className="font-mono">{filteredCatalog.length} features</Badge>
              </div>
              <div className="w-full md:w-80">
                <Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search feature label or key" className="h-9 rounded-xl border-none bg-[var(--surface-muted)] shadow-none" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Feature</th>
                    <th className="px-3 py-2">Key</th>
                    <th className="px-3 py-2">Platform active</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((feature) => (
                    <tr key={feature.feature} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3">{feature.featureLabel}</td>
                      <td className="px-4 py-3 font-mono text-xs">{feature.feature}</td>
                      <td className="px-4 py-3"><Badge variant={feature.platformActive ? "secondary" : "outline"}>{feature.platformActive ? "ACTIVE" : "INACTIVE"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {isCompanyScope && view === "subscription" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <Card className="bg-[var(--surface-base)] shadow-none">
              <CardHeader className="gap-3 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Subscription review</CardTitle>
                  </div>
                  <Badge variant="outline" className="font-mono">{overview?.subscription?.status ?? "No record"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Period End</th>
                      <th className="px-4 py-3 text-right">Monthly total</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[var(--border)] align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium">{overview?.subscription?.planName ?? "No plan assigned"}</p>
                        <p className="text-xs text-[var(--text-muted)]">{overview?.subscription?.planCode ?? "No plan code"}</p>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline">{overview?.subscription?.status ?? "UNASSIGNED"}</Badge></td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{formatDate(overview?.subscription?.currentPeriodEnd)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{overview?.pricing ? `${formatCurrency(overview.pricing.total)}/mo` : "Unavailable"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <AssignTierDialog actorEmail={actorEmail} companies={companies} plans={commercial.plans} fixedCompanyId={companyId} defaultTierCode={overview?.subscription?.planCode} triggerLabel="Change tier" onCompleted={refresh} />
                          <SubscriptionStatusDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={companyId} defaultStatus={overview?.subscription?.status} triggerLabel="Set status" onCompleted={refresh} />
                          <ApplyTemplateDialog actorEmail={actorEmail} companies={companies} templates={commercial.templates} fixedCompanyId={companyId} triggerLabel="Apply template" onCompleted={refresh} />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="space-y-3 xl:sticky xl:top-20">
              <Card className="bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">Pricing snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2.5"><span className="text-[var(--text-muted)]">Monthly total</span><span className="font-mono text-[var(--text-strong)]">{overview?.pricing ? `${formatCurrency(overview.pricing.total)}/mo` : "Unavailable"}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2.5"><span className="text-[var(--text-muted)]">Tier base</span><span className="font-mono text-[var(--text-strong)]">{overview?.pricing ? formatCurrency(overview.pricing.tierBase) : "N/A"}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2.5"><span className="text-[var(--text-muted)]">Add-ons</span><span className="font-mono text-[var(--text-strong)]">{overview?.pricing ? formatCurrency(overview.pricing.addonBaseTotal + overview.pricing.addonSiteTotal) : "N/A"}</span></div>
                </CardContent>
              </Card>
              <Card className="bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">Subscription health</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-[var(--text-muted)]">
                  <p className="font-medium text-[var(--text-strong)]">{overview?.subscriptionHealth?.state ?? "No signal"}</p>
                  <p>{overview?.subscriptionHealth?.reason ?? "No record."}</p>
                  {overview?.subscriptionHealth?.shouldBlock ? (
                    <div className="flex items-start gap-2 rounded-xl bg-[#fff2ef] px-3 py-2.5 text-[#8a1c12]">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{overview.subscriptionHealth.reason}</span>
                    </div>
                  ) : null}
                  <RecomputePricingDialog companyId={companyId!} companyName={overview?.company.name ?? "Workspace"} triggerLabel="Recompute pricing" onCompleted={refresh} />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {isCompanyScope && view === "addons" ? (
          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Workspace add-ons</CardTitle>
                  </div>
                <Badge variant="outline" className="font-mono">{filteredAddons.length} add-ons</Badge>
              </div>
              <div className="w-full md:w-80">
                <Input value={addonSearch} onChange={(event) => setAddonSearch(event.target.value)} placeholder="Search add-on name, code, or reason" className="h-9 rounded-xl border-none bg-[var(--surface-muted)] shadow-none" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
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
                  {filteredAddons.map((addon) => (
                    <tr key={addon.code} className="border-t border-[var(--border)] align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium">{addon.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{addon.code}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono">{formatCurrency(addon.monthlyPrice)}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatCurrency(addon.additionalSiteMonthlyPrice)}/site</p>
                      </td>
                      <td className="px-4 py-3"><Badge variant={addon.enabled ? "secondary" : "outline"}>{addon.enabled ? "ENABLED" : "DISABLED"}</Badge></td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{addon.reason ?? "No note"}</td>
                      <td className="px-4 py-3">
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
          <Card className="bg-[var(--surface-base)] shadow-none">
            <CardHeader className="space-y-3 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Feature access draft</CardTitle>
                  </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">{pendingFeatureChanges} pending</Badge>
                  <Button size="sm" variant="outline" onClick={discardFeatureDraft} disabled={pendingFeatureChanges === 0 || savingFeatures}>Discard</Button>
                  <Button size="sm" variant="outline" onClick={resetFeatureDraft} disabled={savingFeatures}>Reset</Button>
                  <Button size="sm" onClick={() => void saveFeatureDraft()} disabled={pendingFeatureChanges === 0 || savingFeatures}>
                    {savingFeatures ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="space-y-1">
                  <Label className="sr-only">Search features</Label>
                  <Input value={featureSearch} onChange={(event) => setFeatureSearch(event.target.value)} placeholder="Search feature label or key" className="h-9 rounded-xl border-none bg-[var(--surface-muted)] shadow-none" />
                </div>
                <div className="space-y-1">
                  <Label className="sr-only">Reason for changes</Label>
                  <Input value={featureReason} onChange={(event) => setFeatureReason(event.target.value)} placeholder="Reason for this batch of changes" className="h-9 rounded-xl border-none bg-[var(--surface-muted)] shadow-none" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Feature</th>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Current</th>
                    <th className="px-4 py-3">Draft</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeatures.map((feature) => {
                    const value = featureDraft[feature.feature] ?? feature.enabled;
                    const changed = value !== feature.enabled;
                    return (
                      <tr key={feature.feature} className={`border-t border-[var(--border)] align-top ${changed ? "bg-[var(--surface-muted)]" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{feature.featureLabel}</p>
                          <p className="font-mono text-xs text-[var(--text-muted)]">{feature.feature}</p>
                        </td>
                        <td className="px-4 py-3"><Badge variant="outline">{featureGroupKey(feature.feature)}</Badge></td>
                        <td className="px-4 py-3"><Badge variant={feature.enabled ? "secondary" : "outline"}>{feature.enabled ? "Enabled" : "Disabled"}</Badge></td>
                        <td className="px-4 py-3"><Badge variant={value ? "secondary" : "outline"}>{value ? "Enabled" : "Disabled"}</Badge></td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{feature.reason ?? "No restriction note"}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Button size="sm" variant="outline" onClick={() => setFeatureDraft((current) => ({ ...current, [feature.feature]: !value }))}>
                              {value ? "Disable" : "Enable"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}
      </VerticalDataViews>
    </section>
  );
}
