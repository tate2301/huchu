"use client"

import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { format, subDays } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, Save, Send } from "lucide-react"

import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { PdfTemplate } from "@/components/pdf/pdf-template"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { PageIntro } from "@/components/shared/page-intro"
import { ContextHelp } from "@/components/shared/context-help"
import { RecordSavedBanner } from "@/components/shared/record-saved-banner"
import { fetchDowntimeCodes, fetchPlantReports, fetchSites } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { exportElementToPdf } from "@/lib/pdf"
import { buildSavedRecordRedirect } from "@/lib/saved-record"

const toNumber = (value: string) => {
  if (value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

type DowntimeEvent = {
  downtimeCodeId: string
  durationHours: string
  notes: string
}

export default function PlantReportPage() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const createdId = searchParams.get("createdId")
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    siteId: searchParams.get("siteId") ?? "",
    tonnesFed: "",
    tonnesProcessed: "",
    runHours: "",
    dieselUsed: "",
    grindingMedia: "",
    reagentsUsed: "",
    waterUsed: "",
    goldRecovered: "",
    notes: "",
  })
  const [listSiteId, setListSiteId] = useState(searchParams.get("siteId") ?? "all")
  const [listStartDate, setListStartDate] = useState(
    searchParams.get("startDate") ?? format(subDays(new Date(), 6), "yyyy-MM-dd"),
  )
  const [listEndDate, setListEndDate] = useState(
    searchParams.get("endDate") ?? format(new Date(), "yyyy-MM-dd"),
  )
  const plantReportPdfRef = useRef<HTMLDivElement>(null)

  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([])

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  const activeSiteId = formData.siteId || sites?.[0]?.id || ""

  const {
    data: downtimeCodes,
    isLoading: downtimeLoading,
    error: downtimeError,
  } = useQuery({
    queryKey: ["downtime-codes", activeSiteId],
    queryFn: () => fetchDowntimeCodes({ siteId: activeSiteId, active: true }),
    enabled: !!activeSiteId,
  })

  const activeListSiteId = listSiteId === "all" ? "" : listSiteId
  const {
    data: plantReportsData,
    isLoading: plantReportsLoading,
    error: plantReportsError,
  } = useQuery({
    queryKey: ["plant-reports", "list", activeListSiteId || "all", listStartDate, listEndDate],
    queryFn: () =>
      fetchPlantReports({
        siteId: activeListSiteId || undefined,
        startDate: listStartDate,
        endDate: listEndDate,
        limit: 200,
      }),
    enabled: !!listStartDate && !!listEndDate,
  })

  const plantReportMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ id: string; createdAt?: string }>("/api/plant-reports", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (report, variables) => {
      toast({
        title: "Plant report submitted",
        description: "Production report saved successfully.",
        variant: "success",
      })
      localStorage.removeItem("plantReportDraft")
      const reportDate = String(variables.date ?? "").slice(0, 10)
      const reportSiteId = String(variables.siteId ?? "")
      const destination = buildSavedRecordRedirect(
        "/plant-report",
        {
          createdId: report.id,
          createdAt: report.createdAt,
          source: "plant-report",
        },
        {
          siteId: reportSiteId,
          startDate: reportDate,
          endDate: reportDate,
        },
      )
      router.push(destination)
    },
    onError: (error) => {
      toast({
        title: "Unable to submit report",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const addDowntime = () => {
    setDowntimeEvents([...downtimeEvents, { downtimeCodeId: "", durationHours: "", notes: "" }])
  }

  const updateDowntime = (index: number, field: keyof DowntimeEvent, value: string) => {
    const updated = [...downtimeEvents]
    updated[index] = { ...updated[index], [field]: value }
    setDowntimeEvents(updated)
  }

  const removeDowntime = (index: number) => {
    setDowntimeEvents(downtimeEvents.filter((_, i) => i !== index))
  }

  const handleSaveDraft = () => {
    localStorage.setItem(
      "plantReportDraft",
      JSON.stringify({
        ...formData,
        downtimeEvents,
        savedAt: new Date().toISOString(),
      }),
    )
    toast({
      title: "Draft saved",
      description: "Plant report saved locally on this device.",
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!activeSiteId) {
      toast({
        title: "Site required",
        description: "Select a site before submitting.",
        variant: "destructive",
      })
      return
    }

    const downtimePayload = downtimeEvents
      .filter((event) => event.downtimeCodeId && event.durationHours.trim() !== "")
      .map((event) => ({
        downtimeCodeId: event.downtimeCodeId,
        durationHours: Number(event.durationHours),
        notes: event.notes || undefined,
      }))

    const payload = {
      date: formData.date,
      siteId: activeSiteId,
      tonnesFed: toNumber(formData.tonnesFed),
      tonnesProcessed: toNumber(formData.tonnesProcessed),
      runHours: toNumber(formData.runHours),
      dieselUsed: toNumber(formData.dieselUsed),
      grindingMedia: toNumber(formData.grindingMedia),
      reagentsUsed: toNumber(formData.reagentsUsed),
      waterUsed: toNumber(formData.waterUsed),
      goldRecovered: toNumber(formData.goldRecovered),
      notes: formData.notes || undefined,
      downtimeEvents: downtimePayload.length > 0 ? downtimePayload : undefined,
    }

    plantReportMutation.mutate(payload)
  }

  const totalDowntime = downtimeEvents.reduce(
    (sum, event) => sum + (parseFloat(event.durationHours) || 0),
    0,
  )
  const plantReportRecords = useMemo(
    () => plantReportsData?.data ?? [],
    [plantReportsData],
  )
  const activeListSiteName =
    listSiteId === "all"
      ? "All sites"
      : sites?.find((site) => site.id === listSiteId)?.name ?? "Selected site"

  const error = sitesError || downtimeError || plantReportMutation.error

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button size="sm" variant="outline" onClick={handleSaveDraft}>
          <Save className="h-4 w-4" />
          Save Draft
        </Button>
        <Button size="sm" type="submit" form="plant-report-form" disabled={plantReportMutation.isPending}>
          <Send className="h-4 w-4" />
          Submit
        </Button>
      </PageActions>

      <PageHeading title="Plant Report" description="Processing and consumables tracking" />
      <PageIntro
        title="Complete this plant report in 3 steps"
        purpose="Step 1: capture site and production values. Step 2: add downtime and consumables. Step 3: submit and verify in the report table."
        nextStep="Start with date and site under Plant Details."
      />
      <ContextHelp href="/help#plant-report" />
      <RecordSavedBanner entityLabel="plant report" />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to submit report</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <form id="plant-report-form" onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Plant Details</CardTitle>
            <CardDescription>Date and site information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Date *</label>
                <Input type="date" name="date" value={formData.date} onChange={handleChange} required />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Site *</label>
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    name="siteId"
                    value={activeSiteId || undefined}
                    onValueChange={handleSelectChange("siteId")}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select site..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Production</CardTitle>
            <CardDescription>Tonnes processed and run hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Tonnes Fed</label>
                <Input type="number" name="tonnesFed" value={formData.tonnesFed} onChange={handleChange} placeholder="0" />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Tonnes Processed</label>
                <Input
                  type="number"
                  name="tonnesProcessed"
                  value={formData.tonnesProcessed}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Run Hours</label>
                <Input type="number" name="runHours" value={formData.runHours} onChange={handleChange} placeholder="0" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consumables</CardTitle>
            <CardDescription>Diesel, media, and reagents used</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Diesel Used (litres)</label>
                <Input type="number" name="dieselUsed" value={formData.dieselUsed} onChange={handleChange} placeholder="0" />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Grinding Media (kg)</label>
                <Input
                  type="number"
                  name="grindingMedia"
                  value={formData.grindingMedia}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Reagents Used (kg)</label>
                <Input type="number" name="reagentsUsed" value={formData.reagentsUsed} onChange={handleChange} placeholder="0" />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Water Used (m3)</label>
                <Input type="number" name="waterUsed" value={formData.waterUsed} onChange={handleChange} placeholder="0" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Downtime</CardTitle>
            <CardDescription>Record any downtime events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalDowntime > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span>Total downtime: {totalDowntime} hours</span>
              </div>
            )}

            {downtimeEvents.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">No downtime events recorded</div>
            ) : (
              <div className="space-y-4">
                {downtimeEvents.map((event, index) => (
                  <div key={index} className="space-y-3 p-3 border rounded-md">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-semibold mb-2">Code</label>
                        {downtimeLoading ? (
                          <Skeleton className="h-9 w-full" />
                        ) : (
                          <Select
                            value={event.downtimeCodeId}
                            onValueChange={(value) => updateDowntime(index, "downtimeCodeId", value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select code" />
                            </SelectTrigger>
                            <SelectContent>
                              {downtimeCodes?.map((code) => (
                                <SelectItem key={code.id} value={code.id}>
                                  {code.code} - {code.description}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2">Hours</label>
                        <Input
                          type="number"
                          value={event.durationHours}
                          onChange={(e) => updateDowntime(index, "durationHours", e.target.value)}
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2">Notes</label>
                        <Input
                          type="text"
                          value={event.notes}
                          onChange={(e) => updateDowntime(index, "notes", e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeDowntime(index)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" onClick={addDowntime} className="w-full">
              + Add Downtime Event
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gold Recovered</CardTitle>
            <CardDescription>Only if a pour happened today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Gold Recovered (grams)</label>
                <Input
                  type="number"
                  name="goldRecovered"
                  value={formData.goldRecovered}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Any additional observations or issues..." rows={3} />
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button type="button" variant="outline" onClick={handleSaveDraft} className="flex-1">
            <Save className="mr-2 h-5 w-5" />
            Save Draft
          </Button>

          <Button type="submit" disabled={plantReportMutation.isPending} className="flex-1">
            <Send className="mr-2 h-5 w-5" />
            Submit Report
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Plant Reports</CardTitle>
              <CardDescription>Review submitted plant reports</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (plantReportPdfRef.current) {
                  exportElementToPdf(
                    plantReportPdfRef.current,
                    `plant-reports-${listStartDate}-to-${listEndDate}.pdf`,
                  )
                }
              }}
              disabled={plantReportsLoading || plantReportRecords.length === 0}
            >
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {plantReportsError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load plant reports</AlertTitle>
              <AlertDescription>{getApiErrorMessage(plantReportsError)}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold mb-2">Site</label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={listSiteId} onValueChange={setListSiteId}>
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
              <Input
                type="date"
                value={listStartDate}
                onChange={(event) => setListStartDate(event.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">End Date</label>
              <Input
                type="date"
                value={listEndDate}
                onChange={(event) => setListEndDate(event.target.value)}
              />
            </div>
          </div>

          {plantReportsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : plantReportRecords.length === 0 ? (
            <div className="text-sm text-muted-foreground">No plant reports for this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-semibold">Date</th>
                    <th className="text-left p-3 font-semibold">Site</th>
                    <th className="text-left p-3 font-semibold">Tonnes Processed</th>
                    <th className="text-left p-3 font-semibold">Run Hours</th>
                    <th className="text-left p-3 font-semibold">Gold Recovered</th>
                    <th className="text-left p-3 font-semibold">Downtime</th>
                  </tr>
                </thead>
                <tbody>
                  {plantReportRecords.map((report) => {
                    const downtimeHours =
                      report.downtimeEvents?.reduce((sum, event) => sum + event.durationHours, 0) ?? 0
                    return (
                      <tr key={report.id} className={`border-b ${createdId === report.id ? "bg-[var(--status-success-bg)]" : ""}`}>
                        <td className="p-3">{format(new Date(report.date), "MMM d, yyyy")}</td>
                        <td className="p-3">{report.site?.name}</td>
                        <td className="p-3">{(report.tonnesProcessed ?? 0).toFixed(1)}</td>
                        <td className="p-3">{(report.runHours ?? 0).toFixed(1)}</td>
                        <td className="p-3">{(report.goldRecovered ?? 0).toFixed(2)}</td>
                        <td className="p-3">{downtimeHours.toFixed(1)}h</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={plantReportPdfRef}>
          <PdfTemplate
            title="Plant Reports"
            subtitle={`${listStartDate} to ${listEndDate}`}
            meta={[
              { label: "Site", value: activeListSiteName },
              { label: "Total reports", value: String(plantReportRecords.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Tonnes Processed</th>
                  <th className="py-2">Run Hours</th>
                  <th className="py-2">Gold Recovered</th>
                  <th className="py-2">Downtime</th>
                </tr>
              </thead>
              <tbody>
                {plantReportRecords.map((report) => {
                  const downtimeHours =
                    report.downtimeEvents?.reduce(
                      (sum, event) => sum + event.durationHours,
                      0,
                    ) ?? 0
                  return (
                    <tr key={report.id} className="border-b border-gray-100">
                      <td className="py-2">{format(new Date(report.date), "MMM d, yyyy")}</td>
                      <td className="py-2">{report.site?.name}</td>
                      <td className="py-2">{(report.tonnesProcessed ?? 0).toFixed(1)}</td>
                      <td className="py-2">{(report.runHours ?? 0).toFixed(1)}</td>
                      <td className="py-2">{(report.goldRecovered ?? 0).toFixed(2)}</td>
                      <td className="py-2">{downtimeHours.toFixed(1)}h</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  )
}
