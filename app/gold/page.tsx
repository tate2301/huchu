"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchAttendance,
  fetchEmployees,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
  fetchGoldShiftAllocations,
  fetchSites,
  fetchShiftReports,
} from "@/lib/api";
import { fetchJson } from "@/lib/api-client";
import { Coins, Package, Scale } from "lucide-react";
import { AuditTrail } from "@/app/gold/components/audit-trail";
import { DispatchForm } from "@/app/gold/components/dispatch-form";
import { GoldMenu } from "@/app/gold/components/gold-menu";
import { PourForm } from "@/app/gold/components/pour-form";
import { ReceiptForm } from "@/app/gold/components/receipt-form";
import { ReconciliationView } from "@/app/gold/components/reconciliation-view";
import { ShiftAllocationModal } from "@/app/gold/components/shift-allocation-modal";
import type { AttendanceShiftSummary, WorkerPayout } from "@/app/gold/types";

const goldViews = [
  "menu",
  "pour",
  "dispatch",
  "receipt",
  "reconciliation",
  "audit",
] as const;
type ViewMode = (typeof goldViews)[number];

export default function GoldPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewParam = searchParams.get("view");
  const initialView = goldViews.includes(viewParam as ViewMode)
    ? (viewParam as ViewMode)
    : "menu";
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [payoutWindowWeeks, setPayoutWindowWeeks] = useState("2");
  const attendanceStart = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return start.toISOString().slice(0, 10);
  }, []);
  const viewDescription = {
    menu: "Security-critical operations",
    pour: "Record Pour",
    dispatch: "Dispatch Manifest",
    receipt: "Buyer Receipt",
    reconciliation: "Reconciliation",
    audit: "Audit Trail",
  }[viewMode];
  const changeView = (view: ViewMode) => {
    setViewMode(view);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`/gold?${params.toString()}`);
  };
  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-forms"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });
  const employees = employeesData?.data ?? [];
  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ["sites", "gold"],
    queryFn: () => fetchSites(),
  });
  const sites = sitesData ?? [];
  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
    queryKey: ["attendance", "gold", attendanceStart],
    queryFn: () => fetchAttendance({ startDate: attendanceStart, limit: 500 }),
  });
  const { data: shiftReportsData, isLoading: shiftReportsLoading } = useQuery({
    queryKey: ["shift-reports", "gold", attendanceStart],
    queryFn: () => fetchShiftReports({ startDate: attendanceStart, limit: 200 }),
  });
  const {
    data: shiftAllocationsData,
    isLoading: shiftAllocationsLoading,
    error: shiftAllocationsError,
  } = useQuery({
    queryKey: ["gold-shift-allocations", attendanceStart],
    queryFn: () => fetchGoldShiftAllocations({ startDate: attendanceStart, limit: 200 }),
  });
  const { data: poursData } = useQuery({
    queryKey: ["gold-pours"],
    queryFn: () => fetchGoldPours({ limit: 50 }),
  });
  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches"],
    queryFn: () => fetchGoldDispatches({ limit: 200 }),
  });
  const { data: receiptsData } = useQuery({
    queryKey: ["gold-receipts"],
    queryFn: () => fetchGoldReceipts({ limit: 200 }),
  });
  const shiftAllocations = useMemo(
    () => shiftAllocationsData?.data ?? [],
    [shiftAllocationsData],
  );
  const attendanceRecords = useMemo(() => attendanceData?.data ?? [], [attendanceData]);
  const shiftReports = useMemo(() => shiftReportsData?.data ?? [], [shiftReportsData]);
  const attendanceShifts = useMemo(() => {
    const grouped = new Map<string, AttendanceShiftSummary>();
    attendanceRecords.forEach((record) => {
      const date = new Date(record.date).toISOString().slice(0, 10);
      const key = `${date}|${record.shift}|${record.site.id}`;
      const existing =
        grouped.get(key) ??
        ({
          key,
          date,
          shift: record.shift,
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

    return Array.from(grouped.values()).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }, [attendanceRecords]);
  const shiftReportsByKey = useMemo(() => {
    const map = new Map<string, { id: string; status: string; crewCount: number }>();
    shiftReports.forEach((report) => {
      const date = new Date(report.date).toISOString().slice(0, 10);
      const key = `${date}|${report.shift}|${report.siteId}`;
      map.set(key, { id: report.id, status: report.status, crewCount: report.crewCount });
    });
    return map;
  }, [shiftReports]);
  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);
  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatchByPourId = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((dispatch) => {
      map.set(dispatch.goldPourId, dispatch);
    });
    return map;
  }, [dispatches]);
  const receiptByDispatchId = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((receipt) => {
      map.set(receipt.goldDispatch.id, receipt);
    });
    return map;
  }, [receipts]);
  const incompleteDispatchCount = useMemo(
    () => dispatches.filter((dispatch) => !receiptByDispatchId.has(dispatch.id)).length,
    [dispatches, receiptByDispatchId],
  );
  const recentPours = useMemo(() => {
    return pours
      .slice()
      .sort((a, b) => b.pourDate.localeCompare(a.pourDate))
      .slice(0, 3)
      .map((pour) => {
        const dispatch = dispatchByPourId.get(pour.id);
        const receipt = dispatch ? receiptByDispatchId.get(dispatch.id) : undefined;
        const status = receipt ? "sold" : dispatch ? "moved" : "in-storage";
        return {
          id: pour.pourBarId,
          date: pour.pourDate.slice(0, 10),
          site: pour.site.name,
          weight: pour.grossWeight,
          status,
        };
      });
  }, [dispatchByPourId, pours, receiptByDispatchId]);
  const availablePoursForDispatch = useMemo(
    () => pours.filter((pour) => !dispatchByPourId.has(pour.id)),
    [dispatchByPourId, pours],
  );
  const availableDispatchesForReceipt = useMemo(
    () => dispatches.filter((dispatch) => !receiptByDispatchId.has(dispatch.id)),
    [dispatches, receiptByDispatchId],
  );
  const createShiftAllocationMutation = useMutation({
    mutationFn: async (payload: {
      date: string;
      shift: "DAY" | "NIGHT";
      siteId: string;
      totalWeight: number;
      expenses: Array<{ type: string; weight: number }>;
      payCycleWeeks: number;
    }) =>
      fetchJson("/api/gold/shift-allocations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Shift allocation recorded",
        description: "Gold split recorded and ready for payout.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-shift-allocations"] });
      setShiftModalOpen(false);
    },
  });
  const payoutSummary = useMemo<WorkerPayout[]>(() => {
    const windowWeeks = Number(payoutWindowWeeks);
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowWeeks * 7);

    const totals = new Map<string, WorkerPayout>();
    shiftAllocations.forEach((allocation) => {
      const allocationDate = new Date(allocation.date);
      if (allocation.payCycleWeeks !== windowWeeks) return;
      if (allocationDate < windowStart) return;
      allocation.workerShares.forEach((share) => {
        const existing =
          totals.get(share.employee.id) ?? {
            id: share.employee.id,
            name: share.employee.name,
            employeeId: share.employee.employeeId,
            total: 0,
          };
        totals.set(share.employee.id, {
          ...existing,
          total: existing.total + share.shareWeight,
        });
      });
    });

    return Array.from(totals.values()).sort((a, b) => b.total - a.total);
  }, [payoutWindowWeeks, shiftAllocations]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button size="sm" variant="outline" onClick={() => setShiftModalOpen(true)}>
          <Scale className="h-4 w-4" />
          Record Shift Gold
        </Button>
        <Button size="sm" onClick={() => changeView("pour")}> 
          <Coins className="h-4 w-4" />
          Record Pour
        </Button>
        <Button size="sm" variant="outline" onClick={() => changeView("dispatch")}>
          <Package className="h-4 w-4" />
          Dispatch
        </Button>
      </PageActions>

      <PageHeading title="Gold Control" description={viewDescription} />

      <div className="space-y-6">
        {viewMode === "menu" && (
          <GoldMenu
            setViewMode={changeView}
            onOpenShiftModal={() => setShiftModalOpen(true)}
            shiftAllocations={shiftAllocations}
            shiftAllocationsLoading={shiftAllocationsLoading}
            shiftAllocationsError={shiftAllocationsError}
            payoutSummary={payoutSummary}
            payoutWindowWeeks={payoutWindowWeeks}
            onPayoutWindowChange={setPayoutWindowWeeks}
            recentPours={recentPours}
            incompleteDispatchCount={incompleteDispatchCount}
          />
        )}
        {viewMode === "pour" && (
          <PourForm
            setViewMode={changeView}
            employees={employees}
            employeesLoading={employeesLoading}
            sites={sites}
            sitesLoading={sitesLoading}
          />
        )}
        {viewMode === "dispatch" && (
          <DispatchForm
            setViewMode={changeView}
            employees={employees}
            employeesLoading={employeesLoading}
            availablePours={availablePoursForDispatch}
          />
        )}
        {viewMode === "receipt" && (
          <ReceiptForm
            setViewMode={changeView}
            availableDispatches={availableDispatchesForReceipt}
          />
        )}
        {viewMode === "reconciliation" && (
          <ReconciliationView setViewMode={changeView} />
        )}
        {viewMode === "audit" && <AuditTrail setViewMode={changeView} />}
      </div>

      <ShiftAllocationModal
        open={shiftModalOpen}
        onOpenChange={setShiftModalOpen}
        attendanceShifts={attendanceShifts}
        attendanceLoading={attendanceLoading}
        shiftReportsByKey={shiftReportsByKey}
        shiftReportsLoading={shiftReportsLoading}
        isSubmitting={createShiftAllocationMutation.isPending}
        submitError={createShiftAllocationMutation.error}
        onCreateAllocation={(payload) => createShiftAllocationMutation.mutate(payload)}
      />
    </div>
  );
}
