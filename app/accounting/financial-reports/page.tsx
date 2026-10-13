"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Button, Empty, FigureStrip, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { COMMON_PRESETS, DateRangePicker } from "@/components/ui/date-picker";
import { formatAmount, formatHeadline } from "@/lib/accounting/format";
import { fetchFinancialReportsHubSummary, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { dayRangeWords, todayIn } from "@/lib/workspace/format";

/** A statement's line: its name, its amount, and (the P&L) its share of income. */
type Line = { id: string; name: string; amount: string; share?: string | null; total?: boolean; bad?: boolean };

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

/**
 * Books → Financial reports, on the kit: the period and branch, the six
 * figures, the three statements as statements, and the reports to run.
 * Listed under From Corelith and in Books' Reports from Books.
 */
export default function FinancialReportsHomePage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [branchId, setBranchId] = useState("all");

  const { data: branches } = useQuery({
    queryKey: ["sites", "accounting-branches"],
    queryFn: fetchSites,
  });

  const { data: summary, error, isPending, refetch } = useQuery({
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
  const pnlRows = useMemo<Line[]>(() => {
    const k = summary?.kpis;
    const income = k?.income ?? 0;
    const expenses = k?.expenses ?? 0;
    const net = k?.netIncome ?? 0;
    // The API returns expenses as a negative. Share-of-income is drawn from
    // the magnitude so the percentage column reads as a proportion rather
    // than as a negative share.
    const share = (value: number) => (income === 0 ? null : `${Math.round((Math.abs(value) / income) * 100)}`);

    return [
      { id: "income", name: "Income", amount: accountingFigure(income), share: share(income) },
      { id: "expenses", name: "Expenses", amount: accountingFigure(expenses), share: share(expenses) },
      {
        id: "net-income",
        name: "Net income",
        amount: accountingFigure(net),
        share: income === 0 ? null : `${Math.round((net / income) * 100)}`,
        total: true,
        bad: net < 0,
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
  const balanceRows = useMemo<Line[]>(() => {
    const k = summary?.kpis;
    const assets = k?.assets ?? 0;
    const liabilities = k?.liabilities ?? 0;
    const equity = k?.equity ?? 0;

    return [
      { id: "assets", name: "Total assets", amount: accountingFigure(assets) },
      { id: "liabilities", name: "Total liabilities", amount: accountingFigure(liabilities) },
      { id: "equity", name: "Equity", amount: accountingFigure(equity), total: true },
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
  const cashRows = useMemo<Line[]>(() => {
    const net = summary?.kpis.netCash ?? 0;
    const movements = (summary?.charts.cashFlowComposition ?? []).filter(
      (item) => item.label.trim().toLowerCase() !== "net cash",
    );
    const lines: Line[] = movements.map((item) => ({ id: `cf-${item.label}`, name: item.label, amount: accountingFigure(item.amount) }));
    lines.push({ id: "net-cash", name: "Net movement", amount: accountingFigure(net), total: true, bad: net < 0 });
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
  const reports = [
    { id: "profit-and-loss", name: "Profit and loss", href: "/accounting/financial-statements", covers: periodLabel, basis: "Accrual" },
    { id: "balance-sheet", name: "Balance sheet", href: "/accounting/financial-statements", covers: `At ${asAtDate}`, basis: "Accrual" },
    { id: "cash-flow", name: "Cash flow", href: "/accounting/financial-statements", covers: periodLabel, basis: "Indirect" },
    { id: "trial-balance", name: "Trial balance", href: "/accounting/trial-balance", covers: `At ${asAtDate}`, basis: "All accounts" },
    { id: "vat", name: "VAT return", href: "/books/vat", covers: periodLabel, basis: "ZIMRA" },
  ];

  const primary = useMemo(
    () => ({ label: "Run a report", icon: "run" as const, menu: reports.map((report) => ({ label: report.name, href: report.href })) }),
    // The shelf's addresses never change; only its words do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const range = { from: startDate || null, to: endDate || null };
  const words = dayRangeWords(range, todayIn()) || "Any time";
  const branch = (branches ?? []).find((entry) => entry.id === branchId) ?? null;

  const statement = (title: string, note: string, lines: Line[], share: boolean, empty: string) => (
    <section className="kblock rp-block">
      <div className="kblock-h">
        <h3>{title}</h3>
        <span className="sum">{note}</span>
      </div>
      {lines.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="wt" style={{ flex: "none" }}>
          <table className="table">
            <colgroup>
              <col style={{ width: "100%" }} />
              <col />
              {share ? <col /> : null}
            </colgroup>
            <thead>
              <tr>
                <th>Line</th>
                <th className="num">Amount</th>
                {share ? <th className="num">%</th> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} style={line.total ? { fontWeight: 600 } : undefined}>
                  <td className="fill" style={line.bad ? { color: "var(--color-danger)" } : undefined}>
                    {line.name}
                  </td>
                  <td className="num mono" style={line.bad ? { color: "var(--color-danger)" } : undefined}>
                    {line.amount}
                  </td>
                  {share ? <td className="num muted">{line.share ?? "—"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const k = summary?.kpis;
  const figures = [
    { label: "Net income", value: formatHeadline(k?.netIncome ?? 0), note: margin === null ? periodLabel : `${margin}% margin`, tone: (k?.netIncome ?? 0) < 0 ? ("danger" as const) : undefined },
    { label: "Total assets", value: formatHeadline(k?.assets ?? 0), note: `at ${asAtDate}` },
    { label: "Total liabilities", value: formatHeadline(k?.liabilities ?? 0), note: gearing === null ? "what it owes" : `${gearing}% of assets` },
    { label: "Total equity", value: formatHeadline(k?.equity ?? 0), note: "assets less liabilities", tone: (k?.equity ?? 0) < 0 ? ("danger" as const) : undefined },
    { label: "Net cash", value: formatHeadline(k?.netCash ?? 0), note: (k?.netCash ?? 0) < 0 ? "cash went out" : "cash came in" },
    {
      label: "Trial balance",
      // The one figure that is a verdict: the word when it balances, the difference to the cent when it does not.
      value: trialBalanceDifference === 0 ? "Balanced" : accountingFigure(trialBalanceDifference),
      note: trialBalanceDifference === 0 ? "debits equal credits" : "debits less credits",
      tone: trialBalanceDifference === 0 ? ("success" as const) : ("danger" as const),
    },
  ];

  return (
    <>
      <PageChrome title="Financial reports" primary={primary} />
      <Kit className="kit-main">
        <div className="mn" style={{ flex: 1, minHeight: 0 }}>
          <div className="kbody">
            <div className="ws-tools" style={{ flexWrap: "wrap" }}>
              <DateRangePicker
                openEnded
                presets={COMMON_PRESETS}
                title="Period"
                value={range}
                onChange={(next) => {
                  setStartDate(next.from ?? "");
                  setEndDate(next.to ?? "");
                }}
                trigger={
                  <Button icon="calendar" className={startDate || endDate ? "chipsel is-set" : "chipsel"} aria-label={`Period: ${words}`}>
                    {words}
                  </Button>
                }
              />
              <MenuButton
                className={branch ? "chipsel is-set" : "chipsel"}
                icon="filter"
                label="Branch"
                items={[
                  { key: "all", label: "Every branch", checked: !branch, onSelect: () => setBranchId("all") },
                  ...(branches ?? []).map((entry) => ({ key: entry.id, label: entry.name, checked: entry.id === branchId, onSelect: () => setBranchId(entry.id) })),
                ]}
              >
                {branch?.name ?? "Every branch"}
              </MenuButton>
              <span className="ws-n">The totals are the whole company&rsquo;s; a branch does not narrow them yet.</span>
            </div>
            {error ? (
              <Empty
                icon="warn"
                title={typeof navigator !== "undefined" && !navigator.onLine ? "You are offline" : "The statements did not load"}
                action={
                  <Button icon="history" onClick={() => void refetch()}>
                    Try again
                  </Button>
                }
              >
                {getApiErrorMessage(error)} The statements are for whoever keeps the books; the owner can tell you who that is.
              </Empty>
            ) : isPending ? (
              <div aria-busy="true" aria-label="Loading" style={{ padding: "16px 24px", display: "grid", gap: 12 }}>
                <div className="skeleton" style={{ height: 76 }} />
                <div className="skeleton" style={{ height: 220 }} />
              </div>
            ) : (
              <>
                <div style={{ padding: "16px 24px 8px" }}>
                  <FigureStrip figures={figures} />
                </div>
                <div className="cm-grid2 rp-grid2" style={{ boxShadow: "inset 0 1px 0 var(--color-line)" }}>
                  <div>{statement("Profit and loss", periodLabel, pnlRows, true, "No income or expense posted in this period.")}</div>
                  <div>
                    {statement("Balance sheet", `at ${asAtDate}`, balanceRows, false, "No balances to report.")}
                    {statement("Cash flow", periodLabel, cashRows, false, "No cash movement in this period.")}
                  </div>
                </div>
                <div className="wt" style={{ flex: "none" }}>
                  <table className="table">
                    <colgroup>
                      <col style={{ width: "100%" }} />
                      <col />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Report</th>
                        <th>Covers</th>
                        <th>Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report.id}>
                          <td className="fill">
                            <Link href={report.href} className="link">
                              {report.name}
                            </Link>
                          </td>
                          <td className="muted nowrap">{report.covers}</td>
                          <td className="nowrap">{report.basis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </Kit>
    </>
  );
}
