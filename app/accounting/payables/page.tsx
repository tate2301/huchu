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
import { fetchApAging, fetchPayablesHubSummary, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Building2, FileText, Payments } from "@/lib/icons";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PayablesHomePage() {
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
    queryKey: ["accounting", "hubs", "payables", startDate, endDate, branchId],
    queryFn: () =>
      fetchPayablesHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
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
    const trend = (summary?.charts.paymentsTrend ?? []).map((item) => ({
      date: item.date,
      billed: item.billed,
      paid: item.paid,
    }));

    return { aging, status, trend };
  }, [summary]);

  /**
   * Ageing buckets, tinted by severity. Matched on the label rather than on
   * position — the API may omit empty buckets, and position would then tint the
   * wrong row. Unrecognised buckets stay neutral.
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
   * The book, vendor by vendor — read from the AP ageing report rather than
   * from a second endpoint, so the closing table and the ageing panel above it
   * cannot disagree. See the AR report for the reasoning.
   */
  const { data: apAging } = useQuery({
    queryKey: ["accounting", "reports", "ap-aging", endDate],
    queryFn: () => fetchApAging(endDate ? { asOf: endDate } : {}),
  });

  const vendorRows = useMemo(() => {
    const rows = (apAging?.rows ?? []).map((row) => {
      const overdue = row.days30 + row.days60 + row.days90 + row.days90Plus;
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
  }, [apAging]);

  /**
   * Ratios, null when there is no denominator — see the AR report. A tenant
   * with no bills received has no settlement rate, and "0% of billed" would
   * report a problem that does not exist.
   */
  const overdueShare = useMemo(() => {
    const open = summary?.kpis.openBalance ?? 0;
    const overdue = summary?.kpis.overdueBalance ?? 0;
    if (open <= 0) return null;
    return Math.round((overdue / open) * 100);
  }, [summary]);

  const settlementRate = useMemo(() => {
    const billed = summary?.kpis.receivedBillValue ?? 0;
    const paid = summary?.kpis.paidAmount ?? 0;
    if (billed <= 0) return null;
    return Math.round((paid / billed) * 100);
  }, [summary]);

  const groups = useMemo<HubLinkGroup[]>(
    () => [
      {
        group: "Payables Operations",
        items: [
          {
            id: "vendors",
            label: "Vendors",
            description: "Supplier master and contact profiles.",
            href: "/accounting/purchases?view=vendors",
            tag: "Master",
          },
          {
            id: "bills",
            label: "Bills",
            description: "Receive and manage vendor bills.",
            href: "/accounting/purchases?view=bills",
            tag: "Transaction",
          },
          {
            id: "payments",
            label: "Payments",
            description: "Track outgoing supplier payments.",
            href: "/accounting/purchases?view=payments",
            tag: "Cash",
          },
          {
            id: "debits",
            label: "Debit Notes",
            description: "Record upward adjustments on payables.",
            href: "/accounting/purchases?view=debit-notes",
            tag: "Adjustment",
          },
          {
            id: "writeoffs",
            label: "Write-offs",
            description: "Post approved AP write-offs.",
            href: "/accounting/purchases?view=write-offs",
            tag: "Adjustment",
          },
        ],
      },
      {
        group: "Payables Reporting",
        items: [
          {
            id: "ap-aging",
            label: "AP Aging",
            description: "Outstanding liabilities by due bucket.",
            href: "/accounting/purchases?view=aging",
            tag: "Report",
          },
          {
            id: "statements",
            label: "Vendor Statements",
            description: "Vendor statement movement and balances.",
            href: "/accounting/purchases?view=statements",
            tag: "Report",
          },
        ],
      },
    ],
    [],
  );

  return (
    <AccountingShell
      activeTab="ap-report"
      title="AP Report"
      description="the payables book — what was a separate summary tab"
      actions={
        <AccountingNewButton
          items={[
            { label: "New Vendor", icon: Building2, href: "/accounting/purchases?action=new-vendor" },
            { label: "New Bill", icon: FileText, href: "/accounting/purchases?action=new-bill" },
            { label: "New Payment", icon: Payments, href: "/accounting/purchases?action=new-payment" },
          ]}
        />
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load payables summary</AlertTitle>
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

      {/* Five figures, one strip — the whole AP position at a glance. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricTile
          title="Open AP"
          value={summary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(summary?.kpis.openBalance ?? 0)}
          delta={`${(summary?.kpis.receivedBillCount ?? 0).toLocaleString()} bills`}
          detail={
            vendorRows.length > 0
              ? `across ${vendorRows.length} vendor${vendorRows.length === 1 ? "" : "s"}`
              : "nothing outstanding"
          }
          tone="neutral"
          href="/accounting/purchases?view=bills"
        />
        <MetricTile
          title="Overdue AP"
          value={summary?.kpis.overdueBalance ?? 0}
          valueLabel={formatCurrency(summary?.kpis.overdueBalance ?? 0)}
          delta={overdueShare === null ? undefined : `${overdueShare}% of the book`}
          detail={
            (summary?.kpis.overdueBalance ?? 0) > 0 ? "past its terms" : "all within terms"
          }
          tone={(summary?.kpis.overdueBalance ?? 0) > 0 ? "danger" : "good"}
          href="/accounting/purchases?view=aging"
        />
        <MetricTile
          title="Billed, period"
          value={summary?.kpis.receivedBillValue ?? 0}
          valueLabel={formatCurrency(summary?.kpis.receivedBillValue ?? 0)}
          delta={`${(summary?.kpis.receivedBillCount ?? 0).toLocaleString()} received`}
          detail="in the selected period"
          tone="neutral"
          href="/accounting/purchases?view=bills"
        />
        <MetricTile
          title="Paid, period"
          value={summary?.kpis.paidAmount ?? 0}
          valueLabel={formatCurrency(summary?.kpis.paidAmount ?? 0)}
          delta={settlementRate === null ? undefined : `${settlementRate}% of billed`}
          detail="paid to suppliers"
          tone="good"
          href="/accounting/purchases?view=payments"
        />
        <MetricTile
          title="Debit notes"
          value={summary?.kpis.debitNoteAmount ?? 0}
          valueLabel={formatCurrency(summary?.kpis.debitNoteAmount ?? 0)}
          detail="raised against bills"
          tone={(summary?.kpis.debitNoteAmount ?? 0) > 0 ? "warn" : "neutral"}
          href="/accounting/purchases?view=debit-notes"
        />
      </div>

      {/* Ageing and status as figures, not pictures — see the AR report. */}
      <div className="grid gap-3 xl:grid-cols-12">
        <ReportPanel className="xl:col-span-4" title="Ageing" note="where the balance sits">
          <Breakdown
            rows={agingRows}
            formatValue={formatCurrency}
            emptyLabel="Nothing outstanding in this period."
          />
        </ReportPanel>

        <ReportPanel className="xl:col-span-4" title="Bill status" note="by document status">
          <Breakdown
            rows={statusRows}
            formatValue={(value) => value.toLocaleString()}
            emptyLabel="No bills received in this period."
          />
        </ReportPanel>

        {/* Same two fixes as the AR report: panel chrome rather than the
            gradient card, and series colours that resolve — `--chart-4` and
            `--chart-2` are not tokens in this design system, so both lines
            painted the same unset colour. */}
        <TradingViewChartCard
          flat
          height={132}
          className="xl:col-span-4"
          title="Settlement momentum"
          note="billed against paid"
          data={isLoading ? [] : chartData.trend}
          xKey="date"
          xAxisType="time"
          series={[
            { key: "billed", label: "Billed", type: "area", color: "var(--brand-300)" },
            { key: "paid", label: "Paid", type: "line", color: "var(--brand)" },
          ]}
          valueFormatter={formatCurrency}
        />
      </div>

      {/* Who we owe it to — the mirror of the AR report's closing table. */}
      <ReportPanel title="By vendor" note="worst first">
        {vendorRows.length === 0 ? (
          <p className="px-[13px] py-4 text-sm text-[var(--text-muted)]">
            Nothing outstanding on any vendor.
          </p>
        ) : (
          <div role="table" aria-label="Payables by vendor">
            <div
              role="row"
              className="grid grid-cols-[minmax(0,1fr)_130px_120px_120px] items-center border-b border-[var(--border)] bg-[var(--table-header-bg)] acct-col-head px-[13px] py-1.5"
            >
              <span role="columnheader">Vendor</span>
              <span role="columnheader" className="text-right">Open</span>
              <span role="columnheader" className="text-right">Overdue</span>
              <span role="columnheader" className="text-right">Oldest</span>
            </div>
            {vendorRows.map((row) => (
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
