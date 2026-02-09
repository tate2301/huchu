"use client"

import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { endOfMonth, format, startOfMonth } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { Pencil, Wallet } from "lucide-react"

import { HrShell } from "@/components/human-resources/hr-shell"
import { PdfTemplate } from "@/components/pdf/pdf-template"
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
import { RecordSavedBanner } from "@/components/shared/record-saved-banner"
import { fetchEmployeePayments, fetchEmployees, fetchFixedSalaries } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { exportElementToPdf } from "@/lib/pdf"
import type { EmployeePayment, FixedSalary } from "@/lib/api"

const statusOptions = [
  { value: "DUE", label: "Due" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
] as const

type FixedSalaryForm = {
  employeeId: string
  monthlyAmount: string
  currency: string
  isActive: boolean
}

type PaymentForm = {
  id?: string
  employeeId: string
  employeeName: string
  periodStart: string
  periodEnd: string
  dueDate: string
  amount: string
  unit: string
  paidAmount: string
  paidAt: string
  status: "DUE" | "PARTIAL" | "PAID"
  notes: string
}

const emptyFixedSalary: FixedSalaryForm = {
  employeeId: "",
  monthlyAmount: "",
  currency: "USD",
  isActive: true,
}

const emptyPaymentForm: PaymentForm = {
  employeeId: "",
  employeeName: "",
  periodStart: "",
  periodEnd: "",
  dueDate: "",
  amount: "",
  unit: "USD",
  paidAmount: "",
  paidAt: "",
  status: "DUE",
  notes: "",
}

export default function HrSalariesPage() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const createdId = searchParams.get("createdId")
  const [salaryFormData, setSalaryFormData] = useState<FixedSalaryForm>(emptyFixedSalary)
  const [salaryEditingId, setSalaryEditingId] = useState<string | null>(null)
  const [salaryFormOpen, setSalaryFormOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const salaryPdfRef = useRef<HTMLDivElement>(null)
  const [selectedMonth, setSelectedMonth] = useState(
    searchParams.get("month") ?? format(new Date(), "yyyy-MM"),
  )

  const { data: employeesData } = useQuery({
    queryKey: ["employees", "fixed-salary"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  })

  const { data: fixedSalaryData, isLoading: fixedSalaryLoading, error: fixedSalaryError } = useQuery({
    queryKey: ["fixed-salaries"],
    queryFn: () => fetchFixedSalaries({ limit: 500 }),
  })

  const periodStart = useMemo(() => {
    const date = new Date(`${selectedMonth}-01T00:00:00`)
    return startOfMonth(date)
  }, [selectedMonth])

  const periodEnd = useMemo(() => endOfMonth(periodStart), [periodStart])

  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: ["employee-payments", "salary", selectedMonth],
    queryFn: () =>
      fetchEmployeePayments({
        type: "SALARY",
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
        limit: 500,
      }),
  })

  const employees = useMemo(() => employeesData?.data ?? [], [employeesData])
  const fixedSalaries = useMemo(() => fixedSalaryData?.data ?? [], [fixedSalaryData])
  const payments = useMemo(() => paymentsData?.data ?? [], [paymentsData])

  const paymentMap = useMemo(() => {
    const map = new Map<string, EmployeePayment>()
    payments.forEach((payment) => {
      map.set(payment.employeeId, payment)
    })
    return map
  }, [payments])

  const fixedSalaryIds = useMemo(() => new Set(fixedSalaries.map((salary) => salary.employeeId)), [fixedSalaries])

  const createFixedSalaryMutation = useMutation({
    mutationFn: async (payload: FixedSalaryForm) =>
      fetchJson<FixedSalary>("/api/fixed-salaries", {
        method: "POST",
        body: JSON.stringify({
          employeeId: payload.employeeId,
          monthlyAmount: Number(payload.monthlyAmount),
          currency: payload.currency,
          isActive: payload.isActive,
        }),
      }),
    onSuccess: (salary) => {
      toast({
        title: "Fixed salary saved",
        description: "Employee added to fixed salaries.",
        variant: "success",
      })
      setSalaryFormOpen(false)
      setSalaryEditingId(null)
      setSalaryFormData(emptyFixedSalary)
      queryClient.invalidateQueries({ queryKey: ["fixed-salaries"] })
      const params = new URLSearchParams({
        createdId: salary.id,
        source: "fixed-salary",
        month: selectedMonth,
      })
      router.push(`/human-resources/salaries?${params.toString()}`)
    },
    onError: (error) => {
      toast({
        title: "Unable to save salary",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const updateFixedSalaryMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: FixedSalaryForm }) =>
      fetchJson<FixedSalary>(`/api/fixed-salaries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          monthlyAmount: Number(payload.monthlyAmount),
          currency: payload.currency,
          isActive: payload.isActive,
        }),
      }),
    onSuccess: (salary) => {
      toast({
        title: "Fixed salary updated",
        description: "Salary details saved.",
        variant: "success",
      })
      setSalaryFormOpen(false)
      setSalaryEditingId(null)
      setSalaryFormData(emptyFixedSalary)
      queryClient.invalidateQueries({ queryKey: ["fixed-salaries"] })
      const params = new URLSearchParams({
        createdId: salary.id,
        source: "fixed-salary",
        month: selectedMonth,
      })
      router.push(`/human-resources/salaries?${params.toString()}`)
    },
    onError: (error) => {
      toast({
        title: "Unable to update salary",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const createPaymentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ id: string }>("/api/employee-payments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (payment) => {
      toast({
        title: "Payment recorded",
        description: "Salary payment has been saved.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] })
      setPaymentOpen(false)
      const params = new URLSearchParams({
        createdId: payment.id,
        source: "salary-payment",
        month: selectedMonth,
      })
      router.push(`/human-resources/salaries?${params.toString()}`)
    },
    onError: (error) => {
      toast({
        title: "Unable to record payment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      fetchJson<{ id: string }>(`/api/employee-payments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (payment) => {
      toast({
        title: "Payment updated",
        description: "Salary payment changes saved.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] })
      setPaymentOpen(false)
      const params = new URLSearchParams({
        createdId: payment.id,
        source: "salary-payment",
        month: selectedMonth,
      })
      router.push(`/human-resources/salaries?${params.toString()}`)
    },
    onError: (error) => {
      toast({
        title: "Unable to update payment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const handleSalaryFormOpenChange = (open: boolean) => {
    setSalaryFormOpen(open)
    if (!open) {
      setSalaryEditingId(null)
      setSalaryFormData(emptyFixedSalary)
    }
  }

  const handleSalarySelectEmployee = (value: string) => {
    setSalaryFormData((prev) => ({ ...prev, employeeId: value }))
  }

  const handleSalaryChange = (field: keyof FixedSalaryForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setSalaryFormData((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleSalaryStatusChange = (value: string) => {
    setSalaryFormData((prev) => ({ ...prev, isActive: value === "active" }))
  }

  const handleSalarySubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!salaryFormData.employeeId) return

    if (salaryEditingId) {
      updateFixedSalaryMutation.mutate({ id: salaryEditingId, payload: salaryFormData })
    } else {
      createFixedSalaryMutation.mutate(salaryFormData)
    }
  }

  const openSalaryEdit = (salary: FixedSalary) => {
    setSalaryEditingId(salary.id)
    setSalaryFormData({
      employeeId: salary.employeeId,
      monthlyAmount: salary.monthlyAmount.toString(),
      currency: salary.currency,
      isActive: salary.isActive,
    })
    setSalaryFormOpen(true)
  }

  const openSalaryPayment = (salary: FixedSalary, payment?: EmployeePayment) => {
    const periodStartValue = format(periodStart, "yyyy-MM-dd")
    const periodEndValue = format(periodEnd, "yyyy-MM-dd")

    setPaymentForm({
      id: payment?.id,
      employeeId: salary.employeeId,
      employeeName: salary.employee.name,
      periodStart: periodStartValue,
      periodEnd: periodEndValue,
      dueDate: payment?.dueDate ? payment.dueDate.slice(0, 10) : periodEndValue,
      amount: payment ? String(payment.amount) : salary.monthlyAmount.toFixed(2),
      unit: payment?.unit ?? salary.currency,
      paidAmount: payment?.paidAmount ? String(payment.paidAmount) : "",
      paidAt: payment?.paidAt ? payment.paidAt.slice(0, 10) : "",
      status: payment?.status ?? "DUE",
      notes: payment?.notes ?? "",
    })
    setPaymentOpen(true)
  }

  const handlePaymentChange = (field: keyof PaymentForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setPaymentForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handlePaymentStatusChange = (value: string) => {
    setPaymentForm((prev) => ({ ...prev, status: value as PaymentForm["status"] }))
  }

  const handlePaymentSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (!paymentForm.employeeId) return

    const payload = {
      employeeId: paymentForm.employeeId,
      type: "SALARY",
      periodStart: paymentForm.periodStart,
      periodEnd: paymentForm.periodEnd,
      dueDate: paymentForm.dueDate,
      amount: Number(paymentForm.amount),
      unit: paymentForm.unit,
      paidAmount: paymentForm.paidAmount ? Number(paymentForm.paidAmount) : undefined,
      paidAt: paymentForm.paidAt ? new Date(paymentForm.paidAt).toISOString() : undefined,
      status: paymentForm.status,
      notes: paymentForm.notes || undefined,
    }

    if (paymentForm.id) {
      updatePaymentMutation.mutate({ id: paymentForm.id, payload })
    } else {
      createPaymentMutation.mutate(payload)
    }
  }

  return (
    <HrShell
      activeTab="salaries"
      description="Fixed salary management and monthly payments"
      actions={
        <Button size="sm" onClick={() => setSalaryFormOpen(true)}>
          <Wallet className="h-4 w-4" />
          Add Fixed Salary
        </Button>
      }
    >
      <RecordSavedBanner entityLabel="salary record" />
      {(fixedSalaryError || paymentsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load salary data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(fixedSalaryError || paymentsError)}</AlertDescription>
        </Alert>
      )}

      <Sheet open={salaryFormOpen} onOpenChange={handleSalaryFormOpenChange}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>{salaryEditingId ? "Edit Fixed Salary" : "Add Fixed Salary"}</SheetTitle>
            <SheetDescription>Manage monthly salary records.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSalarySubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Employee *</label>
              <Select
                value={salaryFormData.employeeId}
                onValueChange={handleSalarySelectEmployee}
                disabled={!!salaryEditingId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.length === 0 ? (
                    <SelectItem value="no-employees" disabled>
                      No employees available
                    </SelectItem>
                  ) : (
                    employees.map((employee) => (
                      <SelectItem
                        key={employee.id}
                        value={employee.id}
                        disabled={!salaryEditingId && fixedSalaryIds.has(employee.id)}
                      >
                        {employee.name} ({employee.employeeId})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {!salaryEditingId ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Employees already on fixed salary are disabled.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Monthly Amount *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salaryFormData.monthlyAmount}
                  onChange={handleSalaryChange("monthlyAmount")}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <Input
                  value={salaryFormData.currency}
                  onChange={handleSalaryChange("currency")}
                  placeholder="USD"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Status</label>
              <Select
                value={salaryFormData.isActive ? "active" : "inactive"}
                onValueChange={handleSalaryStatusChange}
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

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createFixedSalaryMutation.isPending || updateFixedSalaryMutation.isPending}
              >
                {salaryEditingId ? "Save Changes" : "Add Fixed Salary"}
              </Button>
              <Button type="button" variant="outline" onClick={() => handleSalaryFormOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={paymentOpen} onOpenChange={setPaymentOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>{paymentForm.id ? "Update Salary Payment" : "Record Salary Payment"}</SheetTitle>
            <SheetDescription>Track salary payments and overdue amounts.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handlePaymentSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Employee</label>
              <Input value={paymentForm.employeeName} disabled />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Period Start</label>
                <Input value={paymentForm.periodStart} disabled />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Period End</label>
                <Input value={paymentForm.periodEnd} disabled />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Due Date</label>
                <Input type="date" value={paymentForm.dueDate} onChange={handlePaymentChange("dueDate")} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Status</label>
                <Select value={paymentForm.status} onValueChange={handlePaymentStatusChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Salary Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={handlePaymentChange("amount")}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Paid Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentForm.paidAmount}
                  onChange={handlePaymentChange("paidAmount")}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Paid Date</label>
              <Input type="date" value={paymentForm.paidAt} onChange={handlePaymentChange("paidAt")} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Input value={paymentForm.notes} onChange={handlePaymentChange("notes")} placeholder="Optional notes" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
              >
                {paymentForm.id ? "Save Changes" : "Record Payment"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Salary Payments</CardTitle>
              <CardDescription>Track monthly salary payouts and overdue items.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="h-9 w-[160px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (salaryPdfRef.current) {
                    exportElementToPdf(
                      salaryPdfRef.current,
                      `salary-payments-${selectedMonth}.pdf`,
                    )
                  }
                }}
                disabled={fixedSalaryLoading || fixedSalaries.length === 0}
              >
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {fixedSalaryLoading || paymentsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : fixedSalaries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No fixed salary employees yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-semibold">Employee</th>
                    <th className="text-left p-3 font-semibold">Position</th>
                    <th className="text-left p-3 font-semibold">Monthly Salary</th>
                    <th className="text-left p-3 font-semibold">Due Date</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Paid</th>
                    <th className="text-left p-3 font-semibold">Paid Date</th>
                    <th className="text-right p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fixedSalaries.map((salary) => {
                    const payment = paymentMap.get(salary.employeeId)
                    const dueDate = payment?.dueDate ? payment.dueDate.slice(0, 10) : format(periodEnd, "yyyy-MM-dd")
                    const isOverdue =
                      dueDate && new Date(dueDate) < new Date() && payment?.status !== "PAID"

                    return (
                      <tr
                        key={salary.id}
                        className={`border-b ${
                          createdId === salary.id || createdId === payment?.id ? "bg-emerald-50" : ""
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-semibold">{salary.employee.name}</div>
                          <div className="text-xs text-muted-foreground">{salary.employee.employeeId}</div>
                        </td>
                        <td className="p-3">{salary.employee.position}</td>
                        <td className="p-3">
                          {salary.currency} {salary.monthlyAmount.toFixed(2)}
                        </td>
                        <td className="p-3">
                          {dueDate}
                          {isOverdue ? <div className="text-xs text-red-600">Past due</div> : null}
                        </td>
                        <td className="p-3">
                          <Badge variant={payment?.status === "PAID" ? "secondary" : "outline"}>
                            {payment?.status ?? "DUE"}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {payment?.paidAmount ? payment.paidAmount.toFixed(2) : "-"}
                        </td>
                        <td className="p-3">
                          {payment?.paidAt ? format(new Date(payment.paidAt), "MMM d, yyyy") : "-"}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openSalaryEdit(salary)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openSalaryPayment(salary, payment)}
                            >
                              {payment ? "Update" : "Record"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={salaryPdfRef}>
          <PdfTemplate
            title="Salary Payments"
            subtitle={format(periodStart, "MMMM yyyy")}
            meta={[{ label: "Total staff", value: String(fixedSalaries.length) }]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Employee</th>
                  <th className="py-2">Position</th>
                  <th className="py-2">Monthly Salary</th>
                  <th className="py-2">Due Date</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {fixedSalaries.map((salary) => {
                  const payment = paymentMap.get(salary.employeeId)
                  const dueDate = payment?.dueDate ? payment.dueDate.slice(0, 10) : format(periodEnd, "yyyy-MM-dd")

                  return (
                    <tr key={salary.id} className="border-b border-gray-100">
                      <td className="py-2">
                        <div className="font-semibold">{salary.employee.name}</div>
                        <div className="text-[10px] text-gray-500">{salary.employee.employeeId}</div>
                      </td>
                      <td className="py-2">{salary.employee.position}</td>
                      <td className="py-2">
                        {salary.currency} {salary.monthlyAmount.toFixed(2)}
                      </td>
                      <td className="py-2">{dueDate}</td>
                      <td className="py-2">{payment?.status ?? "DUE"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </HrShell>
  )
}
