"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { addDays, format, isAfter, isBefore } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";

import { HrShell } from "@/components/human-resources/hr-shell";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { NumericCell } from "@/components/ui/numeric-cell";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { fetchEmployeePayments, fetchGoldShiftAllocations } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import type { EmployeePayment } from "@/lib/api";

type ShiftWorkerPayout = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  shareWeight: number;
  status: "DUE" | "PARTIAL" | "PAID";
  dueDate: Date;
  paidAmount: number;
  paidAt?: Date;
  payment?: EmployeePayment;
};

type ShiftPayoutGroup = {
  allocationId: string;
  date: Date;
  shift: string;
  siteName: string;
  siteCode: string;
  payCycleWeeks: number;
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt?: Date;
  approvedAt?: Date;
  submittedByName?: string;
  approvedByName?: string;
  expectedDueDate: Date;
  workers: ShiftWorkerPayout[];
  totalGold: number;
  paidCount: number;
  partialCount: number;
  dueCount: number;
};

function workflowBadgeVariant(status: ShiftPayoutGroup["workflowStatus"]) {
  return status === "APPROVED" ? "success" : "warning";
}

function toDateOnly(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return format(date, "yyyy-MM-dd");
}

function findPaymentForShiftWorker(
  payments: EmployeePayment[],
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

export default function HrPayoutsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const createdId = searchParams.get("createdId");
  const allocationIdFilter = searchParams.get("allocationId");
  const [payoutWindowWeeks, setPayoutWindowWeeks] = useState(searchParams.get("window") ?? "2");
  const [groupsQuery, setGroupsQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [selectedGroup, setSelectedGroup] = useState<ShiftPayoutGroup | null>(null);
  const [rejectionAllocationId, setRejectionAllocationId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const payoutPdfRef = useRef<HTMLDivElement>(null);

  const windowWeeks = Number(payoutWindowWeeks);
  const windowStartDate = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - windowWeeks * 7);
    return start;
  }, [windowWeeks]);
  const windowEndDate = new Date();

  const { data: allocationsData, isLoading: allocationsLoading, error: allocationsError } = useQuery({
    queryKey: ["gold-shift-allocations", "hr-payouts", payoutWindowWeeks, allocationIdFilter],
    queryFn: () =>
      fetchGoldShiftAllocations({
        startDate: allocationIdFilter ? undefined : windowStartDate.toISOString().slice(0, 10),
        limit: 500,
      }),
  });

  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: ["employee-payments", "gold", "shift-grouped", payoutWindowWeeks, allocationIdFilter],
    queryFn: () =>
      fetchEmployeePayments({
        type: "GOLD",
        startDate: allocationIdFilter ? undefined : windowStartDate.toISOString(),
        limit: 1000,
      }),
  });

  const shiftAllocations = useMemo(() => allocationsData?.data ?? [], [allocationsData]);
  const payments = useMemo(() => paymentsData?.data ?? [], [paymentsData]);

  const payoutGroups = useMemo<ShiftPayoutGroup[]>(() => {
    return shiftAllocations
      .filter((allocation) =>
        allocationIdFilter ? allocation.id === allocationIdFilter : allocation.payCycleWeeks === windowWeeks,
      )
      .map((allocation) => {
        const allocationDate = new Date(allocation.date);
        const expectedDueDate = addDays(allocationDate, allocation.payCycleWeeks * 7);

        const workers = allocation.workerShares.map((share) => {
          const payment = findPaymentForShiftWorker(payments, share.employee.id, allocationDate);

          return {
            employeeId: share.employee.id,
            employeeName: share.employee.name,
            employeeCode: share.employee.employeeId,
            shareWeight: share.shareWeight,
            status: payment?.status ?? "DUE",
            dueDate: payment ? new Date(payment.dueDate) : expectedDueDate,
            paidAmount: payment?.paidAmount ?? 0,
            paidAt: payment?.paidAt ? new Date(payment.paidAt) : undefined,
            payment,
          } satisfies ShiftWorkerPayout;
        });

        const paidCount = workers.filter((worker) => worker.status === "PAID").length;
        const partialCount = workers.filter((worker) => worker.status === "PARTIAL").length;
        const dueCount = workers.length - paidCount - partialCount;
        const totalGold = workers.reduce((sum, worker) => sum + worker.shareWeight, 0);

        return {
          allocationId: allocation.id,
          date: allocationDate,
          shift: allocation.shift,
          siteName: allocation.site.name,
          siteCode: allocation.site.code,
          payCycleWeeks: allocation.payCycleWeeks,
          workflowStatus: allocation.workflowStatus,
          submittedAt: allocation.submittedAt ? new Date(allocation.submittedAt) : undefined,
          approvedAt: allocation.approvedAt ? new Date(allocation.approvedAt) : undefined,
          submittedByName: allocation.submittedBy?.name,
          approvedByName: allocation.approvedBy?.name,
          expectedDueDate,
          workers,
          totalGold,
          paidCount,
          partialCount,
          dueCount,
        } satisfies ShiftPayoutGroup;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [allocationIdFilter, payments, shiftAllocations, windowWeeks]);

  const totalGoldDue = useMemo(
    () => payoutGroups.reduce((sum, group) => sum + group.totalGold, 0),
    [payoutGroups],
  );

  const totalWorkers = useMemo(
    () => payoutGroups.reduce((sum, group) => sum + group.workers.length, 0),
    [payoutGroups],
  );

  const isLoading = allocationsLoading || paymentsLoading;

  const invalidatePayoutWorkflowData = () => {
    queryClient.invalidateQueries({ queryKey: ["gold-shift-allocations"] });
    queryClient.invalidateQueries({ queryKey: ["employee-payments"] });
    queryClient.invalidateQueries({ queryKey: ["approval-history"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const submitAllocationMutation = useMutation({
    mutationFn: async (allocationId: string) =>
      fetchJson(`/api/gold/shift-allocations/${allocationId}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Allocation submitted",
        description: "Gold payout allocation is now pending approval.",
        variant: "success",
      });
      invalidatePayoutWorkflowData();
    },
    onError: (error) => {
      toast({
        title: "Unable to submit allocation",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const approveAllocationMutation = useMutation({
    mutationFn: async (allocationId: string) =>
      fetchJson(`/api/gold/shift-allocations/${allocationId}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({
        title: "Allocation approved",
        description: "Gold payouts can now be recorded for this shift allocation.",
        variant: "success",
      });
      invalidatePayoutWorkflowData();
    },
    onError: (error) => {
      toast({
        title: "Unable to approve allocation",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const rejectAllocationMutation = useMutation({
    mutationFn: async ({ allocationId, note }: { allocationId: string; note: string }) =>
      fetchJson(`/api/gold/shift-allocations/${allocationId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      toast({
        title: "Allocation rejected",
        description: "Allocation returned for correction before payout recording.",
        variant: "success",
      });
      setRejectionAllocationId(null);
      setRejectionNote("");
      invalidatePayoutWorkflowData();
    },
    onError: (error) => {
      toast({
        title: "Unable to reject allocation",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const openRejectionDialog = (allocationId: string) => {
    setRejectionAllocationId(allocationId);
    setRejectionNote("");
  };

  const handleRejectAllocation = () => {
    if (!rejectionAllocationId) return;
    const note = rejectionNote.trim();
    if (!note) return;
    rejectAllocationMutation.mutate({
      allocationId: rejectionAllocationId,
      note,
    });
  };

  const openPaymentForm = (group: ShiftPayoutGroup, worker: ShiftWorkerPayout) => {
    void worker;
    if (group.workflowStatus !== "APPROVED") {
      toast({
        title: "Approval required",
        description: "Submit and approve this allocation before recording worker payouts.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Continue in payroll",
      description: "Generate and approve a Gold Run, then disburse the batch to complete payout.",
      variant: "success",
    });
    setSelectedGroup(null);
    router.push(`/human-resources/payroll/gold?allocationId=${group.allocationId}`);
  };

  const handleExportPdf = () => {
    if (!payoutPdfRef.current) return;
    exportElementToPdf(
      payoutPdfRef.current,
      `gold-payouts-shift-grouped-${payoutWindowWeeks}-weeks.pdf`,
    );
  };

  const payoutColumns = useMemo<ColumnDef<ShiftPayoutGroup>[]>(
    () => [
      {
        id: "shift",
        header: "Shift",
        accessorFn: (row) => `${format(row.date, "MMM d, yyyy")} ${row.shift}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{format(row.original.date, "MMM d, yyyy")} ({row.original.shift})</div>
            <div className="text-xs text-muted-foreground">Allocation {row.original.allocationId.slice(0, 8)}</div>
          </div>
        ),
      },
      {
        id: "site",
        header: "Site",
        accessorFn: (row) => `${row.siteCode} ${row.siteName}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.siteName}</div>
            <div className="text-xs text-muted-foreground">{row.original.siteCode}</div>
          </div>
        ),
      },
      {
        id: "workers",
        header: "Workers",
        accessorFn: (row) => row.workers.length,
        cell: ({ row }) => <NumericCell>{row.original.workers.length}</NumericCell>,
      },
      {
        id: "goldDue",
        header: "Gold Due (g)",
        accessorFn: (row) => row.totalGold,
        cell: ({ row }) => <NumericCell>{row.original.totalGold.toFixed(3)}</NumericCell>,
      },
      {
        id: "expectedDue",
        header: "Expected Due",
        accessorFn: (row) => format(row.expectedDueDate, "yyyy-MM-dd"),
        cell: ({ row }) => <NumericCell align="left">{format(row.original.expectedDueDate, "MMM d, yyyy")}</NumericCell>,
      },
      {
        id: "payoutStatus",
        header: "Payout Status",
        accessorFn: (row) => `paid:${row.paidCount} partial:${row.partialCount} due:${row.dueCount}`,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">Paid {row.original.paidCount}</Badge>
            {row.original.partialCount > 0 ? <Badge variant="warning">Partial {row.original.partialCount}</Badge> : null}
            {row.original.dueCount > 0 ? <Badge variant="neutral">Due {row.original.dueCount}</Badge> : null}
          </div>
        ),
      },
      {
        id: "workflow",
        header: "Workflow",
        accessorFn: (row) => row.workflowStatus,
        cell: ({ row }) => (
          <div className="space-y-1">
            <Badge variant={workflowBadgeVariant(row.original.workflowStatus)}>
              {row.original.workflowStatus}
            </Badge>
            {row.original.submittedAt ? (
              <div className="text-xs text-muted-foreground">
                Submitted {format(row.original.submittedAt, "MMM d, yyyy HH:mm")}
              </div>
            ) : null}
            {row.original.approvedAt ? (
              <div className="text-xs text-muted-foreground">
                Approved {format(row.original.approvedAt, "MMM d, yyyy HH:mm")}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "workflowActions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {row.original.workflowStatus === "DRAFT" || row.original.workflowStatus === "REJECTED" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={submitAllocationMutation.isPending}
                onClick={() => submitAllocationMutation.mutate(row.original.allocationId)}
              >
                Submit
              </Button>
            ) : null}
            {row.original.workflowStatus === "SUBMITTED" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={approveAllocationMutation.isPending}
                  onClick={() => approveAllocationMutation.mutate(row.original.allocationId)}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={rejectAllocationMutation.isPending}
                  onClick={() => openRejectionDialog(row.original.allocationId)}
                >
                  Reject
                </Button>
              </>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedGroup(row.original)}>
              View Members
            </Button>
          </div>
        ),
      },
    ],
    [approveAllocationMutation, rejectAllocationMutation, submitAllocationMutation],
  );

  const selectedGroupWorkerColumns: ColumnDef<ShiftWorkerPayout>[] = [
    {
      id: "worker",
      header: "Worker",
      accessorFn: (row) => `${row.employeeName} ${row.employeeCode}`,
      cell: ({ row }) => (
        <div>
          <div className="font-semibold">{row.original.employeeName}</div>
          <div className="text-xs text-muted-foreground">{row.original.employeeCode}</div>
          {createdId && createdId === row.original.payment?.id ? (
            <Badge variant="secondary" className="mt-1">Saved</Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "earned",
      header: "Shift Earned (g)",
      accessorFn: (row) => row.shareWeight,
      cell: ({ row }) => <NumericCell>{row.original.shareWeight.toFixed(3)}</NumericCell>,
    },
    {
      id: "dueDate",
      header: "Due Date",
      accessorFn: (row) => format(row.dueDate, "yyyy-MM-dd"),
      cell: ({ row }) => {
        const isOverdue = isBefore(row.original.dueDate, new Date()) && row.original.status !== "PAID";
        return (
          <div>
            <NumericCell align="left">{format(row.original.dueDate, "MMM d, yyyy")}</NumericCell>
            {isOverdue ? <div className="text-[10px] text-red-600">Past due</div> : null}
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
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
      id: "paid",
      header: "Paid",
      accessorFn: (row) => row.paidAmount,
      cell: ({ row }) => (
        <NumericCell>{row.original.paidAmount > 0 ? row.original.paidAmount.toFixed(3) : "-"}</NumericCell>
      ),
    },
    {
      id: "paidDate",
      header: "Paid Date",
      accessorFn: (row) => (row.paidAt ? format(row.paidAt, "yyyy-MM-dd") : ""),
      cell: ({ row }) => (
        <NumericCell align="left">{row.original.paidAt ? format(row.original.paidAt, "MMM d, yyyy") : "-"}</NumericCell>
      ),
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <div className="text-right">
          {selectedGroup?.workflowStatus === "APPROVED" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectedGroup && openPaymentForm(selectedGroup, row.original)}
            >
              Disburse
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Pending approval</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <HrShell activeTab="payouts" description="Gold shift payout approvals that feed payroll disbursement">
      <RecordSavedBanner entityLabel="gold payout record" />
      {(allocationsError || paymentsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(allocationsError || paymentsError)}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Gold Payouts by Shift
          </h2>
          <p className="text-sm text-muted-foreground">
            Approve shift allocations here, then finalize cash disbursement from payroll runs.
          </p>
        </header>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : payoutGroups.length === 0 ? (
          <div className="section-shell text-sm text-muted-foreground">No payouts for this window.</div>
        ) : (
          <DataTable
            data={payoutGroups}
            columns={payoutColumns}
            queryState={groupsQuery}
            onQueryStateChange={(next) => setGroupsQuery((prev) => ({ ...prev, ...next }))}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search by site, shift, or allocation"
            tableClassName="text-sm"
            toolbar={
              <>
                <Select value={payoutWindowWeeks} onValueChange={setPayoutWindowWeeks}>
                  <SelectTrigger size="sm" className="h-8 w-[110px]">
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
                  className="h-8"
                  onClick={handleExportPdf}
                  disabled={payoutGroups.length === 0}
                >
                  Export PDF
                </Button>
                {allocationIdFilter ? (
                  <Badge variant="neutral">Focused: {allocationIdFilter}</Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  Shifts <span className="font-mono text-foreground">{payoutGroups.length}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Workers <span className="font-mono text-foreground">{totalWorkers}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Gold Due <span className="font-mono text-foreground">{totalGoldDue.toFixed(3)} g</span>
                </span>
              </>
            }
          />
        )}
      </section>

      <Dialog
        open={Boolean(rejectionAllocationId)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectionAllocationId(null);
            setRejectionNote("");
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Reject Allocation</DialogTitle>
            <DialogDescription>
              Capture a rejection reason so the submitter can correct this payout allocation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Rejection Note</label>
            <Textarea
              value={rejectionNote}
              onChange={(event) => setRejectionNote(event.target.value)}
              placeholder="Describe why this allocation is being rejected."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectionAllocationId(null);
                setRejectionNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!rejectionNote.trim() || rejectAllocationMutation.isPending}
              onClick={handleRejectAllocation}
            >
              Reject Allocation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedGroup)}
        onOpenChange={(open) => {
          if (!open) setSelectedGroup(null);
        }}
      >
        <DialogContent size="full" className="max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>
              Shift Members
              {selectedGroup
                ? ` - ${format(selectedGroup.date, "MMM d, yyyy")} (${selectedGroup.shift})`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Record and review payout status by worker for this shift.
            </DialogDescription>
          </DialogHeader>
          {selectedGroup ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Workflow:</span>
                <Badge variant={workflowBadgeVariant(selectedGroup.workflowStatus)}>
                  {selectedGroup.workflowStatus}
                </Badge>
                {selectedGroup.workflowStatus !== "APPROVED" ? (
                  <span className="text-xs text-muted-foreground">
                    Payout recording unlocks after approval.
                  </span>
                ) : null}
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <div>
                  Site: <span className="font-semibold text-foreground">{selectedGroup.siteCode}</span>
                </div>
                <div>
                  Workers: <span className="font-semibold text-foreground">{selectedGroup.workers.length}</span>
                </div>
                <div>
                  Gold due: <span className="font-semibold text-foreground">{selectedGroup.totalGold.toFixed(3)} g</span>
                </div>
                <div>
                  Expected due: <span className="font-semibold text-foreground">{format(selectedGroup.expectedDueDate, "MMM d, yyyy")}</span>
                </div>
              </div>

              <div className="rounded-md border-0 shadow-[var(--surface-frame-shadow)]">
                <DataTable
                  data={selectedGroup.workers}
                  columns={selectedGroupWorkerColumns}
                  features={{ globalFilter: false, pagination: false, sorting: false }}
                  maxBodyHeight="60dvh"
                  tableContainerClassName="overflow-auto"
                  tableClassName="text-sm"
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="absolute left-[-9999px] top-0">
        <div ref={payoutPdfRef}>
          <PdfTemplate
            title="Gold Payouts by Shift"
            subtitle={`${format(windowStartDate, "yyyy-MM-dd")} to ${format(windowEndDate, "yyyy-MM-dd")}`}
            meta={[
              { label: "Pay window", value: `${payoutWindowWeeks} weeks` },
              { label: "Total shifts", value: String(payoutGroups.length) },
              { label: "Gold due", value: `${totalGoldDue.toFixed(3)} g` },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Shift</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Worker</th>
                  <th className="py-2">Earned (g)</th>
                  <th className="py-2">Due Date</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {payoutGroups.flatMap((group) =>
                  group.workers.map((worker) => (
                    <tr key={`pdf-${group.allocationId}-${worker.employeeId}`} className="border-b border-gray-100">
                      <td className="py-2">{format(group.date, "yyyy-MM-dd")} ({group.shift})</td>
                      <td className="py-2">{group.siteCode}</td>
                      <td className="py-2">{worker.employeeName} ({worker.employeeCode})</td>
                      <td className="py-2">{worker.shareWeight.toFixed(3)}</td>
                      <td className="py-2">{format(worker.dueDate, "yyyy-MM-dd")}</td>
                      <td className="py-2">{worker.status}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </HrShell>
  );
}


