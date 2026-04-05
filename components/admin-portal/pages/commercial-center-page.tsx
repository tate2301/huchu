"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { executeOperation, fetchCommercialCenter, fetchWorkspaceOverview } from "@/components/admin-portal/api";
import {
  AdminDonutChart,
  AdminStackedBarChart,
  AdminTrendChart,
  AdminWaterfallChart,
} from "@/components/charts/admin-headless-charts";
import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { CommercialCenterData, WorkspaceOverview } from "@/components/admin-portal/types";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import {
  buildFutureDayBuckets,
  buildRecentDayBuckets,
  resolveTimestamp,
} from "@/lib/admin-portal/chart-series";
import { cn } from "@/lib/utils";

type PlatformCommercialRow = CommercialCenterData["overview"]["workspaces"][number];

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString();
}

function getPlatformInitialView(view?: string) {
  if (["overview", "due", "renewals", "workspaces", "templates", "bundles", "catalog"].includes(view ?? "")) {
    return view ?? "overview";
  }
  return "overview";
}

function getCompanyInitialView(view?: string) {
  if (["overview", "templates", "addons", "features"].includes(view ?? "")) {
    return view ?? "overview";
  }
  return "overview";
}

function featureGroupKey(featureKey: string) {
  const [domain] = featureKey.split(".");
  return domain?.toUpperCase() || "GENERAL";
}

function selectClassName() {
  return "h-9 rounded-[12px] border border-[var(--edge-default)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-strong)] shadow-none outline-none";
}

function bucketLabel(value: PlatformCommercialRow["dueBucket"]) {
  switch (value) {
    case "OVERDUE":
      return "Overdue";
    case "DUE_THIS_MONTH":
      return "This month";
    case "NEXT_30_DAYS":
      return "Next 30d";
    case "FUTURE":
      return "Future";
    case "NO_SCHEDULE":
      return "No schedule";
    default:
      return "No subscription";
  }
}

function riskLabel(value: PlatformCommercialRow["riskBucket"]) {
  switch (value) {
    case "HEALTHY":
      return "Healthy";
    case "AT_RISK":
      return "At risk";
    case "OVERDUE":
      return "Overdue";
    default:
      return "Missing";
  }
}

function bucketTone(value: PlatformCommercialRow["riskBucket"] | PlatformCommercialRow["dueBucket"]) {
  if (value === "OVERDUE") return "bg-[#fff2ef] text-[#9a2c1d]";
  if (value === "AT_RISK" || value === "DUE_THIS_MONTH" || value === "NEXT_30_DAYS") return "bg-[#fff7dd] text-[#8a6300]";
  if (value === "HEALTHY" || value === "FUTURE") return "bg-[#ecf8f2] text-[#1d6a4d]";
  return "bg-[var(--surface-muted)] text-[var(--text-muted)]";
}

function relativeDueLabel(row: PlatformCommercialRow) {
  if (row.daysOverdue !== null) return `${row.daysOverdue}d overdue`;
  if (row.daysUntilEnd !== null) return `${row.daysUntilEnd}d`;
  return "No schedule";
}

function CompactPill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "strong" | "warning" | "danger" | "success";
}) {
  const className =
    tone === "danger"
      ? "bg-[#fff2ef] text-[#9a2c1d]"
      : tone === "warning"
        ? "bg-[#fff7dd] text-[#8a6300]"
        : tone === "success"
          ? "bg-[#ecf8f2] text-[#1d6a4d]"
          : tone === "strong"
            ? "bg-[var(--surface-base)] text-[var(--text-strong)]"
            : "bg-[var(--surface-muted)] text-[var(--text-muted)]";

  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
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
    <div className="admin-surface rounded-[14px] px-3 py-3 shadow-none">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-[var(--text-strong)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

function ProjectionStrip({
  projections,
  currency = "USD",
}: {
  projections: CommercialCenterData["overview"]["projections"];
  currency?: string;
}) {
  const rows = projections.map((bucket) => ({
    label: bucket.label,
    tooltipLabel: new Date(bucket.monthStart).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
    revenue: bucket.committedAmount,
    atRisk: bucket.atRiskAmount,
  }));

  return (
    <div className="admin-surface rounded-[14px] px-3 py-3 shadow-none">
      <AdminTrendChart
        rows={rows}
        series={[
          {
            key: "revenue",
            label: "Revenue",
            color: "var(--primary-500)",
          },
          {
            key: "atRisk",
            label: "At risk",
            color: "var(--warning-500)",
          },
        ]}
        valueFormatter={(value) => formatCurrency(value, currency)}
        yTickFormatter={(value) => formatCurrency(value, currency)}
      />
    </div>
  );
}

function WorkspaceRevenueTable({
  rows,
  actorEmail,
  companies,
  plans,
  refresh,
}: {
  rows: PlatformCommercialRow[];
  actorEmail: string;
  companies: ReturnType<typeof useAdminShell>["companies"];
  plans: CommercialCenterData["plans"];
  refresh: () => void;
}) {
  return (
    <div className="admin-surface overflow-x-auto">
      <table className="admin-reference-table w-full min-w-[980px] text-sm">
        <thead className="bg-[var(--table-header-bg)] text-left text-[13px] font-medium text-[var(--table-header-text)]">
          <tr>
            <th className="px-3 py-2">Workspace</th>
            <th className="px-3 py-2">Commercial</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2">Health</th>
            <th className="px-3 py-2 text-right">Footprint</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--table-divider)]">
          {rows.map((row) => (
            <tr key={row.companyId} className="align-top transition-colors hover:bg-[var(--table-row-hover-bg)]">
              <td className="px-3 py-3">
                <Link href={`/admin/company/${row.companyId}/commercial`} className="font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
                  {row.companyName}
                </Link>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{row.companySlug ?? row.companyId}</p>
              </td>
              <td className="px-3 py-3">
                <p className="font-medium text-[var(--text-strong)]">{row.planName ?? "No plan"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-[var(--text-muted)]">{formatCurrency(row.monthlyAmount, row.currency)}/mo</span>
                  {row.subscriptionStatus ? <CompactPill>{row.subscriptionStatus}</CompactPill> : <CompactPill tone="danger">No subscription</CompactPill>}
                </div>
              </td>
              <td className="px-3 py-3">
                <p className="font-mono text-xs text-[var(--text-strong)]">{formatDate(row.currentPeriodEnd)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", bucketTone(row.dueBucket))}>{bucketLabel(row.dueBucket)}</span>
                  <span className="text-xs text-[var(--text-muted)]">{relativeDueLabel(row)}</span>
                </div>
              </td>
              <td className="px-3 py-3">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", bucketTone(row.riskBucket))}>{riskLabel(row.riskBucket)}</span>
                <p className="mt-1 max-w-[18rem] text-xs text-[var(--text-muted)]">{row.healthReason}</p>
              </td>
              <td className="px-3 py-3 text-right">
                <p className="font-mono text-xs text-[var(--text-strong)]">{row.siteCount} sites</p>
                <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{row.addonCount} add-ons</p>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap justify-end gap-2">
                  {row.subscriptionId ? (
                    <RecomputePricingDialog
                      companyId={row.companyId}
                      companyName={row.companyName}
                      triggerLabel="Recompute"
                      buttonVariant="outline"
                      onCompleted={refresh}
                    />
                  ) : null}
                  <SubscriptionStatusDialog
                    actorEmail={actorEmail}
                    companies={companies}
                    fixedCompanyId={row.companyId}
                    defaultStatus={row.subscriptionStatus}
                    triggerLabel="Status"
                    buttonVariant="outline"
                    onCompleted={refresh}
                  />
                  <AssignTierDialog
                    actorEmail={actorEmail}
                    companies={companies}
                    plans={plans}
                    fixedCompanyId={row.companyId}
                    defaultTierCode={row.planCode}
                    triggerLabel="Tier"
                    buttonVariant="outline"
                    onCompleted={refresh}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [renewalWindow, setRenewalWindow] = useState("90");
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
        { id: "overview", label: "Overview" },
        { id: "templates", label: "Templates", count: commercial?.templates.length ?? 0 },
        { id: "addons", label: "Add-ons", count: overview?.addons.length ?? 0 },
        { id: "features", label: "Feature Access", count: overview?.features.length ?? 0 },
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "due", label: "Due now", count: commercial?.overview.dueNow.length ?? 0 },
        { id: "renewals", label: "Renewals", count: commercial?.overview.renewals.length ?? 0 },
        { id: "workspaces", label: "Workspaces", count: commercial?.overview.workspaces.length ?? 0 },
        { id: "templates", label: "Templates", count: commercial?.templates.length ?? 0 },
        { id: "bundles", label: "Bundles", count: commercial?.bundleCatalog.length ?? 0 },
        { id: "catalog", label: "Catalog", count: commercial?.featureCatalog.length ?? 0 },
      ];

  const pendingFeatureChanges = useMemo(() => {
    if (!overview) return 0;
    return overview.features.filter((feature) => featureDraft[feature.feature] !== feature.enabled).length;
  }, [featureDraft, overview]);

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

  const filteredPlatformRows = useMemo(() => {
    const normalized = workspaceSearch.trim().toLowerCase();
    const rows = commercial?.overview.workspaces ?? [];

    return rows
      .filter((row) => {
        const matchesSearch =
          !normalized ||
          `${row.companyName} ${row.companySlug ?? ""} ${row.planName ?? ""} ${row.planCode ?? ""} ${row.subscriptionStatus ?? ""}`.toLowerCase().includes(normalized);
        const matchesStatus = statusFilter === "all" || row.subscriptionStatus === statusFilter;
        const matchesRisk = riskFilter === "all" || row.riskBucket === riskFilter;
        const matchesDue = dueFilter === "all" || row.dueBucket === dueFilter;
        const matchesPlan = planFilter === "all" || row.planCode === planFilter;
        return matchesSearch && matchesStatus && matchesRisk && matchesDue && matchesPlan;
      })
      .sort((left, right) => {
        const riskRank = { OVERDUE: 0, AT_RISK: 1, MISSING: 2, HEALTHY: 3 } as const;
        const leftRank = riskRank[left.riskBucket];
        const rightRank = riskRank[right.riskBucket];
        if (leftRank !== rightRank) return leftRank - rightRank;
        return right.monthlyAmount - left.monthlyAmount;
      });
  }, [commercial?.overview.workspaces, dueFilter, planFilter, riskFilter, statusFilter, workspaceSearch]);

  const filteredDueRows = useMemo(() => {
    const rows = commercial?.overview.dueNow ?? [];
    const normalized = workspaceSearch.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !normalized ||
        `${row.companyName} ${row.companySlug ?? ""} ${row.planName ?? ""} ${row.subscriptionStatus ?? ""}`.toLowerCase().includes(normalized);
      const matchesRisk = riskFilter === "all" || row.riskBucket === riskFilter;
      const matchesStatus = statusFilter === "all" || row.subscriptionStatus === statusFilter;
      return matchesSearch && matchesRisk && matchesStatus;
    });
  }, [commercial?.overview.dueNow, riskFilter, statusFilter, workspaceSearch]);

  const filteredRenewals = useMemo(() => {
    const rows = commercial?.overview.renewals ?? [];
    const normalized = workspaceSearch.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !normalized ||
        `${row.companyName} ${row.companySlug ?? ""} ${row.planName ?? ""} ${row.subscriptionStatus ?? ""}`.toLowerCase().includes(normalized);
      const matchesStatus = statusFilter === "all" || row.subscriptionStatus === statusFilter;
      const matchesPlan = planFilter === "all" || row.planCode === planFilter;
      const matchesWindow =
        renewalWindow === "all" ||
        (renewalWindow === "7" && (row.daysUntilEnd ?? 999) <= 7) ||
        (renewalWindow === "30" && (row.daysUntilEnd ?? 999) <= 30) ||
        (renewalWindow === "90" && (row.daysUntilEnd ?? 999) <= 90);
      return matchesSearch && matchesStatus && matchesPlan && matchesWindow;
    });
  }, [commercial?.overview.renewals, planFilter, renewalWindow, statusFilter, workspaceSearch]);

  const subscriptionActivityRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);
    const starts = (commercial?.subscriptions ?? [])
      .map((subscription) => resolveTimestamp(subscription.startedAt))
      .filter((value): value is number => value !== null);
    const changes = (commercial?.subscriptions ?? [])
      .map((subscription) => resolveTimestamp(subscription.updatedAt))
      .filter((value): value is number => value !== null);
    const endings = (commercial?.subscriptions ?? [])
      .map((subscription) =>
        resolveTimestamp(subscription.endedAt, subscription.canceledAt),
      )
      .filter((value): value is number => value !== null);

    return buckets.map((bucket) => {
      let started = 0;
      let changed = 0;
      let ended = 0;

      for (const value of starts) {
        if (value >= bucket.start && value < bucket.end) started += 1;
      }
      for (const value of changes) {
        if (value >= bucket.start && value < bucket.end) changed += 1;
      }
      for (const value of endings) {
        if (value >= bucket.start && value < bucket.end) ended += 1;
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        started,
        changed,
        ended,
      };
    });
  }, [commercial?.subscriptions]);

  const dueScheduleRows = useMemo(() => {
    const buckets = buildFutureDayBuckets(84, 7);
    const workspaces = commercial?.overview.workspaces ?? [];

    return buckets.map((bucket, index) => {
      let renewals = 0;
      let needAction = 0;

      for (const row of workspaces) {
        const dueAt = resolveTimestamp(row.currentPeriodEnd);
        const isOverdue = row.dueBucket === "OVERDUE";
        const isInBucket =
          dueAt !== null && dueAt >= bucket.start && dueAt < bucket.end;
        const assignOverdueToCurrentBucket = isOverdue && index === 0;

        if (!isInBucket && !assignOverdueToCurrentBucket) {
          continue;
        }

        renewals += 1;

        if (
          isOverdue ||
          row.dueBucket === "DUE_THIS_MONTH" ||
          row.riskBucket === "AT_RISK" ||
          row.riskBucket === "OVERDUE"
        ) {
          needAction += 1;
        }
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        renewals,
        needAction,
      };
    });
  }, [commercial?.overview.workspaces]);

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

  if (loading) {
    return (
      <AdminModuleLoading
        label={isCompanyScope ? "Loading workspace commercials" : "Loading commercial center"}
        description="Preparing plans, renewals, pricing, templates, and feature access controls."
      />
    );
  }

  if (error || !commercial || (isCompanyScope && !overview)) {
    return (
      <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">{error ?? "Commercial center data is unavailable."}</p>
          <Button variant="outline" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const scopeTitle = isCompanyScope ? overview?.company.name ?? "Workspace commercial" : "Commercial";
  const planOptions = Array.from(new Set((commercial.overview.workspaces ?? []).map((row) => row.planCode).filter(Boolean))) as string[];
  const summary = commercial.overview.summary;
  const exposureWaterfallRows = [
    { id: "committed", label: "Committed", value: summary.committedMrr, color: "var(--primary-500)" },
    { id: "past-due", label: "Past due", value: -summary.overdueExposure, color: "var(--danger-500)" },
    { id: "at-risk", label: "At risk", value: -summary.atRiskRevenue, color: "var(--warning-500)" },
    { id: "renewals", label: "30d renewals", value: summary.next30RenewalValue, color: "var(--accent-500)" },
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="admin-page-kicker">
              {isCompanyScope ? overview?.company.slug ?? "Workspace billing and access" : "Revenue, plans, and access"}
            </p>
            <h1 className="admin-page-title">{scopeTitle}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isCompanyScope ? (
            <>
              <AssignTierDialog actorEmail={actorEmail} companies={companies} plans={commercial.plans} fixedCompanyId={companyId} defaultTierCode={overview?.subscription?.planCode} triggerLabel="Change tier" onCompleted={refresh} />
              <SubscriptionStatusDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={companyId} defaultStatus={overview?.subscription?.status} triggerLabel="Set status" onCompleted={refresh} />
              <ApplyTemplateDialog actorEmail={actorEmail} companies={companies} templates={commercial.templates} fixedCompanyId={companyId} triggerLabel="Apply template" onCompleted={refresh} />
              <RecomputePricingDialog companyId={companyId!} companyName={overview?.company.name ?? "Workspace"} triggerLabel="Recompute" onCompleted={refresh} />
            </>
          ) : (
            <>
              <CatalogSyncDialog actorEmail={actorEmail} triggerLabel="Sync catalog" onCompleted={refresh} />
              <BundleUpsertDialog actorEmail={actorEmail} triggerLabel="Create bundle" buttonVariant="outline" onCompleted={refresh} />
              <ApplyTemplateDialog actorEmail={actorEmail} companies={companies} templates={commercial.templates} triggerLabel="Apply template" buttonVariant="outline" onCompleted={refresh} />
            </>
          )}
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <VerticalDataViews items={items} value={view} onValueChange={setView} railLabel="Commercial">
        {!isCompanyScope && view === "overview" ? (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
              <MetricTile label="Workspaces" value={summary.workspaceCount.toLocaleString()} />
              <MetricTile label="With plan" value={summary.subscribedWorkspaceCount.toLocaleString()} />
              <MetricTile label="Monthly revenue" value={formatCurrency(summary.committedMrr)} />
              <MetricTile label="Due this month" value={formatCurrency(summary.dueThisMonth)} />
              <MetricTile label="Past due" value={formatCurrency(summary.overdueExposure)} />
              <MetricTile label="Revenue at risk" value={formatCurrency(summary.atRiskRevenue)} />
              <MetricTile label="Renewals in 30 days" value={formatCurrency(summary.next30RenewalValue)} hint={`${summary.next30RenewalCount} workspaces`} />
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <ProjectionStrip
                projections={commercial.overview.projections}
                currency={commercial.overview.workspaces[0]?.currency ?? "USD"}
              />

              <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Subscription activity</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <AdminTrendChart
                    rows={subscriptionActivityRows}
                    series={[
                      {
                        key: "started",
                        label: "Started",
                        color: "var(--success-500)",
                      },
                      {
                        key: "changed",
                        label: "Changed",
                        color: "var(--primary-500)",
                      },
                      {
                        key: "ended",
                        label: "Ended",
                        color: "var(--danger-500)",
                      },
                    ]}
                    valueFormatter={(value) => value.toLocaleString()}
                    yTickFormatter={(value) => value.toLocaleString()}
                    xTickInterval={0}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.05fr)_minmax(0,0.8fr)]">
              <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Due schedule</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <AdminStackedBarChart
                    rows={dueScheduleRows}
                    series={[
                      {
                        key: "renewals",
                        label: "Renewals",
                        color: "var(--primary-500)",
                      },
                      {
                        key: "needAction",
                        label: "Need action",
                        color: "var(--warning-500)",
                      },
                    ]}
                    valueFormatter={(value) => value.toLocaleString()}
                    yTickFormatter={(value) => value.toLocaleString()}
                    xTickInterval={0}
                  />
                </CardContent>
              </Card>

              <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Revenue exposure</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <AdminWaterfallChart
                    rows={exposureWaterfallRows}
                    valueFormatter={(value) => formatCurrency(value, summary.currency)}
                    yTickFormatter={(value) => formatCurrency(value, summary.currency)}
                  />
                </CardContent>
              </Card>

              <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Plan mix</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <AdminDonutChart
                    rows={commercial.overview.planMix.slice(0, 8).map((plan) => ({
                      id: plan.planCode,
                      label: plan.planName,
                      value: plan.workspaceCount,
                    }))}
                    valueLabel="Workspaces"
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
              <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Workspace revenue</CardTitle>
                  </div>
                  <CompactPill>{filteredPlatformRows.length} workspaces</CompactPill>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={workspaceSearch} onChange={(event) => setWorkspaceSearch(event.target.value)} placeholder="Search workspace, plan, or status" className="h-9 min-w-[220px] flex-1 shadow-none md:max-w-sm" />
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={selectClassName()}>
                    <option value="all">All statuses</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="TRIALING">TRIALING</option>
                    <option value="PAST_DUE">PAST_DUE</option>
                    <option value="CANCELED">CANCELED</option>
                    <option value="EXPIRED">EXPIRED</option>
                  </select>
                  <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className={selectClassName()}>
                    <option value="all">All risk</option>
                    <option value="HEALTHY">Healthy</option>
                    <option value="AT_RISK">At risk</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="MISSING">Missing</option>
                  </select>
                  <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)} className={selectClassName()}>
                    <option value="all">All due buckets</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="DUE_THIS_MONTH">This month</option>
                    <option value="NEXT_30_DAYS">Next 30d</option>
                    <option value="FUTURE">Future</option>
                    <option value="NO_SCHEDULE">No schedule</option>
                    <option value="NO_SUBSCRIPTION">No subscription</option>
                  </select>
                  <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className={selectClassName()}>
                    <option value="all">All plans</option>
                    {planOptions.map((plan) => (
                      <option key={plan} value={plan}>{plan}</option>
                    ))}
                  </select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <WorkspaceRevenueTable rows={filteredPlatformRows} actorEmail={actorEmail} companies={companies} plans={commercial.plans} refresh={refresh} />
              </CardContent>
            </Card>
          </div>
        ) : null}

        {!isCompanyScope && view === "due" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Due now</CardTitle>
                </div>
                <CompactPill tone="warning">{filteredDueRows.length} workspaces</CompactPill>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={workspaceSearch} onChange={(event) => setWorkspaceSearch(event.target.value)} placeholder="Search workspace, plan, or status" className="h-9 min-w-[220px] flex-1 shadow-none md:max-w-sm" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={selectClassName()}>
                  <option value="all">All statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRIALING">TRIALING</option>
                  <option value="PAST_DUE">PAST_DUE</option>
                  <option value="CANCELED">CANCELED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
                <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className={selectClassName()}>
                  <option value="all">All risk</option>
                  <option value="AT_RISK">At risk</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="HEALTHY">Healthy</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <WorkspaceRevenueTable rows={filteredDueRows} actorEmail={actorEmail} companies={companies} plans={commercial.plans} refresh={refresh} />
            </CardContent>
          </Card>
        ) : null}

        {!isCompanyScope && view === "renewals" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Renewals</CardTitle>
                </div>
                <CompactPill tone="warning">{filteredRenewals.length} workspaces</CompactPill>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={workspaceSearch} onChange={(event) => setWorkspaceSearch(event.target.value)} placeholder="Search workspace, plan, or status" className="h-9 min-w-[220px] flex-1 shadow-none md:max-w-sm" />
                <select value={renewalWindow} onChange={(event) => setRenewalWindow(event.target.value)} className={selectClassName()}>
                  <option value="90">Next 90d</option>
                  <option value="30">Next 30d</option>
                  <option value="7">Next 7d</option>
                  <option value="all">All</option>
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={selectClassName()}>
                  <option value="all">All statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRIALING">TRIALING</option>
                  <option value="PAST_DUE">PAST_DUE</option>
                </select>
                <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className={selectClassName()}>
                  <option value="all">All plans</option>
                  {planOptions.map((plan) => (
                    <option key={plan} value={plan}>{plan}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <WorkspaceRevenueTable rows={filteredRenewals} actorEmail={actorEmail} companies={companies} plans={commercial.plans} refresh={refresh} />
            </CardContent>
          </Card>
        ) : null}

        {!isCompanyScope && view === "workspaces" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Workspace plans</CardTitle>
                </div>
                <CompactPill>{filteredPlatformRows.length} workspaces</CompactPill>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={workspaceSearch} onChange={(event) => setWorkspaceSearch(event.target.value)} placeholder="Search workspace, plan, or status" className="h-9 min-w-[220px] flex-1 shadow-none md:max-w-sm" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={selectClassName()}>
                  <option value="all">All statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRIALING">TRIALING</option>
                  <option value="PAST_DUE">PAST_DUE</option>
                  <option value="CANCELED">CANCELED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
                <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className={selectClassName()}>
                  <option value="all">All plans</option>
                  {planOptions.map((plan) => (
                    <option key={plan} value={plan}>{plan}</option>
                  ))}
                </select>
                <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)} className={selectClassName()}>
                  <option value="all">All due buckets</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="DUE_THIS_MONTH">This month</option>
                  <option value="NEXT_30_DAYS">Next 30d</option>
                  <option value="FUTURE">Future</option>
                  <option value="NO_SCHEDULE">No schedule</option>
                  <option value="NO_SUBSCRIPTION">No subscription</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <WorkspaceRevenueTable rows={filteredPlatformRows} actorEmail={actorEmail} companies={companies} plans={commercial.plans} refresh={refresh} />
            </CardContent>
          </Card>
        ) : null}

        {view === "templates" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Templates</CardTitle>
                </div>
                <CompactPill>{filteredTemplates.length} templates</CompactPill>
              </div>
              <Input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Search template, tier, or bundle" className="h-9 shadow-none md:max-w-sm" />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="admin-reference-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Template</th>
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2">Bundles</th>
                    <th className="px-3 py-2">Features</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((template) => (
                    <tr key={template.code} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium">{template.label}</p>
                        <p className="text-xs text-[var(--text-muted)]">{template.code}</p>
                      </td>
                      <td className="px-3 py-3"><CompactPill>{template.recommendedTierCode}</CompactPill></td>
                      <td className="px-3 py-3 text-[var(--text-muted)]">{template.bundleCodes.join(", ") || "No bundles"}</td>
                      <td className="px-3 py-3 font-mono text-xs text-[var(--text-muted)]">{template.featureCount}</td>
                      <td className="px-3 py-3 text-[var(--text-muted)]">{template.description}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end">
                          <ApplyTemplateDialog actorEmail={actorEmail} companies={companies} templates={commercial.templates} fixedCompanyId={companyId} defaultTemplateCode={template.code} triggerLabel={isCompanyScope ? "Apply" : "Apply template"} onCompleted={refresh} />
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
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Bundles</CardTitle>
                </div>
                <CompactPill>{filteredBundles.length} bundles</CompactPill>
              </div>
              <Input value={bundleSearch} onChange={(event) => setBundleSearch(event.target.value)} placeholder="Search bundle, code, source, or feature" className="h-9 shadow-none md:max-w-sm" />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="admin-reference-table w-full text-sm">
                <thead>
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
                    <tr key={bundle.code} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium">{bundle.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{bundle.code}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-mono">{formatCurrency(bundle.monthlyPrice)}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatCurrency(bundle.additionalSiteMonthlyPrice)}/site</p>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-[var(--text-muted)]">{bundle.featureKeys.length}</td>
                      <td className="px-3 py-3"><CompactPill>{bundle.source}</CompactPill></td>
                      <td className="px-3 py-3"><CompactPill tone={bundle.isActive ? "success" : "muted"}>{bundle.isActive ? "Active" : "Inactive"}</CompactPill></td>
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
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Feature catalog</CardTitle>
                </div>
                <CompactPill>{filteredCatalog.length} features</CompactPill>
              </div>
              <Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search feature label or key" className="h-9 shadow-none md:max-w-sm" />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="admin-reference-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Feature</th>
                    <th className="px-3 py-2">Key</th>
                    <th className="px-3 py-2">Platform</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((feature) => (
                    <tr key={feature.feature}>
                      <td className="px-3 py-3">{feature.featureLabel}</td>
                      <td className="px-3 py-3 font-mono text-xs text-[var(--text-muted)]">{feature.feature}</td>
                      <td className="px-3 py-3"><CompactPill tone={feature.platformActive ? "success" : "muted"}>{feature.platformActive ? "Active" : "Inactive"}</CompactPill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {isCompanyScope && view === "overview" ? (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-4">
                <MetricTile label="Monthly total" value={overview?.pricing ? formatCurrency(overview.pricing.total, overview.pricing.currency) : "N/A"} hint={overview?.subscription?.planName ?? "No plan"} />
                <MetricTile label="Next cycle" value={formatDate(overview?.subscription?.currentPeriodEnd)} hint={overview?.subscription?.status ?? "No record"} />
                <MetricTile label="Snapshot" value={overview?.pricing?.snapshotTotal !== null && overview?.pricing?.snapshotTotal !== undefined ? formatCurrency(overview.pricing.snapshotTotal, overview.pricing.currency) : "Not stored"} hint="Last stored total" />
                <MetricTile label="Footprint" value={`${overview?.sites.filter((site) => site.isActive).length ?? 0} sites`} hint={`${overview?.addons.filter((addon) => addon.enabled).length ?? 0} add-ons`} />
              </div>

              <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
                <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                  <div className="admin-panel-header">
                    <div>
                      <CardTitle className="text-base">Billing</CardTitle>
                    </div>
                    <CompactPill tone={overview?.subscriptionHealth?.shouldBlock ? "danger" : overview?.subscriptionHealth?.state === "EXPIRING_SOON" || overview?.subscriptionHealth?.state === "IN_GRACE" ? "warning" : "success"}>
                      {overview?.subscriptionHealth?.state ?? "No signal"}
                    </CompactPill>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="admin-reference-table w-full text-sm">
                      <thead>
                        <tr>
                          <th className="px-3 py-2">Plan</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Period</th>
                          <th className="px-3 py-2 text-right">Monthly</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="align-top">
                          <td className="px-3 py-3">
                            <p className="font-medium">{overview?.subscription?.planName ?? "No plan assigned"}</p>
                            <p className="text-xs text-[var(--text-muted)]">{overview?.subscription?.planCode ?? "No plan code"}</p>
                          </td>
                          <td className="px-3 py-3"><CompactPill tone={overview?.subscriptionHealth?.shouldBlock ? "danger" : "muted"}>{overview?.subscription?.status ?? "UNASSIGNED"}</CompactPill></td>
                          <td className="px-3 py-3">
                            <p className="font-mono text-xs text-[var(--text-strong)]">{formatDate(overview?.subscription?.currentPeriodStart)}</p>
                            <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{formatDate(overview?.subscription?.currentPeriodEnd)}</p>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs text-[var(--text-muted)]">
                            {overview?.pricing ? `${formatCurrency(overview.pricing.total, overview.pricing.currency)}/mo` : "Unavailable"}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <AssignTierDialog actorEmail={actorEmail} companies={companies} plans={commercial.plans} fixedCompanyId={companyId} defaultTierCode={overview?.subscription?.planCode} triggerLabel="Tier" onCompleted={refresh} />
                              <SubscriptionStatusDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={companyId} defaultStatus={overview?.subscription?.status} triggerLabel="Status" onCompleted={refresh} />
                              <RecomputePricingDialog companyId={companyId!} companyName={overview?.company.name ?? "Workspace"} triggerLabel="Recompute" onCompleted={refresh} />
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
                <CardHeader className="border-b border-[var(--edge-subtle)] pb-3">
                  <CardTitle className="text-base">Pricing mix</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overview?.pricing?.lineItems.map((item) => (
                    <div key={item.code} className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-strong)]">{item.label}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.type}</p>
                      </div>
                      <span className="font-mono text-sm text-[var(--text-strong)]">{formatCurrency(item.amount, overview.pricing?.currency ?? "USD")}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3 xl:sticky xl:top-20">
              <Card className="admin-side-panel bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Billing health</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
                    <p className="font-medium text-[var(--text-strong)]">{overview?.subscriptionHealth?.reason ?? "No subscription signal."}</p>
                    {overview?.subscriptionHealth?.shouldBlock ? (
                      <div className="mt-2 flex items-start gap-2 text-[#9a2c1d]">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="text-xs">Access is currently at commercial risk.</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2 rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center justify-between"><span>Started</span><span className="font-mono text-[var(--text-strong)]">{formatDate(overview?.subscription?.startedAt)}</span></div>
                    <div className="flex items-center justify-between"><span>Period start</span><span className="font-mono text-[var(--text-strong)]">{formatDate(overview?.subscription?.currentPeriodStart)}</span></div>
                    <div className="flex items-center justify-between"><span>Period end</span><span className="font-mono text-[var(--text-strong)]">{formatDate(overview?.subscription?.currentPeriodEnd)}</span></div>
                    <div className="flex items-center justify-between"><span>Pricing computed</span><span className="font-mono text-[var(--text-strong)]">{formatDate(overview?.pricing?.computedAt)}</span></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="admin-side-panel bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Commercial footprint</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-3 py-2.5 text-sm"><span className="text-[var(--text-muted)]">Tier base</span><span className="font-mono text-[var(--text-strong)]">{overview?.pricing ? formatCurrency(overview.pricing.tierBase, overview.pricing.currency) : "N/A"}</span></div>
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-3 py-2.5 text-sm"><span className="text-[var(--text-muted)]">Site overage</span><span className="font-mono text-[var(--text-strong)]">{overview?.pricing ? formatCurrency(overview.pricing.siteOverage, overview.pricing.currency) : "N/A"}</span></div>
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-3 py-2.5 text-sm"><span className="text-[var(--text-muted)]">Add-ons</span><span className="font-mono text-[var(--text-strong)]">{overview?.pricing ? formatCurrency(overview.pricing.addonBaseTotal + overview.pricing.addonSiteTotal, overview.pricing.currency) : "N/A"}</span></div>
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-3 py-2.5 text-sm"><span className="text-[var(--text-muted)]">Feature charges</span><span className="font-mono text-[var(--text-strong)]">{overview?.pricing ? formatCurrency(overview.pricing.featureTotal, overview.pricing.currency) : "N/A"}</span></div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {isCompanyScope && view === "addons" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Workspace add-ons</CardTitle>
                </div>
                <CompactPill>{filteredAddons.length} add-ons</CompactPill>
              </div>
              <Input value={addonSearch} onChange={(event) => setAddonSearch(event.target.value)} placeholder="Search add-on name, code, or reason" className="h-9 shadow-none md:max-w-sm" />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="admin-reference-table w-full text-sm">
                <thead>
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
                    <tr key={addon.code} className="align-top">
                      <td className="px-3 py-3"><p className="font-medium">{addon.name}</p><p className="text-xs text-[var(--text-muted)]">{addon.code}</p></td>
                      <td className="px-3 py-3"><p className="font-mono">{formatCurrency(addon.monthlyPrice)}</p><p className="text-xs text-[var(--text-muted)]">{formatCurrency(addon.additionalSiteMonthlyPrice)}/site</p></td>
                      <td className="px-3 py-3"><CompactPill tone={addon.enabled ? "success" : "muted"}>{addon.enabled ? "Enabled" : "Disabled"}</CompactPill></td>
                      <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{addon.reason ?? "No note"}</td>
                      <td className="px-3 py-3"><div className="flex justify-end">{addon.enabled ? <AddonStateDialog actorEmail={actorEmail} companyId={companyId!} addon={addon} enable={false} triggerLabel="Disable" onCompleted={refresh} /> : <AddonStateDialog actorEmail={actorEmail} companyId={companyId!} addon={addon} enable={true} triggerLabel="Enable" onCompleted={refresh} />}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {isCompanyScope && view === "features" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="space-y-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Feature access</CardTitle>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CompactPill>{pendingFeatureChanges} pending</CompactPill>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (!overview) return;
                    setFeatureDraft(Object.fromEntries(overview.features.map((feature) => [feature.feature, feature.enabled])));
                    setFeatureReason("");
                  }} disabled={pendingFeatureChanges === 0 || savingFeatures}>Discard</Button>
                  <Button size="sm" onClick={() => void saveFeatureDraft()} disabled={pendingFeatureChanges === 0 || savingFeatures}>{savingFeatures ? "Saving..." : "Save"}</Button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <Input value={featureSearch} onChange={(event) => setFeatureSearch(event.target.value)} placeholder="Search feature label or key" className="h-9 shadow-none" />
                <Input value={featureReason} onChange={(event) => setFeatureReason(event.target.value)} placeholder="Reason for this batch" className="h-9 shadow-none" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="admin-reference-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Feature</th>
                    <th className="px-3 py-2">Group</th>
                    <th className="px-3 py-2">Current</th>
                    <th className="px-3 py-2">Draft</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeatures.map((feature) => {
                    const value = featureDraft[feature.feature] ?? feature.enabled;
                    const changed = value !== feature.enabled;
                    return (
                      <tr key={feature.feature} className={changed ? "bg-[var(--surface-muted)]" : ""}>
                        <td className="px-3 py-3"><p className="font-medium">{feature.featureLabel}</p><p className="font-mono text-xs text-[var(--text-muted)]">{feature.feature}</p></td>
                        <td className="px-3 py-3"><CompactPill>{featureGroupKey(feature.feature)}</CompactPill></td>
                        <td className="px-3 py-3"><CompactPill tone={feature.enabled ? "success" : "muted"}>{feature.enabled ? "Enabled" : "Disabled"}</CompactPill></td>
                        <td className="px-3 py-3"><CompactPill tone={value ? "success" : "muted"}>{value ? "Enabled" : "Disabled"}</CompactPill></td>
                        <td className="px-3 py-3 text-[var(--text-muted)]">{feature.reason ?? "No restriction note"}</td>
                        <td className="px-3 py-3"><div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setFeatureDraft((current) => ({ ...current, [feature.feature]: !value }))}>{value ? "Disable" : "Enable"}</Button></div></td>
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
