"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { AdminCategoryBarChart, AdminTrendChart, type AdminChartSeries } from "@/components/charts/admin-headless-charts";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/api-client";
import { hasRole } from "@/lib/roles";

type DashboardPayload = {
  summary: {
    purchasesThisMonthWeight: number;
    purchasesThisMonthValue: number;
    salesThisMonthWeight: number;
    salesThisMonthValue: number;
    estimatedMarginThisMonth: number;
    pendingSalesCount: number;
    completedSalesCount: number;
    averageBuyPricePerKg: number;
    ticketsProcessedPerHour: number;
    pendingSupplierPaymentsCount: number;
    heldInboundTicketsCount: number;
    heldOutboundTicketsCount: number;
    heldTicketsOldestAgeHours: number;
    marginPerKg: number;
    marginPercent: number;
  };
  reconciliation: {
    varianceByWeek: Array<{
      weekLabel: string;
      varianceKg: number;
      saleCount: number;
    }>;
  };
  supplierPerformance: Array<{
    supplier: string;
    weightKg: number;
    estimatedMarginContribution: number;
  }>;
};

const VARIANCE_SERIES: AdminChartSeries[] = [
  { key: "varianceKg", label: "Variance (kg)", kind: "bar", color: "var(--warning-500)" },
  { key: "saleCount", label: "Sales", kind: "line", color: "var(--primary-500)" },
];

function formatMoney(value: number) {
  return `USD ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatKg(value: number) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kg`;
}

export default function ScrapMetalPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canManage = hasRole(role, ["SUPERADMIN", "MANAGER"]);

  const query = useQuery({
    queryKey: ["scrap-home-daily-snapshot"],
    queryFn: () => fetchJson<DashboardPayload>("/api/scrap-metal/dashboard"),
  });

  const summary = query.data?.summary;
  const heldTotal = (summary?.heldInboundTicketsCount ?? 0) + (summary?.heldOutboundTicketsCount ?? 0);
  const varianceRows = useMemo(
    () =>
      (query.data?.reconciliation.varianceByWeek ?? []).map((row) => ({
        label: row.weekLabel,
        varianceKg: row.varianceKg,
        saleCount: row.saleCount,
      })),
    [query.data?.reconciliation.varianceByWeek],
  );
  const supplierWeightRows = useMemo(
    () =>
      (query.data?.supplierPerformance ?? []).slice(0, 8).map((row) => ({
        id: row.supplier,
        label: row.supplier,
        value: row.weightKg,
      })),
    [query.data?.supplierPerformance],
  );

  if (query.error) {
    return (
      <ScrapShell title="Daily Snapshot">
        <StatusState variant="error" title="Unable to load snapshot" />
      </ScrapShell>
    );
  }

  return (
    <ScrapShell
      title="Daily Snapshot"
      actions={
        <div className="flex w-full flex-wrap gap-2">
          <Button asChild>
            <Link href="/scrap-metal/tickets">New Inbound Ticket</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/scrap-metal/tickets/held">Held ({heldTotal})</Link>
          </Button>
          {canManage ? (
            <Button variant="outline" asChild>
              <Link href="/scrap-metal/sales">Outbound Queue</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      {query.isLoading ? (
        <StatusState variant="loading" title="Loading" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Weight In</CardTitle></CardHeader><CardContent className="font-mono text-lg">{formatKg(summary?.purchasesThisMonthWeight ?? 0)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Spend</CardTitle></CardHeader><CardContent className="font-mono text-lg">{formatMoney(summary?.purchasesThisMonthValue ?? 0)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Weight Out</CardTitle></CardHeader><CardContent className="font-mono text-lg">{formatKg(summary?.salesThisMonthWeight ?? 0)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Revenue</CardTitle></CardHeader><CardContent className="font-mono text-lg">{formatMoney(summary?.salesThisMonthValue ?? 0)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Margin</CardTitle></CardHeader><CardContent className="font-mono text-lg">{formatMoney(summary?.estimatedMarginThisMonth ?? 0)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Margin %</CardTitle></CardHeader><CardContent className="font-mono text-lg">{(summary?.marginPercent ?? 0).toFixed(2)}%</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tickets / Hour</CardTitle></CardHeader><CardContent className="font-mono text-lg">{(summary?.ticketsProcessedPerHour ?? 0).toFixed(2)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pending Supplier Payments</CardTitle></CardHeader><CardContent className="font-mono text-lg">{summary?.pendingSupplierPaymentsCount ?? 0}</CardContent></Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Weekly Variance</CardTitle>
              </CardHeader>
              <CardContent>
                <AdminTrendChart
                  rows={varianceRows}
                  series={VARIANCE_SERIES}
                  height={260}
                  valueFormatter={(value) => value.toFixed(2)}
                  yTickFormatter={(value) => value.toFixed(0)}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Supplier Weight</CardTitle>
              </CardHeader>
              <CardContent>
                <AdminCategoryBarChart
                  rows={supplierWeightRows}
                  valueLabel="Weight"
                  height={260}
                  valueFormatter={(value) => `${value.toFixed(0)} kg`}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </ScrapShell>
  );
}
