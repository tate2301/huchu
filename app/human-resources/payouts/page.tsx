"use client"

import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"

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
import { fetchEmployeePayments, fetchGoldShiftAllocations } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { exportElementToPdf } from "@/lib/pdf"
import type { EmployeePayment } from "@/lib/api"

const statusOptions = [
  { value: "DUE", label: "Due" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
] as const

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

const emptyPaymentForm: PaymentForm = {
  employeeId: "",
  employeeName: "",
  periodStart: "",
  periodEnd: "",
  dueDate: "",
  amount: "",
  unit: "g",
  paidAmount: "",
  paidAt: "",
  status: "DUE",
  notes: "",
}

export default function HrPayoutsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const createdId = searchParams.get("createdId")
  const [payoutWindowWeeks, setPayoutWindowWeeks] = useState(searchParams.get("window") ?? "2")
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const payoutPdfRef = useRef<HTMLDivElement>(null)

  const windowWeeks = Number(payoutWindowWeeks)
  const windowStartDate = useMemo(() => {
    const start = new Date()
    start.setDate(start.getDate() - windowWeeks * 7)
    return start
  }, [windowWeeks])
  const windowEndDate = new Date()

  const { data: allocationsData, isLoading: allocationsLoading, error: allocationsError } = useQuery({
    queryKey: ["gold-shift-allocations", "hr-payouts", payoutWindowWeeks],
    queryFn: () =>
      fetchGoldShiftAllocations({
        startDate: windowStartDate.toISOString().slice(0, 10),
        limit: 500,
      }),
  })

  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: ["employee-payments", "gold", payoutWindowWeeks],
    queryFn: () =>
      fetchEmployeePayments({
        type: "GOLD",
        startDate: windowStartDate.toISOString(),
        endDate: windowEndDate.toISOString(),
        limit: 500,
      }),
  })

  const shiftAllocations = useMemo(() => allocationsData?.data ?? [], [allocationsData])
  const payments = useMemo(() => paymentsData?.data ?? [], [paymentsData])

  const payoutDetails = useMemo(() => {
    const totals = new Map<
      string,
      {
        id: string
        name: string
        employeeId: string
        total: number
        earliestDate?: Date
        latestDate?: Date
        allocationCount: number
      }
    >()

    shiftAllocations.forEach((allocation) => {
      if (allocation.payCycleWeeks !== windowWeeks) return
      const allocationDate = new Date(allocation.date)
      allocation.workerShares.forEach((share) => {
        const existing =
          totals.get(share.employee.id) ?? {
            id: share.employee.id,
            name: share.employee.name,
            employeeId: share.employee.employeeId,
            total: 0,
            earliestDate: allocationDate,
            latestDate: allocationDate,
            allocationCount: 0,
          }

        const earliest =
          !existing.earliestDate || allocationDate < existing.earliestDate
            ? allocationDate
            : existing.earliestDate
        const latest =
          !existing.latestDate || allocationDate > existing.latestDate
            ? allocationDate
            : existing.latestDate

        totals.set(share.employee.id, {
          ...existing,
          total: existing.total + share.shareWeight,
          earliestDate: earliest,
          latestDate: latest,
          allocationCount: existing.allocationCount + 1,
        })
      })
    })

    return Array.from(totals.values()).sort((a, b) => b.total - a.total)
  }, [shiftAllocations, windowWeeks])

  const paymentMap = useMemo(() => {
    const map = new Map<string, EmployeePayment>()
    payments.forEach((payment) => {
      const key = `${payment.employeeId}|${payment.periodStart.slice(0, 10)}|${payment.periodEnd.slice(0, 10)}`
      map.set(key, payment)
    })
    return map
  }, [payments])

  const isLoading = allocationsLoading || paymentsLoading

  const createPaymentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<{ id: string }>("/api/employee-payments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (payment) => {
      toast({
        title: "Payout recorded",
        description: "Gold payout has been saved.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] })
      setPaymentOpen(false)
      const params = new URLSearchParams({
        createdId: payment.id,
        source: "gold-payout",
        window: payoutWindowWeeks,
      })
      router.push(`/human-resources/payouts?${params.toString()}`)
    },
    onError: (error) => {
      toast({
        title: "Unable to record payout",
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
        title: "Payout updated",
        description: "Gold payout changes saved.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] })
      setPaymentOpen(false)
      const params = new URLSearchParams({
        createdId: payment.id,
        source: "gold-payout",
        window: payoutWindowWeeks,
      })
      router.push(`/human-resources/payouts?${params.toString()}`)
    },
    onError: (error) => {
      toast({
        title: "Unable to update payout",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const openPaymentForm = (row: typeof payoutDetails[number], payment?: EmployeePayment) => {
    const periodStart = row.earliestDate ? format(row.earliestDate, "yyyy-MM-dd") : ""
    const periodEnd = row.latestDate ? format(row.latestDate, "yyyy-MM-dd") : ""
    const dueDate = payment?.dueDate
      ? payment.dueDate.slice(0, 10)
      : periodEnd || format(windowEndDate, "yyyy-MM-dd")

    setPaymentForm({
      id: payment?.id,
      employeeId: row.id,
      employeeName: row.name,
      periodStart,
      periodEnd,
      dueDate,
      amount: payment ? String(payment.amount) : row.total.toFixed(3),
      unit: payment?.unit ?? "g",
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

  const handleStatusChange = (value: string) => {
    setPaymentForm((prev) => ({ ...prev, status: value as PaymentForm["status"] }))
  }

  const handlePaymentSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (!paymentForm.employeeId) return

    const payload = {
      employeeId: paymentForm.employeeId,
      type: "GOLD",
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
    <HrShell activeTab="payouts" description="Gold payout management and approvals">
      <RecordSavedBanner entityLabel="gold payout record" />
      {(allocationsError || paymentsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(allocationsError || paymentsError)}</AlertDescription>
        </Alert>
      )}

      <Sheet open={paymentOpen} onOpenChange={setPaymentOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>{paymentForm.id ? "Update Payment" : "Record Payment"}</SheetTitle>
            <SheetDescription>
              Record gold payouts and mark payments as due, partial, or paid.
            </SheetDescription>
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
                <Select value={paymentForm.status} onValueChange={handleStatusChange}>
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
                <label className="block text-sm font-semibold mb-2">Gold Amount (g)</label>
                <Input
                  type="number"
                  step="0.001"
                  value={paymentForm.amount}
                  onChange={handlePaymentChange("amount")}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Paid Amount (g)</label>
                <Input
                  type="number"
                  step="0.001"
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
              <CardTitle>Gold Payouts</CardTitle>
              <CardDescription>Review payout amounts and payment status.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={payoutWindowWeeks === "2" ? "default" : "outline"}
                size="sm"
                onClick={() => setPayoutWindowWeeks("2")}
              >
                2 weeks
              </Button>
              <Button
                type="button"
                variant={payoutWindowWeeks === "4" ? "default" : "outline"}
                size="sm"
                onClick={() => setPayoutWindowWeeks("4")}
              >
                4 weeks
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (payoutPdfRef.current) {
                    exportElementToPdf(
                      payoutPdfRef.current,
                      `gold-payouts-${payoutWindowWeeks}-weeks.pdf`,
                    )
                  }
                }}
                disabled={isLoading || payoutDetails.length === 0}
              >
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : payoutDetails.length === 0 ? (
            <div className="text-sm text-muted-foreground">No payouts for this window.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-semibold">Employee</th>
                    <th className="text-left p-3 font-semibold">Earned Period</th>
                    <th className="text-left p-3 font-semibold">Gold Due (g)</th>
                    <th className="text-left p-3 font-semibold">Due Date</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Paid</th>
                    <th className="text-left p-3 font-semibold">Paid Date</th>
                    <th className="text-right p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutDetails.map((row) => {
                    const periodStart = row.earliestDate ? format(row.earliestDate, "yyyy-MM-dd") : ""
                    const periodEnd = row.latestDate ? format(row.latestDate, "yyyy-MM-dd") : ""
                    const key = `${row.id}|${periodStart}|${periodEnd}`
                    const payment = paymentMap.get(key)
                    const dueDate = payment?.dueDate ? payment.dueDate.slice(0, 10) : periodEnd
                    const isOverdue =
                      dueDate && new Date(dueDate) < new Date() && payment?.status !== "PAID"

                    return (
                      <tr
                        key={row.id}
                        className={`border-b ${createdId === payment?.id ? "bg-emerald-50" : ""}`}
                      >
                        <td className="p-3">
                          <div className="font-semibold">{row.name}</div>
                          <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                        </td>
                        <td className="p-3">
                          {row.earliestDate && row.latestDate
                            ? row.earliestDate.toDateString() === row.latestDate.toDateString()
                              ? format(row.earliestDate, "MMM d, yyyy")
                              : `${format(row.earliestDate, "MMM d, yyyy")} - ${format(
                                  row.latestDate,
                                  "MMM d, yyyy",
                                )}`
                            : "-"}
                          <div className="text-xs text-muted-foreground">
                            {row.allocationCount} shift allocation{row.allocationCount === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="p-3">{row.total.toFixed(3)}</td>
                        <td className="p-3">
                          {dueDate || "-"}
                          {isOverdue ? (
                            <div className="text-xs text-red-600">Past due</div>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <Badge variant={payment?.status === "PAID" ? "secondary" : "outline"}>
                            {payment?.status ?? "DUE"}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {payment?.paidAmount ? payment.paidAmount.toFixed(3) : "-"}
                        </td>
                        <td className="p-3">
                          {payment?.paidAt ? format(new Date(payment.paidAt), "MMM d, yyyy") : "-"}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openPaymentForm(row, payment)}
                          >
                            {payment ? "Update" : "Record"}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={payoutPdfRef}>
          <PdfTemplate
            title="Gold Payouts"
            subtitle={`${format(windowStartDate, "yyyy-MM-dd")} to ${format(windowEndDate, "yyyy-MM-dd")}`}
            meta={[
              { label: "Pay window", value: `${payoutWindowWeeks} weeks` },
              { label: "Total workers", value: String(payoutDetails.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Employee</th>
                  <th className="py-2">Earned Period</th>
                  <th className="py-2">Gold Due (g)</th>
                  <th className="py-2">Due Date</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {payoutDetails.map((row) => {
                  const periodStart = row.earliestDate ? format(row.earliestDate, "yyyy-MM-dd") : ""
                  const periodEnd = row.latestDate ? format(row.latestDate, "yyyy-MM-dd") : ""
                  const key = `${row.id}|${periodStart}|${periodEnd}`
                  const payment = paymentMap.get(key)
                  const dueDate = payment?.dueDate ? payment.dueDate.slice(0, 10) : periodEnd

                  return (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2">
                        <div className="font-semibold">{row.name}</div>
                        <div className="text-[10px] text-gray-500">{row.employeeId}</div>
                      </td>
                      <td className="py-2">
                        {row.earliestDate && row.latestDate
                          ? row.earliestDate.toDateString() === row.latestDate.toDateString()
                            ? format(row.earliestDate, "MMM d, yyyy")
                            : `${format(row.earliestDate, "MMM d, yyyy")} - ${format(
                                row.latestDate,
                                "MMM d, yyyy",
                              )}`
                          : "-"}
                      </td>
                      <td className="py-2">{row.total.toFixed(3)}</td>
                      <td className="py-2">{dueDate || "-"}</td>
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
