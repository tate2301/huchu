"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import {
  fetchCommercialCenter,
  fetchReliabilityCluster,
} from "@/components/admin-portal/api";
import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type {
  CommercialCenterData,
  CompanyWorkspace,
  ReliabilityClusterData,
} from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdminStackedAreaChart,
  AdminStackedBarChart,
} from "@/components/charts/admin-headless-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import {
  ChangeTierWizard,
  CreateClientWizard,
} from "@/components/admin-portal/wizards/platform-wizards";
import {
  buildFutureDayBuckets,
  buildRecentDayBuckets,
  resolveTimestamp,
} from "@/lib/admin-portal/chart-series";
import { TIERS } from "@/lib/platform/feature-catalog";

type CompanyRow = CompanyWorkspace & {
  subscription: CommercialCenterData["subscriptions"][number] | null;
};

const statusOptions = [
  { value: "all", label: "All subscription statuses" },
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "TRIALING", label: "TRIALING" },
  { value: "PAST_DUE", label: "PAST_DUE" },
  { value: "CANCELED", label: "CANCELED" },
  { value: "EXPIRED", label: "EXPIRED" },
  { value: "NONE", label: "No subscription" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString();
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
    <div className="admin-metric-card rounded-[14px] shadow-none">
      <p className="px-4 py-3 text-[11px] font-medium text-[var(--text-muted)]">
        {label}
      </p>
      <div className="px-6 py-3">
        <p className="font-mono text-[1.5rem] font-semibold tracking-tight text-[var(--text-strong)]">
          {value}
        </p>
        {hint ? (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function CompaniesPage({ actorEmail }: { actorEmail: string }) {
  const { companies, isLoadingCompanies } = useAdminShell();
  const [commercial, setCommercial] = useState<CommercialCenterData | null>(
    null,
  );
  const [reliability, setReliability] = useState<ReliabilityClusterData | null>(
    null,
  );
  const [isLoadingCommercial, setIsLoadingCommercial] = useState(true);
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierWizardClient, setTierWizardClient] =
    useState<CompanyWorkspace | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadCommercial() {
      setIsLoadingCommercial(true);
      setCommercialError(null);
      try {
        const [commercialPayload, reliabilityPayload] = await Promise.all([
          fetchCommercialCenter(),
          fetchReliabilityCluster(),
        ]);
        if (!ignore) {
          setCommercial(commercialPayload);
          setReliability(reliabilityPayload);
        }
      } catch (error) {
        if (!ignore) {
          setCommercial(null);
          setReliability(null);
          setCommercialError(
            error instanceof Error
              ? error.message
              : "Failed to load workspace trends",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingCommercial(false);
        }
      }
    }

    void loadCommercial();
    return () => {
      ignore = true;
    };
  }, []);

  const rows = useMemo<CompanyRow[]>(() => {
    const latestSubscriptions = new Map<
      string,
      CommercialCenterData["subscriptions"][number]
    >();

    for (const subscription of commercial?.subscriptions ?? []) {
      if (!latestSubscriptions.has(subscription.companyId)) {
        latestSubscriptions.set(subscription.companyId, subscription);
      }
    }

    return companies.map((company) => ({
      ...company,
      subscription: latestSubscriptions.get(company.id) ?? null,
    }));
  }, [commercial, companies]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const subscriptionStatus = row.subscription?.status ?? "NONE";
      const matchesTier =
        tierFilter === "all" || row.subscription?.planCode === tierFilter;
      const matchesStatus =
        statusFilter === "all" || subscriptionStatus === statusFilter;
      return matchesTier && matchesStatus;
    });
  }, [rows, statusFilter, tierFilter]);

  const commercialByCompany = useMemo(() => {
    const map = new Map<
      string,
      CommercialCenterData["overview"]["workspaces"][number]
    >();
    for (const row of commercial?.overview.workspaces ?? []) {
      map.set(row.companyId, row);
    }
    return map;
  }, [commercial?.overview.workspaces]);

  const contractByCompany = useMemo(() => {
    const map = new Map<
      string,
      ReliabilityClusterData["contractEvaluations"][number]
    >();
    for (const row of reliability?.contractEvaluations ?? []) {
      map.set(row.companyId, row);
    }
    return map;
  }, [reliability?.contractEvaluations]);

  const summaryMetrics = useMemo(() => {
    const total = filteredRows.length;
    const active = filteredRows.filter((row) => row.status === "ACTIVE").length;
    const withPlan = filteredRows.filter((row) => row.subscription).length;
    const noPlan = total - withPlan;

    let dueNow = 0;
    let atRisk = 0;
    let siteTotal = 0;
    for (const row of filteredRows) {
      const commercialRow = commercialByCompany.get(row.id);
      if (!commercialRow) continue;
      siteTotal += commercialRow.siteCount;
      if (
        commercialRow.dueBucket === "OVERDUE" ||
        commercialRow.dueBucket === "DUE_THIS_MONTH"
      ) {
        dueNow += 1;
      }
      if (
        commercialRow.riskBucket === "AT_RISK" ||
        commercialRow.riskBucket === "OVERDUE"
      ) {
        atRisk += 1;
      }
    }

    const avgSites = total > 0 ? (siteTotal / total).toFixed(1) : "0.0";

    return {
      total,
      active,
      withPlan,
      noPlan,
      dueNow,
      atRisk,
      avgSites,
    };
  }, [commercialByCompany, filteredRows]);

  const commercialHealthTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);

    return buckets.map((bucket) => {
      let subscriptionStatus = 0;
      let riskLevel = 0;
      let contractState = 0;

      for (const row of filteredRows) {
        const subscriptionUpdatedAt = resolveTimestamp(
          row.subscription?.updatedAt,
          row.subscription?.startedAt,
          row.subscription?.endedAt,
          row.subscription?.canceledAt,
        );
        if (
          subscriptionUpdatedAt !== null &&
          subscriptionUpdatedAt >= bucket.start &&
          subscriptionUpdatedAt < bucket.end
        ) {
          if (
            row.subscription?.status &&
            row.subscription.status !== "ACTIVE" &&
            row.subscription.status !== "TRIALING"
          ) {
            subscriptionStatus += 1;
          }

          const riskBucket = commercialByCompany.get(row.id)?.riskBucket;
          if (
            riskBucket === "AT_RISK" ||
            riskBucket === "OVERDUE" ||
            riskBucket === "MISSING"
          ) {
            riskLevel += 1;
          }
        }

        const contract = contractByCompany.get(row.id);
        const contractUpdatedAt = resolveTimestamp(
          contract?.currentStateUpdatedAt,
          contract?.subscriptionUpdatedAt,
        );
        if (
          contractUpdatedAt !== null &&
          contractUpdatedAt >= bucket.start &&
          contractUpdatedAt < bucket.end &&
          contract &&
          (contract.currentState !== "ACTIVE" ||
            contract.recommendedState !== "ACTIVE")
        ) {
          contractState += 1;
        }
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        subscriptionStatus,
        riskLevel,
        contractState,
      };
    });
  }, [commercialByCompany, contractByCompany, filteredRows]);

  const dueDateTrendRows = useMemo(() => {
    const buckets = buildFutureDayBuckets(84, 7);

    return buckets.map((bucket, index) => {
      let renewals = 0;
      let needAction = 0;

      for (const row of filteredRows) {
        const renewalTime = resolveTimestamp(row.subscription?.currentPeriodEnd);
        const commercialRow = commercialByCompany.get(row.id);
        const isOverdue = commercialRow?.dueBucket === "OVERDUE";
        const isInBucket =
          renewalTime !== null &&
          renewalTime >= bucket.start &&
          renewalTime < bucket.end;
        const assignOverdueToCurrentBucket = isOverdue && index === 0;

        if (!isInBucket && !assignOverdueToCurrentBucket) continue;

        renewals += 1;

        const riskBucket = commercialRow?.riskBucket;
        if (
          isOverdue ||
          commercialRow?.dueBucket === "DUE_THIS_MONTH" ||
          riskBucket === "AT_RISK" ||
          riskBucket === "OVERDUE"
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
  }, [commercialByCompany, filteredRows]);

  const columns = useMemo<ColumnDef<CompanyRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Workspace",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-[var(--text-strong)]">
              {row.original.name}
            </p>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              {row.original.slug ?? row.original.id}
            </p>
          </div>
        ),
      },
      {
        id: "workspaceStatus",
        header: "Workspace status",
        cell: ({ row }) => (
          <StatusChip status={row.original.status ?? "Pending"} />
        ),
      },
      {
        id: "plan",
        header: "Plan",
        cell: ({ row }) =>
          row.original.subscription?.planName ? (
            <Badge variant="outline" className="font-medium">
              {row.original.subscription.planName}
            </Badge>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">
              No live plan
            </span>
          ),
      },
      {
        id: "subscriptionStatus",
        header: "Subscription status",
        cell: ({ row }) => (
          <StatusChip status={row.original.subscription?.status ?? "Pending"} />
        ),
      },
      {
        id: "updatedAt",
        header: "Last updated",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {formatDate(row.original.subscription?.updatedAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Workspace actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/admin/clients/${row.original.id}`}>
                    Open workspace
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/company/${row.original.id}/identity`}>
                    Open identity
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/admin/company/${row.original.id}/support-access`}
                  >
                    Open support
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/company/${row.original.id}/commercial`}>
                    Open commercial
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setTierWizardClient(row.original)}
                >
                  Change tier
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [],
  );

  if (isLoadingCompanies || isLoadingCommercial) {
    return (
      <AdminModuleLoading
        label="Loading workspaces"
      />
    );
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div className="space-y-2">
          <p className="admin-page-kicker">Platform Clients</p>
          <div className="flex flex-col gap-2">
            <h1 className="admin-page-title">
              Workspaces ({filteredRows.length})
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CreateClientWizard actorEmail={actorEmail} />
        </div>
      </div>

      {commercialError || !commercial || !reliability ? (
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardContent className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
            {commercialError ?? "Workspace trend data is unavailable."}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <MetricTile
            label="Workspaces"
            value={summaryMetrics.total.toLocaleString()}
          />
          <MetricTile
            label="Active"
            value={summaryMetrics.active.toLocaleString()}
          />
          <MetricTile
            label="With plan"
            value={summaryMetrics.withPlan.toLocaleString()}
          />
          <MetricTile
            label="No plan"
            value={summaryMetrics.noPlan.toLocaleString()}
          />
          <MetricTile
            label="Need action now"
            value={summaryMetrics.dueNow.toLocaleString()}
          />
          <MetricTile label="Avg sites" value={summaryMetrics.avgSites} />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Commercial health</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <AdminStackedAreaChart
                rows={commercialHealthTrendRows}
                series={[
                  {
                    key: "subscriptionStatus",
                    label: "Subscription status",
                    color: "var(--primary-500)",
                  },
                  {
                    key: "riskLevel",
                    label: "Risk level",
                    color: "var(--warning-500)",
                  },
                  {
                    key: "contractState",
                    label: "Contract state",
                    color: "var(--danger-500)",
                  },
                ]}
                yTickFormatter={(value) => value.toLocaleString()}
                valueFormatter={(value) => value.toLocaleString()}
                xTickInterval={0}
              />
            </CardContent>
          </Card>

          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Due dates</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <AdminStackedBarChart
                rows={dueDateTrendRows}
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
                yTickFormatter={(value) => value.toLocaleString()}
                valueFormatter={(value) => value.toLocaleString()}
                xTickInterval={0}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        searchPlaceholder="Search workspace, slug, plan, status"
        searchSubmitLabel="Search"
        noResultsText="No workspaces match the current filters."
        toolbar={
          <>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="h-8 w-[160px] bg-[var(--surface-base)]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                {TIERS.map((tier) => (
                  <SelectItem key={tier.code} value={tier.code}>
                    {tier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[190px] bg-[var(--surface-base)]">
                <SelectValue placeholder="Subscription status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />
      {tierWizardClient ? (
        <ChangeTierWizard
          actorEmail={actorEmail}
          companyId={tierWizardClient.id}
          companyName={tierWizardClient.name}
        />
      ) : null}
    </section>
  );
}
