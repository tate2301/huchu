"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Camera, Save, Send } from "lucide-react"

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
import { fetchEmployees, fetchSections, fetchSites } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"

const toNumber = (value: string) => {
  if (value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export default function ShiftReportPage() {
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    shift: "DAY",
    siteId: "",
    sectionId: "",
    groupLeaderId: "",
    crewCount: "",
    workType: "PRODUCTION",
    outputTonnes: "",
    outputTrips: "",
    outputWheelbarrows: "",
    metresAdvanced: "",
    hasIncident: false,
    incidentNotes: "",
    handoverNotes: "",
  })

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })
  const activeSiteId = formData.siteId || sites?.[0]?.id || ""

  const {
    data: employeesData,
    isLoading: employeesLoading,
    error: employeesError,
  } = useQuery({
    queryKey: ["employees", "group-leaders"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  })

  const { data: sectionsData, isLoading: sectionsLoading } = useQuery({
    queryKey: ["sections", activeSiteId],
    queryFn: () => fetchSections({ siteId: activeSiteId, active: true, limit: 200 }),
    enabled: !!activeSiteId,
  })

  const groupLeaders = useMemo(() => employeesData?.data ?? [], [employeesData])
  const sections = sectionsData?.data ?? []
  const hasSections = sections.length > 0
  const hasGroupLeaders = groupLeaders.length > 0

  const shiftReportMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/shift-reports", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Shift report submitted",
        description: "Report saved and ready for review.",
        variant: "success",
      })
      localStorage.removeItem("shiftReportDraft")
    },
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => {
        if (field === "siteId") {
          return { ...prev, siteId: value, sectionId: "" }
        }
        return { ...prev, [field]: value }
      })
    }

  const handleSaveDraft = () => {
    localStorage.setItem(
      "shiftReportDraft",
      JSON.stringify({
        ...formData,
        savedAt: new Date().toISOString(),
      }),
    )
    toast({
      title: "Draft saved",
      description: "Shift report saved locally on this device.",
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!activeSiteId || !formData.groupLeaderId) {
      toast({
        title: "Missing details",
        description: "Site and group leader are required.",
        variant: "destructive",
      })
      return
    }

    const payload = {
      date: formData.date,
      shift: formData.shift,
      siteId: activeSiteId,
      sectionId: formData.sectionId || undefined,
      groupLeaderId: formData.groupLeaderId,
      crewCount: Number(formData.crewCount),
      workType: formData.workType,
      outputTonnes: toNumber(formData.outputTonnes),
      outputTrips: toNumber(formData.outputTrips),
      outputWheelbarrows: toNumber(formData.outputWheelbarrows),
      metresAdvanced: toNumber(formData.metresAdvanced),
      hasIncident: formData.hasIncident,
      incidentNotes: formData.hasIncident ? formData.incidentNotes : undefined,
      handoverNotes: formData.handoverNotes || undefined,
    }

    shiftReportMutation.mutate(payload)
  }

  const error = sitesError || employeesError || shiftReportMutation.error

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={shiftReportMutation.isPending}
        >
          <Save className="h-4 w-4" />
          Save Draft
        </Button>
        <Button
          size="sm"
          type="submit"
          form="shift-report-form"
          disabled={shiftReportMutation.isPending}
        >
          <Send className="h-4 w-4" />
          Submit
        </Button>
      </PageActions>

      <PageHeading title="Shift Report" description="Quick 2-minute daily entry" />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to submit report</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <form id="shift-report-form" onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader className="border-b pb-2">
            <CardTitle>Shift Information</CardTitle>
            <CardDescription>Date, shift, and location details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Date *</label>
                <Input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Shift *</label>
                <Select
                  name="shift"
                  value={formData.shift}
                  onValueChange={handleSelectChange("shift")}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">Day Shift</SelectItem>
                    <SelectItem value="NIGHT">Night Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Site *</label>
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

              <div>
                <label className="block text-sm font-medium mb-2">Section/Level</label>
                {sectionsLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    name="sectionId"
                    value={formData.sectionId || undefined}
                    onValueChange={handleSelectChange("sectionId")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select section..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hasSections ? (
                        sections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no_sections__" disabled>
                          No sections found for this site
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Group Leader *</label>
                {employeesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    name="groupLeaderId"
                    value={formData.groupLeaderId || undefined}
                    onValueChange={handleSelectChange("groupLeaderId")}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select group leader" />
                    </SelectTrigger>
                    <SelectContent>
                      {hasGroupLeaders ? (
                        groupLeaders.map((leader) => (
                          <SelectItem key={leader.id} value={leader.id}>
                            {leader.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__no_group_leaders__" disabled>
                          No active employees available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Crew Count *</label>
                <Input
                  type="number"
                  name="crewCount"
                  value={formData.crewCount}
                  onChange={handleChange}
                  placeholder="Number of workers"
                  min="0"
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Work & Output</CardTitle>
            <CardDescription>What was done and produced</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Work Type *</label>
              <Select
                name="workType"
                value={formData.workType}
                onValueChange={handleSelectChange("workType")}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select work type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEVELOPMENT">Development</SelectItem>
                  <SelectItem value="PRODUCTION">Production/Stoping</SelectItem>
                  <SelectItem value="HAULAGE">Haulage/Mucking</SelectItem>
                  <SelectItem value="SUPPORT">Support Work</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Output Metrics (fill what applies)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2">Tonnes</label>
                  <Input
                    type="number"
                    name="outputTonnes"
                    value={formData.outputTonnes}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2">Trips</label>
                  <Input
                    type="number"
                    name="outputTrips"
                    value={formData.outputTrips}
                    onChange={handleChange}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2">Wheelbarrows</label>
                  <Input
                    type="number"
                    name="outputWheelbarrows"
                    value={formData.outputWheelbarrows}
                    onChange={handleChange}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2">Metres Advanced</label>
                  <Input
                    type="number"
                    name="metresAdvanced"
                    value={formData.metresAdvanced}
                    onChange={handleChange}
                    placeholder="0.0"
                    step="0.1"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Safety & Handover</CardTitle>
            <CardDescription>Incidents and notes for next shift</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="hasIncident"
                  checked={formData.hasIncident}
                  onChange={handleChange}
                  className="h-5 w-5 rounded border-border"
                />
                Incident or near miss occurred
              </label>
            </div>

            {formData.hasIncident && (
              <div>
                <label className="block text-sm font-medium mb-2">Incident Details *</label>
                <Textarea
                  name="incidentNotes"
                  value={formData.incidentNotes}
                  onChange={handleChange}
                  placeholder="Describe what happened..."
                  rows={3}
                  required={formData.hasIncident}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Handover Notes</label>
              <Textarea
                name="handoverNotes"
                value={formData.handoverNotes}
                onChange={handleChange}
                placeholder="What should the next shift know?"
                rows={3}
              />
            </div>

            <div>
              <Button type="button" variant="outline" className="w-full">
                <Camera className="mr-2 h-5 w-5" />
                Add Photos (Optional)
              </Button>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Photos can be added as evidence
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={shiftReportMutation.isPending}
            className="flex-1"
          >
            <Save className="mr-2 h-5 w-5" />
            Save Draft
          </Button>

          <Button type="submit" disabled={shiftReportMutation.isPending} className="flex-1">
            <Send className="mr-2 h-5 w-5" />
            Submit Report
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Saves offline / Auto-syncs when connected / 2-minute form
        </p>
      </form>
    </div>
  )
}
