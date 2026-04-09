"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type DashboardPayload = {
  summary: {
    purchasesThisMonthWeight: number;
    purchasesThisMonthValue: number;
    salesThisMonthWeight: number;
    salesThisMonthValue: number;
    estimatedMarginThisMonth: number;
    pendingSalesCount: number;
    collectingBatchCount: number;
    readyBatchCount: number;
    yardStockWeight: number;
    yardStockValue: number;
    amountOwedToCompany: number;
    amountCompanyOwes: number;
    averageBuyPricePerKg: number;
    ticketsProcessedToday: number;
    ticketsProcessedPerHour: number;
    pendingSupplierPaymentsCount: number;
    pendingSupplierPaymentsAmount: number;
    heldInboundTicketsCount: number;
    heldOutboundTicketsCount: number;
    heldTicketsOldestAgeHours: number;
    weightedAverageCostPerKg: number;
    grossMargin: number;
    marginPerKg: number;
    marginPercent: number;
    completedSalesCount: number;
    averagePendingApprovalAgeDays: number;
    maxPendingApprovalAgeDays: number;
    balanceEntryNet: number;
    balanceIntegrityDifference: number;
  };
};

function downloadCsv(name: string, rows: Array<Record<string, string | number>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header] ?? "";
          const text = String(value).replace(/"/g, "\"\"");
          return `"${text}"`;
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

export default function ScrapDailySnapshotPage() {
  const query = useQuery({
    queryKey: ["scrap-daily-snapshot"],
    queryFn: () => fetchJson<DashboardPayload>("/api/scrap-metal/dashboard"),
  });

  const summary = query.data?.summary;

  const exportRows = useMemo(
    () =>
      summary
        ? [
            { metric: "Weight In (month kg)", value: summary.purchasesThisMonthWeight },
            { metric: "Spend (month)", value: summary.purchasesThisMonthValue },
            { metric: "Weight Out (month kg)", value: summary.salesThisMonthWeight },
            { metric: "Revenue (month)", value: summary.salesThisMonthValue },
            { metric: "Estimated Margin (month)", value: summary.estimatedMarginThisMonth },
            { metric: "Gross Margin", value: summary.grossMargin },
            { metric: "Margin / kg", value: summary.marginPerKg },
            { metric: "Margin %", value: summary.marginPercent },
            { metric: "Avg Buy Price / kg", value: summary.averageBuyPricePerKg },
            { metric: "Weighted Avg Cost / kg", value: summary.weightedAverageCostPerKg },
            { metric: "Tickets Processed Today", value: summary.ticketsProcessedToday },
            { metric: "Tickets / Hour", value: summary.ticketsProcessedPerHour },
            { metric: "Pending Sales", value: summary.pendingSalesCount },
            { metric: "Completed Sales", value: summary.completedSalesCount },
            { metric: "Pending Approval Avg Age (days)", value: summary.averagePendingApprovalAgeDays },
            { metric: "Pending Approval Max Age (days)", value: summary.maxPendingApprovalAgeDays },
            { metric: "Pending Supplier Payments", value: summary.pendingSupplierPaymentsCount },
            { metric: "Pending Supplier Payments Amount", value: summary.pendingSupplierPaymentsAmount },
            { metric: "Held Inbound Tickets", value: summary.heldInboundTicketsCount },
            { metric: "Held Outbound Tickets", value: summary.heldOutboundTicketsCount },
            { metric: "Oldest Held Ticket (hours)", value: summary.heldTicketsOldestAgeHours },
            { metric: "Open Lots (collecting)", value: summary.collectingBatchCount },
            { metric: "Ready Lots", value: summary.readyBatchCount },
            { metric: "Yard Stock Weight", value: summary.yardStockWeight },
            { metric: "Yard Stock Value", value: summary.yardStockValue },
            { metric: "Amount Owed To Company", value: summary.amountOwedToCompany },
            { metric: "Amount Company Owes", value: summary.amountCompanyOwes },
            { metric: "Balance Entry Net", value: summary.balanceEntryNet },
            { metric: "Balance Integrity Difference", value: summary.balanceIntegrityDifference },
          ]
        : [],
    [summary],
  );

  if (query.error) {
    return (
      <ScrapShell title="Daily Snapshot">
        <StatusState variant="error" title="Unable to load daily snapshot" />
      </ScrapShell>
    );
  }

  return (
    <ScrapShell
      title="Daily Snapshot"
     
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadCsv("scrap-daily-snapshot", exportRows)} disabled={!summary}>
            Export CSV
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/reports">Open Full Reports</Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Weight In (kg)</CardTitle></CardHeader><CardContent className="font-mono text-xl">{summary?.purchasesThisMonthWeight.toFixed(2) ?? "0.00"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Spend</CardTitle></CardHeader><CardContent className="font-mono text-xl">USD {summary?.purchasesThisMonthValue.toFixed(2) ?? "0.00"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Avg Buy / kg</CardTitle></CardHeader><CardContent className="font-mono text-xl">USD {summary?.averageBuyPricePerKg.toFixed(2) ?? "0.00"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Weight Out (kg)</CardTitle></CardHeader><CardContent className="font-mono text-xl">{summary?.salesThisMonthWeight.toFixed(2) ?? "0.00"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Revenue</CardTitle></CardHeader><CardContent className="font-mono text-xl">USD {summary?.salesThisMonthValue.toFixed(2) ?? "0.00"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Est. Margin</CardTitle></CardHeader><CardContent className="font-mono text-xl">USD {summary?.estimatedMarginThisMonth.toFixed(2) ?? "0.00"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Margin / kg</CardTitle></CardHeader><CardContent className="font-mono text-xl">USD {summary?.marginPerKg.toFixed(2) ?? "0.00"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Margin %</CardTitle></CardHeader><CardContent className="font-mono text-xl">{summary?.marginPercent.toFixed(2) ?? "0.00"}%</CardContent></Card>
        <Card><CardHeader><CardTitle>Pending Sales</CardTitle></CardHeader><CardContent className="font-mono text-xl">{summary?.pendingSalesCount ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle>Completed Sales</CardTitle></CardHeader><CardContent className="font-mono text-xl">{summary?.completedSalesCount ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle>Tickets / Hour</CardTitle></CardHeader><CardContent className="font-mono text-xl">{summary?.ticketsProcessedPerHour.toFixed(2) ?? "0.00"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Pending Supplier Payments</CardTitle></CardHeader><CardContent className="font-mono text-xl">{summary?.pendingSupplierPaymentsCount ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle>Held Tickets (Oldest)</CardTitle></CardHeader><CardContent className="font-mono text-xl">{summary?.heldTicketsOldestAgeHours.toFixed(1) ?? "0.0"}h</CardContent></Card>
      </div>
    </ScrapShell>
  );
}
