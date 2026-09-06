"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Alert,
  EmptyState,
  SegmentedControl,
  Skeleton,
  StatCard,
} from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { PageActions } from "@/components/layout/page-chrome";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Check, Grid3x3, Plus, RotateCcw } from "@corelithzw/ui/lib/icons";
import { formatMoney } from "@/components/crm/documents/document-types";
import {
  REPORT_RANGES,
  REPORT_RANGE_LABELS,
  biggestLeak,
  formatRate,
  type GroupedPerformance,
  type ReportRange,
  type ShareSlice,
} from "@/lib/crm/reports";
import type { OverviewScope, WidgetInstance } from "@/lib/crm/widgets";

import { WidgetGrid } from "../widgets/widget-grid";
import {
  FunnelChart,
  GroupedBarChart,
  SharePie,
  TrendChart,
  type FunnelStageWithDwell,
} from "./report-charts";
import { ReportCard, type ReportEntity } from "./report-card";
import { MobileRow, MobileRows } from "../records/mobile-rows";

type SeriesBucket = { period: string; count: number; value: number };

type ReportResponse = {
  range: ReportRange;
  scope: "TEAM" | "MINE";
  funnel: FunnelStageWithDwell[];
  counts: { won: number; lost: number; open: number };
  winRate: number;
  medianCycleDays: number | null;
  forecast: { weighted: number; unweighted: number; count: number; estimated: number };
  byOwner: GroupedPerformance[];
  bySource: GroupedPerformance[];
  sourceShare: ShareSlice[];
  trend: { granularity: "day" | "week"; won: SeriesBucket[]; created: SeriesBucket[] };
  activity: { period: string; count: number }[];
  leads: { created: number; converted: number };
};

type LayoutResponse = {
  scope: OverviewScope;
  widgets: WidgetInstance[];
  isCustomised: boolean;
};

/**
 * The sales reports, as a page somebody owns.
 *
 * Every card is a report and every report says which records it counted, so
 * "win rate" is never ambiguous between deals and leads. The arrangement is
 * saved per person the same way the overview is — the reason a reporting page
 * gets ignored is usually that the one number somebody actually watches is
 * three scrolls down.
 *
 * One fetch feeds every card. They are all cuts of the same period over the
 * same deals, and separate requests would let two cards on one screen disagree
 * about what "last 90 days" means.
 */
export function ReportsContent({ currency = "USD" }: { currency?: string }) {
  const scope: OverviewScope = "REPORTS";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [range, setRange] = useState<ReportRange>("90d");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<WidgetInstance[] | null>(null);

  const layoutQuery = useQuery({
    queryKey: ["crm", "overview-layout", scope],
    queryFn: () => fetchJson<LayoutResponse>(`/api/v2/crm/overview-layout?scope=${scope}`),
  });

  const reportQuery = useQuery({
    queryKey: ["crm-reports", range],
    queryFn: () => fetchJson<ReportResponse>(`/api/v2/crm/reports?range=${range}`),
  });

  const save = useMutation({
    mutationFn: (widgets: WidgetInstance[]) =>
      fetchJson<LayoutResponse>("/api/v2/crm/overview-layout", {
        method: "PUT",
        body: JSON.stringify({ scope, widgets }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(["crm", "overview-layout", scope], result);
      setEditing(false);
      setAdding(false);
      setDraft(null);
      toast({ title: "Reports saved" });
    },
    onError: (error) =>
      toast({
        title: "Could not save the page",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const report = reportQuery.data;
  const widgets = draft ?? layoutQuery.data?.widgets ?? [];

  // Every card shares one query, so a card-level refresh refetches that query.
  // Honest, and better than a per-card spinner over data that cannot move
  // independently.
  const refresh = () => reportQuery.refetch();

  const money = (value: number) => formatMoney(value, currency);

  if (layoutQuery.isLoading || reportQuery.isLoading) {
    return (
      <div className="grid grid-cols-12 gap-4" aria-busy="true">
        {["col-span-12", "lg:col-span-8", "lg:col-span-4", "lg:col-span-8", "lg:col-span-4"].map(
          (span, index) => (
            <Skeleton key={index} height={160} className={`col-span-12 ${span}`} />
          ),
        )}
      </div>
    );
  }

  if (reportQuery.error) {
    return (
      <Alert tone="danger" title="Couldn't build the report">
        {getApiErrorMessage(reportQuery.error)}
      </Alert>
    );
  }

  if (!report) return null;

  const renderReport = (instance: WidgetInstance) =>
    renderReportCard(instance.type, {
      report,
      money,
      refresh,
      refreshing: reportQuery.isFetching,
      onRemove: editing
        ? () => setDraft(widgets.filter((widget) => widget.id !== instance.id))
        : undefined,
    });

  return (
    <div className="space-y-4">
      <PageActions>
        {editing ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setAdding(false);
                setDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add report
            </Button>
            <Button onClick={() => save.mutate(widgets)} disabled={save.isPending}>
              <Check className="size-4" />
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={refresh} disabled={reportQuery.isFetching}>
              <RotateCcw
                className={reportQuery.isFetching ? "size-4 animate-spin" : "size-4"}
              />
              Refresh data
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(true);
                setAdding(true);
              }}
            >
              <Plus className="size-4" />
              Add report
            </Button>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Grid3x3 className="size-4" />
              Rearrange
            </Button>
          </>
        )}
      </PageActions>

      {/* The description lives here rather than in the top app bar, which
          carries a title and nothing else on every page in the product —
          giving one page a subtitle up there would make the bar a different
          height on that page alone. */}
      <p className="text-sm text-[var(--text-muted)]">
        How the pipeline is actually performing over a period you choose. Every card says
        which records it counted; rearrange them and the arrangement is yours.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* "Last 12 months" and its neighbours run past 400px together, so on
            a phone the control scrolls inside its own rail rather than
            stretching the page. */}
        <div className="scroll-rail max-w-full overflow-x-auto">
          <SegmentedControl
            options={REPORT_RANGES.map((value) => ({ value, label: REPORT_RANGE_LABELS[value] }))}
            value={range}
            onValueChange={(value) => setRange(value as ReportRange)}
            aria-label="Reporting period"
          />
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          {report.scope === "TEAM"
            ? "Everyone's numbers"
            : "Your deals only — a manager sees the whole team"}
        </p>
      </div>

      {widgets.length === 0 ? (
        <EmptyState
          title="No reports on this page"
          body="Add one to start measuring something."
        />
      ) : null}

      <WidgetGrid
        scope={scope}
        widgets={widgets}
        editing={editing}
        noun="report"
        adding={adding}
        onAddingChange={setAdding}
        onChange={setDraft}
        renderWidget={renderReport}
      />
    </div>
  );
}

type CardContext = {
  report: ReportResponse;
  money: (value: number) => string;
  refresh: () => void;
  refreshing: boolean;
  onRemove?: () => void;
};

function renderReportCard(type: string, context: CardContext) {
  const { report, money, refresh, refreshing, onRemove } = context;
  const frame = (
    props: Omit<Parameters<typeof ReportCard>[0], "onRefresh" | "refreshing" | "onRemove">,
  ) => <ReportCard {...props} onRefresh={refresh} refreshing={refreshing} onRemove={onRemove} />;

  switch (type) {
    case "report-headline":
      return frame({
        title: "Headline figures",
        entity: "deal",
        children: (
          <div className="grid grid-cols-2 gap-3 sm:gap-3 lg:grid-cols-4">
            <StatCard
              label="Win rate"
              value={formatRate(report.winRate)}
              footer={`${report.counts.won} won, ${report.counts.lost} lost`}
            />
            <StatCard
              label="Weighted forecast"
              value={money(report.forecast.weighted)}
              footer={
                report.forecast.estimated === 0
                  ? `${money(report.forecast.unweighted)} if everything lands`
                  : `${money(report.forecast.unweighted)} if everything lands · ${report.forecast.estimated} of ${report.forecast.count} at a default likelihood`
              }
            />
            <StatCard
              label="Typical cycle"
              value={report.medianCycleDays === null ? "—" : `${report.medianCycleDays}d`}
              footer="Median, open to closed"
            />
            <StatCard
              label="Leads"
              value={String(report.leads.created)}
              footer={`${report.leads.converted} became deals`}
            />
          </div>
        ),
      });

    case "report-funnel": {
      const leak = biggestLeak(report.funnel);
      return frame({
        title: "Stage funnel",
        entity: "deal",
        subtitle:
          leak && leak.droppedFromPrevious > 0
            ? `Biggest drop-off at ${leak.label} — ${leak.droppedFromPrevious} lost from the stage before`
            : undefined,
        copyRows: () => [
          ["Stage", "Reached", "From previous", "Median days"],
          ...report.funnel.map((stage) => [
            stage.label,
            String(stage.reached),
            formatRate(stage.conversionFromPrevious),
            stage.medianDaysInStage === null ? "" : String(stage.medianDaysInStage),
          ]),
        ],
        children: <FunnelChart stages={report.funnel} />,
      });
    }

    case "report-source-share":
      return frame({
        title: "Where the money came from",
        entity: "deal",
        subtitle: "Won value, by source",
        copyRows: () => [
          ["Source", "Won value", "Share"],
          ...report.sourceShare.map((slice) => [
            slice.label,
            String(slice.value),
            formatRate(slice.share),
          ]),
        ],
        children: <SharePie slices={report.sourceShare} formatValue={money} />,
      });

    case "report-trend":
      return frame({
        title: "Won over time",
        entity: "deal",
        subtitle:
          report.trend.granularity === "week" ? "By week" : "By day",
        copyRows: () => [
          ["Period", "Won", "Opened"],
          ...report.trend.won.map((bucket, index) => [
            bucket.period,
            String(bucket.value),
            String(report.trend.created[index]?.value ?? 0),
          ]),
        ],
        children: (
          <TrendChart
            formatValue={money}
            series={[
              { label: "Won", points: report.trend.won },
              { label: "Opened", points: report.trend.created },
            ]}
          />
        ),
      });

    case "report-by-owner":
      return frame({
        title: "Outcomes by owner",
        entity: "person",
        copyRows: () => [
          ["Owner", "Won", "Lost", "Open"],
          ...report.byOwner.map((row) => [
            row.label,
            String(row.won),
            String(row.lost),
            String(row.open),
          ]),
        ],
        children: (
          <GroupedBarChart
            emptyMessage="Nobody has closed anything yet"
            groups={report.byOwner.slice(0, 8).map((row) => ({
              key: row.key,
              label: row.label,
              bars: [
                { label: "Won", value: row.won },
                { label: "Lost", value: row.lost },
                { label: "Open", value: row.open },
              ],
            }))}
          />
        ),
      });

    case "report-owner-table":
      return frame({
        title: "Owner performance",
        entity: "person",
        copyRows: () => performanceRows(report.byOwner),
        children: <PerformanceTable rows={report.byOwner} money={money} />,
      });

    case "report-source-table":
      return frame({
        title: "Source performance",
        entity: "deal",
        copyRows: () => performanceRows(report.bySource),
        children: <PerformanceTable rows={report.bySource} money={money} />,
      });

    case "report-activity": {
      const peak = Math.max(1, ...report.activity.map((bucket) => bucket.count));
      return frame({
        title: "Activity logged",
        entity: "activity",
        subtitle: `Calls, emails and notes. Peak ${peak} in a single period.`,
        copyRows: () => [
          ["Period", "Logged"],
          ...report.activity.map((bucket) => [bucket.period, String(bucket.count)]),
        ],
        children: (
          // Ninety `flex-1` bars in ~318px is a third of a pixel each — a grey
          // smear with no bars in it. A floor of 8px and a scroll is what the
          // insights version already does.
          <div className="scroll-rail flex h-24 items-end gap-0.5 overflow-x-auto">
            {report.activity.map((bucket) => (
              <div
                key={bucket.period}
                title={`${bucket.period}: ${bucket.count}`}
                className="min-w-2 flex-1 rounded-t bg-[var(--surface-inverse)]"
                // A quiet day is a visible gap rather than a straight line
                // drawn through it.
                style={{ height: `${(bucket.count / peak) * 100}%`, minHeight: "1px" }}
              />
            ))}
          </div>
        ),
      });
    }

    default:
      return null;
  }
}

function performanceRows(rows: GroupedPerformance[]): string[][] {
  return [
    ["Name", "Won", "Lost", "Open", "Win rate", "Value won"],
    ...rows.map((row) => [
      row.label,
      String(row.won),
      String(row.lost),
      String(row.open),
      formatRate(row.winRate),
      String(row.wonValue),
    ]),
  ];
}

function PerformanceTable({
  rows,
  money,
}: {
  rows: GroupedPerformance[];
  money: (value: number) => string;
}) {
  if (rows.length === 0) return <EmptyState title="Nothing to show yet" />;

  return (
    <>
    {/* Four columns of figures need about 320px of table before the numbers
        start colliding, and a widget on a phone has roughly that much in
        total. So a phone reads it as a list: who, the value they won, and
        the counts underneath. */}
    <MobileRows className="md:hidden">
      {rows.map((row) => (
        <MobileRow
          key={row.key}
          title={row.label}
          subtitle={`${row.won} won · ${row.lost} lost · ${row.open} open`}
          value={money(row.wonValue)}
          status={
            <span className="font-mono text-sm text-[var(--text-muted)]">
              {formatRate(row.winRate)}
            </span>
          }
        />
      ))}
    </MobileRows>

    <table className="hidden w-full text-sm md:table">
      <thead className="text-left text-sm font-medium text-[var(--text-muted)]">
        <tr>
          <th className="pb-1 font-medium">Name</th>
          <th className="pb-1 text-right font-medium">Won</th>
          <th className="pb-1 text-right font-medium">Rate</th>
          <th className="pb-1 text-right font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-[var(--border-subtle)]">
            <td className="py-1.5">{row.label}</td>
            <td className="py-1.5 text-right font-mono">{row.won}</td>
            <td className="py-1.5 text-right font-mono">{formatRate(row.winRate)}</td>
            <td className="py-1.5 text-right font-mono">{money(row.wonValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}

export type { ReportEntity };
