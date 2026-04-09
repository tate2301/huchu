"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
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
};

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

type SnapshotCard = {
  label: string;
  value: string;
};

export default function ScrapMetalPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canManage = hasRole(role, ["SUPERADMIN", "MANAGER"]);

  const query = useQuery({
    queryKey: ["scrap-home-daily-snapshot"],
    queryFn: () => fetchJson<DashboardPayload>("/api/scrap-metal/dashboard"),
  });

  if (query.error) {
    return (
      <ScrapShell title="Daily Snapshot">
        <StatusState variant="error" title="Unable to load snapshot" description={getApiErrorMessage(query.error)} />
      </ScrapShell>
    );
  }

  const summary = query.data?.summary;
  const heldTotal = (summary?.heldInboundTicketsCount ?? 0) + (summary?.heldOutboundTicketsCount ?? 0);

  const cards: SnapshotCard[] = [
    { label: "Weight In", value: formatKg(summary?.purchasesThisMonthWeight ?? 0) },
    { label: "Spend", value: formatMoney(summary?.purchasesThisMonthValue ?? 0) },
    { label: "Avg Buy / kg", value: formatMoney(summary?.averageBuyPricePerKg ?? 0) },
    { label: "Weight Out", value: formatKg(summary?.salesThisMonthWeight ?? 0) },
    { label: "Revenue", value: formatMoney(summary?.salesThisMonthValue ?? 0) },
    { label: "Est. Margin", value: formatMoney(summary?.estimatedMarginThisMonth ?? 0) },
    { label: "Margin / kg", value: formatMoney(summary?.marginPerKg ?? 0) },
    { label: "Margin %", value: `${(summary?.marginPercent ?? 0).toFixed(2)}%` },
    { label: "Pending Sales", value: String(summary?.pendingSalesCount ?? 0) },
    { label: "Completed Sales", value: String(summary?.completedSalesCount ?? 0) },
    { label: "Tickets / Hour", value: (summary?.ticketsProcessedPerHour ?? 0).toFixed(2) },
    { label: "Pending Supplier Payments", value: String(summary?.pendingSupplierPaymentsCount ?? 0) },
    { label: "Held Tickets", value: `${heldTotal} (${(summary?.heldTicketsOldestAgeHours ?? 0).toFixed(1)}h oldest)` },
  ];

  return (
    <ScrapShell
      title="Daily Snapshot"
      description="Operator-first view of throughput, cash exposure, and held ticket pressure."
      actions={
        <div className="grid w-full gap-2 sm:flex sm:flex-wrap">
          <Button className="w-full sm:w-auto" asChild>
            <Link href="/scrap-metal/tickets">New Inbound Ticket</Link>
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" asChild>
            <Link href="/scrap-metal/tickets/held">Held Tickets ({heldTotal})</Link>
          </Button>
          {canManage ? (
            <Button className="w-full sm:w-auto" variant="outline" asChild>
              <Link href="/scrap-metal/sales">Outbound Queue</Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button className="w-full sm:w-auto" variant="outline" asChild>
              <Link href="/scrap-metal/reports/daily-snapshot">Open Full Report</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      {query.isLoading ? (
        <StatusState variant="loading" title="Loading daily snapshot..." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">{card.label}</CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-lg">{card.value}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </ScrapShell>
  );
}
