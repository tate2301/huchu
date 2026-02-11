"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { differenceInCalendarDays, format } from "date-fns"
import { ArrowRight, FileText } from "@/lib/icons"
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
import { fetchEmployeePayments, type EmployeePayment } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type StatusFilter = "ALL" | "DUE" | "PARTIAL"
type RowView = EmployeePayment & {
  outstandingAmount: number
  overdueDays: number
  isOverdue: boolean
}

function toCurrency(value: number, unit: string) {
  if (unit === "MIXED") return `${value.toFixed(2)} (mixed)`
  return `${unit} ${value.toFixed(2)}`
}

export default function OutstandingSalariesPage() {
  const [employeeFilter, setEmployeeFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [dueStart, setDueStart] = useState("")
  const [dueEnd, setDueEnd] = useState("")
  const [detailsId, setDetailsId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["employee-payments", "salary-outstanding-detail"],
    queryFn: () => fetchEmployeePayments({ type: "SALARY", limit: 1000 }),
  })

  const payments = useMemo(() => data?.data ?? [], [data])
  const today = useMemo(() => new Date(), [])

  const outstandingRows = useMemo<RowView[]>(
    () =>
      payments
        .map((payment) => {
          const paid = payment.paidAmount ?? 0
          const outstandingAmount = Math.max(payment.amount - paid, 0)
          const dueDate = new Date(payment.dueDate)
          const overdueDays = outstandingAmount > 0 ? Math.max(differenceInCalendarDays(today, dueDate), 0) : 0
          return {
            ...payment,
            outstandingAmount,
            overdueDays,
            isOverdue: overdueDays > 0,
          }
        })
        .filter((payment) => payment.outstandingAmount > 0),
    [payments, today],
  )

  const employeeOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; employeeId: string }>()
    for (const row of outstandingRows) {
      if (!map.has(row.employee.id)) {
        map.set(row.employee.id, {
          id: row.employee.id,
          name: row.employee.name,
          employeeId: row.employee.employeeId,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [outstandingRows])

  const filteredRows = useMemo(() => {
    const start = dueStart ? new Date(`${dueStart}T00:00:00`) : null
    const end = dueEnd ? new Date(`${dueEnd}T23:59:59`) : null

    return outstandingRows
      .filter((row) => (employeeFilter === "ALL" ? true : row.employeeId === employeeFilter))
      .filter((row) => (statusFilter === "ALL" ? true : row.status === statusFilter))
      .filter((row) => (start ? new Date(row.dueDate) >= start : true))
      .filter((row) => (end ? new Date(row.dueDate) <= end : true))
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
  }, [outstandingRows, employeeFilter, statusFilter, dueStart, dueEnd])

  const totals = useMemo(() => {
    const totalOutstanding = filteredRows.reduce((sum, row) => sum + row.outstandingAmount, 0)
    const overdueOutstanding = filteredRows
      .filter((row) => row.isOverdue)
      .reduce((sum, row) => sum + row.outstandingAmount, 0)
    const employeesAffected = new Set(filteredRows.map((row) => row.employeeId)).size
    const aging = filteredRows.reduce(
      (acc, row) => {
        if (!row.isOverdue) return acc
        if (row.overdueDays <= 30) acc.bucket30 += row.outstandingAmount
        else if (row.overdueDays <= 60) acc.bucket60 += row.outstandingAmount
        else acc.bucket90 += row.outstandingAmount
        return acc
      },
      { bucket30: 0, bucket60: 0, bucket90: 0 },
    )
    return {
      totalOutstanding,
      overdueOutstanding,
      openItems: filteredRows.length,
      employeesAffected,
      ...aging,
    }
  }, [filteredRows])

  const summaryUnit = useMemo(() => {
    const uniqueUnits = Array.from(new Set(filteredRows.map((row) => row.unit)))
    if (uniqueUnits.length === 1) return uniqueUnits[0]
    return "MIXED"
  }, [filteredRows])

  const selected = useMemo(
    () => filteredRows.find((row) => row.id === detailsId) ?? null,
    [filteredRows, detailsId],
  )

  return (
    <HrShell
      activeTab="salary-outstanding"
      title="Outstanding Salaries"
      description="Detailed visibility into unpaid and partially paid salary obligations."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/human-resources/disbursements">
            Open Disbursements
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load outstanding salaries</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Focus the list by employee, status, and due-date window.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-semibold">Employee</label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All employees</SelectItem>
                {employeeOptions.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name} ({employee.employeeId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Status</label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Due + Partial</SelectItem>
                <SelectItem value="DUE">Due only</SelectItem>
                <SelectItem value="PARTIAL">Partial only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="due-start" className="mb-2 block text-sm font-semibold">Due Date From</label>
            <Input id="due-start" type="date" value={dueStart} onChange={(event) => setDueStart(event.target.value)} />
          </div>
          <div>
            <label htmlFor="due-end" className="mb-2 block text-sm font-semibold">Due Date To</label>
            <Input id="due-end" type="date" value={dueEnd} onChange={(event) => setDueEnd(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader>
            <CardDescription>Total Outstanding</CardDescription>
            <CardTitle>{toCurrency(totals.totalOutstanding, summaryUnit)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Overdue Outstanding</CardDescription>
            <CardTitle>{toCurrency(totals.overdueOutstanding, summaryUnit)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Open Salary Items</CardDescription>
            <CardTitle>{totals.openItems}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Employees Affected</CardDescription>
            <CardTitle>{totals.employeesAffected}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Overdue 0-30d</CardDescription>
            <CardTitle>{toCurrency(totals.bucket30, summaryUnit)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Overdue 31d+</CardDescription>
            <CardTitle>{toCurrency(totals.bucket60 + totals.bucket90, summaryUnit)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outstanding Salary Lines</CardTitle>
          <CardDescription>Each row is an unpaid or partially paid salary obligation.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : filteredRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No outstanding salary items for current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.employee.name}</div>
                        <div className="text-xs text-muted-foreground">{row.employee.employeeId}</div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(row.periodStart), "yyyy-MM-dd")} to{" "}
                        {format(new Date(row.periodEnd), "yyyy-MM-dd")}
                      </TableCell>
                      <TableCell>
                        <div>{format(new Date(row.dueDate), "yyyy-MM-dd")}</div>
                        {row.isOverdue ? (
                          <div className="text-xs text-red-600">{row.overdueDays}d overdue</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "PARTIAL" ? "secondary" : "outline"}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>{toCurrency(row.amount, row.unit)}</TableCell>
                      <TableCell>{toCurrency(row.paidAmount ?? 0, row.unit)}</TableCell>
                      <TableCell className="font-semibold">{toCurrency(row.outstandingAmount, row.unit)}</TableCell>
                      <TableCell>
                        {row.disbursementBatch
                          ? `Batch ${row.disbursementBatch.code}`
                          : row.payrollRun
                            ? `Run #${row.payrollRun.runNumber}`
                            : "Manual"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setDetailsId(row.id)}>
                          <FileText className="size-4" />
                          Details
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

      <Dialog open={Boolean(detailsId)} onOpenChange={(open) => !open && setDetailsId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Outstanding Salary Details</DialogTitle>
            <DialogDescription>Audit the source chain and outstanding balance for this line.</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="grid gap-3 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">Employee</div>
                  <div className="font-medium">{selected.employee.name}</div>
                  <div className="text-xs text-muted-foreground">{selected.employee.employeeId}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="font-medium">{selected.status}</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-muted-foreground">Amount</div>
                  <div className="font-medium">{toCurrency(selected.amount, selected.unit)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Paid</div>
                  <div className="font-medium">{toCurrency(selected.paidAmount ?? 0, selected.unit)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Outstanding</div>
                  <div className="font-medium">{toCurrency(selected.outstandingAmount, selected.unit)}</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-muted-foreground">Period Start</div>
                  <div>{format(new Date(selected.periodStart), "yyyy-MM-dd")}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Period End</div>
                  <div>{format(new Date(selected.periodEnd), "yyyy-MM-dd")}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Due Date</div>
                  <div>{format(new Date(selected.dueDate), "yyyy-MM-dd")}</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">Source Payroll Run</div>
                  <div>{selected.payrollRun ? `#${selected.payrollRun.runNumber}` : "Manual"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Disbursement Batch</div>
                  <div>{selected.disbursementBatch ? selected.disbursementBatch.code : "-"}</div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Notes</div>
                <div>{selected.notes || "-"}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                {selected.payrollRun ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/human-resources/payroll?runId=${selected.payrollRun.id}`}>Open Run</Link>
                  </Button>
                ) : null}
                {selected.disbursementBatch ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/human-resources/disbursements?batchId=${selected.disbursementBatch.id}`}>
                      Open Batch
                    </Link>
                  </Button>
                ) : null}
                <Button onClick={() => setDetailsId(null)} size="sm">Close</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </HrShell>
  )
}
