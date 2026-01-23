"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Save, Send, UserCheck, UserX } from "lucide-react"

import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { fetchSites, fetchUsers } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"

interface CrewMember {
  id: string
  name: string
  status: "PRESENT" | "ABSENT" | "LATE"
  overtime: string
}

export default function AttendancePage() {
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    shift: "DAY",
    siteId: "",
  })

  const [crew, setCrew] = useState<CrewMember[]>([])

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
  } = useQuery({
    queryKey: ["users", "attendance"],
    queryFn: () => fetchUsers({ active: true, role: "CLERK", limit: 200 }),
  })

  useEffect(() => {
    if (!formData.siteId && sites && sites.length > 0) {
      setFormData((prev) => ({ ...prev, siteId: sites[0].id }))
    }
  }, [formData.siteId, sites])

  useEffect(() => {
    if (!usersData) return
    const users = usersData.data
    setCrew((prev) => {
      const prevMap = new Map(prev.map((member) => [member.id, member]))
      return users.map((user) =>
        prevMap.get(user.id) ?? {
          id: user.id,
          name: user.name,
          status: "PRESENT",
          overtime: "",
        },
      )
    })
  }, [usersData])

  const attendanceMutation = useMutation({
    mutationFn: async (payload: {
      date: string
      siteId: string
      shift: "DAY" | "NIGHT"
      records: Array<{
        userId: string
        status: "PRESENT" | "ABSENT" | "LATE"
        overtime?: number
        notes?: string
      }>
    }) =>
      fetchJson("/api/attendance", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Attendance submitted",
        description: "Crew attendance has been recorded.",
        variant: "success",
      })
    },
  })

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const updateCrewStatus = (id: string, status: CrewMember["status"]) => {
    setCrew((prev) =>
      prev.map((member) => (member.id === id ? { ...member, status } : member)),
    )
  }

  const updateOvertime = (id: string, overtime: string) => {
    setCrew((prev) =>
      prev.map((member) => (member.id === id ? { ...member, overtime } : member)),
    )
  }

  const handleSaveDraft = () => {
    localStorage.setItem(
      "attendanceDraft",
      JSON.stringify({
        ...formData,
        crew,
        savedAt: new Date().toISOString(),
      }),
    )
    toast({
      title: "Draft saved",
      description: "Attendance saved locally on this device.",
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.siteId) {
      toast({
        title: "Site required",
        description: "Select a site before submitting attendance.",
        variant: "destructive",
      })
      return
    }

    const records = crew.map((member) => ({
      userId: member.id,
      status: member.status,
      overtime:
        member.status === "ABSENT" || member.overtime.trim() === ""
          ? undefined
          : Number(member.overtime),
    }))

    attendanceMutation.mutate({
      date: formData.date,
      siteId: formData.siteId,
      shift: formData.shift as "DAY" | "NIGHT",
      records,
    })
  }

  const presentCount = crew.filter((m) => m.status === "PRESENT" || m.status === "LATE").length
  const absentCount = crew.filter((m) => m.status === "ABSENT").length

  const loading = sitesLoading || usersLoading
  const error = sitesError || usersError || attendanceMutation.error

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button size="sm" variant="outline" onClick={handleSaveDraft}>
          <Save className="h-4 w-4" />
          Save Draft
        </Button>
        <Button
          size="sm"
          type="submit"
          form="attendance-form"
          disabled={attendanceMutation.isPending}
        >
          <Send className="h-4 w-4" />
          Submit
        </Button>
      </PageActions>

      <PageHeading title="Daily Attendance" description="Track crew presence and overtime" />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to submit attendance</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <form id="attendance-form" onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Shift Details</CardTitle>
            <CardDescription>Date, shift, and site information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Date *</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Shift *</label>
                <Select name="shift" value={formData.shift} onValueChange={handleSelectChange("shift")} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">Day Shift</SelectItem>
                    <SelectItem value="NIGHT">Night Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Site *</label>
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select name="site" value={formData.siteId || undefined} onValueChange={handleSelectChange("siteId")} required>
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

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <UserCheck className="h-8 w-8 text-green-600" />
                <div>
                  <div className="text-2xl font-bold">{presentCount}</div>
                  <div className="text-sm text-muted-foreground">Present</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <UserX className="h-8 w-8 text-red-600" />
                <div>
                  <div className="text-2xl font-bold">{absentCount}</div>
                  <div className="text-sm text-muted-foreground">Absent</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Crew Attendance</CardTitle>
            <CardDescription>Mark attendance for each crew member</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : crew.length === 0 ? (
              <div className="text-sm text-muted-foreground">No crew members available.</div>
            ) : (
              <div className="space-y-3">
                {crew.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col md:flex-row md:items-center gap-3 rounded-md border border-border bg-card/60 p-3"
                  >
                    <div className="flex-1 font-medium">{member.name}</div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={member.status === "PRESENT" ? "default" : "outline"}
                        onClick={() => updateCrewStatus(member.id, "PRESENT")}
                      >
                        Present
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={member.status === "LATE" ? "secondary" : "outline"}
                        onClick={() => updateCrewStatus(member.id, "LATE")}
                      >
                        Late
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={member.status === "ABSENT" ? "destructive" : "outline"}
                        onClick={() => updateCrewStatus(member.id, "ABSENT")}
                      >
                        Absent
                      </Button>
                    </div>

                    {(member.status === "PRESENT" || member.status === "LATE") && (
                      <div className="w-full md:w-32">
                        <Input
                          type="number"
                          placeholder="OT hrs"
                          value={member.overtime}
                          onChange={(e) => updateOvertime(member.id, e.target.value)}
                          step="0.5"
                          className="h-9"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button type="button" variant="outline" onClick={handleSaveDraft} className="flex-1">
            <Save className="mr-2 h-5 w-5" />
            Save Draft
          </Button>

          <Button type="submit" disabled={attendanceMutation.isPending} className="flex-1">
            <Send className="mr-2 h-5 w-5" />
            Submit Attendance
          </Button>
        </div>
      </form>
    </div>
  )
}
