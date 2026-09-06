"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { BandChip } from "@/components/accounting/band-chip";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import { Input } from "@corelithzw/ui/components/input";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import {
  type AccountingPeriodRecord,
  type CashFlowReport,
  type FinancialStatementsReport,
  type TrialBalanceRow,
  fetchAccountingPeriods,
  fetchCashFlowReport,
  fetchFinancialStatements,
} from "@/lib/api";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";

type StatementRow = TrialBalanceRow & { group: string; value: number };

/**
 * Money the way a statement prints it: negatives in brackets, no minus sign.
 * A leading `-` at the far left of a right-aligned mono column is easy to read
 * straight past, and on a cash flow that is the difference between an inflow
 * and an outflow.
 */
function accountingFigure(value: number) {
  const magnitude = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `(${magnitude})` : magnitude;
}

export default function FinancialStatementsPage() {
  const [activeView, setActiveView] = useState<"profit" | "balance" | "cash-flow">("profit");
  const [periodId, setPeriodId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: periodsData } = useQuery({
    queryKey: ["accounting", "periods", "financials"],
    queryFn: () => fetchAccountingPeriods({ limit: 200 }),
  });

  const {
    data: report,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["accounting", "financials", periodId, startDate, endDate],
    queryFn: () =>
      fetchFinancialStatements({
        periodId: periodId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  const { data: cashFlowReport } = useQuery({
    queryKey: ["accounting", "cash-flow", periodId, startDate, endDate],
    queryFn: () =>
      fetchCashFlowReport({
        periodId: periodId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  const periods = periodsData?.data ?? [];
  const financials: FinancialStatementsReport | undefined = report;
  const cashFlow: CashFlowReport | undefined = cashFlowReport;

  const profitRows = useMemo<StatementRow[]>(() => {
    if (!financials) return [];
    const income = financials.profitAndLoss.income.map((row) => ({
      ...row,
      group: "Income",
      value: row.credit - row.debit,
    }));
    const expenses = financials.profitAndLoss.expenses.map((row) => ({
      ...row,
      group: "Expense",
      value: row.debit - row.credit,
    }));
    return [...income, ...expenses];
  }, [financials]);

  const balanceRows = useMemo<StatementRow[]>(() => {
    if (!financials) return [];
    const assets = financials.balanceSheet.assets.map((row) => ({
      ...row,
      group: "Assets",
      value: row.balance,
    }));
    const liabilities = financials.balanceSheet.liabilities.map((row) => ({
      ...row,
      group: "Liabilities",
      value: row.credit - row.debit,
    }));
    const equity = financials.balanceSheet.equity.map((row) => ({
      ...row,
      group: "Equity",
      value: row.credit - row.debit,
    }));
    return [...assets, ...liabilities, ...equity];
  }, [financials]);

  const cashFlowRows = useMemo<StatementRow[]>(() => {
    if (!cashFlow) return [];
    const operating = cashFlow.operating.map((row) => ({
      ...row,
      group: "Operating",
      value: row.credit - row.debit,
    }));
    const investing = cashFlow.investing.map((row) => ({
      ...row,
      group: "Investing",
      value: row.balance,
    }));
    const financing = cashFlow.financing.map((row) => ({
      ...row,
      group: "Financing",
      value: row.credit - row.debit,
    }));
    return [...operating, ...investing, ...financing];
  }, [cashFlow]);

  const columns = useMemo<ColumnDef<StatementRow>[]>(
    () => [
      {
        id: "account",
        header: "Account",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.code}</div>
            <div className="acct-caption">{row.original.name}</div>
          </div>
        ),
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "group",
        header: "Group",
        accessorKey: "group",
        cell: ({ row }) => <Badge variant="outline">{row.original.group}</Badge>,
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "value",
        header: "Amount",
        accessorKey: "value",
        cell: ({ row }) => <NumericCell>{row.original.value.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );

  const totals = financials?.profitAndLoss.totals ?? { income: 0, expenses: 0, netIncome: 0 };
  const balanceTotals = financials?.balanceSheet.totals ?? { assets: 0, liabilities: 0, equity: 0 };
  const cashTotals = cashFlow?.totals ?? { operating: 0, investing: 0, financing: 0, netCash: 0 };

  const handlePeriodChange = (value: string) => {
    setPeriodId(value);
    if (value) {
      setStartDate("");
      setEndDate("");
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (value) setPeriodId("");
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    if (value) setPeriodId("");
  };

  return (
    <AccountingShell
      activeTab="financials"
      title="Financial Statements"
      description="profit and loss, the balance sheet, and where the cash went"
      bandSlot={
        <BandChip
          label="Net income"
          value={accountingFigure(totals.netIncome)}
          tone={totals.netIncome < 0 ? "bad" : "ok"}
        />
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load financial statements</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      {/*
        Six figures, one strip, on the canvas tile.

        These were `FrappeStatCard`s — the frappe `NumberChart` in a
        `rounded-[var(--radius-sm)]` box, a different card from every other panel in the
        module, and one that silently drops the qualifier it is handed. Same
        tile as the rest of accounting now, and each figure says what it is
        measured against rather than standing alone.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricTile
          title="Income"
          value={totals.income}
          valueLabel={accountingFigure(totals.income)}
          delta="for the period"
          detail="everything earned"
          tone="neutral"
        />
        <MetricTile
          title="Expenses"
          value={Math.abs(totals.expenses)}
          valueLabel={accountingFigure(Math.abs(totals.expenses))}
          delta="for the period"
          detail="everything spent"
          tone="warn"
        />
        <MetricTile
          title="Net income"
          value={totals.netIncome}
          valueLabel={accountingFigure(totals.netIncome)}
          delta={totals.netIncome < 0 ? "at a loss" : "before tax"}
          detail="income less expenses"
          tone={totals.netIncome < 0 ? "danger" : "good"}
        />
        <MetricTile
          title="Total assets"
          value={balanceTotals.assets}
          valueLabel={accountingFigure(balanceTotals.assets)}
          delta="at period end"
          detail="what the business holds"
          tone="neutral"
        />
        <MetricTile
          title="Total liabilities"
          value={balanceTotals.liabilities}
          valueLabel={accountingFigure(balanceTotals.liabilities)}
          delta="at period end"
          detail="what it owes"
          tone="warn"
        />
        <MetricTile
          title="Total equity"
          value={balanceTotals.equity}
          valueLabel={accountingFigure(balanceTotals.equity)}
          delta="assets less liabilities"
          detail="the owners' share"
          tone={balanceTotals.equity < 0 ? "danger" : "good"}
        />
      </div>

      <VerticalDataViews
        items={[
          { id: "profit", label: "Profit & Loss", count: profitRows.length },
          { id: "balance", label: "Balance Sheet", count: balanceRows.length },
          { id: "cash-flow", label: "Cash Flow", count: cashFlowRows.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "profit" | "balance" | "cash-flow")}
        railLabel="Statement Views"
      >
        {(() => {
          const toolbar = (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={periodId} onValueChange={handlePeriodChange}>
                <SelectTrigger size="sm" className="h-8 w-[220px]">
                  <SelectValue placeholder="Filter by period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Periods</SelectItem>
                  {periods.map((period: AccountingPeriodRecord) => (
                    <SelectItem key={period.id} value={period.id}>
                      {format(new Date(period.startDate), "yyyy-MM-dd")} to{" "}
                      {format(new Date(period.endDate), "yyyy-MM-dd")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => handleStartDateChange(event.target.value)}
                className="h-8"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(event) => handleEndDateChange(event.target.value)}
                className="h-8"
              />
            </div>
          );

          return (
            <>
              <div className={activeView === "profit" ? "space-y-3" : "hidden"}>
                <DataTable
                  data={profitRows}
                  columns={columns}
                  groupBy="group"
                  searchPlaceholder="Search accounts"
                  searchSubmitLabel="Search"
                  pagination={{ enabled: true }}
                  toolbar={toolbar}
                  emptyState={isLoading ? "Loading profit & loss..." : "No profit & loss data."}
                />
              </div>

              <div className={activeView === "balance" ? "space-y-3" : "hidden"}>
                <DataTable
                  data={balanceRows}
                  columns={columns}
                  groupBy="group"
                  searchPlaceholder="Search accounts"
                  searchSubmitLabel="Search"
                  pagination={{ enabled: true }}
                  toolbar={toolbar}
                  emptyState={isLoading ? "Loading balance sheet..." : "No balance sheet data."}
                />
              </div>

              <div className={activeView === "cash-flow" ? "space-y-3" : "hidden"}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile
                    title="Operating"
                    value={cashTotals.operating}
                    valueLabel={accountingFigure(cashTotals.operating)}
                    delta={cashTotals.operating < 0 ? "cash out" : "cash in"}
                    detail="from trading"
                    tone={cashTotals.operating < 0 ? "warn" : "good"}
                  />
                  <MetricTile
                    title="Investing"
                    value={cashTotals.investing}
                    valueLabel={accountingFigure(cashTotals.investing)}
                    delta={cashTotals.investing < 0 ? "cash out" : "cash in"}
                    detail="assets bought and sold"
                    tone="neutral"
                  />
                  <MetricTile
                    title="Financing"
                    value={cashTotals.financing}
                    valueLabel={accountingFigure(cashTotals.financing)}
                    delta={cashTotals.financing < 0 ? "cash out" : "cash in"}
                    detail="borrowing and equity"
                    tone="neutral"
                  />
                  <MetricTile
                    title="Net cash"
                    value={cashTotals.netCash}
                    valueLabel={accountingFigure(cashTotals.netCash)}
                    delta="the three, summed"
                    detail="movement over the period"
                    tone={cashTotals.netCash < 0 ? "danger" : "good"}
                  />
                </div>
                <DataTable
                  data={cashFlowRows}
                  columns={columns}
                  groupBy="group"
                  searchPlaceholder="Search accounts"
                  searchSubmitLabel="Search"
                  pagination={{ enabled: true }}
                  toolbar={toolbar}
                  emptyState={isLoading ? "Loading cash flow..." : "No cash flow data."}
                />
              </div>
            </>
          );
        })()}
      </VerticalDataViews>
    </AccountingShell>
  );
}
