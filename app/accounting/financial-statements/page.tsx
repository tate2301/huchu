"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import {
  type AccountingPeriodRecord,
  type FinancialStatementsReport,
  type TrialBalanceRow,
  fetchAccountingPeriods,
  fetchFinancialStatements,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

type StatementRow = TrialBalanceRow & { group: string; value: number };

export default function FinancialStatementsPage() {
  const [activeView, setActiveView] = useState<"profit" | "balance">("profit");
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

  const periods = periodsData?.data ?? [];
  const financials: FinancialStatementsReport | undefined = report;

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

  const columns = useMemo<ColumnDef<StatementRow>[]>(
    () => [
      {
        id: "account",
        header: "Account",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.code}</div>
            <div className="text-xs text-muted-foreground">{row.original.name}</div>
          </div>
        ),
      },
      {
        id: "group",
        header: "Group",
        accessorKey: "group",
        cell: ({ row }) => <Badge variant="outline">{row.original.group}</Badge>,
      },
      {
        id: "value",
        header: "Amount",
        accessorKey: "value",
        cell: ({ row }) => <NumericCell>{row.original.value.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  );

  const totals = financials?.profitAndLoss.totals ?? { income: 0, expenses: 0, netIncome: 0 };
  const balanceTotals = financials?.balanceSheet.totals ?? { assets: 0, liabilities: 0, equity: 0 };

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
      description="Profit & loss and balance sheet views based on posted journals."
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load financial statements</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Income</CardDescription>
            <CardTitle className="font-mono">{totals.income.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Expenses</CardDescription>
            <CardTitle className="font-mono">{totals.expenses.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Net Income</CardDescription>
            <CardTitle className="font-mono">{totals.netIncome.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Assets</CardDescription>
            <CardTitle className="font-mono">{balanceTotals.assets.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Liabilities</CardDescription>
            <CardTitle className="font-mono">{balanceTotals.liabilities.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Equity</CardDescription>
            <CardTitle className="font-mono">{balanceTotals.equity.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <VerticalDataViews
        items={[
          { id: "profit", label: "Profit & Loss", count: profitRows.length },
          { id: "balance", label: "Balance Sheet", count: balanceRows.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "profit" | "balance")}
        railLabel="Statement Views"
      >
        <div className={activeView === "profit" ? "space-y-3" : "hidden"}>
          <DataTable
            data={profitRows}
            columns={columns}
            searchPlaceholder="Search accounts"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={periodId} onValueChange={handlePeriodChange}>
                  <SelectTrigger size="sm" className="h-8 w-[220px]">
                    <SelectValue placeholder="Filter by period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Periods</SelectItem>
                    {periods.map((period: AccountingPeriodRecord) => (
                      <SelectItem key={period.id} value={period.id}>
                        {format(new Date(period.startDate), "yyyy-MM-dd")} to {" "}
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
            }
            emptyState={isLoading ? "Loading profit & loss..." : "No profit & loss data."}
          />
        </div>

        <div className={activeView === "balance" ? "space-y-3" : "hidden"}>
          <DataTable
            data={balanceRows}
            columns={columns}
            searchPlaceholder="Search accounts"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={periodId} onValueChange={handlePeriodChange}>
                  <SelectTrigger size="sm" className="h-8 w-[220px]">
                    <SelectValue placeholder="Filter by period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Periods</SelectItem>
                    {periods.map((period: AccountingPeriodRecord) => (
                      <SelectItem key={period.id} value={period.id}>
                        {format(new Date(period.startDate), "yyyy-MM-dd")} to {" "}
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
            }
            emptyState={isLoading ? "Loading balance sheet..." : "No balance sheet data."}
          />
        </div>
      </VerticalDataViews>
    </AccountingShell>
  );
}
