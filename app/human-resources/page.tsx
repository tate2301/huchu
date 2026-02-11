"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
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
import {
  fetchCompensationTemplates,
  fetchDepartments,
  fetchEmployees,
  fetchJobGrades,
  type EmployeeSummary,
} from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const employeePositions = [
  { value: "MANAGER", label: "Manager" },
  { value: "CLERK", label: "Clerk" },
  { value: "SUPPORT_STAFF", label: "Support Staff" },
  { value: "ENGINEERS", label: "Engineers" },
  { value: "CHEMIST", label: "Chemist" },
  { value: "MINERS", label: "Miners" },
] as const

const employmentTypes = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "PART_TIME", label: "Part Time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "CASUAL", label: "Casual" },
] as const

type EmployeePosition = (typeof employeePositions)[number]["value"]
type EmploymentType = (typeof employmentTypes)[number]["value"]

type EmployeeForm = {
  name: string
  phone: string
  nextOfKinName: string
  nextOfKinPhone: string
  passportPhotoUrl: string
  villageOfOrigin: string
  position: EmployeePosition
  departmentId: string
  gradeId: string
  supervisorId: string
  employmentType: EmploymentType
  compensationTemplateId: string
  hireDate: string
  terminationDate: string
  defaultCurrency: string
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
  departmentId: "",
  gradeId: "",
  supervisorId: "",
  employmentType: "FULL_TIME",
  compensationTemplateId: "",
  hireDate: "",
  terminationDate: "",
  defaultCurrency: "USD",
  isActive: true,
}

export default function HumanResourcesPage() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
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

  const { data: departmentsData, error: departmentsError } = useQuery({
    queryKey: ["departments", "hr"],
    queryFn: () => fetchDepartments({ active: true, limit: 500 }),
  })

  const { data: gradesData, error: gradesError } = useQuery({
    queryKey: ["job-grades", "hr"],
    queryFn: () => fetchJobGrades({ active: true, limit: 500 }),
  })
  const { data: templatesData, error: templatesError } = useQuery({
    queryKey: ["compensation-templates", "hr"],
    queryFn: () => fetchCompensationTemplates({ active: true, limit: 500 }),
  })

  const employees = useMemo(() => data?.data ?? [], [data])
  const departments = useMemo(() => departmentsData?.data ?? [], [departmentsData])
  const grades = useMemo(() => gradesData?.data ?? [], [gradesData])
  const templates = useMemo(() => templatesData?.data ?? [], [templatesData])

  const toEmployeePayload = (
    payload: EmployeeForm,
    options?: { includeTemplate?: boolean },
  ) => ({
    ...payload,
    departmentId: payload.departmentId || undefined,
    gradeId: payload.gradeId || undefined,
    supervisorId: payload.supervisorId || undefined,
    compensationTemplateId: options?.includeTemplate
      ? payload.compensationTemplateId || undefined
      : undefined,
    hireDate: payload.hireDate || undefined,
    terminationDate: payload.terminationDate || undefined,
    defaultCurrency: payload.defaultCurrency || "USD",
  })

  const createEmployeeMutation = useMutation({
    mutationFn: async (payload: EmployeeForm) =>
      fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify(toEmployeePayload(payload, { includeTemplate: true })),
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
        body: JSON.stringify(toEmployeePayload(payload)),
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

  const handleSelectDepartment = (value: string) => {
    setFormData((prev) => ({ ...prev, departmentId: value === "none" ? "" : value }))
  }

  const handleSelectGrade = (value: string) => {
    setFormData((prev) => ({ ...prev, gradeId: value === "none" ? "" : value }))
  }

  const handleSelectSupervisor = (value: string) => {
    setFormData((prev) => ({ ...prev, supervisorId: value === "none" ? "" : value }))
  }

  const handleSelectEmploymentType = (value: string) => {
    setFormData((prev) => ({ ...prev, employmentType: value as EmploymentType }))
  }

  const handleSelectCompensationTemplate = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      compensationTemplateId: value === "none" ? "" : value,
    }))
  }

  const uploadPassportPhoto = async (file: File) => {
    void file
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

  const handleEdit = (employee: EmployeeSummary) => {
    setEditingId(employee.id)
    setFormData({
      name: employee.name,
      phone: employee.phone,
      nextOfKinName: employee.nextOfKinName,
      nextOfKinPhone: employee.nextOfKinPhone,
      passportPhotoUrl: employee.passportPhotoUrl,
      villageOfOrigin: employee.villageOfOrigin,
      position: employee.position as EmployeePosition,
      departmentId: employee.departmentId ?? "",
      gradeId: employee.gradeId ?? "",
      supervisorId: employee.supervisorId ?? "",
      employmentType: employee.employmentType ?? "FULL_TIME",
      compensationTemplateId: "",
      hireDate: employee.hireDate ? String(employee.hireDate).slice(0, 10) : "",
      terminationDate: employee.terminationDate ? String(employee.terminationDate).slice(0, 10) : "",
      defaultCurrency: employee.defaultCurrency ?? "USD",
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
    const templateId = searchParams.get("templateId")
    resetForm()
    if (templateId) {
      setFormData((prev) => ({ ...prev, compensationTemplateId: templateId }))
    }
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
      {(error || departmentsError || gradesError || templatesError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load employees</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error || departmentsError || gradesError || templatesError)}
          </AlertDescription>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-semibold mb-2">Department</label>
                <Select
                  value={formData.departmentId || "none"}
                  onValueChange={handleSelectDepartment}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No department</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.code} - {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Grade</label>
                <Select value={formData.gradeId || "none"} onValueChange={handleSelectGrade}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No grade</SelectItem>
                    {grades.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id}>
                        {grade.code} - {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Supervisor</label>
                <Select
                  value={formData.supervisorId || "none"}
                  onValueChange={handleSelectSupervisor}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No supervisor</SelectItem>
                    {employees
                      .filter((employee) => !editingId || employee.id !== editingId)
                      .map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name} ({employee.employeeId})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Employment Type</label>
                <Select value={formData.employmentType} onValueChange={handleSelectEmploymentType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {employmentTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Hire Date</label>
                <Input
                  type="date"
                  value={formData.hireDate}
                  onChange={handleChange("hireDate")}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Termination Date</label>
                <Input
                  type="date"
                  value={formData.terminationDate}
                  onChange={handleChange("terminationDate")}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <Input
                  value={formData.defaultCurrency}
                  onChange={handleChange("defaultCurrency")}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Compensation Template</label>
              <Select
                value={formData.compensationTemplateId || "none"}
                onValueChange={handleSelectCompensationTemplate}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select compensation template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.currency} {template.baseAmount.toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Applying a template creates a compensation profile and employee-scoped approved rules.
              </p>
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
            <Table className="w-full">
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="text-left p-3 text-sm font-semibold">Employee</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Contact</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Position</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Org</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Employment</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Next of Kin</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Village</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Gold Owed</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Salary Owed</TableHead>
                  <TableHead className="text-center p-3 text-sm font-semibold">Status</TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="p-3">
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ) : employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="p-3 text-sm text-muted-foreground">
                      No employees found.
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((employee) => (
                    <TableRow key={employee.id} className="border-b hover:bg-muted/60">
                      <TableCell className="p-3 text-sm">
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
                      </TableCell>
                      <TableCell className="p-3 text-sm">{employee.phone}</TableCell>
                      <TableCell className="p-3 text-sm">
                        {employeePositions.find((position) => position.value === employee.position)
                          ?.label ?? employee.position}
                      </TableCell>
                      <TableCell className="p-3 text-sm">
                        <div className="font-semibold">
                          {employee.department
                            ? `${employee.department.code} - ${employee.department.name}`
                            : "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {employee.grade
                            ? `${employee.grade.code} - ${employee.grade.name}`
                            : "No grade"}
                        </div>
                      </TableCell>
                      <TableCell className="p-3 text-sm">
                        <div className="font-semibold">
                          {employmentTypes.find((type) => type.value === employee.employmentType)
                            ?.label ?? employee.employmentType}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Hire:{" "}
                          {employee.hireDate
                            ? String(employee.hireDate).slice(0, 10)
                            : "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Currency: {employee.defaultCurrency ?? "USD"}
                        </div>
                      </TableCell>
                      <TableCell className="p-3 text-sm">
                        <div className="font-semibold">{employee.nextOfKinName}</div>
                        <div className="text-xs text-muted-foreground">
                          {employee.nextOfKinPhone}
                        </div>
                      </TableCell>
                      <TableCell className="p-3 text-sm">{employee.villageOfOrigin}</TableCell>
                      <TableCell className="p-3 text-sm">
                        <div className="font-semibold">{employee.goldOwed.toFixed(3)} g</div>
                        <div className="text-xs text-muted-foreground">Outstanding gold</div>
                      </TableCell>
                      <TableCell className="p-3 text-sm">
                        <div className="font-semibold">${employee.salaryOwed.toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">Outstanding salary</div>
                      </TableCell>
                      <TableCell className="p-3 text-center">
                        <Badge variant={employee.isActive ? "secondary" : "destructive"}>
                          {employee.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3 text-right">
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
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </HrShell>
  )
}


