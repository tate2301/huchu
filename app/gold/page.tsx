"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GoldShell } from "@/components/gold/gold-shell";
import { StatusState } from "@/components/shared/status-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowRightLeft, CheckCircle2, Gem, Wallet } from "@/lib/icons";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchAttendance,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
  fetchGoldShiftAllocations,
  fetchShiftReports,
} from "@/lib/api";
import { ShiftAllocationModal } from "@/app/gold/components/shift-allocation-modal";
import { goldRoutes } from "@/app/gold/routes";
import type { AttendanceShiftSummary } from "@/app/gold/types";

export default function GoldPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shiftModalOpen, setShiftModalOpen] = useState(false);

  const attendanceStart = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return start.toISOString().slice(0, 10);
  }, []);

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

  useQuery({
    queryKey: ["gold-shift-allocations", attendanceStart],
    queryFn: () =>
      fetchGoldShiftAllocations({ startDate: attendanceStart, limit: 200 }),
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

  const pendingSettlementDispatches = useMemo(
    () =>
      dispatches.filter((dispatch) => !receiptByDispatchId.has(dispatch.id)),
    [dispatches, receiptByDispatchId],
  );

  const commandError = poursError || dispatchesError || receiptsError;
  const commandLoading =
    poursLoading || dispatchesLoading || receiptsLoading;

  const recentChain = useMemo(() => {
    return pours
      .slice()
      .sort((a, b) => b.pourDate.localeCompare(a.pourDate))
      .slice(0, 8)
      .map((pour) => {
        const dispatch = dispatchByPourId.get(pour.id);
        const receipt = dispatch
          ? receiptByDispatchId.get(dispatch.id)
          : undefined;
        const status = receipt
          ? "Complete"
          : dispatch
            ? "Dispatched"
            : "Waiting for dispatch";
        return {
          id: pour.id,
          pourBarId: pour.pourBarId,
          site: pour.site.code,
          date: pour.pourDate,
          status,
        };
      });
  }, [dispatchByPourId, pours, receiptByDispatchId]);

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

  const createShiftAllocationMutation = useMutation({
    mutationFn: async (payload: {
      date: string;
      shift: "DAY" | "NIGHT";
      siteId: string;
      totalWeight: number;
      expenses: Array<{ type: string; weight: number }>;
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

  return (
    <GoldShell
      activeTab="command"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={goldRoutes.intake.newPour}>Create Batch</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={goldRoutes.transit.newDispatch}>Send Batch</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={goldRoutes.settlement.newReceipt}>Record Sale</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShiftModalOpen(true)}
          >
            Record Shift Output
          </Button>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-8 md:grid-cols-4 mt-4">
          <Button
            asChild
            variant="outline"
            className="h-auto justify-start py-3"
          >
            <Link
              href={goldRoutes.intake.newPour}
              className="flex flex-col gap-4 items-start"
            >
              <Gem size={18} className="text-amber-700" />
              <span className="flex flex-col items-start text-left">
                <span>Create batch</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Start a trackable batch record for produced gold.
                </span>
              </span>
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto justify-start py-3"
          >
            <Link
              href={goldRoutes.transit.newDispatch}
              className="flex flex-col gap-4 items-start"
            >
              <ArrowRightLeft size={18} className="text-sky-700" />
              <span className="flex flex-col items-start text-left">
                <span>Send batch</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Record movement of a batch to the buyer.
                </span>
              </span>
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto justify-start py-3"
          >
            <Link
              href={goldRoutes.settlement.newReceipt}
              className="flex flex-col gap-4 items-start"
            >
              <CheckCircle2 size={18} className="text-emerald-700" />
              <span className="flex flex-col items-start text-left">
                <span>Record sale</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Save buyer test result and payment details.
                </span>
              </span>
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto justify-start py-3"
          >
            <Link
              href={goldRoutes.settlement.payouts}
              className="flex flex-col gap-4 items-start"
            >
              <Wallet size={18} className="text-rose-700" />
              <span className="flex flex-col items-start text-left">
                <span>Review worker payouts</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Check allocation outcomes before final payout.
                </span>
              </span>
            </Link>
          </Button>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>Recent Gold Chain</CardTitle>
          <CardDescription>Latest batches and current status.</CardDescription>
        </CardHeader>
        <CardContent>
          {commandError ? (
            <StatusState
              variant="error"
              title="Unable to load data"
              description={getApiErrorMessage(commandError)}
            />
          ) : commandLoading ? (
            <StatusState variant="loading" />
          ) : recentChain.length === 0 ? (
            <StatusState
              variant="empty"
              title="No gold activity yet"
              description="Create your first batch to start tracking gold."
              action={
                <Button asChild size="sm">
                  <Link href={goldRoutes.intake.newPour}>Create Batch</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Batch ID</th>
                    <th className="p-3 text-left font-semibold">Site</th>
                    <th className="p-3 text-left font-semibold">Date</th>
                    <th className="p-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentChain.map((entry) => (
                    <tr key={entry.id} className="border-b">
                      <td className="p-3 font-medium">{entry.pourBarId}</td>
                      <td className="p-3">{entry.site}</td>
                      <td className="p-3">
                        {new Date(entry.date).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            entry.status === "Complete"
                              ? "default"
                              : entry.status === "Dispatched"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {entry.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ShiftAllocationModal
        open={shiftModalOpen}
        onOpenChange={setShiftModalOpen}
        attendanceShifts={attendanceShifts}
        attendanceLoading={attendanceLoading}
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
