"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Coins, Package, Scale } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-client";
import type { ShiftAllocation, WorkerPayout } from "@/app/gold/types";

export function GoldMenu({
  setViewMode,
  onOpenShiftModal,
  shiftAllocations,
  shiftAllocationsLoading,
  shiftAllocationsError,
  payoutSummary,
  payoutWindowWeeks,
  onPayoutWindowChange,
  recentPours,
  incompleteDispatchCount,
}: {
  setViewMode: (
    mode: "menu" | "pour" | "dispatch" | "receipt" | "reconciliation" | "audit",
  ) => void;
  onOpenShiftModal: () => void;
  shiftAllocations: ShiftAllocation[];
  shiftAllocationsLoading: boolean;
  shiftAllocationsError: unknown;
  payoutSummary: WorkerPayout[];
  payoutWindowWeeks: string;
  onPayoutWindowChange: (value: string) => void;
  recentPours: Array<{
    id: string;
    date: string;
    site: string;
    weight: number;
    status: string;
  }>;
  incompleteDispatchCount: number;
}) {
  const totalWorkerGold = shiftAllocations.reduce(
    (sum, allocation) => sum + allocation.workerShareWeight,
    0,
  );
  const totalCompanyGold = shiftAllocations.reduce(
    (sum, allocation) => sum + allocation.companyShareWeight,
    0,
  );
  const recentAllocations = shiftAllocations.slice(0, 3);

  return (
    <div className="space-y-6">
      {incompleteDispatchCount > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Incomplete gold chain</AlertTitle>
          <AlertDescription>
            {incompleteDispatchCount} dispatch
            {incompleteDispatchCount === 1 ? "" : "es"} recorded without sale
            receipts. Review reconciliation to close the chain.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Shift Gold Allocation</CardTitle>
              <CardDescription>
                Net gold split between workers and company by attendance.
              </CardDescription>
            </div>
            <Button size="sm" onClick={onOpenShiftModal}>
              <Scale className="h-4 w-4" />
              Record shift gold
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">
                Allocations recorded
              </div>
              <div className="text-lg font-semibold">
                {shiftAllocations.length}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Workers total</div>
              <div className="text-lg font-semibold">
                {totalWorkerGold.toFixed(3)} g
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Company total</div>
              <div className="text-lg font-semibold">
                {totalCompanyGold.toFixed(3)} g
              </div>
            </div>
          </div>

          {shiftAllocationsLoading ? (
            <div className="text-sm text-muted-foreground">
              Loading allocations...
            </div>
          ) : shiftAllocationsError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load allocations</AlertTitle>
              <AlertDescription>
                {getApiErrorMessage(shiftAllocationsError)}
              </AlertDescription>
            </Alert>
          ) : recentAllocations.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No shift allocations recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentAllocations.map((allocation) => (
                <div
                  key={allocation.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">
                        {allocation.site.name} - {allocation.date.slice(0, 10)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {allocation.shift} shift -{" "}
                        {allocation.workerShares.length} workers
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {allocation.workerShareWeight.toFixed(3)} g to workers
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Worker Payout Preview</CardTitle>
              <CardDescription>
                Equal share payout summary for selected pay window.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={payoutWindowWeeks === "2" ? "default" : "outline"}
                size="sm"
                onClick={() => onPayoutWindowChange("2")}
              >
                2 weeks
              </Button>
              <Button
                type="button"
                variant={payoutWindowWeeks === "4" ? "default" : "outline"}
                size="sm"
                onClick={() => onPayoutWindowChange("4")}
              >
                4 weeks
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {payoutSummary.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Add shift allocations to preview worker payouts.
            </div>
          ) : (
            <div className="space-y-3">
              {payoutSummary.map((worker) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <div className="font-semibold">{worker.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {worker.employeeId}
                    </div>
                  </div>
                  <Badge variant="secondary">{worker.total.toFixed(3)} g</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gold Operations</CardTitle>
          <CardDescription>Security-critical operations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="h-auto items-start justify-start gap-3 p-4"
              onClick={() => setViewMode("pour")}
            >
              <Coins className="h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Record Pour</div>
                <div className="text-xs text-muted-foreground">
                  Create immutable gold pour entry
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto items-start justify-start gap-3 p-4"
              onClick={() => setViewMode("dispatch")}
            >
              <Package className="h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Dispatch</div>
                <div className="text-xs text-muted-foreground">
                  Generate chain-of-custody manifest
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto items-start justify-start gap-3 p-4"
              onClick={() => setViewMode("receipt")}
            >
              <Scale className="h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Buyer Receipt</div>
                <div className="text-xs text-muted-foreground">
                  Record assay and sale confirmation
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation</CardTitle>
          <CardDescription>
            Track complete chain of custody per bar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="reconciliation">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>
            <TabsContent value="reconciliation" className="pt-4">
              <div className="space-y-3">
                {recentPours.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No recent pours recorded yet.
                  </div>
                ) : (
                  recentPours.map((pour) => (
                    <div
                      key={pour.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div>
                        <div className="font-semibold">{pour.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {pour.site} - {pour.date}
                        </div>
                      </div>
                      <Badge
                        variant={
                          pour.status === "sold"
                            ? "default"
                            : pour.status === "moved"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {pour.status}
                      </Badge>
                    </div>
                  ))
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setViewMode("reconciliation")}
                >
                  View reconciliation
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="audit" className="pt-4">
              <div className="space-y-3 text-sm text-muted-foreground">
                Full audit trail available in the audit view.
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setViewMode("audit")}
              >
                View audit trail
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
