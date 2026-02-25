"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useQuery } from "@tanstack/react-query"
import { differenceInCalendarDays, format } from "date-fns"
import { ArrowRight, FileText } from "@/lib/icons"
import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { NumericCell } from "@/components/ui/numeric-cell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchEmployeePayments, type EmployeePayment } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"

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
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  })

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

  const columns = useMemo<ColumnDef<RowView>[]>(
    () => [
      {
        id: "employee",
        header: "Employee",
        accessorFn: (row) => `${row.employee.name} ${row.employee.employeeId}`,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.employee.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.employee.employeeId}</div>
          </div>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "period",
        header: "Period",
        accessorFn: (row) => `${row.periodStart} ${row.periodEnd}`,
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.periodStart), "yyyy-MM-dd")} to{" "}
            {format(new Date(row.original.periodEnd), "yyyy-MM-dd")}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "dueDate",
        header: "Due Date",
        accessorFn: (row) => row.dueDate,
        cell: ({ row }) => (
          <div>
            <NumericCell align="left">{format(new Date(row.original.dueDate), "yyyy-MM-dd")}</NumericCell>
            {row.original.isOverdue ? (
              <div className="text-xs text-red-600">{row.original.overdueDays}d overdue</div>
            ) : null}
          </div>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "PARTIAL" ? "warning" : "neutral"}>
            {row.original.status}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "amount",
        header: "Amount",
        accessorFn: (row) => row.amount,
        cell: ({ row }) => <NumericCell>{toCurrency(row.original.amount, row.original.unit)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "paid",
        header: "Paid",
        accessorFn: (row) => row.paidAmount ?? 0,
        cell: ({ row }) => (
          <NumericCell>{toCurrency(row.original.paidAmount ?? 0, row.original.unit)}</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "outstanding",
        header: "Outstanding",
        accessorFn: (row) => row.outstandingAmount,
        cell: ({ row }) => (
          <NumericCell className="font-semibold">
            {toCurrency(row.original.outstandingAmount, row.original.unit)}
          </NumericCell>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "source",
        header: "Source",
        accessorFn: (row) =>
          row.disbursementBatch
            ? `Batch ${row.disbursementBatch.code}`
            : row.payrollRun
              ? `Run #${row.payrollRun.runNumber}`
              : "Manual",
        cell: ({ row }) =>
          row.original.disbursementBatch
            ? `Batch ${row.original.disbursementBatch.code}`
            : row.original.payrollRun
              ? `Run #${row.original.payrollRun.runNumber}`
              : "Manual",
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "action",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <Button size="sm" variant="outline" onClick={() => setDetailsId(row.original.id)}>
              <FileText className="size-4" />
              Details
            </Button>
          </div>
        ),
        size: 108,
        minSize: 108,
        maxSize: 108},
    ],
    [],
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

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Outstanding Salary Lines
          </h2>
          <p className="text-sm text-muted-foreground">
            Each row is an unpaid or partially paid salary obligation.
          </p>
        </header>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : filteredRows.length === 0 ? (
          <div className="section-shell text-sm text-muted-foreground">
            No outstanding salary items for current filters.
          </div>
        ) : (
          <DataTable
            data={filteredRows}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search employee, period, or source"
            tableClassName="text-sm"
            toolbar={
              <>
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger size="sm" className="h-8 w-[220px]">
                    <SelectValue placeholder="Employee" />
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
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger size="sm" className="h-8 w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Due + Partial</SelectItem>
                    <SelectItem value="DUE">Due only</SelectItem>
                    <SelectItem value="PARTIAL">Partial only</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dueStart}
                  onChange={(event) => setDueStart(event.target.value)}
                  className="h-8 w-[170px]"
                />
                <Input
                  type="date"
                  value={dueEnd}
                  onChange={(event) => setDueEnd(event.target.value)}
                  className="h-8 w-[170px]"
                />
              </>
            }
          />
        )}
      </section>

      <Dialog open={Boolean(detailsId)} onOpenChange={(open) => !open && setDetailsId(null)}>
        <DialogContent size="lg">
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
                  <div className="font-medium font-mono">{toCurrency(selected.amount, selected.unit)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Paid</div>
                  <div className="font-medium font-mono">{toCurrency(selected.paidAmount ?? 0, selected.unit)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Outstanding</div>
                  <div className="font-medium font-mono">{toCurrency(selected.outstandingAmount, selected.unit)}</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-muted-foreground">Period Start</div>
                  <div className="font-mono">{format(new Date(selected.periodStart), "yyyy-MM-dd")}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Period End</div>
                  <div className="font-mono">{format(new Date(selected.periodEnd), "yyyy-MM-dd")}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Due Date</div>
                  <div className="font-mono">{format(new Date(selected.dueDate), "yyyy-MM-dd")}</div>
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
                    <Link href={`/human-resources/payroll/salary?runId=${selected.payrollRun.id}`}>Open Run</Link>
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
