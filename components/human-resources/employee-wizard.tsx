"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useSession } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import type {
  CompensationTemplateRecord,
  DepartmentRecord,
  EmployeeSummary,
  JobGradeRecord,
} from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { cn } from "@/lib/utils"

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

const payoutPaths = [
  {
    value: "SALARY",
    label: "Salary only",
    description: "The employee will mainly be handled through salary payroll.",
  },
  {
    value: "HYBRID",
    label: "Salary and irregular payouts",
    description: "Use salary payroll and still allow irregular gold, commission, or other payouts.",
  },
  {
    value: "IRREGULAR",
    label: "Irregular payouts only",
    description: "Use the shared payouts workflow for non-salary earnings.",
  },
] as const

const moduleOptions = [
  {
    value: "HR",
    label: "HR",
    description: "Core workforce record, salary payroll, and general employee administration.",
    featureMatcher: () => true,
  },
  {
    value: "GOLD",
    label: "Gold",
    description: "Gold settlement and gold-linked irregular payouts.",
    featureMatcher: (feature: string) => feature === "gold.payouts" || feature.startsWith("gold."),
  },
  {
    value: "SCRAP_METAL",
    label: "Scrap Metal",
    description: "Scrap-metal purchasing and related operational assignment.",
    featureMatcher: (feature: string) => feature.startsWith("scrap-metal."),
  },
  {
    value: "CAR_SALES",
    label: "Car Sales",
    description: "Auto inventory, leads, and deal workflows.",
    featureMatcher: (feature: string) => feature.startsWith("autos."),
  },
  {
    value: "THRIFT",
    label: "Thrift",
    description: "Retail intake, catalog, checkout, and POS operations.",
    featureMatcher: (feature: string) => feature.startsWith("thrift."),
  },
] as const

const userRoleOptions = [
  { value: "MANAGER", label: "Manager" },
  { value: "CLERK", label: "Clerk" },
  { value: "SALES_EXEC", label: "Sales Executive" },
  { value: "AUTO_MANAGER", label: "Auto Manager" },
  { value: "FINANCE_OFFICER", label: "Finance Officer" },
  { value: "SHOP_MANAGER", label: "Shop Manager" },
  { value: "CASHIER", label: "Cashier" },
  { value: "STOCK_CLERK", label: "Stock Clerk" },
] as const

type EmployeePosition = (typeof employeePositions)[number]["value"]
type EmploymentType = (typeof employmentTypes)[number]["value"]
type EmployeeModule = (typeof moduleOptions)[number]["value"]
type PayoutPath = (typeof payoutPaths)[number]["value"]
type UserRole = (typeof userRoleOptions)[number]["value"]

type StepId =
  | "employment"
  | "modules"
  | "role"
  | "personal"
  | "emergency"
  | "documents"
  | "compensation"
  | "access"
  | "review"

type EmployeeWizardForm = {
  name: string
  phone: string
  nextOfKinName: string
  nextOfKinPhone: string
  passportPhotoUrl: string
  nationalIdNumber: string
  nationalIdDocumentUrl: string
  villageOfOrigin: string
  jobTitle: string
  position: EmployeePosition
  departmentId: string
  gradeId: string
  supervisorId: string
  employmentType: EmploymentType
  payoutPath: PayoutPath
  moduleAssignments: EmployeeModule[]
  primaryModule: EmployeeModule
  compensationTemplateId: string
  hireDate: string
  terminationDate: string
  defaultCurrency: string
  isActive: boolean
  createUserAccount: boolean
  userEmail: string
  userPassword: string
  userRole: UserRole
}

const stepMeta: Array<{ id: StepId; label: string; description: string }> = [
  { id: "employment", label: "Employment", description: "Employment type and payout path" },
  { id: "modules", label: "Modules", description: "Operational coverage for this employee" },
  { id: "role", label: "Role", description: "Job details and reporting line" },
  { id: "personal", label: "Personal", description: "Identity and contact" },
  { id: "emergency", label: "Emergency", description: "Next of kin details" },
  { id: "documents", label: "Documents", description: "Photo and identity documents" },
  { id: "compensation", label: "Compensation", description: "Salary template setup" },
  { id: "access", label: "Access", description: "Optional linked user account" },
  { id: "review", label: "Review", description: "Confirm the employee specification" },
]

const emptyForm: EmployeeWizardForm = {
  name: "",
  phone: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  passportPhotoUrl: "",
  nationalIdNumber: "",
  nationalIdDocumentUrl: "",
  villageOfOrigin: "",
  jobTitle: "",
  position: "MINERS",
  departmentId: "",
  gradeId: "",
  supervisorId: "",
  employmentType: "FULL_TIME",
  payoutPath: "SALARY",
  moduleAssignments: ["HR"],
  primaryModule: "HR",
  compensationTemplateId: "",
  hireDate: "",
  terminationDate: "",
  defaultCurrency: "USD",
  isActive: true,
  createUserAccount: false,
  userEmail: "",
  userPassword: "",
  userRole: "CLERK",
}

function inferPayoutPath(employmentType: EmploymentType): PayoutPath {
  if (employmentType === "CASUAL") return "IRREGULAR"
  if (employmentType === "CONTRACT") return "HYBRID"
  return "SALARY"
}

function getVisibleSteps(form: EmployeeWizardForm, canProvisionUser: boolean) {
  const steps: StepId[] = ["employment", "modules", "role", "personal", "emergency", "documents"]
  if (form.payoutPath !== "IRREGULAR") {
    steps.push("compensation")
  }
  if (canProvisionUser) {
    steps.push("access")
  }
  steps.push("review")
  return steps
}

function getModuleLabel(module: EmployeeModule) {
  return moduleOptions.find((option) => option.value === module)?.label ?? module
}

function getPayoutPathLabel(path: PayoutPath) {
  return payoutPaths.find((option) => option.value === path)?.label ?? path
}

function getEmploymentTypeLabel(type: EmploymentType) {
  return employmentTypes.find((option) => option.value === type)?.label ?? type
}

function getPositionLabel(position: EmployeePosition) {
  return employeePositions.find((option) => option.value === position)?.label ?? position
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <label className="mb-1.5 block text-sm font-semibold">
      {children}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </label>
  )
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-muted-foreground">{children}</p>
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--edge-subtle)] py-2 last:border-0">
      <span className="w-44 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "-"}</span>
    </div>
  )
}

function validateStep(stepId: StepId, form: EmployeeWizardForm, canProvisionUser: boolean) {
  switch (stepId) {
    case "employment":
      if (!form.employmentType) return "Employment type is required."
      if (!form.payoutPath) return "Payout path is required."
      return null
    case "modules":
      if (form.moduleAssignments.length === 0) return "Select at least one module."
      if (!form.primaryModule || !form.moduleAssignments.includes(form.primaryModule)) {
        return "Choose a primary module."
      }
      return null
    case "role":
      if (!form.position) return "Position is required."
      return null
    case "personal":
      if (!form.name.trim()) return "Employee name is required."
      if (!form.phone.trim()) return "Phone number is required."
      if (!form.villageOfOrigin.trim()) return "Village of origin is required."
      return null
    case "emergency":
      if (!form.nextOfKinName.trim()) return "Next of kin name is required."
      if (!form.nextOfKinPhone.trim()) return "Next of kin phone is required."
      return null
    case "documents":
      if (!form.passportPhotoUrl) return "Passport photo is required."
      return null
    case "compensation":
      return null
    case "access":
      if (!canProvisionUser || !form.createUserAccount) return null
      if (!form.userEmail.trim()) return "Linked user email is required."
      if (!form.userPassword.trim()) return "Linked user password is required."
      if (!form.userRole) return "Linked user role is required."
      return null
    case "review":
      return null
  }
}

async function uploadEmployeeFile(
  file: File,
  context: "employee-passport" | "employee-national-id",
) {
  const formData = new FormData()
  formData.append("context", context)
  formData.append("file", file)

  const response = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    body: formData,
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

function StepIndicator({
  visibleStepIds,
  currentStepIndex,
}: {
  visibleStepIds: StepId[]
  currentStepIndex: number
}) {
  const steps = stepMeta.filter((step) => visibleStepIds.includes(step.id))

  return (
    <nav aria-label="Employee onboarding steps" className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex
        const isActive = index === currentStepIndex

        return (
          <div key={step.id} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-[var(--action-primary-bg)] text-[var(--action-primary-text)]"
                  : isCompleted
                    ? "bg-[var(--surface-soft)] text-[var(--action-primary-bg)]"
                    : "bg-[var(--surface-subtle)] text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                  isActive
                    ? "bg-white/20"
                    : isCompleted
                      ? "bg-[var(--action-primary-bg)] text-white"
                      : "bg-[var(--edge-subtle)] text-muted-foreground",
                )}
              >
                {isCompleted ? "OK" : index + 1}
              </span>
              {step.label}
            </div>
            {index < steps.length - 1 ? <span className="text-xs text-muted-foreground/40">{">"}</span> : null}
          </div>
        )
      })}
    </nav>
  )
}

function EmploymentStep({
  form,
  onChange,
}: {
  form: EmployeeWizardForm
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Employment profile</h2>
        <p className="text-sm text-muted-foreground">
          Start with the work arrangement. The payout setup and later steps adapt to what you choose here.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <FieldLabel required>Employment type</FieldLabel>
          <Select
            value={form.employmentType}
            onValueChange={(value) =>
              onChange({
                employmentType: value as EmploymentType,
                payoutPath: inferPayoutPath(value as EmploymentType),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select employment type" />
            </SelectTrigger>
            <SelectContent>
              {employmentTypes.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint>
            Casual workers default to irregular payouts. Full-time and part-time employees default to salaries.
          </FieldHint>
        </div>

        <div>
          <FieldLabel required>Payout path</FieldLabel>
          <Select value={form.payoutPath} onValueChange={(value) => onChange({ payoutPath: value as PayoutPath })}>
            <SelectTrigger>
              <SelectValue placeholder="Select payout path" />
            </SelectTrigger>
            <SelectContent>
              {payoutPaths.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint>{payoutPaths.find((option) => option.value === form.payoutPath)?.description}</FieldHint>
        </div>

        <div>
          <FieldLabel>Default currency</FieldLabel>
          <Input
            value={form.defaultCurrency}
            onChange={(event) => onChange({ defaultCurrency: event.target.value })}
            placeholder="USD"
          />
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <Select
            value={form.isActive ? "ACTIVE" : "INACTIVE"}
            onValueChange={(value) => onChange({ isActive: value === "ACTIVE" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel>Hire date</FieldLabel>
          <Input type="date" value={form.hireDate} onChange={(event) => onChange({ hireDate: event.target.value })} />
        </div>

        {(form.employmentType === "CONTRACT" || form.terminationDate) ? (
          <div>
            <FieldLabel>Termination date</FieldLabel>
            <Input
              type="date"
              value={form.terminationDate}
              onChange={(event) => onChange({ terminationDate: event.target.value })}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ModulesStep({
  form,
  availableModules,
  onToggleModule,
  onChange,
}: {
  form: EmployeeWizardForm
  availableModules: typeof moduleOptions
  onToggleModule: (module: EmployeeModule, checked: boolean) => void
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Module assignments</h2>
        <p className="text-sm text-muted-foreground">
          Choose the parts of the company this employee participates in. This keeps the employee core record flexible for future modules.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {availableModules.map((module) => {
          const checked = form.moduleAssignments.includes(module.value)
          return (
            <label
              key={module.value}
              className={cn(
                "flex gap-3 rounded-xl border p-4 transition-colors",
                checked ? "border-[var(--action-primary-bg)] bg-[var(--surface-soft)]" : "border-[var(--edge-subtle)]",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => onToggleModule(module.value, value === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <div className="font-medium">{module.label}</div>
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </div>
            </label>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <FieldLabel required>Primary module</FieldLabel>
          <Select
            value={form.primaryModule}
            onValueChange={(value) => onChange({ primaryModule: value as EmployeeModule })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select primary module" />
            </SelectTrigger>
            <SelectContent>
              {form.moduleAssignments.map((module) => (
                <SelectItem key={module} value={module}>
                  {getModuleLabel(module)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint>The primary module is marked as the employee main operating home.</FieldHint>
        </div>

        <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
          <p className="text-sm font-semibold">Current employee spec</p>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p>Employment type: {getEmploymentTypeLabel(form.employmentType)}</p>
            <p>Payout path: {getPayoutPathLabel(form.payoutPath)}</p>
            <p>Selected modules: {form.moduleAssignments.map(getModuleLabel).join(", ") || "None"}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoleStep({
  form,
  departments,
  grades,
  employees,
  onChange,
}: {
  form: EmployeeWizardForm
  departments: DepartmentRecord[]
  grades: JobGradeRecord[]
  employees: EmployeeSummary[]
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Role and reporting</h2>
        <p className="text-sm text-muted-foreground">
          Capture how this employee should appear in HR and where they fit operationally.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <FieldLabel>Job title</FieldLabel>
          <Input
            value={form.jobTitle}
            onChange={(event) => onChange({ jobTitle: event.target.value })}
            placeholder="Foreman, Gold Buyer, Sales Executive"
          />
        </div>

        <div>
          <FieldLabel required>Position</FieldLabel>
          <Select value={form.position} onValueChange={(value) => onChange({ position: value as EmployeePosition })}>
            <SelectTrigger>
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              {employeePositions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <FieldLabel>Department</FieldLabel>
            <Link href="/management/master-data/hr/departments" className="text-xs text-primary hover:underline">
              Manage
            </Link>
          </div>
          <Select
            value={form.departmentId || "none"}
            onValueChange={(value) => onChange({ departmentId: value === "none" ? "" : value })}
          >
            <SelectTrigger>
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
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <FieldLabel>Grade</FieldLabel>
            <Link href="/management/master-data/hr/job-grades" className="text-xs text-primary hover:underline">
              Manage
            </Link>
          </div>
          <Select value={form.gradeId || "none"} onValueChange={(value) => onChange({ gradeId: value === "none" ? "" : value })}>
            <SelectTrigger>
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
          <FieldLabel>Supervisor</FieldLabel>
          <Select
            value={form.supervisorId || "none"}
            onValueChange={(value) => onChange({ supervisorId: value === "none" ? "" : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select supervisor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No supervisor</SelectItem>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.name} ({employee.employeeId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function PersonalStep({
  form,
  onChange,
}: {
  form: EmployeeWizardForm
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Personal details</h2>
        <p className="text-sm text-muted-foreground">Capture the employee identity and key contact details.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <FieldLabel required>Full name</FieldLabel>
          <Input value={form.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Full name" />
        </div>

        <div>
          <FieldLabel required>Phone</FieldLabel>
          <Input
            type="tel"
            value={form.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="07xx xxx xxx"
          />
        </div>

        <div>
          <FieldLabel>National ID number</FieldLabel>
          <Input
            value={form.nationalIdNumber}
            onChange={(event) => onChange({ nationalIdNumber: event.target.value })}
            placeholder="Optional"
          />
        </div>

        <div>
          <FieldLabel required>Village of origin</FieldLabel>
          <Input
            value={form.villageOfOrigin}
            onChange={(event) => onChange({ villageOfOrigin: event.target.value })}
            placeholder="Village"
          />
        </div>
      </div>
    </div>
  )
}

function EmergencyStep({
  form,
  onChange,
}: {
  form: EmployeeWizardForm
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Emergency contact</h2>
        <p className="text-sm text-muted-foreground">Record the next of kin that HR should reach first.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <FieldLabel required>Next of kin name</FieldLabel>
          <Input
            value={form.nextOfKinName}
            onChange={(event) => onChange({ nextOfKinName: event.target.value })}
            placeholder="Full name"
          />
        </div>

        <div>
          <FieldLabel required>Next of kin phone</FieldLabel>
          <Input
            type="tel"
            value={form.nextOfKinPhone}
            onChange={(event) => onChange({ nextOfKinPhone: event.target.value })}
            placeholder="07xx xxx xxx"
          />
        </div>
      </div>
    </div>
  )
}

function DocumentsStep({
  form,
  onChange,
}: {
  form: EmployeeWizardForm
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  const { toast } = useToast()
  const [passportUploading, setPassportUploading] = useState(false)
  const [nationalIdUploading, setNationalIdUploading] = useState(false)

  const handleUpload = async (
    file: File,
    context: "employee-passport" | "employee-national-id",
    field: "passportPhotoUrl" | "nationalIdDocumentUrl",
    setUploading: (value: boolean) => void,
    successTitle: string,
  ) => {
    setUploading(true)
    try {
      const url = await uploadEmployeeFile(file, context)
      onChange({ [field]: url } as Partial<EmployeeWizardForm>)
      toast({ title: successTitle, variant: "success" })
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Upload failed",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  const isPdf = (url: string) => /\.pdf($|\?)/i.test(url)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Identity documents</h2>
        <p className="text-sm text-muted-foreground">Upload the required employee photo and any supporting ID copy.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel required>Passport photo</FieldLabel>
          <Input
            type="file"
            accept="image/*"
            disabled={passportUploading}
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              await handleUpload(file, "employee-passport", "passportPhotoUrl", setPassportUploading, "Passport photo uploaded")
              event.target.value = ""
            }}
          />
          <FieldHint>JPG, PNG, or WebP up to 5 MB.</FieldHint>
          {passportUploading ? <p className="text-xs text-muted-foreground">Uploading photo...</p> : null}
          {form.passportPhotoUrl ? (
            <Image
              src={form.passportPhotoUrl}
              alt="Passport preview"
              width={96}
              height={96}
              quality={60}
              sizes="96px"
              className="h-24 w-24 rounded-lg border object-cover"
            />
          ) : null}
        </div>

        <div className="space-y-2">
          <FieldLabel>National ID copy</FieldLabel>
          <Input
            type="file"
            accept="image/*,.pdf,application/pdf"
            disabled={nationalIdUploading}
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              await handleUpload(
                file,
                "employee-national-id",
                "nationalIdDocumentUrl",
                setNationalIdUploading,
                "National ID copy uploaded",
              )
              event.target.value = ""
            }}
          />
          <FieldHint>Optional JPG, PNG, WebP, or PDF up to 5 MB.</FieldHint>
          {nationalIdUploading ? <p className="text-xs text-muted-foreground">Uploading ID copy...</p> : null}
          {form.nationalIdDocumentUrl ? (
            <div className="space-y-2">
              {isPdf(form.nationalIdDocumentUrl) ? (
                <a
                  href={form.nationalIdDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline"
                >
                  View uploaded ID document
                </a>
              ) : (
                <Image
                  src={form.nationalIdDocumentUrl}
                  alt="National ID preview"
                  width={96}
                  height={96}
                  quality={60}
                  sizes="96px"
                  className="h-24 w-24 rounded-lg border object-cover"
                />
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => onChange({ nationalIdDocumentUrl: "" })}>
                Remove ID copy
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CompensationStep({
  form,
  templates,
  onChange,
}: {
  form: EmployeeWizardForm
  templates: CompensationTemplateRecord[]
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Compensation setup</h2>
        <p className="text-sm text-muted-foreground">
          Apply a salary template when this employee should participate in salary payroll.
        </p>
      </div>

      <div className="max-w-xl space-y-4">
        <div>
          <FieldLabel>Compensation template</FieldLabel>
          <Select
            value={form.compensationTemplateId || "none"}
            onValueChange={(value) => onChange({ compensationTemplateId: value === "none" ? "" : value })}
          >
            <SelectTrigger>
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
          <FieldHint>
            This is optional, but using a template will create the employee compensation profile during onboarding.
          </FieldHint>
        </div>

        <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Payout routing</p>
          <p className="mt-1">
            {form.payoutPath === "HYBRID"
              ? "This employee can receive both salary payroll and shared irregular payouts."
              : "This employee stays on the salary side of HR with optional future irregular payouts when needed."}
          </p>
        </div>
      </div>
    </div>
  )
}

function AccessStep({
  form,
  canProvisionUser,
  onChange,
}: {
  form: EmployeeWizardForm
  canProvisionUser: boolean
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Linked account</h2>
        <p className="text-sm text-muted-foreground">
          Decide whether onboarding should also provision a login for this employee.
        </p>
      </div>

      {!canProvisionUser ? (
        <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4 text-sm text-muted-foreground">
          Only superadmins can provision linked user accounts during employee onboarding. You can still create the employee record now.
        </div>
      ) : (
        <>
          <label className="flex items-start gap-3 rounded-xl border border-[var(--edge-subtle)] p-4">
            <Checkbox
              checked={form.createUserAccount}
              onCheckedChange={(value) => onChange({ createUserAccount: value === true })}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <div className="font-medium">Create a linked user account</div>
              <p className="text-sm text-muted-foreground">
                Use this when the employee should sign in and access company modules directly.
              </p>
            </div>
          </label>

          {form.createUserAccount ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <FieldLabel required>User email</FieldLabel>
                <Input
                  type="email"
                  value={form.userEmail}
                  onChange={(event) => onChange({ userEmail: event.target.value })}
                  placeholder="employee@company.com"
                />
              </div>

              <div>
                <FieldLabel required>User role</FieldLabel>
                <Select value={form.userRole} onValueChange={(value) => onChange({ userRole: value as UserRole })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {userRoleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-2">
                <FieldLabel required>Temporary password</FieldLabel>
                <Input
                  type="password"
                  value={form.userPassword}
                  onChange={(event) => onChange({ userPassword: event.target.value })}
                  placeholder="Minimum 8 characters"
                />
                <FieldHint>This password is stored as a hashed user credential when the employee is created.</FieldHint>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--edge-subtle)] p-4 text-sm text-muted-foreground">
              This employee will be created without a linked user. You can provision access later if the company needs it.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ReviewStep({
  form,
  departments,
  grades,
  templates,
  employees,
  canProvisionUser,
}: {
  form: EmployeeWizardForm
  departments: DepartmentRecord[]
  grades: JobGradeRecord[]
  templates: CompensationTemplateRecord[]
  employees: EmployeeSummary[]
  canProvisionUser: boolean
}) {
  const department = departments.find((item) => item.id === form.departmentId)
  const grade = grades.find((item) => item.id === form.gradeId)
  const template = templates.find((item) => item.id === form.compensationTemplateId)
  const supervisor = employees.find((item) => item.id === form.supervisorId)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Review employee specification</h2>
        <p className="text-sm text-muted-foreground">
          This summary shows the final employee record, module assignment, and access setup that will be created.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
        <ReviewRow label="Employee" value={form.name} />
        <ReviewRow label="Job title" value={form.jobTitle} />
        <ReviewRow label="Position" value={getPositionLabel(form.position)} />
        <ReviewRow label="Employment type" value={getEmploymentTypeLabel(form.employmentType)} />
        <ReviewRow label="Payout path" value={getPayoutPathLabel(form.payoutPath)} />
        <ReviewRow label="Modules" value={form.moduleAssignments.map(getModuleLabel).join(", ")} />
        <ReviewRow label="Primary module" value={getModuleLabel(form.primaryModule)} />
        <ReviewRow label="Department" value={department ? `${department.code} - ${department.name}` : "None"} />
        <ReviewRow label="Grade" value={grade ? `${grade.code} - ${grade.name}` : "None"} />
        <ReviewRow label="Supervisor" value={supervisor ? `${supervisor.name} (${supervisor.employeeId})` : "None"} />
        <ReviewRow label="Phone" value={form.phone} />
        <ReviewRow label="Village of origin" value={form.villageOfOrigin} />
        <ReviewRow label="National ID" value={form.nationalIdNumber} />
        <ReviewRow label="Next of kin" value={`${form.nextOfKinName} (${form.nextOfKinPhone})`} />
        <ReviewRow label="Hire date" value={form.hireDate} />
        <ReviewRow label="Termination date" value={form.terminationDate} />
        <ReviewRow label="Default currency" value={form.defaultCurrency} />
        <ReviewRow label="Passport photo" value={form.passportPhotoUrl ? "Uploaded" : "Missing"} />
        <ReviewRow
          label="National ID copy"
          value={form.nationalIdDocumentUrl ? "Uploaded" : "Not provided"}
        />
        <ReviewRow
          label="Compensation template"
          value={
            form.compensationTemplateId
              ? template?.name ?? form.compensationTemplateId
              : form.payoutPath === "IRREGULAR"
                ? "Not needed for irregular-only setup"
                : "None"
          }
        />
        <ReviewRow
          label="Linked account"
          value={
            canProvisionUser
              ? form.createUserAccount
                ? `${form.userEmail} (${form.userRole})`
                : "No linked user"
              : "Not provisioned in this session"
          }
        />
      </div>
    </div>
  )
}

export type EmployeeWizardProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  departments: DepartmentRecord[]
  grades: JobGradeRecord[]
  templates: CompensationTemplateRecord[]
  employees: EmployeeSummary[]
  initialTemplateId?: string
  onSuccess: () => void
}

export function EmployeeWizard({
  open,
  onOpenChange,
  departments,
  grades,
  templates,
  employees,
  initialTemplateId,
  onSuccess,
}: EmployeeWizardProps) {
  const { toast } = useToast()
  const { data: session } = useSession()
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures ?? [],
    [session],
  )
  const canProvisionUser = session?.user?.role === "SUPERADMIN"
  const availableModules = useMemo(
    () =>
      moduleOptions.filter(
        (module) =>
          module.value === "HR" ||
          enabledFeatures.some((feature) => module.featureMatcher(feature)),
      ),
    [enabledFeatures],
  )

  const [form, setForm] = useState<EmployeeWizardForm>({
    ...emptyForm,
    compensationTemplateId: initialTemplateId ?? "",
  })
  const [stepIndex, setStepIndex] = useState(0)
  const [stepError, setStepError] = useState<string | null>(null)

  const visibleStepIds = getVisibleSteps(form, canProvisionUser)
  const currentStepId = visibleStepIds[stepIndex]
  const totalSteps = visibleStepIds.length
  const isLastStep = stepIndex === totalSteps - 1

  const resetWizard = () => {
    const nextPrimaryModule = availableModules.some((module) => module.value === "HR")
      ? "HR"
      : availableModules[0]?.value ?? "HR"
    setForm({
      ...emptyForm,
      compensationTemplateId: initialTemplateId ?? "",
      moduleAssignments: [nextPrimaryModule],
      primaryModule: nextPrimaryModule,
    })
    setStepIndex(0)
    setStepError(null)
  }

  const handleClose = () => {
    onOpenChange(false)
    setTimeout(resetWizard, 250)
  }

  const handleChange = (updates: Partial<EmployeeWizardForm>) => {
    setForm((current) => {
      const next = { ...current, ...updates }

      if (updates.employmentType && !updates.payoutPath) {
        next.payoutPath = inferPayoutPath(updates.employmentType)
      }

      next.moduleAssignments = Array.from(
        new Set(
          next.moduleAssignments.filter((module) =>
            availableModules.some((option) => option.value === module),
          ),
        ),
      )

      if (!next.moduleAssignments.includes(next.primaryModule)) {
        next.primaryModule = next.moduleAssignments[0] ?? "HR"
      }

      if (!next.createUserAccount) {
        next.userEmail = ""
        next.userPassword = ""
      }

      return next
    })
    setStepError(null)
  }

  const handleToggleModule = (module: EmployeeModule, checked: boolean) => {
    setForm((current) => {
      const assignments = checked
        ? Array.from(new Set([...current.moduleAssignments, module]))
        : current.moduleAssignments.filter((item) => item !== module)
      const nextAssignments = assignments.length > 0 ? assignments : ["HR"]
      const nextPrimary = nextAssignments.includes(current.primaryModule)
        ? current.primaryModule
        : nextAssignments[0]

      return {
        ...current,
        moduleAssignments: nextAssignments,
        primaryModule: nextPrimary,
      }
    })
    setStepError(null)
  }

  const createMutation = useMutation({
    mutationFn: async (payload: EmployeeWizardForm) => {
      const moduleAssignments = payload.moduleAssignments.map((module) => ({
        module,
        isPrimary: module === payload.primaryModule,
        isActive: true,
        requiresUserAccess: canProvisionUser ? payload.createUserAccount : false,
        accessRole: canProvisionUser && payload.createUserAccount ? payload.userRole : undefined,
      }))

      return fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          phone: payload.phone,
          nextOfKinName: payload.nextOfKinName,
          nextOfKinPhone: payload.nextOfKinPhone,
          passportPhotoUrl: payload.passportPhotoUrl,
          nationalIdNumber: payload.nationalIdNumber.trim() || undefined,
          nationalIdDocumentUrl: payload.nationalIdDocumentUrl.trim() || undefined,
          villageOfOrigin: payload.villageOfOrigin,
          jobTitle: payload.jobTitle.trim() || undefined,
          position: payload.position,
          departmentId: payload.departmentId || undefined,
          gradeId: payload.gradeId || undefined,
          supervisorId: payload.supervisorId || undefined,
          employmentType: payload.employmentType,
          compensationTemplateId:
            payload.payoutPath === "IRREGULAR" ? undefined : payload.compensationTemplateId || undefined,
          hireDate: payload.hireDate || undefined,
          terminationDate: payload.terminationDate || undefined,
          defaultCurrency: payload.defaultCurrency || "USD",
          isActive: payload.isActive,
          moduleAssignments,
          createUserAccount: canProvisionUser ? payload.createUserAccount : false,
          userEmail:
            canProvisionUser && payload.createUserAccount ? payload.userEmail.trim().toLowerCase() : undefined,
          userPassword: canProvisionUser && payload.createUserAccount ? payload.userPassword : undefined,
          userRole: canProvisionUser && payload.createUserAccount ? payload.userRole : undefined,
        }),
      })
    },
    onSuccess: () => {
      toast({
        title: "Employee created",
        description: "The employee has been added to human resources.",
        variant: "success",
      })
      onSuccess()
      handleClose()
    },
    onError: (error) => {
      toast({
        title: "Unable to create employee",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const handleNext = () => {
    const error = validateStep(currentStepId, form, canProvisionUser)
    if (error) {
      setStepError(error)
      return
    }

    setStepError(null)
    if (isLastStep) {
      createMutation.mutate(form)
      return
    }

    setStepIndex((current) => Math.min(current + 1, totalSteps - 1))
  }

  const renderStep = () => {
    switch (currentStepId) {
      case "employment":
        return <EmploymentStep form={form} onChange={handleChange} />
      case "modules":
        return (
          <ModulesStep
            form={form}
            availableModules={availableModules}
            onToggleModule={handleToggleModule}
            onChange={handleChange}
          />
        )
      case "role":
        return (
          <RoleStep
            form={form}
            departments={departments}
            grades={grades}
            employees={employees}
            onChange={handleChange}
          />
        )
      case "personal":
        return <PersonalStep form={form} onChange={handleChange} />
      case "emergency":
        return <EmergencyStep form={form} onChange={handleChange} />
      case "documents":
        return <DocumentsStep form={form} onChange={handleChange} />
      case "compensation":
        return <CompensationStep form={form} templates={templates} onChange={handleChange} />
      case "access":
        return <AccessStep form={form} canProvisionUser={canProvisionUser} onChange={handleChange} />
      case "review":
        return (
          <ReviewStep
            form={form}
            departments={departments}
            grades={grades}
            templates={templates}
            employees={employees}
            canProvisionUser={canProvisionUser}
          />
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent
        size="full"
        tabletBehavior="fullscreen"
        inset={false}
        className="flex h-[100dvh] max-h-[100dvh] flex-col !rounded-none"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--edge-subtle)] px-6 py-4">
          <DialogHeader className="min-w-0 flex-1">
            <DialogTitle className="text-base">
              Employee setup wizard
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Step {stepIndex + 1} of {totalSteps}
              </span>
            </DialogTitle>
            <DialogDescription>
              Build the right employee record, module assignment, and optional linked user for this company.
            </DialogDescription>
          </DialogHeader>
          <DialogClose className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-muted-foreground transition-colors hover:bg-[var(--surface-soft)] hover:text-foreground">
            X
          </DialogClose>
        </div>

        <div className="shrink-0 px-6 pb-2 pt-4">
          <StepIndicator visibleStepIds={visibleStepIds} currentStepIndex={stepIndex} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">{renderStep()}</div>

        <div className="shrink-0 border-t border-[var(--edge-subtle)] px-6 py-4">
          {stepError ? <p className="mb-3 text-sm text-destructive">{stepError}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
              disabled={stepIndex === 0 || createMutation.isPending}
            >
              Back
            </Button>
            <Button type="button" onClick={handleNext} disabled={createMutation.isPending}>
              {isLastStep ? (createMutation.isPending ? "Creating..." : "Create employee") : "Continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
