"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { DataTable, type DataTableQueryState } from "@corelithzw/ui/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { Input } from "@corelithzw/ui/components/input";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { SectionTab, SectionTabs } from "@corelithzw/ui/components/section-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchEmployees } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  getSettlementSourceMeta,
  parseSettlementSource,
  resolveDefaultSettlementSource,
} from "@/lib/settlements/sources";
import type { SettlementSource } from "@corelithzw/db";

/**
 * Settlements, end to end: what is owed, what it computes to, and what left.
 *
 * The screen this replaces read three unrelated shapes and stitched them
 * together in the browser — `GoldShiftAllocation` for gold, `IrregularPayoutBatch`
 * for everything else, then `EmployeePayment` rows matched back onto both by
 * *date range* because nothing linked them. Two sources of truth for one
 * question, reconciled with `findPayment`.
 *
 * Now there is one pipeline, and it is the same three stages whatever is being
 * settled:
 *
 *   **Intake** — what is owed, entered by whoever counted it. Gold has none:
 *   its quantities come from `GoldShiftAllocation`, which the gold module
 *   already approves, so a second set of gram figures would give two answers.
 *   **Run** — the computed settlement, frozen. Rates and quantities cannot be
 *   restated afterwards.
 *   **Batch** — money leaving, per currency, marked paid per person because a
 *   cashier short of change pays 47 against 47.50.
 *
 * The stages are tabs rather than one merged table because the actions differ:
 * you approve a count, you approve a computation, and you hand over cash. They
 * were the same row before, and the "Submit" button meant a different thing
 * depending on which kind of row it was on.
 */

type WorkflowStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type RunStatus = WorkflowStatus | "POSTED";
type BatchStatus = WorkflowStatus | "PAID";

type Stage = "intakes" | "runs" | "batches";

type EmployeeRef = { id: string; employeeId: string; name: string };

type Intake = {
  id: string;
  source: SettlementSource;
  label: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  currency: string;
  workflowStatus: WorkflowStatus;
  notes: string | null;
  items: Array<{
    id: string;
    quantity: string;
    unit: string;
    amount: string;
    notes: string | null;
    employee: EmployeeRef;
  }>;
};

type Run = {
  id: string;
  code: string;
  source: SettlementSource;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  currency: string;
  mode: "CURRENT_PERIOD" | "NEXT_PERIOD";
  ratePerUnit: string | null;
  rateUnit: string;
  totalQuantity: string;
  totalAmount: string;
  status: RunStatus;
  postingSkippedReason: string | null;
  lines: Array<{
    id: string;
    quantity: string;
    unit: string;
    unitRate: string;
    grossAmount: string;
    netAmount: string;
    currency: string;
    employee: EmployeeRef;
  }>;
  _count: { batches: number };
  warnings?: string[];
};

type Batch = {
  id: string;
  code: string;
  currency: string;
  method: string;
  status: BatchStatus;
  totalAmount: string;
  itemCount: number;
  paidAt: string | null;
  run: {
    id: string;
    code: string;
    source: SettlementSource;
    periodStart: string;
    periodEnd: string;
  };
  items: Array<{
    id: string;
    amount: string;
    paidAmount: string | null;
    currency: string;
    status: string;
    paidAt: string | null;
    employee: EmployeeRef;
  }>;
};

type Paginated<T> = { data: T[]; pagination?: { total: number } };

type IntakeItemDraft = { employeeId: string; quantity: string; amount: string; notes: string };

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "intakes", label: "Intakes" },
  { id: "runs", label: "Runs" },
  { id: "batches", label: "Payments" },
];

function parseStage(value: string | null): Stage | null {
  return STAGES.some((stage) => stage.id === value) ? (value as Stage) : null;
}

function statusVariant(status: string) {
  switch (status) {
    case "APPROVED":
    case "POSTED":
    case "PAID":
      return "success";
    case "REJECTED":
      return "destructive";
    default:
      return "warning";
  }
}

function toNumber(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amount(value: string | null | undefined) {
  return toNumber(value).toFixed(2);
}

function day(value: string) {
  return format(new Date(value), "MMM d, yyyy");
}

function period(start: string, end: string) {
  return `${format(new Date(start), "MMM d")} to ${format(new Date(end), "MMM d, yyyy")}`;
}

function today() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function SettlementApprovalsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const preferredSource = useMemo(() => {
    const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)
      ?.enabledFeatures;
    // `parseSettlementSource` returns null on anything unrecognised rather than
    // quietly defaulting to GOLD, so an unreadable `?source=` falls back to what
    // this workspace actually settles instead of showing a scrap yard gold.
    return (
      parseSettlementSource(searchParams.get("source")) ??
      resolveDefaultSettlementSource(enabledFeatures)
    );
  }, [searchParams, session]);

  const [source, setSource] = useState<SettlementSource>(preferredSource);
  // Gold has no intake stage, so landing a gold workspace on it would open an
  // explanatory panel rather than any work.
  const [stage, setStage] = useState<Stage>(
    parseStage(searchParams.get("stage")) ?? (preferredSource === "GOLD" ? "runs" : "intakes"),
  );
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });

  useEffect(() => {
    setSource(preferredSource);
  }, [preferredSource]);

  const meta = getSettlementSourceMeta(source);
  const isGold = source === "GOLD";

  const [membersOf, setMembersOf] = useState<
    { title: string; subtitle: string; rows: MemberRow[] } | null
  >(null);
  const [rejection, setRejection] = useState<
    { kind: "intake" | "run"; id: string; label: string } | null
  >(null);
  const [rejectionNote, setRejectionNote] = useState("");

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeLabel, setIntakeLabel] = useState("");
  const [intakePeriodStart, setIntakePeriodStart] = useState(today);
  const [intakePeriodEnd, setIntakePeriodEnd] = useState(today);
  const [intakeDueDate, setIntakeDueDate] = useState(today);
  const [intakeCurrency, setIntakeCurrency] = useState("USD");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [intakeItems, setIntakeItems] = useState<IntakeItemDraft[]>([
    { employeeId: "", quantity: "", amount: "", notes: "" },
  ]);

  const [runOpen, setRunOpen] = useState(false);
  const [runPeriodStart, setRunPeriodStart] = useState(today);
  const [runPeriodEnd, setRunPeriodEnd] = useState(today);
  const [runMode, setRunMode] = useState<"CURRENT_PERIOD" | "NEXT_PERIOD">("CURRENT_PERIOD");

  const [payingBatch, setPayingBatch] = useState<Batch | null>(null);
  const [paidAmounts, setPaidAmounts] = useState<Record<string, string>>({});

  const intakesQuery = useQuery({
    queryKey: ["settlement-intakes", source],
    queryFn: () => fetchJson<Paginated<Intake>>(`/api/settlements/intakes?source=${source}&limit=100`),
    enabled: !isGold,
  });

  const runsQuery = useQuery({
    queryKey: ["settlement-runs", source],
    queryFn: () => fetchJson<Paginated<Run>>(`/api/settlements/runs?source=${source}&limit=100`),
  });

  const batchesQuery = useQuery({
    queryKey: ["settlement-batches", source],
    queryFn: () => fetchJson<Paginated<Batch>>(`/api/settlements/batches?source=${source}&limit=100`),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "settlement-intake"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
    enabled: intakeOpen,
  });
  const employees = employeesQuery.data?.data ?? [];

  const intakes = intakesQuery.data?.data ?? [];
  const runs = runsQuery.data?.data ?? [];
  const batches = batchesQuery.data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["settlement-intakes"] });
    queryClient.invalidateQueries({ queryKey: ["settlement-runs"] });
    queryClient.invalidateQueries({ queryKey: ["settlement-batches"] });
    queryClient.invalidateQueries({ queryKey: ["settlement-payments"] });
  };

  const setUrl = (next: { source?: SettlementSource; stage?: Stage }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.source) params.set("source", next.source);
    if (next.stage) params.set("stage", next.stage);
    router.replace(`/gold/settlement/approvals?${params.toString()}`);
  };

  const workflow = useMutation({
    mutationFn: async (input: {
      path: string;
      note?: string;
      successTitle: string;
      successBody: string;
    }) =>
      fetchJson(input.path, {
        method: "POST",
        body: input.note ? JSON.stringify({ note: input.note }) : undefined,
      }).then(() => input),
    onSuccess: (input) => {
      toast({ title: input.successTitle, description: input.successBody, variant: "success" });
      setRejection(null);
      setRejectionNote("");
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "That could not be recorded",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const createIntake = useMutation({
    mutationFn: async () =>
      fetchJson("/api/settlements/intakes", {
        method: "POST",
        body: JSON.stringify({
          source,
          label: intakeLabel.trim(),
          periodStart: intakePeriodStart,
          periodEnd: intakePeriodEnd,
          dueDate: intakeDueDate,
          currency: intakeCurrency.trim().toUpperCase() || "USD",
          notes: intakeNotes.trim() || undefined,
          items: intakeItems
            .filter((item) => item.employeeId && item.amount.trim() !== "")
            .map((item) => ({
              employeeId: item.employeeId,
              quantity: item.quantity.trim() === "" ? undefined : Number(item.quantity),
              amount: Number(item.amount),
              notes: item.notes.trim() || undefined,
            })),
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Intake recorded",
        description: "Nothing is owed until it is approved.",
        variant: "success",
      });
      setIntakeOpen(false);
      setIntakeLabel("");
      setIntakeNotes("");
      setIntakeItems([{ employeeId: "", quantity: "", amount: "", notes: "" }]);
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Unable to record the intake",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const generateRun = useMutation({
    mutationFn: async (replaceDraft: boolean) =>
      fetchJson<Run>("/api/settlements/runs", {
        method: "POST",
        body: JSON.stringify({
          source,
          periodStart: runPeriodStart,
          periodEnd: runPeriodEnd,
          mode: runMode,
          replaceDraft,
        }),
      }),
    onSuccess: (run) => {
      toast({
        title: `${run.code} computed`,
        description: run.warnings?.length
          ? run.warnings.join(" ")
          : `${run.lines.length} to settle, ${amount(run.totalAmount)} ${run.currency}.`,
        variant: run.warnings?.length ? "warning" : "success",
      });
      setRunOpen(false);
      setStage("runs");
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Nothing was computed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const createBatch = useMutation({
    mutationFn: async (run: Run) =>
      fetchJson<Batch>("/api/settlements/batches", {
        method: "POST",
        body: JSON.stringify({ settlementRunId: run.id, currency: run.currency }),
      }),
    onSuccess: (batch) => {
      toast({
        title: `${batch.code} ready`,
        description: `${batch.itemCount} to pay in ${batch.currency}.`,
        variant: "success",
      });
      setStage("batches");
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Unable to prepare the payment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const markPaid = useMutation({
    mutationFn: async (batch: Batch) =>
      fetchJson<Batch>(`/api/settlements/batches/${batch.id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          items: batch.items.map((item) => ({
            itemId: item.id,
            paidAmount: Number(paidAmounts[item.id] ?? item.amount),
          })),
        }),
      }),
    onSuccess: (batch) => {
      toast({
        title: batch.status === "PAID" ? `${batch.code} paid` : `${batch.code} part-paid`,
        description:
          batch.status === "PAID"
            ? "Everybody on this batch has been settled in full."
            : "A balance is still outstanding and stays on the batch.",
        variant: "success",
      });
      setPayingBatch(null);
      setPaidAmounts({});
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Unable to record the payment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const intakeColumns = useMemo<ColumnDef<Intake>[]>(
    () => [
      {
        id: "label",
        header: meta.groupLabel,
        accessorFn: (row) => `${row.label} ${row.notes ?? ""}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.label}</div>
            <div className="text-xs text-muted-foreground">
              {period(row.original.periodStart, row.original.periodEnd)}
            </div>
          </div>
        ),
      },
      {
        id: "people",
        header: "People",
        accessorFn: (row) => row.items.length,
        cell: ({ row }) => <NumericCell>{row.original.items.length}</NumericCell>,
      },
      {
        id: "amount",
        header: "Owed",
        accessorFn: (row) =>
          row.items.reduce((sum, item) => sum + toNumber(item.amount), 0),
        cell: ({ row }) => (
          <NumericCell>
            {amount(
              String(row.original.items.reduce((sum, item) => sum + toNumber(item.amount), 0)),
            )}{" "}
            {row.original.currency}
          </NumericCell>
        ),
      },
      {
        id: "due",
        header: "Due",
        accessorFn: (row) => row.dueDate,
        cell: ({ row }) => <NumericCell align="left">{day(row.original.dueDate)}</NumericCell>,
      },
      {
        id: "status",
        header: "Workflow",
        accessorFn: (row) => row.workflowStatus,
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.workflowStatus)}>
            {row.original.workflowStatus}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const intake = row.original;
          return (
            <div className="flex justify-end gap-2">
              {intake.workflowStatus === "DRAFT" || intake.workflowStatus === "REJECTED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    workflow.mutate({
                      path: `/api/settlements/intakes/${intake.id}/submit`,
                      successTitle: "Submitted",
                      successBody: `${intake.label} is waiting for approval.`,
                    })
                  }
                >
                  Submit
                </Button>
              ) : null}
              {intake.workflowStatus === "SUBMITTED" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      workflow.mutate({
                        path: `/api/settlements/intakes/${intake.id}/approve`,
                        successTitle: "Approved",
                        successBody: `${intake.label} can now be computed into a run.`,
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRejection({ kind: "intake", id: intake.id, label: intake.label })
                    }
                  >
                    Reject
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setMembersOf({
                    title: intake.label,
                    subtitle: `${period(intake.periodStart, intake.periodEnd)} · ${intake.currency}`,
                    rows: intake.items.map((item) => ({
                      id: item.id,
                      employee: item.employee,
                      quantity: item.quantity,
                      unit: item.unit,
                      owed: item.amount,
                      paid: null,
                      status: intake.workflowStatus === "APPROVED" ? "Ready to settle" : "Not owed yet",
                    })),
                  })
                }
              >
                View people
              </Button>
            </div>
          );
        },
      },
    ],
    [meta.groupLabel, workflow],
  );

  const runColumns = useMemo<ColumnDef<Run>[]>(
    () => [
      {
        id: "code",
        header: "Run",
        accessorFn: (row) => row.code,
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.code}</div>
            <div className="text-xs text-muted-foreground">
              {period(row.original.periodStart, row.original.periodEnd)}
            </div>
          </div>
        ),
      },
      {
        id: "quantity",
        header: "Quantity",
        accessorFn: (row) => toNumber(row.totalQuantity),
        cell: ({ row }) => (
          <NumericCell>
            {toNumber(row.original.totalQuantity) > 0
              ? `${toNumber(row.original.totalQuantity).toFixed(4)} ${row.original.rateUnit}`
              : "-"}
          </NumericCell>
        ),
      },
      {
        id: "rate",
        header: "Rate",
        accessorFn: (row) => toNumber(row.ratePerUnit),
        cell: ({ row }) => (
          <NumericCell>
            {row.original.ratePerUnit
              ? `${toNumber(row.original.ratePerUnit).toFixed(4)} / ${row.original.rateUnit}`
              : "-"}
          </NumericCell>
        ),
      },
      {
        id: "total",
        header: "Value",
        accessorFn: (row) => toNumber(row.totalAmount),
        cell: ({ row }) => (
          <NumericCell>
            {amount(row.original.totalAmount)} {row.original.currency}
          </NumericCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <div>
            <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>
            {row.original.postingSkippedReason ? (
              <div className="mt-1 text-[10px] text-muted-foreground">
                {row.original.postingSkippedReason}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const run = row.original;
          return (
            <div className="flex justify-end gap-2">
              {run.status === "DRAFT" || run.status === "REJECTED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    workflow.mutate({
                      path: `/api/settlements/runs/${run.id}/submit`,
                      successTitle: "Submitted",
                      successBody: `${run.code} is waiting for approval.`,
                    })
                  }
                >
                  Submit
                </Button>
              ) : null}
              {run.status === "SUBMITTED" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      workflow.mutate({
                        path: `/api/settlements/runs/${run.id}/approve`,
                        successTitle: "Approved",
                        successBody: `${run.code} can now be paid.`,
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRejection({ kind: "run", id: run.id, label: run.code })}
                  >
                    Reject
                  </Button>
                </>
              ) : null}
              {run.status === "APPROVED" || run.status === "POSTED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={createBatch.isPending}
                  onClick={() => createBatch.mutate(run)}
                >
                  Prepare payment
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setMembersOf({
                    title: run.code,
                    subtitle: `${period(run.periodStart, run.periodEnd)} · ${run.currency}`,
                    rows: run.lines.map((line) => ({
                      id: line.id,
                      employee: line.employee,
                      quantity: line.quantity,
                      unit: line.unit,
                      owed: line.netAmount,
                      paid: null,
                      status: `${toNumber(line.unitRate).toFixed(4)} per ${line.unit}`,
                    })),
                  })
                }
              >
                View lines
              </Button>
            </div>
          );
        },
      },
    ],
    [createBatch, workflow],
  );

  const batchColumns = useMemo<ColumnDef<Batch>[]>(
    () => [
      {
        id: "code",
        header: "Payment",
        accessorFn: (row) => `${row.code} ${row.run.code}`,
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.code}</div>
            <div className="text-xs text-muted-foreground">
              from {row.original.run.code} · {row.original.method.toLowerCase()}
            </div>
          </div>
        ),
      },
      {
        id: "people",
        header: "People",
        accessorFn: (row) => row.itemCount,
        cell: ({ row }) => <NumericCell>{row.original.itemCount}</NumericCell>,
      },
      {
        id: "total",
        header: "Amount",
        accessorFn: (row) => toNumber(row.totalAmount),
        cell: ({ row }) => (
          <NumericCell>
            {amount(row.original.totalAmount)} {row.original.currency}
          </NumericCell>
        ),
      },
      {
        id: "outstanding",
        header: "Outstanding",
        accessorFn: (row) =>
          row.items.reduce(
            (sum, item) => sum + Math.max(0, toNumber(item.amount) - toNumber(item.paidAmount)),
            0,
          ),
        cell: ({ row }) => {
          const outstanding = row.original.items.reduce(
            (sum, item) => sum + Math.max(0, toNumber(item.amount) - toNumber(item.paidAmount)),
            0,
          );
          return (
            <NumericCell>{outstanding > 0 ? outstanding.toFixed(2) : "-"}</NumericCell>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <div>
            <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>
            {row.original.paidAt ? (
              <div className="mt-1 text-[10px] text-muted-foreground">
                {day(row.original.paidAt)}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const batch = row.original;
          return (
            <div className="flex justify-end gap-2">
              {batch.status === "DRAFT" || batch.status === "REJECTED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    workflow.mutate({
                      path: `/api/settlements/batches/${batch.id}/submit`,
                      successTitle: "Submitted",
                      successBody: `${batch.code} is waiting for approval.`,
                    })
                  }
                >
                  Submit
                </Button>
              ) : null}
              {batch.status === "SUBMITTED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    workflow.mutate({
                      path: `/api/settlements/batches/${batch.id}/approve`,
                      successTitle: "Approved",
                      successBody: `${batch.code} can now be handed over.`,
                    })
                  }
                >
                  Approve
                </Button>
              ) : null}
              {batch.status === "APPROVED" || batch.status === "PAID" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPayingBatch(batch);
                    setPaidAmounts(
                      Object.fromEntries(
                        batch.items.map((item) => [
                          item.id,
                          // Defaults to what is still owed, not to the full
                          // amount: reopening a part-paid batch to pay the
                          // balance is the common case.
                          Math.max(
                            0,
                            toNumber(item.amount) - toNumber(item.paidAmount),
                          ).toFixed(2),
                        ]),
                      ),
                    );
                  }}
                >
                  {batch.status === "PAID" ? "Adjust" : "Mark paid"}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setMembersOf({
                    title: batch.code,
                    subtitle: `${batch.run.code} · ${batch.currency}`,
                    rows: batch.items.map((item) => ({
                      id: item.id,
                      employee: item.employee,
                      quantity: null,
                      unit: "",
                      owed: item.amount,
                      paid: item.paidAmount,
                      status: item.status,
                    })),
                  })
                }
              >
                View people
              </Button>
            </div>
          );
        },
      },
    ],
    [workflow],
  );

  const loadError = intakesQuery.error || runsQuery.error || batchesQuery.error;
  const isLoading =
    stage === "intakes"
      ? intakesQuery.isPending && !isGold
      : stage === "runs"
        ? runsQuery.isPending
        : batchesQuery.isPending;

  const toolbar = (
    <>
      <Select
        value={source}
        onValueChange={(value) => {
          const nextSource = parseSettlementSource(value) ?? source;
          setSource(nextSource);
          const nextStage = nextSource === "GOLD" && stage === "intakes" ? "runs" : stage;
          setStage(nextStage);
          setUrl({ source: nextSource, stage: nextStage });
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="GOLD">Gold settlements</SelectItem>
          <SelectItem value="SCRAP">Scrap settlements</SelectItem>
          <SelectItem value="COMMISSION">Commission settlements</SelectItem>
          <SelectItem value="OTHER">Settlements</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        Awaiting approval{" "}
        <span className="font-mono text-foreground">
          {intakes.filter((intake) => intake.workflowStatus === "SUBMITTED").length +
            runs.filter((run) => run.status === "SUBMITTED").length +
            batches.filter((batch) => batch.status === "SUBMITTED").length}
        </span>
      </span>
      <span className="text-xs text-muted-foreground">
        Outstanding{" "}
        <span className="font-mono text-foreground">
          {batches
            .flatMap((batch) => batch.items)
            .reduce(
              (sum, item) =>
                sum + Math.max(0, toNumber(item.amount) - toNumber(item.paidAmount)),
              0,
            )
            .toFixed(2)}
        </span>
      </span>
    </>
  );

  return (
    <GoldShell
      activeTab="payouts"
      title="Settlements"
      actions={
        stage === "intakes" && !isGold ? (
          <Button size="sm" onClick={() => setIntakeOpen(true)}>
            {meta.createLabel}
          </Button>
        ) : stage === "runs" ? (
          <Button size="sm" onClick={() => setRunOpen(true)}>
            Compute a run
          </Button>
        ) : undefined
      }
    >
      <RecordSavedBanner entityLabel={`${meta.label.toLowerCase()} record`} />

      <SectionTabs label="Settlement stage navigation">
        {STAGES.map((item) => (
          <SectionTab
            key={item.id}
            active={stage === item.id}
            disabled={item.id === "intakes" && isGold}
            count={
              item.id === "intakes"
                ? intakes.length
                : item.id === "runs"
                  ? runs.length
                  : batches.length
            }
            onClick={() => {
              setStage(item.id);
              setUrl({ stage: item.id });
            }}
          >
            {item.label}
          </SectionTab>
        ))}
      </SectionTabs>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>{meta.emptyLabel}</AlertTitle>
          <AlertDescription>{getApiErrorMessage(loadError)}</AlertDescription>
        </Alert>
      ) : null}

      {stage === "intakes" && isGold ? (
        <Alert>
          <AlertTitle>Gold does not have an intake</AlertTitle>
          <AlertDescription>
            Gold quantities come from shift allocations, which are approved in{" "}
            <Link className="underline" href="/gold/insights/allocations">
              allocations
            </Link>
            . Entering a second set of gram figures here would give two answers to
            what one worker has coming. Compute a run once the allocations are
            approved.
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : stage === "intakes" ? (
        <DataTable
          data={intakes}
          columns={intakeColumns}
          queryState={queryState}
          onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
          features={{ sorting: true, globalFilter: true, pagination: true }}
          pagination={{ enabled: true, server: false }}
          searchPlaceholder={`Search ${meta.groupLabel.toLowerCase()}, person, or note`}
          toolbar={toolbar}
        />
      ) : stage === "runs" ? (
        <DataTable
          data={runs}
          columns={runColumns}
          queryState={queryState}
          onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
          features={{ sorting: true, globalFilter: true, pagination: true }}
          pagination={{ enabled: true, server: false }}
          searchPlaceholder="Search run code"
          toolbar={toolbar}
        />
      ) : (
        <DataTable
          data={batches}
          columns={batchColumns}
          queryState={queryState}
          onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
          features={{ sorting: true, globalFilter: true, pagination: true }}
          pagination={{ enabled: true, server: false }}
          searchPlaceholder="Search payment or run code"
          toolbar={toolbar}
        />
      )}

      <Dialog open={intakeOpen} onOpenChange={setIntakeOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New {meta.groupLabel.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Record what is owed. Nothing is payable until this is approved and
              computed into a run.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Label"
              value={intakeLabel}
              onChange={(event) => setIntakeLabel(event.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                type="date"
                value={intakePeriodStart}
                onChange={(event) => setIntakePeriodStart(event.target.value)}
              />
              <Input
                type="date"
                value={intakePeriodEnd}
                onChange={(event) => setIntakePeriodEnd(event.target.value)}
              />
              <Input
                type="date"
                value={intakeDueDate}
                onChange={(event) => setIntakeDueDate(event.target.value)}
              />
            </div>
            <Input
              value={intakeCurrency}
              onChange={(event) => setIntakeCurrency(event.target.value)}
              placeholder="Currency"
            />
            <Textarea
              rows={3}
              value={intakeNotes}
              onChange={(event) => setIntakeNotes(event.target.value)}
              placeholder="Notes"
            />
            {intakeItems.map((item, index) => (
              <div
                key={`intake-item-${index}`}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]"
              >
                <Select
                  value={item.employeeId || "__none"}
                  onValueChange={(value) =>
                    setIntakeItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, employeeId: value === "__none" ? "" : value }
                          : entry,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select employee</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name} ({employee.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={item.quantity}
                  onChange={(event) =>
                    setIntakeItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, quantity: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder={meta.defaultUnit}
                />
                <Input
                  value={item.amount}
                  onChange={(event) =>
                    setIntakeItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, amount: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Amount"
                />
                <Input
                  value={item.notes}
                  onChange={(event) =>
                    setIntakeItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Note"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={intakeItems.length === 1}
                  onClick={() =>
                    setIntakeItems((current) =>
                      current.filter((_, entryIndex) => entryIndex !== index),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setIntakeItems((current) => [
                  ...current,
                  { employeeId: "", quantity: "", amount: "", notes: "" },
                ])
              }
            >
              Add person
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIntakeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createIntake.isPending || !intakeLabel.trim()}
              onClick={() => createIntake.mutate()}
            >
              {createIntake.isPending ? "Saving..." : "Record intake"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Compute a settlement run</DialogTitle>
            <DialogDescription>
              Gathers every approved{" "}
              {isGold ? "shift allocation" : "intake"} in the window that has not
              been settled, and freezes the rate it settles at.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="date"
              value={runPeriodStart}
              onChange={(event) => setRunPeriodStart(event.target.value)}
            />
            <Input
              type="date"
              value={runPeriodEnd}
              onChange={(event) => setRunPeriodEnd(event.target.value)}
            />
          </div>
          <Select
            value={runMode}
            onValueChange={(value) => setRunMode(value as "CURRENT_PERIOD" | "NEXT_PERIOD")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CURRENT_PERIOD">Settle in this period</SelectItem>
              <SelectItem value="NEXT_PERIOD">Carry to the next period</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" onClick={() => setRunOpen(false)}>
              Cancel
            </Button>
            {/* Replacing a draft is a separate button rather than a checkbox: it
                discards a computation somebody may be part-way through reviewing,
                and the API refuses until it is asked for explicitly. */}
            <Button
              type="button"
              variant="outline"
              disabled={generateRun.isPending}
              onClick={() => generateRun.mutate(true)}
            >
              Replace the draft
            </Button>
            <Button
              type="button"
              disabled={generateRun.isPending}
              onClick={() => generateRun.mutate(false)}
            >
              {generateRun.isPending ? "Computing..." : "Compute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejection)}
        onOpenChange={(open) => {
          if (!open) {
            setRejection(null);
            setRejectionNote("");
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Reject {rejection?.label}</DialogTitle>
            <DialogDescription>
              Say why. The note goes back to whoever submitted it, and it is what
              they will correct against.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={rejectionNote}
            onChange={(event) => setRejectionNote(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejection(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!rejectionNote.trim() || workflow.isPending || !rejection}
              onClick={() =>
                rejection &&
                workflow.mutate({
                  path:
                    rejection.kind === "intake"
                      ? `/api/settlements/intakes/${rejection.id}/reject`
                      : `/api/settlements/runs/${rejection.id}/reject`,
                  note: rejectionNote.trim(),
                  successTitle: "Rejected",
                  successBody: `${rejection.label} went back for correction.`,
                })
              }
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(payingBatch)}
        onOpenChange={(open) => {
          if (!open) {
            setPayingBatch(null);
            setPaidAmounts({});
          }
        }}
      >
        <DialogContent size="lg" className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hand over {payingBatch?.code}</DialogTitle>
            <DialogDescription>
              Enter what was actually paid. Anything short of the amount owed stays
              outstanding on the batch rather than disappearing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {payingBatch?.items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[2fr_1fr_1fr] items-center gap-3 rounded-lg border p-3"
              >
                <div>
                  <div className="text-sm font-medium">{item.employee.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {item.employee.employeeId}
                  </div>
                </div>
                <div className="text-right font-mono text-sm">
                  {amount(item.amount)} {item.currency}
                </div>
                <Input
                  value={paidAmounts[item.id] ?? ""}
                  onChange={(event) =>
                    setPaidAmounts((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  placeholder="Paid"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPayingBatch(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={markPaid.isPending || !payingBatch}
              onClick={() => payingBatch && markPaid.mutate(payingBatch)}
            >
              {markPaid.isPending ? "Recording..." : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(membersOf)} onOpenChange={(open) => !open && setMembersOf(null)}>
        <DialogContent size="full" className="max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>{membersOf?.title ?? "People"}</DialogTitle>
            <DialogDescription>{membersOf?.subtitle}</DialogDescription>
          </DialogHeader>
          {membersOf ? (
            <DataTable
              data={membersOf.rows}
              columns={MEMBER_COLUMNS}
              features={{ globalFilter: false, pagination: false, sorting: false }}
              tableClassName="text-sm"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </GoldShell>
  );
}

type MemberRow = {
  id: string;
  employee: EmployeeRef;
  quantity: string | null;
  unit: string;
  owed: string;
  paid: string | null;
  status: string;
};

const MEMBER_COLUMNS: ColumnDef<MemberRow>[] = [
  {
    id: "person",
    header: "Person",
    cell: ({ row }) => (
      <div>
        <div className="font-semibold">{row.original.employee.name}</div>
        <div className="font-mono text-xs text-muted-foreground">
          {row.original.employee.employeeId}
        </div>
      </div>
    ),
  },
  {
    id: "quantity",
    header: "Quantity",
    cell: ({ row }) => (
      <NumericCell>
        {row.original.quantity && toNumber(row.original.quantity) > 0
          ? `${toNumber(row.original.quantity).toFixed(4)} ${row.original.unit}`
          : "-"}
      </NumericCell>
    ),
  },
  {
    id: "owed",
    header: "Owed",
    cell: ({ row }) => <NumericCell>{amount(row.original.owed)}</NumericCell>,
  },
  {
    id: "paid",
    header: "Paid",
    cell: ({ row }) => (
      <NumericCell>
        {row.original.paid && toNumber(row.original.paid) > 0
          ? amount(row.original.paid)
          : "-"}
      </NumericCell>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.status}</span>
    ),
  },
];
