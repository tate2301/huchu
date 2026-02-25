"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DispatchForm } from "@/app/gold/components/dispatch-form";
import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchEmployees, fetchGoldDispatches, fetchGoldPours, fetchGoldReceipts } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

type GoldDispatchRow = Awaited<ReturnType<typeof fetchGoldDispatches>>["data"][number];

export default function GoldTransitDispatchesPage() {
  const [manualCreateOpen, setManualCreateOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const createRequested = searchParams.get("create") === "1";
  const createOpen = manualCreateOpen || createRequested;

  const handleCloseCreate = () => {
    setManualCreateOpen(false);
    if (!createRequested) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("create");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const {
    data: dispatchesData,
    isLoading: dispatchesLoading,
    error: dispatchesError,
  } = useQuery({
    queryKey: ["gold-dispatches", "transit-lane"],
    queryFn: () => fetchGoldDispatches({ limit: 300 }),
  });

  const { data: receiptsData } = useQuery({
    queryKey: ["gold-receipts", "transit-lane"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });
  const { data: poursData } = useQuery({
    queryKey: ["gold-pours", "transit-lane"],
    queryFn: () => fetchGoldPours({ limit: 300 }),
    enabled: createOpen,
  });
  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-transit-modal"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
    enabled: createOpen,
  });

  const soldPourIds = useMemo(() => {
    const ids = new Set<string>();
    (receiptsData?.data ?? []).forEach((receipt) => {
      if (receipt.goldPour.id) ids.add(receipt.goldPour.id);
    });
    return ids;
  }, [receiptsData]);

  const rows = useMemo(
    () =>
      (dispatchesData?.data ?? [])
        .slice()
        .sort((a, b) => b.dispatchDate.localeCompare(a.dispatchDate)),
    [dispatchesData],
  );
  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);
  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatchCountByPourId = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((dispatch) => {
      const current = map.get(dispatch.goldPourId) ?? 0;
      map.set(dispatch.goldPourId, current + 1);
    });
    return map;
  }, [rows]);
  const availablePours = useMemo(
    () =>
      pours
        .map((pour) => ({
          ...pour,
          dispatchCount: dispatchCountByPourId.get(pour.id) ?? 0,
        }))
        .sort((left, right) => right.pourDate.localeCompare(left.pourDate)),
    [dispatchCountByPourId, pours],
  );

  const columns = useMemo<ColumnDef<GoldDispatchRow>[]>(
    () => [
      {
        id: "dispatchDate",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.dispatchDate).toLocaleString()}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "batch",
        header: "Batch",
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.goldPour.pourBarId}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.goldPour.grossWeight.toFixed(3)} g
            </div>
          </div>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => (
          <NumericCell>${(row.original.valueUsd ?? row.original.goldPour.valueUsd ?? 0).toFixed(2)}</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "courier",
        header: "Courier",
        accessorKey: "courier",
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "destination",
        header: "Destination",
        accessorKey: "destination",
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const settled = soldPourIds.has(row.original.goldPourId);
          return (
            <Badge variant={settled ? "default" : "secondary"}>
              {settled ? "Settled" : "Awaiting sale"}
            </Badge>
          );
        },
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [soldPourIds],
  );

  return (
    <GoldShell
      activeTab="dispatches"
      title="Dispatches"
      description="Dispatch history with custody and settlement tracking."
      actions={
        <Button size="sm" onClick={() => setManualCreateOpen(true)}>
          Record Dispatch
        </Button>
      }
    >
      <PageIntro
        title="Dispatches"
        purpose="Track dispatches until sale is recorded."
        nextStep="Find rows marked Awaiting sale and finish them."
      />
      <RecordSavedBanner entityLabel="batch dispatch" />

      {dispatchesError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load dispatches</AlertTitle>
          <AlertDescription>{getApiErrorMessage(dispatchesError)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Dispatch History
          </h2>
          <p className="text-sm text-muted-foreground">Recorded dispatch entries</p>
        </header>
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search by batch, courier, or destination"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={dispatchesLoading ? "Loading dispatches..." : "No dispatch records."}
        />
      </section>

      <Sheet
        open={createOpen}
        onOpenChange={(next) => {
          if (next) {
            setManualCreateOpen(true);
            return;
          }
          handleCloseCreate();
        }}
      >
        <SheetContent size="xl" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Record Dispatch</SheetTitle>
            <SheetDescription>Move a batch into transit with full custody details.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <DispatchForm
              mode="modal"
              redirectOnSuccess={false}
              onSuccess={handleCloseCreate}
              onCancel={handleCloseCreate}
              employees={employees}
              employeesLoading={employeesLoading}
              availablePours={availablePours}
              newBatchHref={goldRoutes.intake.create}
            />
          </div>
        </SheetContent>
      </Sheet>
    </GoldShell>
  );
}
