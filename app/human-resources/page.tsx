"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { Pencil, Plus, Trash2 } from "@/lib/icons"

import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  nationalIdNumber: string
  nationalIdDocumentUrl: string
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
  nationalIdNumber: "",
  nationalIdDocumentUrl: "",
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
  const [nationalIdUploading, setNationalIdUploading] = useState(false)
  const [employeeIdPendingDelete, setEmployeeIdPendingDelete] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "active",
  )
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", queryState.search, statusFilter],
    queryFn: () =>
      fetchEmployees({
        search: queryState.search,
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
  const employeePendingDelete = useMemo(
    () => employees.find((employee) => employee.id === employeeIdPendingDelete) ?? null,
    [employeeIdPendingDelete, employees],
  )

  const toEmployeePayload = (
    payload: EmployeeForm,
    options?: { includeTemplate?: boolean; includeNullNationalIdFields?: boolean },
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
    nationalIdNumber:
      payload.nationalIdNumber.trim() === ""
        ? options?.includeNullNationalIdFields
          ? null
          : undefined
        : payload.nationalIdNumber.trim(),
    nationalIdDocumentUrl:
      payload.nationalIdDocumentUrl.trim() === ""
        ? options?.includeNullNationalIdFields
          ? null
          : undefined
        : payload.nationalIdDocumentUrl.trim(),
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
        body: JSON.stringify(
          toEmployeePayload(payload, { includeNullNationalIdFields: true }),
        ),
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
      setEmployeeIdPendingDelete(null)
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

  const uploadEmployeeFile = async (
    file: File,
    context: "employee-passport" | "employee-national-id",
  ) => {
    const formDataPayload = new FormData()
    formDataPayload.append("context", context)
    formDataPayload.append("file", file)

    const response = await fetch("/api/uploads", {
      method: "POST",
      credentials: "include",
      body: formDataPayload,
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const message = data && typeof data.error === "string" ? data.error : "Upload failed"
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
      const url = await uploadEmployeeFile(file, "employee-passport")
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

  const handleNationalIdDocumentChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    setNationalIdUploading(true)
    try {
      const url = await uploadEmployeeFile(file, "employee-national-id")
      setFormData((prev) => ({ ...prev, nationalIdDocumentUrl: url }))
      toast({
        title: "ID copy uploaded",
        description: "National ID copy saved successfully.",
        variant: "success",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed"
      toast({
        title: "Unable to upload ID copy",
        description: message,
        variant: "destructive",
      })
    } finally {
      setNationalIdUploading(false)
      event.target.value = ""
    }
  }

  const isPdfDocumentUrl = (url: string) => /\.pdf($|\?)/i.test(url)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (passportUploading || nationalIdUploading) {
      toast({
        title: "Upload in progress",
        description: "Wait for uploads to finish before saving.",
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

  const handleEdit = useCallback((employee: EmployeeSummary) => {
    setEditingId(employee.id)
    setFormData({
      name: employee.name,
      phone: employee.phone,
      nextOfKinName: employee.nextOfKinName,
      nextOfKinPhone: employee.nextOfKinPhone,
      passportPhotoUrl: employee.passportPhotoUrl,
      nationalIdNumber: employee.nationalIdNumber ?? "",
      nationalIdDocumentUrl: employee.nationalIdDocumentUrl ?? "",
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
  }, [])

  const handleDelete = useCallback((id: string) => {
    setEmployeeIdPendingDelete(id)
  }, [])

  const confirmDelete = () => {
    if (!employeeIdPendingDelete) return
    deleteEmployeeMutation.mutate(employeeIdPendingDelete)
  }

  const resetForm = () => {
    setEditingId(null)
    setFormData(emptyEmployee)
    setPassportUploading(false)
    setNationalIdUploading(false)
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

  const employeeColumns = useMemo<ColumnDef<EmployeeSummary>[]>(
    () => [
      {
        id: "employee",
        header: "Employee",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <img
              src={row.original.passportPhotoUrl}
              alt={row.original.name}
              className="h-10 w-10 rounded border object-cover"
            />
            <div>
              <div className="font-semibold">{row.original.name}</div>
              <div className="text-xs text-muted-foreground">ID: {row.original.employeeId}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: "Contact",
      },
      {
        id: "nationalIdNumber",
        header: "National ID",
        cell: ({ row }) => row.original.nationalIdNumber || "-",
      },
      {
        id: "position",
        header: "Position",
        cell: ({ row }) =>
          employeePositions.find((position) => position.value === row.original.position)?.label ??
          row.original.position,
      },
      {
        id: "org",
        header: "Org",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">
              {row.original.department
                ? `${row.original.department.code} - ${row.original.department.name}`
                : "-"}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.grade
                ? `${row.original.grade.code} - ${row.original.grade.name}`
                : "No grade"}
            </div>
          </div>
        ),
      },
      {
        id: "employment",
        header: "Employment",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">
              {employmentTypes.find((type) => type.value === row.original.employmentType)?.label ??
                row.original.employmentType}
            </div>
            <div className="text-xs text-muted-foreground">
              Hire: {row.original.hireDate ? String(row.original.hireDate).slice(0, 10) : "-"}
            </div>
            <div className="text-xs text-muted-foreground">
              Currency: {row.original.defaultCurrency ?? "USD"}
            </div>
          </div>
        ),
      },
      {
        id: "nextOfKin",
        header: "Next of Kin",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.nextOfKinName}</div>
            <div className="text-xs text-muted-foreground">{row.original.nextOfKinPhone}</div>
          </div>
        ),
      },
      {
        accessorKey: "villageOfOrigin",
        header: "Village",
      },
      {
        id: "goldOwed",
        header: "Gold Owed",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.goldOwed.toFixed(3)} g</div>
            <div className="text-xs text-muted-foreground">Outstanding gold</div>
          </div>
        ),
      },
      {
        id: "salaryOwed",
        header: "Salary Owed",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">${row.original.salaryOwed.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Outstanding salary</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => handleDelete(row.original.id)}
              disabled={deleteEmployeeMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [deleteEmployeeMutation.isPending, handleDelete, handleEdit],
  )

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
        <SheetContent size="md" className="w-full p-6">
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
                <label className="block text-sm font-semibold mb-2">National ID Number</label>
                <Input
                  value={formData.nationalIdNumber}
                  onChange={handleChange("nationalIdNumber")}
                  placeholder="Optional"
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
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-sm font-semibold">Department</label>
                  <Link
                    href="/management/master-data/hr/departments"
                    className="text-xs text-primary hover:underline"
                  >
                    Manage
                  </Link>
                </div>
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
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-sm font-semibold">Grade</label>
                  <Link
                    href="/management/master-data/hr/job-grades"
                    className="text-xs text-primary hover:underline"
                  >
                    Manage
                  </Link>
                </div>
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

            <div className="space-y-2">
              <label className="block text-sm font-semibold">National ID Copy (Optional)</label>
              <Input
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={handleNationalIdDocumentChange}
                disabled={nationalIdUploading}
              />
              <p className="text-xs text-muted-foreground">JPG, PNG, WebP, or PDF up to 5MB.</p>
              {nationalIdUploading ? (
                <p className="text-xs text-muted-foreground">Uploading ID copy...</p>
              ) : null}
              {formData.nationalIdDocumentUrl ? (
                <div className="space-y-2">
                  {isPdfDocumentUrl(formData.nationalIdDocumentUrl) ? (
                    <a
                      href={formData.nationalIdDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline"
                    >
                      View uploaded ID document
                    </a>
                  ) : (
                    <img
                      src={formData.nationalIdDocumentUrl}
                      alt="National ID preview"
                      className="h-20 w-20 rounded border object-cover"
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, nationalIdDocumentUrl: "" }))
                    }
                  >
                    Remove ID copy
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={
                  passportUploading ||
                  nationalIdUploading ||
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

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <DataTable
          data={employees}
          columns={employeeColumns}
          queryState={queryState}
          onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
          features={{ sorting: false, globalFilter: true, pagination: true }}
          pagination={{ enabled: true, server: false }}
          searchPlaceholder="Search by name, ID, or phone"
          tableClassName="text-sm"
          noResultsText="No employees found."
          toolbar={
            <>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as "all" | "active" | "inactive")
                  setQueryState((prev) => ({ ...prev, page: 1 }))
                }}
              >
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
      )}

      <Dialog
        open={Boolean(employeeIdPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setEmployeeIdPendingDelete(null)
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
            <DialogDescription>
              {employeePendingDelete
                ? `Delete ${employeePendingDelete.name} (${employeePendingDelete.employeeId})? This cannot be undone.`
                : "Delete this employee record? This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEmployeeIdPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteEmployeeMutation.isPending}
              onClick={confirmDelete}
            >
              {deleteEmployeeMutation.isPending ? "Deleting..." : "Delete Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HrShell>
  )
}


