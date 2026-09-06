"use client"

import Link from "next/link"
import Image from "next/image"
import { useCallback, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Pencil, Plus, Trash2 } from "@corelithzw/ui/lib/icons"

import { EmployeeWizard } from "@corelithzw/module-people/components/people/employee-wizard"
import { PeopleShell } from "@corelithzw/module-people/components/people/people-shell";
import {
  DirectoryCell,
  DirectoryLine,
  DirectoryName,
  DirectoryNote,
  EmploymentBadge,
  EMPLOYMENT_TYPE_LABEL,
} from "@corelithzw/module-records/components/people-directory"
import { ViewToolbarChip } from "@corelithzw/module-records/components/view-toolbar"
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert"
import { Badge } from "@corelithzw/ui/components/badge"
import { Button } from "@corelithzw/ui/components/button"
import { DataTable, type DataTableQueryState } from "@corelithzw/ui/components/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu"
import { Input } from "@corelithzw/ui/components/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@corelithzw/ui/components/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@corelithzw/ui/components/sheet"
import { Skeleton } from "@corelithzw/ui/components/skeleton"
import { useToast } from "@corelithzw/ui/components/use-toast"
import { fetchCompensationTemplates, fetchDepartments, fetchEmployees, fetchJobGrades, type EmployeeSummary } from "@corelithzw/module-people/api-client";
import { fetchJson, getApiErrorMessage, resolveDisplayErrorMessage } from "@corelithzw/platform/api-client"
import {
  getDefaultEmployeePosition,
  getEmployeePositionOptions,
  type EmployeePositionValue,
} from "@corelithzw/platform/vertical-defaults"
import { resolveWorkspaceProfileForRoles } from "@corelithzw/platform/vertical-roles"

// The labels come from the shared directory rather than being written again
// here, so the sheet that sets somebody's employment type and the column that
// reports it cannot end up calling the same thing two different names.
const employmentTypes = (["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"] as const).map(
  (value) => ({ value, label: EMPLOYMENT_TYPE_LABEL[value] }),
)

type EmployeePosition = EmployeePositionValue
type EmploymentType = (typeof employmentTypes)[number]["value"]

/** What the status chip says it is filtered to. "Anyone" has no meaning here —
 *  somebody is either on the books or off them. */
const STATUS_FILTER_LABEL = {
  active: "Active",
  inactive: "Inactive",
  all: "Everyone",
} as const

const MODULE_LABELS: Record<string, string> = {
  HR: "HR",
  GOLD: "Gold",
  SCRAP_METAL: "Scrap & Recycling",
  CAR_SALES: "Auto Sales",
  RETAIL: "Retail",
}

const ALLOWED_ACCESS_MODULES_BY_WORKSPACE: Record<string, string[]> = {
  GOLD_MINE: ["HR", "GOLD"],
  SCRAP_METAL: ["HR", "SCRAP_METAL"],
  AUTOS: ["HR", "CAR_SALES"],
  RETAIL: ["HR", "RETAIL"],
  SCHOOLS: ["HR"],
  GENERAL: ["HR", "SCRAP_METAL", "CAR_SALES", "RETAIL"],
}

function normalizeWorkspaceProfile(
  value: string | null | undefined,
  enabledFeatures: string[] | undefined,
) {
  const normalized = resolveWorkspaceProfileForRoles({
    workspaceProfile: value,
    enabledFeatures,
  })
  if (normalized in ALLOWED_ACCESS_MODULES_BY_WORKSPACE) return normalized
  return "GENERAL"
}

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
  position: "SUPPORT_STAFF",
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
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<EmployeeForm>(emptyEmployee)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardInitialTemplateId, setWizardInitialTemplateId] = useState<string | undefined>(undefined)
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
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures ?? [],
    [session],
  )
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile
  const normalizedWorkspaceProfile = useMemo(
    () => normalizeWorkspaceProfile(workspaceProfile, enabledFeatures),
    [enabledFeatures, workspaceProfile],
  )
  const allowedAccessModules = useMemo(
    () => new Set(ALLOWED_ACCESS_MODULES_BY_WORKSPACE[normalizedWorkspaceProfile]),
    [normalizedWorkspaceProfile],
  )
  const employeePositionOptions = useMemo(
    () =>
      getEmployeePositionOptions({
        workspaceProfile: normalizedWorkspaceProfile,
        enabledFeatures,
      }),
    [enabledFeatures, normalizedWorkspaceProfile],
  )
  const defaultPosition = useMemo(
    () =>
      getDefaultEmployeePosition({
        workspaceProfile: normalizedWorkspaceProfile,
        enabledFeatures,
      }),
    [enabledFeatures, normalizedWorkspaceProfile],
  )

  const employees = useMemo(() => data?.data ?? [], [data])
  // Both counts come off the same filtered query, so they agree until the 500
  // cap bites — which is the one case where "500 of 812" is worth saying.
  const employeeTotal = data?.pagination?.total ?? employees.length
  const departments = useMemo(() => departmentsData?.data ?? [], [departmentsData])
  const grades = useMemo(() => gradesData?.data ?? [], [gradesData])
  const templates = useMemo(() => templatesData?.data ?? [], [templatesData])
  const employeePendingDelete = useMemo(
    () => employees.find((employee) => employee.id === employeeIdPendingDelete) ?? null,
    [employeeIdPendingDelete, employees],
  )
  const loadErrorMessage = resolveDisplayErrorMessage([
    error,
    departmentsError,
    gradesError,
    templatesError,
  ])

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

  const getPositionLabel = useCallback(
    (position: EmployeePosition) =>
      employeePositionOptions.find((item) => item.value === position)?.label ?? position,
    [employeePositionOptions],
  )

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
      position: employee.position,
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
    setFormData({
      ...emptyEmployee,
      position: defaultPosition,
    })
    setPassportUploading(false)
    setNationalIdUploading(false)
  }

  const openNewEmployee = () => {
    const templateId = searchParams.get("templateId")
    setWizardInitialTemplateId(templateId ?? undefined)
    setWizardOpen(true)
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
        meta: {
          exportValue: (row: EmployeeSummary) => `${row.name} (${row.employeeId})`,
        },
        cell: ({ row }) => (
          // The artboard's mono second line is the reference and one word of
          // context. The department is that word here — it is what tells two
          // people of the same name apart on a payroll — which frees Position
          // to carry the job title rather than repeating it.
          <DirectoryName
            name={row.original.name}
            photoUrl={row.original.passportPhotoUrl}
            subtitle={[row.original.employeeId, row.original.department?.name]
              .filter(Boolean)
              .join(" · ")}
          />
        ),
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "phone",
        header: "Contact",
        cell: ({ row }) => (
          <DirectoryCell kind="phone" value={row.original.phone} missing="no phone on file" />
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "nationalIdNumber",
        header: "National ID",
        cell: ({ row }) => (
          <DirectoryCell
            kind="code"
            value={row.original.nationalIdNumber}
            missing="not on file"
          />
        ),
        size: 132,
        minSize: 132,
        maxSize: 132},
      {
        id: "position",
        header: "Position",
        meta: {
          exportValue: (row: EmployeeSummary) =>
            row.jobTitle || getPositionLabel(row.position),
        },
        // The written job title where there is one, and the position it maps
        // to where there is not. "Site foreman" is what a foreman is called on
        // site; SUPPORT_STAFF is what the payroll run needs to know, and it is
        // the worse answer to "who is this".
        cell: ({ row }) => (
          <DirectoryCell
            value={row.original.jobTitle || getPositionLabel(row.original.position)}
            missing="No position"
          />
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "org",
        header: "Org",
        meta: {
          // The department rides along here even though the cell no longer
          // draws it. On screen it moved up into the name cell's mono line,
          // but that column exports the name and the employee ID only — so
          // narrowing this to the grade dropped the department out of the
          // spreadsheet altogether, and a payroll export with no department in
          // it cannot be split by cost centre.
          exportValue: (row: EmployeeSummary) => {
            const grade = row.grade ? `${row.grade.code} - ${row.grade.name}` : "No grade";
            return row.department?.name ? `${row.department.name} | ${grade}` : grade;
          },
        },
        // One line, because the artboard's rows are one line. The department
        // has moved up into the name cell, which leaves the grade — the half
        // of somebody's placement that a manager scans this column for.
        cell: ({ row }) => (
          <DirectoryCell
            value={
              row.original.grade
                ? `${row.original.grade.code} - ${row.original.grade.name}`
                : null
            }
            missing="No grade"
          />
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "employment",
        header: "Employment",
        meta: {
          exportValue: (row: EmployeeSummary) => {
            const employment = row.employmentType
              ? (EMPLOYMENT_TYPE_LABEL[row.employmentType] ?? row.employmentType)
              : "not set";
            const hireDate = row.hireDate ? String(row.hireDate).slice(0, 10) : "-";
            return `${employment} | Hire: ${hireDate}`;
          },
        },
        cell: ({ row }) => (
          <DirectoryLine>
            <EmploymentBadge type={row.original.employmentType} />
            {row.original.hireDate ? (
              <DirectoryNote>{String(row.original.hireDate).slice(0, 10)}</DirectoryNote>
            ) : null}
          </DirectoryLine>
        ),
        size: 180,
        minSize: 180,
        maxSize: 180},
      {
        id: "access",
        header: "Access",
        meta: {
          exportValue: (row: EmployeeSummary) => {
            const modules =
              row.moduleAssignments
                ?.map((assignment) => assignment.module)
                .filter((module) => allowedAccessModules.has(module))
                .map((module) => MODULE_LABELS[module] ?? module)
                .join(", ") || "HR";
            const linkedUser = row.user ? `${row.user.email} (${row.user.role})` : "No linked user";
            return `${linkedUser} | ${modules}`;
          },
        },
        // The address is the answer to "can this person sign in", so it is the
        // link ink and a real `mailto:`; "No linked user" in the faintest ink
        // is the other answer, and it is a fact worth being able to scan for.
        cell: ({ row }) => (
          <DirectoryLine>
            <DirectoryCell
              kind="email"
              value={row.original.user?.email}
              missing="No linked user"
              className="min-w-0"
            />
            <DirectoryNote>
              {row.original.moduleAssignments
                ?.map((assignment) => assignment.module)
                .filter((module) => allowedAccessModules.has(module))
                .map((module) => MODULE_LABELS[module] ?? module)
                .join(", ") || "HR"}
            </DirectoryNote>
          </DirectoryLine>
        ),
        size: 230,
        minSize: 200,
        maxSize: 280},
      {
        id: "nextOfKin",
        header: "Next of Kin",
        meta: {
          exportValue: (row: EmployeeSummary) =>
            `${row.nextOfKinName || "-"} (${row.nextOfKinPhone || "-"})`,
        },
        cell: ({ row }) => (
          <DirectoryLine>
            <DirectoryCell
              value={row.original.nextOfKinName}
              missing="nobody named"
              className="min-w-0"
            />
            {row.original.nextOfKinPhone ? (
              <DirectoryNote>{row.original.nextOfKinPhone}</DirectoryNote>
            ) : null}
          </DirectoryLine>
        ),
        size: 200,
        minSize: 180,
        maxSize: 220},
      {
        id: "villageOfOrigin",
        header: "Village",
        meta: {
          exportValue: (row: EmployeeSummary) => row.villageOfOrigin || "not on file",
        },
        cell: ({ row }) => (
          <DirectoryCell value={row.original.villageOfOrigin} missing="not on file" />
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "salaryOwed",
        header: "Salary Owed",
        meta: {
          exportValue: (row: EmployeeSummary) => row.salaryOwed.toFixed(2),
        },
        // The header already says what the figure is, so the second line that
        // repeated it in grey was costing every row eight pixels to say
        // nothing. Money kind, hard right, so the digits line up down the
        // column the way a payroll is read.
        cell: ({ row }) => (
          <div className="text-right">
            <DirectoryCell
              kind="money"
              value={`$${row.original.salaryOwed.toFixed(2)}`}
              missing="—"
            />
          </div>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "status",
        header: "Status",
        meta: {
          exportValue: (row: EmployeeSummary) => (row.isActive ? "Active" : "Inactive"),
        },
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "default" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => handleEdit(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="destructive"
              onClick={() => handleDelete(row.original.id)}
              disabled={deleteEmployeeMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        size: 108,
        minSize: 108,
        maxSize: 108},
    ],
    [allowedAccessModules, deleteEmployeeMutation.isPending, getPositionLabel, handleDelete, handleEdit],
  )

  return (
    <PeopleShell
      activeTab="employees"
      actions={
        <Button size="sm" onClick={openNewEmployee}>
          <Plus className="h-4 w-4" />
          New Employee
        </Button>
      }
    >
      {loadErrorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load employees</AlertTitle>
          <AlertDescription>{loadErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <EmployeeWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        departments={departments}
        grades={grades}
        templates={templates}
        employees={employees}
        initialTemplateId={wizardInitialTemplateId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["employees"] })
        }}
      />

      <Sheet open={formOpen} onOpenChange={handleFormOpenChange}>
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Edit Employee</SheetTitle>
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
                    {employeePositionOptions.map((position) => (
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
                    href="/preferences/organization/departments"
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
                <Image
                  src={formData.passportPhotoUrl}
                  alt="Passport preview"
                  width={80}
                  height={80}
                  quality={60}
                  sizes="80px"
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
                    <Image
                      src={formData.nationalIdDocumentUrl}
                      alt="National ID preview"
                      width={80}
                      height={80}
                      quality={60}
                      sizes="80px"
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
          // The row height comes off the tokens rather than being zeroed here:
          // 36px is the canvas register, and a directory that sets its own is
          // a directory that drifts from the CRM's the next time either moves.
          tableClassName="text-sm [--table-gutter-x:0.6rem] [&_td]:py-1.5 [&_th]:py-1.5"
          noResultsText="No employees found."
          toolbar={
            <>
              {/* A chip rather than a select box, because the canvas puts the
                  question and its current answer in the control itself —
                  "Status Active" is read at a glance where "Active Only" in a
                  box has to be worked out from the words around it. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <ViewToolbarChip label="Status" value={STATUS_FILTER_LABEL[statusFilter]} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(
                    Object.keys(STATUS_FILTER_LABEL) as Array<keyof typeof STATUS_FILTER_LABEL>
                  ).map((value) => (
                    <DropdownMenuItem
                      key={value}
                      onClick={() => {
                        setStatusFilter(value)
                        setQueryState((prev) => ({ ...prev, page: 1 }))
                      }}
                    >
                      {STATUS_FILTER_LABEL[value]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* How many people the search and the status chip have left, in
                  the CRM's own grammar and ink. This directory had no count at
                  all: a search that matched nobody and a workspace with nobody
                  on the books both drew an empty table under an unchanged bar,
                  and the only figure on the page was at the foot of the pager
                  below the fold. */}
              <span className="font-mono text-xs tabular-nums text-[var(--text-subtle)]">
                {employees.length} of {employeeTotal}
              </span>
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
    </PeopleShell>
  )
}
