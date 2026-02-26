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
import { fetchFinancialReportsHubSummary, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { buildAxisChartConfig } from "@/lib/charts/frappe-config-builders";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DONUT_PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

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

  const chartData = useMemo(() => {
    const pnl = (summary?.charts.pnlBreakdown ?? []).map((item) => ({
      label: item.label,
      amount: item.amount,
    }));
    const balance = (summary?.charts.balanceComposition ?? []).map((item) => ({
      label: item.label,
      amount: item.amount,
    }));
    const cash = (summary?.charts.cashFlowComposition ?? []).map((item) => ({
      label: item.label,
      amount: item.amount,
    }));
    const cashRunRate = cash.reduce<Array<{ label: string; amount: number; cumulative: number }>>(
      (acc, item) => {
        const previous = acc.at(-1)?.cumulative ?? 0;
        acc.push({
          label: item.label,
          amount: item.amount,
          cumulative: previous + item.amount,
        });
        return acc;
      },
      [],
    );
    const types = (summary?.charts.accountTypeBreakdown ?? []).map((item) => ({
      label: item.type,
      amount: item.amount,
    }));

    return { pnl, balance, cash, cashRunRate, types };
  }, [summary]);

  const pnlChartConfig = useMemo(
    () =>
      buildAxisChartConfig({
        data: chartData.pnl,
        title: "Profit and Loss Composition",
        subtitle: "Frappe block emphasizes category-to-value comparison.",
        xAxisKey: "label",
        xAxisType: "category",
        yAxisTitle: "Amount",
        series: [{ name: "amount", type: "bar" }],
      }),
    [chartData.pnl],
  );

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
        <FrappeChartShell className="rounded-xl">
          {isLoading ? null : <AxisChart config={pnlChartConfig} />}
        </FrappeChartShell>
        <InsightDonutCard
          title="Balance Sheet Composition"
          subtitle="Proportional split between assets, liabilities, and equity."
          data={
            isLoading
              ? []
              : chartData.balance.map((item, index) => ({
                  label: item.label,
                  value: Math.abs(item.amount),
                  color: DONUT_PALETTE[index % DONUT_PALETTE.length],
                }))
          }
          valueFormatter={formatCurrency}
        />
        <TradingViewChartCard
          title="Cash Flow Momentum"
          subtitle="Component values with a cumulative run-rate overlay."
          data={isLoading ? [] : chartData.cashRunRate}
          xKey="label"
          series={[
            { key: "amount", label: "Component", type: "bar", color: "hsl(var(--chart-2))" },
            { key: "cumulative", label: "Cumulative", type: "line", color: "hsl(var(--chart-1))" },
          ]}
          valueFormatter={formatCurrency}
        />
        <InsightDonutCard
          title="Trial Balance by Account Type"
          subtitle="Absolute balance concentration by account type."
          data={
            isLoading
              ? []
              : chartData.types.map((item, index) => ({
                  label: item.label,
                  value: Math.abs(item.amount),
                  color: DONUT_PALETTE[index % DONUT_PALETTE.length],
                }))
          }
          valueFormatter={formatCurrency}
        />
      </div>

      <GroupedLinkList groups={groups} />
    </AccountingShell>
  );
}
