"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, isAfter, isBefore } from "date-fns";
import { useSession } from "next-auth/react";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NumericCell } from "@/components/ui/numeric-cell";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchEmployeePayments, fetchGoldShiftAllocations } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import { goldRoutes } from "@/app/gold/routes";
import { canViewHrefWithEnabledFeatures } from "@/lib/platform/gating/nav-filter";

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
  const [selectedShift, setSelectedShift] = useState<ShiftPayoutSummary | null>(null);
  const payoutTableRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const canOpenHrPayouts = useMemo(
    () => canViewHrefWithEnabledFeatures("/human-resources/payouts", enabledFeatures),
    [enabledFeatures],
  );
  const canOpenSales = useMemo(
    () => canViewHrefWithEnabledFeatures(goldRoutes.settlement.receipts, enabledFeatures),
    [enabledFeatures],
  );

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

  const shiftColumns = useMemo<ColumnDef<ShiftPayoutSummary>[]>(
    () => [
      {
        id: "shift",
        header: "Shift",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">
              {format(row.original.date, "MMM d, yyyy")} ({row.original.shift})
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.allocationId.slice(0, 8)}
            </div>
          </div>
        ),
      },
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.siteName}</div>
            <div className="text-xs text-muted-foreground">{row.original.siteCode}</div>
          </div>
        ),
      },
      {
        id: "workerCount",
        header: "Workers",
        cell: ({ row }) => <NumericCell>{row.original.workerCount}</NumericCell>,
      },
      {
        id: "workerShareWeight",
        header: "Worker Gold",
        cell: ({ row }) => (
          <NumericCell>{row.original.workerShareWeight.toFixed(3)} g</NumericCell>
        ),
      },
      {
        id: "expectedDueDate",
        header: "Expected Due",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(row.original.expectedDueDate, "MMM d, yyyy")}
          </NumericCell>
        ),
      },
      {
        id: "progress",
        header: "Payment Progress",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Paid {row.original.paidCount}</Badge>
            {row.original.partialCount > 0 ? (
              <Badge variant="warning">Partial {row.original.partialCount}</Badge>
            ) : null}
            {row.original.dueCount > 0 ? (
              <Badge variant="neutral">Due {row.original.dueCount}</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedShift(row.original)}
            >
              View Members
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const workerColumns = useMemo<ColumnDef<WorkerPayoutDetail>[]>(
    () => [
      {
        id: "worker",
        header: "Worker",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.employeeName}</div>
            <div className="text-xs text-muted-foreground font-mono">{row.original.code}</div>
          </div>
        ),
      },
      {
        id: "shareWeight",
        header: "Share (g)",
        cell: ({ row }) => <NumericCell>{row.original.shareWeight.toFixed(3)}</NumericCell>,
      },
      {
        id: "dueDate",
        header: "Due",
        cell: ({ row }) => (
          <NumericCell align="left">{format(row.original.dueDate, "MMM d, yyyy")}</NumericCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const variant =
            row.original.status === "PAID"
              ? "success"
              : row.original.status === "PARTIAL"
                ? "warning"
                : "neutral";
          return <Badge variant={variant}>{row.original.status}</Badge>;
        },
      },
      {
        id: "paidAmount",
        header: "Paid",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.paidAmount > 0 ? row.original.paidAmount.toFixed(3) : "-"}
          </NumericCell>
        ),
      },
      {
        id: "paidAt",
        header: "Paid Date",
        cell: ({ row }) =>
          row.original.paidAt ? (
            <NumericCell align="left">{format(row.original.paidAt, "MMM d, yyyy")}</NumericCell>
          ) : (
            "-"
          ),
      },
    ],
    [],
  );

  return (
    <GoldShell
      activeTab="payouts"
      title="Payouts"
      description="Shift-based worker payout schedule"
      actions={
        <div className="flex gap-2">
          {canOpenHrPayouts ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/human-resources/payouts">Manage payouts in HR</Link>
            </Button>
          ) : null}
          {canOpenSales ? (
            <Button asChild size="sm" variant="outline">
              <Link href={goldRoutes.settlement.receipts}>Back to Sales</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <PageIntro
        title="Shift Payout Queue"
        purpose="See each gold shift, expected payout timing, and who is paid from that shift."
        nextStep="Open View Members to inspect shift members without leaving this page."
      />

      {(allocationsError || paymentsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(allocationsError || paymentsError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Shift Payout Schedule
          </h2>
          <p className="text-sm text-muted-foreground">
            Each row is one attendance-linked shift allocation.
          </p>
        </header>
        <DataTable
          data={shiftPayouts}
          columns={shiftColumns}
          searchPlaceholder="Search by shift date, site, or status"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Shifts: {shiftPayouts.length}</Badge>
              <Badge variant="secondary">Worker slots: {totalWorkers}</Badge>
              <Badge variant="secondary">
                Worker gold: {totalWorkerGold.toFixed(3)} g
              </Badge>
              <Select value={payoutWindowWeeks} onValueChange={setPayoutWindowWeeks}>
                <SelectTrigger size="sm" className="h-8 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 weeks</SelectItem>
                  <SelectItem value="4">4 weeks</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!payoutTableRef.current) return;
                  exportElementToPdf(
                    payoutTableRef.current,
                    `gold-shift-payouts-${payoutWindowWeeks}-weeks.pdf`,
                  );
                }}
                disabled={isLoading || shiftPayouts.length === 0}
              >
                Export PDF
              </Button>
            </div>
          }
          emptyState={isLoading ? "Loading payout schedule..." : "No shift payouts recorded for this window."}
        />
      </section>

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
              <DataTable
                data={selectedShift.workers}
                columns={workerColumns}
                searchPlaceholder="Search members"
                searchSubmitLabel="Search"
                tableClassName="text-sm"
                pagination={{ enabled: true }}
              />
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


