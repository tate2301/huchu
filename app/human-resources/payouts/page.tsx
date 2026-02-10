"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { fetchEmployeePayments, fetchGoldShiftAllocations } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import type { EmployeePayment } from "@/lib/api";

const statusOptions = [
  { value: "DUE", label: "Due" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
] as const;

type PaymentForm = {
  id?: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: string;
  unit: string;
  paidAmount: string;
  paidAt: string;
  status: "DUE" | "PARTIAL" | "PAID";
  notes: string;
};

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
  expectedDueDate: Date;
  workers: ShiftWorkerPayout[];
  totalGold: number;
  paidCount: number;
  partialCount: number;
  dueCount: number;
};

const emptyPaymentForm: PaymentForm = {
  employeeId: "",
  employeeName: "",
  periodStart: "",
  periodEnd: "",
  dueDate: "",
  amount: "",
  unit: "g",
  paidAmount: "",
  paidAt: "",
  status: "DUE",
  notes: "",
};

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
  const [payoutWindowWeeks, setPayoutWindowWeeks] = useState(searchParams.get("window") ?? "2");
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ShiftPayoutGroup | null>(null);
  const payoutPdfRef = useRef<HTMLDivElement>(null);

  const windowWeeks = Number(payoutWindowWeeks);
  const windowStartDate = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - windowWeeks * 7);
    return start;
  }, [windowWeeks]);
  const windowEndDate = new Date();

  const { data: allocationsData, isLoading: allocationsLoading, error: allocationsError } = useQuery({
    queryKey: ["gold-shift-allocations", "hr-payouts", payoutWindowWeeks],
    queryFn: () =>
      fetchGoldShiftAllocations({
        startDate: windowStartDate.toISOString().slice(0, 10),
        limit: 500,
      }),
  });

  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: ["employee-payments", "gold", "shift-grouped", payoutWindowWeeks],
    queryFn: () =>
      fetchEmployeePayments({
        type: "GOLD",
        startDate: windowStartDate.toISOString(),
        limit: 1000,
      }),
  });

  const shiftAllocations = useMemo(() => allocationsData?.data ?? [], [allocationsData]);
  const payments = useMemo(() => paymentsData?.data ?? [], [paymentsData]);

  const payoutGroups = useMemo<ShiftPayoutGroup[]>(() => {
    return shiftAllocations
      .filter((allocation) => allocation.payCycleWeeks === windowWeeks)
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
          expectedDueDate,
          workers,
          totalGold,
          paidCount,
          partialCount,
          dueCount,
        } satisfies ShiftPayoutGroup;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [payments, shiftAllocations, windowWeeks]);

  const totalGoldDue = useMemo(
    () => payoutGroups.reduce((sum, group) => sum + group.totalGold, 0),
    [payoutGroups],
  );

  const totalWorkers = useMemo(
    () => payoutGroups.reduce((sum, group) => sum + group.workers.length, 0),
    [payoutGroups],
  );

  const isLoading = allocationsLoading || paymentsLoading;

  const createPaymentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson<EmployeePayment>("/api/employee-payments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (payment) => {
      toast({
        title: "Payout recorded",
        description: "Gold payout has been saved.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] });
      setPaymentOpen(false);
      const params = new URLSearchParams({
        createdId: payment.id,
        createdAt: payment.createdAt,
        source: "gold-payout",
        window: payoutWindowWeeks,
      });
      router.push(`/human-resources/payouts?${params.toString()}`);
    },
    onError: (error) => {
      toast({
        title: "Unable to record payout",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      fetchJson<EmployeePayment>(`/api/employee-payments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (payment) => {
      toast({
        title: "Payout updated",
        description: "Gold payout changes saved.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] });
      setPaymentOpen(false);
      const params = new URLSearchParams({
        createdId: payment.id,
        createdAt: payment.createdAt,
        source: "gold-payout",
        window: payoutWindowWeeks,
      });
      router.push(`/human-resources/payouts?${params.toString()}`);
    },
    onError: (error) => {
      toast({
        title: "Unable to update payout",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const openPaymentForm = (group: ShiftPayoutGroup, worker: ShiftWorkerPayout) => {
    const periodStart = toDateOnly(group.date);
    const periodEnd = toDateOnly(group.date);
    const dueDate = worker.payment?.dueDate
      ? worker.payment.dueDate.slice(0, 10)
      : toDateOnly(group.expectedDueDate);

    setPaymentForm({
      id: worker.payment?.id,
      employeeId: worker.employeeId,
      employeeName: worker.employeeName,
      periodStart,
      periodEnd,
      dueDate,
      amount: worker.payment ? String(worker.payment.amount) : worker.shareWeight.toFixed(3),
      unit: worker.payment?.unit ?? "g",
      paidAmount: worker.payment?.paidAmount ? String(worker.payment.paidAmount) : "",
      paidAt: worker.payment?.paidAt ? worker.payment.paidAt.slice(0, 10) : "",
      status: worker.payment?.status ?? "DUE",
      notes: worker.payment?.notes ?? `Shift ${format(group.date, "yyyy-MM-dd")} (${group.shift})`,
    });
    setSelectedGroup(null);
    setPaymentOpen(true);
  };

  const handlePaymentChange =
    (field: keyof PaymentForm) => (event: ChangeEvent<HTMLInputElement>) => {
      setPaymentForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleStatusChange = (value: string) => {
    setPaymentForm((prev) => ({ ...prev, status: value as PaymentForm["status"] }));
  };

  const handlePaymentSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!paymentForm.employeeId) return;

    const payload = {
      employeeId: paymentForm.employeeId,
      type: "GOLD",
      periodStart: paymentForm.periodStart,
      periodEnd: paymentForm.periodEnd,
      dueDate: paymentForm.dueDate,
      amount: Number(paymentForm.amount),
      unit: paymentForm.unit,
      paidAmount: paymentForm.paidAmount ? Number(paymentForm.paidAmount) : undefined,
      paidAt: paymentForm.paidAt ? new Date(paymentForm.paidAt).toISOString() : undefined,
      status: paymentForm.status,
      notes: paymentForm.notes || undefined,
    };

    if (paymentForm.id) {
      updatePaymentMutation.mutate({ id: paymentForm.id, payload });
    } else {
      createPaymentMutation.mutate(payload);
    }
  };

  const handleExportPdf = () => {
    if (!payoutPdfRef.current) return;
    exportElementToPdf(
      payoutPdfRef.current,
      `gold-payouts-shift-grouped-${payoutWindowWeeks}-weeks.pdf`,
    );
  };

  return (
    <HrShell activeTab="payouts" description="Gold payout management and approvals">
      <RecordSavedBanner entityLabel="gold payout record" />
      {(allocationsError || paymentsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(allocationsError || paymentsError)}</AlertDescription>
        </Alert>
      )}

      <Sheet open={paymentOpen} onOpenChange={setPaymentOpen}>
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>{paymentForm.id ? "Update Payment" : "Record Payment"}</SheetTitle>
            <SheetDescription>
              Record shift-based payout status for this worker.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handlePaymentSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Employee</label>
              <Input value={paymentForm.employeeName} disabled />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Shift Date</label>
                <Input value={paymentForm.periodStart} disabled />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Due Date</label>
                <Input type="date" value={paymentForm.dueDate} onChange={handlePaymentChange("dueDate")} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Status</label>
                <Select value={paymentForm.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Gold Amount (g)</label>
                <Input
                  type="number"
                  step="0.001"
                  value={paymentForm.amount}
                  onChange={handlePaymentChange("amount")}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-2">Paid Amount (g)</label>
                <Input
                  type="number"
                  step="0.001"
                  value={paymentForm.paidAmount}
                  onChange={handlePaymentChange("paidAmount")}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Paid Date</label>
                <Input type="date" value={paymentForm.paidAt} onChange={handlePaymentChange("paidAt")} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Notes</label>
              <Input value={paymentForm.notes} onChange={handlePaymentChange("notes")} placeholder="Optional notes" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
              >
                {paymentForm.id ? "Save Changes" : "Record Payment"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Gold Payouts by Shift</CardTitle>
              <CardDescription>Track when each shift payout is due and who is included.</CardDescription>
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
          <CardDescription>Each row represents one shift payout group.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : payoutGroups.length === 0 ? (
            <div className="text-sm text-muted-foreground">No payouts for this window.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-semibold">Shift</th>
                    <th className="text-left p-3 font-semibold">Site</th>
                    <th className="text-left p-3 font-semibold">Workers</th>
                    <th className="text-left p-3 font-semibold">Gold Due (g)</th>
                    <th className="text-left p-3 font-semibold">Expected Due</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-right p-3 font-semibold">Members</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutGroups.map((group) => (
                    <tr key={group.allocationId} className="border-b">
                      <td className="p-3">
                        <div className="font-semibold">{format(group.date, "MMM d, yyyy")} ({group.shift})</div>
                        <div className="text-xs text-muted-foreground">Allocation {group.allocationId.slice(0, 8)}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold">{group.siteName}</div>
                        <div className="text-xs text-muted-foreground">{group.siteCode}</div>
                      </td>
                      <td className="p-3">{group.workers.length}</td>
                      <td className="p-3">{group.totalGold.toFixed(3)}</td>
                      <td className="p-3">{format(group.expectedDueDate, "MMM d, yyyy")}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">Paid {group.paidCount}</Badge>
                          {group.partialCount > 0 ? <Badge variant="outline">Partial {group.partialCount}</Badge> : null}
                          {group.dueCount > 0 ? <Badge variant="outline">Due {group.dueCount}</Badge> : null}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedGroup(group)}
                        >
                          View Members
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-2 text-left font-semibold">Worker</th>
                      <th className="p-2 text-left font-semibold">Shift Earned (g)</th>
                      <th className="p-2 text-left font-semibold">Due Date</th>
                      <th className="p-2 text-left font-semibold">Status</th>
                      <th className="p-2 text-left font-semibold">Paid</th>
                      <th className="p-2 text-left font-semibold">Paid Date</th>
                      <th className="p-2 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.workers.map((worker) => {
                      const isOverdue =
                        isBefore(worker.dueDate, new Date()) && worker.status !== "PAID";

                      return (
                        <tr
                          key={`${selectedGroup.allocationId}-${worker.employeeId}`}
                          className={`border-b ${createdId === worker.payment?.id ? "bg-[var(--status-success-bg)]" : ""}`}
                        >
                          <td className="p-2">
                            <div className="font-semibold">{worker.employeeName}</div>
                            <div className="text-xs text-muted-foreground">{worker.employeeCode}</div>
                          </td>
                          <td className="p-2">{worker.shareWeight.toFixed(3)}</td>
                          <td className="p-2">
                            {format(worker.dueDate, "MMM d, yyyy")}
                            {isOverdue ? <div className="text-[10px] text-red-600">Past due</div> : null}
                          </td>
                          <td className="p-2">
                            <Badge variant={worker.status === "PAID" ? "secondary" : "outline"}>
                              {worker.status}
                            </Badge>
                          </td>
                          <td className="p-2">{worker.paidAmount > 0 ? worker.paidAmount.toFixed(3) : "-"}</td>
                          <td className="p-2">{worker.paidAt ? format(worker.paidAt, "MMM d, yyyy") : "-"}</td>
                          <td className="p-2 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openPaymentForm(selectedGroup, worker)}
                            >
                              {worker.payment ? "Update" : "Record"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
