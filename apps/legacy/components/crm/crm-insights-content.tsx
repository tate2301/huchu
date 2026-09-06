"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Alert, Badge, Card, EmptyState, Skeleton, StatHero, Stack } from "@corelithzw/react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CRM_CHANNEL_LABELS } from "@/lib/crm/sources";
import { REPORT_RANGES, formatRate, type ReportRange } from "@/lib/crm/reports";
import { MobileRow, MobileRows } from "@/components/crm/records/mobile-rows";

type FunnelStage = {
  key: string;
  label: string;
  reached: number;
  value: number;
  shareOfTotal: number;
  conversionFromPrevious: number;
  droppedFromPrevious: number;
};

type GroupRow = {
  key: string;
  label: string;
  won: number;
  lost: number;
  open: number;
  wonValue: number;
  openValue: number;
  winRate: number;
};

type ReportData = {
  range: ReportRange;
  from: string;
  to: string;
  scope: "TEAM" | "MINE";
  funnel: FunnelStage[];
  counts: { won: number; lost: number; open: number };
  winRate: number;
  medianCycleDays: number | null;
  forecast: { weighted: number; unweighted: number; count: number; estimated: number };
  byOwner: GroupRow[];
  bySource: GroupRow[];
  activity: Array<{ label: string; start: string; count: number }>;
  leads: { created: number; converted: number };
};

type RepRow = {
  repId: string;
  name: string;
  leads: number;
  quotes: number;
  won: number;
  winRate: number;
  invoicedAmount: number;
  collectedAmount: number;
  avgResponseHours: number | null;
};

type SourceRow = {
  source: string;
  channel: string;
  campaign: string | null;
  leads: number;
  won: number;
  conversionRate: number;
};

type ChannelRow = { channel: string; leads: number; won: number; conversionRate: number };

const RANGE_LABELS: Record<ReportRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
};

function money(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** The stage that loses the most of what reached the one before it. */
function biggestLeakStage(funnel: FunnelStage[]): FunnelStage | null {
  let worst: FunnelStage | null = null;
  for (const stage of funnel.slice(1)) {
    if (stage.reached === 0 && stage.droppedFromPrevious === 0) continue;
    // `>=` so a tie breaks toward the later stage — the one closer to the money.
    if (!worst || stage.droppedFromPrevious >= worst.droppedFromPrevious) worst = stage;
  }
  return worst && worst.droppedFromPrevious > 0 ? worst : null;
}

/**
 * Insights.
 *
 * The reporting engine — funnel with per-stage conversion, win rate, median
 * cycle, weighted forecast, activity trend and grouped performance — already
 * existed behind `/api/v2/crm/reports` and nothing rendered it; the page only
 * showed two flat tables. This reads the whole report, and every number is a
 * question someone actually asks: where are we losing them, how long does a
 * deal take, what is realistically going to land, and who or what is bringing
 * the work in.
 */
export function CrmInsightsContent() {
  const [range, setRange] = useState<ReportRange>("90d");

  const report = useQuery({
    queryKey: ["crm-report", range],
    queryFn: () => fetchJson<ReportData>(`/api/v2/crm/reports?range=${range}`),
    placeholderData: (previous) => previous,
  });

  const reps = useQuery({
    queryKey: ["crm-insights-reps"],
    queryFn: () => fetchJson<{ data: RepRow[] }>("/api/v2/crm/insights/reps"),
  });

  const sources = useQuery({
    queryKey: ["crm-insights-sources"],
    queryFn: () =>
      fetchJson<{ sources: SourceRow[]; channels: ChannelRow[] }>("/api/v2/crm/insights/sources"),
  });

  if (report.error) {
    return (
      <Alert tone="danger" title="Couldn't build the report">
        {getApiErrorMessage(report.error)}
      </Alert>
    );
  }

  const data = report.data;
  const leak = data ? biggestLeakStage(data.funnel) : null;
  const decided = data ? data.counts.won + data.counts.lost : 0;
  const peakActivity = data ? Math.max(1, ...data.activity.map((point) => point.count)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={range}
          onValueChange={(value) => setRange(value as ReportRange)}
          size="sm"
          ariaLabel="Report period"
          options={REPORT_RANGES.map((value) => ({ value, label: RANGE_LABELS[value] }))}
        />
        {data ? (
          <Badge tone="neutral" size="sm">
            {data.scope === "TEAM" ? "Whole team" : "Your deals only"}
          </Badge>
        ) : null}
      </div>

      {!data ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <Skeleton height={128} />
          <Skeleton height={240} />
        </div>
      ) : decided === 0 && data.counts.open === 0 ? (
        <EmptyState
          title="Nothing to report on this period yet"
          body="Once deals are opened and closed, this page shows where they are lost, how long they take and what is likely to land."
        />
      ) : (
        <>
          <StatHero
            label="Weighted forecast"
            value={money(data.forecast.weighted)}
            subtitle={
              data.forecast.estimated === 0
                ? `${money(data.forecast.unweighted)} if every open deal lands · ${data.counts.open} open`
                : `${money(data.forecast.unweighted)} if every open deal lands · ${data.forecast.estimated} of ${data.forecast.count} open deals have no likelihood set, so they are counted at the default`
            }
            change={
              decided === 0
                ? "Nothing decided in this period yet"
                : `${formatRate(data.winRate)} win rate across ${decided} decided deal${decided === 1 ? "" : "s"}`
            }
            trend={data.winRate >= 0.5 ? "up" : data.winRate > 0 ? "down" : "neutral"}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <Card title="Median time to close">
              <p className="acct-stat-value text-[var(--text-strong)]">
                {data.medianCycleDays === null ? "—" : `${data.medianCycleDays} days`}
              </p>
              <p className="text-sm text-[var(--text-muted)]">
                {data.medianCycleDays === null
                  ? "No deal has closed in this period."
                  : "From opening the deal to winning or losing it."}
              </p>
            </Card>
            <Card title="Biggest leak">
              <p className="acct-stat-value text-[var(--text-strong)]">{leak ? leak.label : "—"}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {leak
                  ? `${leak.droppedFromPrevious} dropped before reaching it — ${formatRate(leak.conversionFromPrevious)} of the previous stage carried through.`
                  : "Nothing is falling out between stages."}
              </p>
            </Card>
            <Card title="Leads converted">
              <p className="acct-stat-value text-[var(--text-strong)]">
                {data.leads.converted}
                <span className="text-base font-normal text-[var(--text-muted)]">
                  {" "}
                  / {data.leads.created}
                </span>
              </p>
              <p className="text-sm text-[var(--text-muted)]">
                {data.leads.created === 0
                  ? "No leads captured in this period."
                  : `${formatRate(data.leads.converted / data.leads.created)} of new leads became a deal.`}
              </p>
            </Card>
          </div>

          <Card title="Where deals fall out">
            {data.funnel.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No stages configured.</p>
            ) : (
              <Stack as="ul" gap="md">
                {data.funnel.map((stage, index) => (
                  <li key={stage.key} className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{stage.label}</span>
                      <span className="font-mono text-sm text-[var(--text-muted)]">
                        {stage.reached} reached · {money(stage.value)}
                        {index > 0
                          ? ` · ${formatRate(stage.conversionFromPrevious)} carried through`
                          : ""}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--surface-muted)]">
                      <div
                        className="h-2 rounded-full bg-[var(--brand)]"
                        style={{ width: `${Math.max(stage.shareOfTotal * 100, stage.reached > 0 ? 2 : 0)}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </li>
                ))}
              </Stack>
            )}
          </Card>

          <Card title="Activity">
            {data.activity.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Nothing logged in this period.</p>
            ) : (
              <>
                <div className="scroll-rail flex h-28 items-end gap-1 overflow-x-auto">
                  {data.activity.map((point, index) => (
                    <div
                      key={`${point.start}-${index}`}
                      className="flex min-w-2 flex-1 flex-col justify-end"
                      title={`${point.label}: ${point.count}`}
                    >
                      <div
                        className="rounded-t bg-[var(--brand)]"
                        style={{ height: `${(point.count / peakActivity) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Calls, notes, emails and meetings logged. Peak {peakActivity} in a single period.
                </p>
              </>
            )}
          </Card>

          <Tabs defaultValue="owner">
            <TabsList aria-label="Performance breakdown">
              <TabsTrigger value="owner">By owner</TabsTrigger>
              <TabsTrigger value="source">By source</TabsTrigger>
              <TabsTrigger value="rep">Rep scorecard</TabsTrigger>
              <TabsTrigger value="channel">Channels</TabsTrigger>
            </TabsList>

            <TabsContent value="owner">
              <GroupTable rows={data.byOwner} firstHeader="Owner" />
            </TabsContent>

            <TabsContent value="source">
              <GroupTable rows={data.bySource} firstHeader="Source" />
            </TabsContent>

            <TabsContent value="rep">
              {reps.data?.data.length ? (
                <>
                {/* Seven columns is 680px of table. On a phone it is a list:
                    who, what they collected, and the rest underneath. */}
                <MobileRows className="md:hidden">
                  {reps.data.data.map((row) => (
                    <MobileRow
                      key={row.repId}
                      title={row.name}
                      subtitle={`${row.leads} leads · ${row.quotes} quotes · ${row.winRate}% won${
                        row.avgResponseHours != null
                          ? ` · ${row.avgResponseHours}h to respond`
                          : ""
                      }`}
                      value={money(row.collectedAmount)}
                    />
                  ))}
                </MobileRows>

                <div className="scroll-rail hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                        <th className="p-3">Rep</th>
                        <th className="p-3 text-right">Leads</th>
                        <th className="p-3 text-right">Quotes</th>
                        <th className="p-3 text-right">Win %</th>
                        <th className="p-3 text-right">Invoiced</th>
                        <th className="p-3 text-right">Collected</th>
                        <th className="p-3 text-right">Avg response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reps.data.data.map((row) => (
                        <tr key={row.repId} className="border-b border-[var(--border-subtle)]">
                          <td className="p-3 font-medium">{row.name}</td>
                          <td className="p-3 text-right font-mono">{row.leads}</td>
                          <td className="p-3 text-right font-mono">{row.quotes}</td>
                          <td className="p-3 text-right font-mono">{row.winRate}%</td>
                          <td className="p-3 text-right font-mono">{money(row.invoicedAmount)}</td>
                          <td className="p-3 text-right font-mono">{money(row.collectedAmount)}</td>
                          <td className="p-3 text-right font-mono">
                            {row.avgResponseHours != null ? `${row.avgResponseHours}h` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              ) : (
                <EmptyState title="No rep activity yet" />
              )}
            </TabsContent>

            <TabsContent value="channel">
              {sources.data?.channels.length ? (
                <Stack as="ul" gap="xs">
                  {sources.data.channels.map((row) => (
                    <li
                      key={row.channel}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                    >
                      <Link
                        href={`/crm/leads?channels=${row.channel}`}
                        className="font-medium hover:underline"
                      >
                        {(CRM_CHANNEL_LABELS as Record<string, string>)[row.channel] ?? row.channel}
                      </Link>
                      <span className="font-mono text-sm text-[var(--text-muted)]">
                        {row.leads} leads · {row.won} won · {row.conversionRate}%
                      </span>
                    </li>
                  ))}
                </Stack>
              ) : (
                <EmptyState title="No lead channels recorded yet" />
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

/** Shared shape for the owner and source breakdowns — same columns, same maths. */
function GroupTable({ rows, firstHeader }: { rows: GroupRow[]; firstHeader: string }) {
  if (!rows.length) return <EmptyState title={`Nothing to break down by ${firstHeader.toLowerCase()} yet`} />;

  return (
    <>
    {/* A 560px table on a 358px screen scrolls sideways, which is the old
        answer to this and a poor one: you cannot compare a column you have to
        drag into view, and the row labels leave as soon as you do. A phone
        gets one row per group — won value on the right, the counts and the
        rate underneath. */}
    <MobileRows className="md:hidden">
      {rows.map((row) => (
        <MobileRow
          key={row.key}
          title={row.label}
          subtitle={`${row.open} open · ${row.won} won · ${row.lost} lost · ${formatRate(row.winRate)}`}
          value={money(row.wonValue)}
        />
      ))}
    </MobileRows>

    <div className="scroll-rail hidden overflow-x-auto md:block">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
            <th className="p-3">{firstHeader}</th>
            <th className="p-3 text-right">Open</th>
            <th className="p-3 text-right">Won</th>
            <th className="p-3 text-right">Lost</th>
            <th className="p-3 text-right">Win %</th>
            <th className="p-3 text-right">Won value</th>
            <th className="p-3 text-right">Open value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[var(--border-subtle)]">
              <td className="p-3 font-medium">{row.label}</td>
              <td className="p-3 text-right font-mono">{row.open}</td>
              <td className="p-3 text-right font-mono">{row.won}</td>
              <td className="p-3 text-right font-mono">{row.lost}</td>
              <td className="p-3 text-right font-mono">{formatRate(row.winRate)}</td>
              <td className="p-3 text-right font-mono">{money(row.wonValue)}</td>
              <td className="p-3 text-right font-mono">{money(row.openValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
