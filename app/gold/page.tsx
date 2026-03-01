"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NumericCell } from "@/components/ui/numeric-cell";
import { SplitButton } from "@/components/ui/split-button";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchAttendance,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
  fetchGoldShiftAllocations,
  fetchShiftReports,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronDown } from "@/lib/icons";
import { goldRoutes } from "@/app/gold/routes";
import { ShiftAllocationModal } from "@/app/gold/components/shift-allocation-modal";
import type { AttendanceShiftSummary } from "@/app/gold/types";
import { canViewHrefWithEnabledFeatures } from "@/lib/platform/gating/nav-filter";

type GoldChainRow = {
  id: string;
  pourBarId: string;
  site: string;
  date: string;
  grossWeight: number;
  expenseGold: number;
  workerSplit: number;
  companySplit: number;
  companyTotal: number;
  expenseBreakdown: string;
  valueUsd: number;
  status: "passing" | "in_review" | "pending";
};

export default function GoldPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const canRecordBatch = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(goldRoutes.intake.pours, enabledFeatures),
    [enabledFeatures],
  );
  const canRecordPurchase = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(
        goldRoutes.intake.purchases,
        enabledFeatures,
      ),
    [enabledFeatures],
  );
  const canRecordDispatch = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(
        goldRoutes.transit.dispatches,
        enabledFeatures,
      ),
    [enabledFeatures],
  );
  const canRecordSale = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(
        goldRoutes.settlement.receipts,
        enabledFeatures,
      ),
    [enabledFeatures],
  );
  const canRecordShiftOutput = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(
        goldRoutes.settlement.payouts,
        enabledFeatures,
      ),
    [enabledFeatures],
  );
  const secondaryActions = useMemo(() => {
    const actions: Array<{ label: string; href: string }> = [];
    if (canRecordBatch) {
      actions.push({ label: "Record Batch", href: goldRoutes.intake.create });
    }
    if (canRecordPurchase) {
      actions.push({
        label: "Record Purchase",
        href: goldRoutes.intake.createPurchase,
      });
    }
    if (canRecordDispatch) {
      actions.push({
        label: "Record Dispatch",
        href: goldRoutes.transit.create,
      });
    }
    if (canRecordSale) {
      actions.push({
        label: "Record Sale",
        href: goldRoutes.settlement.create,
      });
    }
    return actions;
  }, [canRecordBatch, canRecordDispatch, canRecordPurchase, canRecordSale]);

  const attendanceStart = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return start.toISOString().slice(0, 10);
  }, []);
  const normalizeShiftLabel = (value: string) =>
    value.trim().replace(/\s+/g, " ").toUpperCase();

  const {
    data: poursData,
    isLoading: poursLoading,
    error: poursError,
  } = useQuery({
    queryKey: ["gold-pours", "command"],
    queryFn: () => fetchGoldPours({ limit: 300 }),
  });
  const {
    data: dispatchesData,
    isLoading: dispatchesLoading,
    error: dispatchesError,
  } = useQuery({
    queryKey: ["gold-dispatches", "command"],
    queryFn: () => fetchGoldDispatches({ limit: 300 }),
  });
  const {
    data: receiptsData,
    isLoading: receiptsLoading,
    error: receiptsError,
  } = useQuery({
    queryKey: ["gold-receipts", "command"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });
  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
    queryKey: ["attendance", "gold", attendanceStart],
    queryFn: () => fetchAttendance({ startDate: attendanceStart, limit: 500 }),
  });

  const { data: shiftReportsData, isLoading: shiftReportsLoading } = useQuery({
    queryKey: ["shift-reports", "gold", attendanceStart],
    queryFn: () =>
      fetchShiftReports({ startDate: attendanceStart, limit: 200 }),
  });

  const { data: shiftAllocationsData, isLoading: shiftAllocationsLoading } =
    useQuery({
      queryKey: ["gold-shift-allocations", attendanceStart],
      queryFn: () =>
        fetchGoldShiftAllocations({ startDate: attendanceStart, limit: 500 }),
    });

  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatches = useMemo(
    () => dispatchesData?.data ?? [],
    [dispatchesData],
  );
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);
  const attendanceRecords = useMemo(
    () => attendanceData?.data ?? [],
    [attendanceData],
  );
  const shiftReports = useMemo(
    () => shiftReportsData?.data ?? [],
    [shiftReportsData],
  );
  const shiftAllocations = useMemo(
    () => shiftAllocationsData?.data ?? [],
    [shiftAllocationsData],
  );

  const dispatchByPourId = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((dispatch) => {
      map.set(dispatch.goldPourId, dispatch);
    });
    return map;
  }, [dispatches]);

  const receiptByPourId = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((receipt) => {
      if (receipt.goldPour.id) map.set(receipt.goldPour.id, receipt);
    });
    return map;
  }, [receipts]);

  const recordedAllocationKeys = useMemo(() => {
    const keys = new Set<string>();
    shiftAllocations.forEach((allocation) => {
      const date = new Date(allocation.date).toISOString().slice(0, 10);
      const key = `${date}|${normalizeShiftLabel(allocation.shift)}|${allocation.siteId}`;
      keys.add(key);
    });
    return keys;
  }, [shiftAllocations]);

  const pendingSettlementDispatches = useMemo(
    () =>
      dispatches.filter(
        (dispatch) => !receiptByPourId.has(dispatch.goldPourId),
      ),
    [dispatches, receiptByPourId],
  );

  const commandError = poursError || dispatchesError || receiptsError;
  const commandLoading = poursLoading || dispatchesLoading || receiptsLoading;

  const recentChain = useMemo<GoldChainRow[]>(() => {
    return pours
      .slice()
      .sort((a, b) => b.pourDate.localeCompare(a.pourDate))
      .slice(0, 50)
      .map((pour) => {
        const dispatch = dispatchByPourId.get(pour.id);
        const receipt = receiptByPourId.get(pour.id);
        const status = receipt ? "passing" : dispatch ? "in_review" : "pending";
        return {
          id: pour.id,
          pourBarId: pour.pourBarId,
          site: pour.site.code,
          date: pour.pourDate,
          grossWeight: pour.grossWeight,
          expenseGold: pour.expenseWeightTotal ?? 0,
          workerSplit: pour.workerSplitWeight ?? 0,
          companySplit: pour.companySplitWeight ?? 0,
          companyTotal:
            pour.companyTotalWeight ??
            (pour.companySplitWeight ?? 0) + (pour.expenseWeightTotal ?? 0),
          expenseBreakdown: pour.expenseBreakdown?.trim() || "-",
          valueUsd: pour.valueUsd ?? 0,
          status,
        };
      });
  }, [dispatchByPourId, pours, receiptByPourId]);

  const attendanceShifts = useMemo(() => {
    const grouped = new Map<string, AttendanceShiftSummary>();
    attendanceRecords.forEach((record) => {
      const date = new Date(record.date).toISOString().slice(0, 10);
      const normalizedShift = normalizeShiftLabel(record.shift);
      const key = `${date}|${normalizedShift}|${record.site.id}`;
      const existing =
        grouped.get(key) ??
        ({
          key,
          date,
          shift: normalizedShift,
          siteId: record.site.id,
          siteName: record.site.name,
          siteCode: record.site.code,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          totalCrew: 0,
          presentEmployees: [],
        } satisfies AttendanceShiftSummary);

      existing.totalCrew += 1;
      if (record.status === "ABSENT") {
        existing.absentCount += 1;
      } else {
        existing.presentCount += 1;
        if (record.status === "LATE") {
          existing.lateCount += 1;
        }
        existing.presentEmployees.push({
          id: record.employee.id,
          name: record.employee.name,
          employeeId: record.employee.employeeId,
        });
      }
      grouped.set(key, existing);
    });

    return Array.from(grouped.values())
      .filter((shift) => shift.presentCount > 0)
      .filter((shift) => !recordedAllocationKeys.has(shift.key))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, recordedAllocationKeys]);

  const shiftReportsByKey = useMemo(() => {
    const map = new Map<
      string,
      { id: string; status: string; crewCount: number }
    >();
    shiftReports.forEach((report) => {
      const date = new Date(report.date).toISOString().slice(0, 10);
      const key = `${date}|${normalizeShiftLabel(report.shift)}|${report.siteId}`;
      map.set(key, {
        id: report.id,
        status: report.status,
        crewCount: report.crewCount,
      });
    });
    return map;
  }, [shiftReports]);

  const createShiftAllocationMutation = useMutation({
    mutationFn: async (payload: {
      date: string;
      shift: string;
      siteId: string;
      totalWeight: number;
      expenses: Array<{ type: string; weight: number }>;
      splitMode?: "DEFAULT_50_50" | "OVERRIDE_WORKER_WEIGHT";
      workerShareOverrideWeight?: number;
      splitOverrideReason?: string;
      payCycleWeeks: number;
    }) =>
      fetchJson<{
        id: string;
        createdBatchCode?: string | null;
        payoutRecordsCreated?: number;
        warnings?: string[];
      }>("/api/gold/shift-allocations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (allocation) => {
      queryClient.invalidateQueries({ queryKey: ["gold-shift-allocations"] });
      queryClient.invalidateQueries({ queryKey: ["gold-pours"] });
      queryClient.invalidateQueries({ queryKey: ["employee-payments"] });
      const warningText =
        allocation.warnings && allocation.warnings.length > 0
          ? ` ${allocation.warnings[0]}`
          : "";
      const payoutText =
        allocation.payoutRecordsCreated && allocation.payoutRecordsCreated > 0
          ? ` ${allocation.payoutRecordsCreated} worker payout records were created.`
          : "";
      toast({
        title: "Shift output recorded",
        description: allocation.createdBatchCode
          ? `Batch ${allocation.createdBatchCode} was created automatically.${payoutText}${warningText}`
          : `Shift allocation saved.${payoutText}${warningText}`,
        variant: "success",
      });
      setShiftModalOpen(false);
    },
  });

  const columns = useMemo<ColumnDef<GoldChainRow>[]>(
    () => [
      {
        id: "pourBarId",
        header: "Batch ID",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">
            {row.original.pourBarId}
          </span>
        ),
        size: 112,
        minSize: 112,
        maxSize: 112,
      },
      {
        id: "site",
        header: "Site",
        accessorKey: "site",
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.date).toLocaleString()}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "grossWeight",
        header: "Gross Weight (Recorded)",
        cell: ({ row }) => (
          <NumericCell>{row.original.grossWeight.toFixed(2)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "expenseGold",
        header: "Expense Gold",
        cell: ({ row }) => (
          <NumericCell>{row.original.expenseGold.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "workerSplit",
        header: "Worker Split",
        cell: ({ row }) => (
          <NumericCell>{row.original.workerSplit.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "companySplit",
        header: "Company Split",
        cell: ({ row }) => (
          <NumericCell>{row.original.companySplit.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "companyTotal",
        header: "Company Total",
        cell: ({ row }) => (
          <NumericCell>{row.original.companyTotal.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "expenseBreakdown",
        header: "Expense Breakdown",
        accessorKey: "expenseBreakdown",
        size: 220,
        minSize: 200,
        maxSize: 320,
      },
      {
        id: "valueUsd",
        header: "Value (USD)",
        cell: ({ row }) => (
          <NumericCell>${row.original.valueUsd.toFixed(2)}</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusChip
            status={row.original.status}
            label={
              row.original.status === "passing"
                ? "Complete"
                : row.original.status === "in_review"
                  ? "Dispatched"
                  : "Waiting for dispatch"
            }
          />
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
    ],
    [],
  );

  return (
    <GoldShell
      activeTab="home"
      actions={
        <div className="flex flex-wrap gap-2">
          {canRecordShiftOutput ? (
            secondaryActions.length > 0 ? (
              <SplitButton
                size="sm"
                onClick={() => setShiftModalOpen(true)}
                triggerAriaLabel="More gold actions"
                menuContent={secondaryActions.map((action) => (
                  <DropdownMenuItem key={action.href} asChild>
                    <Link href={action.href}>{action.label}</Link>
                  </DropdownMenuItem>
                ))}
              >
                Record Shift Output
              </SplitButton>
            ) : (
              <Button size="sm" onClick={() => setShiftModalOpen(true)}>
                Record Shift Output
              </Button>
            )
          ) : secondaryActions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Actions
                  <ChevronDown className="ml-1 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {secondaryActions.map((action) => (
                  <DropdownMenuItem key={action.href} asChild>
                    <Link href={action.href}>{action.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      }
    >
      {pendingSettlementDispatches.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Needs Attention</AlertTitle>
          <AlertDescription>
            {pendingSettlementDispatches.length} dispatch
            {pendingSettlementDispatches.length === 1 ? "" : "es"} are waiting
            for sale records. Go to Sales to finish them.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-base text-foreground font-bold tracking-tight">
            Chain Activity
          </h2>
        </header>
        {commandError ? (
          <StatusState
            variant="error"
            title="Unable to load chain data"
            description={getApiErrorMessage(commandError)}
          />
        ) : (
          <DataTable
            data={recentChain}
            columns={columns}
            searchPlaceholder="Search by batch ID, site, or status"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Batches: {pours.length}</Badge>
                <Badge variant="secondary">
                  Dispatches: {dispatches.length}
                </Badge>
                <Badge variant="secondary">Sales: {receipts.length}</Badge>
              </div>
            }
            emptyState={
              commandLoading
                ? "Loading chain activity..."
                : "No gold activity yet."
            }
          />
        )}
      </section>

      <ShiftAllocationModal
        open={shiftModalOpen}
        onOpenChange={setShiftModalOpen}
        attendanceShifts={attendanceShifts}
        attendanceLoading={attendanceLoading}
        allocationsLoading={shiftAllocationsLoading}
        shiftReportsByKey={shiftReportsByKey}
        shiftReportsLoading={shiftReportsLoading}
        isSubmitting={createShiftAllocationMutation.isPending}
        submitError={createShiftAllocationMutation.error}
        onCreateAllocation={(payload) =>
          createShiftAllocationMutation.mutate(payload)
        }
      />
    </GoldShell>
  );
}
