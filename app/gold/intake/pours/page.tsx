"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchGoldPours } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

type GoldPourRow = Awaited<ReturnType<typeof fetchGoldPours>>["data"][number];

export default function GoldIntakePoursPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-pours", "intake-lane"],
    queryFn: () => fetchGoldPours({ limit: 300 }),
  });

  const rows = useMemo(
    () =>
      (data?.data ?? [])
        .slice()
        .sort((a, b) => b.pourDate.localeCompare(a.pourDate)),
    [data],
  );

  const columns = useMemo<ColumnDef<GoldPourRow>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.pourDate).toLocaleString()}
          </NumericCell>
        ),
      },
      {
        id: "pourBarId",
        header: "Batch ID",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.pourBarId}</span>
        ),
      },
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => row.original.site.name,
      },
      {
        id: "storageLocation",
        header: "Storage",
        accessorKey: "storageLocation",
      },
      {
        id: "grossWeight",
        header: "Gross Weight",
        cell: ({ row }) => (
          <NumericCell>{row.original.grossWeight.toFixed(3)} g</NumericCell>
        ),
      },
    ],
    [],
  );

  return (
    <GoldShell
      activeTab="intake"
      title="Batches"
      description="All recorded batches"
      actions={
        <Button asChild size="sm">
          <Link href={goldRoutes.intake.newPour}>Create Batch</Link>
        </Button>
      }
    >
      <PageIntro
        title="Batches"
        purpose="Review all batches before dispatch."
        nextStep="Find a batch, then create dispatch if needed."
      />
      <RecordSavedBanner entityLabel="gold batch" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load batches</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Batch History
          </h2>
          <p className="text-sm text-muted-foreground">Recorded batch entries</p>
        </header>
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search by batch ID, site, or storage"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={isLoading ? "Loading batches..." : "No batches found."}
        />
      </section>
    </GoldShell>
  );
}
