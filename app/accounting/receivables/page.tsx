"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AxisChart } from "@rtcamp/frappe-ui-react";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { FrappeChartShell } from "@/components/charts/frappe-chart-shell";
import { GroupedLinkList, type HubLinkGroup } from "@/components/accounting/hubs/grouped-link-list";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
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
import { fetchReceivablesHubSummary, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { buildAxisChartConfig, buildTimeSeriesChartConfig } from "@/lib/charts/frappe-config-builders";
import { Plus } from "@/lib/icons";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReceivablesHomePage() {
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
    queryKey: ["accounting", "hubs", "receivables", startDate, endDate, branchId],
    queryFn: () =>
      fetchReceivablesHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  const chartConfigs = useMemo(() => {
    const agingData = (summary?.charts.aging ?? []).map((item) => ({
      bucket: item.bucket,
      amount: item.amount,
    }));
    const statusData = (summary?.charts.statusBreakdown ?? []).map((item) => ({
      status: item.status,
      count: item.count,
    }));
    const trendData = (summary?.charts.collectionsTrend ?? []).map((item) => ({
      date: item.date,
      invoiced: item.invoiced,
      collected: item.collected,
    }));

    return {
      aging: buildAxisChartConfig({
        data: agingData,
        title: "AR Aging Position",
        subtitle: "Outstanding receivables by aging bucket.",
        xAxisKey: "bucket",
        xAxisType: "category",
        yAxisTitle: "Amount",
        series: [{ name: "amount", type: "bar" }],
      }),
      status: buildAxisChartConfig({
        data: statusData,
        title: "Invoice Status Mix",
        subtitle: "Count of invoices by status.",
        xAxisKey: "status",
        xAxisType: "category",
        yAxisTitle: "Count",
        series: [{ name: "count", type: "bar" }],
      }),
      trend: buildTimeSeriesChartConfig({
        data: trendData,
        title: "Invoiced vs Collected",
        subtitle: "Daily invoicing compared to collections.",
        xAxisKey: "date",
        yAxisTitle: "Amount",
        series: [
          { name: "invoiced", type: "bar" },
          { name: "collected", type: "line", lineWidth: 2 },
        ],
      }),
    };
  }, [summary]);

  const groups = useMemo<HubLinkGroup[]>(
    () => [
      {
        group: "Receivables Operations",
        items: [
          {
            id: "customers",
            label: "Customers",
            description: "Customer master records and profiles.",
            href: "/accounting/sales?view=customers",
            tag: "Master",
          },
          {
            id: "invoices",
            label: "Invoices",
            description: "Issue and manage customer invoices.",
            href: "/accounting/sales?view=invoices",
            tag: "Transaction",
          },
          {
            id: "receipts",
            label: "Receipts",
            description: "Track incoming customer payments.",
            href: "/accounting/sales?view=receipts",
            tag: "Cash",
          },
          {
            id: "credits",
            label: "Credit Notes",
            description: "Adjust and reverse invoiced amounts.",
            href: "/accounting/sales?view=credit-notes",
            tag: "Adjustment",
          },
          {
            id: "writeoffs",
            label: "Write-offs",
            description: "Record bad debt and approved write-offs.",
            href: "/accounting/sales?view=write-offs",
            tag: "Adjustment",
          },
        ],
      },
      {
        group: "Receivables Reporting",
        items: [
          {
            id: "ar-aging",
            label: "AR Aging",
            description: "Outstanding balances by aging bucket.",
            href: "/accounting/sales?view=aging",
            tag: "Report",
          },
          {
            id: "statements",
            label: "Customer Statements",
            description: "Statement history and running balances.",
            href: "/accounting/sales?view=statements",
            tag: "Report",
          },
        ],
      },
    ],
    [],
  );

  return (
    <AccountingShell
      activeTab="receivables"
      title="Receivables Home"
      description="Overall receivables position, collections trend, and AR access points."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/accounting/sales?action=new-customer">
              <Plus className="mr-2 size-4" />
              New Customer
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/sales?action=new-invoice">
              <Plus className="mr-2 size-4" />
              New Invoice
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/sales?action=new-receipt">
              <Plus className="mr-2 size-4" />
              New Receipt
            </Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load receivables summary</AlertTitle>
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
          title="Open AR"
          value={summary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(summary?.kpis.openBalance ?? 0)}
          detail="Outstanding receivables"
        />
        <MetricTile
          title="Overdue AR"
          value={summary?.kpis.overdueBalance ?? 0}
          valueLabel={formatCurrency(summary?.kpis.overdueBalance ?? 0)}
          detail="Past due receivables"
          negativeIsBetter
        />
        <MetricTile
          title="Invoice Value"
          value={summary?.kpis.issuedInvoiceValue ?? 0}
          valueLabel={formatCurrency(summary?.kpis.issuedInvoiceValue ?? 0)}
          detail={`${(summary?.kpis.issuedInvoiceCount ?? 0).toLocaleString()} issued invoices`}
        />
        <MetricTile
          title="Collections"
          value={summary?.kpis.collectedAmount ?? 0}
          valueLabel={formatCurrency(summary?.kpis.collectedAmount ?? 0)}
          detail="Payments received"
        />
        <MetricTile
          title="Credit Notes"
          value={summary?.kpis.creditNoteAmount ?? 0}
          valueLabel={formatCurrency(summary?.kpis.creditNoteAmount ?? 0)}
          detail="Issued credit notes"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FrappeChartShell>{isLoading ? null : <AxisChart config={chartConfigs.aging} />}</FrappeChartShell>
        <FrappeChartShell>{isLoading ? null : <AxisChart config={chartConfigs.status} />}</FrappeChartShell>
      </div>
      <FrappeChartShell>{isLoading ? null : <AxisChart config={chartConfigs.trend} />}</FrappeChartShell>

      <GroupedLinkList groups={groups} />
    </AccountingShell>
  );
}
