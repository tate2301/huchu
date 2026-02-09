"use client"

import { useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format, subDays } from "date-fns"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeading } from "@/components/layout/page-heading"
import { PdfTemplate } from "@/components/pdf/pdf-template"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchDowntimeAnalytics, fetchPlantReports, fetchShiftReports, fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { exportElementToPdf } from "@/lib/pdf"

export default function ReportsPage() {
  const today = new Date()
  const [selectedSite, setSelectedSite] = useState("all")
  const [startDate, setStartDate] = useState(format(subDays(today, 6), "yyyy-MM-dd"))
  const [endDate, setEndDate] = useState(format(today, "yyyy-MM-dd"))
  const [exporting, setExporting] = useState(false)
  const reportPdfRef = useRef<HTMLDivElement>(null)

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  const siteId = selectedSite === "all" ? undefined : selectedSite

  const {
    data: plantReports,
    isLoading: plantLoading,
    error: plantError,
  } = useQuery({
    queryKey: ["plant-reports", siteId ?? "all", startDate, endDate],
    queryFn: () =>
      fetchPlantReports({
        siteId,
        startDate,
        endDate,
        limit: 200,
      }),
    enabled: !!startDate && !!endDate,
  })

  const {
    data: shiftReports,
    isLoading: shiftLoading,
    error: shiftError,
  } = useQuery({
    queryKey: ["shift-reports", siteId ?? "all", startDate, endDate],
    queryFn: () =>
      fetchShiftReports({
        siteId,
        startDate,
        endDate,
        limit: 200,
      }),
    enabled: !!startDate && !!endDate,
  })

  const {
    data: downtimeAnalytics,
    isLoading: downtimeLoading,
    error: downtimeError,
  } = useQuery({
    queryKey: ["downtime-analytics", siteId, startDate, endDate],
    queryFn: () =>
      fetchDowntimeAnalytics({
        siteId: siteId ?? "",
        startDate,
        endDate,
      }),
    enabled: !!siteId && !!startDate && !!endDate,
  })

  const reportData = useMemo(() => plantReports?.data ?? [], [plantReports?.data])
  const shiftData = useMemo(() => shiftReports?.data ?? [], [shiftReports?.data])

  const summary = useMemo(() => {
    return reportData.reduce(
      (acc, report) => {
        acc.tonnesProcessed += report.tonnesProcessed ?? 0
        acc.tonnesFed += report.tonnesFed ?? 0
        acc.goldRecovered += report.goldRecovered ?? 0
        acc.runHours += report.runHours ?? 0
        acc.dieselUsed += report.dieselUsed ?? 0
        acc.reagentsUsed += report.reagentsUsed ?? 0
        acc.reportCount += 1
        acc.downtimeHours +=
          report.downtimeEvents?.reduce((total, event) => total + event.durationHours, 0) ?? 0
        return acc
      },
      {
        tonnesProcessed: 0,
        tonnesFed: 0,
        goldRecovered: 0,
        runHours: 0,
        dieselUsed: 0,
        reagentsUsed: 0,
        reportCount: 0,
        downtimeHours: 0,
      }
    )
  }, [reportData])

  const siteSummary = useMemo(() => {
    const totals = new Map<
      string,
      {
        siteName: string
        tonnesProcessed: number
        goldRecovered: number
        runHours: number
        downtimeHours: number
      }
    >()

    reportData.forEach((report) => {
      const key = report.site?.name ?? "Unknown site"
      const current =
        totals.get(key) ?? {
          siteName: key,
          tonnesProcessed: 0,
          goldRecovered: 0,
          runHours: 0,
          downtimeHours: 0,
        }
      current.tonnesProcessed += report.tonnesProcessed ?? 0
      current.goldRecovered += report.goldRecovered ?? 0
      current.runHours += report.runHours ?? 0
      current.downtimeHours +=
        report.downtimeEvents?.reduce((total, event) => total + event.durationHours, 0) ?? 0
      totals.set(key, current)
    })

    return Array.from(totals.values()).sort((a, b) => b.tonnesProcessed - a.tonnesProcessed)
  }, [reportData])

  const workTypeSummary = useMemo(() => {
    return shiftData.reduce<Record<string, { count: number; crew: number }>>((acc, report) => {
      const key = report.workType
      if (!acc[key]) acc[key] = { count: 0, crew: 0 }
      acc[key].count += 1
      acc[key].crew += report.crewCount ?? 0
      return acc
    }, {})
  }, [shiftData])

  const hasErrors = sitesError || plantError || shiftError || downtimeError
  const isLoading = plantLoading || shiftLoading || sitesLoading
  const activeSiteName =
    selectedSite === "all"
      ? "All sites"
      : sites?.find((site) => site.id === selectedSite)?.name ?? "Selected site"

  const handleExport = async () => {
    if (!reportPdfRef.current) return
    setExporting(true)
    try {
      exportElementToPdf(reportPdfRef.current, `reports-${startDate}-to-${endDate}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  const downloadCsv = (filename: string, rows: Array<Array<string | number>>) => {
    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "")
            if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
              return `"${text.replace(/"/g, "\"\"")}"`
            }
            return text
          })
          .join(","),
      )
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleExportPlantCsv = () => {
    const rows = [
      [
        "Date",
        "Site",
        "Tonnes Processed",
        "Tonnes Fed",
        "Gold Recovered (g)",
        "Run Hours",
        "Downtime Hours",
        "Diesel Used",
        "Reagents Used",
      ],
      ...reportData.map((report) => {
        const downtimeHours =
          report.downtimeEvents?.reduce((total, event) => total + event.durationHours, 0) ?? 0
        return [
          format(new Date(report.date), "yyyy-MM-dd"),
          report.site?.name ?? "",
          report.tonnesProcessed ?? 0,
          report.tonnesFed ?? 0,
          report.goldRecovered ?? 0,
          report.runHours ?? 0,
          downtimeHours,
          report.dieselUsed ?? 0,
          report.reagentsUsed ?? 0,
        ]
      }),
    ]

    downloadCsv(`plant-reports-${startDate}-to-${endDate}.csv`, rows)
  }

  const handleExportShiftCsv = () => {
    const rows = [
      ["Date", "Site", "Shift", "Work Type", "Crew Count", "Status"],
      ...shiftData.map((report) => [
        format(new Date(report.date), "yyyy-MM-dd"),
        report.site?.name ?? "",
        report.shift,
        report.workType,
        report.crewCount,
        report.status,
      ]),
    ]

    downloadCsv(`shift-reports-${startDate}-to-${endDate}.csv`, rows)
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Reports" description="Generate production and downtime summaries" />

      {hasErrors && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load reports</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(sitesError || plantError || shiftError || downtimeError)}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
          <CardDescription>Select site and date range</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold mb-2">Site</label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger className="w-full">
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
              <label className="block text-sm font-semibold mb-2">Start Date</label>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">End Date</label>
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>

            <div className="md:col-span-4 flex flex-wrap items-center gap-3">
              <Button onClick={handleExport} disabled={exporting || isLoading}>
                {exporting ? "Exporting..." : "Export PDF"}
              </Button>
              <Button
                variant="outline"
                onClick={handleExportPlantCsv}
                disabled={isLoading}
              >
                Export Plant CSV
              </Button>
              <Button
                variant="outline"
                onClick={handleExportShiftCsv}
                disabled={isLoading}
              >
                Export Shift CSV
              </Button>
              <p className="text-xs text-muted-foreground">
                Export includes production, downtime, and shift summaries.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6 bg-background">
        <Card>
          <CardHeader>
            <CardTitle>Production Summary</CardTitle>
            <CardDescription>
              {startDate} to {endDate}
              {selectedSite === "all" ? " · All sites" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Tonnes Processed</p>
                  <p className="text-2xl font-semibold">{summary.tonnesProcessed.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Tonnes fed: {summary.tonnesFed.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Gold Recovered</p>
                  <p className="text-2xl font-semibold">{summary.goldRecovered.toFixed(2)} g</p>
                  <p className="text-xs text-muted-foreground">Run hours: {summary.runHours.toFixed(1)}h</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Consumables</p>
                  <p className="text-2xl font-semibold">{summary.dieselUsed.toFixed(1)} L</p>
                  <p className="text-xs text-muted-foreground">
                    Reagents used: {summary.reagentsUsed.toFixed(1)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Site Breakdown</CardTitle>
            <CardDescription>Production totals by site</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : siteSummary.length === 0 ? (
              <div className="text-sm text-muted-foreground">No site data available.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 font-semibold">Site</th>
                      <th className="py-2 font-semibold">Tonnes Processed</th>
                      <th className="py-2 font-semibold">Gold Recovered (g)</th>
                      <th className="py-2 font-semibold">Run Hours</th>
                      <th className="py-2 font-semibold">Downtime (h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteSummary.map((site) => (
                      <tr key={site.siteName} className="border-b last:border-b-0">
                        <td className="py-2">{site.siteName}</td>
                        <td className="py-2">{site.tonnesProcessed.toFixed(1)}</td>
                        <td className="py-2">{site.goldRecovered.toFixed(2)}</td>
                        <td className="py-2">{site.runHours.toFixed(1)}</td>
                        <td className="py-2">{site.downtimeHours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Downtime Summary</CardTitle>
            <CardDescription>Plant report downtime events</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedSite === "all" ? (
              <div className="text-sm text-muted-foreground">
                Select a site to view detailed downtime analytics.
              </div>
            ) : downtimeLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : downtimeAnalytics ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Total Downtime</p>
                  <p className="text-2xl font-semibold">{downtimeAnalytics.totalDowntimeHours.toFixed(1)}h</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Incidents</p>
                  <p className="text-2xl font-semibold">{downtimeAnalytics.totalIncidents}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Top Cause</p>
                  <p className="text-lg font-semibold">
                    {downtimeAnalytics.topCause?.description ?? "No downtime recorded"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No downtime data for this range.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shift Activity</CardTitle>
            <CardDescription>Shift reports by work type</CardDescription>
          </CardHeader>
          <CardContent>
            {shiftLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : shiftData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No shift reports for this range.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 font-semibold">Work Type</th>
                      <th className="py-2 font-semibold">Reports</th>
                      <th className="py-2 font-semibold">Crew Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(workTypeSummary).map(([workType, data]) => (
                      <tr key={workType} className="border-b last:border-b-0">
                        <td className="py-2">{workType}</td>
                        <td className="py-2">{data.count}</td>
                        <td className="py-2">{data.crew}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plant Reports</CardTitle>
            <CardDescription>Detailed daily entries</CardDescription>
          </CardHeader>
          <CardContent>
            {plantLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : reportData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No plant reports for this range.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 font-semibold">Date</th>
                      <th className="py-2 font-semibold">Site</th>
                      <th className="py-2 font-semibold">Tonnes Processed</th>
                      <th className="py-2 font-semibold">Gold Recovered</th>
                      <th className="py-2 font-semibold">Run Hours</th>
                      <th className="py-2 font-semibold">Downtime (h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((report) => {
                      const downtimeHours =
                        report.downtimeEvents?.reduce((total, event) => total + event.durationHours, 0) ?? 0
                      return (
                        <tr key={report.id} className="border-b last:border-b-0">
                          <td className="py-2">{format(new Date(report.date), "MMM d, yyyy")}</td>
                          <td className="py-2">{report.site?.name ?? "Site"}</td>
                          <td className="py-2">{(report.tonnesProcessed ?? 0).toFixed(1)}</td>
                          <td className="py-2">{(report.goldRecovered ?? 0).toFixed(2)}</td>
                          <td className="py-2">{(report.runHours ?? 0).toFixed(1)}</td>
                          <td className="py-2">{downtimeHours.toFixed(1)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="absolute left-[-9999px] top-0">
        <div ref={reportPdfRef}>
          <PdfTemplate
            title="Operations Report"
            subtitle={`${startDate} to ${endDate}`}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Plant reports", value: String(reportData.length) },
              { label: "Shift reports", value: String(shiftData.length) },
            ]}
          >
            <div className="space-y-6 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded border border-gray-200 p-3">
                  <div className="text-[10px] uppercase text-gray-500">Tonnes Processed</div>
                  <div className="text-base font-semibold">{summary.tonnesProcessed.toFixed(1)}</div>
                </div>
                <div className="rounded border border-gray-200 p-3">
                  <div className="text-[10px] uppercase text-gray-500">Gold Recovered</div>
                  <div className="text-base font-semibold">{summary.goldRecovered.toFixed(2)} g</div>
                </div>
                <div className="rounded border border-gray-200 p-3">
                  <div className="text-[10px] uppercase text-gray-500">Run Hours</div>
                  <div className="text-base font-semibold">{summary.runHours.toFixed(1)}h</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">Site Breakdown</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2">Site</th>
                      <th className="py-2">Tonnes</th>
                      <th className="py-2">Gold (g)</th>
                      <th className="py-2">Run Hours</th>
                      <th className="py-2">Downtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteSummary.map((site) => (
                      <tr key={site.siteName} className="border-b border-gray-100">
                        <td className="py-2">{site.siteName}</td>
                        <td className="py-2">{site.tonnesProcessed.toFixed(1)}</td>
                        <td className="py-2">{site.goldRecovered.toFixed(2)}</td>
                        <td className="py-2">{site.runHours.toFixed(1)}</td>
                        <td className="py-2">{site.downtimeHours.toFixed(1)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">Shift Summary</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2">Work Type</th>
                      <th className="py-2">Reports</th>
                      <th className="py-2">Crew Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(workTypeSummary).map(([workType, data]) => (
                      <tr key={workType} className="border-b border-gray-100">
                        <td className="py-2">{workType}</td>
                        <td className="py-2">{data.count}</td>
                        <td className="py-2">{data.crew}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </PdfTemplate>
        </div>
      </div>
    </div>
  )
}
