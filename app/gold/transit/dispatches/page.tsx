"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight } from "@/lib/icons";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ClientDate } from "@/app/gold/components/client-date";
import { DispatchForm } from "@/app/gold/components/dispatch-form";
import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fetchEmployees,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

type GoldDispatchRow = Awaited<
  ReturnType<typeof fetchGoldDispatches>
>["data"][number];

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
    queryFn: () =>
      fetchEmployees({
        active: true,
        position: ["MANAGER", "CLERK"],
        limit: 500,
      }),
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
  const dispatchedPourIds = useMemo(() => {
    const ids = new Set<string>();
    rows.forEach((dispatch) => {
      if (dispatch.goldPourId) ids.add(dispatch.goldPourId);
      dispatch.batches?.forEach((batch) => ids.add(batch.goldPourId));
    });
    return ids;
  }, [rows]);
  const availablePours = useMemo(
    () =>
      pours
        .filter((pour) => !dispatchedPourIds.has(pour.id))
        .map((pour) => ({ ...pour, dispatchCount: 0 }))
        .sort((left, right) => right.pourDate.localeCompare(left.pourDate)),
    [dispatchedPourIds, pours],
  );

  const columns = useMemo<ColumnDef<GoldDispatchRow>[]>(
    () => [
      {
        id: "dispatchDate",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            <Link
              href={`/gold/transit/dispatches/${row.original.id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
              title="View dispatch details"
            >
              <ClientDate value={row.original.dispatchDate} />
              <ChevronRight className="h-3 w-3 opacity-60" />
            </Link>
          </NumericCell>
        ),
        size: 180,
        minSize: 180,
        maxSize: 200,
      },
      {
        id: "batch",
        header: "Batch(es)",
        cell: ({ row }) => {
          const batches = row.original.batches ?? [];
          const totalWeight =
            batches.length > 0
              ? batches.reduce(
                  (sum, batch) => sum + (batch.goldPour?.grossWeight ?? 0),
                  0,
                )
              : row.original.goldPour.grossWeight;
          if (batches.length > 1) {
            return (
              <div>
                <div className="font-mono font-semibold">
                  {batches.length} batches
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {batches
                    .map((batch) => batch.goldPour?.pourBarId)
                    .filter(Boolean)
                    .join(", ")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalWeight.toFixed(3)} g total
                </div>
              </div>
            );
          }
          return (
            <div>
              <div className="font-mono font-semibold">
                {row.original.goldPour.pourBarId}
              </div>
              <div className="text-xs text-muted-foreground">
                {row.original.goldPour.grossWeight.toFixed(3)} g
              </div>
            </div>
          );
        },
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => (
          <NumericCell>
            $
            {(
              row.original.valueUsd ??
              row.original.goldPour.valueUsd ??
              0
            ).toFixed(2)}
          </NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "courier",
        header: "Courier",
        accessorKey: "courier",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "destination",
        header: "Destination",
        accessorKey: "destination",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const batches = row.original.batches ?? [];
          const allBatchIds = batches.length > 0
            ? batches.map((batch) => batch.goldPourId)
            : [row.original.goldPourId];
          const settledCount = allBatchIds.filter((id) => soldPourIds.has(id)).length;
          const allSettled = settledCount === allBatchIds.length;
          const partial = settledCount > 0 && !allSettled;
          return (
            <StatusChip
              status={allSettled ? "passing" : partial ? "warning" : "pending"}
              label={
                allSettled
                  ? "Settled"
                  : partial
                    ? `${settledCount}/${allBatchIds.length} sold`
                    : "Awaiting sale"
              }
            />
          );
        },
        size: 140,
        minSize: 140,
        maxSize: 140,
      },
    ],
    [soldPourIds],
  );

  return (
    <GoldShell
      activeTab="dispatches"
      title="Dispatches"
      actions={
        <Button size="sm" onClick={() => setManualCreateOpen(true)}>
          Record Dispatch
        </Button>
      }
    >
      <RecordSavedBanner entityLabel="batch dispatch" />

      {dispatchesError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load dispatches</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(dispatchesError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Dispatch History
          </h2>
        </header>
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search by batch, courier, or destination"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={
            dispatchesLoading ? (
              <div className="space-y-2 p-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                    <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              "No dispatch records."
            )
          }
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
            <SheetDescription>
              Move a batch into transit with full custody details.
            </SheetDescription>
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
