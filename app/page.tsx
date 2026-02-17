"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  fetchExecutiveDashboardOverview,
  type ExecutiveDashboardResponse,
  type ExecutiveRange,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCcw } from "@/lib/icons";
import { ExecutiveKpiGrid } from "@/components/dashboard/executive-kpi-grid";
import { ExecutiveCharts } from "@/components/dashboard/executive-charts";
import { ExecutiveHighlights } from "@/components/dashboard/executive-highlights";
import { ExecutiveQuickLinks } from "@/components/dashboard/executive-quick-links";

const ALL_SITES_VALUE = "all";
const EXECUTIVE_RANGE_OPTIONS: Array<{ value: ExecutiveRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function formatUpdatedAt(overview: ExecutiveDashboardResponse | undefined): string | null {
  if (!overview?.generatedAt) return null;
  const parsed = new Date(overview.generatedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

export default function HomePage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>(ALL_SITES_VALUE);
  const [selectedRange, setSelectedRange] = useState<ExecutiveRange>("30d");

  const siteFilterId = "executive-dashboard-site-filter";
  const rangeFilterId = "executive-dashboard-range-filter";

  const {
    data: overview,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["executive-dashboard-overview", selectedSiteId, selectedRange],
    queryFn: () =>
      fetchExecutiveDashboardOverview({
        siteId: selectedSiteId === ALL_SITES_VALUE ? undefined : selectedSiteId,
        range: selectedRange,
      }),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const hasOverviewData = Boolean(overview);
  const overviewErrorMessage = error ? getApiErrorMessage(error) : undefined;
  const updatedAt = useMemo(() => formatUpdatedAt(overview), [overview]);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Executive Dashboard"
        description="High-level observability across cash, gold, workforce, risk, and operational performance."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Filters</CardTitle>
          <CardDescription>Apply one filter set across metrics, charts, and quick links.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor={siteFilterId} className="text-sm font-medium">
                Site
              </label>
              {isLoading && !overview ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger id={siteFilterId}>
                    <SelectValue placeholder="All sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SITES_VALUE}>All sites</SelectItem>
                    {(overview?.sites ?? []).map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor={rangeFilterId} className="text-sm font-medium">
                Range
              </label>
              <Select value={selectedRange} onValueChange={(value) => setSelectedRange(value as ExecutiveRange)}>
                <SelectTrigger id={rangeFilterId}>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {EXECUTIVE_RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh every <span className="font-mono tabular-nums">60s</span>
            </span>
            {updatedAt ? (
              <span>
                Last update: <span className="font-mono tabular-nums">{updatedAt}</span>
              </span>
            ) : null}
          </div>

          {error && !hasOverviewData ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load executive dashboard</AlertTitle>
              <AlertDescription>{overviewErrorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <ExecutiveQuickLinks links={overview?.quickLinks ?? []} />

      <ExecutiveKpiGrid
        items={overview?.kpis}
        isLoading={isLoading}
        isError={Boolean(error) && !hasOverviewData}
        errorMessage={overviewErrorMessage}
      />

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <ExecutiveCharts
          data={overview?.charts}
          isLoading={isLoading}
          isError={Boolean(error) && !hasOverviewData}
          errorMessage={overviewErrorMessage}
        />
        <ExecutiveHighlights
          items={overview?.highlights}
          isLoading={isLoading}
          isError={Boolean(error) && !hasOverviewData}
          errorMessage={overviewErrorMessage}
        />
      </div>
    </div>
  );
}
