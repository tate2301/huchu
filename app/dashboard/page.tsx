"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { endOfMonth, endOfQuarter, endOfWeek, format, startOfMonth, startOfQuarter, startOfWeek } from "date-fns"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeading } from "@/components/layout/page-heading"
import { StatusState } from "@/components/shared/status-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchPlantReports, fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"

const timeRanges = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
}

type TimeRangeKey = keyof typeof timeRanges

function getDateRange(range: TimeRangeKey) {
  const now = new Date()
  if (range === "month") {
    return { start: startOfMonth(now), end: endOfMonth(now) }
  }
  if (range === "quarter") {
    return { start: startOfQuarter(now), end: endOfQuarter(now) }
  }
  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
}

export default function DashboardPage() {
  const [selectedSite, setSelectedSite] = useState("all")
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("week")
  const siteFilterId = "dashboard-site-filter"
  const timeRangeFilterId = "dashboard-time-range-filter"

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  const { startDate, endDate } = useMemo(() => {
    const range = getDateRange(timeRange)
    return {
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
    }
  }, [timeRange])

  const activeSiteId = selectedSite === "all" ? "" : selectedSite
  const canFetch = selectedSite === "all" || !!activeSiteId

  const {
    data: plantReports,
    isLoading: reportsLoading,
    error: reportsError,
  } = useQuery({
    queryKey: ["plant-reports", activeSiteId || "all", timeRange],
    queryFn: () =>
      fetchPlantReports({
        siteId: activeSiteId || undefined,
        startDate,
        endDate,
        limit: 200,
      }),
    enabled: canFetch,
  })

  const reports = useMemo(() => plantReports?.data ?? [], [plantReports?.data])

  const summary = useMemo(() => {
    return reports.reduce(
      (acc, report) => {
        acc.tonnesProcessed += report.tonnesProcessed ?? 0
        acc.tonnesFed += report.tonnesFed ?? 0
        acc.goldRecovered += report.goldRecovered ?? 0
        acc.runHours += report.runHours ?? 0
        acc.dieselUsed += report.dieselUsed ?? 0
        acc.reportCount += 1
        return acc
      },
      {
        tonnesProcessed: 0,
        tonnesFed: 0,
        goldRecovered: 0,
        runHours: 0,
        dieselUsed: 0,
        reportCount: 0,
      }
    )
  }, [reports])

  const series = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; tonnesProcessed: number; goldRecovered: number; runHours: number }
    >()
    reports.forEach((report) => {
      const key = format(new Date(report.date), "yyyy-MM-dd")
      const existing = byDate.get(key) ?? {
        date: key,
        tonnesProcessed: 0,
        goldRecovered: 0,
        runHours: 0,
      }
      existing.tonnesProcessed += report.tonnesProcessed ?? 0
      existing.goldRecovered += report.goldRecovered ?? 0
      existing.runHours += report.runHours ?? 0
      byDate.set(key, existing)
    })
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [reports])

  const averageRunHours = summary.reportCount ? summary.runHours / summary.reportCount : 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Production Dashboard" description="Production trends across sites" />

      {(sitesError || reportsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load production data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(sitesError || reportsError)}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold mb-2" htmlFor={siteFilterId}>
                Site
              </label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger id={siteFilterId} className="w-full">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    {sites?.length ? (
                      sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-sites" disabled>
                        No sites available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2" htmlFor={timeRangeFilterId}>
                Time Range
              </label>
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRangeKey)}>
                <SelectTrigger id={timeRangeFilterId} className="w-full">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(timeRanges).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!reportsLoading && reports.length === 0 ? (
        <StatusState
          variant="empty"
          title="No production data in this range"
          description="Try a different site or time range to load dashboard metrics."
        />
      ) : null}

      {!reportsLoading && reports.length > 0 ? (
        <Alert variant="success">
          <AlertTitle>Dashboard data ready</AlertTitle>
          <AlertDescription>
            Loaded {reports.length} plant report{reports.length === 1 ? "" : "s"} for the current filters.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Tonnes Processed</CardTitle>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold">{summary.tonnesProcessed.toFixed(1)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{timeRanges[timeRange]}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Gold Recovered</CardTitle>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold">{summary.goldRecovered.toFixed(2)} g</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Plant reports</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Average Run Hours</CardTitle>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold">{averageRunHours.toFixed(1)}h</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Per report</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Diesel Used</CardTitle>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold">{summary.dieselUsed.toFixed(1)} L</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Consumables</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tonnes Processed</CardTitle>
            <CardDescription>Daily production totals</CardDescription>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : series.length === 0 ? (
              <div className="text-sm text-muted-foreground">No plant reports in this range.</div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => format(new Date(value), "MMM d")}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toFixed(1)} t`, "Tonnes"]}
                      labelFormatter={(label) => format(new Date(label), "MMM d, yyyy")}
                    />
                    <Line
                      type="monotone"
                      dataKey="tonnesProcessed"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gold Recovery</CardTitle>
            <CardDescription>Daily recovered grams</CardDescription>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : series.length === 0 ? (
              <div className="text-sm text-muted-foreground">No gold recovery recorded.</div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => format(new Date(value), "MMM d")}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toFixed(2)} g`, "Gold"]}
                      labelFormatter={(label) => format(new Date(label), "MMM d, yyyy")}
                    />
                    <Bar dataKey="goldRecovered" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
