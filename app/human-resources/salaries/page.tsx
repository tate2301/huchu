"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { ArrowRight } from "@/lib/icons"
import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchDisbursementBatches,
  fetchEmployeePayments,
  fetchPayrollPeriods,
  fetchPayrollRuns,
} from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function HrSalariesPage() {
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

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Salary Periods</CardTitle>
          <CardDescription>
            Auto-generated and manual periods remain editable until they are closed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {periodsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : upcomingPeriods.length === 0 ? (
            <div className="text-sm text-muted-foreground">No upcoming salary periods.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingPeriods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">{period.periodKey}</TableCell>
                      <TableCell>
                        {format(new Date(period.startDate), "yyyy-MM-dd")} to{" "}
                        {format(new Date(period.endDate), "yyyy-MM-dd")}
                      </TableCell>
                      <TableCell>{format(new Date(period.dueDate), "yyyy-MM-dd")}</TableCell>
                      <TableCell>
                        <Badge variant={period.status === "APPROVED" ? "secondary" : "outline"}>
                          {period.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={period.isAutoGenerated ? "secondary" : "outline"}>
                          {period.isAutoGenerated ? "Auto" : "Manual"}
                        </Badge>
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
          <CardTitle>Approved Salary Runs Awaiting Disbursement</CardTitle>
          <CardDescription>
            After run approval, move immediately to disbursement to complete payout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading || batchesLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : runsAwaitingDisbursement.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No approved salary runs are waiting for disbursement.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Net Total</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runsAwaitingDisbursement.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">Run #{run.runNumber}</TableCell>
                      <TableCell>{run.period.periodKey}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{run.status}</Badge>
                      </TableCell>
                      <TableCell>{run.netTotal.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm">
                          <Link href={`/human-resources/disbursements?runId=${run.id}`}>
                            Disburse
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
          <CardTitle>Paid Salary Batch History</CardTitle>
          <CardDescription>
            Batch-level salary disbursements that are fully paid and archived.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : paidSalaryBatches.length === 0 ? (
            <div className="text-sm text-muted-foreground">No paid salary batches yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Run</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid At</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paidSalaryBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.code}</TableCell>
                      <TableCell>Run #{batch.payrollRun.runNumber}</TableCell>
                      <TableCell>{batch.payrollRun.period?.periodKey ?? "-"}</TableCell>
                      <TableCell>{batch.totalAmount.toFixed(2)}</TableCell>
                      <TableCell>
                        {batch.paidAt ? format(new Date(batch.paidAt), "yyyy-MM-dd HH:mm") : "-"}
                      </TableCell>
                      <TableCell>{batch.itemCount}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/human-resources/disbursements?batchId=${batch.id}`}>
                            View Batch
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
          <CardTitle>Recent Paid Salary Lines</CardTitle>
          <CardDescription>
            Employee-level salary payments from approved and paid disbursement batches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paidPaymentsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : recentPaidLines.length === 0 ? (
            <div className="text-sm text-muted-foreground">No paid salary line history yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Run</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid Amount</TableHead>
                    <TableHead>Paid At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPaidLines.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div className="font-medium">{payment.employee.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {payment.employee.employeeId}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(payment.periodStart), "yyyy-MM-dd")} to{" "}
                        {format(new Date(payment.periodEnd), "yyyy-MM-dd")}
                      </TableCell>
                      <TableCell>
                        {payment.payrollRun ? `#${payment.payrollRun.runNumber}` : "-"}
                      </TableCell>
                      <TableCell>{payment.disbursementBatch?.code ?? "-"}</TableCell>
                      <TableCell>
                        {payment.unit} {payment.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {payment.unit} {(payment.paidAmount ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {payment.paidAt
                          ? format(new Date(payment.paidAt), "yyyy-MM-dd HH:mm")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </HrShell>
  )
}
