"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isAfter, isBefore } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";

import { HrShell } from "@/components/human-resources/hr-shell";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/components/ui/use-toast";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { fetchEmployeePayments, fetchGoldShiftAllocations } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import type { EmployeePayment } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  shift: "DAY" | "NIGHT";
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
  return status === "APPROVED" ? "secondary" : "outline";
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

  return (
    <HrShell activeTab="payouts" description="Gold shift payout approvals that feed payroll disbursement">
      <RecordSavedBanner entityLabel="gold payout record" />
      {(allocationsError || paymentsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(allocationsError || paymentsError)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Gold Payouts by Shift</CardTitle>
              <CardDescription>
                Approve shift payouts here, then convert and disburse them from Payroll at the current gold rate.
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
                disabled={isLoading || payoutGroups.length === 0}
              >
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">Shifts</div>
                <div className="text-lg font-semibold">{payoutGroups.length}</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">Workers in window</div>
                <div className="text-lg font-semibold">{totalWorkers}</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">Gold due</div>
                <div className="text-lg font-semibold">{totalGoldDue.toFixed(3)} g</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift Groups</CardTitle>
          <CardDescription>
            Each row represents one shift payout group with workflow controls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : payoutGroups.length === 0 ? (
            <div className="text-sm text-muted-foreground">No payouts for this window.</div>
          ) : (
            <div className="space-y-3">
              {allocationIdFilter ? (
                <div className="text-xs text-muted-foreground">
                  Focused view for allocation <span className="font-semibold text-foreground">{allocationIdFilter}</span>.
                </div>
              ) : null}
              <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="text-left p-3 font-semibold">Shift</TableHead>
                    <TableHead className="text-left p-3 font-semibold">Site</TableHead>
                    <TableHead className="text-left p-3 font-semibold">Workers</TableHead>
                    <TableHead className="text-left p-3 font-semibold">Gold Due (g)</TableHead>
                    <TableHead className="text-left p-3 font-semibold">Expected Due</TableHead>
                    <TableHead className="text-left p-3 font-semibold">Payout Status</TableHead>
                    <TableHead className="text-left p-3 font-semibold">Workflow</TableHead>
                    <TableHead className="text-right p-3 font-semibold">Workflow Actions</TableHead>
                    <TableHead className="text-right p-3 font-semibold">Members</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payoutGroups.map((group) => (
                    <TableRow
                      key={group.allocationId}
                      className={`border-b ${allocationIdFilter === group.allocationId ? "bg-[var(--status-success-bg)]" : ""}`}
                    >
                      <TableCell className="p-3">
                        <div className="font-semibold">{format(group.date, "MMM d, yyyy")} ({group.shift})</div>
                        <div className="text-xs text-muted-foreground">Allocation {group.allocationId.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="font-semibold">{group.siteName}</div>
                        <div className="text-xs text-muted-foreground">{group.siteCode}</div>
                      </TableCell>
                      <TableCell className="p-3">{group.workers.length}</TableCell>
                      <TableCell className="p-3">{group.totalGold.toFixed(3)}</TableCell>
                      <TableCell className="p-3">{format(group.expectedDueDate, "MMM d, yyyy")}</TableCell>
                      <TableCell className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">Paid {group.paidCount}</Badge>
                          {group.partialCount > 0 ? <Badge variant="outline">Partial {group.partialCount}</Badge> : null}
                          {group.dueCount > 0 ? <Badge variant="outline">Due {group.dueCount}</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="space-y-1">
                          <Badge variant={workflowBadgeVariant(group.workflowStatus)}>
                            {group.workflowStatus}
                          </Badge>
                          {group.submittedAt ? (
                            <div className="text-xs text-muted-foreground">
                              Submitted {format(group.submittedAt, "MMM d, yyyy HH:mm")}
                              {group.submittedByName ? ` by ${group.submittedByName}` : ""}
                            </div>
                          ) : null}
                          {group.approvedAt ? (
                            <div className="text-xs text-muted-foreground">
                              Approved {format(group.approvedAt, "MMM d, yyyy HH:mm")}
                              {group.approvedByName ? ` by ${group.approvedByName}` : ""}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              !["DRAFT", "REJECTED"].includes(group.workflowStatus) ||
                              submitAllocationMutation.isPending
                            }
                            onClick={() => submitAllocationMutation.mutate(group.allocationId)}
                          >
                            Submit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              group.workflowStatus !== "SUBMITTED" ||
                              approveAllocationMutation.isPending
                            }
                            onClick={() => approveAllocationMutation.mutate(group.allocationId)}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              group.workflowStatus !== "SUBMITTED" ||
                              rejectAllocationMutation.isPending
                            }
                            onClick={() => openRejectionDialog(group.allocationId)}
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedGroup(group)}
                        >
                          View Members
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(rejectionAllocationId)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectionAllocationId(null);
            setRejectionNote("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
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
        <DialogContent className="max-h-[90dvh] max-w-6xl">
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

              <div className="max-h-[60dvh] overflow-auto rounded-md border border-border">
                <Table className="w-full text-sm">
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead className="p-2 text-left font-semibold">Worker</TableHead>
                      <TableHead className="p-2 text-left font-semibold">Shift Earned (g)</TableHead>
                      <TableHead className="p-2 text-left font-semibold">Due Date</TableHead>
                      <TableHead className="p-2 text-left font-semibold">Status</TableHead>
                      <TableHead className="p-2 text-left font-semibold">Paid</TableHead>
                      <TableHead className="p-2 text-left font-semibold">Paid Date</TableHead>
                      <TableHead className="p-2 text-right font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedGroup.workers.map((worker) => {
                      const isOverdue =
                        isBefore(worker.dueDate, new Date()) && worker.status !== "PAID";

                      return (
                        <TableRow
                          key={`${selectedGroup.allocationId}-${worker.employeeId}`}
                          className={`border-b ${createdId === worker.payment?.id ? "bg-[var(--status-success-bg)]" : ""}`}
                        >
                          <TableCell className="p-2">
                            <div className="font-semibold">{worker.employeeName}</div>
                            <div className="text-xs text-muted-foreground">{worker.employeeCode}</div>
                          </TableCell>
                          <TableCell className="p-2">{worker.shareWeight.toFixed(3)}</TableCell>
                          <TableCell className="p-2">
                            {format(worker.dueDate, "MMM d, yyyy")}
                            {isOverdue ? <div className="text-[10px] text-red-600">Past due</div> : null}
                          </TableCell>
                          <TableCell className="p-2">
                            <Badge variant={worker.status === "PAID" ? "secondary" : "outline"}>
                              {worker.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="p-2">{worker.paidAmount > 0 ? worker.paidAmount.toFixed(3) : "-"}</TableCell>
                          <TableCell className="p-2">{worker.paidAt ? format(worker.paidAt, "MMM d, yyyy") : "-"}</TableCell>
                          <TableCell className="p-2 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={selectedGroup.workflowStatus !== "APPROVED"}
                              title={
                                selectedGroup.workflowStatus !== "APPROVED"
                                  ? "Submit and approve allocation before recording payouts"
                                  : undefined
                              }
                              onClick={() => openPaymentForm(selectedGroup, worker)}
                            >
                              {selectedGroup.workflowStatus === "APPROVED"
                                ? "Disburse"
                                : "Pending"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
