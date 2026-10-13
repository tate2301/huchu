"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { ButtonLink, Empty, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { insightMoney } from "@/lib/reports/week-insights";
import { CRM_CHANNEL_LABELS } from "@/lib/crm/sources";
import { registerHref } from "@/lib/crm/registers/href";
import {
  bucketLabel,
  channelTable,
  funnelBars,
  groupTable,
  repTable,
  salesCards,
  salesFigures,
  salesFinding,
  salesIsEmpty,
  type ChannelRow,
  type RepRow,
  type SalesReport,
} from "@/lib/reports/insight-sales";
import { startOfDayIn } from "@/lib/reports/list-query";
import { addDays, DEFAULT_TIME_ZONE } from "@/lib/workspace/format";

import {
  Columns,
  HBars,
  InsightAside,
  InsightBlock,
  InsightError,
  InsightFrame,
  InsightLoading,
  InsightPage,
  InsightTables,
  PeriodTools,
  type InsightTable,
} from "../insight-page";
import { periodDays, useInsightAddress } from "./use-period";

const PERIODS = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const money = insightMoney;

/**
 * Reports → Insights → Sales: the pipeline over the period, in the insight
 * page's shape (PageInsightVisits). What `/crm/insights` and `/crm/reports`
 * showed: where deals fall out, what was won when, the forecast and the
 * time to close, then by owner, by source, the rep scorecard and the lead
 * channels.
 */
export function SalesInsight() {
  const address = useInsightAddress(
    PERIODS.map((entry) => entry.value),
    "90d",
  );
  const days = address.days ?? periodDays((address.period ?? "90d") as Period);
  const reportQuery = address.days
    ? `from=${address.days.from}&to=${address.days.to}`
    : `range=${address.period ?? "90d"}`;
  // The scorecard and the channels read instants: the start of the first day to the end of the last.
  const instants = `from=${startOfDayIn(days.from, DEFAULT_TIME_ZONE).toISOString()}&to=${new Date(
    startOfDayIn(addDays(days.to, 1), DEFAULT_TIME_ZONE).getTime() - 1,
  ).toISOString()}`;

  const report = useQuery({
    queryKey: ["reports-insight-sales", reportQuery],
    queryFn: () => fetchJson<SalesReport>(`/api/v2/crm/reports?${reportQuery}`),
    placeholderData: (previous) => previous,
  });
  const reps = useQuery({
    queryKey: ["reports-insight-sales-reps", instants],
    queryFn: () => fetchJson<{ data: RepRow[] }>(`/api/v2/crm/insights/reps?${instants}`),
    placeholderData: (previous) => previous,
  });
  const channels = useQuery({
    queryKey: ["reports-insight-sales-channels", instants],
    queryFn: () => fetchJson<{ channels: ChannelRow[] }>(`/api/v2/crm/insights/sources?${instants}`),
    placeholderData: (previous) => previous,
  });

  const actions = React.useMemo(
    () => (
      <Kit contents>
        <ButtonLink href="/reports/crm-deals" icon="reports">
          Open Deals
        </ButtonLink>
      </Kit>
    ),
    [],
  );
  const chrome = <PageChrome title="Sales">{actions}</PageChrome>;

  const tools = (
    <>
      <PeriodTools
        periods={PERIODS}
        period={address.period as Period | null}
        onPeriod={address.setPeriod}
        days={address.days}
        onDays={address.setDays}
        onClearDays={address.clearDays}
      />
      {report.data?.scope === "MINE" ? <span className="ws-n">Your deals only</span> : null}
    </>
  );

  if (report.isPending) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      </>
    );
  }

  if (report.isError || !report.data) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools}>
            <InsightError
              message={`${getApiErrorMessage(report.error, "Check the connection and try again.")} Insights on sales are for whoever can open the CRM’s insights; a manager can tell you who that is.`}
              onRetry={() => void report.refetch()}
            />
          </InsightPage>
        </InsightFrame>
      </>
    );
  }

  const data = report.data;
  const tables: InsightTable[] = [
    groupTable("owner", data.byOwner, money),
    groupTable("source", data.bySource, money),
    repTable(reps.data?.data ?? [], money),
    channelTable(channels.data?.channels ?? [], CRM_CHANNEL_LABELS as Record<string, string>, (channel) =>
      registerHref("LEAD", { filters: { channel: [channel] }, layout: "TABLE" }),
    ),
  ];
  const view = address.get("view") ?? "owner";
  const bucket = data.trend.granularity === "week" ? "week" : "day";

  return (
    <>
      {chrome}
      <InsightFrame>
        <InsightPage
          tools={tools}
          finding={salesIsEmpty(data) ? null : salesFinding(data, money)}
          figures={salesIsEmpty(data) ? null : salesFigures(data, money)}
          aside={
            <InsightAside
              cards={salesIsEmpty(data) ? [] : salesCards(data)}
              send={{ words: "Deals, the report under this page, as a PDF or a spreadsheet, on the days you choose.", href: "/reports/crm-deals?send=1" }}
            />
          }
        >
          {salesIsEmpty(data) ? (
            <Empty icon="pipeline" title="No deals in these dates">
              Widen the dates, or open a deal: once deals are opened and closed, this page shows where they are lost and what is likely to land.
            </Empty>
          ) : (
            <div className={report.isFetching ? "rp-blocks is-fetching" : "rp-blocks"}>
              <div className="rp-grid2">
                <div>
                  <InsightBlock title="Where deals fall out" sum="reached, of every deal opened">
                    <HBars rows={funnelBars(data.funnel)} empty="No stages are set up." />
                  </InsightBlock>
                </div>
                <div>
                  <InsightBlock title="What was won" sum={`value won, by ${bucket}`}>
                    <Columns
                      columns={data.trend.won.map((point) => ({
                        label: bucketLabel(point.period),
                        parts: [{ value: point.value, color: "var(--color-accent)", title: `${money(point.value)}, ${point.count} won` }],
                      }))}
                      labels={data.trend.won.map((point) => bucketLabel(point.period))}
                      empty="Nothing was won in these dates."
                    />
                  </InsightBlock>
                  <InsightBlock title="Activity" sum={`calls, notes, emails and meetings, by ${bucket}`}>
                    <Columns
                      columns={data.activity.map((point) => ({
                        label: bucketLabel(point.period),
                        parts: [{ value: point.count, color: "var(--color-muted)", title: `${point.count} logged` }],
                      }))}
                      labels={data.activity.map((point) => bucketLabel(point.period))}
                      empty="Nothing was logged in these dates."
                    />
                  </InsightBlock>
                </div>
              </div>
              <InsightTables tables={tables} value={view} onChange={(next) => address.set({ view: next === "owner" ? null : next })} />
            </div>
          )}
        </InsightPage>
      </InsightFrame>
    </>
  );
}
