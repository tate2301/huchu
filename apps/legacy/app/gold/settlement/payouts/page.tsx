"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { useSession } from "next-auth/react";

import { GoldShell } from "@corelithzw/module-gold/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { ExportMenu } from "@corelithzw/ui/components/export-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { PdfTemplate } from "@corelithzw/module-documents/components/pdf/pdf-template";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import { fetchGoldShiftAllocations } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { type DocumentExportFormat } from "@corelithzw/module-documents/export-client";
import { exportElementToDocument } from "@corelithzw/module-documents/pdf";
import { goldRoutes } from "@corelithzw/module-gold/routes";
import { canViewHrefWithEnabledFeatures } from "@corelithzw/platform/gating/nav-filter";

/**
 * One worker's share of one shift, and how far its settlement has got.
 *
 * `settlement` is null until a settlement run picks the allocation up. When it
 * is set, `lineNet` and `linePaid` belong to the **line**, not to this shift: a
 * line aggregates, so six shifts in a month settle as one payment. Pro-rating
 * that payment back across the six would produce a per-shift "paid" figure
 * nobody could reconcile against a receipt, so the screen reports the line's
 * figure and says which run it is.
 */
type WorkerPayoutDetail = {
  employeeId: string;
  employeeName: string;
  code: string;
  shareValueUsd: number;
  settlement: {
    runCode: string;
    runStatus: string;
    lineNet: number;
    linePaid: number;
    status: "DUE" | "PARTIAL" | "PAID";
    paidAt?: Date;
  } | null;
  dueDate: Date;
};

type SettlementOrigin = {
  goldShiftAllocationId: string | null;
  amount: string;
  line: {
    employee: { id: string; employeeId: string; name: string };
    netAmount: string;
    currency: string;
  };
  run: { code: string; status: string; dueDate: string };
  payment: {
    paidAmount: string | null;
    paidAt: string | null;
    status: string;
  } | null;
};

function toNumber(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type ShiftPayoutSummary = {
  allocationId: string;
  date: Date;
  shift: string;
  siteName: string;
  siteCode: string;
  payCycleWeeks: number;
  expectedDueDate: Date;
  workerShareValueUsd: number;
  workerCount: number;
  paidCount: number;
  partialCount: number;
  dueCount: number;
  workers: WorkerPayoutDetail[];
};

/**
 * `<allocationId>:<employeeId>` → what settled it.
 *
 * Replaces a date-range search. The predecessor looked for an
 * `EmployeePayment` whose period contained the allocation date, falling back to
 * a fuzzier overlap test — so a worker settled twice inside one period matched
 * whichever row came first in the array.
 */
function indexOriginsByAllocationWorker(origins: SettlementOrigin[]) {
  const map = new Map<string, SettlementOrigin>();
  for (const origin of origins) {
    if (!origin.goldShiftAllocationId) continue;
    map.set(`${origin.goldShiftAllocationId}:${origin.line.employee.id}`, origin);
  }
  return map;
}

export default function GoldSettlementPayoutsPage() {
  const [payoutWindowWeeks, setPayoutWindowWeeks] = useState("2");
  const [selectedShift, setSelectedShift] = useState<ShiftPayoutSummary | null>(
    null,
  );
  const payoutTableRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const canOpenSettlementApprovals = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(
        "/gold/settlement/approvals",
        enabledFeatures,
      ),
    [enabledFeatures],
  );
  const canOpenSales = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(
        goldRoutes.settlement.receipts,
        enabledFeatures,
      ),
    [enabledFeatures],
  );

  const windowWeeks = Number(payoutWindowWeeks);
  const windowStartDate = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - windowWeeks * 7);
    return start;
  }, [windowWeeks]);

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
    queryKey: ["settlement-origins", "gold", payoutWindowWeeks],
    queryFn: () =>
      fetchJson<{ data: SettlementOrigin[] }>(
        `/api/settlements/origins?source=GOLD&startDate=${windowStartDate
          .toISOString()
          .slice(0, 10)}`,
      ),
  });

  const shiftAllocations = useMemo(
    () => shiftAllocationsData?.data ?? [],
    [shiftAllocationsData],
  );
  const settledByShiftWorker = useMemo(
    () => indexOriginsByAllocationWorker(paymentsData?.data ?? []),
    [paymentsData],
  );

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
          const origin = settledByShiftWorker.get(
            `${allocation.id}:${share.employee.id}`,
          );

          return {
            employeeId: share.employee.id,
            employeeName: share.employee.name,
            code: share.employee.employeeId,
            // The settled figure when there is one — it is what the run froze,
            // and it can differ from the allocation's own arithmetic if the rate
            // moved between the shift and the settlement.
            shareValueUsd: origin
              ? toNumber(origin.amount)
              : (share.shareValueUsd ??
                share.shareWeight * (allocation.goldPriceUsdPerGram ?? 0)),
            settlement: origin
              ? {
                  runCode: origin.run.code,
                  runStatus: origin.run.status,
                  lineNet: toNumber(origin.line.netAmount),
                  linePaid: toNumber(origin.payment?.paidAmount),
                  status: (origin.payment?.status ?? "DUE") as
                    | "DUE"
                    | "PARTIAL"
                    | "PAID",
                  paidAt: origin.payment?.paidAt
                    ? new Date(origin.payment.paidAt)
                    : undefined,
                }
              : null,
            dueDate: origin ? new Date(origin.run.dueDate) : expectedDueDate,
          } satisfies WorkerPayoutDetail;
        });

        const paidCount = workers.filter(
          (worker) => worker.settlement?.status === "PAID",
        ).length;
        const partialCount = workers.filter(
          (worker) => worker.settlement?.status === "PARTIAL",
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
          workerShareValueUsd:
            allocation.workerShareValueUsd ??
            workers.reduce((sum, worker) => sum + worker.shareValueUsd, 0),
          workerCount: workers.length,
          paidCount,
          partialCount,
          dueCount,
          workers,
        } satisfies ShiftPayoutSummary;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [settledByShiftWorker, shiftAllocations, windowWeeks]);

  const totalWorkerValueUsd = useMemo(
    () =>
      shiftPayouts.reduce((sum, shift) => sum + shift.workerShareValueUsd, 0),
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
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.siteName}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.siteCode}
            </div>
          </div>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "workerCount",
        header: "Workers",
        cell: ({ row }) => (
          <NumericCell>{row.original.workerCount}</NumericCell>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "workerShareValueUsd",
        header: "Worker Value",
        cell: ({ row }) => (
          <NumericCell>
            ${Number(row.original.workerShareValueUsd).toFixed(2)}
          </NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "expectedDueDate",
        header: "Expected Due",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(row.original.expectedDueDate, "MMM d, yyyy")}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "progress",
        header: "Payment Progress",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              status="passing"
              label={`Paid ${row.original.paidCount}`}
            />
            {row.original.partialCount > 0 ? (
              <StatusChip
                status="in_progress"
                label={`Partial ${row.original.partialCount}`}
              />
            ) : null}
            {row.original.dueCount > 0 ? (
              <StatusChip
                status="pending"
                label={`Due ${row.original.dueCount}`}
              />
            ) : null}
          </div>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160,
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
        size: 108,
        minSize: 108,
        maxSize: 108,
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
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.code}
            </div>
          </div>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "shareValueUsd",
        header: "Share Value",
        cell: ({ row }) => (
          <NumericCell>${Number(row.original.shareValueUsd).toFixed(2)}</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "dueDate",
        header: "Due",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(row.original.dueDate, "MMM d, yyyy")}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const settlement = row.original.settlement;
          if (!settlement) {
            return <StatusChip status="pending" label="Not settled" />;
          }
          return (
            <div>
              <StatusChip
                status={
                  settlement.status === "PAID"
                    ? "passing"
                    : settlement.status === "PARTIAL"
                      ? "in_progress"
                      : "pending"
                }
                label={settlement.status}
              />
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                {settlement.runCode} · {settlement.runStatus.toLowerCase()}
              </div>
            </div>
          );
        },
        size: 140,
        minSize: 140,
        maxSize: 140,
      },
      {
        // The line's, across every shift it settled — not this shift's alone.
        // Splitting one payment back across six shifts would print a number that
        // matches no receipt.
        id: "linePaid",
        header: "Paid on the run",
        cell: ({ row }) => {
          const settlement = row.original.settlement;
          if (!settlement) return <NumericCell>-</NumericCell>;
          return (
            <div>
              <NumericCell>
                {settlement.linePaid > 0
                  ? `$${settlement.linePaid.toFixed(2)}`
                  : "-"}
              </NumericCell>
              <div className="mt-0.5 text-right font-mono text-[10px] text-muted-foreground">
                of ${settlement.lineNet.toFixed(2)}
              </div>
            </div>
          );
        },
        size: 140,
        minSize: 140,
        maxSize: 140,
      },
      {
        id: "paidAt",
        header: "Paid Date",
        cell: ({ row }) =>
          row.original.settlement?.paidAt ? (
            <NumericCell align="left">
              {format(row.original.settlement.paidAt, "MMM d, yyyy")}
            </NumericCell>
          ) : (
            "-"
          ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
    ],
    [],
  );

  return (
    <GoldShell
      activeTab="payouts"
      title="Payouts"
      actions={
        <div className="flex gap-2">
          {canOpenSettlementApprovals ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/gold/settlement/approvals?source=GOLD">Manage settlement approvals</Link>
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
      {allocationsError || paymentsError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(allocationsError || paymentsError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Shift Payout Schedule
          </h2>
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
                Worker value: ${Number(totalWorkerValueUsd).toFixed(2)}
              </Badge>
              <Select
                value={payoutWindowWeeks}
                onValueChange={setPayoutWindowWeeks}
              >
                <SelectTrigger size="sm" className="h-8 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 weeks</SelectItem>
                  <SelectItem value="4">4 weeks</SelectItem>
                </SelectContent>
              </Select>
              <ExportMenu
                variant="outline"
                size="sm"
                disabled={isLoading || shiftPayouts.length === 0}
                onExport={(format: DocumentExportFormat) => {
                  if (!payoutTableRef.current) return;
                  return exportElementToDocument(
                    payoutTableRef.current,
                    `gold-shift-payouts-${payoutWindowWeeks}-weeks.${format}`,
                    format,
                  );
                }}
              />
            </div>
          }
          emptyState={
            isLoading ? (
              <div className="space-y-2 p-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                    <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              "No shift payouts recorded for this window."
            )
          }
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
                  Worker value:{" "}
                  <span className="font-semibold text-foreground">
                    ${Number(selectedShift.workerShareValueUsd).toFixed(2)}
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
            meta={[
              { label: "Pay window", value: `${payoutWindowWeeks} weeks` },
              {
                label: "Shift allocations",
                value: String(shiftPayouts.length),
              },
              {
                label: "Worker value total",
                value: `$${Number(totalWorkerValueUsd).toFixed(2)}`,
              },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Shift</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Workers</th>
                  <th className="py-2">Worker Value (USD)</th>
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
                      {Number(shift.workerShareValueUsd).toFixed(2)}
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
