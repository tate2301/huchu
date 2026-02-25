"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  fetchExecutiveDashboardOverview,
  type ExecutiveRange,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ExecutiveKpiGrid } from "@/components/dashboard/executive-kpi-grid";
import { ExecutiveCharts } from "@/components/dashboard/executive-charts";
import { ExecutiveHighlights } from "@/components/dashboard/executive-highlights";
import { ExecutiveQuickLinks } from "@/components/dashboard/executive-quick-links";

const ALL_SITES_VALUE = "all";
const EXECUTIVE_RANGE_OPTIONS: Array<{ value: ExecutiveRange; label: string }> =
  [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
  ];

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

  return (
    <div className="space-y-6">
      <PageHeading
        title="Executive Dashboard"
        description="Enterprise visibility across finance, gold, workforce, operations, and risk."
      />

      <section className="space-y-5">
        {error && !hasOverviewData ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load executive dashboard</AlertTitle>
            <AlertDescription>{overviewErrorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <section className="space-y-5">
          <ExecutiveHighlights
            items={overview?.highlights}
            isLoading={isLoading}
            isError={Boolean(error) && !hasOverviewData}
            errorMessage={overviewErrorMessage}
            extras={
              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[28rem]">
                <div className="space-y-1">
                  <label
                    htmlFor={siteFilterId}
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Site
                  </label>
                  {isLoading && !overview ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select
                      value={selectedSiteId}
                      onValueChange={setSelectedSiteId}
                    >
                      <SelectTrigger id={siteFilterId}>
                        <SelectValue placeholder="All sites" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_SITES_VALUE}>
                          All sites
                        </SelectItem>
                        {(overview?.sites ?? []).map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={rangeFilterId}
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Range
                  </label>
                  <Select
                    value={selectedRange}
                    onValueChange={(value) =>
                      setSelectedRange(value as ExecutiveRange)
                    }
                  >
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
            }
          />
        </section>
      </section>

      <section className="space-y-5">
        <ExecutiveKpiGrid
          items={overview?.kpis}
          isLoading={isLoading}
          isError={Boolean(error) && !hasOverviewData}
          errorMessage={overviewErrorMessage}
        />
        <ExecutiveCharts
          data={overview?.charts}
          isLoading={isLoading}
          isError={Boolean(error) && !hasOverviewData}
          errorMessage={overviewErrorMessage}
        />
      </section>

      <section>
        <ExecutiveQuickLinks
          links={overview?.quickLinks ?? []}
          title="Navigation"
          showPrimary={false}
        />
      </section>
    </div>
  );
}
