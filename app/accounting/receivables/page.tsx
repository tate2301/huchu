"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { GroupedLinkList, type HubLinkGroup } from "@/components/accounting/hubs/grouped-link-list";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import {
  Breakdown,
  ReportPanel,
  type BreakdownRow,
} from "@/components/ui/breakdown-panel";
import { TradingViewChartCard } from "@/components/charts/tradingview-chart-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AccountingNewButton } from "@/components/accounting/accounting-new-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchArAging, fetchReceivablesHubSummary, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { NoteAdd, ReceiptLong, UserPlus } from "@/lib/icons";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReceivablesHomePage() {
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
    queryKey: ["accounting", "hubs", "receivables", startDate, endDate, branchId],
    queryFn: () =>
      fetchReceivablesHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  /**
   * The book, customer by customer.
   *
   * The hub summary is totals only, and the design's closing table is the one
   * part of this report that names who owes the money — which is the part
   * somebody acts on. The AR ageing report already computes exactly that per
   * customer, so this reads it rather than adding a second endpoint that would
   * have to be kept agreeing with the first.
   */
  const { data: arAging } = useQuery({
    queryKey: ["accounting", "reports", "ar-aging", endDate],
    queryFn: () => fetchArAging(endDate ? { asOf: endDate } : {}),
  });

  const chartData = useMemo(() => {
    const aging = (summary?.charts.aging ?? []).map((item) => ({
      bucket: item.bucket,
      amount: item.amount,
    }));
    const status = (summary?.charts.statusBreakdown ?? []).map((item) => ({
      status: item.status,
      count: item.count,
    }));
    const trend = (summary?.charts.collectionsTrend ?? []).map((item) => ({
      date: item.date,
      invoiced: item.invoiced,
      collected: item.collected,
    }));

    return { aging, status, trend };
  }, [summary]);

  /**
   * Ageing buckets, tinted by how bad they are.
   *
   * Matched on the bucket label rather than on position, because the API is
   * free to return fewer buckets when they are empty and position would then
   * tint the wrong row green. Anything unrecognised stays neutral — a bucket we
   * do not know the severity of should not be given one.
   */
  const agingRows = useMemo<BreakdownRow[]>(
    () =>
      chartData.aging.map((item) => {
        const key = item.bucket.toLowerCase();
        const tone: BreakdownRow["tone"] =
          key.includes("not due") || key.includes("current")
            ? "good"
            : /(^|\D)(61|90)/.test(key) || key.includes("over")
              ? "danger"
              : /(^|\D)(31|60)/.test(key)
                ? "warn"
                : "neutral";
        return { label: item.bucket, amount: item.amount, tone };
      }),
    [chartData.aging],
  );

  const statusRows = useMemo<BreakdownRow[]>(
    () =>
      chartData.status.map((item) => {
        const key = item.status.toUpperCase();
        const tone: BreakdownRow["tone"] =
          key === "PAID"
            ? "good"
            : key === "OVERDUE"
              ? "danger"
              : key === "VOIDED" || key === "DRAFT"
                ? "warn"
                : "neutral";
        return {
          label: key.charAt(0) + key.slice(1).toLowerCase(),
          amount: item.count,
          display: item.count.toLocaleString(),
          tone,
        };
      }),
    [chartData.status],
  );

  /**
   * Worst first — the design's ordering, and the only one that makes the table
   * worth putting last on the page. Sorted on what is overdue rather than on
   * what is open, because a large balance inside its terms is a healthy
   * customer and a small one past 90 days is a problem.
   */
  const customerRows = useMemo(() => {
    const rows = (arAging?.rows ?? []).map((row) => {
      const overdue = row.days30 + row.days60 + row.days90 + row.days90Plus;
      // The oldest bucket carrying anything. Read from the far end so a
      // customer sitting in two buckets is reported by the worse one.
      const oldest =
        row.days90Plus > 0
          ? { label: "Over 90", tone: "bad" as const }
          : row.days90 > 0
            ? { label: "61–90", tone: "bad" as const }
            : row.days60 > 0
              ? { label: "31–60", tone: "warn" as const }
              : row.days30 > 0
                ? { label: "1–30", tone: "warn" as const }
                : { label: "—", tone: "mute" as const };
      return { id: row.id, name: row.name, open: row.total, overdue, oldest };
    });
    return rows
      .filter((row) => row.open !== 0 || row.overdue !== 0)
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  }, [arAging]);

  /**
   * The two figures on the KPI strip that are ratios rather than totals.
   *
   * Both return null rather than 0 when the denominator is zero. A tenant with
   * no invoices raised has no collection rate — printing "0% of invoiced"
   * there states a failure that has not happened, and the tile drops the delta
   * line instead.
   */
  const overdueShare = useMemo(() => {
    const open = summary?.kpis.openBalance ?? 0;
    const overdue = summary?.kpis.overdueBalance ?? 0;
    if (open <= 0) return null;
    return Math.round((overdue / open) * 100);
  }, [summary]);

  const collectionRate = useMemo(() => {
    const invoiced = summary?.kpis.issuedInvoiceValue ?? 0;
    const collected = summary?.kpis.collectedAmount ?? 0;
    if (invoiced <= 0) return null;
    return Math.round((collected / invoiced) * 100);
  }, [summary]);

  const groups = useMemo<HubLinkGroup[]>(
    () => [
      {
        group: "Receivables Operations",
        items: [
          {
            id: "customers",
            label: "Customers",
            description: "Customer master records and profiles.",
            href: "/accounting/sales?view=customers",
            tag: "Master",
          },
          {
            id: "invoices",
            label: "Invoices",
            description: "Issue and manage customer invoices.",
            href: "/accounting/sales?view=invoices",
            tag: "Transaction",
          },
          {
            id: "receipts",
            label: "Receipts",
            description: "Track incoming customer payments.",
            href: "/accounting/sales?view=receipts",
            tag: "Cash",
          },
          {
            id: "credits",
            label: "Credit Notes",
            description: "Adjust and reverse invoiced amounts.",
            href: "/accounting/sales?view=credit-notes",
            tag: "Adjustment",
          },
          {
            id: "writeoffs",
            label: "Write-offs",
            description: "Record bad debt and approved write-offs.",
            href: "/accounting/sales?view=write-offs",
            tag: "Adjustment",
          },
        ],
      },
      {
        group: "Receivables Reporting",
        items: [
          {
            id: "ar-aging",
            label: "AR Aging",
            description: "Outstanding balances by aging bucket.",
            href: "/accounting/sales?view=aging",
            tag: "Report",
          },
          {
            id: "statements",
            label: "Customer Statements",
            description: "Statement history and running balances.",
            href: "/accounting/sales?view=statements",
            tag: "Report",
          },
        ],
      },
    ],
    [],
  );

  return (
    <AccountingShell
      activeTab="ar-report"
      title="AR Report"
      description="the receivables book — what was a separate summary tab"
      actions={
        <AccountingNewButton
          items={[
            { label: "New Customer", icon: UserPlus, href: "/accounting/sales?action=new-customer" },
            { label: "New Invoice", icon: NoteAdd, href: "/accounting/sales?action=new-invoice" },
            { label: "New Receipt", icon: ReceiptLong, href: "/accounting/sales?action=new-receipt" },
          ]}
        />
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load receivables summary</AlertTitle>
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

      {/* Five figures, one strip — the whole AR position at a glance. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricTile
          title="Open AR"
          value={summary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(summary?.kpis.openBalance ?? 0)}
          delta={`${(summary?.kpis.issuedInvoiceCount ?? 0).toLocaleString()} invoices`}
          detail={
            customerRows.length > 0
              ? `across ${customerRows.length} customer${customerRows.length === 1 ? "" : "s"}`
              : "nothing outstanding"
          }
          tone="neutral"
          href="/accounting/sales?view=invoices"
        />
        <MetricTile
          title="Overdue AR"
          value={summary?.kpis.overdueBalance ?? 0}
          valueLabel={formatCurrency(summary?.kpis.overdueBalance ?? 0)}
          delta={
            overdueShare === null ? undefined : `${overdueShare}% of the book`
          }
          detail={
            (summary?.kpis.overdueBalance ?? 0) > 0
              ? "past its terms"
              : "all within terms"
          }
          tone={(summary?.kpis.overdueBalance ?? 0) > 0 ? "danger" : "good"}
          href="/accounting/sales?view=aging"
        />
        <MetricTile
          title="Invoiced, period"
          value={summary?.kpis.issuedInvoiceValue ?? 0}
          valueLabel={formatCurrency(summary?.kpis.issuedInvoiceValue ?? 0)}
          delta={`${(summary?.kpis.issuedInvoiceCount ?? 0).toLocaleString()} raised`}
          detail="in the selected period"
          tone="neutral"
          href="/accounting/sales?view=invoices"
        />
        <MetricTile
          title="Collected, period"
          value={summary?.kpis.collectedAmount ?? 0}
          valueLabel={formatCurrency(summary?.kpis.collectedAmount ?? 0)}
          delta={collectionRate === null ? undefined : `${collectionRate}% of invoiced`}
          detail="receipts banked"
          tone="good"
          href="/accounting/sales?view=receipts"
        />
        <MetricTile
          title="Credit notes"
          value={summary?.kpis.creditNoteAmount ?? 0}
          valueLabel={formatCurrency(summary?.kpis.creditNoteAmount ?? 0)}
          detail="raised against invoices"
          tone={(summary?.kpis.creditNoteAmount ?? 0) > 0 ? "warn" : "neutral"}
          href="/accounting/sales?view=credit-notes"
        />
      </div>

      {/*
        Ageing and status, as figures rather than as pictures.

        Both were charts: an axis chart for ageing and a donut for status. An
        ageing report is read to the dollar — which bucket, how much, is it
        worse than last month — and neither shape lets you do that without a
        legend and a hover. The donut had a harder problem still: its palette
        did not resolve, so every slice painted the same colour and the whole
        ring carried no information.
      */}
      <div className="grid gap-3 xl:grid-cols-12">
        <ReportPanel className="xl:col-span-4" title="Ageing" note="where the balance sits">
          <Breakdown
            rows={agingRows}
            formatValue={formatCurrency}
            emptyLabel="Nothing outstanding in this period."
          />
        </ReportPanel>

        <ReportPanel className="xl:col-span-4" title="Invoice status" note="by document status">
          <Breakdown
            rows={statusRows}
            formatValue={(value) => value.toLocaleString()}
            emptyLabel="No invoices issued in this period."
          />
        </ReportPanel>

        {/*
          Collections momentum keeps its axis, and it is the only thing on this
          page that does. Ageing and status are parts of a whole, read to the
          dollar; this is one measure over six months, where the shape is the
          point and the individual months are not.

          Its two series used to be `hsl(var(--chart-3))` and
          `hsl(var(--chart-2))` — tokens this design system does not define, so
          both lines resolved to the same unset colour and the legend was the
          only thing telling them apart.
        */}
        <TradingViewChartCard
          flat
          height={132}
          className="xl:col-span-4"
          title="Collections momentum"
          note="invoiced against collected"
          data={isLoading ? [] : chartData.trend}
          xKey="date"
          xAxisType="time"
          series={[
            { key: "invoiced", label: "Invoiced", type: "area", color: "var(--brand-300)" },
            { key: "collected", label: "Collected", type: "line", color: "var(--brand)" },
          ]}
          valueFormatter={formatCurrency}
        />
      </div>

      {/*
        Who owes it. Every figure above this is a total; this is the one panel
        that names a customer, which is why the design puts it last and full
        width — you read the position, then you read who to ring.
      */}
      <ReportPanel title="By customer" note="worst first">
        {customerRows.length === 0 ? (
          <p className="px-[13px] py-4 text-sm text-[var(--text-muted)]">
            Nothing outstanding on any customer.
          </p>
        ) : (
          <div role="table" aria-label="Receivables by customer">
            <div
              role="row"
              className="grid grid-cols-[minmax(0,1fr)_130px_120px_120px] items-center border-b border-[var(--border)] bg-[var(--table-header-bg)] acct-col-head px-[13px] py-1.5"
            >
              <span role="columnheader">Customer</span>
              <span role="columnheader" className="text-right">Open</span>
              <span role="columnheader" className="text-right">Overdue</span>
              <span role="columnheader" className="text-right">Oldest</span>
            </div>
            {customerRows.map((row) => (
              <div
                role="row"
                key={row.id}
                className="grid min-h-9 grid-cols-[minmax(0,1fr)_130px_120px_120px] items-center border-b border-[var(--table-divider)] px-[13px] hover:bg-[var(--canvas)]"
              >
                <span role="cell" className="truncate pr-3 text-sm font-semibold text-[var(--text-strong)]">
                  {row.name}
                </span>
                <span role="cell" className="text-right font-mono text-sm font-semibold tabular-nums text-[var(--text-strong)]">
                  {formatCurrency(row.open)}
                </span>
                <span
                  role="cell"
                  className={cn(
                    "text-right font-mono text-sm font-semibold tabular-nums",
                    row.overdue > 0 ? "text-[var(--badge-bad-fg)]" : "text-[var(--text-subtle)]",
                  )}
                >
                  {formatCurrency(row.overdue)}
                </span>
                <span role="cell" className="text-right">
                  {row.oldest.tone === "mute" ? (
                    <span className="font-mono text-sm text-[var(--text-subtle)]">—</span>
                  ) : (
                    <span className="acct-badge" data-tone={row.oldest.tone}>
                      {row.oldest.label}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </ReportPanel>

      <GroupedLinkList groups={groups} />
    </AccountingShell>
  );
}
