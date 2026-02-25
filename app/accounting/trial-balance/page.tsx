"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AccountingPeriodRecord,
  type TrialBalanceRow,
  fetchAccountingPeriods,
  fetchTrialBalance,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

export default function TrialBalancePage() {
  const [periodId, setPeriodId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: periodsData } = useQuery({
    queryKey: ["accounting", "periods", "trial"],
    queryFn: () => fetchAccountingPeriods({ limit: 200 }),
  });

  const {
    data: report,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["accounting", "trial-balance", periodId, startDate, endDate],
    queryFn: () =>
      fetchTrialBalance({
        periodId: periodId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  const periods = periodsData?.data ?? [];
  const rows = report?.rows ?? [];

  const columns = useMemo<ColumnDef<TrialBalanceRow>[]>(
    () => [
      {
        id: "code",
        header: "Account",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.code}</div>
            <div className="text-xs text-muted-foreground">{row.original.name}</div>
          </div>
        ),
        size: 112,
        minSize: 112,
        maxSize: 112},
      {
        id: "type",
        header: "Type",
        accessorKey: "type",
        cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "debit",
        header: "Debit",
        accessorKey: "debit",
        cell: ({ row }) => <NumericCell>{row.original.debit.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "credit",
        header: "Credit",
        accessorKey: "credit",
        cell: ({ row }) => <NumericCell>{row.original.credit.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "balance",
        header: "Balance",
        accessorKey: "balance",
        cell: ({ row }) => <NumericCell>{row.original.balance.toFixed(2)}</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );

  const totals = report?.totals ?? { debit: 0, credit: 0 };

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
      activeTab="trial-balance"
      title="Trial Balance"
      description="Review posted ledger balances for the selected period or date range."
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load trial balance</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Debits</CardDescription>
            <CardTitle className="font-mono">{totals.debit.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Credits</CardDescription>
            <CardTitle className="font-mono">{totals.credit.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        groupBy="type"
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
        emptyState={isLoading ? "Loading trial balance..." : "No trial balance data."}
      />
    </AccountingShell>
  );
}
