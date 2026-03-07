"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import type { CompensationTemplateRecord, DepartmentRecord, EmployeeSummary, JobGradeRecord } from "@/lib/api"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

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

export type EmployeeWizardForm = {
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

const emptyForm: EmployeeWizardForm = {
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

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepId = "employment" | "role" | "personal" | "emergency" | "documents" | "compensation" | "review"

const ALL_STEPS: { id: StepId; label: string; description: string }[] = [
  { id: "employment", label: "Employment", description: "Type & start date" },
  { id: "role", label: "Role", description: "Position & assignment" },
  { id: "personal", label: "Personal", description: "Name & contact" },
  { id: "emergency", label: "Emergency", description: "Next of kin" },
  { id: "documents", label: "Documents", description: "Photo & ID" },
  { id: "compensation", label: "Compensation", description: "Pay structure" },
  { id: "review", label: "Review", description: "Confirm & submit" },
]

function getVisibleSteps(employmentType: EmploymentType): StepId[] {
  const base: StepId[] = ["employment", "role", "personal", "emergency", "documents"]
  if (employmentType !== "CASUAL") {
    base.push("compensation")
  }
  base.push("review")
  return base
}

// ─── Step validation ──────────────────────────────────────────────────────────

function validateStep(stepId: StepId, form: EmployeeWizardForm): string | null {
  switch (stepId) {
    case "employment":
      if (!form.employmentType) return "Employment type is required."
      return null
    case "role":
      if (!form.position) return "Position is required."
      return null
    case "personal":
      if (!form.name.trim()) return "Name is required."
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
    case "review":
      return null
  }
}

// ─── Upload helper ────────────────────────────────────────────────────────────

async function uploadEmployeeFile(
  file: File,
  context: "employee-passport" | "employee-national-id",
): Promise<string> {
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

// ─── Step components ──────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold mb-1.5">
      {children}
      {required ? <span className="text-destructive ml-0.5">*</span> : null}
    </label>
  )
}

function StepEmployment({
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
          Choose the employment type and start date. The wizard will tailor the remaining steps
          to this choice.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel required>Employment type</FieldLabel>
          <Select
            value={form.employmentType}
            onValueChange={(v) => onChange({ employmentType: v as EmploymentType })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {employmentTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {form.employmentType === "CASUAL"
              ? "Casual workers do not require a compensation template."
              : "A compensation template can be applied in the next steps."}
          </p>
        </div>

        <div>
          <FieldLabel>Default currency</FieldLabel>
          <Input
            value={form.defaultCurrency}
            onChange={(e) => onChange({ defaultCurrency: e.target.value })}
            placeholder="USD"
          />
        </div>

        <div>
          <FieldLabel>Hire date</FieldLabel>
          <Input
            type="date"
            value={form.hireDate}
            onChange={(e) => onChange({ hireDate: e.target.value })}
          />
        </div>

        {form.employmentType === "CONTRACT" ? (
          <div>
            <FieldLabel>Contract end date</FieldLabel>
            <Input
              type="date"
              value={form.terminationDate}
              onChange={(e) => onChange({ terminationDate: e.target.value })}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StepRole({
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
        <h2 className="text-lg font-semibold">Role & assignment</h2>
        <p className="text-sm text-muted-foreground">
          Assign the employee to a position, department, and reporting line.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel required>Position</FieldLabel>
          <Select
            value={form.position}
            onValueChange={(v) => onChange({ position: v as EmployeePosition })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              {employeePositions.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel>Department</FieldLabel>
            <Link
              href="/management/master-data/hr/departments"
              className="text-xs text-primary hover:underline"
            >
              Manage
            </Link>
          </div>
          <Select
            value={form.departmentId || "none"}
            onValueChange={(v) => onChange({ departmentId: v === "none" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No department</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.code} – {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel>Grade</FieldLabel>
            <Link
              href="/management/master-data/hr/job-grades"
              className="text-xs text-primary hover:underline"
            >
              Manage
            </Link>
          </div>
          <Select
            value={form.gradeId || "none"}
            onValueChange={(v) => onChange({ gradeId: v === "none" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grade</SelectItem>
              {grades.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.code} – {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel>Supervisor</FieldLabel>
          <Select
            value={form.supervisorId || "none"}
            onValueChange={(v) => onChange({ supervisorId: v === "none" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select supervisor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No supervisor</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} ({e.employeeId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function StepPersonal({
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
        <p className="text-sm text-muted-foreground">
          Basic identification information for the employee record.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel required>Full name</FieldLabel>
          <Input
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Full name"
          />
        </div>

        <div>
          <FieldLabel required>Phone</FieldLabel>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="07xx xxx xxx"
          />
        </div>

        <div>
          <FieldLabel>National ID number</FieldLabel>
          <Input
            value={form.nationalIdNumber}
            onChange={(e) => onChange({ nationalIdNumber: e.target.value })}
            placeholder="Optional"
          />
        </div>

        <div>
          <FieldLabel required>Village of origin</FieldLabel>
          <Input
            value={form.villageOfOrigin}
            onChange={(e) => onChange({ villageOfOrigin: e.target.value })}
            placeholder="Village"
          />
        </div>
      </div>
    </div>
  )
}

function StepEmergency({
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
        <p className="text-sm text-muted-foreground">
          Who should be contacted in case of an emergency?
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel required>Next of kin name</FieldLabel>
          <Input
            value={form.nextOfKinName}
            onChange={(e) => onChange({ nextOfKinName: e.target.value })}
            placeholder="Full name"
          />
        </div>

        <div>
          <FieldLabel required>Next of kin phone</FieldLabel>
          <Input
            type="tel"
            value={form.nextOfKinPhone}
            onChange={(e) => onChange({ nextOfKinPhone: e.target.value })}
            placeholder="07xx xxx xxx"
          />
        </div>
      </div>
    </div>
  )
}

function StepDocuments({
  form,
  onChange,
}: {
  form: EmployeeWizardForm
  onChange: (updates: Partial<EmployeeWizardForm>) => void
}) {
  const { toast } = useToast()
  const [passportUploading, setPassportUploading] = useState(false)
  const [nationalIdUploading, setNationalIdUploading] = useState(false)

  const handlePassportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPassportUploading(true)
    try {
      const url = await uploadEmployeeFile(file, "employee-passport")
      onChange({ passportPhotoUrl: url })
      toast({ title: "Photo uploaded", variant: "success" })
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Upload failed",
        variant: "destructive",
      })
    } finally {
      setPassportUploading(false)
      e.target.value = ""
    }
  }

  const handleNationalIdChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNationalIdUploading(true)
    try {
      const url = await uploadEmployeeFile(file, "employee-national-id")
      onChange({ nationalIdDocumentUrl: url })
      toast({ title: "ID copy uploaded", variant: "success" })
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Upload failed",
        variant: "destructive",
      })
    } finally {
      setNationalIdUploading(false)
      e.target.value = ""
    }
  }

  const isPdf = (url: string) => /\.pdf($|\?)/i.test(url)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Identity documents</h2>
        <p className="text-sm text-muted-foreground">
          Upload a passport-style photo and, optionally, a copy of the national ID.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel required>Passport photo</FieldLabel>
          <Input
            type="file"
            accept="image/*"
            onChange={handlePassportChange}
            disabled={passportUploading}
          />
          <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 5 MB.</p>
          {passportUploading ? (
            <p className="text-xs text-muted-foreground">Uploading…</p>
          ) : null}
          {form.passportPhotoUrl ? (
            <Image
              src={form.passportPhotoUrl}
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
          <FieldLabel>National ID copy (optional)</FieldLabel>
          <Input
            type="file"
            accept="image/*,.pdf,application/pdf"
            onChange={handleNationalIdChange}
            disabled={nationalIdUploading}
          />
          <p className="text-xs text-muted-foreground">JPG, PNG, WebP, or PDF up to 5 MB.</p>
          {nationalIdUploading ? (
            <p className="text-xs text-muted-foreground">Uploading…</p>
          ) : null}
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
                onClick={() => onChange({ nationalIdDocumentUrl: "" })}
              >
                Remove
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StepCompensation({
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
        <h2 className="text-lg font-semibold">Compensation</h2>
        <p className="text-sm text-muted-foreground">
          Optionally apply a compensation template to pre-configure allowances and deductions.
        </p>
      </div>

      <div className="max-w-md space-y-4">
        <div>
          <FieldLabel>Compensation template</FieldLabel>
          <Select
            value={form.compensationTemplateId || "none"}
            onValueChange={(v) => onChange({ compensationTemplateId: v === "none" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No template</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.currency} {t.baseAmount.toFixed(2)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Applying a template creates a compensation profile and employee-scoped approved rules.
          </p>
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[var(--edge-subtle)] last:border-0">
      <span className="w-40 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  )
}

function StepReview({
  form,
  departments,
  grades,
  templates,
  employees,
}: {
  form: EmployeeWizardForm
  departments: DepartmentRecord[]
  grades: JobGradeRecord[]
  templates: CompensationTemplateRecord[]
  employees: EmployeeSummary[]
}) {
  const department = departments.find((d) => d.id === form.departmentId)
  const grade = grades.find((g) => g.id === form.gradeId)
  const template = templates.find((t) => t.id === form.compensationTemplateId)
  const supervisor = employees.find((e) => e.id === form.supervisorId)
  const positionLabel =
    employeePositions.find((p) => p.value === form.position)?.label ?? form.position
  const employmentLabel =
    employmentTypes.find((t) => t.value === form.employmentType)?.label ?? form.employmentType

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Review & confirm</h2>
        <p className="text-sm text-muted-foreground">
          Check the details below before creating the employee record.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
        <ReviewRow label="Employment type" value={employmentLabel} />
        <ReviewRow label="Hire date" value={form.hireDate} />
        {form.terminationDate ? (
          <ReviewRow label="Contract end" value={form.terminationDate} />
        ) : null}
        <ReviewRow label="Default currency" value={form.defaultCurrency} />
        <ReviewRow label="Position" value={positionLabel} />
        <ReviewRow
          label="Department"
          value={department ? `${department.code} – ${department.name}` : "None"}
        />
        <ReviewRow
          label="Grade"
          value={grade ? `${grade.code} – ${grade.name}` : "None"}
        />
        <ReviewRow
          label="Supervisor"
          value={supervisor ? `${supervisor.name} (${supervisor.employeeId})` : "None"}
        />
        <ReviewRow label="Full name" value={form.name} />
        <ReviewRow label="Phone" value={form.phone} />
        <ReviewRow label="National ID" value={form.nationalIdNumber} />
        <ReviewRow label="Village of origin" value={form.villageOfOrigin} />
        <ReviewRow label="Next of kin" value={`${form.nextOfKinName} – ${form.nextOfKinPhone}`} />
        <ReviewRow
          label="Passport photo"
          value={form.passportPhotoUrl ? "Uploaded" : "Missing"}
        />
        <ReviewRow
          label="National ID copy"
          value={form.nationalIdDocumentUrl ? "Uploaded" : "Not provided"}
        />
        {form.compensationTemplateId ? (
          <ReviewRow
            label="Compensation template"
            value={template ? template.name : form.compensationTemplateId}
          />
        ) : null}
      </div>
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  steps,
  visibleStepIds,
  currentStepIndex,
}: {
  steps: typeof ALL_STEPS
  visibleStepIds: StepId[]
  currentStepIndex: number
}) {
  const visibleSteps = steps.filter((s) => visibleStepIds.includes(s.id))
  return (
    <nav aria-label="Wizard steps" className="flex items-center gap-1 overflow-x-auto pb-1">
      {visibleSteps.map((step, idx) => {
        const isCompleted = idx < currentStepIndex
        const isActive = idx === currentStepIndex
        return (
          <div key={step.id} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
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
                {isCompleted ? "✓" : idx + 1}
              </span>
              {step.label}
            </div>
            {idx < visibleSteps.length - 1 ? (
              <span className="text-muted-foreground/40 text-xs">›</span>
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}

// ─── Main wizard component ────────────────────────────────────────────────────

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
  const [form, setForm] = useState<EmployeeWizardForm>(() => ({
    ...emptyForm,
    compensationTemplateId: initialTemplateId ?? "",
  }))
  const [stepIndex, setStepIndex] = useState(0)
  const [stepError, setStepError] = useState<string | null>(null)

  const visibleStepIds = getVisibleSteps(form.employmentType)
  const currentStepId = visibleStepIds[stepIndex]
  const totalSteps = visibleStepIds.length
  const isLastStep = stepIndex === totalSteps - 1

  const handleChange = useCallback((updates: Partial<EmployeeWizardForm>) => {
    setForm((prev) => {
      const next = { ...prev, ...updates }
      return next
    })
    setStepError(null)
    // If employment type changes on the employment step, reset to step 0
    // so the recalculated step list is applied from the start
    if ("employmentType" in updates && stepIndex > 0) {
      setStepIndex(0)
    }
  }, [stepIndex])

  const createMutation = useMutation({
    mutationFn: async (payload: EmployeeWizardForm) => {
      const body = {
        ...payload,
        departmentId: payload.departmentId || undefined,
        gradeId: payload.gradeId || undefined,
        supervisorId: payload.supervisorId || undefined,
        compensationTemplateId: payload.compensationTemplateId || undefined,
        hireDate: payload.hireDate || undefined,
        terminationDate: payload.terminationDate || undefined,
        defaultCurrency: payload.defaultCurrency || "USD",
        nationalIdNumber: payload.nationalIdNumber.trim() || undefined,
        nationalIdDocumentUrl: payload.nationalIdDocumentUrl.trim() || undefined,
      }
      return fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify(body),
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

  const handleClose = () => {
    onOpenChange(false)
    // Defer reset so dialog close animation completes
    setTimeout(() => {
      setForm({ ...emptyForm, compensationTemplateId: initialTemplateId ?? "" })
      setStepIndex(0)
      setStepError(null)
    }, 300)
  }

  const handleNext = () => {
    const error = validateStep(currentStepId, form)
    if (error) {
      setStepError(error)
      return
    }
    setStepError(null)
    if (isLastStep) {
      createMutation.mutate(form)
    } else {
      setStepIndex((i) => Math.min(i + 1, totalSteps - 1))
    }
  }

  const handleBack = () => {
    setStepError(null)
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  const renderStep = () => {
    switch (currentStepId) {
      case "employment":
        return <StepEmployment form={form} onChange={handleChange} />
      case "role":
        return (
          <StepRole
            form={form}
            departments={departments}
            grades={grades}
            employees={employees}
            onChange={handleChange}
          />
        )
      case "personal":
        return <StepPersonal form={form} onChange={handleChange} />
      case "emergency":
        return <StepEmergency form={form} onChange={handleChange} />
      case "documents":
        return <StepDocuments form={form} onChange={handleChange} />
      case "compensation":
        return (
          <StepCompensation form={form} templates={templates} onChange={handleChange} />
        )
      case "review":
        return (
          <StepReview
            form={form}
            departments={departments}
            grades={grades}
            templates={templates}
            employees={employees}
          />
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent
        size="full"
        tabletBehavior="fullscreen"
        inset={false}
        className="flex flex-col !max-h-[100dvh] !h-[100dvh] !rounded-none sm:!rounded-none lg:!rounded-none"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--edge-subtle)] px-6 py-4">
          <DialogHeader className="flex-1 min-w-0">
            <DialogTitle className="text-base">
              New Employee
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Step {stepIndex + 1} of {totalSteps}
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogClose className="static shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-muted-foreground shadow-[var(--edge-outline-sharp)] transition-[background-color,color] hover:bg-[var(--surface-soft)] hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30">
            ✕
          </DialogClose>
        </div>

        {/* Step indicator */}
        <div className="shrink-0 px-6 pt-4 pb-2">
          <StepIndicator
            steps={ALL_STEPS}
            visibleStepIds={visibleStepIds}
            currentStepIndex={stepIndex}
          />
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">{renderStep()}</div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--edge-subtle)] px-6 py-4">
          {stepError ? (
            <p className="mb-3 text-sm text-destructive">{stepError}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={stepIndex === 0 || createMutation.isPending}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={createMutation.isPending}
            >
              {isLastStep
                ? createMutation.isPending
                  ? "Creating…"
                  : "Create Employee"
                : "Continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
