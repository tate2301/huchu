"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { ArrowRight } from "@/lib/icons"
import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table"
import { NumericCell } from "@/components/ui/numeric-cell"
import { Skeleton } from "@/components/ui/skeleton"
import { VerticalDataViews } from "@/components/ui/vertical-data-views"
import {
  type DisbursementBatchRecord,
  type EmployeePayment,
  type PayrollPeriodRecord,
  type PayrollRunRecord,
  fetchDisbursementBatches,
  fetchEmployeePayments,
  fetchPayrollPeriods,
  fetchPayrollRuns,
} from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"

export default function HrSalariesPage() {
  const [activeView, setActiveView] = useState<"periods" | "awaiting" | "batches" | "lines">("periods")
  const [periodsQuery, setPeriodsQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  })
  const [awaitingQuery, setAwaitingQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  })
  const [batchesQuery, setBatchesQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  })
  const [linesQuery, setLinesQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  })
  const { data: periodsData, isLoading: periodsLoading, error: periodsError } = useQuery({
    queryKey: ["payroll-periods", "salary-ops"],
    queryFn: () => fetchPayrollPeriods({ domain: "PAYROLL", limit: 200 }),
  })

  const { data: runsData, isLoading: runsLoading, error: runsError } = useQuery({
    queryKey: ["payroll-runs", "salary-approved"],
    queryFn: () => fetchPayrollRuns({ domain: "PAYROLL", status: "APPROVED", limit: 200 }),
  })

  const { data: batchesData, isLoading: batchesLoading, error: batchesError } = useQuery({
    queryKey: ["disbursement-batches", "salary-ops"],
    queryFn: () => fetchDisbursementBatches({ limit: 500 }),
  })

  const { data: paidPaymentsData, isLoading: paidPaymentsLoading, error: paidPaymentsError } =
    useQuery({
      queryKey: ["employee-payments", "salary-paid"],
      queryFn: () => fetchEmployeePayments({ type: "SALARY", status: "PAID", limit: 1000 }),
    })

  const periods = useMemo(() => periodsData?.data ?? [], [periodsData])
  const approvedRuns = useMemo(() => runsData?.data ?? [], [runsData])
  const allBatches = useMemo(() => batchesData?.data ?? [], [batchesData])
  const paidPayments = useMemo(() => paidPaymentsData?.data ?? [], [paidPaymentsData])

  const salaryBatches = useMemo(
    () => allBatches.filter((batch) => batch.payrollRun.domain === "PAYROLL"),
    [allBatches],
  )
  const paidSalaryBatches = useMemo(
    () => salaryBatches.filter((batch) => batch.status === "PAID"),
    [salaryBatches],
  )

  const blockedRunIds = useMemo(
    () =>
      new Set(
        salaryBatches
          .filter((batch) => batch.status !== "REJECTED")
          .map((batch) => batch.payrollRunId),
      ),
    [salaryBatches],
  )

  const runsAwaitingDisbursement = useMemo(
    () => approvedRuns.filter((run) => !blockedRunIds.has(run.id)),
    [approvedRuns, blockedRunIds],
  )

  const upcomingPeriods = useMemo(() => {
    const now = new Date()
    return periods
      .filter((period) => new Date(period.endDate) >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 12)
  }, [periods])

  const recentPaidLines = useMemo(
    () =>
      [...paidPayments]
        .sort((a, b) => {
          const left = a.paidAt ? new Date(a.paidAt).getTime() : 0
          const right = b.paidAt ? new Date(b.paidAt).getTime() : 0
          return right - left
        })
        .slice(0, 20),
    [paidPayments],
  )

  const summary = useMemo(() => {
    const paidBatchesTotal = paidSalaryBatches.reduce((sum, batch) => sum + batch.totalAmount, 0)
    const paidLinesTotal = paidPayments.reduce((sum, payment) => sum + (payment.paidAmount ?? 0), 0)
    return {
      upcomingPeriods: upcomingPeriods.length,
      awaitingDisbursement: runsAwaitingDisbursement.length,
      paidBatches: paidSalaryBatches.length,
      paidBatchesTotal,
      paidLinesCount: paidPayments.length,
      paidLinesTotal,
    }
  }, [upcomingPeriods, runsAwaitingDisbursement, paidSalaryBatches, paidPayments])

  const periodColumns = useMemo<ColumnDef<PayrollPeriodRecord>[]>(
    () => [
      {
        id: "period",
        header: "Period",
        accessorKey: "periodKey",
        cell: ({ row }) => <NumericCell align="left">{row.original.periodKey}</NumericCell>,
      },
      {
        id: "window",
        header: "Window",
        accessorFn: (row) => `${row.startDate} ${row.endDate}`,
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.startDate), "yyyy-MM-dd")} to{" "}
            {format(new Date(row.original.endDate), "yyyy-MM-dd")}
          </NumericCell>
        ),
      },
      {
        id: "dueDate",
        header: "Due Date",
        accessorKey: "dueDate",
        cell: ({ row }) => (
          <NumericCell align="left">{format(new Date(row.original.dueDate), "yyyy-MM-dd")}</NumericCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "APPROVED" ? "secondary" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (row) => (row.isAutoGenerated ? "Auto" : "Manual"),
        cell: ({ row }) => (
          <Badge variant={row.original.isAutoGenerated ? "secondary" : "outline"}>
            {row.original.isAutoGenerated ? "Auto" : "Manual"}
          </Badge>
        ),
      },
    ],
    [],
  )

  const awaitingColumns = useMemo<ColumnDef<PayrollRunRecord>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        accessorFn: (row) => row.runNumber,
        cell: ({ row }) => <NumericCell align="left">Run #{row.original.runNumber}</NumericCell>,
      },
      {
        id: "period",
        header: "Period",
        accessorFn: (row) => row.period.periodKey,
        cell: ({ row }) => row.original.period.periodKey,
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
      },
      {
        id: "netTotal",
        header: "Net Total",
        accessorKey: "netTotal",
        cell: ({ row }) => <NumericCell>{row.original.netTotal.toFixed(2)}</NumericCell>,
      },
      {
        id: "action",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <Button asChild size="sm">
              <Link href={`/human-resources/disbursements?runId=${row.original.id}`}>
                Disburse
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [],
  )

  const batchColumns = useMemo<ColumnDef<DisbursementBatchRecord>[]>(
    () => [
      {
        id: "batch",
        header: "Batch",
        accessorKey: "code",
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      {
        id: "run",
        header: "Run",
        accessorFn: (row) => row.payrollRun.runNumber,
        cell: ({ row }) => <NumericCell align="left">Run #{row.original.payrollRun.runNumber}</NumericCell>,
      },
      {
        id: "period",
        header: "Period",
        accessorFn: (row) => row.payrollRun.period?.periodKey ?? "",
        cell: ({ row }) => row.original.payrollRun.period?.periodKey ?? "-",
      },
      {
        id: "amount",
        header: "Amount",
        accessorKey: "totalAmount",
        cell: ({ row }) => <NumericCell>{row.original.totalAmount.toFixed(2)}</NumericCell>,
      },
      {
        id: "paidAt",
        header: "Paid At",
        accessorFn: (row) => row.paidAt ?? "",
        cell: ({ row }) => (
          <NumericCell align="left">
            {row.original.paidAt ? format(new Date(row.original.paidAt), "yyyy-MM-dd HH:mm") : "-"}
          </NumericCell>
        ),
      },
      {
        id: "items",
        header: "Items",
        accessorKey: "itemCount",
        cell: ({ row }) => <NumericCell>{row.original.itemCount}</NumericCell>,
      },
      {
        id: "action",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <Button asChild size="sm" variant="outline">
              <Link href={`/human-resources/disbursements?batchId=${row.original.id}`}>View Batch</Link>
            </Button>
          </div>
        ),
      },
    ],
    [],
  )

  const lineColumns = useMemo<ColumnDef<EmployeePayment>[]>(
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
      },
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
      },
      {
        id: "run",
        header: "Run",
        accessorFn: (row) => row.payrollRun?.runNumber ?? 0,
        cell: ({ row }) => (
          <NumericCell align="left">
            {row.original.payrollRun ? `#${row.original.payrollRun.runNumber}` : "-"}
          </NumericCell>
        ),
      },
      {
        id: "batch",
        header: "Batch",
        accessorFn: (row) => row.disbursementBatch?.code ?? "",
        cell: ({ row }) => row.original.disbursementBatch?.code ?? "-",
      },
      {
        id: "amount",
        header: "Amount",
        accessorFn: (row) => row.amount,
        cell: ({ row }) => <NumericCell>{row.original.unit} {row.original.amount.toFixed(2)}</NumericCell>,
      },
      {
        id: "paidAmount",
        header: "Paid Amount",
        accessorFn: (row) => row.paidAmount ?? 0,
        cell: ({ row }) => (
          <NumericCell>{row.original.unit} {(row.original.paidAmount ?? 0).toFixed(2)}</NumericCell>
        ),
      },
      {
        id: "paidAt",
        header: "Paid At",
        accessorFn: (row) => row.paidAt ?? "",
        cell: ({ row }) => (
          <NumericCell align="left">
            {row.original.paidAt ? format(new Date(row.original.paidAt), "yyyy-MM-dd HH:mm") : "-"}
          </NumericCell>
        ),
      },
    ],
    [],
  )

  return (
    <HrShell
      activeTab="salaries"
      title="Salary Operations"
      description="Upcoming salary periods, approved runs, disbursements, and paid salary history."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/human-resources/payroll/salary">
              Open Salary Payroll
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/human-resources/disbursements">
              Open Disbursements
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/human-resources/salaries/outstanding">
              Outstanding Salaries
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      }
    >
      {(periodsError || runsError || batchesError || paidPaymentsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load salary operations</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(periodsError || runsError || batchesError || paidPaymentsError)}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Upcoming Salary Periods</CardDescription>
            <CardTitle>{summary.upcomingPeriods}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Approved Runs Awaiting Disbursement</CardDescription>
            <CardTitle>{summary.awaitingDisbursement}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Paid Salary Batches</CardDescription>
            <CardTitle>
              {summary.paidBatches} ({summary.paidBatchesTotal.toFixed(2)})
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Paid Salary Lines</CardDescription>
            <CardTitle>{summary.paidLinesCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Paid on Salary Lines</CardDescription>
            <CardTitle>{summary.paidLinesTotal.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <VerticalDataViews
        items={[
          { id: "periods", label: "Upcoming Periods", count: upcomingPeriods.length },
          { id: "awaiting", label: "Awaiting Disbursement", count: runsAwaitingDisbursement.length },
          { id: "batches", label: "Paid Batches", count: paidSalaryBatches.length },
          { id: "lines", label: "Paid Lines", count: recentPaidLines.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "periods" | "awaiting" | "batches" | "lines")}
        railLabel="Salary Views"
      >
        {activeView === "periods" ? (
          <section className="space-y-3">
            <header className="section-shell flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-section-title text-foreground font-bold tracking-tight">
                  Upcoming Salary Periods
                </h2>
                <p className="text-sm text-muted-foreground">
                  Auto-generated and manual periods remain editable until they are closed.
                </p>
              </div>
            </header>
            {periodsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : upcomingPeriods.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">No upcoming salary periods.</div>
            ) : (
              <DataTable
                data={upcomingPeriods}
                columns={periodColumns}
                queryState={periodsQuery}
                onQueryStateChange={(next) => setPeriodsQuery((prev) => ({ ...prev, ...next }))}
                searchPlaceholder="Search periods"
                searchSubmitLabel="Search"
                tableClassName="text-sm"
                pagination={{ enabled: true }}
              />
            )}
          </section>
        ) : null}

        {activeView === "awaiting" ? (
          <section className="space-y-3">
            <header className="section-shell flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-section-title text-foreground font-bold tracking-tight">
                  Approved Salary Runs Awaiting Disbursement
                </h2>
                <p className="text-sm text-muted-foreground">
                  After run approval, move immediately to disbursement to complete payout.
                </p>
              </div>
            </header>
            {runsLoading || batchesLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : runsAwaitingDisbursement.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">
                No approved salary runs are waiting for disbursement.
              </div>
            ) : (
              <DataTable
                data={runsAwaitingDisbursement}
                columns={awaitingColumns}
                queryState={awaitingQuery}
                onQueryStateChange={(next) => setAwaitingQuery((prev) => ({ ...prev, ...next }))}
                searchPlaceholder="Search approved runs"
                searchSubmitLabel="Search"
                tableClassName="text-sm"
                pagination={{ enabled: true }}
              />
            )}
          </section>
        ) : null}

        {activeView === "batches" ? (
          <section className="space-y-3">
            <header className="section-shell flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-section-title text-foreground font-bold tracking-tight">
                  Paid Salary Batch History
                </h2>
                <p className="text-sm text-muted-foreground">
                  Batch-level salary disbursements that are fully paid and archived.
                </p>
              </div>
            </header>
            {batchesLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : paidSalaryBatches.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">No paid salary batches yet.</div>
            ) : (
              <DataTable
                data={paidSalaryBatches}
                columns={batchColumns}
                queryState={batchesQuery}
                onQueryStateChange={(next) => setBatchesQuery((prev) => ({ ...prev, ...next }))}
                searchPlaceholder="Search paid batches"
                searchSubmitLabel="Search"
                tableClassName="text-sm"
                pagination={{ enabled: true }}
              />
            )}
          </section>
        ) : null}

        {activeView === "lines" ? (
          <section className="space-y-3">
            <header className="section-shell flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-section-title text-foreground font-bold tracking-tight">
                  Recent Paid Salary Lines
                </h2>
                <p className="text-sm text-muted-foreground">
                  Employee-level salary payments from approved and paid disbursement batches.
                </p>
              </div>
            </header>
            {paidPaymentsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : recentPaidLines.length === 0 ? (
              <div className="section-shell text-sm text-muted-foreground">No paid salary line history yet.</div>
            ) : (
              <DataTable
                data={recentPaidLines}
                columns={lineColumns}
                queryState={linesQuery}
                onQueryStateChange={(next) => setLinesQuery((prev) => ({ ...prev, ...next }))}
                searchPlaceholder="Search salary line history"
                searchSubmitLabel="Search"
                tableClassName="text-sm"
                pagination={{ enabled: true }}
              />
            )}
          </section>
        ) : null}
      </VerticalDataViews>
    </HrShell>
  )
}
