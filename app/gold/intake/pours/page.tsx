"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PourForm } from "@/app/gold/components/pour-form";
import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { fetchEmployees, fetchGoldPours, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

type GoldPourRow = Awaited<ReturnType<typeof fetchGoldPours>>["data"][number];

export default function GoldIntakePoursPage() {
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-pours", "intake-lane"],
    queryFn: () => fetchGoldPours({ limit: 300, sourceType: "PRODUCTION" }),
  });
  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-intake-modal"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
    enabled: createOpen,
  });
  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ["sites", "gold-intake-modal"],
    queryFn: fetchSites,
    enabled: createOpen,
  });

  const rows = useMemo(
    () =>
      (data?.data ?? [])
        .slice()
        .sort((a, b) => b.pourDate.localeCompare(a.pourDate)),
    [data],
  );
  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);
  const sites = useMemo(() => sitesData ?? [], [sitesData]);

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
      activeTab="batches"
      title="Batches"
      description="Recorded gold batches and custody-ready intake history."
      actions={
        <Button size="sm" onClick={() => setManualCreateOpen(true)}>
          Record Batch
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
            <SheetTitle>Record Batch</SheetTitle>
            <SheetDescription>Create the first chain record for produced gold.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <PourForm
              mode="modal"
              redirectOnSuccess={false}
              onSuccess={handleCloseCreate}
              onCancel={handleCloseCreate}
              employees={employees}
              employeesLoading={employeesLoading}
              sites={sites}
              sitesLoading={sitesLoading}
            />
          </div>
        </SheetContent>
      </Sheet>
    </GoldShell>
  );
}
