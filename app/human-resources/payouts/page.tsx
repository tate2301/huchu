"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { addDays, format, isAfter, isBefore } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";

import { HrShell } from "@/components/human-resources/hr-shell";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
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
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchEmployeePayments,
  fetchEmployees,
  fetchGoldShiftAllocations,
  fetchIrregularPayoutBatches,
  type EmployeePayment,
  type IrregularPayoutBatchRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  parseIrregularPayoutSource,
  type IrregularPayoutSource,
} from "@/lib/hr-irregular-payouts";

type WorkflowStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type PayoutWorker = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  amountUsd: number;
  status: "DUE" | "PARTIAL" | "PAID";
  dueDate: Date;
  paidAmountUsd: number;
  paidAt?: Date;
  payment?: EmployeePayment;
};

type PayoutGroup = {
  id: string;
  kind: "gold" | "batch";
  source: IrregularPayoutSource;
  label: string;
  context: string;
  workflowStatus: WorkflowStatus;
  referenceDate: Date;
  dueDate: Date;
  workers: PayoutWorker[];
  totalValueUsd: number;
  paidCount: number;
  partialCount: number;
  dueCount: number;
};

type BatchItemDraft = { employeeId: string; amount: string; notes: string };

const SOURCE_META: Record<
  IrregularPayoutSource,
  { label: string; description: string; groupLabel: string }
> = {
  GOLD: {
    label: "Gold payouts",
    description: "Approved gold shift allocations flow into the irregular payout pipeline here.",
    groupLabel: "Shift",
  },
  COMMISSION: {
    label: "Commission payouts",
    description: "Commission batches are reviewed here before payout runs and disbursement.",
    groupLabel: "Batch",
  },
  OTHER: {
    label: "Other payouts",
    description: "Use this for profit share, dividends, and other non-salary employee payouts.",
    groupLabel: "Batch",
  },
};

function workflowVariant(status: WorkflowStatus) {
  return status === "APPROVED" ? "success" : "warning";
}

function toDateOnly(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return format(date, "yyyy-MM-dd");
}

function findPayment(
  payments: EmployeePayment[],
  employeeId: string,
  referenceDate: Date,
  batchId?: string,
) {
  if (batchId) {
    return payments.find(
      (payment) =>
        payment.employeeId === employeeId && payment.irregularPayoutBatchId === batchId,
    );
  }

  return payments.find((payment) => {
    if (payment.employeeId !== employeeId) return false;
    if (toDateOnly(payment.periodStart) === toDateOnly(referenceDate)) return true;
    const start = new Date(payment.periodStart);
    const end = new Date(payment.periodEnd);
    return !isBefore(referenceDate, start) && !isAfter(referenceDate, end);
  });
}

export default function HrPayoutsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const createdId = searchParams.get("createdId");
  const [source, setSource] = useState<IrregularPayoutSource>(
    parseIrregularPayoutSource(searchParams.get("source")),
  );
  const [windowWeeks, setWindowWeeks] = useState(searchParams.get("window") ?? "2");
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [selectedGroup, setSelectedGroup] = useState<PayoutGroup | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<PayoutGroup | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [batchLabel, setBatchLabel] = useState("");
  const [batchPeriodStart, setBatchPeriodStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [batchPeriodEnd, setBatchPeriodEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [batchDueDate, setBatchDueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [batchCurrency, setBatchCurrency] = useState("USD");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItemDraft[]>([
    { employeeId: "", amount: "", notes: "" },
  ]);

  const meta = SOURCE_META[source];
  const lookbackStart = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - Number(windowWeeks) * 7);
    return date;
  }, [windowWeeks]);

  const { data: employeesData } = useQuery({
    queryKey: ["employees", "payout-batch"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
    enabled: createOpen && source !== "GOLD",
  });
  const employees = employeesData?.data ?? [];

  const goldQuery = useQuery({
    queryKey: ["gold-shift-allocations", "hr-payouts", windowWeeks],
    queryFn: () =>
      fetchGoldShiftAllocations({
        startDate: lookbackStart.toISOString().slice(0, 10),
        limit: 500,
      }),
    enabled: source === "GOLD",
  });

  const batchQuery = useQuery({
    queryKey: ["irregular-payout-batches", source],
    queryFn: () => fetchIrregularPayoutBatches({ source: source === "GOLD" ? undefined : source, limit: 500 }),
    enabled: source !== "GOLD",
  });

  const paymentQuery = useQuery({
    queryKey: ["employee-payments", "irregular", source],
    queryFn: () => fetchEmployeePayments({ type: "IRREGULAR", payoutSource: source, limit: 1000 }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["gold-shift-allocations"] });
    queryClient.invalidateQueries({ queryKey: ["irregular-payout-batches"] });
    queryClient.invalidateQueries({ queryKey: ["employee-payments"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
  };

  const groups = useMemo<PayoutGroup[]>(() => {
    const payments = paymentQuery.data?.data ?? [];
    if (source === "GOLD") {
      return (goldQuery.data?.data ?? [])
        .filter((allocation) => allocation.payCycleWeeks === Number(windowWeeks))
        .map((allocation) => {
          const date = new Date(allocation.date);
          const dueDate = addDays(date, allocation.payCycleWeeks * 7);
          const workers = allocation.workerShares.map((share) => {
            const payment = findPayment(payments, share.employee.id, date);
            return {
              employeeId: share.employee.id,
              employeeName: share.employee.name,
              employeeCode: share.employee.employeeId,
              amountUsd:
                share.shareValueUsd ??
                share.shareWeight * (allocation.goldPriceUsdPerGram ?? 0),
              status: payment?.status ?? "DUE",
              dueDate: payment ? new Date(payment.dueDate) : dueDate,
              paidAmountUsd: payment?.paidAmountUsd ?? payment?.paidAmount ?? 0,
              paidAt: payment?.paidAt ? new Date(payment.paidAt) : undefined,
              payment,
            };
          });
          const paidCount = workers.filter((worker) => worker.status === "PAID").length;
          const partialCount = workers.filter((worker) => worker.status === "PARTIAL").length;
          return {
            id: allocation.id,
            kind: "gold",
            source,
            label: `${format(date, "MMM d, yyyy")} (${allocation.shift})`,
            context: `${allocation.site.code} - ${allocation.site.name}`,
            workflowStatus: allocation.workflowStatus,
            referenceDate: date,
            dueDate,
            workers,
            totalValueUsd: workers.reduce((sum, worker) => sum + worker.amountUsd, 0),
            paidCount,
            partialCount,
            dueCount: workers.length - paidCount - partialCount,
          };
        });
    }

    return ((batchQuery.data?.data ?? []) as IrregularPayoutBatchRecord[]).map((batch) => {
      const referenceDate = new Date(batch.periodEnd);
      const dueDate = new Date(batch.dueDate);
      const workers = batch.items.map((item) => {
        const payment = findPayment(payments, item.employeeId, referenceDate, batch.id);
        return {
          employeeId: item.employeeId,
          employeeName: item.employee.name,
          employeeCode: item.employee.employeeId,
          amountUsd: item.amount,
          status: payment?.status ?? "DUE",
          dueDate: payment ? new Date(payment.dueDate) : dueDate,
          paidAmountUsd: payment?.paidAmountUsd ?? payment?.paidAmount ?? 0,
          paidAt: payment?.paidAt ? new Date(payment.paidAt) : undefined,
          payment,
        };
      });
      const paidCount = workers.filter((worker) => worker.status === "PAID").length;
      const partialCount = workers.filter((worker) => worker.status === "PARTIAL").length;
      return {
        id: batch.id,
        kind: "batch",
        source,
        label: batch.label,
        context: `${format(new Date(batch.periodStart), "MMM d")} to ${format(new Date(batch.periodEnd), "MMM d, yyyy")}`,
        workflowStatus: batch.workflowStatus,
        referenceDate,
        dueDate,
        workers,
        totalValueUsd: workers.reduce((sum, worker) => sum + worker.amountUsd, 0),
        paidCount,
        partialCount,
        dueCount: workers.length - paidCount - partialCount,
      };
    });
  }, [batchQuery.data, goldQuery.data, paymentQuery.data, source, windowWeeks]);

  const createBatch = useMutation({
    mutationFn: async () =>
      fetchJson("/api/hr/payout-batches", {
        method: "POST",
        body: JSON.stringify({
          source,
          label: batchLabel.trim(),
          periodStart: batchPeriodStart,
          periodEnd: batchPeriodEnd,
          dueDate: batchDueDate,
          currency: batchCurrency,
          notes: batchNotes.trim() || undefined,
          items: batchItems
            .filter((item) => item.employeeId && item.amount.trim() !== "")
            .map((item) => ({
              employeeId: item.employeeId,
              amount: Number(item.amount),
              notes: item.notes.trim() || undefined,
            })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Payout batch created", description: "Batch saved for review.", variant: "success" });
      setCreateOpen(false);
      setBatchLabel("");
      setBatchNotes("");
      setBatchItems([{ employeeId: "", amount: "", notes: "" }]);
      invalidate();
    },
    onError: (error) => {
      toast({ title: "Unable to create batch", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const submit = useMutation({
    mutationFn: async (group: PayoutGroup) =>
      fetchJson(group.kind === "gold" ? `/api/gold/shift-allocations/${group.id}/submit` : `/api/hr/payout-batches/${group.id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Submitted", description: "Payout record is now pending approval.", variant: "success" });
      invalidate();
    },
    onError: (error) => {
      toast({ title: "Unable to submit", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const approve = useMutation({
    mutationFn: async (group: PayoutGroup) =>
      fetchJson(group.kind === "gold" ? `/api/gold/shift-allocations/${group.id}/approve` : `/api/hr/payout-batches/${group.id}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Approved", description: "This payout record is ready for run generation.", variant: "success" });
      invalidate();
    },
    onError: (error) => {
      toast({ title: "Unable to approve", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const reject = useMutation({
    mutationFn: async (group: PayoutGroup) =>
      fetchJson(group.kind === "gold" ? `/api/gold/shift-allocations/${group.id}/reject` : `/api/hr/payout-batches/${group.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: rejectionNote.trim() }),
      }),
    onSuccess: () => {
      toast({ title: "Rejected", description: "The payout record was returned for correction.", variant: "success" });
      setRejectionTarget(null);
      setRejectionNote("");
      invalidate();
    },
    onError: (error) => {
      toast({ title: "Unable to reject", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const columns = useMemo<ColumnDef<PayoutGroup>[]>(() => [
    {
      id: "group",
      header: meta.groupLabel,
      accessorFn: (row) => `${row.label} ${row.context}`,
      cell: ({ row }) => (
        <div>
          <div className="font-semibold">{row.original.label}</div>
          <div className="text-xs text-muted-foreground">{row.original.context}</div>
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
      id: "value",
      header: "Value Due",
      accessorFn: (row) => row.totalValueUsd,
      cell: ({ row }) => <NumericCell>${row.original.totalValueUsd.toFixed(2)}</NumericCell>,
    },
    {
      id: "due",
      header: "Due Date",
      accessorFn: (row) => format(row.dueDate, "yyyy-MM-dd"),
      cell: ({ row }) => <NumericCell align="left">{format(row.original.dueDate, "MMM d, yyyy")}</NumericCell>,
    },
    {
      id: "status",
      header: "Workflow",
      accessorFn: (row) => row.workflowStatus,
      cell: ({ row }) => <Badge variant={workflowVariant(row.original.workflowStatus)}>{row.original.workflowStatus}</Badge>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          {(row.original.workflowStatus === "DRAFT" || row.original.workflowStatus === "REJECTED") ? (
            <Button type="button" size="sm" variant="outline" onClick={() => submit.mutate(row.original)}>Submit</Button>
          ) : null}
          {row.original.workflowStatus === "SUBMITTED" ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => approve.mutate(row.original)}>Approve</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setRejectionTarget(row.original)}>Reject</Button>
            </>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedGroup(row.original)}>View Members</Button>
        </div>
      ),
    },
  ], [approve, meta.groupLabel, submit]);

  const workersColumns: ColumnDef<PayoutWorker>[] = [
    {
      id: "worker",
      header: "Worker",
      accessorFn: (row) => `${row.employeeName} ${row.employeeCode}`,
      cell: ({ row }) => (
        <div>
          <div className="font-semibold">{row.original.employeeName}</div>
          <div className="text-xs text-muted-foreground">{row.original.employeeCode}</div>
          {createdId && createdId === row.original.payment?.id ? <Badge className="mt-1" variant="secondary">Saved</Badge> : null}
        </div>
      ),
    },
    {
      id: "earned",
      header: "Earned",
      accessorFn: (row) => row.amountUsd,
      cell: ({ row }) => <NumericCell>${row.original.amountUsd.toFixed(2)}</NumericCell>,
    },
    {
      id: "paid",
      header: "Paid",
      accessorFn: (row) => row.paidAmountUsd,
      cell: ({ row }) => <NumericCell>{row.original.paidAmountUsd > 0 ? `$${row.original.paidAmountUsd.toFixed(2)}` : "-"}</NumericCell>,
    },
    {
      id: "dueDate",
      header: "Due Date",
      accessorFn: (row) => format(row.dueDate, "yyyy-MM-dd"),
      cell: ({ row }) => (
        <div>
          <NumericCell align="left">{format(row.original.dueDate, "MMM d, yyyy")}</NumericCell>
          {isBefore(row.original.dueDate, new Date()) && row.original.status !== "PAID" ? <div className="text-[10px] text-red-600">Past due</div> : null}
        </div>
      ),
    },
    {
      id: "continue",
      header: "",
      cell: () =>
        selectedGroup?.workflowStatus === "APPROVED" ? (
          <span className="text-xs text-muted-foreground">Ready for run generation</span>
        ) : (
          <span className="text-xs text-muted-foreground">Pending approval</span>
        ),
    },
  ];

  const loadError = goldQuery.error || batchQuery.error || paymentQuery.error;

  return (
    <HrShell
      activeTab="payouts"
      description={meta.description}
      actions={source !== "GOLD" ? <Button size="sm" onClick={() => setCreateOpen(true)}>New {meta.groupLabel}</Button> : undefined}
    >
      <RecordSavedBanner entityLabel={`${meta.label.toLowerCase()} record`} />

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(loadError)}</AlertDescription>
        </Alert>
      ) : null}

      {goldQuery.isLoading || batchQuery.isLoading || paymentQuery.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <DataTable
          data={groups}
          columns={columns}
          queryState={queryState}
          onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
          features={{ sorting: true, globalFilter: true, pagination: true }}
          pagination={{ enabled: true, server: false }}
          searchPlaceholder={`Search ${meta.groupLabel.toLowerCase()}, worker, or note`}
          toolbar={
            <>
              <Select value={source} onValueChange={(value) => {
                const nextSource = parseIrregularPayoutSource(value);
                setSource(nextSource);
                const params = new URLSearchParams(searchParams.toString());
                params.set("source", nextSource);
                router.replace(`/human-resources/payouts?${params.toString()}`);
              }}>
                <SelectTrigger size="sm" className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GOLD">Gold payouts</SelectItem>
                  <SelectItem value="COMMISSION">Commission payouts</SelectItem>
                  <SelectItem value="OTHER">Other payouts</SelectItem>
                </SelectContent>
              </Select>
              {source === "GOLD" ? (
                <Select value={windowWeeks} onValueChange={setWindowWeeks}>
                  <SelectTrigger size="sm" className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 weeks</SelectItem>
                    <SelectItem value="4">4 weeks</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              <span className="text-xs text-muted-foreground">Groups <span className="font-mono text-foreground">{groups.length}</span></span>
              <span className="text-xs text-muted-foreground">Workers <span className="font-mono text-foreground">{groups.reduce((sum, group) => sum + group.workers.length, 0)}</span></span>
              <span className="text-xs text-muted-foreground">Total Due <span className="font-mono text-foreground">${groups.reduce((sum, group) => sum + group.totalValueUsd, 0).toFixed(2)}</span></span>
            </>
          }
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New {meta.groupLabel}</DialogTitle>
            <DialogDescription>Create a manual irregular payout batch for review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Label" value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input type="date" value={batchPeriodStart} onChange={(event) => setBatchPeriodStart(event.target.value)} />
              <Input type="date" value={batchPeriodEnd} onChange={(event) => setBatchPeriodEnd(event.target.value)} />
              <Input type="date" value={batchDueDate} onChange={(event) => setBatchDueDate(event.target.value)} />
            </div>
            <Input value={batchCurrency} onChange={(event) => setBatchCurrency(event.target.value)} />
            <Textarea rows={3} value={batchNotes} onChange={(event) => setBatchNotes(event.target.value)} placeholder="Notes" />
            {batchItems.map((item, index) => (
              <div key={`batch-item-${index}`} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_2fr_auto]">
                <Select value={item.employeeId || "__none"} onValueChange={(value) => setBatchItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, employeeId: value === "__none" ? "" : value } : entry))}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select employee</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>{employee.name} ({employee.employeeId})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={item.amount} onChange={(event) => setBatchItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, amount: event.target.value } : entry))} placeholder="Amount" />
                <Input value={item.notes} onChange={(event) => setBatchItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, notes: event.target.value } : entry))} placeholder="Worker note" />
                <Button type="button" variant="outline" size="sm" disabled={batchItems.length === 1} onClick={() => setBatchItems((current) => current.filter((_, entryIndex) => entryIndex !== index))}>Remove</Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setBatchItems((current) => [...current, { employeeId: "", amount: "", notes: "" }])}>Add Worker</Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="button" disabled={createBatch.isPending || !batchLabel.trim()} onClick={() => createBatch.mutate()}>{createBatch.isPending ? "Creating..." : "Create Batch"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectionTarget)} onOpenChange={(open) => !open && setRejectionTarget(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Reject Payout Record</DialogTitle>
            <DialogDescription>Capture why this payout record is being rejected.</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectionTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={!rejectionNote.trim() || reject.isPending || !rejectionTarget} onClick={() => rejectionTarget && reject.mutate(rejectionTarget)}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedGroup)} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent size="full" className="max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>{selectedGroup?.label ?? "Members"}</DialogTitle>
            <DialogDescription>Review worker payout state for this record.</DialogDescription>
          </DialogHeader>
          {selectedGroup ? (
            <DataTable
              data={selectedGroup.workers}
              columns={workersColumns}
              features={{ globalFilter: false, pagination: false, sorting: false }}
              tableClassName="text-sm"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </HrShell>
  );
}
