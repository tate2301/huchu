"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { AdminDualBarChart, AdminStackedBarChart } from "@/components/charts/admin-headless-charts";
import { ColumnFigure, ColumnList, ColumnName, ColumnText, SectionHeading } from "@/components/management/ui";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { formatChange, formatFigure } from "@/components/retail/insights/format";
import { HeatGrid } from "@/components/retail/insights/heat-grid";
import { InsightBars } from "@/components/retail/insights/insight-bars";
import { RetailShell } from "@/components/retail/retail-shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { Cell, Insight, InsightTopic, Kpi } from "@/lib/retail/insights";
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

const PERIODS = new Map([
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
]);

/** Two quiet series colours, distinct to colour-blind eyes; text never wears them. */
const SERIES_COLORS = ["var(--text-strong)", "var(--text-muted)", "var(--action-primary-bg)"];

const WIDTH = 960;

const TONE_INK = { good: "var(--tone-success-strong)", warn: "var(--tone-warn)", bad: "var(--tone-danger-strong)" } as const;

function KpiFigure({ kpi }: { kpi: Kpi }) {
  return (
    <div className="min-w-0 space-y-1 border-l border-[var(--border)] pl-4 first:border-l-0 first:pl-0">
      <div className="text-xs text-[var(--text-muted)]">{kpi.label}</div>
      <div className="font-mono text-xl font-semibold tabular-nums text-[var(--text-strong)]">
        {formatFigure(kpi.value, kpi.format)}
      </div>
      <div className="text-xs text-[var(--text-muted)]">
        {kpi.change ? (
          <span className="font-mono" style={{ color: kpi.change.tone ? TONE_INK[kpi.change.tone] : undefined }}>
            {formatChange(kpi.change.value, kpi.change.format)}{" "}
          </span>
        ) : null}
        {kpi.note}
      </div>
    </div>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

function CellView({ cell, first }: { cell: Cell; first: boolean }) {
  if (cell === null) return null;
  if (typeof cell === "string") {
    const text = ISO_DATE.test(cell) ? formatRetailDate(cell) : cell;
    return first ? <ColumnName name={text} /> : <ColumnText>{text}</ColumnText>;
  }
  return (
    <ColumnFigure tone={cell.tone === "bad" ? "danger" : cell.tone === "warn" ? "warn" : "default"}>
      {formatFigure(cell.value, cell.format)}
    </ColumnFigure>
  );
}

/**
 * Insights — one question an owner asks of the shop, answered.
 *
 * A module overview, so its figures sit on top (the one kind of page that
 * carries them), then the chart that answers the question, then the tables
 * behind it under tabs, one table at a time. Beside them, what it says in
 * sentences and where to go to do something about it.
 */
export default function RetailInsightPage() {
  const params = useParams<{ topic: string }>();
  const topic = (params?.topic ?? "sales") as InsightTopic;
  const [days, setDays] = useState("30");
  const [tab, setTab] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["retail-insight", topic, days],
    queryFn: () => fetchJson<{ data: Insight }>(`/api/v2/retail/insights/${topic}?days=${days}`),
  });
  const insight = query.data?.data;
  const table = insight?.tables.find((entry) => entry.id === tab) ?? insight?.tables[0];
  const title = TITLES[topic] ?? "Insights";

  return (
    <RetailShell title={title}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3" style={{ maxWidth: WIDTH + 320 }}>
        <ViewToolbarFilter
          label="Period"
          value={days}
          anyLabel="Last 30 days"
          options={PERIODS}
          onChange={(value) => setDays(value === FILTER_ANY ? "30" : value)}
        />
      </div>

      {query.isPending ? (
        <div className="space-y-3" aria-busy="true" style={{ maxWidth: WIDTH }}>
          <Skeleton height={64} />
          <Skeleton height={240} />
        </div>
      ) : query.isError || !insight ? (
        <Alert tone="danger" title="This insight would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,960px)_280px]">
          <div className="min-w-0 space-y-8">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {insight.kpis.map((kpi) => (
                <KpiFigure key={kpi.label} kpi={kpi} />
              ))}
            </div>

            <section className="space-y-3">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">{insight.question}</h2>
                <p className="text-sm text-[var(--text-muted)]">{insight.unit}</p>
              </div>
              {insight.chart.kind === "heat" ? (
                <HeatGrid {...insight.chart} />
              ) : insight.chart.kind === "bars" ? (
                <InsightBars rows={insight.chart.rows} format={insight.chart.format} />
              ) : insight.chart.stacked || insight.chart.series.length !== 2 ? (
                <AdminStackedBarChart
                  height={260}
                  rows={insight.chart.rows.map((row) => ({ label: row.label, ...row.values }))}
                  series={insight.chart.series.map((series, index) => ({
                    key: series.key,
                    label: series.label,
                    color: SERIES_COLORS[index % SERIES_COLORS.length],
                  }))}
                  valueFormatter={(value) => formatFigure(value, insight.chart.format)}
                  yTickFormatter={(value) => formatFigure(value, insight.chart.format)}
                />
              ) : (
                <AdminDualBarChart
                  height={260}
                  rows={insight.chart.rows.map((row) => ({
                    id: row.label,
                    label: row.label,
                    primary: row.values[insight.chart.kind === "columns" ? insight.chart.series[0].key : ""] ?? 0,
                    secondary: row.values[insight.chart.kind === "columns" ? insight.chart.series[1].key : ""] ?? 0,
                  }))}
                  primaryLabel={insight.chart.series[0].label}
                  secondaryLabel={insight.chart.series[1].label}
                  primaryColor={SERIES_COLORS[0]}
                  secondaryColor={SERIES_COLORS[1]}
                  valueFormatter={(value) => formatFigure(value, insight.chart.format)}
                />
              )}
            </section>

            {table ? (
              <section className="space-y-3">
                {insight.tables.length > 1 ? (
                  <Tabs value={table.id} onValueChange={setTab}>
                    <TabsList>
                      {insight.tables.map((entry) => (
                        <TabsTrigger key={entry.id} value={entry.id}>
                          {entry.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : (
                  <SectionHeading maxWidth={WIDTH} className="mt-0">
                    {table.label}
                  </SectionHeading>
                )}
                <ColumnList
                  label={table.label}
                  maxWidth={WIDTH}
                  empty={table.empty}
                  columns={table.columns.map((column, index) => ({
                    id: column.id,
                    label: column.label,
                    align: column.align,
                    hideBelow: index > 2 ? ("sm" as const) : undefined,
                  }))}
                  rows={table.rows.map((row) => ({
                    id: row.id,
                    cells: Object.fromEntries(
                      table.columns.map((column, index) => [
                        column.id,
                        index === 0 && row.href && typeof row.cells[column.id] === "string" ? (
                          <ColumnName name={row.cells[column.id] as string} href={row.href} />
                        ) : (
                          <CellView cell={row.cells[column.id] ?? null} first={index === 0} />
                        ),
                      ]),
                    ),
                  }))}
                />
              </section>
            ) : null}
          </div>

          <aside className="space-y-6 text-sm">
            <section className="space-y-2">
              <h2 className="font-semibold text-[var(--text-strong)]">What it says</h2>
              {insight.findings.length > 0 ? (
                <ul className="space-y-2 text-[var(--text-strong)]">
                  {insight.findings.map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--text-muted)]">Not enough trade in this period to say.</p>
              )}
            </section>
            <section className="space-y-2 border-t border-[var(--border)] pt-4">
              <h2 className="font-semibold text-[var(--text-strong)]">Do something about it</h2>
              <ul className="space-y-1.5">
                {insight.actions.map((action) => (
                  <li key={action.href}>
                    <Link href={action.href} className="text-[var(--action-primary-bg)] hover:underline">
                      {action.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </RetailShell>
  );
}
