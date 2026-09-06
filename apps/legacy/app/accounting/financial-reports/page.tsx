"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { BandChip } from "@/components/accounting/band-chip";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { ReportPanel } from "@corelithzw/ui/components/breakdown-panel";
import {
  ReportTable,
  amt,
  dim,
  nm,
  num,
  txt,
  type ReportRow,
} from "@/components/accounting/report-table";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { AccountingNewButton } from "@/components/accounting/accounting-new-button";
import { Coins, Percent, Scale, TrendingUp, Wallet } from "@corelithzw/ui/lib/icons";
import { Card, CardContent } from "@corelithzw/ui/components/card";
import { Input } from "@corelithzw/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { formatAmount, formatHeadline } from "@/lib/accounting/format";
import { fetchFinancialReportsHubSummary, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";

/**
 * Money the way a statement prints it: negatives in brackets, no minus sign.
 *
 * This is not decoration. In a right-aligned mono column a leading `-` sits at
 * the far left of the cell, several characters away from the digits and easy
 * to read straight past — which on a cash flow statement is the difference
 * between an inflow and an outflow.
 *
 * Only for table cells. The tiles above take `formatHeadline`, where the
 * figure stands alone rather than in a column and a minus sign is unmissable.
 */
function accountingFigure(value: number) {
  const magnitude = formatAmount(Math.abs(value));
  return value < 0 ? `(${magnitude})` : magnitude;
}

export default function FinancialReportsHomePage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [branchId, setBranchId] = useState("all");

  const { data: branches } = useQuery({
    queryKey: ["sites", "accounting-branches"],
    queryFn: fetchSites,
  });

  const { data: summary, error } = useQuery({
    queryKey: ["accounting", "hubs", "financial-reports", startDate, endDate, branchId],
    queryFn: () =>
      fetchFinancialReportsHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  /**
   * The three statements, as statements.
   *
   * These were proportional bar lists, and before that donuts. Neither is what
   * a financial statement is: a statement is a set of lines that must add up,
   * read down the page, with the subtotals emphasised — and a bar chart is the
   * one shape that makes checking the arithmetic impossible. You cannot read
   * 184,620 off a bar, and a reader who has come here to tie assets back to
   * liabilities plus equity cannot do it at all.
   *
   * The design draws sub-lines beneath each heading — revenue split by stream,
   * a cost of sales line, a gross profit subtotal. Those are not rendered here
   * because the hub endpoint does not yet supply them: its `pnlBreakdown` is
   * the income/expenses/net-income totals under second names, so looping over
   * it printed every figure on this table twice. Three honest lines beat six
   * lines that are three facts wearing two hats each.
   */
  const pnlRows = useMemo<ReportRow[]>(() => {
    const k = summary?.kpis;
    const income = k?.income ?? 0;
    const expenses = k?.expenses ?? 0;
    const net = k?.netIncome ?? 0;
    // The API returns expenses as a negative. Share-of-income is drawn from
    // the magnitude so the percentage column reads as a proportion rather
    // than as a negative share.
    const share = (value: number) =>
      income === 0 ? dim() : num(`${Math.round((Math.abs(value) / income) * 100)}`, { tone: "subtle" });

    return [
      { id: "income", cells: [nm("Income"), amt(accountingFigure(income)), share(income)] },
      { id: "expenses", cells: [nm("Expenses"), amt(accountingFigure(expenses)), share(expenses)] },
      {
        id: "net-income",
        emphasis: true,
        cells: [
          nm("Net income", { tone: net < 0 ? "bad" : "total" }),
          amt(accountingFigure(net), { tone: net < 0 ? "bad" : "total" }),
          income === 0
            ? dim()
            : num(`${Math.round((net / income) * 100)}`, { tone: net < 0 ? "bad" : "total", bold: true }),
        ],
      },
    ];
  }, [summary]);

  /**
   * Assets, liabilities, equity — once each.
   *
   * The design splits assets into current and fixed and liabilities into
   * current and long-term before each total. `balanceComposition` cannot
   * supply that split: it is the same three totals relabelled, so rendering it
   * above the totals printed each figure twice under two names, which on a
   * balance sheet reads as a ledger that does not add up.
   */
  const balanceRows = useMemo<ReportRow[]>(() => {
    const k = summary?.kpis;
    const assets = k?.assets ?? 0;
    const liabilities = k?.liabilities ?? 0;
    const equity = k?.equity ?? 0;

    return [
      { id: "assets", cells: [nm("Total assets"), amt(accountingFigure(assets))] },
      { id: "liabilities", cells: [nm("Total liabilities"), amt(accountingFigure(liabilities))] },
      {
        id: "equity",
        emphasis: true,
        cells: [nm("Equity", { tone: "total" }), amt(accountingFigure(equity), { tone: "total" })],
      },
    ];
  }, [summary]);

  /**
   * The three movements, then the one line they add up to.
   *
   * `cashFlowComposition` carries a fourth entry that is the net total rather
   * than a movement, so it is dropped here: the total belongs at the foot of
   * the statement, emphasised, and printing it both as an ordinary row and as
   * the total makes the column appear to double-count itself.
   *
   * Opening and closing cash — the two rows that turn this into a
   * reconciliation — are absent because `getCashFlowReport` derives net
   * movement from the period alone and never looks up a balance brought
   * forward.
   */
  const cashRows = useMemo<ReportRow[]>(() => {
    const net = summary?.kpis.netCash ?? 0;
    const movements = (summary?.charts.cashFlowComposition ?? []).filter(
      (item) => item.label.trim().toLowerCase() !== "net cash",
    );
    const lines: ReportRow[] = movements.map((item) => ({
      id: `cf-${item.label}`,
      cells: [nm(item.label), amt(accountingFigure(item.amount))],
    }));
    lines.push({
      id: "net-cash",
      emphasis: true,
      cells: [
        nm("Net movement", { tone: net < 0 ? "bad" : "total" }),
        amt(accountingFigure(net), { tone: net < 0 ? "bad" : "total" }),
      ],
    });
    return lines;
  }, [summary]);

  /**
   * What the statements cover, in the words the band and the panel heads use.
   *
   * Read from the response's `meta` rather than from the two date inputs, so
   * the label describes the figures actually on screen rather than the filter
   * someone is halfway through changing.
   */
  const periodLabel = useMemo(() => {
    const from = summary?.meta.startDate;
    const to = summary?.meta.endDate;
    const month = (value: string) =>
      new Date(value).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (!from && !to) return "all time";
    if (from && to) {
      const a = month(from);
      const b = month(to);
      return a === b ? a : `${a} – ${b}`;
    }
    return to ? `to ${month(to)}` : `from ${month(from as string)}`;
  }, [summary]);

  /**
   * The date the balance sheet is drawn at.
   *
   * A balance sheet is a position, not a movement: "August 2026" is the wrong
   * label for it even when the P&L beside it is right, because the figure is a
   * balance on one day rather than a total over thirty. With no end date
   * filtered the position is today's.
   */
  const asAtDate = useMemo(() => {
    const to = summary?.meta.endDate;
    if (!to) return "today";
    return new Date(to).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [summary]);

  /**
   * The ratios behind three of the tiles.
   *
   * Null rather than zero when the denominator is missing, so a tenant with no
   * postings yet gets a tile with no delta line rather than one asserting a 0%
   * margin — which reads as a business losing every dollar it takes.
   */
  const margin = useMemo(() => {
    const income = summary?.kpis.income ?? 0;
    if (income <= 0) return null;
    return Math.round(((summary?.kpis.netIncome ?? 0) / income) * 100);
  }, [summary]);

  const gearing = useMemo(() => {
    const assets = summary?.kpis.assets ?? 0;
    if (assets <= 0) return null;
    return Math.round(((summary?.kpis.liabilities ?? 0) / assets) * 100);
  }, [summary]);

  /**
   * Debits less credits.
   *
   * Rounded to the cent before comparing with zero. These arrive as floats,
   * and an unrounded `!== 0` would report a ledger as unbalanced over a
   * difference of 1e-13 — the classic way to make a correct trial balance look
   * broken.
   */
  const trialBalanceDifference = useMemo(() => {
    const raw = (summary?.kpis.totalDebit ?? 0) - (summary?.kpis.totalCredit ?? 0);
    return Math.round(raw * 100) / 100;
  }, [summary]);

  /**
   * The report shelf.
   *
   * This was a `GroupedLinkList` — two headed groups of cards, each with a
   * label, a sentence of description and a tag. The design draws it as a
   * table, and a table is right for the same reason it is right anywhere: the
   * reader is not browsing, they are looking for one report and want to know
   * what it covers and on what basis before they run it. Those are columns.
   *
   * `Covers` and `Basis` are static facts about each report, not data — a
   * balance sheet is always as-at and always accrual.
   *
   * Two of the design's columns are deliberately absent. `Last run` has no
   * source: nothing records when a report was generated, and a column reading
   * "not yet run" against six rows would be a worse lie than no column.
   * `Format` advertised "PDF · XLSX" against an export capability that exists
   * nowhere in the app — a promise the shelf cannot keep.
   */
  const reportRows = useMemo<ReportRow[]>(
    () => [
      {
        id: "profit-and-loss",
        href: "/accounting/financial-statements",
        cells: [nm("Profit and loss"), txt(periodLabel, { tone: "subtle" }), txt("Accrual")],
      },
      {
        id: "balance-sheet",
        href: "/accounting/financial-statements",
        cells: [nm("Balance sheet"), txt(`At ${asAtDate}`, { tone: "subtle" }), txt("Accrual")],
      },
      {
        id: "cash-flow",
        href: "/accounting/financial-statements",
        cells: [nm("Cash flow"), txt(periodLabel, { tone: "subtle" }), txt("Indirect")],
      },
      {
        id: "trial-balance",
        href: "/accounting/trial-balance",
        cells: [nm("Trial balance"), txt(`At ${asAtDate}`, { tone: "subtle" }), txt("All accounts")],
      },
      {
        id: "vat",
        href: "/accounting/tax",
        cells: [nm("VAT return"), txt(periodLabel, { tone: "subtle" }), txt("ZIMRA")],
      },
    ],
    [asAtDate, periodLabel],
  );

  return (
    <AccountingShell
      activeTab="financial-reports"
      title="Financial Reports"
      description="the statements, from one period selector"
      // The applied period is the one fact every figure below depends on, so
      // it belongs in the band that never scrolls rather than on a panel head
      // that leaves the screen with its own table.
      bandSlot={<BandChip label="Period" value={periodLabel} tone="mute" />}
      actions={
        <AccountingNewButton
          label="Run a report"
          items={[
            { label: "Profit and loss", icon: TrendingUp, href: "/accounting/financial-statements" },
            { label: "Balance sheet", icon: Scale, href: "/accounting/financial-statements" },
            { label: "Cash flow", icon: Wallet, href: "/accounting/financial-statements" },
            { label: "Trial balance", icon: Coins, href: "/accounting/trial-balance" },
            { label: "VAT return", icon: Percent, href: "/accounting/tax" },
          ]}
        />
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
          <div className="grid gap-2.5 md:grid-cols-3">
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
          <p className="mt-2 acct-caption">
            Branch filter is shown for planning consistency. Current accounting totals remain company-wide.
          </p>
        </CardContent>
      </Card>

      {/* Six figures, one strip — the whole position at a glance. */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricTile
          title="Net income"
          value={summary?.kpis.netIncome ?? 0}
          valueLabel={formatHeadline(summary?.kpis.netIncome ?? 0)}
          delta={margin === null ? undefined : `${margin}% margin`}
          detail={periodLabel}
          tone={(summary?.kpis.netIncome ?? 0) < 0 ? "danger" : "good"}
        />
        <MetricTile
          title="Total assets"
          value={summary?.kpis.assets ?? 0}
          valueLabel={formatHeadline(summary?.kpis.assets ?? 0)}
          delta={`at ${asAtDate}`}
          detail="what the business holds"
          tone="neutral"
        />
        <MetricTile
          title="Total liabilities"
          value={summary?.kpis.liabilities ?? 0}
          valueLabel={formatHeadline(summary?.kpis.liabilities ?? 0)}
          delta={gearing === null ? undefined : `${gearing}% of assets`}
          detail="what it owes"
          tone="warn"
        />
        <MetricTile
          title="Total equity"
          value={summary?.kpis.equity ?? 0}
          valueLabel={formatHeadline(summary?.kpis.equity ?? 0)}
          delta="assets less liabilities"
          detail="the owners' share"
          tone={(summary?.kpis.equity ?? 0) < 0 ? "danger" : "good"}
        />
        <MetricTile
          title="Net cash"
          value={summary?.kpis.netCash ?? 0}
          valueLabel={formatHeadline(summary?.kpis.netCash ?? 0)}
          delta={(summary?.kpis.netCash ?? 0) < 0 ? "cash went out" : "cash came in"}
          detail="movement over the period"
          tone={(summary?.kpis.netCash ?? 0) < 0 ? "warn" : "good"}
        />
        {/*
          The one tile that is a verdict rather than a figure.

          A trial balance difference is only ever interesting as "is it zero" —
          the number itself tells you nothing until it is not zero, and then
          the number is exactly what you need. So it prints the word when it
          balances and the difference when it does not, to the cent, because a
          difference rounded to the dollar can round itself out of existence.
        */}
        <MetricTile
          title="Trial balance"
          value={trialBalanceDifference}
          valueLabel={trialBalanceDifference === 0 ? "Balanced" : accountingFigure(trialBalanceDifference)}
          delta={trialBalanceDifference === 0 ? "0.00" : "out by"}
          detail={trialBalanceDifference === 0 ? "debits equal credits" : "debits less credits"}
          tone={trialBalanceDifference === 0 ? "good" : "danger"}
          href="/accounting/trial-balance"
        />
      </div>

      {/*
        The three statements, as statements.

        These were two donuts and an axis chart. A balance sheet is a set of
        figures that must add up, and a donut is the one shape that makes
        adding up impossible to check: you cannot read 184,620 off an arc, and
        with `--chart-*` unresolved every slice painted the same colour, so the
        ring showed nothing at all. Read as rows, each of these is the report
        it is named after.
      */}
      <div className="grid gap-2.5 xl:grid-cols-12">
        <ReportPanel className="xl:col-span-5" title="Profit and loss" note={periodLabel}>
          <ReportTable
            label="Profit and loss"
            tracks="minmax(0,1fr) 120px 90px"
            columns={[{ label: "" }, { label: "Amount", align: "right" }, { label: "%", align: "right" }]}
            rows={pnlRows}
            emptyLabel="No income or expense posted in this period."
          />
        </ReportPanel>

        <ReportPanel className="xl:col-span-4" title="Balance sheet" note={`at ${asAtDate}`}>
          <ReportTable
            label="Balance sheet"
            tracks="minmax(0,1fr) 120px"
            columns={[{ label: "" }, { label: "Amount", align: "right" }]}
            rows={balanceRows}
            emptyLabel="No balances to report."
          />
        </ReportPanel>

        <ReportPanel className="xl:col-span-3" title="Cash flow" note={periodLabel}>
          <ReportTable
            label="Cash flow"
            tracks="minmax(0,1fr) 110px"
            columns={[{ label: "" }, { label: "Amount", align: "right" }]}
            rows={cashRows}
            emptyLabel="No cash movement in this period."
          />
        </ReportPanel>
      </div>

      <ReportPanel title="Reports you can run">
        <ReportTable
          label="Available reports"
          tracks="minmax(0,1fr) 180px 160px"
          columns={[{ label: "Report" }, { label: "Covers" }, { label: "Basis" }]}
          rows={reportRows}
        />
      </ReportPanel>
    </AccountingShell>
  );
}
