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
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchJson } from "@/lib/api-client";
import { Calendar, Coins, ReceiptLong, Scale, Wallet } from "@/lib/icons";

type Purchase = {
  supplier: string;
  tickets: number;
  repeatMonths: number;
  weightKg: number;
  spend: number;
  avgBuyPricePerKg: number;
  estimatedMarginContribution: number;
  currency: string;
};

type SupplierRow = {
  supplier: string;
  tickets: number;
  repeatMonths: number;
  weightKg: number;
  spend: number;
  avgBuyPricePerKg: number;
  estimatedMarginContribution: number;
  currency: string;
};

type SnapshotWindowMode = "day" | "week" | "month" | "all";

export default function SupplierPerformancePage() {
  const [windowMode, setWindowMode] = useState<SnapshotWindowMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const purchasesQuery = useQuery({
    queryKey: ["scrap-supplier-performance", windowMode, anchorDate],
    queryFn: () =>
      fetchJson<{ supplierPerformance: Purchase[] }>(
        `/api/scrap-metal/dashboard?window=${encodeURIComponent(windowMode)}&anchorDate=${encodeURIComponent(anchorDate)}`,
      ),
  });

  const rows = useMemo<SupplierRow[]>(() => {
    const source = purchasesQuery.data?.supplierPerformance ?? [];
    return source.map((item) => ({
      supplier: item.supplier,
      tickets: item.tickets,
      repeatMonths: item.repeatMonths,
      weightKg: item.weightKg,
      spend: item.spend,
      avgBuyPricePerKg: item.avgBuyPricePerKg,
      estimatedMarginContribution: item.estimatedMarginContribution,
      currency: item.currency || "USD",
    }));
  }, [purchasesQuery.data?.supplierPerformance]);

  const columns = useMemo<ColumnDef<SupplierRow>[]>(() => [
    { id: "supplier", header: "Supplier", accessorKey: "supplier" },
    { id: "tickets", header: "Tickets", cell: ({ row }) => <NumericCell>{row.original.tickets}</NumericCell> },
    { id: "repeat", header: "Repeat Months", cell: ({ row }) => <NumericCell>{row.original.repeatMonths}</NumericCell> },
    { id: "weight", header: "Weight (kg)", cell: ({ row }) => <NumericCell>{row.original.weightKg.toFixed(2)}</NumericCell> },
    { id: "spend", header: "Spend", cell: ({ row }) => <NumericCell>{row.original.currency} {row.original.spend.toFixed(2)}</NumericCell> },
    { id: "avg", header: "Avg Buy / kg", cell: ({ row }) => <NumericCell>{row.original.currency} {row.original.avgBuyPricePerKg.toFixed(2)}</NumericCell> },
    {
      id: "margin",
      header: "Est. Margin Contribution",
      cell: ({ row }) => (
        <NumericCell>{row.original.currency} {row.original.estimatedMarginContribution.toFixed(2)}</NumericCell>
      ),
    },
  ], []);

  if (purchasesQuery.error) {
    return (
      <ScrapShell title="Supplier Performance">
        <StatusState variant="error" title="Unable to load supplier performance" />
      </ScrapShell>
    );
  }

  return (
    <ScrapShell
      title="Supplier Performance"
     
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/reports">Open Full Reports</Link>
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] p-3">
        <div className="min-w-[180px] space-y-1">
          <div className="text-xs text-muted-foreground">Window</div>
          <Select value={windowMode} onValueChange={(value) => setWindowMode(value as SnapshotWindowMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px] space-y-1">
          <div className="text-xs text-muted-foreground">Anchor Date</div>
          <Input type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
        </div>
      </div>
      <DataTable
        data={rows}
        columns={columns}
        pagination={{ enabled: true }}
        searchPlaceholder="Search suppliers"
        emptyState={purchasesQuery.isLoading ? "Loading supplier performance..." : "No supplier activity yet."}
        mobileCardRenderer={({ row }) => (
          <ScrapMobileCard>
            <ScrapMobileCardHeader title={row.supplier} />
            <ScrapMobileMetricStrip
              items={[
                { icon: ReceiptLong, value: row.tickets, srLabel: "Tickets" },
                { icon: Calendar, value: row.repeatMonths, srLabel: "Repeat months" },
                { icon: Scale, value: `${row.weightKg.toFixed(2)} kg`, srLabel: "Weight" },
                { icon: Wallet, value: `${row.currency} ${row.spend.toFixed(2)}`, srLabel: "Spend" },
                { icon: Coins, value: `${row.currency} ${row.avgBuyPricePerKg.toFixed(2)}`, srLabel: "Average buy price per kilogram" },
                { icon: Wallet, value: `${row.currency} ${row.estimatedMarginContribution.toFixed(2)}`, srLabel: "Margin" },
              ]}
            />
          </ScrapMobileCard>
        )}
      />
    </ScrapShell>
  );
}
