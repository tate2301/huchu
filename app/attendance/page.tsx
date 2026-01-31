"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Save, Send, UserCheck, UserPlus, UserX } from "lucide-react"

import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { fetchEmployees, fetchSites } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"

interface CrewMember {
  id: string
  employeeId: string
  name: string
  status: "PRESENT" | "ABSENT" | "LATE"
  overtime: string
}

export default function AttendancePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    shift: "DAY",
    siteId: "",
  })

  const [crew, setCrew] = useState<CrewMember[]>([])
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false)
  const [passportUploading, setPassportUploading] = useState(false)
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    phone: "",
    nextOfKinName: "",
    nextOfKinPhone: "",
    passportPhotoUrl: "",
    villageOfOrigin: "",
  })

  const resetNewEmployee = () => {
    setNewEmployee({
      name: "",
      phone: "",
      nextOfKinName: "",
      nextOfKinPhone: "",
      passportPhotoUrl: "",
      villageOfOrigin: "",
    })
    setPassportUploading(false)
  }

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  const {
    data: employeesData,
    isLoading: employeesLoading,
    error: employeesError,
  } = useQuery({
    queryKey: ["employees", "attendance"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  })

  useEffect(() => {
    if (!formData.siteId && sites && sites.length > 0) {
      setFormData((prev) => ({ ...prev, siteId: sites[0].id }))
    }
  }, [formData.siteId, sites])

  useEffect(() => {
    if (!employeesData) return
    const employees = employeesData.data
    setCrew((prev) => {
      const prevMap = new Map(prev.map((member) => [member.id, member]))
      return employees.map((employee) =>
        prevMap.get(employee.id) ?? {
          id: employee.id,
          employeeId: employee.employeeId,
          name: employee.name,
          status: "PRESENT",
          overtime: "",
        },
      )
    })
  }, [employeesData])

  const attendanceMutation = useMutation({
    mutationFn: async (payload: {
      date: string
      siteId: string
      shift: "DAY" | "NIGHT"
      records: Array<{
        employeeId: string
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

  const createEmployeeMutation = useMutation({
    mutationFn: async (payload: typeof newEmployee) =>
      fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Employee added",
        description: "New employee is available for attendance.",
        variant: "success",
      })
      resetNewEmployee()
      setAddEmployeeOpen(false)
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to add employee",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleAddEmployeeOpenChange = (open: boolean) => {
    setAddEmployeeOpen(open)
    if (!open) {
      resetNewEmployee()
    }
  }

  const handleNewEmployeeChange =
    (field: keyof typeof newEmployee) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setNewEmployee((prev) => ({ ...prev, [field]: event.target.value }))
    }

  const uploadPassportPhoto = async (file: File) => {
    const formDataPayload = new FormData()
    formDataPayload.append("file", file)

    const response = await fetch("/api/uploads/passport-photo", {
      method: "POST",
      credentials: "include",
      body: formDataPayload,
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        data && typeof data.error === "string" ? data.error : "Upload failed"
      throw new Error(message)
    }

    if (!data || typeof data.url !== "string") {
      throw new Error("Upload response missing file URL")
    }

    return data.url as string
  }

  const handlePassportPhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPassportUploading(true)
    try {
      const url = await uploadPassportPhoto(file)
      setNewEmployee((prev) => ({ ...prev, passportPhotoUrl: url }))
      toast({
        title: "Photo uploaded",
        description: "Passport photo saved successfully.",
        variant: "success",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed"
      toast({
        title: "Unable to upload photo",
        description: message,
        variant: "destructive",
      })
    } finally {
      setPassportUploading(false)
      event.target.value = ""
    }
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

  const handleAddEmployeeSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (passportUploading) {
      toast({
        title: "Upload in progress",
        description: "Wait for the passport photo to finish uploading.",
        variant: "destructive",
      })
      return
    }

    if (!newEmployee.passportPhotoUrl) {
      toast({
        title: "Passport photo required",
        description: "Upload a passport photo before saving.",
        variant: "destructive",
      })
      return
    }

    createEmployeeMutation.mutate(newEmployee)
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
      employeeId: member.id,
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

  const loading = sitesLoading || employeesLoading
  const error = sitesError || employeesError || attendanceMutation.error

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button size="sm" variant="outline" onClick={handleSaveDraft}>
          <Save className="h-4 w-4" />
          Save Draft
        </Button>
        <Sheet open={addEmployeeOpen} onOpenChange={handleAddEmployeeOpenChange}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" type="button">
              <UserPlus className="h-4 w-4" />
              Add Employee
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-lg p-6">
            <SheetHeader>
              <SheetTitle>Add Employee</SheetTitle>
              <SheetDescription>Capture a new crew member for attendance.</SheetDescription>
            </SheetHeader>
            <form onSubmit={handleAddEmployeeSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold mb-2">Name *</label>
                  <Input
                    value={newEmployee.name}
                    onChange={handleNewEmployeeChange("name")}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Phone *</label>
                  <Input
                    type="tel"
                    value={newEmployee.phone}
                    onChange={handleNewEmployeeChange("phone")}
                    placeholder="07xx xxx xxx"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold mb-2">Village of Origin *</label>
                  <Input
                    value={newEmployee.villageOfOrigin}
                    onChange={handleNewEmployeeChange("villageOfOrigin")}
                    placeholder="Village"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Next of Kin Name *</label>
                  <Input
                    value={newEmployee.nextOfKinName}
                    onChange={handleNewEmployeeChange("nextOfKinName")}
                    placeholder="Next of kin"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold mb-2">Next of Kin Phone *</label>
                  <Input
                    type="tel"
                    value={newEmployee.nextOfKinPhone}
                    onChange={handleNewEmployeeChange("nextOfKinPhone")}
                    placeholder="07xx xxx xxx"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold">Passport Photo *</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handlePassportPhotoChange}
                  disabled={passportUploading}
                />
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, or WebP up to 5MB.
                </p>
                {passportUploading ? (
                  <p className="text-xs text-muted-foreground">Uploading photo...</p>
                ) : null}
                {newEmployee.passportPhotoUrl ? (
                  <img
                    src={newEmployee.passportPhotoUrl}
                    alt="Passport preview"
                    className="h-20 w-20 rounded border object-cover"
                  />
                ) : null}
              </div>

              <Button
                type="submit"
                disabled={passportUploading || createEmployeeMutation.isPending}
                className="w-full"
              >
                {createEmployeeMutation.isPending ? "Saving..." : "Save Employee"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
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
                <label className="block text-sm font-semibold mb-2">Date *</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Shift *</label>
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
                <label className="block text-sm font-semibold mb-2">Site *</label>
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
                    <div className="flex-1">
                      <div className="font-semibold">{member.name}</div>
                      <div className="text-xs text-muted-foreground">ID: {member.employeeId}</div>
                    </div>

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
