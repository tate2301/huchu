"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AxisChart } from "@rtcamp/frappe-ui-react";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { GroupedLinkList, type HubLinkGroup } from "@/components/accounting/hubs/grouped-link-list";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { FrappeChartShell } from "@/components/charts/frappe-chart-shell";
import { InsightDonutCard } from "@/components/charts/insight-donut-card";
import { TradingViewChartCard } from "@/components/charts/tradingview-chart-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchPayablesHubSummary, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { buildAxisChartConfig } from "@/lib/charts/frappe-config-builders";
import { Plus } from "@/lib/icons";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "hsl(var(--chart-5))",
  RECEIVED: "hsl(var(--chart-4))",
  PAID: "hsl(var(--chart-2))",
  VOIDED: "hsl(var(--chart-1))",
};

export default function PayablesHomePage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [branchId, setBranchId] = useState("all");

  const { data: branches } = useQuery({
    queryKey: ["sites", "accounting-branches"],
    queryFn: fetchSites,
  });

  const {
    data: summary,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["accounting", "hubs", "payables", startDate, endDate, branchId],
    queryFn: () =>
      fetchPayablesHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  const chartData = useMemo(() => {
    const aging = (summary?.charts.aging ?? []).map((item) => ({
      bucket: item.bucket,
      amount: item.amount,
    }));
    const status = (summary?.charts.statusBreakdown ?? []).map((item) => ({
      status: item.status,
      count: item.count,
    }));
    const trend = (summary?.charts.paymentsTrend ?? []).map((item) => ({
      date: item.date,
      billed: item.billed,
      paid: item.paid,
    }));

    return { aging, status, trend };
  }, [summary]);

  const agingChartConfig = useMemo(
    () =>
      buildAxisChartConfig({
        data: chartData.aging,
        title: "AP Aging Heatmap",
        subtitle: "Frappe block view for liability bucket scanning.",
        xAxisKey: "bucket",
        xAxisType: "category",
        yAxisTitle: "Amount",
        series: [{ name: "amount", type: "bar" }],
      }),
    [chartData.aging],
  );

  const groups = useMemo<HubLinkGroup[]>(
    () => [
      {
        group: "Payables Operations",
        items: [
          {
            id: "vendors",
            label: "Vendors",
            description: "Supplier master and contact profiles.",
            href: "/accounting/purchases?view=vendors",
            tag: "Master",
          },
          {
            id: "bills",
            label: "Bills",
            description: "Receive and manage vendor bills.",
            href: "/accounting/purchases?view=bills",
            tag: "Transaction",
          },
          {
            id: "payments",
            label: "Payments",
            description: "Track outgoing supplier payments.",
            href: "/accounting/purchases?view=payments",
            tag: "Cash",
          },
          {
            id: "debits",
            label: "Debit Notes",
            description: "Record upward adjustments on payables.",
            href: "/accounting/purchases?view=debit-notes",
            tag: "Adjustment",
          },
          {
            id: "writeoffs",
            label: "Write-offs",
            description: "Post approved AP write-offs.",
            href: "/accounting/purchases?view=write-offs",
            tag: "Adjustment",
          },
        ],
      },
      {
        group: "Payables Reporting",
        items: [
          {
            id: "ap-aging",
            label: "AP Aging",
            description: "Outstanding liabilities by due bucket.",
            href: "/accounting/purchases?view=aging",
            tag: "Report",
          },
          {
            id: "statements",
            label: "Vendor Statements",
            description: "Vendor statement movement and balances.",
            href: "/accounting/purchases?view=statements",
            tag: "Report",
          },
        ],
      },
    ],
    [],
  );

  return (
    <AccountingShell
      activeTab="payables"
      title="Payables Home"
      description="Overall payables position, payment trend, and AP access points."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/accounting/purchases?action=new-vendor">
              <Plus className="mr-2 size-4" />
              New Vendor
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/purchases?action=new-bill">
              <Plus className="mr-2 size-4" />
              New Bill
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/purchases?action=new-payment">
              <Plus className="mr-2 size-4" />
              New Payment
            </Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payables summary</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {(branches ?? []).map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Branch filter is shown for planning consistency. Current accounting totals remain company-wide.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricTile
          title="Open AP"
          value={summary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(summary?.kpis.openBalance ?? 0)}
          detail="Outstanding payables"
        />
        <MetricTile
          title="Overdue AP"
          value={summary?.kpis.overdueBalance ?? 0}
          valueLabel={formatCurrency(summary?.kpis.overdueBalance ?? 0)}
          detail="Past due liabilities"
          negativeIsBetter
        />
        <MetricTile
          title="Bill Value"
          value={summary?.kpis.receivedBillValue ?? 0}
          valueLabel={formatCurrency(summary?.kpis.receivedBillValue ?? 0)}
          detail={`${(summary?.kpis.receivedBillCount ?? 0).toLocaleString()} received bills`}
        />
        <MetricTile
          title="Payments"
          value={summary?.kpis.paidAmount ?? 0}
          valueLabel={formatCurrency(summary?.kpis.paidAmount ?? 0)}
          detail="Supplier payments"
        />
        <MetricTile
          title="Debit Notes"
          value={summary?.kpis.debitNoteAmount ?? 0}
          valueLabel={formatCurrency(summary?.kpis.debitNoteAmount ?? 0)}
          detail="Issued debit notes"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FrappeChartShell className="rounded-xl">
          {isLoading ? null : <AxisChart config={agingChartConfig} />}
        </FrappeChartShell>
        <InsightDonutCard
          title="Bill Status Distribution"
          subtitle="Share of bill volume by lifecycle state."
          data={
            isLoading
              ? []
              : chartData.status.map((item) => ({
                  label: item.status,
                  value: item.count,
                  color: STATUS_COLORS[item.status] ?? "hsl(var(--chart-3))",
                }))
          }
          valueFormatter={(value) => value.toLocaleString()}
        />
      </div>
      <TradingViewChartCard
        title="Payables Settlement Momentum"
        subtitle="TradingView-style trend for billed versus paid value."
        data={isLoading ? [] : chartData.trend}
        xKey="date"
        xAxisType="time"
        series={[
          { key: "billed", label: "Billed", type: "area", color: "hsl(var(--chart-4))" },
          { key: "paid", label: "Paid", type: "line", color: "hsl(var(--chart-2))" },
        ]}
        valueFormatter={formatCurrency}
      />

      <GroupedLinkList groups={groups} />
    </AccountingShell>
  );
}
