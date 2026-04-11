"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { ScrapMobileCard, ScrapMobileCardHeader, ScrapMobileMetricStrip } from "@/components/scrap-metal/mobile-list-card";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson } from "@/lib/api-client";
import { Calendar, Package, ReceiptLong, Scale } from "@/lib/icons";

type Sale = {
  saleNumber: string;
  saleDate: string;
  createdAt: string;
  batch: { batchNumber: string };
  weightDiscrepancy: number;
  status: string;
};

type Batch = {
  batchNumber: string;
  collectionStartDate: string;
  collectionEndDate?: string | null;
  status: string;
};

const TODAY_EPOCH = new Date().getTime();

function downloadCsv(name: string, rows: Array<Record<string, string | number>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header] ?? "";
          return `"${String(value).replace(/"/g, "\"\"")}"`;
        })
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VarianceAgingPage() {
  const [activeView, setActiveView] = useState("variance");
  const salesQuery = useQuery({
    queryKey: ["scrap-variance-report"],
    queryFn: () => fetchJson<{ data: Sale[] }>("/api/scrap-metal/sales?limit=400"),
  });
  const batchesQuery = useQuery({
    queryKey: ["scrap-aging-report"],
    queryFn: () => fetchJson<{ data: Batch[] }>("/api/scrap-metal/batches?limit=400"),
  });

  const varianceColumns = useMemo<ColumnDef<Sale>[]>(() => [
    { id: "sale", header: "Outbound Ticket", accessorKey: "saleNumber" },
    { id: "lot", header: "Lot", cell: ({ row }) => row.original.batch.batchNumber },
    { id: "date", header: "Date", cell: ({ row }) => new Date(row.original.saleDate).toLocaleDateString() },
    {
      id: "variance",
      header: "Variance (kg)",
      cell: ({ row }) => <NumericCell className={row.original.weightDiscrepancy > 0 ? "text-destructive" : ""}>{row.original.weightDiscrepancy.toFixed(2)}</NumericCell>,
    },
    { id: "status", header: "Status", accessorKey: "status" },
  ], []);

  const agingRows = useMemo(() => {
    return (batchesQuery.data?.data ?? []).map((batch) => {
      const start = new Date(batch.collectionStartDate).getTime();
      const end = batch.collectionEndDate ? new Date(batch.collectionEndDate).getTime() : TODAY_EPOCH;
      const ageDays =
        Number.isFinite(start) && Number.isFinite(end)
          ? Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)))
          : 0;
      return { ...batch, ageDays };
    });
  }, [batchesQuery.data?.data]);

  const pendingApprovalRows = useMemo(() => {
    return (salesQuery.data?.data ?? [])
      .filter((sale) => sale.status === "PENDING_APPROVAL")
      .map((sale) => {
        const created = new Date(sale.createdAt).getTime();
        const ageDays = Number.isFinite(created)
          ? Math.max(0, Math.floor((TODAY_EPOCH - created) / (1000 * 60 * 60 * 24)))
          : 0;
        return { ...sale, ageDays };
      });
  }, [salesQuery.data?.data]);

  const agingColumns = useMemo<ColumnDef<(typeof agingRows)[number]>[]>(() => [
    { id: "lot", header: "Lot", accessorKey: "batchNumber" },
    { id: "status", header: "Status", accessorKey: "status" },
    { id: "start", header: "Opened", cell: ({ row }) => new Date(row.original.collectionStartDate).toLocaleDateString() },
    { id: "age", header: "Age (days)", cell: ({ row }) => <NumericCell>{row.original.ageDays}</NumericCell> },
  ], []);

  const pendingApprovalColumns = useMemo<ColumnDef<(typeof pendingApprovalRows)[number]>[]>(() => [
    { id: "ticket", header: "Outbound Ticket", accessorKey: "saleNumber" },
    { id: "lot", header: "Lot", cell: ({ row }) => row.original.batch.batchNumber },
    { id: "date", header: "Requested", cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString() },
    { id: "age", header: "Age (days)", cell: ({ row }) => <NumericCell>{row.original.ageDays}</NumericCell> },
  ], []);

  if (salesQuery.error || batchesQuery.error) {
    return (
      <ScrapShell title="Variance & Aging">
        <StatusState variant="error" title="Unable to load variance and aging" />
      </ScrapShell>
    );
  }

  const views = [
    { id: "variance", label: "Variance", count: salesQuery.data?.data?.length ?? 0 },
    { id: "aging", label: "Lot Aging", count: agingRows.length },
    { id: "approval-aging", label: "Approval Aging", count: pendingApprovalRows.length },
  ];

  return (
    <ScrapShell
      title="Variance & Aging"
     
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv(
                "scrap-variance",
                (salesQuery.data?.data ?? []).map((row) => ({
                  saleNumber: row.saleNumber,
                  batchNumber: row.batch.batchNumber,
                  saleDate: row.saleDate,
                  varianceKg: row.weightDiscrepancy,
                  status: row.status,
                })),
              )
            }
            disabled={!salesQuery.data?.data?.length}
          >
            Export Variance CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv(
                "scrap-aging",
                agingRows.map((row) => ({
                  batchNumber: row.batchNumber,
                  status: row.status,
                  opened: row.collectionStartDate,
                  ageDays: row.ageDays,
                })),
              )
            }
            disabled={!agingRows.length}
          >
            Export Aging CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv(
                "scrap-approval-aging",
                pendingApprovalRows.map((row) => ({
                  saleNumber: row.saleNumber,
                  batchNumber: row.batch.batchNumber,
                  requestedAt: row.createdAt,
                  ageDays: row.ageDays,
                })),
              )
            }
            disabled={!pendingApprovalRows.length}
          >
            Export Approval Aging CSV
          </Button>
          <Button asChild size="sm" variant="outline"><Link href="/scrap-metal/reports">Open Full Reports</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/scrap-metal/batches">Open Lots</Link></Button>
        </div>
      }
    >
      <VerticalDataViews items={views} value={activeView} onValueChange={setActiveView} railLabel="Report View">
        {activeView === "variance" ? (
          <DataTable
            data={salesQuery.data?.data ?? []}
            columns={varianceColumns}
            searchPlaceholder="Search variance by ticket or lot"
            pagination={{ enabled: true }}
            emptyState={salesQuery.isLoading ? "Loading variance..." : "No variance records found."}
            mobileCardRenderer={({ row }) => (
              <ScrapMobileCard>
                <ScrapMobileCardHeader title={row.saleNumber} subtitle={row.batch.batchNumber} />
                <ScrapMobileMetricStrip
                  items={[
                    { icon: Scale, value: `${row.weightDiscrepancy.toFixed(2)} kg`, srLabel: "Variance" },
                    { icon: Calendar, value: new Date(row.saleDate).toLocaleDateString(), srLabel: "Sale date" },
                    { icon: ReceiptLong, value: row.status, srLabel: "Status" },
                  ]}
                />
              </ScrapMobileCard>
            )}
          />
        ) : (
          activeView === "aging" ? (
          <DataTable
            data={agingRows}
            columns={agingColumns}
            searchPlaceholder="Search lot aging"
            pagination={{ enabled: true }}
            emptyState={batchesQuery.isLoading ? "Loading aging..." : "No lots found."}
            mobileCardRenderer={({ row }) => (
              <ScrapMobileCard>
                <ScrapMobileCardHeader title={row.batchNumber} />
                <ScrapMobileMetricStrip
                  items={[
                    { icon: Package, value: row.status, srLabel: "Lot status" },
                    { icon: ReceiptLong, value: `${row.ageDays}d`, srLabel: "Age in days" },
                    { icon: Calendar, value: new Date(row.collectionStartDate).toLocaleDateString(), srLabel: "Opened" },
                  ]}
                />
              </ScrapMobileCard>
            )}
          />
          ) : (
            <DataTable
              data={pendingApprovalRows}
              columns={pendingApprovalColumns}
              searchPlaceholder="Search pending approvals"
              pagination={{ enabled: true }}
              emptyState={salesQuery.isLoading ? "Loading approval aging..." : "No pending approvals."}
              mobileCardRenderer={({ row }) => (
                <ScrapMobileCard>
                  <ScrapMobileCardHeader title={row.saleNumber} subtitle={row.batch.batchNumber} />
                  <ScrapMobileMetricStrip
                    items={[
                      { icon: Calendar, value: new Date(row.createdAt).toLocaleDateString(), srLabel: "Requested date" },
                      { icon: ReceiptLong, value: `${row.ageDays}d`, srLabel: "Age in days" },
                    ]}
                  />
                </ScrapMobileCard>
              )}
            />
          )
        )}
      </VerticalDataViews>
    </ScrapShell>
  );
}
