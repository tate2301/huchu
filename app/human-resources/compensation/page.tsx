"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Plus } from "@/lib/icons"

import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import {
  fetchCompensationProfiles,
  fetchCompensationRules,
  fetchCompensationTemplates,
  fetchDepartments,
  fetchEmployees,
  fetchJobGrades,
} from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ProfileForm = {
  employeeId: string
  baseAmount: string
  currency: string
  effectiveFrom: string
  effectiveTo: string
  status: "ACTIVE" | "INACTIVE"
  notes: string
}

type RuleForm = {
  name: string
  type: "ALLOWANCE" | "DEDUCTION"
  calcMethod: "FIXED" | "PERCENT"
  value: string
  cap: string
  taxable: boolean
  currency: string
  employeeId: string
  departmentId: string
  gradeId: string
}

type TemplateForm = {
  name: string
  description: string
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL" | "ALL"
  position: "MANAGER" | "CLERK" | "SUPPORT_STAFF" | "ENGINEERS" | "CHEMIST" | "MINERS" | "ALL"
  baseAmount: string
  currency: string
  isActive: boolean
  ruleIds: string[]
}

type RejectionTarget =
  | { id: string; kind: "PROFILE" | "RULE"; label: string }
  | null

const emptyProfileForm: ProfileForm = {
  employeeId: "",
  baseAmount: "",
  currency: "USD",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: "",
  status: "ACTIVE",
  notes: "",
}

const emptyRuleForm: RuleForm = {
  name: "",
  type: "ALLOWANCE",
  calcMethod: "FIXED",
  value: "",
  cap: "",
  taxable: false,
  currency: "USD",
  employeeId: "",
  departmentId: "",
  gradeId: "",
}

const emptyTemplateForm: TemplateForm = {
  name: "",
  description: "",
  employmentType: "ALL",
  position: "ALL",
  baseAmount: "",
  currency: "USD",
  isActive: true,
  ruleIds: [],
}

export default function CompensationPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [templateOpen, setTemplateOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm)
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm)
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm)
  const [rejectionTarget, setRejectionTarget] = useState<RejectionTarget>(null)
  const [rejectionNote, setRejectionNote] = useState("")

  const { data: employeesData } = useQuery({
    queryKey: ["employees", "compensation"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  })
  const { data: departmentsData } = useQuery({
    queryKey: ["departments", "compensation"],
    queryFn: () => fetchDepartments({ active: true, limit: 500 }),
  })
  const { data: gradesData } = useQuery({
    queryKey: ["job-grades", "compensation"],
    queryFn: () => fetchJobGrades({ active: true, limit: 500 }),
  })
  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
  } = useQuery({
    queryKey: ["compensation-templates"],
    queryFn: () => fetchCompensationTemplates({ limit: 500 }),
  })
  const {
    data: profilesData,
    isLoading: profilesLoading,
    error: profilesError,
  } = useQuery({
    queryKey: ["compensation-profiles"],
    queryFn: () => fetchCompensationProfiles({ limit: 500 }),
  })
  const {
    data: rulesData,
    isLoading: rulesLoading,
    error: rulesError,
  } = useQuery({
    queryKey: ["compensation-rules"],
    queryFn: () => fetchCompensationRules({ limit: 500 }),
  })

  const employees = useMemo(() => employeesData?.data ?? [], [employeesData])
  const departments = useMemo(() => departmentsData?.data ?? [], [departmentsData])
  const grades = useMemo(() => gradesData?.data ?? [], [gradesData])
  const templates = useMemo(() => templatesData?.data ?? [], [templatesData])
  const profiles = useMemo(() => profilesData?.data ?? [], [profilesData])
  const rules = useMemo(() => rulesData?.data ?? [], [rulesData])
  const templateRuleOptions = useMemo(
    () => rules.filter((rule) => rule.workflowStatus === "APPROVED" && rule.isActive),
    [rules],
  )

  const createTemplateMutation = useMutation({
    mutationFn: async (payload: TemplateForm) =>
      fetchJson("/api/compensation/templates", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description || undefined,
          employmentType:
            payload.employmentType === "ALL" ? undefined : payload.employmentType,
          position: payload.position === "ALL" ? undefined : payload.position,
          baseAmount: Number(payload.baseAmount),
          currency: payload.currency,
          isActive: payload.isActive,
          ruleIds: payload.ruleIds,
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Compensation template saved",
        description: "Template can now be used in new employee onboarding.",
        variant: "success",
      })
      setTemplateOpen(false)
      setTemplateForm(emptyTemplateForm)
      queryClient.invalidateQueries({ queryKey: ["compensation-templates"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to save template",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const createProfileMutation = useMutation({
    mutationFn: async (payload: ProfileForm) =>
      fetchJson("/api/compensation/profiles", {
        method: "POST",
        body: JSON.stringify({
          employeeId: payload.employeeId,
          baseAmount: Number(payload.baseAmount),
          currency: payload.currency,
          effectiveFrom: payload.effectiveFrom,
          effectiveTo: payload.effectiveTo || undefined,
          status: payload.status,
          notes: payload.notes || undefined,
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Compensation profile saved",
        description: "Employee base compensation saved in draft.",
        variant: "success",
      })
      setProfileOpen(false)
      setProfileForm(emptyProfileForm)
      queryClient.invalidateQueries({ queryKey: ["compensation-profiles"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to save profile",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const submitProfileMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compensation/profiles/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Profile submitted",
        description: "Compensation profile sent for approval.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["compensation-profiles"] })
      queryClient.invalidateQueries({ queryKey: ["approval-history"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to submit profile",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const approveProfileMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compensation/profiles/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Profile approved",
        description: "Compensation profile is now active for payroll.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["compensation-profiles"] })
      queryClient.invalidateQueries({ queryKey: ["approval-history"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to approve profile",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const rejectProfileMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      fetchJson(`/api/compensation/profiles/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      toast({
        title: "Profile rejected",
        description: "Profile returned to draft for corrections.",
        variant: "success",
      })
      setRejectionTarget(null)
      setRejectionNote("")
      queryClient.invalidateQueries({ queryKey: ["compensation-profiles"] })
      queryClient.invalidateQueries({ queryKey: ["approval-history"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to reject profile",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const createRuleMutation = useMutation({
    mutationFn: async (payload: RuleForm) =>
      fetchJson("/api/compensation/rules", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          type: payload.type,
          calcMethod: payload.calcMethod,
          value: Number(payload.value),
          cap: payload.cap ? Number(payload.cap) : undefined,
          taxable: payload.taxable,
          currency: payload.currency,
          employeeId: payload.employeeId || undefined,
          departmentId: payload.departmentId || undefined,
          gradeId: payload.gradeId || undefined,
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Compensation rule saved",
        description: "Rule added in draft and awaits approval.",
        variant: "success",
      })
      setRuleOpen(false)
      setRuleForm(emptyRuleForm)
      queryClient.invalidateQueries({ queryKey: ["compensation-rules"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to save rule",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const submitRuleMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compensation/rules/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Rule submitted",
        description: "Rule sent for approval.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["compensation-rules"] })
      queryClient.invalidateQueries({ queryKey: ["approval-history"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to submit rule",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const approveRuleMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compensation/rules/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Rule approved",
        description: "Rule is now active for payroll calculations.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["compensation-rules"] })
      queryClient.invalidateQueries({ queryKey: ["approval-history"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to approve rule",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const rejectRuleMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      fetchJson(`/api/compensation/rules/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      toast({
        title: "Rule rejected",
        description: "Rule returned to draft for corrections.",
        variant: "success",
      })
      setRejectionTarget(null)
      setRejectionNote("")
      queryClient.invalidateQueries({ queryKey: ["compensation-rules"] })
      queryClient.invalidateQueries({ queryKey: ["approval-history"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to reject rule",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const openRejectionDialog = (target: NonNullable<RejectionTarget>) => {
    setRejectionTarget(target)
    setRejectionNote("")
  }

  const handleReject = () => {
    if (!rejectionTarget) return
    const note = rejectionNote.trim()
    if (!note) return

    if (rejectionTarget.kind === "PROFILE") {
      rejectProfileMutation.mutate({ id: rejectionTarget.id, note })
      return
    }

    rejectRuleMutation.mutate({ id: rejectionTarget.id, note })
  }

  return (
    <HrShell
      activeTab="compensation"
      description="Manage base pay profiles and allowance/deduction rules"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRuleOpen(true)}>
            <Plus className="h-4 w-4" />
            New Rule
          </Button>
          <Button size="sm" onClick={() => setProfileOpen(true)}>
            <Plus className="h-4 w-4" />
            New Profile
          </Button>
        </div>
      }
    >
      {(templatesError || profilesError || rulesError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load compensation data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(templatesError || profilesError || rulesError)}
          </AlertDescription>
        </Alert>
      )}

      <Sheet open={templateOpen} onOpenChange={setTemplateOpen}>
        <SheetContent className="w-full sm:max-w-2xl p-6">
          <SheetHeader>
            <SheetTitle>New Compensation Template</SheetTitle>
            <SheetDescription>
              Templates combine a base profile and approved rules for faster onboarding.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              createTemplateMutation.mutate(templateForm)
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Template Name *</label>
                <Input
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Base Amount *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={templateForm.baseAmount}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({ ...prev, baseAmount: event.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Employment Scope</label>
                <Select
                  value={templateForm.employmentType}
                  onValueChange={(value) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      employmentType: value as TemplateForm["employmentType"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All employment types</SelectItem>
                    <SelectItem value="FULL_TIME">Full Time</SelectItem>
                    <SelectItem value="PART_TIME">Part Time</SelectItem>
                    <SelectItem value="CONTRACT">Contract</SelectItem>
                    <SelectItem value="CASUAL">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Position Scope</label>
                <Select
                  value={templateForm.position}
                  onValueChange={(value) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      position: value as TemplateForm["position"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All positions</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="CLERK">Clerk</SelectItem>
                    <SelectItem value="SUPPORT_STAFF">Support Staff</SelectItem>
                    <SelectItem value="ENGINEERS">Engineers</SelectItem>
                    <SelectItem value="CHEMIST">Chemist</SelectItem>
                    <SelectItem value="MINERS">Miners</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Currency</label>
                <Input
                  value={templateForm.currency}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Status</label>
                <Select
                  value={templateForm.isActive ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setTemplateForm((prev) => ({ ...prev, isActive: value === "active" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Description</label>
              <Input
                value={templateForm.description}
                onChange={(event) =>
                  setTemplateForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Optional template notes"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Included Rules</label>
              {templateRuleOptions.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No approved active rules available yet. Create and approve rules first.
                </div>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {templateRuleOptions.map((rule) => {
                    const checked = templateForm.ruleIds.includes(rule.id)
                    return (
                      <label key={rule.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = new Set(templateForm.ruleIds)
                            if (event.target.checked) next.add(rule.id)
                            else next.delete(rule.id)
                            setTemplateForm((prev) => ({
                              ...prev,
                              ruleIds: Array.from(next),
                            }))
                          }}
                        />
                        <span className="font-medium">{rule.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({rule.type}, {rule.calcMethod === "PERCENT" ? `${rule.value}%` : `${rule.currency} ${rule.value}`})
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <Button className="w-full" type="submit" disabled={createTemplateMutation.isPending}>
              Save Template
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>New Compensation Profile</SheetTitle>
            <SheetDescription>Define the base salary profile for an employee.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!profileForm.employeeId) return
              createProfileMutation.mutate(profileForm)
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-semibold">Employee *</label>
              <Select
                value={profileForm.employeeId}
                onValueChange={(value) => setProfileForm((prev) => ({ ...prev, employeeId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} ({employee.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Base Amount *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={profileForm.baseAmount}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, baseAmount: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Currency</label>
                <Input
                  value={profileForm.currency}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Effective From *</label>
                <Input
                  type="date"
                  value={profileForm.effectiveFrom}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, effectiveFrom: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Effective To</label>
                <Input
                  type="date"
                  value={profileForm.effectiveTo}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, effectiveTo: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Status</label>
              <Select
                value={profileForm.status}
                onValueChange={(value) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    status: value as ProfileForm["status"],
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Notes</label>
              <Input
                value={profileForm.notes}
                onChange={(event) =>
                  setProfileForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </div>
            <Button className="w-full" type="submit" disabled={createProfileMutation.isPending}>
              Save Profile
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={ruleOpen} onOpenChange={setRuleOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>New Compensation Rule</SheetTitle>
            <SheetDescription>Configure allowance or deduction logic.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              createRuleMutation.mutate(ruleForm)
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-semibold">Rule Name *</label>
              <Input
                value={ruleForm.name}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Type</label>
                <Select
                  value={ruleForm.type}
                  onValueChange={(value) =>
                    setRuleForm((prev) => ({ ...prev, type: value as RuleForm["type"] }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALLOWANCE">Allowance</SelectItem>
                    <SelectItem value="DEDUCTION">Deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Calculation</label>
                <Select
                  value={ruleForm.calcMethod}
                  onValueChange={(value) =>
                    setRuleForm((prev) => ({ ...prev, calcMethod: value as RuleForm["calcMethod"] }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed</SelectItem>
                    <SelectItem value="PERCENT">Percent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold">Value *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ruleForm.value}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, value: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Cap</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ruleForm.cap}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, cap: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Currency</label>
                <Input
                  value={ruleForm.currency}
                  onChange={(event) =>
                    setRuleForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold">Employee scope</label>
                <Select
                  value={ruleForm.employeeId || "all"}
                  onValueChange={(value) =>
                    setRuleForm((prev) => ({ ...prev, employeeId: value === "all" ? "" : value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All employees</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Department scope</label>
                <Select
                  value={ruleForm.departmentId || "all"}
                  onValueChange={(value) =>
                    setRuleForm((prev) => ({ ...prev, departmentId: value === "all" ? "" : value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.code} - {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Grade scope</label>
                <Select
                  value={ruleForm.gradeId || "all"}
                  onValueChange={(value) =>
                    setRuleForm((prev) => ({ ...prev, gradeId: value === "all" ? "" : value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All grades</SelectItem>
                    {grades.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id}>
                        {grade.code} - {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ruleForm.taxable}
                onChange={(event) =>
                  setRuleForm((prev) => ({ ...prev, taxable: event.target.checked }))
                }
              />
              Taxable component
            </label>
            <Button className="w-full" type="submit" disabled={createRuleMutation.isPending}>
              Save Rule
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Card>
        <CardHeader>
          <CardTitle>Compensation Templates</CardTitle>
          <CardDescription>
            Reusable profile + rule bundles for onboarding permanent, contract, or role-specific staff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templatesLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : templates.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No compensation templates yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Template</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Scope</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Base</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Rules</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id} className="border-b">
                      <TableCell className="p-3">
                        <div className="font-semibold">{template.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {template.description || "No description"}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">
                        <div>
                          {template.employmentType || "All employment types"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {template.position || "All positions"}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">
                        {template.currency} {template.baseAmount.toFixed(2)}
                      </TableCell>
                      <TableCell className="p-3">
                        {template._count?.rules ?? template.rules.length}
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge variant={template.isActive ? "secondary" : "outline"}>
                          {template.isActive ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/human-resources?templateId=${template.id}`}>
                            Use in Onboarding
                            <ArrowRight className="size-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compensation Profiles</CardTitle>
          <CardDescription>Employee base pay with effective-date history.</CardDescription>
        </CardHeader>
        <CardContent>
          {profilesLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : profiles.length === 0 ? (
            <div className="text-sm text-muted-foreground">No compensation profiles yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Employee</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Base Amount</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Effective Window</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Workflow</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id} className="border-b">
                      <TableCell className="p-3">
                        <div className="font-semibold">{profile.employee.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {profile.employee.employeeId}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">
                        {profile.currency} {profile.baseAmount.toFixed(2)}
                      </TableCell>
                      <TableCell className="p-3">
                        {profile.effectiveFrom.slice(0, 10)} to{" "}
                        {profile.effectiveTo ? profile.effectiveTo.slice(0, 10) : "Open"}
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge variant={profile.status === "ACTIVE" ? "secondary" : "outline"}>
                          {profile.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge variant={profile.workflowStatus === "APPROVED" ? "secondary" : "outline"}>
                          {profile.workflowStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !["DRAFT", "REJECTED"].includes(profile.workflowStatus) ||
                              submitProfileMutation.isPending
                            }
                            onClick={() => submitProfileMutation.mutate(profile.id)}
                          >
                            Submit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              profile.workflowStatus !== "SUBMITTED" || approveProfileMutation.isPending
                            }
                            onClick={() => approveProfileMutation.mutate(profile.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              profile.workflowStatus !== "SUBMITTED" || rejectProfileMutation.isPending
                            }
                            onClick={() =>
                              openRejectionDialog({
                                id: profile.id,
                                kind: "PROFILE",
                                label: `Compensation profile for ${profile.employee.name}`,
                              })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compensation Rules</CardTitle>
          <CardDescription>Reusable allowance and deduction rules.</CardDescription>
        </CardHeader>
        <CardContent>
          {rulesLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : rules.length === 0 ? (
            <div className="text-sm text-muted-foreground">No compensation rules yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Rule</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Value</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Scope</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Workflow</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id} className="border-b">
                      <TableCell className="p-3">
                        <div className="font-semibold">{rule.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {rule.calcMethod === "PERCENT" ? "Percent of base" : "Fixed amount"}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">{rule.type}</TableCell>
                      <TableCell className="p-3">
                        {rule.calcMethod === "PERCENT" ? `${rule.value}%` : `${rule.currency} ${rule.value}`}
                        {rule.cap ? <div className="text-xs text-muted-foreground">Cap {rule.cap}</div> : null}
                      </TableCell>
                      <TableCell className="p-3">
                        {rule.employee?.name ||
                          rule.department?.name ||
                          rule.grade?.name ||
                          "Global"}
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge variant={rule.isActive ? "secondary" : "outline"}>
                          {rule.isActive ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge variant={rule.workflowStatus === "APPROVED" ? "secondary" : "outline"}>
                          {rule.workflowStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !["DRAFT", "REJECTED"].includes(rule.workflowStatus) ||
                              submitRuleMutation.isPending
                            }
                            onClick={() => submitRuleMutation.mutate(rule.id)}
                          >
                            Submit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={rule.workflowStatus !== "SUBMITTED" || approveRuleMutation.isPending}
                            onClick={() => approveRuleMutation.mutate(rule.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={rule.workflowStatus !== "SUBMITTED" || rejectRuleMutation.isPending}
                            onClick={() =>
                              openRejectionDialog({
                                id: rule.id,
                                kind: "RULE",
                                label: `Compensation rule ${rule.name}`,
                              })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(rejectionTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectionTarget(null)
            setRejectionNote("")
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject Item</DialogTitle>
            <DialogDescription>
              {rejectionTarget
                ? `Provide an audit note before rejecting ${rejectionTarget.label}.`
                : "Provide a rejection note."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block text-sm font-semibold">Rejection Note</label>
            <Textarea
              value={rejectionNote}
              onChange={(event) => setRejectionNote(event.target.value)}
              placeholder="Explain what needs correction."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectionTarget(null)
                setRejectionNote("")
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !rejectionNote.trim() ||
                rejectProfileMutation.isPending ||
                rejectRuleMutation.isPending
              }
              onClick={handleReject}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HrShell>
  )
}


