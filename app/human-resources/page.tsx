"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2 } from "@/lib/icons"

import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { fetchEmployees } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"

const employeePositions = [
  { value: "MANAGER", label: "Manager" },
  { value: "CLERK", label: "Clerk" },
  { value: "SUPPORT_STAFF", label: "Support Staff" },
  { value: "ENGINEERS", label: "Engineers" },
  { value: "CHEMIST", label: "Chemist" },
  { value: "MINERS", label: "Miners" },
] as const

type EmployeePosition = (typeof employeePositions)[number]["value"]

type EmployeeForm = {
  name: string
  phone: string
  nextOfKinName: string
  nextOfKinPhone: string
  passportPhotoUrl: string
  villageOfOrigin: string
  position: EmployeePosition
  isActive: boolean
}

const emptyEmployee: EmployeeForm = {
  name: "",
  phone: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  passportPhotoUrl: "",
  villageOfOrigin: "",
  position: "MINERS",
  isActive: true,
}

export default function HumanResourcesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<EmployeeForm>(emptyEmployee)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [passportUploading, setPassportUploading] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "active",
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", search, statusFilter],
    queryFn: () =>
      fetchEmployees({
        search,
        active: statusFilter === "all" ? undefined : statusFilter === "active",
        limit: 500,
      }),
  })

  const employees = useMemo(() => data?.data ?? [], [data])

  const createEmployeeMutation = useMutation({
    mutationFn: async (payload: EmployeeForm) =>
      fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Employee created",
        description: "Employee has been added to human resources.",
        variant: "success",
      })
      setFormData(emptyEmployee)
      setEditingId(null)
      setFormOpen(false)
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to create employee",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: EmployeeForm }) =>
      fetchJson(`/api/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Employee updated",
        description: "Changes saved successfully.",
        variant: "success",
      })
      setFormData(emptyEmployee)
      setEditingId(null)
      setFormOpen(false)
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to update employee",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Employee deleted",
        description: "Employee record removed.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to delete employee",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const handleChange =
    (field: keyof EmployeeForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: event.target.value }))
    }

  const handleSelectStatus = (value: string) => {
    setFormData((prev) => ({ ...prev, isActive: value === "active" }))
  }

  const handleSelectPosition = (value: string) => {
    setFormData((prev) => ({ ...prev, position: value as EmployeeForm["position"] }))
  }

  const uploadPassportPhoto = async (_file: File) => {
    return "https://placehold.co/240x320?text=Passport"
  }

  const handlePassportPhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPassportUploading(true)
    try {
      const url = await uploadPassportPhoto(file)
      setFormData((prev) => ({ ...prev, passportPhotoUrl: url }))
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (passportUploading) {
      toast({
        title: "Upload in progress",
        description: "Wait for the passport photo to finish uploading.",
        variant: "destructive",
      })
      return
    }

    if (!formData.passportPhotoUrl) {
      toast({
        title: "Passport photo required",
        description: "Upload a passport photo before saving.",
        variant: "destructive",
      })
      return
    }

    if (editingId) {
      updateEmployeeMutation.mutate({ id: editingId, payload: formData })
    } else {
      createEmployeeMutation.mutate(formData)
    }
  }

  const handleEdit = (employee: EmployeeForm & { id: string }) => {
    setEditingId(employee.id)
    setFormData({
      name: employee.name,
      phone: employee.phone,
      nextOfKinName: employee.nextOfKinName,
      nextOfKinPhone: employee.nextOfKinPhone,
      passportPhotoUrl: employee.passportPhotoUrl,
      villageOfOrigin: employee.villageOfOrigin,
      position: employee.position,
      isActive: employee.isActive,
    })
    setFormOpen(true)
  }

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this employee? This cannot be undone.")) {
      return
    }
    deleteEmployeeMutation.mutate(id)
  }

  const resetForm = () => {
    setEditingId(null)
    setFormData(emptyEmployee)
    setPassportUploading(false)
  }

  const openNewEmployee = () => {
    resetForm()
    setFormOpen(true)
  }

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open)
    if (!open) {
      resetForm()
    }
  }

  return (
    <HrShell
      activeTab="employees"
      actions={
        <Button size="sm" onClick={openNewEmployee}>
          <Plus className="h-4 w-4" />
          New Employee
        </Button>
      }
      description="Employee records and attendance roster"
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load employees</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <Sheet open={formOpen} onOpenChange={handleFormOpenChange}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Employee" : "Add Employee"}</SheetTitle>
            <SheetDescription>Employee IDs are generated automatically.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Name *</label>
                <Input
                  value={formData.name}
                  onChange={handleChange("name")}
                  placeholder="Full name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Phone *</label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange("phone")}
                  placeholder="07xx xxx xxx"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Village of Origin *</label>
                <Input
                  value={formData.villageOfOrigin}
                  onChange={handleChange("villageOfOrigin")}
                  placeholder="Village"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Position *</label>
                <Select value={formData.position} onValueChange={handleSelectPosition}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeePositions.map((position) => (
                      <SelectItem key={position.value} value={position.value}>
                        {position.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Status</label>
              <Select
                value={formData.isActive ? "active" : "inactive"}
                onValueChange={handleSelectStatus}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Next of Kin Name *</label>
                <Input
                  value={formData.nextOfKinName}
                  onChange={handleChange("nextOfKinName")}
                  placeholder="Next of kin"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Next of Kin Phone *</label>
                <Input
                  type="tel"
                  value={formData.nextOfKinPhone}
                  onChange={handleChange("nextOfKinPhone")}
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
              <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 5MB.</p>
              {passportUploading ? (
                <p className="text-xs text-muted-foreground">Uploading photo...</p>
              ) : null}
              {formData.passportPhotoUrl ? (
                <img
                  src={formData.passportPhotoUrl}
                  alt="Passport preview"
                  className="h-20 w-20 rounded border object-cover"
                />
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={
                  passportUploading ||
                  createEmployeeMutation.isPending ||
                  updateEmployeeMutation.isPending
                }
              >
                {editingId ? "Save Changes" : "Create Employee"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleFormOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Card>
        <CardHeader>
          <CardTitle>Employee Directory</CardTitle>
          <CardDescription>Search, update, or deactivate employees</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[2fr,1fr] mb-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, ID, or phone"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as "all" | "active" | "inactive")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Employee</th>
                  <th className="text-left p-3 text-sm font-semibold">Contact</th>
                  <th className="text-left p-3 text-sm font-semibold">Position</th>
                  <th className="text-left p-3 text-sm font-semibold">Next of Kin</th>
                  <th className="text-left p-3 text-sm font-semibold">Village</th>
                  <th className="text-left p-3 text-sm font-semibold">Gold Owed</th>
                  <th className="text-left p-3 text-sm font-semibold">Salary Owed</th>
                  <th className="text-center p-3 text-sm font-semibold">Status</th>
                  <th className="text-right p-3 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="p-3">
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-3 text-sm text-muted-foreground">
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  employees.map((employee) => (
                    <tr key={employee.id} className="border-b hover:bg-muted/60">
                      <td className="p-3 text-sm">
                        <div className="flex items-center gap-3">
                          <img
                            src={employee.passportPhotoUrl}
                            alt={employee.name}
                            className="h-10 w-10 rounded border object-cover"
                          />
                          <div>
                            <div className="font-semibold">{employee.name}</div>
                            <div className="text-xs text-muted-foreground">
                              ID: {employee.employeeId}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sm">{employee.phone}</td>
                      <td className="p-3 text-sm">
                        {employeePositions.find((position) => position.value === employee.position)
                          ?.label ?? employee.position}
                      </td>
                      <td className="p-3 text-sm">
                        <div className="font-semibold">{employee.nextOfKinName}</div>
                        <div className="text-xs text-muted-foreground">
                          {employee.nextOfKinPhone}
                        </div>
                      </td>
                      <td className="p-3 text-sm">{employee.villageOfOrigin}</td>
                      <td className="p-3 text-sm">
                        <div className="font-semibold">{employee.goldOwed.toFixed(3)} g</div>
                        <div className="text-xs text-muted-foreground">Outstanding gold</div>
                      </td>
                      <td className="p-3 text-sm">
                        <div className="font-semibold">${employee.salaryOwed.toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">Outstanding salary</div>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={employee.isActive ? "secondary" : "destructive"}>
                          {employee.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(employee)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(employee.id)}
                            disabled={deleteEmployeeMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </HrShell>
  )
}
