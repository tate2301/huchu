"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Button, ButtonLink, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import {
  Columns,
  HBars,
  HeatGrid,
  InsightAside,
  InsightBlock,
  InsightError,
  InsightFrame,
  InsightLoading,
  InsightPage,
  InsightTables,
  PeriodTools,
  type Cell as PageCell,
  type InsightTable as PageTable,
} from "@/components/reports/insight-page";
import { useInsightAddress } from "@/components/reports/insights/use-period";
import { formatChange, formatFigure } from "@/components/retail/insights/format";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { INSIGHT_MAX_DAYS, INSIGHT_RANGE_PRESETS } from "@/lib/retail/insight-range";
import type { Cell, Insight, InsightPeriod, InsightTable, InsightTopic, Tone } from "@/lib/retail/insights";
import { formatRetailDate } from "@/lib/retail/words";
import { formatTime } from "@/lib/workspace/format";

const TITLES: Record<InsightTopic, string> = {
  sales: "Sales",
  profit: "Profit",
  products: "Products",
  stock: "Stock health",
  losses: "Losses",
  customers: "Customers",
  money: "Money",
};

/** The list each insight is read from, opened from the top bar. */
const OPENS: Partial<Record<InsightTopic, { label: string; href: string }>> = {
  sales: { label: "Open the sales", href: "/retail/sales" },
  profit: { label: "Open the sales", href: "/retail/sales" },
  products: { label: "Open Products", href: "/retail/products" },
  stock: { label: "Open Stock", href: "/retail/stock" },
  losses: { label: "Open Till shifts", href: "/retail/shifts" },
  customers: { label: "Open Customers", href: "/retail/customers" },
};

const PERIODS: ReadonlyArray<{ value: InsightPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "month", label: "This month" },
];

const TONES: Record<Tone, "success" | "danger" | "warning"> = { good: "success", bad: "danger", warn: "warning" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

/** Parts of one whole in the shop's colours, in order; two things compared as the figure and the grey beside it. */
const STACKED = [
  "var(--color-ink-2)",
  "var(--color-warning)",
  "color-mix(in oklab, var(--color-accent) 45%, white)",
  "var(--color-muted)",
];
const seriesColor = (stacked: boolean, index: number) =>
  stacked ? STACKED[index % STACKED.length]! : index === 0 ? "var(--color-accent)" : "var(--color-muted)";

/** An API cell as the table writes it. A column called `change` is a signed change. */
function cellView(cell: Cell | undefined, column: string): PageCell | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "string") {
    if (cell === "New") return { text: cell, tone: "muted" };
    return { text: ISO_DATE.test(cell) ? formatRetailDate(cell) : cell };
  }
  return {
    text: column === "change" ? formatChange(cell.value, cell.format) : formatFigure(cell.value, cell.format),
    tone: cell.tone ? TONES[cell.tone] : null,
  };
}

function tableView(table: InsightTable): PageTable {
  return {
    id: table.id,
    label: table.label,
    columns: table.columns.map((column, index) => ({ id: column.id, label: column.label, num: index > 0 && column.align === "end" })),
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
  if (insight.emptyChart) return <p className="muted">{insight.emptyChart}</p>;
  if (chart.kind === "heat") {
    return <HeatGrid rows={chart.rows} columns={chart.columns} values={chart.values} format={(value) => formatFigure(value, chart.format)} />;
  }
  if (chart.kind === "bars") {
    const top = Math.max(0, ...chart.rows.map((row) => Math.abs(row.value)));
    return (
      <HBars
        rows={chart.rows.map((row) => ({
          id: row.id,
          label: row.note ? `${row.label}, ${row.note}` : row.label,
          share: top === 0 ? 0 : Math.abs(row.value) / top,
          text: formatFigure(row.value, chart.format),
          tone: row.tone ? TONES[row.tone] : null,
        }))}
      />
    );
  }
  return (
    <Columns
      columns={chart.rows.map((row) => ({
        label: row.label,
        parts: chart.series.map((series, index) => ({
          value: row.values[series.key] ?? 0,
          color: seriesColor(chart.stacked, index),
          title: `${series.label} ${formatFigure(row.values[series.key] ?? 0, chart.format)}`,
        })),
      }))}
      labels={chart.rows.map((row) => row.label)}
    />
  );
}

/**
 * Insights: one question an owner asks of the shop (PageRetailSales,
 * PageRetailLosses), in the insight page's shape and the shop's colours:
 * the period and site, the headline the server wrote from the figures, four
 * figures against the period before, the chart that answers the question,
 * the tables behind it under their views, and beside them where to go to do
 * something about it. The period (or the `from`/`to` days chosen instead),
 * site and view live in the address.
 */
export default function RetailInsightPage() {
  return (
    <React.Suspense
      fallback={
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      }
    >
      <RetailInsight />
    </React.Suspense>
  );
}

function RetailInsight() {
  const params = useParams<{ topic: string }>();
  const topic = (params?.topic ?? "sales") as InsightTopic;
  const address = useInsightAddress<InsightPeriod>(
    PERIODS.map((entry) => entry.value),
    "30d",
  );
  const from = address.get("from");
  const to = address.get("to");
  // Either end alone still goes to the server, which says it cannot read it.
  const ranged = from !== null || to !== null;
  const period = address.period ?? "30d";
  const siteId = address.get("siteId") ?? "all";
  const title = TITLES[topic] ?? "Insights";

  const query = useQuery({
    queryKey: ["retail-insight", topic, ranged ? null : period, from, to, siteId],
    queryFn: () => {
      const search = new URLSearchParams(ranged ? { siteId } : { period, siteId });
      if (from !== null) search.set("from", from);
      if (to !== null) search.set("to", to);
      return fetchJson<{ data: Insight }>(`/api/v2/retail/insights/${topic}?${search.toString()}`);
    },
    placeholderData: (previous) => previous,
  });
  // A range the server refused: retrying cannot help, going back can.
  const refused = query.error instanceof ApiError && query.error.status === 400;
  const insight = query.data?.data;
  // A refusal can be the site as well as the days, so the way out clears both.
  const startOver = () => address.set({ from: null, to: null, period: null, siteId: null });

  const opens = OPENS[topic];
  const actions = React.useMemo(
    () =>
      opens ? (
        <Kit contents>
          <ButtonLink href={opens.href} icon="list">
            {opens.label}
          </ButtonLink>
        </Kit>
      ) : undefined,
    [opens],
  );
  const chrome = <PageChrome title={title}>{actions}</PageChrome>;

  const site = insight?.site ?? null;
  const tools = (
    <>
      <PeriodTools
        periods={PERIODS}
        period={ranged ? null : period}
        onPeriod={address.setPeriod}
        days={from && to ? (!query.isPlaceholderData && insight?.range ? insight.range : { from, to }) : null}
        onDays={address.setDays}
        onClearDays={address.clearDays}
        presets={INSIGHT_RANGE_PRESETS}
        maxDays={INSIGHT_MAX_DAYS}
      />
      {site ? (
        <MenuButton
          className={site.value === "all" ? "chipsel" : "chipsel is-set"}
          icon="store"
          label="Site"
          items={site.options.map((option) => ({
            key: option.value,
            label: option.label,
            checked: option.value === site.value,
            onSelect: () => address.set({ siteId: option.value === "all" ? null : option.value }),
          }))}
        >
          <span className="truncate">{site.label}</span>
        </MenuButton>
      ) : null}
      {insight ? (
        <span className="ws-n">
          {insight.compareWords}, as of {formatTime(insight.updatedAt)}
        </span>
      ) : null}
    </>
  );

  if (query.isPending) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      </>
    );
  }

  if (query.isError || !insight) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools}>
            <InsightError message={getApiErrorMessage(query.error, "Check the connection and try again.")} onRetry={() => void query.refetch()}>
              {refused ? (
                <Button icon="history" onClick={startOver}>
                  Back to 30 days
                </Button>
              ) : undefined}
            </InsightError>
          </InsightPage>
        </InsightFrame>
      </>
    );
  }

  const tables = insight.tables.map(tableView);
  const legend =
    insight.chart.kind === "columns"
      ? insight.chart.series.map((series, index) => ({
          label: series.label,
          color: seriesColor(insight.chart.kind === "columns" && insight.chart.stacked, index),
        }))
      : null;

  return (
    <>
      {chrome}
      <InsightFrame>
        <InsightPage
          tools={tools}
          finding={{ fact: insight.headline.fact, rest: insight.headline.notice }}
          figures={insight.kpis.map((kpi) => ({
            label: kpi.label,
            value: formatFigure(kpi.value, kpi.format),
            note: kpi.change ? [formatChange(kpi.change.value, kpi.change.format), kpi.note].filter(Boolean).join(" ") : (kpi.note ?? null),
            tone: kpi.change?.tone ? TONES[kpi.change.tone] : undefined,
          }))}
          aside={
            insight.actions.length > 0 ? (
              <InsightAside
                cards={insight.actions.map((action) => ({ key: action.href, action: { label: action.label, href: action.href, icon: "chev" } }))}
              />
            ) : null
          }
        >
          <div className={query.isFetching ? "rp-blocks is-fetching" : "rp-blocks"}>
            <InsightBlock title={insight.question} sum={insight.unit} legend={legend}>
              <Chart insight={insight} />
            </InsightBlock>
            <InsightTables tables={tables} value={address.get("tab") ?? tables[0]?.id ?? ""} onChange={(next) => address.set({ tab: next })} />
          </div>
        </InsightPage>
      </InsightFrame>
    </>
  );
}
