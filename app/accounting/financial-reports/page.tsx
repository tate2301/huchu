"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { ReportPanel } from "@/components/ui/breakdown-panel";
import {
  ReportTable,
  amt,
  dim,
  nm,
  num,
  txt,
  type ReportRow,
} from "@/components/accounting/report-table";
import { TradingViewChartCard } from "@/components/charts/tradingview-chart-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AccountingNewButton } from "@/components/accounting/accounting-new-button";
import { Scale } from "@/lib/icons";
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

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Money the way a statement prints it: negatives in brackets, no minus sign.
 *
 * This is not decoration. In a right-aligned mono column a leading `-` sits at
 * the far left of the cell, several characters away from the digits and easy
 * to read straight past — which on a cash flow statement is the difference
 * between an inflow and an outflow.
 */
function accountingFigure(value: number) {
  const magnitude = formatCurrency(Math.abs(value));
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
   * Negatives print in brackets, which is the accounting convention and also
   * the only unambiguous one: a leading minus at the left edge of a
   * right-aligned mono column is easy to miss.
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

    const lines: ReportRow[] = [
      { id: "income", cells: [nm("Income"), amt(accountingFigure(income)), share(income)] },
    ];
    for (const item of summary?.charts.pnlBreakdown ?? []) {
      lines.push({
        id: `pnl-${item.label}`,
        cells: [txt(item.label, { indent: true }), amt(accountingFigure(item.amount)), share(item.amount)],
      });
    }
    lines.push({
      id: "expenses",
      cells: [nm("Expenses"), amt(accountingFigure(expenses)), share(expenses)],
    });
    lines.push({
      id: "net-income",
      emphasis: true,
      cells: [
        nm("Net income", { tone: net < 0 ? "bad" : "total" }),
        amt(accountingFigure(net), { tone: net < 0 ? "bad" : "total" }),
        income === 0
          ? dim()
          : num(`${Math.round((net / income) * 100)}`, { tone: net < 0 ? "bad" : "total", bold: true }),
      ],
    });
    return lines;
  }, [summary]);

  const balanceRows = useMemo<ReportRow[]>(() => {
    const k = summary?.kpis;
    const assets = k?.assets ?? 0;
    const liabilities = k?.liabilities ?? 0;
    const equity = k?.equity ?? 0;

    const lines: ReportRow[] = [];
    for (const item of summary?.charts.balanceComposition ?? []) {
      lines.push({
        id: `bs-${item.label}`,
        cells: [txt(item.label, { indent: true }), amt(accountingFigure(item.amount))],
      });
    }
    lines.push({ id: "assets", cells: [nm("Total assets"), amt(accountingFigure(assets))] });
    lines.push({
      id: "liabilities",
      cells: [nm("Total liabilities"), amt(accountingFigure(liabilities))],
    });
    lines.push({
      id: "equity",
      emphasis: true,
      cells: [nm("Equity", { tone: "total" }), amt(accountingFigure(equity), { tone: "total" })],
    });
    return lines;
  }, [summary]);

  const cashRows = useMemo<ReportRow[]>(() => {
    const net = summary?.kpis.netCash ?? 0;
    const lines: ReportRow[] = (summary?.charts.cashFlowComposition ?? []).map((item) => ({
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
   * balance sheet is always as-at and always accrual. `Last run` is
   * deliberately absent: nothing records it yet, and a column of "not yet run"
   * would be a worse lie than no column.
   */
  const reportRows = useMemo<ReportRow[]>(
    () => [
      {
        id: "trial-balance",
        href: "/accounting/trial-balance",
        cells: [
          nm("Trial balance"),
          txt(`At ${periodLabel}`, { tone: "subtle" }),
          txt("All accounts"),
          txt("PDF · XLSX", { align: "right", tone: "subtle" }),
        ],
      },
      {
        id: "vat",
        href: "/accounting/tax?view=vat-summary",
        cells: [
          nm("VAT summary"),
          txt(periodLabel, { tone: "subtle" }),
          txt("ZIMRA"),
          txt("PDF", { align: "right", tone: "subtle" }),
        ],
      },
      {
        id: "ar-aging",
        href: "/accounting/sales?view=aging",
        cells: [
          nm("AR ageing"),
          txt(`At ${periodLabel}`, { tone: "subtle" }),
          txt("By due bucket"),
          txt("PDF · XLSX", { align: "right", tone: "subtle" }),
        ],
      },
      {
        id: "ap-aging",
        href: "/accounting/purchases?view=aging",
        cells: [
          nm("AP ageing"),
          txt(`At ${periodLabel}`, { tone: "subtle" }),
          txt("By due bucket"),
          txt("PDF · XLSX", { align: "right", tone: "subtle" }),
        ],
      },
      {
        id: "customer-statements",
        href: "/accounting/sales?view=statements",
        cells: [
          nm("Customer statements"),
          txt(periodLabel, { tone: "subtle" }),
          txt("Per customer"),
          txt("PDF", { align: "right", tone: "subtle" }),
        ],
      },
      {
        id: "vendor-statements",
        href: "/accounting/purchases?view=statements",
        cells: [
          nm("Vendor statements"),
          txt(periodLabel, { tone: "subtle" }),
          txt("Per vendor"),
          txt("PDF", { align: "right", tone: "subtle" }),
        ],
      },
    ],
    [periodLabel],
  );


  return (
    <AccountingShell
      activeTab="financial-reports"
      title="Financial Reports"
      description="the statements, from one period selector"
      actions={
        <AccountingNewButton
          label="Open"
          items={[
            { label: "Trial Balance", icon: Scale, href: "/accounting/trial-balance" },
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
          <p className="mt-2 acct-caption">
            Branch filter is shown for planning consistency. Current accounting totals remain company-wide.
          </p>
        </CardContent>
      </Card>

      {/* Six figures, one strip — the whole position at a glance. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricTile
          title="Net income"
          value={summary?.kpis.netIncome ?? 0}
          valueLabel={accountingFigure(summary?.kpis.netIncome ?? 0)}
          delta={margin === null ? undefined : `${margin}% margin`}
          detail={periodLabel}
          tone={(summary?.kpis.netIncome ?? 0) < 0 ? "danger" : "good"}
        />
        <MetricTile
          title="Total assets"
          value={summary?.kpis.assets ?? 0}
          valueLabel={accountingFigure(summary?.kpis.assets ?? 0)}
          delta="at period end"
          detail="what the business holds"
          tone="neutral"
        />
        <MetricTile
          title="Total liabilities"
          value={summary?.kpis.liabilities ?? 0}
          valueLabel={accountingFigure(summary?.kpis.liabilities ?? 0)}
          delta={gearing === null ? undefined : `${gearing}% of assets`}
          detail="what it owes"
          tone="warn"
        />
        <MetricTile
          title="Total equity"
          value={summary?.kpis.equity ?? 0}
          valueLabel={accountingFigure(summary?.kpis.equity ?? 0)}
          delta="assets less liabilities"
          detail="the owners' share"
          tone={(summary?.kpis.equity ?? 0) < 0 ? "danger" : "good"}
        />
        <MetricTile
          title="Net cash"
          value={summary?.kpis.netCash ?? 0}
          valueLabel={accountingFigure(summary?.kpis.netCash ?? 0)}
          delta={(summary?.kpis.netCash ?? 0) < 0 ? "cash went out" : "cash came in"}
          detail="movement over the period"
          tone={(summary?.kpis.netCash ?? 0) < 0 ? "warn" : "good"}
        />
        {/*
          The one tile that is a verdict rather than a figure.

          A trial balance difference is only ever interesting as "is it zero" —
          the number itself tells you nothing until it is not zero, and then
          the number is exactly what you need. So it prints the word when it
          balances and the difference when it does not.
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
      <div className="grid gap-3 xl:grid-cols-12">
        <ReportPanel className="xl:col-span-5" title="Profit and loss" note={periodLabel}>
          <ReportTable
            label="Profit and loss"
            tracks="minmax(0,1fr) 120px 90px"
            columns={[{ label: "" }, { label: "Amount", align: "right" }, { label: "%", align: "right" }]}
            rows={pnlRows}
            emptyLabel="No income or expense posted in this period."
          />
        </ReportPanel>

        <ReportPanel className="xl:col-span-4" title="Balance sheet" note="at period end">
          <ReportTable
            label="Balance sheet"
            tracks="minmax(0,1fr) 120px"
            columns={[{ label: "" }, { label: "Amount", align: "right" }]}
            rows={balanceRows}
            emptyLabel="No balances to report."
          />
        </ReportPanel>

        <ReportPanel className="xl:col-span-3" title="Cash flow" note="movement">
          <ReportTable
            label="Cash flow"
            tracks="minmax(0,1fr) 110px"
            columns={[{ label: "" }, { label: "Amount", align: "right" }]}
            rows={cashRows}
            emptyLabel="No cash movement in this period."
          />
        </ReportPanel>
      </div>

      {/* A trend, so it stays a chart — this is the one thing here that is
          genuinely a shape over time rather than a set of parts. */}
      <TradingViewChartCard
        flat
        height={200}
        note="component against running total"
        title="Cash flow momentum"
        data={isLoading ? [] : chartData.cashRunRate}
        xKey="label"
        series={[
          { key: "amount", label: "Component", type: "bar", color: "var(--brand)" },
          { key: "cumulative", label: "Cumulative", type: "line", color: "var(--tone-success)" },
        ]}
        valueFormatter={formatCurrency}
      />

      <ReportPanel title="Reports" note="what you can run from here">
        <ReportTable
          label="Available reports"
          tracks="minmax(0,1fr) 200px 160px 130px"
          columns={[
            { label: "Report" },
            { label: "Covers" },
            { label: "Basis" },
            { label: "Format", align: "right" },
          ]}
          rows={reportRows}
        />
      </ReportPanel>
    </AccountingShell>
  );
}
