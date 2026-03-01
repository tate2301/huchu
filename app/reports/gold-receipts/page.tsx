"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchGoldReceipts, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

type GoldReceiptReportRow = {
  id: string;
  receiptDate: string;
  receiptNumber: string;
  pourBarId: string;
  site: string;
  grossWeight: number;
  expenseGold: number;
  workerSplit: number;
  companySplit: number;
  companyTotal: number;
  shiftLeader: string;
  recordedBy: string;
  recordedAt?: string | null;
  dispatchDate?: string | null;
  courier: string;
  paidAmount: number;
  paidValueUsd: number;
  paymentMethod: string;
  paymentChannel: string;
  paymentReference: string;
  assayResult?: number | null;
};

export default function GoldReceiptsReportPage() {
  const [siteId, setSiteId] = useState("all");
  const activeSiteId = siteId === "all" ? undefined : siteId;

  const { data: sites, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-receipts", "reports", activeSiteId ?? "all"],
    queryFn: () => fetchGoldReceipts({ siteId: activeSiteId, limit: 500 }),
  });

  const rows = useMemo<GoldReceiptReportRow[]>(
    () =>
      (data?.data ?? []).map((row) => {
        const batch = row.goldPour;
        return {
          id: row.id,
          receiptDate: row.receiptDate,
          receiptNumber: row.receiptNumber,
          pourBarId: batch.pourBarId,
          site: batch.site.name,
          grossWeight: batch.grossWeight,
          expenseGold: batch.expenseWeightTotal ?? 0,
          workerSplit: batch.workerSplitWeight ?? 0,
          companySplit: batch.companySplitWeight ?? 0,
          companyTotal:
            batch.companyTotalWeight ??
            (batch.companySplitWeight ?? 0) + (batch.expenseWeightTotal ?? 0),
          shiftLeader: batch.shiftLeaderName ?? "-",
          recordedBy: batch.createdBy?.name ?? "-",
          recordedAt: batch.createdAt ?? null,
          dispatchDate: row.goldDispatch?.dispatchDate ?? null,
          courier: row.goldDispatch?.courier ?? "-",
          paidAmount: row.paidAmount,
          paidValueUsd: row.paidValueUsd ?? row.paidAmount,
          paymentMethod: row.paymentMethod,
          paymentChannel: row.paymentChannel ?? "-",
          paymentReference: row.paymentReference ?? "-",
          assayResult: row.assayResult ?? null,
        };
      }),
    [data],
  );

  const totalPaid = useMemo(
    () => rows.reduce((sum, row) => sum + row.paidValueUsd, 0),
    [rows],
  );

  const columns = useMemo<ColumnDef<GoldReceiptReportRow>[]>(
    () => [
      {
        id: "receiptDate",
        header: "Receipt Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.receiptDate), "MMM d, yyyy")}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "receiptNumber",
        header: "Receipt No.",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">
            {row.original.receiptNumber}
          </span>
        ),
        size: 112,
        minSize: 112,
        maxSize: 160,
      },
      {
        id: "pourBarId",
        header: "Batch ID",
        cell: ({ row }) => (
          <span className="font-mono">{row.original.pourBarId}</span>
        ),
        size: 112,
        minSize: 112,
        maxSize: 160,
      },
      {
        id: "site",
        header: "Site",
        accessorKey: "site",
        size: 220,
        minSize: 180,
        maxSize: 320,
      },
      {
        id: "grossWeight",
        header: "Gross Weight",
        cell: ({ row }) => (
          <NumericCell>{row.original.grossWeight.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 140,
      },
      {
        id: "expenseGold",
        header: "Expense Gold",
        cell: ({ row }) => (
          <NumericCell>{row.original.expenseGold.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 140,
      },
      {
        id: "workerSplit",
        header: "Worker Split",
        cell: ({ row }) => (
          <NumericCell>{row.original.workerSplit.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 140,
      },
      {
        id: "companySplit",
        header: "Company Split",
        cell: ({ row }) => (
          <NumericCell>{row.original.companySplit.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 140,
      },
      {
        id: "companyTotal",
        header: "Company Total",
        cell: ({ row }) => (
          <NumericCell>{row.original.companyTotal.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 140,
      },
      {
        id: "shiftLeader",
        header: "Shift Leader",
        accessorKey: "shiftLeader",
        size: 180,
        minSize: 160,
        maxSize: 240,
      },
      {
        id: "recordedBy",
        header: "Recorded By",
        accessorKey: "recordedBy",
        size: 180,
        minSize: 160,
        maxSize: 240,
      },
      {
        id: "recordedAt",
        header: "Recorded At",
        cell: ({ row }) =>
          row.original.recordedAt ? (
            <NumericCell align="left">
              {format(new Date(row.original.recordedAt), "MMM d, yyyy HH:mm")}
            </NumericCell>
          ) : (
            "-"
          ),
        size: 148,
        minSize: 148,
        maxSize: 180,
      },
      {
        id: "dispatchDate",
        header: "Dispatch Date",
        cell: ({ row }) =>
          row.original.dispatchDate ? (
            <NumericCell align="left">
              {format(new Date(row.original.dispatchDate), "MMM d, yyyy")}
            </NumericCell>
          ) : (
            "-"
          ),
        size: 128,
        minSize: 128,
        maxSize: 160,
      },
      {
        id: "courier",
        header: "Courier",
        accessorKey: "courier",
        size: 160,
        minSize: 140,
        maxSize: 220,
      },
      {
        id: "paidValueUsd",
        header: "Paid (USD)",
        cell: ({ row }) => (
          <NumericCell>${row.original.paidValueUsd.toFixed(2)}</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 140,
      },
      {
        id: "paymentMethod",
        header: "Method",
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.paymentMethod}</Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 180,
      },
      {
        id: "paymentChannel",
        header: "Channel",
        accessorKey: "paymentChannel",
        size: 140,
        minSize: 140,
        maxSize: 220,
      },
      {
        id: "paymentReference",
        header: "Reference",
        accessorKey: "paymentReference",
        size: 160,
        minSize: 160,
        maxSize: 240,
      },
      {
        id: "assayResult",
        header: "Assay %",
        cell: ({ row }) =>
          row.original.assayResult !== null &&
          row.original.assayResult !== undefined
            ? `${row.original.assayResult.toFixed(2)}%`
            : "-",
        size: 100,
        minSize: 100,
        maxSize: 120,
      },
    ],
    [],
  );

  const pageError = sitesError || error;

  return (
    <div className="w-full space-y-6">
      <PageHeading
        title="Gold Receipts"
        description="Buyer receipt confirmations and settlement details"
      />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load gold receipts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Receipt Records
          </h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} receipts, total paid ${totalPaid.toFixed(2)}
          </p>
        </header>
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search by receipt no, batch ID, site, method, or reference"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          toolbar={
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger size="sm" className="h-8 w-[180px]">
                <SelectValue placeholder="Filter by site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {sites?.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          emptyState={
            isLoading
              ? "Loading receipt records..."
              : "No receipt records found."
          }
        />
      </section>
    </div>
  );
}
