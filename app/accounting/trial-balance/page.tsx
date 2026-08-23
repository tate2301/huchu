"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import { BandChip } from "@/components/accounting/band-chip";
import { ReportPanel } from "@/components/ui/breakdown-panel";
import { ReportTable, amt, nm } from "@/components/accounting/report-table";
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
        id: "name",
        header: "Account",
        accessorKey: "name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        size: 280,
        minSize: 240,
        maxSize: 420},
      {
        id: "type",
        header: "Type",
        accessorKey: "type",
        cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
        size: 140,
        minSize: 140,
        maxSize: 140},
      {
        id: "openingDebit",
        header: "Opening Dr",
        accessorKey: "openingDebit",
        cell: ({ row }) => <NumericCell>{row.original.openingDebit.toFixed(2)}</NumericCell>,
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "openingCredit",
        header: "Opening Cr",
        accessorKey: "openingCredit",
        cell: ({ row }) => <NumericCell>{row.original.openingCredit.toFixed(2)}</NumericCell>,
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "debit",
        header: "Period Dr",
        accessorKey: "debit",
        cell: ({ row }) => <NumericCell>{row.original.debit.toFixed(2)}</NumericCell>,
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "credit",
        header: "Period Cr",
        accessorKey: "credit",
        cell: ({ row }) => <NumericCell>{row.original.credit.toFixed(2)}</NumericCell>,
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "closingDebit",
        header: "Closing Dr",
        accessorKey: "closingDebit",
        cell: ({ row }) => <NumericCell>{row.original.closingDebit.toFixed(2)}</NumericCell>,
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "closingCredit",
        header: "Closing Cr",
        accessorKey: "closingCredit",
        cell: ({ row }) => <NumericCell>{row.original.closingCredit.toFixed(2)}</NumericCell>,
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "total",
        header: "Total",
        accessorKey: "total",
        cell: ({ row }) => <NumericCell>{row.original.total.toFixed(2)}</NumericCell>,
        size: 128,
        minSize: 128,
        maxSize: 128},
    ],
    [],
  );

  const totals = report?.totals ?? {
    openingDebit: 0,
    openingCredit: 0,
    debit: 0,
    credit: 0,
    closingDebit: 0,
    closingCredit: 0,
    total: 0,
  };

  /**
   * Closing debits less closing credits.
   *
   * Rounded to the cent before the comparison. These are floats off the wire,
   * and an unrounded `=== 0` reports a perfectly good ledger as out of balance
   * over a difference of 1e-13 — which sends somebody hunting for a posting
   * error that does not exist.
   */
  const difference = Math.round((totals.closingDebit - totals.closingCredit) * 100) / 100;
  const balanced = difference === 0;

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
      description="every account, opening through closing"
      bandSlot={
        <BandChip
          label="Difference"
          value={difference.toFixed(2)}
          tone={balanced ? "ok" : "bad"}
        />
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load trial balance</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      {/*
        The totals, once, under the table.

        There were three stat cards above it — "Opening Credits", "Closing
        Credits" and "Total" — and none of them was a fact anybody comes to a
        trial balance for. Opening credits in isolation answers nothing; the
        question this report exists to settle is whether closing debits equal
        closing credits, and that now lives in the band as a Difference chip
        that stays in view however far you scroll.

        The full totals row sits below the table rather than inside it, because
        the table paginates: a total row as the last row would appear only on
        the final page, and on every other page the reader would see a column
        of figures with no sum at all.
      */}
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

      <ReportPanel title="Totals" note="every account, summed">
        <ReportTable
          label="Trial balance totals"
          tracks="minmax(0,1fr) 108px 108px 108px 108px 112px 112px"
          columns={[
            { label: "" },
            { label: "Opening Dr", align: "right" },
            { label: "Opening Cr", align: "right" },
            { label: "Movement Dr", align: "right" },
            { label: "Movement Cr", align: "right" },
            { label: "Closing Dr", align: "right" },
            { label: "Closing Cr", align: "right" },
          ]}
          rows={[
            {
              id: "totals",
              emphasis: true,
              cells: [
                nm("Total", { tone: balanced ? "total" : "bad" }),
                amt(totals.openingDebit.toFixed(2), { tone: balanced ? "total" : "bad" }),
                amt(totals.openingCredit.toFixed(2), { tone: balanced ? "total" : "bad" }),
                amt(totals.debit.toFixed(2), { tone: balanced ? "total" : "bad" }),
                amt(totals.credit.toFixed(2), { tone: balanced ? "total" : "bad" }),
                amt(totals.closingDebit.toFixed(2), { tone: balanced ? "total" : "bad" }),
                amt(totals.closingCredit.toFixed(2), { tone: balanced ? "total" : "bad" }),
              ],
            },
          ]}
        />
        {!balanced ? (
          <p className="border-t border-[var(--border-subtle)] px-[13px] py-2 text-sm text-[var(--badge-bad-fg)]">
            Closing debits and credits differ by {difference.toFixed(2)}. The ledger will not close
            until this is nil.
          </p>
        ) : null}
      </ReportPanel>
    </AccountingShell>
  );
}
