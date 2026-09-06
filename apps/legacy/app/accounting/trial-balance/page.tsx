"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { BandChip } from "@/components/accounting/band-chip";
import { ReportPanel } from "@corelithzw/ui/components/breakdown-panel";
import {
  ReportTable,
  amt,
  dim,
  nm,
  txt,
  type ReportRow,
} from "@/components/accounting/report-table";
import { Card, CardContent } from "@corelithzw/ui/components/card";
import { Input } from "@corelithzw/ui/components/input";
import { AlertTriangle, Check } from "@corelithzw/ui/lib/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { formatAmount, formatCount } from "@/lib/accounting/format";
import {
  type AccountingPeriodRecord,
  fetchAccountingPeriods,
  fetchTrialBalance,
} from "@/lib/api";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";

/**
 * A date input hands back `yyyy-mm-dd`, which `new Date` reads as midnight UTC
 * and then prints back in local time — so west of Greenwich a report filtered
 * to the 20th announces itself as being drawn at the 19th. Anchoring the
 * string to local midnight keeps the label and the filter saying the same day.
 */
function asLocalDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

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

  /**
   * The day the balance is struck at.
   *
   * A trial balance is a position rather than a movement, so the panel head
   * has to say which day it is a position on. The report itself carries no
   * `asOf` field, so this is read back off whichever filter is applied — the
   * end date typed in, or the closing date of the selected period. With
   * neither applied the report runs to the present and the head stays undated
   * rather than asserting a cut-off nobody chose.
   */
  const asOfLabel = useMemo(() => {
    const source =
      endDate || (periodId ? periods.find((period) => period.id === periodId)?.endDate : undefined);
    if (!source) return null;
    return format(asLocalDate(source), "d MMMM yyyy");
  }, [endDate, periodId, periods]);

  /**
   * Every account, then the line they must add up to.
   *
   * The total is the last row of this table rather than a panel of its own.
   * That is only possible because the grid no longer paginates: the reason a
   * trial balance is read at all is to see the closing columns agree, and a
   * total stranded on page four of five leaves every other page a column of
   * figures with no sum.
   */
  const tableRows = useMemo<ReportRow[]>(() => {
    // An empty debit or credit is absent, not zero. Printing `0.00` in the
    // credit column of a cash account is a factual claim that something was
    // credited to it and netted off, which is not what happened.
    const figure = (value: number) => (value ? amt(formatAmount(value)) : dim());
    const tone = balanced ? ("total" as const) : ("bad" as const);

    const lines: ReportRow[] = rows.map((row) => ({
      id: row.accountId,
      cells: [
        txt(row.code, { mono: true, tone: "subtle" }),
        nm(row.name),
        figure(row.openingDebit),
        figure(row.openingCredit),
        figure(row.debit),
        figure(row.credit),
        figure(row.closingDebit),
        figure(row.closingCredit),
      ],
    }));

    if (lines.length === 0) return lines;

    lines.push({
      id: "totals",
      emphasis: true,
      cells: [
        txt(""),
        nm("Total", { tone }),
        amt(formatAmount(totals.openingDebit), { tone }),
        amt(formatAmount(totals.openingCredit), { tone }),
        amt(formatAmount(totals.debit), { tone }),
        amt(formatAmount(totals.credit), { tone }),
        amt(formatAmount(totals.closingDebit), { tone }),
        amt(formatAmount(totals.closingCredit), { tone }),
      ],
    });

    return lines;
  }, [balanced, rows, totals]);

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
          value={formatAmount(difference)}
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

      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-2.5 md:grid-cols-3">
            <Select value={periodId} onValueChange={handlePeriodChange}>
              <SelectTrigger>
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
            />
            <Input
              type="date"
              value={endDate}
              onChange={(event) => handleEndDateChange(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/*
        The verdict, before the evidence.

        The band carries the difference as a chip, but the chip is a bare
        figure: it says 0.00 without saying zero what, or at what size. This
        states the reconciliation in words and gives the total the two closing
        columns agree at, which is the one number a reader carries away from a
        trial balance.

        The design's trailing caption also counts the journals posted in the
        period. That count has no source — the trial balance response carries
        rows and totals and nothing about the entries behind them — so the
        caption states the account count alone rather than inventing the other.

        Withheld until there are rows, because with nothing loaded every figure
        is zero and the banner would announce a ledger in perfect agreement at
        nothing — the most reassuring possible way to render a failed fetch.
      */}
      {rows.length > 0 ? (
        <div
          className="flex items-center gap-2.5 rounded-[9px] border px-[13px] py-[11px]"
          style={{
            background: balanced ? "var(--badge-ok-bg)" : "var(--badge-bad-bg)",
            borderColor: balanced ? "var(--tone-success-bd)" : "var(--tone-danger-bd)",
          }}
        >
          {balanced ? (
            <Check
              className="size-4 shrink-0"
              style={{ color: "var(--badge-ok-fg)" }}
              aria-hidden="true"
            />
          ) : (
            <AlertTriangle
              className="size-4 shrink-0"
              style={{ color: "var(--badge-bad-fg)" }}
              aria-hidden="true"
            />
          )}
          <p
            className="flex-1 text-sm"
            style={{ color: balanced ? "var(--badge-ok-fg)" : "var(--badge-bad-fg)" }}
          >
            {balanced ? (
              <>
                Debits and credits agree at <b>${formatAmount(totals.closingDebit)}</b>. Difference
                is zero.
              </>
            ) : (
              <>
                Debits and credits differ by <b>${formatAmount(Math.abs(difference))}</b>. The
                ledger will not close until this is nil.
              </>
            )}
          </p>
          <span
            className="shrink-0 font-mono text-sm tabular-nums"
            style={{ color: balanced ? "var(--badge-ok-fg)" : "var(--badge-bad-fg)" }}
          >
            {formatCount(rows.length, "account")}
          </span>
        </div>
      ) : null}

      <ReportPanel
        title={asOfLabel ? `Trial balance — at ${asOfLabel}` : "Trial balance"}
        note="opening, movement and closing per account"
      >
        <ReportTable
          label="Trial balance"
          tracks="86px minmax(0,1fr) 108px 108px 108px 108px 112px 112px"
          columns={[
            { label: "Code" },
            { label: "Account" },
            { label: "Opening Dr", align: "right" },
            { label: "Opening Cr", align: "right" },
            { label: "Movement Dr", align: "right" },
            { label: "Movement Cr", align: "right" },
            { label: "Closing Dr", align: "right" },
            { label: "Closing Cr", align: "right" },
          ]}
          rows={tableRows}
          emptyLabel={isLoading ? "Loading trial balance…" : "No trial balance data."}
        />
      </ReportPanel>
    </AccountingShell>
  );
}
