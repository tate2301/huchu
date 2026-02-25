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
import { fetchFinancialReportsHubSummary, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { buildAxisChartConfig } from "@/lib/charts/frappe-config-builders";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FinancialReportsHomePage() {
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
    queryKey: ["accounting", "hubs", "financial-reports", startDate, endDate, branchId],
    queryFn: () =>
      fetchFinancialReportsHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  const chartConfigs = useMemo(() => {
    const pnlData = (summary?.charts.pnlBreakdown ?? []).map((item) => ({
      label: item.label,
      amount: item.amount,
    }));
    const balanceData = (summary?.charts.balanceComposition ?? []).map((item) => ({
      label: item.label,
      amount: item.amount,
    }));
    const cashFlowData = (summary?.charts.cashFlowComposition ?? []).map((item) => ({
      label: item.label,
      amount: item.amount,
    }));
    const typeData = (summary?.charts.accountTypeBreakdown ?? []).map((item) => ({
      label: item.type,
      amount: item.amount,
    }));

    return {
      pnl: buildAxisChartConfig({
        data: pnlData,
        title: "Profit and Loss Position",
        subtitle: "Income, expenses, and net income.",
        xAxisKey: "label",
        xAxisType: "category",
        yAxisTitle: "Amount",
        series: [{ name: "amount", type: "bar" }],
      }),
      balance: buildAxisChartConfig({
        data: balanceData,
        title: "Balance Sheet Composition",
        subtitle: "Assets, liabilities, and equity.",
        xAxisKey: "label",
        xAxisType: "category",
        yAxisTitle: "Amount",
        series: [{ name: "amount", type: "bar" }],
      }),
      cash: buildAxisChartConfig({
        data: cashFlowData,
        title: "Cash Flow Components",
        subtitle: "Operating, investing, financing, and net cash.",
        xAxisKey: "label",
        xAxisType: "category",
        yAxisTitle: "Amount",
        series: [{ name: "amount", type: "bar" }],
      }),
      types: buildAxisChartConfig({
        data: typeData,
        title: "Trial Balance by Account Type",
        subtitle: "Absolute balance concentration by account type.",
        xAxisKey: "label",
        xAxisType: "category",
        yAxisTitle: "Amount",
        series: [{ name: "amount", type: "bar" }],
      }),
    };
  }, [summary]);

  const groups = useMemo<HubLinkGroup[]>(
    () => [
      {
        group: "Core Financial Reports",
        items: [
          {
            id: "trial",
            label: "Trial Balance",
            description: "Period debits, credits, and balances by account.",
            href: "/accounting/trial-balance",
            tag: "Core",
          },
          {
            id: "financials",
            label: "Financial Statements",
            description: "Profit and loss, balance sheet, and cash flow views.",
            href: "/accounting/financial-statements",
            tag: "Core",
          },
          {
            id: "vat",
            label: "VAT Summary",
            description: "Output, input, and net VAT by tax code.",
            href: "/accounting/tax?view=vat-summary",
            tag: "Tax",
          },
        ],
      },
      {
        group: "Receivables and Payables Reports",
        items: [
          {
            id: "ar-aging",
            label: "AR Aging",
            description: "Outstanding receivables by due bucket.",
            href: "/accounting/sales?view=aging",
            tag: "AR",
          },
          {
            id: "ap-aging",
            label: "AP Aging",
            description: "Outstanding payables by due bucket.",
            href: "/accounting/purchases?view=aging",
            tag: "AP",
          },
          {
            id: "customer-statements",
            label: "Customer Statements",
            description: "Customer-level statement movement and balance.",
            href: "/accounting/sales?view=statements",
            tag: "AR",
          },
          {
            id: "vendor-statements",
            label: "Vendor Statements",
            description: "Vendor-level statement movement and balance.",
            href: "/accounting/purchases?view=statements",
            tag: "AP",
          },
        ],
      },
    ],
    [],
  );

  return (
    <AccountingShell
      activeTab="financial-reports"
      title="Financial Reports Home"
      description="Overall reporting position across profit and loss, balance sheet, and cash flow."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/accounting/trial-balance">Open Trial Balance</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/financial-statements">Open Financial Statements</Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load financial reports summary</AlertTitle>
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
          title="Net Income"
          value={summary?.kpis.netIncome ?? 0}
          valueLabel={formatCurrency(summary?.kpis.netIncome ?? 0)}
          detail="Profit and loss position"
        />
        <MetricTile
          title="Total Assets"
          value={summary?.kpis.assets ?? 0}
          valueLabel={formatCurrency(summary?.kpis.assets ?? 0)}
          detail="Balance sheet assets"
        />
        <MetricTile
          title="Total Liabilities"
          value={summary?.kpis.liabilities ?? 0}
          valueLabel={formatCurrency(summary?.kpis.liabilities ?? 0)}
          detail="Balance sheet liabilities"
          negativeIsBetter
        />
        <MetricTile
          title="Total Equity"
          value={summary?.kpis.equity ?? 0}
          valueLabel={formatCurrency(summary?.kpis.equity ?? 0)}
          detail="Balance sheet equity"
        />
        <MetricTile
          title="Net Cash"
          value={summary?.kpis.netCash ?? 0}
          valueLabel={formatCurrency(summary?.kpis.netCash ?? 0)}
          detail="Cash flow net movement"
        />
        <MetricTile
          title="Trial Balance Check"
          value={(summary?.kpis.totalDebit ?? 0) - (summary?.kpis.totalCredit ?? 0)}
          valueLabel={formatCurrency((summary?.kpis.totalDebit ?? 0) - (summary?.kpis.totalCredit ?? 0))}
          detail="Debit minus credit difference"
          negativeIsBetter
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FrappeChartShell>{isLoading ? null : <AxisChart config={chartConfigs.pnl} />}</FrappeChartShell>
        <FrappeChartShell>{isLoading ? null : <AxisChart config={chartConfigs.balance} />}</FrappeChartShell>
        <FrappeChartShell>{isLoading ? null : <AxisChart config={chartConfigs.cash} />}</FrappeChartShell>
        <FrappeChartShell>{isLoading ? null : <AxisChart config={chartConfigs.types} />}</FrappeChartShell>
      </div>

      <GroupedLinkList groups={groups} />
    </AccountingShell>
  );
}
