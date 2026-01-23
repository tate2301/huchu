"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AlertCircle, Save, Send } from "lucide-react"

import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { fetchDowntimeCodes, fetchSites } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"

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
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    siteId: "",
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

  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([])

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  useEffect(() => {
    if (!formData.siteId && sites && sites.length > 0) {
      setFormData((prev) => ({ ...prev, siteId: sites[0].id }))
    }
  }, [formData.siteId, sites])

  const {
    data: downtimeCodes,
    isLoading: downtimeLoading,
    error: downtimeError,
  } = useQuery({
    queryKey: ["downtime-codes", formData.siteId],
    queryFn: () => fetchDowntimeCodes({ siteId: formData.siteId, active: true }),
    enabled: !!formData.siteId,
  })

  const plantReportMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/plant-reports", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Plant report submitted",
        description: "Production report saved successfully.",
        variant: "success",
      })
      localStorage.removeItem("plantReportDraft")
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

    if (!formData.siteId) {
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
      siteId: formData.siteId,
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
                <label className="block text-sm font-medium mb-2">Date *</label>
                <Input type="date" name="date" value={formData.date} onChange={handleChange} required />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Site *</label>
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select name="siteId" value={formData.siteId || undefined} onValueChange={handleSelectChange("siteId")} required>
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
                <label className="block text-sm font-medium mb-2">Tonnes Fed</label>
                <Input type="number" name="tonnesFed" value={formData.tonnesFed} onChange={handleChange} placeholder="0" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tonnes Processed</label>
                <Input
                  type="number"
                  name="tonnesProcessed"
                  value={formData.tonnesProcessed}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Run Hours</label>
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
                <label className="block text-sm font-medium mb-2">Diesel Used (litres)</label>
                <Input type="number" name="dieselUsed" value={formData.dieselUsed} onChange={handleChange} placeholder="0" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Grinding Media (kg)</label>
                <Input
                  type="number"
                  name="grindingMedia"
                  value={formData.grindingMedia}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Reagents Used (kg)</label>
                <Input type="number" name="reagentsUsed" value={formData.reagentsUsed} onChange={handleChange} placeholder="0" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Water Used (m3)</label>
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
                        <label className="block text-sm font-medium mb-2">Code</label>
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
                        <label className="block text-sm font-medium mb-2">Hours</label>
                        <Input
                          type="number"
                          value={event.durationHours}
                          onChange={(e) => updateDowntime(index, "durationHours", e.target.value)}
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Notes</label>
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
                <label className="block text-sm font-medium mb-2">Gold Recovered (grams)</label>
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
    </div>
  )
}
