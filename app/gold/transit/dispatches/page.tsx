"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchGoldDispatches, fetchGoldReceipts } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

type GoldDispatchRow = Awaited<ReturnType<typeof fetchGoldDispatches>>["data"][number];

export default function GoldTransitDispatchesPage() {
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

  const settledDispatchIds = useMemo(() => {
    const ids = new Set<string>();
    (receiptsData?.data ?? []).forEach((receipt) => ids.add(receipt.goldDispatch.id));
    return ids;
  }, [receiptsData]);

  const rows = useMemo(
    () =>
      (dispatchesData?.data ?? [])
        .slice()
        .sort((a, b) => b.dispatchDate.localeCompare(a.dispatchDate)),
    [dispatchesData],
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
      },
      {
        id: "batch",
        header: "Batch",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.goldPour.pourBarId}</span>
        ),
      },
      {
        id: "courier",
        header: "Courier",
        accessorKey: "courier",
      },
      {
        id: "destination",
        header: "Destination",
        accessorKey: "destination",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const settled = settledDispatchIds.has(row.original.id);
          return (
            <Badge variant={settled ? "default" : "secondary"}>
              {settled ? "Settled" : "Awaiting sale"}
            </Badge>
          );
        },
      },
    ],
    [settledDispatchIds],
  );

  return (
    <GoldShell
      activeTab="transit"
      title="Dispatches"
      description="All batch dispatch records"
      actions={
        <Button asChild size="sm">
          <Link href={goldRoutes.transit.newDispatch}>Record Dispatch</Link>
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
    </GoldShell>
  );
}
