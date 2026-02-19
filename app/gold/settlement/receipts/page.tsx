"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ReceiptForm } from "@/app/gold/components/receipt-form";
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
import { fetchGoldDispatches, fetchGoldReceipts } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";
import { canViewHrefWithEnabledFeatures } from "@/lib/platform/gating/nav-filter";

type GoldReceiptRow = Awaited<ReturnType<typeof fetchGoldReceipts>>["data"][number];

export default function GoldSettlementReceiptsPage() {
  const [manualCreateOpen, setManualCreateOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const createRequested = searchParams.get("create") === "1";
  const createOpen = manualCreateOpen || createRequested;
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const canViewPayouts = useMemo(
    () => canViewHrefWithEnabledFeatures(goldRoutes.settlement.payouts, enabledFeatures),
    [enabledFeatures],
  );

  const handleCloseCreate = () => {
    setManualCreateOpen(false);
    if (!createRequested) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("create");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-receipts", "settlement-lane"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });
  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches", "settlement-lane"],
    queryFn: () => fetchGoldDispatches({ limit: 300 }),
    enabled: createOpen,
  });

  const rows = useMemo(
    () =>
      (data?.data ?? [])
        .slice()
        .sort((a, b) => b.receiptDate.localeCompare(a.receiptDate)),
    [data],
  );
  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);
  const receiptDispatchIds = useMemo(() => {
    const ids = new Set<string>();
    rows.forEach((receipt) => ids.add(receipt.goldDispatch.id));
    return ids;
  }, [rows]);
  const availableDispatches = useMemo(
    () => dispatches.filter((dispatch) => !receiptDispatchIds.has(dispatch.id)),
    [dispatches, receiptDispatchIds],
  );

  const columns = useMemo<ColumnDef<GoldReceiptRow>[]>(
    () => [
      {
        id: "receiptDate",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.receiptDate).toLocaleString()}
          </NumericCell>
        ),
      },
      {
        id: "receiptNumber",
        header: "Sale No.",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.receiptNumber}</span>
        ),
      },
      {
        id: "batch",
        header: "Batch",
        cell: ({ row }) => row.original.goldDispatch.goldPour.pourBarId,
      },
      {
        id: "paymentMethod",
        header: "Method",
        accessorKey: "paymentMethod",
      },
      {
        id: "paidAmount",
        header: "Paid Amount",
        cell: ({ row }) => (
          <NumericCell>{row.original.paidAmount.toFixed(3)} g</NumericCell>
        ),
      },
    ],
    [],
  );

  return (
    <GoldShell
      activeTab="sales"
      title="Sales"
      description="Buyer settlement records and payment traceability."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setManualCreateOpen(true)}>
            Record Sale
          </Button>
          {canViewPayouts ? (
            <Button asChild size="sm" variant="outline">
              <Link href={goldRoutes.settlement.payouts}>View Payouts</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <PageIntro
        title="Sales"
        purpose="Record buyer sale details for dispatched batches."
        nextStep="Add missing sale records for dispatches still waiting."
      />
      <RecordSavedBanner entityLabel="gold sale record" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load sales</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Sales History
          </h2>
          <p className="text-sm text-muted-foreground">Recorded buyer sale entries</p>
        </header>
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search by sale number, batch, or method"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={isLoading ? "Loading sales..." : "No sales recorded."}
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
            <SheetTitle>Record Sale</SheetTitle>
            <SheetDescription>Capture buyer test results and payment details.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ReceiptForm
              mode="modal"
              redirectOnSuccess={false}
              onSuccess={handleCloseCreate}
              onCancel={handleCloseCreate}
              availableDispatches={availableDispatches}
              dispatchCreateHref={goldRoutes.transit.create}
            />
          </div>
        </SheetContent>
      </Sheet>
    </GoldShell>
  );
}
