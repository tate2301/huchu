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
import {
  fetchGoldCorrections,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
  fetchSites,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

type GoldChainReportRow = {
  id: string;
  pourDate: string;
  pourBarId: string;
  site: string;
  sourceType: string;
  grossWeight: number;
  expenseGold: number;
  workerSplit: number;
  companySplit: number;
  companyTotal: number;
  expenseBreakdown: string;
  shiftLeader: string;
  recordedBy: string;
  recordedAt: string;
  valueUsd: number;
  dispatchDate?: string;
  receiptDate?: string;
  status: "Poured" | "Dispatched" | "Receipted";
};

export default function GoldChainReportPage() {
  const [siteId, setSiteId] = useState("all");
  const activeSiteId = siteId === "all" ? undefined : siteId;

  const { data: sites, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const {
    data: poursData,
    error: poursError,
    isLoading: poursLoading,
  } = useQuery({
    queryKey: ["gold-pours", "report-chain", activeSiteId ?? "all"],
    queryFn: () => fetchGoldPours({ siteId: activeSiteId, limit: 500 }),
  });
  const {
    data: dispatchesData,
    error: dispatchesError,
    isLoading: dispatchesLoading,
  } = useQuery({
    queryKey: ["gold-dispatches", "report-chain", activeSiteId ?? "all"],
    queryFn: () => fetchGoldDispatches({ siteId: activeSiteId, limit: 500 }),
  });
  const {
    data: receiptsData,
    error: receiptsError,
    isLoading: receiptsLoading,
  } = useQuery({
    queryKey: ["gold-receipts", "report-chain", activeSiteId ?? "all"],
    queryFn: () => fetchGoldReceipts({ siteId: activeSiteId, limit: 500 }),
  });
  const { data: correctionsData, error: correctionsError } = useQuery({
    queryKey: ["gold-corrections", "report-chain", activeSiteId ?? "all"],
    queryFn: () => fetchGoldCorrections({ siteId: activeSiteId, limit: 500 }),
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

  const dispatchByPour = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((row) => map.set(row.goldPourId, row));
    return map;
  }, [dispatches]);

  const receiptByPour = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((row) => {
      if (row.goldPour.id) map.set(row.goldPour.id, row);
    });
    return map;
  }, [receipts]);

  const rows = useMemo<GoldChainReportRow[]>(
    () =>
      pours
        .map((pour) => {
          const dispatch = dispatchByPour.get(pour.id);
          const receipt = receiptByPour.get(pour.id);
          const status: GoldChainReportRow["status"] = receipt
            ? "Receipted"
            : dispatch
              ? "Dispatched"
              : "Poured";
          return {
            id: pour.id,
            pourDate: pour.pourDate,
            pourBarId: pour.pourBarId,
            site: pour.site.name,
            sourceType:
              pour.sourceType === "PURCHASE_PUBLIC" ? "Purchase" : "Production",
            grossWeight: pour.grossWeight,
            expenseGold: pour.expenseWeightTotal ?? 0,
            workerSplit: pour.workerSplitWeight ?? 0,
            companySplit: pour.companySplitWeight ?? 0,
            companyTotal:
              pour.companyTotalWeight ??
              (pour.companySplitWeight ?? 0) + (pour.expenseWeightTotal ?? 0),
            expenseBreakdown: pour.expenseBreakdown?.trim() || "-",
            shiftLeader: pour.shiftLeaderName ?? "-",
            recordedBy: pour.createdBy?.name ?? "-",
            recordedAt: pour.createdAt,
            valueUsd:
              pour.valueUsd ??
              receipt?.paidValueUsd ??
              dispatch?.valueUsd ??
              dispatch?.goldPour.valueUsd ??
              0,
            dispatchDate: dispatch?.dispatchDate,
            receiptDate: receipt?.receiptDate,
            status,
          };
        })
        .sort((a, b) => b.pourDate.localeCompare(a.pourDate)),
    [dispatchByPour, pours, receiptByPour],
  );

  const columns = useMemo<ColumnDef<GoldChainReportRow>[]>(
    () => [
      {
        id: "pourDate",
        header: "Pour Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.pourDate), "MMM d, yyyy")}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "pourBarId",
        header: "Bar ID",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">
            {row.original.pourBarId}
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
        id: "sourceType",
        header: "Source",
        accessorKey: "sourceType",
        size: 100,
        minSize: 100,
        maxSize: 120,
      },
      {
        id: "grossWeight",
        header: "Gross Weight (Recorded)",
        cell: ({ row }) => (
          <NumericCell>{row.original.grossWeight.toFixed(2)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "expenseGold",
        header: "Expense Gold",
        cell: ({ row }) => (
          <NumericCell>{row.original.expenseGold.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "workerSplit",
        header: "Worker Split",
        cell: ({ row }) => (
          <NumericCell>{row.original.workerSplit.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "companySplit",
        header: "Company Split",
        cell: ({ row }) => (
          <NumericCell>{row.original.companySplit.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "companyTotal",
        header: "Company Total",
        cell: ({ row }) => (
          <NumericCell>{row.original.companyTotal.toFixed(3)} g</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
      {
        id: "expenseBreakdown",
        header: "Expense Breakdown",
        accessorKey: "expenseBreakdown",
        size: 220,
        minSize: 200,
        maxSize: 320,
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
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.recordedAt), "MMM d, yyyy HH:mm")}
          </NumericCell>
        ),
        size: 148,
        minSize: 148,
        maxSize: 180,
      },
      {
        id: "valueUsd",
        header: "Value (USD)",
        cell: ({ row }) => (
          <NumericCell>${row.original.valueUsd.toFixed(2)}</NumericCell>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
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
        maxSize: 128,
      },
      {
        id: "receiptDate",
        header: "Receipt Date",
        cell: ({ row }) =>
          row.original.receiptDate ? (
            <NumericCell align="left">
              {format(new Date(row.original.receiptDate), "MMM d, yyyy")}
            </NumericCell>
          ) : (
            "-"
          ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "Receipted"
                ? "default"
                : row.original.status === "Dispatched"
                  ? "secondary"
                  : "outline"
            }
          >
            {row.original.status}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120,
      },
    ],
    [],
  );

  const pageError =
    sitesError ||
    poursError ||
    dispatchesError ||
    receiptsError ||
    correctionsError;
  const isLoading = poursLoading || dispatchesLoading || receiptsLoading;

  return (
    <div className="w-full space-y-6">
      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load gold records</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Chain Records
          </h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} chain entries, {corrections.length} corrections logged
          </p>
        </header>
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search by bar ID, site, source, shift leader, recorder, or status"
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
            isLoading ? "Loading chain records..." : "No gold records found."
          }
        />
      </section>
    </div>
  );
}
