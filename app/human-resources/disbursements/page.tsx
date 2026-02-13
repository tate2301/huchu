"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ArrowRight, FileText, Plus } from "@/lib/icons";
import { HrShell } from "@/components/human-resources/hr-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkflowStep } from "@/components/ui/workflow-step";
import { NumericCell } from "@/components/ui/numeric-cell";
import { useToast } from "@/components/ui/use-toast";
import {
  type DisbursementBatchRecord,
  fetchDisbursementBatches,
  fetchPayrollRuns,
  type PayrollRunRecord,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type BatchForm = {
  payrollRunId: string;
  goldRatePerUnit: string;
  goldRateUnit: string;
  cashCustodian: string;
  cashIssuedAt: string;
  notes: string;
};

type BatchDetails = {
  id: string;
  code: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
  totalAmount: number;
  itemCount: number;
  notes?: string | null;
  payrollRun: {
    id: string;
    runNumber: number;
    domain: "PAYROLL" | "GOLD_PAYOUT";
    period: {
      id: string;
      periodKey: string;
      startDate: string;
      endDate: string;
      dueDate: string;
    };
  };
  items: Array<{
    id: string;
    amount: number;
    paidAmount?: number | null;
    status: "DUE" | "PARTIAL" | "PAID";
    paidAt?: string | null;
    receiptReference?: string | null;
    notes?: string | null;
    employee: { id: string; employeeId: string; name: string };
    lineItem: {
      id: string;
      baseAmount: number;
      variableAmount: number;
      allowancesTotal: number;
      deductionsTotal: number;
      netAmount: number;
      currency: string;
    };
  }>;
};

type BatchDetailItem = BatchDetails["items"][number];

const emptyBatchForm: BatchForm = {
  payrollRunId: "",
  goldRatePerUnit: "",
  goldRateUnit: "g",
  cashCustodian: "",
  cashIssuedAt: format(new Date(), "yyyy-MM-dd"),
  notes: "",
};

function parseAppliedRate(notes?: string | null) {
  if (!notes) return null;
  const match = notes.match(
    /disbursement rate applied:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([^\s.]+)/i,
  );
  if (!match) return null;
  const rate = Number(match[1]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { rate, unit: match[2] };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function hydrateFormFromRun(
  run: PayrollRunRecord | undefined,
  current: BatchForm,
): BatchForm {
  if (!run) return current;
  if (run.domain === "GOLD_PAYOUT") {
    return {
      ...current,
      payrollRunId: run.id,
      goldRatePerUnit: run.goldRatePerUnit ? String(run.goldRatePerUnit) : "",
      goldRateUnit: run.goldRateUnit || "g",
    };
  }
  return {
    ...current,
    payrollRunId: run.id,
    goldRatePerUnit: "",
    goldRateUnit: "g",
  };
}

export default function DisbursementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const runIdFromQuery = searchParams.get("runId");
  const batchIdFromQuery = searchParams.get("batchId");

  const [batchForm, setBatchForm] = useState<BatchForm>({
    ...emptyBatchForm,
    payrollRunId: runIdFromQuery ?? "",
  });
  const [isCreateOpen, setIsCreateOpen] = useState(Boolean(runIdFromQuery));
  const [detailsBatchId, setDetailsBatchId] = useState<string | null>(
    batchIdFromQuery,
  );
  const [availableRunsQuery, setAvailableRunsQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  });
  const [batchesQuery, setBatchesQuery] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 10,
    search: "",
  });

  const {
    data: runsData,
    isLoading: runsLoading,
    error: runsError,
  } = useQuery({
    queryKey: ["payroll-runs", "approved-for-disbursement"],
    queryFn: () => fetchPayrollRuns({ status: "APPROVED", limit: 500 }),
  });
  const {
    data: batchesData,
    isLoading: batchesLoading,
    error: batchesError,
  } = useQuery({
    queryKey: ["disbursement-batches"],
    queryFn: () => fetchDisbursementBatches({ limit: 500 }),
  });

  const approvedRuns = useMemo(() => runsData?.data ?? [], [runsData]);
  const batches = useMemo(() => batchesData?.data ?? [], [batchesData]);

  const blockedRunIds = useMemo(
    () =>
      new Set(
        batches
          .filter((batch) => batch.status !== "REJECTED")
          .map((batch) => batch.payrollRunId),
      ),
    [batches],
  );
  const availableRuns = useMemo(
    () => approvedRuns.filter((run) => !blockedRunIds.has(run.id)),
    [approvedRuns, blockedRunIds],
  );

  const selectedRun = useMemo(
    () => availableRuns.find((run) => run.id === batchForm.payrollRunId),
    [availableRuns, batchForm.payrollRunId],
  );
  const isGoldSelection = selectedRun?.domain === "GOLD_PAYOUT";

  const previewAmount = useMemo(() => {
    if (!selectedRun) return 0;
    if (selectedRun.domain !== "GOLD_PAYOUT") return selectedRun.netTotal;
    const currentRate = Number(
      batchForm.goldRatePerUnit ||
        (selectedRun.goldRatePerUnit
          ? String(selectedRun.goldRatePerUnit)
          : ""),
    );
    if (!Number.isFinite(currentRate) || currentRate <= 0)
      return selectedRun.netTotal;
    if (selectedRun.goldRatePerUnit && selectedRun.goldRatePerUnit > 0) {
      const estimatedWeight =
        selectedRun.netTotal / selectedRun.goldRatePerUnit;
      return roundMoney(estimatedWeight * currentRate);
    }
    return selectedRun.netTotal;
  }, [selectedRun, batchForm.goldRatePerUnit]);

  const {
    data: batchDetails,
    isLoading: batchDetailsLoading,
    error: batchDetailsError,
  } = useQuery({
    queryKey: ["disbursement-batch-details", detailsBatchId],
    queryFn: () =>
      fetchJson<BatchDetails>(`/api/disbursements/batches/${detailsBatchId}`),
    enabled: Boolean(detailsBatchId),
  });

  const createBatchMutation = useMutation({
    mutationFn: async (payload: BatchForm) => {
      const run = availableRuns.find(
        (item) => item.id === payload.payrollRunId,
      );
      if (!run) throw new Error("Selected run is unavailable");

      const body: Record<string, unknown> = {
        payrollRunId: payload.payrollRunId,
        cashCustodian: payload.cashCustodian || undefined,
        cashIssuedAt: payload.cashIssuedAt || undefined,
        notes: payload.notes || undefined,
      };
      if (run.domain === "GOLD_PAYOUT") {
        body.goldRatePerUnit = Number(payload.goldRatePerUnit);
        body.goldRateUnit = payload.goldRateUnit || "g";
      }

      return fetchJson("/api/disbursements/batches", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({
        title: "Disbursement batch created",
        description: "Batch is ready for submit and approval.",
        variant: "success",
      });
      setIsCreateOpen(false);
      setBatchForm(emptyBatchForm);
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create batch",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const submitBatchMutation = useMutation({
    mutationFn: async (batchId: string) =>
      fetchJson(`/api/disbursements/batches/${batchId}/submit`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast({
        title: "Batch submitted",
        description: "Disbursement batch sent for approval.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to submit batch",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const approveBatchMutation = useMutation({
    mutationFn: async (batchId: string) =>
      fetchJson(`/api/disbursements/batches/${batchId}/approve`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast({
        title: "Batch approved",
        description: "Run archived and batch ready for payout recording.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to approve batch",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const batch = await fetchJson<{
        id: string;
        items: Array<{ id: string }>;
      }>(`/api/disbursements/batches/${batchId}`);

      return fetchJson(`/api/disbursements/batches/${batchId}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          items: batch.items.map((item) => ({ id: item.id })),
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Batch payment recorded",
        description:
          "All disbursement items marked and synced to employee payments.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["disbursement-batches"] });
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to record payment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const availableRunColumns = useMemo<ColumnDef<PayrollRunRecord>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        cell: ({ row }) => (
          <div className="font-medium">
            <NumericCell>Run #{row.original.runNumber}</NumericCell>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.domain === "GOLD_PAYOUT" ? "Gold Payout" : "Salary Payroll"}
          </Badge>
        ),
      },
      {
        accessorKey: "period.periodKey",
        header: "Period",
        cell: ({ row }) => row.original.period.periodKey,
      },
      {
        id: "approvedRate",
        header: "Approved Rate",
        cell: ({ row }) =>
          row.original.domain === "GOLD_PAYOUT" && row.original.goldRatePerUnit
            ? (
              <NumericCell>
                {row.original.goldRatePerUnit.toFixed(4)} / {row.original.goldRateUnit}
              </NumericCell>
            )
            : "-",
      },
      {
        accessorKey: "netTotal",
        header: "Net Total",
        cell: ({ row }) => <NumericCell>{row.original.netTotal.toFixed(2)}</NumericCell>,
      },
      {
        id: "action",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              size="sm"
              onClick={() => {
                setBatchForm((prev) => hydrateFormFromRun(row.original, prev));
                setIsCreateOpen(true);
              }}
            >
              Create Batch
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const batchColumns = useMemo<ColumnDef<DisbursementBatchRecord>[]>(
    () => [
      {
        id: "batch",
        header: "Batch",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.code}</div>
            <div className="text-xs text-muted-foreground">{row.original.method}</div>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.payrollRun.domain === "GOLD_PAYOUT" ? "Gold Payout" : "Salary Payroll"}
          </Badge>
        ),
      },
      {
        id: "run",
        header: "Run",
        cell: ({ row }) => (
          <div>
            <div>
              <NumericCell>Run #{row.original.payrollRun.runNumber}</NumericCell>
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.payrollRun.period?.periodKey ?? "-"}
            </div>
          </div>
        ),
      },
      {
        id: "rate",
        header: "Applied Rate",
        cell: ({ row }) => {
          const parsedRate = parseAppliedRate(row.original.notes);
          const isGold = row.original.payrollRun.domain === "GOLD_PAYOUT";
          if (!isGold) return "-";
          if (parsedRate) return <NumericCell>{parsedRate.rate.toFixed(4)} / {parsedRate.unit}</NumericCell>;
          if (row.original.payrollRun.goldRatePerUnit) {
            return (
              <NumericCell>
                {row.original.payrollRun.goldRatePerUnit.toFixed(4)} / {row.original.payrollRun.goldRateUnit}
              </NumericCell>
            );
          }
          return "-";
        },
      },
      {
        accessorKey: "totalAmount",
        header: "Amount",
        cell: ({ row }) => <NumericCell>{row.original.totalAmount.toFixed(2)}</NumericCell>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "PAID" ? "secondary" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <NumericCell>
            {format(new Date(row.original.createdAt), "yyyy-MM-dd HH:mm")}
          </NumericCell>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <div className="flex justify-end gap-2">
              {(status === "DRAFT" || status === "REJECTED") ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={submitBatchMutation.isPending}
                  onClick={() => submitBatchMutation.mutate(row.original.id)}
                >
                  Submit
                </Button>
              ) : null}
              {status === "SUBMITTED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={approveBatchMutation.isPending}
                  onClick={() => approveBatchMutation.mutate(row.original.id)}
                >
                  Approve
                </Button>
              ) : null}
              {status === "APPROVED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markPaidMutation.isPending}
                  onClick={() => markPaidMutation.mutate(row.original.id)}
                >
                  Mark Paid
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDetailsBatchId(row.original.id)}
              >
                Details
              </Button>
            </div>
          );
        },
      },
    ],
    [
      approveBatchMutation,
      markPaidMutation,
      submitBatchMutation,
    ],
  );

  const batchDetailColumns = useMemo<ColumnDef<BatchDetailItem>[]>(
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
        id: "amount",
        header: "Amount",
        accessorFn: (row) => row.amount,
        cell: ({ row }) => (
          <NumericCell>
            {row.original.lineItem.currency} {row.original.amount.toFixed(2)}
          </NumericCell>
        ),
      },
      {
        id: "paid",
        header: "Paid",
        accessorFn: (row) => row.paidAmount ?? 0,
        cell: ({ row }) => (
          <NumericCell>
            {row.original.lineItem.currency} {(row.original.paidAmount ?? 0).toFixed(2)}
          </NumericCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "PAID" ? "secondary" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "paidAt",
        header: "Paid At",
        accessorFn: (row) => row.paidAt ?? "",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.paidAt ? format(new Date(row.original.paidAt), "yyyy-MM-dd HH:mm") : "-"}
          </NumericCell>
        ),
      },
      {
        id: "receipt",
        header: "Receipt",
        accessorFn: (row) => row.receiptReference ?? "",
        cell: ({ row }) => row.original.receiptReference ?? "-",
      },
    ],
    [],
  );

  return (
    <HrShell
      activeTab="disbursements"
      description="Cash disbursement batches from approved salary and gold payout runs."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/human-resources/salaries/outstanding">
            Outstanding Salaries
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      {(runsError || batchesError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load disbursement data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(runsError || batchesError)}
          </AlertDescription>
        </Alert>
      )}

      {runIdFromQuery && !selectedRun && (
        <Alert>
          <AlertTitle>Selected run is unavailable</AlertTitle>
          <AlertDescription>
            The run from the link is no longer eligible for a new disbursement
            batch.
          </AlertDescription>
        </Alert>
      )}

      {(runsLoading || availableRuns.length > 0) ? (
        <WorkflowStep
          title="Approved Runs Ready for Disbursement"
          description={
            runsLoading
              ? "Loading approved salary and gold payout runs."
              : "Salary and gold payout runs are disbursed from one workflow."
          }
          badge={runsLoading ? "..." : availableRuns.length}
          actions={
            <Button type="button" onClick={() => setIsCreateOpen(true)} disabled={runsLoading}>
              <Plus className="size-4" />
              New Disbursement Batch
            </Button>
          }
        >
          {runsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <DataTable
              data={availableRuns}
              columns={availableRunColumns}
              queryState={availableRunsQuery}
              onQueryStateChange={(next) =>
                setAvailableRunsQuery((prev) => ({ ...prev, ...next }))
              }
              features={{ sorting: true, globalFilter: true, pagination: true }}
              pagination={{ enabled: true, server: false }}
              searchPlaceholder="Search approved runs"
              tableClassName="text-sm"
            />
          )}
        </WorkflowStep>
      ) : null}

      <WorkflowStep
        title="Disbursement Batch Workflow"
        description="Once a disbursement batch is approved, the underlying payroll run is archived."
        badge={batchesLoading ? "..." : batches.length}
      >
        {batchesLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : batches.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No disbursement batches yet.
          </div>
        ) : (
          <DataTable
            data={batches}
            columns={batchColumns}
            queryState={batchesQuery}
            onQueryStateChange={(next) =>
              setBatchesQuery((prev) => ({ ...prev, ...next }))
            }
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search disbursement batches"
            tableClassName="text-sm"
          />
        )}
      </WorkflowStep>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Disbursement Batch</DialogTitle>
            <DialogDescription>
              Select an approved run and confirm disbursement details.
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!batchForm.payrollRunId) {
                toast({
                  title: "Select an approved run",
                  variant: "destructive",
                });
                return;
              }
              if (isGoldSelection) {
                const rate = Number(
                  batchForm.goldRatePerUnit ||
                    (selectedRun?.goldRatePerUnit
                      ? String(selectedRun.goldRatePerUnit)
                      : ""),
                );
                if (!Number.isFinite(rate) || rate <= 0) {
                  toast({
                    title: "Enter a valid current gold rate",
                    variant: "destructive",
                  });
                  return;
                }
                createBatchMutation.mutate({
                  ...batchForm,
                  goldRatePerUnit: String(rate),
                  goldRateUnit:
                    batchForm.goldRateUnit || selectedRun?.goldRateUnit || "g",
                });
                return;
              }
              createBatchMutation.mutate(batchForm);
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Approved Payroll Run
              </label>
              <Select
                value={batchForm.payrollRunId}
                onValueChange={(value) => {
                  const run = availableRuns.find((item) => item.id === value);
                  setBatchForm((prev) => hydrateFormFromRun(run, prev));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select approved run" />
                </SelectTrigger>
                <SelectContent>
                  {availableRuns.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No approved runs
                    </SelectItem>
                  ) : (
                    availableRuns.map((run) => (
                      <SelectItem key={run.id} value={run.id}>
                        {run.domain === "GOLD_PAYOUT" ? "Gold" : "Salary"} - Run
                        #{run.runNumber} ({run.period.periodKey})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {isGoldSelection && (
              <div className="grid gap-3 md:grid-cols-[1fr,140px]">
                <div>
                  <label
                    htmlFor="disbursement-rate"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Current Gold Rate
                  </label>
                  <Input
                    id="disbursement-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={batchForm.goldRatePerUnit}
                    onChange={(event) =>
                      setBatchForm((prev) => ({
                        ...prev,
                        goldRatePerUnit: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Rate Unit
                  </label>
                  <Select
                    value={batchForm.goldRateUnit}
                    onValueChange={(value) =>
                      setBatchForm((prev) => ({ ...prev, goldRateUnit: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="cash-custodian"
                  className="mb-2 block text-sm font-semibold"
                >
                  Cash Custodian
                </label>
                <Input
                  id="cash-custodian"
                  value={batchForm.cashCustodian}
                  onChange={(event) =>
                    setBatchForm((prev) => ({
                      ...prev,
                      cashCustodian: event.target.value,
                    }))
                  }
                  placeholder="Name of custodian"
                />
              </div>
              <div>
                <label
                  htmlFor="cash-issued"
                  className="mb-2 block text-sm font-semibold"
                >
                  Cash Issued Date
                </label>
                <Input
                  id="cash-issued"
                  type="date"
                  value={batchForm.cashIssuedAt}
                  onChange={(event) =>
                    setBatchForm((prev) => ({
                      ...prev,
                      cashIssuedAt: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="batch-notes"
                className="mb-2 block text-sm font-semibold"
              >
                Notes
              </label>
              <Input
                id="batch-notes"
                value={batchForm.notes}
                onChange={(event) =>
                  setBatchForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder="Optional note"
              />
            </div>

            {selectedRun ? (
              <div className="rounded-md border-0 bg-muted/40 p-3 text-sm shadow-[var(--surface-frame-shadow)]">
                <div className="font-medium">Preview</div>
                <div className="text-muted-foreground">
                  {selectedRun.domain === "GOLD_PAYOUT"
                    ? "Gold payout"
                    : "Salary payroll"}{" "}
                  run #{selectedRun.runNumber} ({selectedRun.period.periodKey})
                </div>
                <div className="mt-1">
                  Estimated batch amount: {previewAmount.toFixed(2)}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createBatchMutation.isPending}>
                <FileText className="size-4" />
                Create Batch
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailsBatchId)}
        onOpenChange={(open) => !open && setDetailsBatchId(null)}
      >
        <DialogContent className="max-w-9xl">
          <DialogHeader>
            <DialogTitle>Disbursement Batch Details</DialogTitle>
            <DialogDescription>
              Review exactly who is being paid and how much in this batch.
            </DialogDescription>
          </DialogHeader>

          {batchDetailsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : batchDetailsError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load batch details</AlertTitle>
              <AlertDescription>
                {getApiErrorMessage(batchDetailsError)}
              </AlertDescription>
            </Alert>
          ) : !batchDetails ? (
            <div className="text-sm text-muted-foreground">
              No details available.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Batch</div>
                  <div className="font-semibold">{batchDetails.code}</div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Run</div>
                  <div className="font-semibold">
                    <NumericCell>#{batchDetails.payrollRun.runNumber}</NumericCell> (
                    {batchDetails.payrollRun.period.periodKey})
                  </div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">
                    Total Amount
                  </div>
                  <div className="font-semibold">
                    <NumericCell>{batchDetails.totalAmount.toFixed(2)}</NumericCell>
                  </div>
                </div>
                <div className="rounded-md border-0 p-2 shadow-[var(--surface-frame-shadow)]">
                  <div className="text-xs text-muted-foreground">Items</div>
                  <div className="font-semibold"><NumericCell>{batchDetails.itemCount}</NumericCell></div>
                </div>
              </div>

              <div className="rounded-md border-0 shadow-[var(--surface-frame-shadow)]">
                <DataTable
                  data={batchDetails.items}
                  columns={batchDetailColumns}
                  features={{ globalFilter: false, pagination: false, sorting: true }}
                  maxBodyHeight="45dvh"
                  tableClassName="text-sm"
                  tableContainerClassName="overflow-auto"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </HrShell>
  );
}
