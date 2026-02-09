"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoldShell } from "@/components/gold/gold-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { fetchGoldShiftAllocations } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";
import type { WorkerPayout } from "@/app/gold/types";

export default function GoldPayoutsPage() {
  const [payoutWindowWeeks, setPayoutWindowWeeks] = useState("2");
  const payoutTableRef = useRef<HTMLDivElement>(null);

  const startDate = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 60);
    return start.toISOString().slice(0, 10);
  }, []);

  const {
    data: shiftAllocationsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["gold-shift-allocations", "payouts", startDate],
    queryFn: () => fetchGoldShiftAllocations({ startDate, limit: 500 }),
  });

  const shiftAllocations = useMemo(
    () => shiftAllocationsData?.data ?? [],
    [shiftAllocationsData],
  );

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

  const payoutDetails = useMemo(() => {
    const windowWeeks = Number(payoutWindowWeeks);
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowWeeks * 7);

    const totals = new Map<
      string,
      {
        id: string;
        name: string;
        employeeId: string;
        total: number;
        earliestDate?: Date;
        latestDate?: Date;
        allocationCount: number;
      }
    >();

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
            earliestDate: allocationDate,
            latestDate: allocationDate,
            allocationCount: 0,
          };

        const earliest =
          !existing.earliestDate || allocationDate < existing.earliestDate
            ? allocationDate
            : existing.earliestDate;
        const latest =
          !existing.latestDate || allocationDate > existing.latestDate
            ? allocationDate
            : existing.latestDate;

        totals.set(share.employee.id, {
          ...existing,
          total: existing.total + share.shareWeight,
          earliestDate: earliest,
          latestDate: latest,
          allocationCount: existing.allocationCount + 1,
        });
      });
    });

    return Array.from(totals.values()).sort((a, b) => b.total - a.total);
  }, [payoutWindowWeeks, shiftAllocations]);

  const totalGold = payoutSummary.reduce((sum, payout) => sum + payout.total, 0);

  const handleExportPdf = () => {
    if (!payoutTableRef.current) return;
    exportElementToPdf(
      payoutTableRef.current,
      `gold-worker-payouts-${payoutWindowWeeks}-weeks.pdf`,
    );
  };

  return (
    <GoldShell
      activeTab="payouts"
      title="Worker Payouts"
      description="Review gold share distributions by pay window"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payouts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Payout Window</CardTitle>
              <CardDescription>Filter worker shares by cycle length.</CardDescription>
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
                disabled={isLoading || payoutDetails.length === 0}
              >
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">Workers paid</div>
                <div className="text-lg font-semibold">{payoutSummary.length}</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">Gold to workers</div>
                <div className="text-lg font-semibold">{totalGold.toFixed(3)} g</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Worker Breakdown</CardTitle>
          <CardDescription>Totals for the selected pay window.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : payoutDetails.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No payouts recorded for this window yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-semibold">Employee</th>
                    <th className="text-left p-3 font-semibold">Earned Period</th>
                    <th className="text-left p-3 font-semibold">Gold Payout (g)</th>
                    <th className="text-left p-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutDetails.map((worker) => {
                    const periodLabel =
                      worker.earliestDate && worker.latestDate
                        ? worker.earliestDate.toDateString() ===
                          worker.latestDate.toDateString()
                          ? format(worker.earliestDate, "MMM d, yyyy")
                          : `${format(worker.earliestDate, "MMM d, yyyy")} - ${format(
                              worker.latestDate,
                              "MMM d, yyyy",
                            )}`
                        : "-";
                    return (
                      <tr key={worker.id} className="border-b">
                        <td className="p-3">
                          <div className="font-semibold">{worker.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {worker.employeeId}
                          </div>
                        </td>
                        <td className="p-3">
                          {periodLabel}
                          <div className="text-xs text-muted-foreground">
                            {worker.allocationCount} shift allocation
                            {worker.allocationCount === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary">{worker.total.toFixed(3)} g</Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">Pay window {payoutWindowWeeks} weeks</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={payoutTableRef}>
          <PdfTemplate
            title="Gold Worker Payouts"
            subtitle={`${format(windowStartDate, "yyyy-MM-dd")} to ${format(windowEndDate, "yyyy-MM-dd")}`}
            meta={[
              { label: "Pay window", value: `${payoutWindowWeeks} weeks` },
              { label: "Total workers", value: String(payoutDetails.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Employee</th>
                  <th className="py-2">Earned Period</th>
                  <th className="py-2">Gold Payout (g)</th>
                  <th className="py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {payoutDetails.map((worker) => {
                  const periodLabel =
                    worker.earliestDate && worker.latestDate
                      ? worker.earliestDate.toDateString() ===
                        worker.latestDate.toDateString()
                        ? format(worker.earliestDate, "MMM d, yyyy")
                        : `${format(worker.earliestDate, "MMM d, yyyy")} - ${format(
                            worker.latestDate,
                            "MMM d, yyyy",
                          )}`
                      : "-";
                  return (
                    <tr key={worker.id} className="border-b border-gray-100">
                      <td className="py-2">
                        <div className="font-semibold">{worker.name}</div>
                        <div className="text-[10px] text-gray-500">{worker.employeeId}</div>
                      </td>
                      <td className="py-2">{periodLabel}</td>
                      <td className="py-2">{worker.total.toFixed(3)}</td>
                      <td className="py-2">Pay window {payoutWindowWeeks} weeks</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </GoldShell>
  );
}
