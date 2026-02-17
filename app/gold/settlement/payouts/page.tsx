"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, isAfter, isBefore } from "date-fns";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { Skeleton } from "@/components/ui/skeleton";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { fetchEmployeePayments, fetchGoldShiftAllocations } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import { goldRoutes } from "@/app/gold/routes";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type WorkerPayoutDetail = {
  employeeId: string;
  employeeName: string;
  code: string;
  shareWeight: number;
  status: "DUE" | "PARTIAL" | "PAID";
  dueDate: Date;
  paidAmount: number;
  paidAt?: Date;
};

type ShiftPayoutSummary = {
  allocationId: string;
  date: Date;
  shift: "DAY" | "NIGHT";
  siteName: string;
  siteCode: string;
  payCycleWeeks: number;
  expectedDueDate: Date;
  workerShareWeight: number;
  workerCount: number;
  paidCount: number;
  partialCount: number;
  dueCount: number;
  workers: WorkerPayoutDetail[];
};

function toDateOnly(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return format(date, "yyyy-MM-dd");
}

function findPaymentForShiftWorker(
  payments: Array<{
    employeeId: string;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    status: "DUE" | "PARTIAL" | "PAID";
    paidAmount?: number | null;
    paidAt?: string | null;
  }>,
  employeeId: string,
  allocationDate: Date,
) {
  const allocationKey = toDateOnly(allocationDate);

  const exact = payments.find(
    (payment) =>
      payment.employeeId === employeeId &&
      toDateOnly(payment.periodStart) === allocationKey &&
      toDateOnly(payment.periodEnd) === allocationKey,
  );

  if (exact) return exact;

  return payments.find((payment) => {
    if (payment.employeeId !== employeeId) return false;
    const start = new Date(payment.periodStart);
    const end = new Date(payment.periodEnd);
    return !isBefore(allocationDate, start) && !isAfter(allocationDate, end);
  });
}

export default function GoldSettlementPayoutsPage() {
  const [payoutWindowWeeks, setPayoutWindowWeeks] = useState("2");
  const [selectedShift, setSelectedShift] = useState<ShiftPayoutSummary | null>(
    null,
  );
  const payoutTableRef = useRef<HTMLDivElement>(null);

  const windowWeeks = Number(payoutWindowWeeks);

  const windowStartDate = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - windowWeeks * 7);
    return start;
  }, [windowWeeks]);

  const windowEndDate = new Date();

  const {
    data: shiftAllocationsData,
    isLoading: allocationsLoading,
    error: allocationsError,
  } = useQuery({
    queryKey: [
      "gold-shift-allocations",
      "gold-payout-shifts",
      payoutWindowWeeks,
    ],
    queryFn: () =>
      fetchGoldShiftAllocations({
        startDate: windowStartDate.toISOString().slice(0, 10),
        limit: 500,
      }),
  });

  const {
    data: paymentsData,
    isLoading: paymentsLoading,
    error: paymentsError,
  } = useQuery({
    queryKey: ["employee-payments", "gold", "by-shift", payoutWindowWeeks],
    queryFn: () =>
      fetchEmployeePayments({
        type: "GOLD",
        startDate: windowStartDate.toISOString(),
        limit: 1000,
      }),
  });

  const shiftAllocations = useMemo(
    () => shiftAllocationsData?.data ?? [],
    [shiftAllocationsData],
  );

  const goldPayments = useMemo(() => paymentsData?.data ?? [], [paymentsData]);

  const shiftPayouts = useMemo<ShiftPayoutSummary[]>(() => {
    return shiftAllocations
      .filter((allocation) => allocation.payCycleWeeks === windowWeeks)
      .map((allocation) => {
        const allocationDate = new Date(allocation.date);
        const expectedDueDate = addDays(
          allocationDate,
          allocation.payCycleWeeks * 7,
        );

        const workers = allocation.workerShares.map((share) => {
          const payment = findPaymentForShiftWorker(
            goldPayments,
            share.employee.id,
            allocationDate,
          );

          return {
            employeeId: share.employee.id,
            employeeName: share.employee.name,
            code: share.employee.employeeId,
            shareWeight: share.shareWeight,
            status: payment?.status ?? "DUE",
            dueDate: payment ? new Date(payment.dueDate) : expectedDueDate,
            paidAmount: payment?.paidAmount ?? 0,
            paidAt: payment?.paidAt ? new Date(payment.paidAt) : undefined,
          } satisfies WorkerPayoutDetail;
        });

        const paidCount = workers.filter(
          (worker) => worker.status === "PAID",
        ).length;
        const partialCount = workers.filter(
          (worker) => worker.status === "PARTIAL",
        ).length;
        const dueCount = workers.length - paidCount - partialCount;

        return {
          allocationId: allocation.id,
          date: allocationDate,
          shift: allocation.shift,
          siteName: allocation.site.name,
          siteCode: allocation.site.code,
          payCycleWeeks: allocation.payCycleWeeks,
          expectedDueDate,
          workerShareWeight: allocation.workerShareWeight,
          workerCount: workers.length,
          paidCount,
          partialCount,
          dueCount,
          workers,
        } satisfies ShiftPayoutSummary;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [goldPayments, shiftAllocations, windowWeeks]);

  const totalWorkerGold = useMemo(
    () => shiftPayouts.reduce((sum, shift) => sum + shift.workerShareWeight, 0),
    [shiftPayouts],
  );

  const totalWorkers = useMemo(
    () => shiftPayouts.reduce((sum, shift) => sum + shift.workerCount, 0),
    [shiftPayouts],
  );

  const isLoading = allocationsLoading || paymentsLoading;

  const handleExportPdf = () => {
    if (!payoutTableRef.current) return;
    exportElementToPdf(
      payoutTableRef.current,
      `gold-shift-payouts-${payoutWindowWeeks}-weeks.pdf`,
    );
  };

  return (
    <GoldShell
      activeTab="settlement"
      title="Payouts"
      description="Shift-based worker payout schedule"
      actions={
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/human-resources/payouts">Manage payouts in HR</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={goldRoutes.settlement.receipts}>Back to Sales</Link>
          </Button>
        </div>
      }
    >
      <PageIntro
        title="Shift Payout Queue"
        purpose="See each gold shift, expected payout timing, and who is paid from that shift."
        nextStep="Open View Members to inspect shift members without leaving this page."
      />

      {allocationsError || paymentsError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(allocationsError || paymentsError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Payout Window</CardTitle>
              <CardDescription>
                Review allocations and due timing by shift.
              </CardDescription>
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
                onClick={handleExportPdf}
                disabled={isLoading || shiftPayouts.length === 0}
              >
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  Shifts in window
                </div>
                <div className="text-lg font-semibold">
                  {shiftPayouts.length}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  Worker slots
                </div>
                <div className="text-lg font-semibold">{totalWorkers}</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  Gold for workers
                </div>
                <div className="text-lg font-semibold">
                  {totalWorkerGold.toFixed(3)} g
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift Payout Schedule</CardTitle>
          <CardDescription>
            Each row is one attendance-linked shift allocation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : shiftPayouts.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No shift payouts recorded for this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="text-left p-3 font-semibold">
                      Shift
                    </TableHead>
                    <TableHead className="text-left p-3 font-semibold">
                      Site
                    </TableHead>
                    <TableHead className="text-left p-3 font-semibold">
                      Workers
                    </TableHead>
                    <TableHead className="text-left p-3 font-semibold">
                      Worker Gold (g)
                    </TableHead>
                    <TableHead className="text-left p-3 font-semibold">
                      Pay Cycle
                    </TableHead>
                    <TableHead className="text-left p-3 font-semibold">
                      Expected Due
                    </TableHead>
                    <TableHead className="text-left p-3 font-semibold">
                      Payment Progress
                    </TableHead>
                    <TableHead className="text-right p-3 font-semibold">
                      Members
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftPayouts.map((shift) => (
                    <TableRow key={shift.allocationId} className="border-b">
                      <TableCell className="p-3">
                        <div className="font-semibold">
                          {format(shift.date, "MMM d, yyyy")} ({shift.shift})
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Allocation {shift.allocationId.slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="font-semibold">{shift.siteName}</div>
                        <div className="text-xs text-muted-foreground">
                          {shift.siteCode}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">{shift.workerCount}</TableCell>
                      <TableCell className="p-3">
                        <Badge variant="secondary">
                          {shift.workerShareWeight.toFixed(3)} g
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3">
                        {shift.payCycleWeeks} weeks
                      </TableCell>
                      <TableCell className="p-3">
                        {format(shift.expectedDueDate, "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            Paid {shift.paidCount}
                          </Badge>
                          {shift.partialCount > 0 ? (
                            <Badge variant="outline">
                              Partial {shift.partialCount}
                            </Badge>
                          ) : null}
                          {shift.dueCount > 0 ? (
                            <Badge variant="outline">
                              Due {shift.dueCount}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedShift(shift)}
                        >
                          View Members
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

      <Dialog
        open={Boolean(selectedShift)}
        onOpenChange={(open) => {
          if (!open) setSelectedShift(null);
        }}
      >
        <DialogContent size="full" className="max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>
              Shift Members
              {selectedShift
                ? ` - ${format(selectedShift.date, "MMM d, yyyy")} (${selectedShift.shift})`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Worker payout table for this shift allocation.
            </DialogDescription>
          </DialogHeader>
          {selectedShift ? (
            <div className="space-y-3">
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <div>
                  Site:{" "}
                  <span className="font-semibold text-foreground">
                    {selectedShift.siteCode}
                  </span>
                </div>
                <div>
                  Workers:{" "}
                  <span className="font-semibold text-foreground">
                    {selectedShift.workerCount}
                  </span>
                </div>
                <div>
                  Worker gold:{" "}
                  <span className="font-semibold text-foreground">
                    {selectedShift.workerShareWeight.toFixed(3)} g
                  </span>
                </div>
                <div>
                  Expected due:{" "}
                  <span className="font-semibold text-foreground">
                    {format(selectedShift.expectedDueDate, "MMM d, yyyy")}
                  </span>
                </div>
              </div>

              <div className="max-h-[60dvh] overflow-auto rounded-md border border-border">
                <Table className="w-full text-sm">
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead className="p-2 text-left font-semibold">
                        Worker
                      </TableHead>
                      <TableHead className="p-2 text-left font-semibold">
                        Share (g)
                      </TableHead>
                      <TableHead className="p-2 text-left font-semibold">
                        Due
                      </TableHead>
                      <TableHead className="p-2 text-left font-semibold">
                        Status
                      </TableHead>
                      <TableHead className="p-2 text-left font-semibold">
                        Paid
                      </TableHead>
                      <TableHead className="p-2 text-left font-semibold">
                        Paid Date
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedShift.workers.map((worker) => (
                      <TableRow
                        key={`${selectedShift.allocationId}-${worker.employeeId}`}
                        className="border-b"
                      >
                        <TableCell className="p-2">
                          <div className="font-semibold">
                            {worker.employeeName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {worker.code}
                          </div>
                        </TableCell>
                        <TableCell className="p-2">
                          {worker.shareWeight.toFixed(3)}
                        </TableCell>
                        <TableCell className="p-2">
                          {format(worker.dueDate, "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="p-2">
                          <Badge
                            variant={
                              worker.status === "PAID" ? "secondary" : "outline"
                            }
                          >
                            {worker.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-2">
                          {worker.paidAmount > 0
                            ? worker.paidAmount.toFixed(3)
                            : "-"}
                        </TableCell>
                        <TableCell className="p-2">
                          {worker.paidAt
                            ? format(worker.paidAt, "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="absolute left-[-9999px] top-0">
        <div ref={payoutTableRef}>
          <PdfTemplate
            title="Gold Shift Payout Schedule"
            subtitle={`${format(windowStartDate, "yyyy-MM-dd")} to ${format(windowEndDate, "yyyy-MM-dd")}`}
            meta={[
              { label: "Pay window", value: `${payoutWindowWeeks} weeks` },
              {
                label: "Shift allocations",
                value: String(shiftPayouts.length),
              },
              {
                label: "Worker gold total",
                value: `${totalWorkerGold.toFixed(3)} g`,
              },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Shift</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Workers</th>
                  <th className="py-2">Worker Gold (g)</th>
                  <th className="py-2">Pay Cycle</th>
                  <th className="py-2">Expected Due</th>
                </tr>
              </thead>
              <tbody>
                {shiftPayouts.map((shift) => (
                  <tr
                    key={`pdf-${shift.allocationId}`}
                    className="border-b border-gray-100"
                  >
                    <td className="py-2">
                      {format(shift.date, "yyyy-MM-dd")} ({shift.shift})
                    </td>
                    <td className="py-2">
                      {shift.siteName} ({shift.siteCode})
                    </td>
                    <td className="py-2">{shift.workerCount}</td>
                    <td className="py-2">
                      {shift.workerShareWeight.toFixed(3)}
                    </td>
                    <td className="py-2">{shift.payCycleWeeks} weeks</td>
                    <td className="py-2">
                      {format(shift.expectedDueDate, "yyyy-MM-dd")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </GoldShell>
  );
}
