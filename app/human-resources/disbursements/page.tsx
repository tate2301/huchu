"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { ArrowRight, FileText, Plus } from "@/lib/icons"
import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { fetchDisbursementBatches, fetchPayrollRuns, type PayrollRunRecord } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type BatchForm = {
  payrollRunId: string
  goldRatePerUnit: string
  goldRateUnit: string
  cashCustodian: string
  cashIssuedAt: string
  notes: string
}

type BatchDetails = {
  id: string
  code: string
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED"
  totalAmount: number
  itemCount: number
  notes?: string | null
  payrollRun: {
    id: string
    runNumber: number
    domain: "PAYROLL" | "GOLD_PAYOUT"
    period: {
      id: string
      periodKey: string
      startDate: string
      endDate: string
      dueDate: string
    }
  }
  items: Array<{
    id: string
    amount: number
    paidAmount?: number | null
    status: "DUE" | "PARTIAL" | "PAID"
    paidAt?: string | null
    receiptReference?: string | null
    notes?: string | null
    employee: { id: string; employeeId: string; name: string }
    lineItem: {
      id: string
      baseAmount: number
      variableAmount: number
      allowancesTotal: number
      deductionsTotal: number
      netAmount: number
      currency: string
    }
  }>
}

const emptyBatchForm: BatchForm = {
  payrollRunId: "",
  goldRatePerUnit: "",
  goldRateUnit: "g",
  cashCustodian: "",
  cashIssuedAt: format(new Date(), "yyyy-MM-dd"),
  notes: "",
}

function parseAppliedRate(notes?: string | null) {
  if (!notes) return null
  const match = notes.match(/disbursement rate applied:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([^\s.]+)/i)
  if (!match) return null
  const rate = Number(match[1])
  if (!Number.isFinite(rate) || rate <= 0) return null
  return { rate, unit: match[2] }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function hydrateFormFromRun(run: PayrollRunRecord | undefined, current: BatchForm): BatchForm {
  if (!run) return current
  if (run.domain === "GOLD_PAYOUT") {
    return {
      ...current,
      payrollRunId: run.id,
      goldRatePerUnit: run.goldRatePerUnit ? String(run.goldRatePerUnit) : "",
      goldRateUnit: run.goldRateUnit || "g",
    }
  }
  return {
    ...current,
    payrollRunId: run.id,
    goldRatePerUnit: "",
    goldRateUnit: "g",
  }
}

export default function DisbursementsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const runIdFromQuery = searchParams.get("runId")
  const batchIdFromQuery = searchParams.get("batchId")

  const [batchForm, setBatchForm] = useState<BatchForm>({
    ...emptyBatchForm,
    payrollRunId: runIdFromQuery ?? "",
  })
  const [isCreateOpen, setIsCreateOpen] = useState(Boolean(runIdFromQuery))
  const [detailsBatchId, setDetailsBatchId] = useState<string | null>(batchIdFromQuery)

  const { data: runsData, isLoading: runsLoading, error: runsError } = useQuery({
    queryKey: ["payroll-runs", "approved-for-disbursement"],
    queryFn: () => fetchPayrollRuns({ status: "APPROVED", limit: 500 }),
  })
  const { data: batchesData, isLoading: batchesLoading, error: batchesError } = useQuery({
    queryKey: ["disbursement-batches"],
    queryFn: () => fetchDisbursementBatches({ limit: 500 }),
  })

  const approvedRuns = useMemo(() => runsData?.data ?? [], [runsData])
  const batches = useMemo(() => batchesData?.data ?? [], [batchesData])

  const blockedRunIds = useMemo(
    () =>
      new Set(
        batches
          .filter((batch) => batch.status !== "REJECTED")
          .map((batch) => batch.payrollRunId),
      ),
    [batches],
  )
  const availableRuns = useMemo(
    () => approvedRuns.filter((run) => !blockedRunIds.has(run.id)),
    [approvedRuns, blockedRunIds],
  )

  const selectedRun = useMemo(
    () => availableRuns.find((run) => run.id === batchForm.payrollRunId),
    [availableRuns, batchForm.payrollRunId],
  )
  const isGoldSelection = selectedRun?.domain === "GOLD_PAYOUT"

  const previewAmount = useMemo(() => {
    if (!selectedRun) return 0
    if (selectedRun.domain !== "GOLD_PAYOUT") return selectedRun.netTotal
    const currentRate = Number(
      batchForm.goldRatePerUnit ||
        (selectedRun.goldRatePerUnit ? String(selectedRun.goldRatePerUnit) : ""),
    )
    if (!Number.isFinite(currentRate) || currentRate <= 0) return selectedRun.netTotal
    if (selectedRun.goldRatePerUnit && selectedRun.goldRatePerUnit > 0) {
      const estimatedWeight = selectedRun.netTotal / selectedRun.goldRatePerUnit
      return roundMoney(estimatedWeight * currentRate)
    }
    return selectedRun.netTotal
  }, [selectedRun, batchForm.goldRatePerUnit])

  const {
    data: batchDetails,
    isLoading: batchDetailsLoading,
    error: batchDetailsError,
  } = useQuery({
    queryKey: ["disbursement-batch-details", detailsBatchId],
    queryFn: () => fetchJson<BatchDetails>(`/api/disbursements/batches/${detailsBatchId}`),
    enabled: Boolean(detailsBatchId),
  })

  const createBatchMutation = useMutation({
    mutationFn: async (payload: BatchForm) => {
      const run = availableRuns.find((item) => item.id === payload.payrollRunId)
      if (!run) throw new Error("Selected run is unavailable")

      const body: Record<string, unknown> = {
        payrollRunId: payload.payrollRunId,
        cashCustodian: payload.cashCustodian || undefined,
        cashIssuedAt: payload.cashIssuedAt || undefined,
        notes: payload.notes || undefined,
      }
      if (run.domain === "GOLD_PAYOUT") {
        body.goldRatePerUnit = Number(payload.goldRatePerUnit)
        body.goldRateUnit = payload.goldRateUnit || "g"
      }

      return fetchJson("/api/disbursements/batches", {
        method: "POST",
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      toast({
        title: "Disbursement batch created",
        description: "Batch is ready for submit and approval.",
        variant: "success",
      })
      setIsCreateOpen(false)
      setBatchForm(emptyBatchForm)
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] })
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to create batch",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const submitBatchMutation = useMutation({
    mutationFn: async (batchId: string) =>
      fetchJson(`/api/disbursements/batches/${batchId}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Batch submitted",
        description: "Disbursement batch sent for approval.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to submit batch",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const approveBatchMutation = useMutation({
    mutationFn: async (batchId: string) =>
      fetchJson(`/api/disbursements/batches/${batchId}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Batch approved",
        description: "Run archived and batch ready for payout recording.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] })
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to approve batch",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const markPaidMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const batch = await fetchJson<{
        id: string
        items: Array<{ id: string }>
      }>(`/api/disbursements/batches/${batchId}`)

      return fetchJson(`/api/disbursements/batches/${batchId}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          items: batch.items.map((item) => ({ id: item.id })),
        }),
      })
    },
    onSuccess: () => {
      toast({
        title: "Batch payment recorded",
        description: "All disbursement items marked and synced to employee payments.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] })
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] })
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to record payment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  return (
    <HrShell
      activeTab="disbursements"
      description="Cash disbursement batches from approved salary and gold payout runs."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/human-resources/salaries/outstanding">
            Outstanding Salaries
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      {(runsError || batchesError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load disbursement data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(runsError || batchesError)}</AlertDescription>
        </Alert>
      )}

      {runIdFromQuery && !selectedRun && (
        <Alert>
          <AlertTitle>Selected run is unavailable</AlertTitle>
          <AlertDescription>
            The run from the link is no longer eligible for a new disbursement batch.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Step 1 - Pick Approved Pay Run</CardTitle>
              <CardDescription>
                Salary and gold payout runs are disbursed from one workflow.
              </CardDescription>
            </div>
            <Button type="button" onClick={() => setIsCreateOpen(true)} disabled={availableRuns.length === 0}>
              <Plus className="size-4" />
              New Disbursement Batch
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : availableRuns.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No approved payroll runs available for new disbursement batches.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Approved Rate</TableHead>
                    <TableHead>Net Total</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">Run #{run.runNumber}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {run.domain === "GOLD_PAYOUT" ? "Gold Payout" : "Salary Payroll"}
                        </Badge>
                      </TableCell>
                      <TableCell>{run.period.periodKey}</TableCell>
                      <TableCell>
                        {run.domain === "GOLD_PAYOUT" && run.goldRatePerUnit
                          ? `${run.goldRatePerUnit.toFixed(4)} / ${run.goldRateUnit}`
                          : "-"}
                      </TableCell>
                      <TableCell>{run.netTotal.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => {
                            setBatchForm((prev) => hydrateFormFromRun(run, prev))
                            setIsCreateOpen(true)
                          }}
                        >
                          Create Batch
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
          <CardTitle>Step 2 - Submit, Approve, and Mark Paid</CardTitle>
          <CardDescription>
            Once a disbursement batch is approved, the underlying payroll run is archived.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : batches.length === 0 ? (
            <div className="text-sm text-muted-foreground">No disbursement batches yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Run</TableHead>
                    <TableHead>Applied Rate</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => {
                    const parsedRate = parseAppliedRate(batch.notes)
                    const isGold = batch.payrollRun.domain === "GOLD_PAYOUT"
                    return (
                      <TableRow key={batch.id} className="border-b">
                        <TableCell>
                          <div className="font-semibold">{batch.code}</div>
                          <div className="text-xs text-muted-foreground">{batch.method}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {isGold ? "Gold Payout" : "Salary Payroll"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>Run #{batch.payrollRun.runNumber}</div>
                          <div className="text-xs text-muted-foreground">
                            {batch.payrollRun.period?.periodKey ?? "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isGold
                            ? parsedRate
                              ? `${parsedRate.rate.toFixed(4)} / ${parsedRate.unit}`
                              : batch.payrollRun.goldRatePerUnit
                                ? `${batch.payrollRun.goldRatePerUnit.toFixed(4)} / ${batch.payrollRun.goldRateUnit}`
                                : "-"
                            : "-"}
                        </TableCell>
                        <TableCell>{batch.totalAmount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={batch.status === "PAID" ? "secondary" : "outline"}>
                            {batch.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(batch.createdAt), "yyyy-MM-dd HH:mm")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={batch.status !== "DRAFT" || submitBatchMutation.isPending}
                              onClick={() => submitBatchMutation.mutate(batch.id)}
                            >
                              Submit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={batch.status !== "SUBMITTED" || approveBatchMutation.isPending}
                              onClick={() => approveBatchMutation.mutate(batch.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!["APPROVED", "PAID"].includes(batch.status) || markPaidMutation.isPending}
                              onClick={() => markPaidMutation.mutate(batch.id)}
                            >
                              Mark Paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDetailsBatchId(batch.id)}
                            >
                              Details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Disbursement Batch</DialogTitle>
            <DialogDescription>
              Select an approved run and confirm disbursement details.
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!batchForm.payrollRunId) {
                toast({ title: "Select an approved run", variant: "destructive" })
                return
              }
              if (isGoldSelection) {
                const rate = Number(
                  batchForm.goldRatePerUnit ||
                    (selectedRun?.goldRatePerUnit ? String(selectedRun.goldRatePerUnit) : ""),
                )
                if (!Number.isFinite(rate) || rate <= 0) {
                  toast({ title: "Enter a valid current gold rate", variant: "destructive" })
                  return
                }
                createBatchMutation.mutate({
                  ...batchForm,
                  goldRatePerUnit: String(rate),
                  goldRateUnit: batchForm.goldRateUnit || selectedRun?.goldRateUnit || "g",
                })
                return
              }
              createBatchMutation.mutate(batchForm)
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-semibold">Approved Payroll Run</label>
              <Select
                value={batchForm.payrollRunId}
                onValueChange={(value) => {
                  const run = availableRuns.find((item) => item.id === value)
                  setBatchForm((prev) => hydrateFormFromRun(run, prev))
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select approved run" />
                </SelectTrigger>
                <SelectContent>
                  {availableRuns.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No approved runs
                    </SelectItem>
                  ) : (
                    availableRuns.map((run) => (
                      <SelectItem key={run.id} value={run.id}>
                        {run.domain === "GOLD_PAYOUT" ? "Gold" : "Salary"} - Run #{run.runNumber} ({run.period.periodKey})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {isGoldSelection && (
              <div className="grid gap-3 md:grid-cols-[1fr,140px]">
                <div>
                  <label htmlFor="disbursement-rate" className="mb-2 block text-sm font-semibold">
                    Current Gold Rate
                  </label>
                  <Input
                    id="disbursement-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={batchForm.goldRatePerUnit}
                    onChange={(event) =>
                      setBatchForm((prev) => ({ ...prev, goldRatePerUnit: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Rate Unit</label>
                  <Select
                    value={batchForm.goldRateUnit}
                    onValueChange={(value) => setBatchForm((prev) => ({ ...prev, goldRateUnit: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="cash-custodian" className="mb-2 block text-sm font-semibold">
                  Cash Custodian
                </label>
                <Input
                  id="cash-custodian"
                  value={batchForm.cashCustodian}
                  onChange={(event) =>
                    setBatchForm((prev) => ({ ...prev, cashCustodian: event.target.value }))
                  }
                  placeholder="Name of custodian"
                />
              </div>
              <div>
                <label htmlFor="cash-issued" className="mb-2 block text-sm font-semibold">
                  Cash Issued Date
                </label>
                <Input
                  id="cash-issued"
                  type="date"
                  value={batchForm.cashIssuedAt}
                  onChange={(event) =>
                    setBatchForm((prev) => ({ ...prev, cashIssuedAt: event.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <label htmlFor="batch-notes" className="mb-2 block text-sm font-semibold">
                Notes
              </label>
              <Input
                id="batch-notes"
                value={batchForm.notes}
                onChange={(event) => setBatchForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Optional note"
              />
            </div>

            {selectedRun ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <div className="font-medium">Preview</div>
                <div className="text-muted-foreground">
                  {selectedRun.domain === "GOLD_PAYOUT" ? "Gold payout" : "Salary payroll"} run #{selectedRun.runNumber} ({selectedRun.period.periodKey})
                </div>
                <div className="mt-1">Estimated batch amount: {previewAmount.toFixed(2)}</div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createBatchMutation.isPending}>
                <FileText className="size-4" />
                Create Batch
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailsBatchId)} onOpenChange={(open) => !open && setDetailsBatchId(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Disbursement Batch Details</DialogTitle>
            <DialogDescription>
              Review exactly who is being paid and how much in this batch.
            </DialogDescription>
          </DialogHeader>

          {batchDetailsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : batchDetailsError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load batch details</AlertTitle>
              <AlertDescription>{getApiErrorMessage(batchDetailsError)}</AlertDescription>
            </Alert>
          ) : !batchDetails ? (
            <div className="text-sm text-muted-foreground">No details available.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Batch</div>
                  <div className="font-semibold">{batchDetails.code}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Run</div>
                  <div className="font-semibold">
                    #{batchDetails.payrollRun.runNumber} ({batchDetails.payrollRun.period.periodKey})
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Total Amount</div>
                  <div className="font-semibold">{batchDetails.totalAmount.toFixed(2)}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Items</div>
                  <div className="font-semibold">{batchDetails.itemCount}</div>
                </div>
              </div>

              <div className="max-h-[45dvh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="bg-muted sticky top-0">
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid At</TableHead>
                      <TableHead>Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchDetails.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.employee.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.employee.employeeId}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.lineItem.currency} {item.amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {item.lineItem.currency} {(item.paidAmount ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.status === "PAID" ? "secondary" : "outline"}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.paidAt ? format(new Date(item.paidAt), "yyyy-MM-dd HH:mm") : "-"}
                        </TableCell>
                        <TableCell>{item.receiptReference ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </HrShell>
  )
}
