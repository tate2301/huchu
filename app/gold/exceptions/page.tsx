"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ui/export-menu";
import { NumericCell } from "@/components/ui/numeric-cell";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { StatusChip } from "@/components/ui/status-chip";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import {
  fetchGoldCorrections,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";
import { canViewHrefWithEnabledFeatures } from "@/lib/platform/gating/nav-filter";

type MissingDispatchRow = {
  id: string;
  batchId: string;
  site: string;
  pourDate: string;
  grossWeight: number;
  valueUsd: number;
};

type MissingSaleRow = {
  id: string;
  batchId: string;
  courier: string;
  destination: string;
  dispatchDate: string;
};

type CorrectionRow = {
  id: string;
  createdAt: string;
  entityType: string;
  reference: string;
  reason: string;
  createdBy: string;
};

export default function GoldExceptionsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const initialView = searchParams.get("view");
  const exceptionPdfRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<
    "missing-dispatch" | "missing-sale" | "corrections"
  >(
    initialView === "missing-dispatch" ||
      initialView === "missing-sale" ||
      initialView === "corrections"
      ? initialView
      : "missing-dispatch",
  );

  const { data: poursData } = useQuery({
    queryKey: ["gold-pours", "exceptions"],
    queryFn: () => fetchGoldPours({ limit: 300 }),
  });
  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches", "exceptions"],
    queryFn: () => fetchGoldDispatches({ limit: 300 }),
  });
  const {
    data: receiptsData,
    isLoading: receiptsLoading,
    error: receiptsError,
  } = useQuery({
    queryKey: ["gold-receipts", "exceptions"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });
  const {
    data: correctionsData,
    isLoading: correctionsLoading,
    error: correctionsError,
  } = useQuery({
    queryKey: ["gold-corrections", "exceptions"],
    queryFn: () => fetchGoldCorrections({ limit: 300 }),
  });

  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatches = useMemo(
    () => dispatchesData?.data ?? [],
    [dispatchesData],
  );
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);
  const corrections = useMemo(
    () => correctionsData?.data ?? [],
    [correctionsData],
  );

  const dispatchByPourId = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((dispatch) => map.set(dispatch.goldPourId, dispatch));
    return map;
  }, [dispatches]);

  const soldPourIds = useMemo(() => {
    const ids = new Set<string>();
    receipts.forEach((receipt) => {
      if (receipt.goldPour.id) ids.add(receipt.goldPour.id);
    });
    return ids;
  }, [receipts]);

  const missingDispatchRows = useMemo<MissingDispatchRow[]>(
    () =>
      pours
        .filter((pour) => !dispatchByPourId.has(pour.id))
        .map((pour) => ({
          id: pour.id,
          batchId: pour.pourBarId,
          site: pour.site.name,
          pourDate: pour.pourDate,
          grossWeight: pour.grossWeight,
          valueUsd: pour.valueUsd ?? 0,
        })),
    [dispatchByPourId, pours],
  );

  const missingSaleRows = useMemo<MissingSaleRow[]>(
    () =>
      dispatches
        .filter((dispatch) => !soldPourIds.has(dispatch.goldPourId))
        .map((dispatch) => ({
          id: dispatch.id,
          batchId: dispatch.goldPour.pourBarId,
          courier: dispatch.courier,
          destination: dispatch.destination,
          dispatchDate: dispatch.dispatchDate,
        })),
    [dispatches, soldPourIds],
  );

  const correctionRows = useMemo<CorrectionRow[]>(
    () =>
      corrections.map((correction) => ({
        id: correction.id,
        createdAt: correction.createdAt,
        entityType: correction.entityType,
        reference: correction.pour.pourBarId,
        reason: correction.reason,
        createdBy: correction.createdBy.name,
      })),
    [corrections],
  );

  const exportDisabled =
    missingDispatchRows.length === 0 &&
    missingSaleRows.length === 0 &&
    correctionRows.length === 0;
  const canOpenDispatches = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(
        goldRoutes.transit.dispatches,
        enabledFeatures,
      ),
    [enabledFeatures],
  );
  const canOpenSales = useMemo(
    () =>
      canViewHrefWithEnabledFeatures(
        goldRoutes.settlement.receipts,
        enabledFeatures,
      ),
    [enabledFeatures],
  );

  const missingDispatchColumns = useMemo<ColumnDef<MissingDispatchRow>[]>(
    () => [
      {
        id: "pourDate",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.pourDate).toLocaleString()}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "batchId",
        header: "Batch ID",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">
            {row.original.batchId}
          </span>
        ),
        size: 112,
        minSize: 112,
        maxSize: 112,
      },
      {
        id: "site",
        header: "Site",
        accessorKey: "site",
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "grossWeight",
        header: "Gross Weight",
        cell: ({ row }) => (
          <NumericCell>{row.original.grossWeight.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "valueUsd",
        header: "Value",
        cell: ({ row }) => (
          <NumericCell>${row.original.valueUsd.toFixed(2)}</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
    ],
    [],
  );

  const missingSaleColumns = useMemo<ColumnDef<MissingSaleRow>[]>(
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
        maxSize: 128,
      },
      {
        id: "batchId",
        header: "Batch",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">
            {row.original.batchId}
          </span>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420,
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
        cell: () => <StatusChip status="pending" label="Awaiting sale" />,
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
    ],
    [],
  );

  const correctionColumns = useMemo<ColumnDef<CorrectionRow>[]>(
    () => [
      {
        id: "createdAt",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.createdAt).toLocaleString()}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "entityType",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="neutral">{row.original.entityType}</Badge>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "reference",
        header: "Reference",
        accessorKey: "reference",
        size: 112,
        minSize: 112,
        maxSize: 112,
      },
      {
        id: "reason",
        header: "Reason",
        accessorKey: "reason",
        size: 260,
        minSize: 200,
        maxSize: 360,
      },
      {
        id: "createdBy",
        header: "By",
        accessorKey: "createdBy",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
    ],
    [],
  );

  return (
    <GoldShell
      activeTab="issues"
      title="Issues"
      description="Fix missing records and review corrections"
      actions={
        <div className="flex flex-wrap gap-2">
          <ExportMenu
            variant="outline"
            size="sm"
            label="Export Issues"
            className="[&_svg]:mr-0"
            onExport={(format: DocumentExportFormat) => {
              if (!exceptionPdfRef.current) return;
              return exportElementToDocument(
                exceptionPdfRef.current,
                `gold-exceptions-${new Date().toISOString().slice(0, 10)}.${format}`,
                format,
              );
            }}
            disabled={exportDisabled}
          />
          {canOpenDispatches ? (
            <Button asChild variant="outline" size="sm">
              <Link href={goldRoutes.transit.dispatches}>View Dispatches</Link>
            </Button>
          ) : null}
          {canOpenSales ? (
            <Button asChild variant="outline" size="sm">
              <Link href={goldRoutes.settlement.receipts}>View Sales</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      {correctionsError || receiptsError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load issues</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(correctionsError || receiptsError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          {
            id: "missing-dispatch",
            label: "Missing Dispatch",
            count: missingDispatchRows.length,
          },
          {
            id: "missing-sale",
            label: "Missing Sale",
            count: missingSaleRows.length,
          },
          {
            id: "corrections",
            label: "Corrections",
            count: correctionRows.length,
          },
        ]}
        value={activeView}
        onValueChange={(value) =>
          setActiveView(
            value as "missing-dispatch" | "missing-sale" | "corrections",
          )
        }
        railLabel="Issue Views"
      >
        <div
          className={activeView === "missing-dispatch" ? "space-y-3" : "hidden"}
        >
          <header className="space-y-1">
            <h2 className="text-section-title text-foreground font-bold tracking-tight">
              Batches Missing Dispatch
            </h2>
          </header>
          <DataTable
            data={missingDispatchRows}
            columns={missingDispatchColumns}
            searchPlaceholder="Search by batch ID or site"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            emptyState="No batches missing dispatch."
          />
        </div>

        <div className={activeView === "missing-sale" ? "space-y-3" : "hidden"}>
          <header className="space-y-1">
            <h2 className="text-section-title text-foreground font-bold tracking-tight">
              Dispatches Missing Sale
            </h2>
            <p className="text-sm text-muted-foreground">
              Dispatches without buyer sale records.
            </p>
          </header>
          <DataTable
            data={missingSaleRows}
            columns={missingSaleColumns}
            searchPlaceholder="Search by batch, courier, or destination"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            emptyState={
              receiptsLoading
                ? "Loading missing-sale records..."
                : "No dispatches missing sales."
            }
          />
        </div>

        <div className={activeView === "corrections" ? "space-y-3" : "hidden"}>
          <header className="space-y-1">
            <h2 className="text-section-title text-foreground font-bold tracking-tight">
              Correction Log
            </h2>
            <p className="text-sm text-muted-foreground">
              Append-only correction notes for audit traceability.
            </p>
          </header>
          <DataTable
            data={correctionRows}
            columns={correctionColumns}
            searchPlaceholder="Search by type, reference, or reason"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            emptyState={
              correctionsLoading
                ? "Loading corrections..."
                : "No correction notes."
            }
          />
        </div>
      </VerticalDataViews>

      <div className="absolute left-[-9999px] top-0">
        <div ref={exceptionPdfRef}>
          <PdfTemplate
            title="Gold Issues Snapshot"
            subtitle="Missing records and correction notes"
            meta={[
              {
                label: "Batches missing dispatch",
                value: String(missingDispatchRows.length),
              },
              {
                label: "Dispatches missing sale",
                value: String(missingSaleRows.length),
              },
              { label: "Corrections", value: String(correctionRows.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Type</th>
                  <th className="py-2">Reference</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {missingDispatchRows.map((row) => (
                  <tr
                    key={`u-p-${row.id}`}
                    className="border-b border-gray-100"
                  >
                    <td className="py-2">Missing Dispatch</td>
                    <td className="py-2">{row.batchId}</td>
                    <td className="py-2">
                      {row.site} | {new Date(row.pourDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {missingSaleRows.map((row) => (
                  <tr
                    key={`u-d-${row.id}`}
                    className="border-b border-gray-100"
                  >
                    <td className="py-2">Missing Sale</td>
                    <td className="py-2">{row.batchId}</td>
                    <td className="py-2">
                      {row.courier} |{" "}
                      {new Date(row.dispatchDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {correctionRows.map((row) => (
                  <tr key={`c-${row.id}`} className="border-b border-gray-100">
                    <td className="py-2">Correction ({row.entityType})</td>
                    <td className="py-2">{row.reference}</td>
                    <td className="py-2">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </GoldShell>
  );
}
