"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@corelithzw/react";

import { ColumnsChart } from "@/components/dashboard-frame/bar-chart";
import { DashboardFrame, DashSkeleton } from "@/components/dashboard-frame/dashboard-frame";
import { HeatGrid } from "@/components/dashboard-frame/heat-grid";
import { InsightAside } from "@/components/dashboard-frame/insight-aside";
import { InsightBars } from "@/components/dashboard-frame/insight-bars";
import { InsightTabs, type TableCell, type TableView } from "@/components/dashboard-frame/insight-table";
import { KpiStrip } from "@/components/dashboard-frame/kpi-tile";
import { PeriodToolbar } from "@/components/dashboard-frame/period-toolbar";
import { QuestionPanel } from "@/components/dashboard-frame/question-panel";
import type { DashTone, SeriesColor } from "@/components/dashboard-frame/types";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/workspace/button";
import { formatChange, formatFigure } from "@/components/retail/insights/format";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { Cell, Insight, InsightPeriod, InsightTable, InsightTopic, Tone } from "@/lib/retail/insights";
import { formatRetailDate } from "@/lib/retail/words";

const TITLES: Record<InsightTopic, string> = {
  sales: "Sales",
  profit: "Profit",
  products: "Products",
  stock: "Stock health",
  losses: "Losses",
  customers: "Customers",
  money: "Money",
};

const PERIODS: ReadonlyArray<{ value: InsightPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
];

const TONES: Record<Tone, DashTone> = { good: "ok", bad: "bad", warn: "warn" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

function tone(value: Tone | undefined): DashTone | null {
  return value ? TONES[value] : null;
}

/** An API cell as the table writes it. A column called `change` is a signed change. */
function cellView(cell: Cell | undefined, column: string): TableCell | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "string") {
    if (cell === "New") return { text: cell, tone: "muted" };
    return { text: ISO_DATE.test(cell) ? formatRetailDate(cell) : cell };
  }
  return {
    text: column === "change" ? formatChange(cell.value, cell.format) : formatFigure(cell.value, cell.format),
    tone: tone(cell.tone),
    mono: true,
  };
}

/** Money columns are 140px, a change 120px, other figures 110px (InsightsSales board). */
function columnWidth(table: InsightTable, column: InsightTable["columns"][number], index: number) {
  if (index === 0) return "minmax(0, 1fr)";
  if (column.id === "change") return "120px";
  if (column.align !== "end") return "minmax(0, 1fr)";
  const sample = [...table.rows.map((row) => row.cells[column.id]), table.total?.cells[column.id]].find(
    (cell) => cell !== null && cell !== undefined && typeof cell !== "string",
  );
  return sample && typeof sample !== "string" && sample.format === "money" ? "140px" : "110px";
}

function tableView(table: InsightTable): TableView {
  return {
    id: table.id,
    label: table.label,
    columns: table.columns.map((column, index) => ({
      id: column.id,
      label: column.label,
      align: column.align ?? "start",
      width: columnWidth(table, column, index),
    })),
    rows: table.rows.map((row) => ({
      id: row.id,
      cells: Object.fromEntries(
        table.columns.map((column, index) => {
          const view = cellView(row.cells[column.id], column.id);
          return [column.id, index === 0 && row.href && view ? { ...view, href: row.href } : view];
        }),
      ),
    })),
    total: table.total
      ? {
          label: table.total.label,
          cells: Object.fromEntries(table.columns.map((column) => [column.id, cellView(table.total?.cells[column.id], column.id)])),
        }
      : null,
    empty: table.empty,
  };
}

function Chart({ insight }: { insight: Insight }) {
  const chart = insight.chart;
  if (chart.kind === "heat") {
    return (
      <HeatGrid
        rows={chart.rows}
        columns={chart.columns}
        values={chart.values}
        format={(value) => formatFigure(value, chart.format)}
        label={insight.unit}
      />
    );
  }
  if (chart.kind === "bars") {
    return (
      <InsightBars
        label={insight.unit}
        rows={chart.rows.map((row) => ({
          id: row.id,
          label: row.label,
          value: row.value,
          text: formatFigure(row.value, chart.format),
          note: row.note ?? null,
          tone: tone(row.tone),
        }))}
      />
    );
  }
  return (
    <ColumnsChart
      label={insight.unit}
      stacked={chart.stacked}
      series={chart.series.map((series, index) => ({ ...series, color: seriesColor(chart.stacked, index) }))}
      groups={chart.rows}
      format={(value) => formatFigure(value, chart.format)}
    />
  );
}

/** Parts of a whole take the categorical colours in order; two things compared take the data pair. */
function seriesColor(stacked: boolean, index: number): SeriesColor {
  if (stacked) return (["s1", "s2", "s3", "s4"] as const)[index % 4];
  return index === 0 ? "data" : "muted";
}

function Loading() {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DashSkeleton height={32} width="70%" />
        <DashSkeleton height={32} width="55%" />
      </div>
      <DashSkeleton height={84} />
      <DashSkeleton height={240} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 6 }, (_, index) => (
          <DashSkeleton key={index} height={34} />
        ))}
      </div>
    </>
  );
}

function AsideLoading() {
  return (
    <div className="cx-df-aside__section">
      <DashSkeleton height={16} width="50%" />
      <DashSkeleton height={36} />
      <DashSkeleton height={36} />
    </div>
  );
}

/**
 * Insights — one question an owner asks of the shop, answered on the
 * DashboardFrame's insight variant: the period and site in the toolbar, the
 * headline the server wrote from the figures, four figures against the period
 * before, the chart that answers the question, the tables behind it under
 * tabs, and beside them where to go to do something about it. The period,
 * site and tab live in the address.
 */
export default function RetailInsightPage() {
  const params = useParams<{ topic: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const topic = (params?.topic ?? "sales") as InsightTopic;
  const requested = searchParams.get("period");
  const period = PERIODS.find((entry) => entry.value === requested)?.value ?? "30d";
  const siteId = searchParams.get("siteId") ?? "all";
  const title = TITLES[topic] ?? "Insights";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const query = useQuery({
    queryKey: ["retail-insight", topic, period, siteId],
    queryFn: () =>
      fetchJson<{ data: Insight }>(
        `/api/v2/retail/insights/${topic}?${new URLSearchParams({ period, siteId }).toString()}`,
      ),
    placeholderData: (previous) => previous,
  });
  const insight = query.data?.data;
  const tables = insight?.tables.map(tableView) ?? [];
  const tab = searchParams.get("tab") ?? tables[0]?.id ?? "";

  const toolbar = (
    <PeriodToolbar
      ground
      periods={PERIODS}
      period={period}
      onPeriodChange={(value) => setParam("period", value)}
      site={
        insight?.site
          ? { ...insight.site, onChange: (value: string) => setParam("siteId", value === "all" ? null : value) }
          : null
      }
      compare={insight?.compareWords ?? null}
      updatedAt={insight?.updatedAt ?? null}
    />
  );

  return (
    <>
      <PageChrome title={title} />
      <DashboardFrame
        variant="insight"
        label={title}
        toolbar={toolbar}
        headline={query.isError ? null : (insight?.headline ?? null)}
        aside={
          insight ? (
            insight.actions.length > 0 ? <InsightAside actions={insight.actions} /> : null
          ) : query.isError ? null : (
            <AsideLoading />
          )
        }
      >
        {query.isPending ? (
          <Loading />
        ) : query.isError || !insight ? (
          <Alert tone="danger" title="This insight would not load">
            <p>{getApiErrorMessage(query.error)}</p>
            <Button className="mt-2" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : (
          <>
            <KpiStrip
              items={insight.kpis.map((kpi) => ({
                label: kpi.label,
                value: formatFigure(kpi.value, kpi.format),
                delta: kpi.change ? { text: formatChange(kpi.change.value, kpi.change.format), tone: tone(kpi.change.tone) } : null,
                note: kpi.note ?? null,
              }))}
            />
            <QuestionPanel
              question={insight.question}
              unit={insight.unit}
              empty={insight.emptyChart}
              legend={
                insight.chart.kind === "columns"
                  ? insight.chart.series.map((series, index) => ({
                      label: series.label,
                      color: seriesColor(insight.chart.kind === "columns" && insight.chart.stacked, index),
                    }))
                  : null
              }
            >
              <Chart insight={insight} />
            </QuestionPanel>
            {tables.length > 0 ? (
              <InsightTabs tables={tables} value={tab} onValueChange={(value) => setParam("tab", value)} />
            ) : null}
          </>
        )}
      </DashboardFrame>
    </>
  );
}

