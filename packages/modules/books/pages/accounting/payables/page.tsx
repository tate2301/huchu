"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingShell } from "../../../components/accounting-shell";
import { BandChip } from "../../../components/band-chip";
import { GroupedLinkList, type HubLinkGroup } from "../../../components/hubs/grouped-link-list";
import { MetricTile } from "../../../components/hubs/metric-tile";
import {
  ReportTable,
  amt,
  nm,
  total,
  type CellTone,
  type ReportRow,
} from "@corelithzw/ui/components/report-table";
import {
  Breakdown,
  ReportPanel,
  type BreakdownRow,
} from "@corelithzw/ui/components/breakdown-panel";
import { TradingViewChartCard } from "@corelithzw/ui/charts/tradingview-chart-card";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { AccountingNewButton } from "../../../components/accounting-new-button";
import { Card, CardContent } from "@corelithzw/ui/components/card";
import { Input } from "@corelithzw/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { formatAmount, formatHeadline } from "../../../format";
import { fetchApAging, fetchPayablesHubSummary } from "../../../api-client";
import { fetchSites } from "@corelithzw/platform/client/sites";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Building2, FileText, Payments } from "@corelithzw/ui/lib/icons";

/**
 * One ageing bucket in the by-vendor table.
 *
 * A zero is printed rather than dashed. Every vendor carries all five buckets
 * whether or not there is money in them, so the column can be read straight
 * down; an em dash there would say "not reported" when what is true is
 * "nothing owed in this bucket". The severity ink only lands on a bucket that
 * actually holds money, which is what keeps a clean vendor's row from reading
 * as five warnings.
 */
function bucketCell(value: number, tone: CellTone) {
  return amt(formatAmount(value), { tone: value > 0 ? tone : "dim" });
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
    const rows = (apAging?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      notDue: row.current,
      days30: row.days30,
      days60: row.days60,
      days90: row.days90,
      days90Plus: row.days90Plus,
      open: row.total,
      overdue: row.days30 + row.days60 + row.days90 + row.days90Plus,
    }));
    return rows
      .filter((row) => row.open !== 0 || row.overdue !== 0)
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  }, [apAging]);

  /**
   * The foot of the table. Summed from the rows on screen rather than taken
   * from the summary KPIs, because the two are answers to different questions —
   * the KPIs honour the period filter, the ageing report is a position as at a
   * date — and a total that does not add up the column above it is worse than
   * no total at all.
   */
  const bucketTotals = useMemo(
    () =>
      vendorRows.reduce(
        (running, row) => ({
          notDue: running.notDue + row.notDue,
          days30: running.days30 + row.days30,
          days60: running.days60 + row.days60,
          days90: running.days90 + row.days90,
          days90Plus: running.days90Plus + row.days90Plus,
        }),
        { notDue: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0 },
      ),
    [vendorRows],
  );

  const vendorTableRows = useMemo<ReportRow[]>(() => {
    if (vendorRows.length === 0) return [];
    return [
      ...vendorRows.map((row) => ({
        id: row.id,
        cells: [
          nm(row.name),
          bucketCell(row.notDue, "strong"),
          bucketCell(row.days30, "warn"),
          bucketCell(row.days60, "warn"),
          bucketCell(row.days90, "bad"),
          bucketCell(row.days90Plus, "bad"),
        ],
      })),
      {
        id: "total",
        emphasis: true,
        cells: [
          nm("Total", { tone: "total" }),
          total(formatAmount(bucketTotals.notDue)),
          total(formatAmount(bucketTotals.days30)),
          total(formatAmount(bucketTotals.days60)),
          total(formatAmount(bucketTotals.days90)),
          total(formatAmount(bucketTotals.days90Plus)),
        ],
      },
    ];
  }, [vendorRows, bucketTotals]);

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
      bandSlot={
        <>
          <BandChip label="Open" value={formatHeadline(summary?.kpis.openBalance ?? 0)} tone="mute" />
          <BandChip
            label="Overdue"
            value={formatHeadline(summary?.kpis.overdueBalance ?? 0)}
            tone={(summary?.kpis.overdueBalance ?? 0) > 0 ? "bad" : "ok"}
          />
        </>
      }
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
          valueLabel={formatHeadline(summary?.kpis.openBalance ?? 0)}
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
          valueLabel={formatHeadline(summary?.kpis.overdueBalance ?? 0)}
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
          valueLabel={formatHeadline(summary?.kpis.receivedBillValue ?? 0)}
          delta={`${(summary?.kpis.receivedBillCount ?? 0).toLocaleString()} received`}
          detail="in the selected period"
          tone="neutral"
          href="/accounting/purchases?view=bills"
        />
        <MetricTile
          title="Paid, period"
          value={summary?.kpis.paidAmount ?? 0}
          valueLabel={formatHeadline(summary?.kpis.paidAmount ?? 0)}
          delta={settlementRate === null ? undefined : `${settlementRate}% of billed`}
          detail="paid to suppliers"
          tone="good"
          href="/accounting/purchases?view=payments"
        />
        <MetricTile
          title="Debit notes"
          value={summary?.kpis.debitNoteAmount ?? 0}
          valueLabel={formatHeadline(summary?.kpis.debitNoteAmount ?? 0)}
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
            formatValue={formatAmount}
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
          valueFormatter={formatAmount}
        />
      </div>

      {/* Who we owe it to, bucket by bucket. The ageing panel above answers
          "how old is the book"; this answers "whose", and it has to carry every
          bucket to do it — a single summed "overdue" figure cannot tell a
          vendor sitting one day past terms from one sitting a quarter past. */}
      <ReportPanel title="By vendor" note="worst first">
        <ReportTable
          label="Payables by vendor"
          tracks="minmax(0,1fr) 120px 120px 120px 120px 130px"
          columns={[
            { label: "Vendor" },
            { label: "Not due", align: "right" },
            { label: "1–30", align: "right" },
            { label: "31–60", align: "right" },
            { label: "61–90", align: "right" },
            { label: "Over 90", align: "right" },
          ]}
          rows={vendorTableRows}
          emptyLabel="Nothing outstanding on any vendor."
        />
      </ReportPanel>


      <GroupedLinkList groups={groups} />
    </AccountingShell>
  );
}
