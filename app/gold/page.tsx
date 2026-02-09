"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { GoldShell } from "@/components/gold/gold-shell";
import {
  fetchAttendance,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
  fetchGoldShiftAllocations,
  fetchShiftReports,
} from "@/lib/api";
import { fetchJson } from "@/lib/api-client";
import { Coins, Package, Scale } from "lucide-react";
import { GoldMenu } from "@/app/gold/components/gold-menu";
import { ShiftAllocationModal } from "@/app/gold/components/shift-allocation-modal";
import type { AttendanceShiftSummary } from "@/app/gold/types";

const goldRoutes = {
  menu: "/gold",
  pour: "/gold/pour/new",
  dispatch: "/gold/dispatch/new",
  receipt: "/gold/receipt/new",
  payouts: "/gold/payouts",
  reconciliation: "/gold/reconciliation",
  audit: "/gold/audit",
} as const;

type GoldView = keyof typeof goldRoutes;

export default function GoldPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [shiftModalOpen, setShiftModalOpen] = useState(false);

  const attendanceStart = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return start.toISOString().slice(0, 10);
  }, []);

  const handleNavigate = (view: GoldView) => {
    router.push(goldRoutes[view]);
  };

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
    queryFn: () =>
      fetchGoldShiftAllocations({ startDate: attendanceStart, limit: 200 }),
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
  const attendanceRecords = useMemo(
    () => attendanceData?.data ?? [],
    [attendanceData],
  );
  const shiftReports = useMemo(
    () => shiftReportsData?.data ?? [],
    [shiftReportsData],
  );

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
    const map = new Map<
      string,
      { id: string; status: string; crewCount: number }
    >();
    shiftReports.forEach((report) => {
      const date = new Date(report.date).toISOString().slice(0, 10);
      const key = `${date}|${report.shift}|${report.siteId}`;
      map.set(key, {
        id: report.id,
        status: report.status,
        crewCount: report.crewCount,
      });
    });
    return map;
  }, [shiftReports]);

  const dispatches = useMemo(
    () => dispatchesData?.data ?? [],
    [dispatchesData],
  );
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

  return (
    <GoldShell
      activeTab="overview"
      description="Security-critical operations"
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShiftModalOpen(true)}
          >
            <Scale className="h-4 w-4" />
            Record Shift Gold
          </Button>
          <Button size="sm" onClick={() => router.push("/gold/pour/new")}>
            <Coins className="h-4 w-4" />
            Record Pour
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/gold/dispatch/new")}
          >
            <Package className="h-4 w-4" />
            Dispatch
          </Button>
        </>
      }
    >
      <GoldMenu
        setViewMode={handleNavigate}
        onOpenShiftModal={() => setShiftModalOpen(true)}
        shiftAllocations={shiftAllocations}
        shiftAllocationsLoading={shiftAllocationsLoading}
        shiftAllocationsError={shiftAllocationsError}
        recentPours={recentPours}
        incompleteDispatchCount={incompleteDispatchCount}
      />

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
    </GoldShell>
  );
}
