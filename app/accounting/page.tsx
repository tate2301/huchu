"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxisChart } from "@rtcamp/frappe-ui-react";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { GroupedLinkList, type HubLinkGroup } from "@/components/accounting/hubs/grouped-link-list";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { FrappeChartShell } from "@/components/charts/frappe-chart-shell";
import { InsightDonutCard } from "@/components/charts/insight-donut-card";
import { TradingViewChartCard } from "@/components/charts/tradingview-chart-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchAccountingSummary,
  fetchFinancialReportsHubSummary,
  fetchPayablesHubSummary,
  fetchReceivablesHubSummary,
  fetchSites,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildAxisChartConfig } from "@/lib/charts/frappe-config-builders";
import { ArrowRight, Plus, RefreshCcw } from "@/lib/icons";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const OVERVIEW_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function AccountingOverviewPage() {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [branchId, setBranchId] = useState("all");

  const { data: branches } = useQuery({
    queryKey: ["sites", "accounting-branches"],
    queryFn: fetchSites,
  });

  const {
    data: accountingSummary,
    error: accountingSummaryError,
  } = useQuery({
    queryKey: ["accounting-summary"],
    queryFn: fetchAccountingSummary,
  });

  const {
    data: receivablesSummary,
    isLoading: receivablesLoading,
    error: receivablesError,
  } = useQuery({
    queryKey: ["accounting", "hubs", "receivables", startDate, endDate, branchId],
    queryFn: () =>
      fetchReceivablesHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  const {
    data: payablesSummary,
    isLoading: payablesLoading,
    error: payablesError,
  } = useQuery({
    queryKey: ["accounting", "hubs", "payables", startDate, endDate, branchId],
    queryFn: () =>
      fetchPayablesHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  const {
    data: financialSummary,
    isLoading: financialLoading,
    error: financialError,
  } = useQuery({
    queryKey: ["accounting", "hubs", "financial-reports", startDate, endDate, branchId],
    queryFn: () =>
      fetchFinancialReportsHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  const setupMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/accounting/setup", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
    },
  });

  const chartData = useMemo(() => {
    const position = [
      { metric: "Open AR", amount: receivablesSummary?.kpis.openBalance ?? 0 },
      { metric: "Open AP", amount: payablesSummary?.kpis.openBalance ?? 0 },
      { metric: "Net Income", amount: financialSummary?.kpis.netIncome ?? 0 },
      { metric: "Net Cash", amount: financialSummary?.kpis.netCash ?? 0 },
    ];
    const positionBreakdown = position.map((item) => ({
      label: item.metric,
      value: Math.abs(item.amount),
    }));
    const flow = [
      {
        phase: "Documented",
        receivables: receivablesSummary?.kpis.issuedInvoiceValue ?? 0,
        payables: payablesSummary?.kpis.receivedBillValue ?? 0,
      },
      {
        phase: "Settled",
        receivables: receivablesSummary?.kpis.collectedAmount ?? 0,
        payables: payablesSummary?.kpis.paidAmount ?? 0,
      },
      {
        phase: "Adjustments",
        receivables: receivablesSummary?.kpis.creditNoteAmount ?? 0,
        payables: payablesSummary?.kpis.debitNoteAmount ?? 0,
      },
    ];
    const trendByDate = new Map<string, { date: string; receivables: number; payables: number; net: number }>();
    (receivablesSummary?.charts.collectionsTrend ?? []).forEach((item) => {
      const existing = trendByDate.get(item.date);
      trendByDate.set(item.date, {
        date: item.date,
        receivables: item.collected,
        payables: existing?.payables ?? 0,
        net: 0,
      });
    });
    (payablesSummary?.charts.paymentsTrend ?? []).forEach((item) => {
      const existing = trendByDate.get(item.date);
      trendByDate.set(item.date, {
        date: item.date,
        receivables: existing?.receivables ?? 0,
        payables: item.paid,
        net: 0,
      });
    });
    const cashRace = Array.from(trendByDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        net: item.receivables - item.payables,
      }));

    return { positionBreakdown, flow, cashRace };
  }, [financialSummary, payablesSummary, receivablesSummary]);

  const flowChartConfig = useMemo(
    () =>
      buildAxisChartConfig({
        data: chartData.flow,
        title: "Flow Ladder",
        subtitle: "Frappe block compares AR/AP movement by lifecycle phase.",
        xAxisKey: "phase",
        xAxisType: "category",
        yAxisTitle: "Amount",
        colors: ["hsl(var(--chart-2))", "hsl(var(--chart-4))"],
        series: [
          { name: "receivables", type: "bar" },
          { name: "payables", type: "bar" },
        ],
      }),
    [chartData.flow],
  );

  const groupedLinks = useMemo<HubLinkGroup[]>(
    () => [
      {
        group: "Receivables",
        items: [
          {
            id: "receivables-home",
            label: "Receivables Home",
            description: "Overall AR position, trends, and quick access.",
            href: "/accounting/receivables",
            tag: "Home",
          },
          {
            id: "sales",
            label: "Sales Operations",
            description: "Customers, invoices, receipts, and adjustments.",
            href: "/accounting/sales",
            tag: "Operations",
          },
          {
            id: "ar-aging",
            label: "AR Aging",
            description: "Receivables exposure by aging bucket.",
            href: "/accounting/sales?view=aging",
            tag: "Report",
          },
        ],
      },
      {
        group: "Payables",
        items: [
          {
            id: "payables-home",
            label: "Payables Home",
            description: "Overall AP position, trends, and quick access.",
            href: "/accounting/payables",
            tag: "Home",
          },
          {
            id: "purchases",
            label: "Purchases Operations",
            description: "Vendors, bills, payments, and adjustments.",
            href: "/accounting/purchases",
            tag: "Operations",
          },
          {
            id: "ap-aging",
            label: "AP Aging",
            description: "Payables exposure by aging bucket.",
            href: "/accounting/purchases?view=aging",
            tag: "Report",
          },
        ],
      },
      {
        group: "Financial Reporting",
        items: [
          {
            id: "financial-home",
            label: "Financial Reports Home",
            description: "Overall reporting position and report access.",
            href: "/accounting/financial-reports",
            tag: "Home",
          },
          {
            id: "trial-balance",
            label: "Trial Balance",
            description: "Ledger checks by account debits and credits.",
            href: "/accounting/trial-balance",
            tag: "Report",
          },
          {
            id: "financial-statements",
            label: "Financial Statements",
            description: "Profit and loss, balance sheet, and cash flow.",
            href: "/accounting/financial-statements",
            tag: "Report",
          },
          {
            id: "vat-summary",
            label: "VAT Summary",
            description: "Output/input VAT position and net tax.",
            href: "/accounting/tax?view=vat-summary",
            tag: "Tax",
          },
          {
            id: "vat-returns",
            label: "VAT Returns",
            description: "Draft, review, finalize, and file VAT returns.",
            href: "/accounting/tax?view=vat-returns",
            tag: "Compliance",
          },
        ],
      },
      {
        group: "Payments and Banking",
        items: [
          {
            id: "banking",
            label: "Banking",
            description: "Bank accounts, transactions, and reconciliations.",
            href: "/accounting/banking",
            tag: "Cash",
          },
          {
            id: "sales-receipts",
            label: "Receipt Register",
            description: "Incoming customer cash movements.",
            href: "/accounting/sales?view=receipts",
            tag: "AR",
          },
          {
            id: "purchase-payments",
            label: "Payment Register",
            description: "Outgoing supplier cash movements.",
            href: "/accounting/purchases?view=payments",
            tag: "AP",
          },
          {
            id: "payment-ledger",
            label: "Payment Ledger",
            description: "Unified AR/AP ledger movements for allocations and aging.",
            href: "/accounting/financial-reports",
            tag: "Ledger",
          },
        ],
      },
      {
        group: "Accounting Master",
        items: [
          {
            id: "coa",
            label: "Chart of Accounts",
            description: "Account structure and classifications.",
            href: "/accounting/chart-of-accounts",
            tag: "Master",
          },
          {
            id: "periods",
            label: "Accounting Periods",
            description: "Period control, freeze date, opening balances, and close vouchers.",
            href: "/accounting/periods",
            tag: "Master",
          },
          {
            id: "journals",
            label: "Journals",
            description: "Manual journals and posting control.",
            href: "/accounting/journals",
            tag: "Core",
          },
          {
            id: "posting-rules",
            label: "Posting Rules",
            description: "Automation mappings for source postings.",
            href: "/accounting/posting-rules",
            tag: "Automation",
          },
          {
            id: "cost-centers",
            label: "Cost Centers",
            description: "Cost allocation dimensions by department.",
            href: "/accounting/cost-centers",
            tag: "Master",
          },
          {
            id: "budgets",
            label: "Budgets",
            description: "Budget setup and tracking.",
            href: "/accounting/budgets",
            tag: "Planning",
          },
          {
            id: "currency",
            label: "Currency Rates",
            description: "Exchange rates and conversion controls.",
            href: "/accounting/currency",
            tag: "Master",
          },
          {
            id: "tax",
            label: "Tax Setup",
            description: "Tax code setup and VAT controls.",
            href: "/accounting/tax",
            tag: "Tax",
          },
          {
            id: "assets",
            label: "Fixed Assets",
            description: "Asset register and depreciation controls.",
            href: "/accounting/assets",
            tag: "Master",
          },
          {
            id: "fiscalisation",
            label: "Fiscalisation",
            description: "Fiscal device and receipt integration settings.",
            href: "/accounting/fiscalisation",
            tag: "Compliance",
          },
        ],
      },
    ],
    [],
  );

  const loading = receivablesLoading || payablesLoading || financialLoading;
  const error = receivablesError || payablesError || financialError || accountingSummaryError;

  return (
    <AccountingShell
      activeTab="overview"
      title="Accounting Overview"
      description="Company-wide accounting position with grouped navigation and quick actions."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/accounting/journals?action=new-journal">
              <Plus className="mr-2 size-4" />
              New Journal
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/sales?action=new-invoice">
              <Plus className="mr-2 size-4" />
              New Invoice
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/purchases?action=new-bill">
              <Plus className="mr-2 size-4" />
              New Bill
            </Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load accounting overview</AlertTitle>
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
          title="Accounts in Chart"
          value={accountingSummary?.accounts ?? 0}
          valueLabel={(accountingSummary?.accounts ?? 0).toLocaleString()}
          detail="Active account structure"
        />
        <MetricTile
          title="Open AR"
          value={receivablesSummary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(receivablesSummary?.kpis.openBalance ?? 0)}
          detail="Outstanding receivables"
        />
        <MetricTile
          title="Open AP"
          value={payablesSummary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(payablesSummary?.kpis.openBalance ?? 0)}
          detail="Outstanding payables"
        />
        <MetricTile
          title="Net Income"
          value={financialSummary?.kpis.netIncome ?? 0}
          valueLabel={formatCurrency(financialSummary?.kpis.netIncome ?? 0)}
          detail="Profit and loss position"
        />
        <MetricTile
          title="Net Cash"
          value={financialSummary?.kpis.netCash ?? 0}
          valueLabel={formatCurrency(financialSummary?.kpis.netCash ?? 0)}
          detail="Cash flow net movement"
        />
        <MetricTile
          title="Open Periods"
          value={accountingSummary?.openPeriods ?? 0}
          valueLabel={(accountingSummary?.openPeriods ?? 0).toLocaleString()}
          detail="Current open accounting periods"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FrappeChartShell className="rounded-xl">
          {loading ? null : <AxisChart config={flowChartConfig} />}
        </FrappeChartShell>
        <InsightDonutCard
          title="Position Composition"
          subtitle="Relative weight of AR, AP, net income, and net cash."
          data={
            loading
              ? []
              : chartData.positionBreakdown.map((item, index) => ({
                  label: item.label,
                  value: item.value,
                  color: OVERVIEW_COLORS[index % OVERVIEW_COLORS.length],
                }))
          }
          valueFormatter={formatCurrency}
        />
      </div>
      <TradingViewChartCard
        title="Cash Race"
        subtitle="TradingView-style line race: collections versus supplier payments, with net spread."
        data={loading ? [] : chartData.cashRace}
        xKey="date"
        xAxisType="time"
        series={[
          { key: "receivables", label: "Collections", type: "line", color: "hsl(var(--chart-2))" },
          { key: "payables", label: "Payments", type: "line", color: "hsl(var(--chart-4))" },
          { key: "net", label: "Net Spread", type: "area", color: "hsl(var(--chart-1))" },
        ]}
        valueFormatter={formatCurrency}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <GroupedLinkList groups={groupedLinks} />
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Launch workflows and setup tasks immediately.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full justify-between" asChild size="sm" variant="outline">
              <Link href="/accounting/receivables">
                Receivables Home
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button className="w-full justify-between" asChild size="sm" variant="outline">
              <Link href="/accounting/payables">
                Payables Home
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button className="w-full justify-between" asChild size="sm" variant="outline">
              <Link href="/accounting/financial-reports">
                Financial Reports Home
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              type="button"
              className="w-full justify-between"
              size="sm"
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
            >
              Initialize Accounting Defaults
              <RefreshCcw className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </AccountingShell>
  );
}
