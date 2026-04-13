"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdminDualBarChart, AdminTrendChart, type AdminChartSeries } from "@/components/charts/admin-headless-charts";
import {
  ScrapMobileCard,
  ScrapMobileCardHeader,
  ScrapMobileMetricStrip,
} from "@/components/scrap-metal/mobile-list-card";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Wallet, Plus, ReceiptLong, Payments, History, Calendar, Users } from "@/lib/icons";
import { SplitButton } from "@/components/ui/split-button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type BalanceRecord = {
  id: string;
  balance: number;
  lastUpdated: string;
  deliveredValue: number;
  deliveredWeight: number;
  purchaseCount: number;
  lastPurchaseDate: string | null;
  historyCount: number;
  employee: {
    id: string;
    name: string;
    employeeId: string;
  };
};

type PayoutBatch = {
  id: string;
  label: string;
  workflowStatus: string;
  dueDate: string;
  items: Array<{ id: string; amount: number; employee: { id: string; name: string; employeeId: string } }>;
};

type EmployeeOption = { id: string; name: string; employeeId: string };
type BatchItemDraft = { employeeId: string; amount: string; notes: string };
type BalanceAction = "ISSUE_FUNDS" | "RECEIVE_MONEY_BACK" | "PAY_THEM";

type BalanceHistoryPayload = {
  balance: {
    id: string;
    amount: number;
    lastUpdated: string;
    employee: {
      id: string;
      name: string;
      employeeId: string;
      department?: { name: string | null } | null;
    };
  };
  entries: Array<{
    id: string;
    entryType: string;
    amountDelta: number;
    balanceAfter: number;
    note?: string | null;
    sourceId?: string | null;
    createdAt: string;
    createdBy?: { id: string; name: string | null } | null;
  }>;
  deliveries: Array<{
    id: string;
    purchaseNumber: string;
    purchaseDate: string;
    weight: number;
    totalAmount: number;
    currency: string;
    category: string;
    site: { id: string; name: string; code: string };
    material?: { id: string; code: string; name: string; category: string } | null;
    sellerName?: string | null;
    sellerIdNumber?: string | null;
    batch?: { id: string; batchNumber: string; status: string } | null;
  }>;
  settlements: Array<{
    id: string;
    amount: number;
    notes?: string | null;
    createdAt: string;
    batch: {
      id: string;
      label: string;
      dueDate: string;
      workflowStatus: string;
      createdAt: string;
    };
    payment?: {
      id: string;
      dueDate: string;
      amount: number;
      paidAmount: number;
      status: string;
      notes?: string | null;
      createdAt: string;
    } | null;
  }>;
};

type StatusBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "neutral"
  | "brand"
  | "info"
  | "success"
  | "warning"
  | "danger";

function formatMoney(value: number) {
  return `USD ${value.toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "-";
}

function formatWorkflowStatus(status: string) {
  return status.replace(/_/g, " ");
}

function getWorkflowBadgeVariant(status: string): StatusBadgeVariant {
  const normalized = status.trim().toLowerCase();
  if (
    normalized.includes("cancel") ||
    normalized.includes("reject") ||
    normalized.includes("fail")
  ) {
    return "danger";
  }
  if (
    normalized.includes("paid") ||
    normalized.includes("settled") ||
    normalized.includes("complete")
  ) {
    return "success";
  }
  if (
    normalized.includes("approve") ||
    normalized.includes("process") ||
    normalized.includes("review")
  ) {
    return "info";
  }
  if (
    normalized.includes("pending") ||
    normalized.includes("draft") ||
    normalized.includes("queue")
  ) {
    return "warning";
  }
  return "neutral";
}

const SETTLEMENT_TREND_SERIES: AdminChartSeries[] = [
  { key: "amount", label: "Batch Value", kind: "bar", color: "var(--status-success-border)" },
  { key: "averageAmount", label: "Average Payout", kind: "line", color: "var(--status-info-border)" },
];

export default function ScrapSettlementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState("balances");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBalance, setSelectedBalance] = useState<BalanceRecord | null>(null);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentEmployeeId, setAdjustmentEmployeeId] = useState("");
  const [adjustmentAction, setAdjustmentAction] = useState<BalanceAction>("ISSUE_FUNDS");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [label, setLabel] = useState("");
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<BatchItemDraft[]>([{ employeeId: "", amount: "", notes: "" }]);

  const balancesQuery = useQuery({
    queryKey: ["scrap-balances"],
    queryFn: () => fetchJson<{ data: BalanceRecord[] }>("/api/scrap-metal/employee-balances?limit=500&nonZero=true"),
  });
  const batchesQuery = useQuery({
    queryKey: ["scrap-payout-batches"],
    queryFn: () => fetchJson<{ data: PayoutBatch[] }>("/api/hr/payout-batches?source=SCRAP&limit=500"),
  });
  const employeesQuery = useQuery({
    queryKey: ["employees", "scrap-settlements"],
    queryFn: () => fetchJson<{ data: EmployeeOption[] }>("/api/employees?active=true&limit=500"),
    enabled: createOpen || adjustmentOpen,
  });
  const balanceHistoryQuery = useQuery({
    queryKey: ["scrap-balance-history", selectedBalance?.employee.id],
    queryFn: () =>
      fetchJson<BalanceHistoryPayload>(
        `/api/scrap-metal/employee-balances/${selectedBalance?.employee.id}/history`,
      ),
    enabled: Boolean(selectedBalance?.employee.id),
  });

  const createBatch = useMutation({
    mutationFn: async () =>
      fetchJson("/api/hr/payout-batches", {
        method: "POST",
        body: JSON.stringify({
          source: "SCRAP",
          label,
          periodStart,
          periodEnd,
          dueDate,
          currency: "USD",
          notes: notes || undefined,
          items: items
            .filter((item) => item.employeeId && item.amount)
            .map((item) => ({
              employeeId: item.employeeId,
              amount: Number(item.amount),
              notes: item.notes || undefined,
            })),
        }),
      }),
    onSuccess: () => {
      toast({ title: "Settlement batch created", variant: "success" });
      setCreateOpen(false);
      setLabel("");
      setNotes("");
      setItems([{ employeeId: "", amount: "", notes: "" }]);
      queryClient.invalidateQueries({ queryKey: ["scrap-payout-batches"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create settlement batch",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const adjustBalance = useMutation({
    mutationFn: async () =>
      fetchJson("/api/scrap-metal/employee-balances", {
        method: "POST",
        body: JSON.stringify({
          employeeId: adjustmentEmployeeId,
          action: adjustmentAction,
          amount: Number(adjustmentAmount),
          note: adjustmentNote.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Balance updated", variant: "success" });
      setAdjustmentOpen(false);
      setAdjustmentEmployeeId("");
      setAdjustmentAction("ISSUE_FUNDS");
      setAdjustmentAmount("");
      setAdjustmentNote("");
      queryClient.invalidateQueries({ queryKey: ["scrap-balances"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-balance-history"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update balance",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const balances = useMemo(
    () => (balancesQuery.data?.data ?? []).sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance)),
    [balancesQuery.data?.data],
  );
  const batches = useMemo(() => batchesQuery.data?.data ?? [], [batchesQuery.data?.data]);
  const employees = employeesQuery.data?.data ?? [];
  const totalDeliveredValue = balances.reduce((sum, balance) => sum + balance.deliveredValue, 0);
  const totalPositiveBalance = balances
    .filter((balance) => balance.balance > 0)
    .reduce((sum, balance) => sum + balance.balance, 0);
  const totalNegativeBalance = Math.abs(
    balances.filter((balance) => balance.balance < 0).reduce((sum, balance) => sum + balance.balance, 0),
  );
  const maxDeliveredValue = Math.max(...balances.map((balance) => balance.deliveredValue), 1);
  const maxBalanceValue = Math.max(...balances.map((balance) => Math.abs(balance.balance)), 1);
  const totalBatchValue = batches.reduce(
    (sum, batch) => sum + batch.items.reduce((itemSum, item) => itemSum + item.amount, 0),
    0,
  );
  const averageBatchValue = batches.length > 0 ? totalBatchValue / batches.length : 0;
  const balanceChartRows = useMemo(
    () =>
      balances.slice(0, 8).map((balance) => ({
        id: balance.employee.id,
        label: balance.employee.name,
        primary: balance.deliveredValue,
        secondary: Math.abs(balance.balance),
      })),
    [balances],
  );
  const settlementTrendRows = useMemo(() => {
    const grouped = new Map<string, { amount: number; count: number }>();
    for (const batch of batches) {
      const key = batch.dueDate.slice(0, 10);
      const current = grouped.get(key) ?? { amount: 0, count: 0 };
      current.amount += batch.items.reduce((sum, item) => sum + item.amount, 0);
      current.count += 1;
      grouped.set(key, current);
    }
    return Array.from(grouped.entries())
      .map(([date, values]) => ({
        label: date,
        amount: values.amount,
        count: values.count,
        averageAmount: values.count > 0 ? values.amount / values.count : 0,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [batches]);

  const batchColumns = useMemo<ColumnDef<PayoutBatch>[]>(
    () => [
      {
        id: "label",
        header: "Batch",
        accessorFn: (row) => row.label,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.label}</div>
            <div className="text-xs text-muted-foreground">{row.original.items.length} operators</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Workflow",
        cell: ({ row }) => (
          <Badge variant={getWorkflowBadgeVariant(row.original.workflowStatus)}>
            {formatWorkflowStatus(row.original.workflowStatus)}
          </Badge>
        ),
        size: 120,
      },
      {
        id: "dueDate",
        header: "Due Date",
        cell: ({ row }) => <NumericCell align="left">{row.original.dueDate.slice(0, 10)}</NumericCell>,
        size: 120,
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => (
          <NumericCell>
            USD {row.original.items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
          </NumericCell>
        ),
        size: 140,
      },
    ],
    [],
  );

  const views = [
    { id: "balances", label: "Balances", count: balances.length },
    { id: "batches", label: "Batches", count: batches.length },
  ];

  const loadError = balancesQuery.error || batchesQuery.error;

  const openAdjustmentModal = (balance?: BalanceRecord | null) => {
    setAdjustmentEmployeeId(balance?.employee.id ?? "");
    setAdjustmentAction(balance && balance.balance < 0 ? "PAY_THEM" : "ISSUE_FUNDS");
    setAdjustmentAmount("");
    setAdjustmentNote("");
    setAdjustmentOpen(true);
  };

  return (
    <ScrapShell
      title="Staff Settlements (Buyers)"
      actions={
        <SplitButton
          size="sm"
          onClick={() => setCreateOpen(true)}
          menuContent={
            <>
              <DropdownMenuItem onSelect={() => openAdjustmentModal()}>
                Give funds
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openAdjustmentModal(selectedBalance)}>
                Update balance
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/human-resources/payouts?source=SCRAP">Open in HR</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/scrap-metal/reports">Open reports</Link>
              </DropdownMenuItem>
            </>
          }
        >
          <Plus className="h-4 w-4" />
          New Settlement Batch
        </SplitButton>
      }
    >
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load settlements</AlertTitle>
          <AlertDescription>{getApiErrorMessage(loadError)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-[var(--status-pending-bg)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--status-pending-text)]">
            <Wallet className="h-4 w-4" />
            Open balances
          </div>
          <div className="mt-2 text-xl font-semibold">{balances.length}</div>
        </div>
        <div className="rounded-2xl bg-[var(--status-success-bg)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--status-success-text)]">
            <ReceiptLong className="h-4 w-4" />
            Delivered value
          </div>
          <div className="mt-2 text-xl font-semibold">{formatMoney(totalDeliveredValue)}</div>
        </div>
        <div className="rounded-2xl bg-[var(--status-warning-bg)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--status-warning-text)]">
            <Payments className="h-4 w-4" />
            Owed to us
          </div>
          <div className="mt-2 text-xl font-semibold">{formatMoney(totalPositiveBalance)}</div>
        </div>
        <div className="rounded-2xl bg-[var(--status-info-bg)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--status-info-text)]">
            <History className="h-4 w-4" />
            We owe
          </div>
          <div className="mt-2 text-xl font-semibold">{formatMoney(totalNegativeBalance)}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-3xl bg-[var(--status-success-bg)]/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--status-success-text)]">Settlement trend</h3>
              <p className="text-xs text-[var(--text-muted)]">Batch value and average payout by due date</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-[var(--status-success-text)]">Settled value</div>
              <div className="font-mono text-sm font-semibold">{formatMoney(totalBatchValue)}</div>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-[var(--surface-base)]/70 px-3 py-2">
              <div className="text-[var(--text-muted)]">Batches</div>
              <div className="mt-0.5 font-mono text-[var(--text-strong)]">{batches.length}</div>
            </div>
            <div className="rounded-xl bg-[var(--surface-base)]/70 px-3 py-2">
              <div className="text-[var(--text-muted)]">Average payout</div>
              <div className="mt-0.5 font-mono text-[var(--text-strong)]">{formatMoney(averageBatchValue)}</div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-[var(--surface-base)]/70 p-3 [&_.pointer-events-none>div]:border-0 [&_button]:border-0 [&_button]:bg-[var(--surface-base)] [&_button]:shadow-none">
            <AdminTrendChart
              rows={settlementTrendRows}
              series={SETTLEMENT_TREND_SERIES}
              height={240}
              valueFormatter={(value) => formatMoney(value)}
              yTickFormatter={(value) => value.toFixed(0)}
            />
          </div>
        </section>
        <section className="rounded-3xl bg-[var(--status-info-bg)]/85 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--status-info-text)]">Delivered vs exposure</h3>
              <p className="text-xs text-[var(--text-muted)]">Top operators by delivered value and open balance</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-[var(--status-info-text)]">Net exposure</div>
              <div className="font-mono text-sm font-semibold">
                {formatMoney(totalPositiveBalance + totalNegativeBalance)}
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-[var(--surface-base)]/70 px-3 py-2">
              <div className="text-[var(--text-muted)]">Owed to us</div>
              <div className="mt-0.5 font-mono text-[var(--status-warning-text)]">{formatMoney(totalPositiveBalance)}</div>
            </div>
            <div className="rounded-xl bg-[var(--surface-base)]/70 px-3 py-2">
              <div className="text-[var(--text-muted)]">We owe</div>
              <div className="mt-0.5 font-mono text-[var(--status-info-text)]">{formatMoney(totalNegativeBalance)}</div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-[var(--surface-base)]/70 p-3 [&_.pointer-events-none>div]:border-0 [&_button]:border-0 [&_button]:bg-[var(--surface-base)] [&_button]:shadow-none">
            <AdminDualBarChart
              rows={balanceChartRows}
              height={240}
              primaryLabel="Delivered Value"
              secondaryLabel="Open Balance"
              primaryColor="var(--status-success-border)"
              secondaryColor="var(--status-warning-border)"
              valueFormatter={(value) => `USD ${value.toFixed(0)}`}
            />
          </div>
        </section>
      </div>

      <VerticalDataViews
        items={views}
        value={activeView}
        onValueChange={setActiveView}
        railLabel="Views"
      >
        {activeView === "balances" ? (
          <div className="space-y-3">
            {balancesQuery.isLoading ? (
              <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-8 text-sm text-muted-foreground">
                Loading balances...
              </div>
            ) : null}
            {!balancesQuery.isLoading && balances.length === 0 ? (
              <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-8 text-sm text-muted-foreground">
                No open balances.
              </div>
            ) : null}
            {balances.map((balance) => {
              const deliveredRatio = Math.max(balance.deliveredValue / maxDeliveredValue, 0.04);
              const balanceRatio = Math.max(Math.abs(balance.balance) / maxBalanceValue, 0.04);
              const owesUs = balance.balance > 0;
              const amountLabel = owesUs ? "Owes us" : "We owe";
              return (
                <article
                  key={balance.id}
                  className={cn(
                    "rounded-2xl p-4",
                    owesUs
                      ? "bg-[var(--status-warning-bg)]"
                      : "bg-[var(--status-info-bg)]",
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="font-semibold">{balance.employee.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {balance.employee.employeeId}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={owesUs ? "warning" : "info"}>{amountLabel}</Badge>
                      <Button type="button" size="sm" variant="outline" onClick={() => openAdjustmentModal(balance)}>
                        Update balance
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectedBalance(balance)}>
                        History
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Delivered</div>
                        <div className="mt-1 font-semibold">{formatMoney(balance.deliveredValue)}</div>
                        <div className="text-xs text-muted-foreground">{balance.deliveredWeight.toFixed(2)} kg</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{amountLabel}</div>
                        <div
                          className={cn(
                            "mt-1 font-semibold",
                            owesUs
                              ? "text-[var(--status-warning-text)]"
                              : "text-[var(--status-info-text)]",
                          )}
                        >
                          {formatMoney(Math.abs(balance.balance))}
                        </div>
                        <div className="text-xs text-muted-foreground">{balance.historyCount} entries</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Last delivery</div>
                        <div className="mt-1 font-semibold">{formatDate(balance.lastPurchaseDate)}</div>
                        <div className="text-xs text-muted-foreground">{balance.purchaseCount} purchases</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-muted-foreground">Delivered value</span>
                          <span className="font-mono text-foreground">{formatMoney(balance.deliveredValue)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--surface-muted)]">
                          <div
                            className="h-2 rounded-full bg-[var(--primary-500)]"
                            style={{ width: `${Math.min(deliveredRatio * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className={owesUs ? "text-[var(--status-warning-text)]" : "text-[var(--status-info-text)]"}>
                            {amountLabel}
                          </span>
                          <span className={cn("font-mono", owesUs ? "text-[var(--status-warning-text)]" : "text-[var(--status-info-text)]")}>
                            {formatMoney(Math.abs(balance.balance))}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--surface-muted)]">
                          <div
                            className={owesUs ? "h-2 rounded-full bg-[var(--status-warning-border)]" : "h-2 rounded-full bg-[var(--status-info-border)]"}
                            style={{ width: `${Math.min(balanceRatio * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <DataTable
            data={batches}
            columns={batchColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search batch"
            tableClassName="text-sm"
            emptyState={batchesQuery.isLoading ? "Loading batches..." : "No batches yet"}
            mobileCardRenderer={({ row: batch }) => (
              <ScrapMobileCard>
                <ScrapMobileCardHeader
                  title={batch.label}
                  subtitle={`${batch.items.length} people`}
                  aside={
                    <Badge variant={getWorkflowBadgeVariant(batch.workflowStatus)}>
                      {formatWorkflowStatus(batch.workflowStatus)}
                    </Badge>
                  }
                />
                <ScrapMobileMetricStrip
                  items={[
                    { icon: Calendar, value: formatDate(batch.dueDate), srLabel: "Due date" },
                    {
                      icon: Wallet,
                      value: formatMoney(batch.items.reduce((sum, item) => sum + item.amount, 0)),
                      srLabel: "Batch value",
                    },
                    { icon: Users, value: `${batch.items.length}`, srLabel: "People count" },
                  ]}
                />
              </ScrapMobileCard>
            )}
          />
        )}
      </VerticalDataViews>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="full" tabletBehavior="fullscreen" className="max-h-[100dvh] sm:max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>New Settlement Batch</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto pb-20 sm:max-h-[calc(92vh-8rem)]">
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Batch label" />
            <div className="grid gap-4 lg:grid-cols-3">
              <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
            {items.map((item, index) => (
              <div key={`scrap-item-${index}`} className="grid gap-3 rounded-xl bg-[var(--surface-muted)] p-3 lg:grid-cols-[2fr_1fr_2fr_auto]">
                <Select
                  value={item.employeeId || "__none"}
                  onValueChange={(value) =>
                    setItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, employeeId: value === "__none" ? "" : value } : entry,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Select operator</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name} ({employee.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount}
                  onChange={(event) =>
                    setItems((current) =>
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
                    setItems((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder="Operator note"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={items.length === 1}
                  onClick={() => setItems((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((current) => [...current, { employeeId: "", amount: "", notes: "" }])}
            >
              Add Operator
            </Button>
          </div>
          <DialogFooter className="sticky bottom-0 z-10 -mx-1 bg-background/95 px-1 pt-3 supports-[backdrop-filter]:bg-background/85">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createBatch.isPending || !label.trim()}
              onClick={() => createBatch.mutate()}
            >
              {createBatch.isPending ? "Creating..." : "Create Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent size="full" tabletBehavior="fullscreen" className="max-h-[100dvh] sm:max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>Update Balance</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto pb-20 sm:max-h-[calc(92vh-8rem)]">
            <Select value={adjustmentEmployeeId || "__none"} onValueChange={(value) => setAdjustmentEmployeeId(value === "__none" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select worker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Select worker</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name} ({employee.employeeId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={adjustmentAction} onValueChange={(value) => setAdjustmentAction(value as BalanceAction)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ISSUE_FUNDS">Give funds</SelectItem>
                <SelectItem value="RECEIVE_MONEY_BACK">Receive money back</SelectItem>
                <SelectItem value="PAY_THEM">Pay them</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
              placeholder="Amount"
            />
            <Textarea
              rows={3}
              value={adjustmentNote}
              onChange={(event) => setAdjustmentNote(event.target.value)}
              placeholder="Note"
            />
          </div>
          <DialogFooter className="sticky bottom-0 z-10 -mx-1 bg-background/95 px-1 pt-3 supports-[backdrop-filter]:bg-background/85">
            <Button type="button" variant="outline" onClick={() => setAdjustmentOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={adjustBalance.isPending || !adjustmentEmployeeId || !adjustmentAmount}
              onClick={() => adjustBalance.mutate()}
            >
              {adjustBalance.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedBalance)} onOpenChange={(open) => !open && setSelectedBalance(null)}>
        <DialogContent size="full" className="max-h-[92dvh]">
          <DialogHeader>
            <DialogTitle>{selectedBalance?.employee.name ?? "History"}</DialogTitle>
          </DialogHeader>
          {selectedBalance ? (
            balanceHistoryQuery.isLoading ? (
              <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-8 text-sm text-muted-foreground">
                Loading history...
              </div>
            ) : balanceHistoryQuery.error ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to load history</AlertTitle>
                <AlertDescription>{getApiErrorMessage(balanceHistoryQuery.error)}</AlertDescription>
              </Alert>
            ) : balanceHistoryQuery.data ? (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div
                      className={cn(
                        "mt-2 text-xl font-semibold",
                        balanceHistoryQuery.data.balance.amount >= 0
                          ? "text-[var(--status-warning-text)]"
                          : "text-[var(--status-info-text)]",
                      )}
                    >
                      {formatMoney(Math.abs(balanceHistoryQuery.data.balance.amount))}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
                    <div className="text-xs text-muted-foreground">Last updated</div>
                    <div className="mt-2 text-xl font-semibold">
                      {formatDate(balanceHistoryQuery.data.balance.lastUpdated)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
                    <div className="text-xs text-muted-foreground">Deliveries</div>
                    <div className="mt-2 text-xl font-semibold">
                      {balanceHistoryQuery.data.deliveries.length}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
                    <div className="text-xs text-muted-foreground">Settlement batches</div>
                    <div className="mt-2 text-xl font-semibold">
                      {balanceHistoryQuery.data.settlements.length}
                    </div>
                  </div>
                </div>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Balance history</h3>
                  <div className="space-y-3">
                    {balanceHistoryQuery.data.entries.map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-2xl bg-[var(--surface-muted)] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="font-semibold">{entry.entryType.replace(/_/g, " ")}</div>
                            <div className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</div>
                          </div>
                          <div className="space-y-1 text-left sm:text-right">
                            <div
                              className={cn(
                                "font-mono font-semibold",
                                entry.amountDelta >= 0
                                  ? "text-[var(--status-success-text)]"
                                  : "text-[var(--status-warning-text)]",
                              )}
                            >
                              {formatMoney(entry.amountDelta)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              After {formatMoney(entry.balanceAfter)}
                            </div>
                          </div>
                        </div>
                        {entry.note ? <div className="mt-3 text-sm text-muted-foreground">{entry.note}</div> : null}
                      </article>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Delivered scrap</h3>
                  <div className="space-y-3">
                    {balanceHistoryQuery.data.deliveries.map((delivery) => (
                      <article
                        key={delivery.id}
                        className="rounded-2xl bg-[var(--surface-muted)] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-semibold">
                              {delivery.purchaseNumber} - {delivery.material?.name ?? delivery.category}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(delivery.purchaseDate)} - {delivery.site.code} - {delivery.sellerName ?? "No seller"}
                            </div>
                          </div>
                          <div className="space-y-1 text-left sm:text-right">
                            <div className="font-mono font-semibold">{formatMoney(delivery.totalAmount)}</div>
                            <div className="text-xs text-muted-foreground">{delivery.weight.toFixed(2)} kg</div>
                          </div>
                        </div>
                        {delivery.batch ? (
                          <div className="mt-3 text-xs text-muted-foreground">
                            Batch {delivery.batch.batchNumber} - {delivery.batch.status}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Settlement batches</h3>
                  <div className="space-y-3">
                    {balanceHistoryQuery.data.settlements.map((settlement) => (
                      <article
                        key={settlement.id}
                        className="rounded-2xl bg-[var(--surface-muted)] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-semibold">{settlement.batch.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {settlement.batch.workflowStatus} - Due {formatDate(settlement.batch.dueDate)}
                            </div>
                          </div>
                          <div className="space-y-1 text-left sm:text-right">
                            <div className="font-mono font-semibold">{formatMoney(settlement.amount)}</div>
                            {settlement.payment ? (
                              <Badge variant={getWorkflowBadgeVariant(settlement.payment.status)}>
                                Paid {formatMoney(settlement.payment.paidAmount)} -{" "}
                                {formatWorkflowStatus(settlement.payment.status)}
                              </Badge>
                            ) : (
                              <div className="text-xs text-muted-foreground">Not paid yet</div>
                            )}
                          </div>
                        </div>
                        {settlement.notes ? (
                          <div className="mt-3 text-sm text-muted-foreground">{settlement.notes}</div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null
          ) : null}
        </DialogContent>
      </Dialog>
    </ScrapShell>
  );
}
