"use client";

/**
 * How the pipeline performed over a period somebody chose.
 *
 * Top to bottom it answers the questions in the order they get asked. Over
 * which period, and whose deals? How did it go — win rate, forecast, cycle,
 * leads? When was the money won? Where do deals drop out? And then, by owner
 * or by source, who and what brought it in. Last, how much work was logged.
 *
 * Drawn as the CRM's finance page and the retail insights are, with the
 * management contract's pieces (`components/management/ui`): figures plain and
 * mono under a sentence-case label, charts under section headings rather than
 * in cards, and the breakdowns as `ColumnList`s that name their columns once.
 * The order is fixed. It used to be a grid of cards anybody could rearrange,
 * which is how a page ends up with no order at all.
 *
 * One fetch feeds every section. They are all cuts of the same period over the
 * same deals, and separate requests would let two sections disagree about what
 * "last 90 days" means.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Alert, SegmentedControl, Skeleton } from "@corelithzw/react";
import { AdminStackedBarChart, AdminTrendChart } from "@/components/charts/admin-headless-charts";
import { formatMoney } from "@/components/crm/documents/document-types";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  SectionHeading,
} from "@/components/management/ui";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  REPORT_RANGES,
  REPORT_RANGE_LABELS,
  biggestLeak,
  formatRate,
  winRate,
  type FunnelStage,
  type GroupedPerformance,
  type ReportRange,
} from "@/lib/crm/reports";

type SeriesBucket = { period: string; count: number; value: number };

type ReportResponse = {
  range: ReportRange;
  scope: "TEAM" | "MINE";
  funnel: Array<FunnelStage & { medianDaysInStage: number | null }>;
  counts: { won: number; lost: number; open: number };
  winRate: number;
  medianCycleDays: number | null;
  forecast: { weighted: number; unweighted: number; count: number; estimated: number };
  byOwner: GroupedPerformance[];
  bySource: GroupedPerformance[];
  trend: { granularity: "day" | "week"; won: SeriesBucket[]; created: SeriesBucket[] };
  activity: { period: string; count: number }[];
  leads: { created: number; converted: number };
};

/** The measure every section and its heading share. */
const WIDE = 1080;

const DEFAULT_RANGE: ReportRange = "90d";

function isRange(value: string | null): value is ReportRange {
  return (REPORT_RANGES as readonly string[]).includes(value ?? "");
}

/** A bucket's key is a UTC date; read it back in UTC so it names the same day. */
function periodLabel(period: string) {
  return new Date(`${period}T00:00:00Z`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** An axis has room for "12K", not for "USD 12,000.00". */
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function ReportsContent({ currency = "USD" }: { currency?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Both live in the URL, so "the last 30 days by source" is a link somebody
  // can send. `by`, not `view`: the app bar reads `view` as the page's name.
  const range = isRange(searchParams.get("range")) ? (searchParams.get("range") as ReportRange) : DEFAULT_RANGE;
  const by = searchParams.get("by") === "source" ? "source" : "owner";

  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const rendered = next.toString();
    return rendered ? `${pathname}?${rendered}` : pathname;
  };

  const reportQuery = useQuery({
    queryKey: ["crm-reports", range],
    queryFn: () => fetchJson<ReportResponse>(`/api/v2/crm/reports?range=${range}`),
    // The last period stays on screen while the next one loads, so changing
    // the period does not collapse the page to skeletons and back.
    placeholderData: (previous) => previous,
  });

  const report = reportQuery.data;
  const money = (value: number) => formatMoney(value, currency);

  return (
    <div className="pb-10" aria-busy={reportQuery.isFetching}>
      {/* Which deals: the period, and whose. Every figure below follows it,
          so it heads the page. "Last 12 months" and its neighbours run past
          400px together, so on a phone the control scrolls in its own rail. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ maxWidth: WIDE }}>
        <div className="scroll-rail max-w-full overflow-x-auto">
          <SegmentedControl
            options={REPORT_RANGES.map((value) => ({ value, label: REPORT_RANGE_LABELS[value] }))}
            value={range}
            onValueChange={(value) =>
              router.replace(hrefWith({ range: value === DEFAULT_RANGE ? null : value }), { scroll: false })
            }
            aria-label="Reporting period"
          />
        </div>
        {report ? (
          <p className="text-sm text-[var(--text-muted)]">
            {report.scope === "TEAM" ? "Everyone's deals" : "Your deals only"}
          </p>
        ) : null}
      </div>

      {reportQuery.error ? (
        <Alert tone="danger" title="The report would not load" className="mt-6">
          {getApiErrorMessage(reportQuery.error)}
        </Alert>
      ) : !report ? (
        <div className="mt-6 space-y-3" aria-busy="true" style={{ maxWidth: WIDE }}>
          <Skeleton height={88} />
          <Skeleton height={280} />
          <Skeleton height={200} />
        </div>
      ) : (
        <>
          <Figures
            items={[
              {
                label: "Win rate",
                value: formatRate(report.winRate),
                meta: `${report.counts.won} won · ${report.counts.lost} lost`,
              },
              {
                label: "Weighted forecast",
                value: money(report.forecast.weighted),
                meta: `${money(report.forecast.unweighted)} if all ${report.forecast.count} land`,
              },
              {
                label: "Typical cycle",
                value: report.medianCycleDays === null ? "—" : `${report.medianCycleDays}d`,
                meta: "Median, opened to closed",
              },
              {
                label: "Leads",
                value: String(report.leads.created),
                meta: `${report.leads.converted} became deals`,
              },
            ]}
          />

          <Section heading="Won over time">
            <AdminTrendChart
              rows={report.trend.won.map((bucket, index) => ({
                label: periodLabel(bucket.period),
                tooltipLabel:
                  report.trend.granularity === "week"
                    ? `Week of ${periodLabel(bucket.period)}`
                    : periodLabel(bucket.period),
                won: bucket.value,
                opened: report.trend.created[index]?.value ?? 0,
              }))}
              series={[
                { key: "won", label: "Won", kind: "area", tone: "success", fillOpacity: 0.12 },
                { key: "opened", label: "Opened", kind: "line", dashed: true },
              ]}
              height={260}
              valueFormatter={money}
              yTickFormatter={(value) => compact.format(value)}
              xTickInterval="preserveStartEnd"
              emptyLabel="Nothing won or opened in this period"
            />
          </Section>

          <Funnel stages={report.funnel} />

          <section aria-label="Who and what brought it in" className="mt-10 space-y-3" style={{ maxWidth: WIDE }}>
            {/* Tabs on their own row: which way to break it down is asked
                after which period, and the two never share a row. */}
            <SectionTabs label="Break the deals down">
              <SectionTab to={hrefWith({ by: null })} active={by === "owner"}>
                By owner
              </SectionTab>
              <SectionTab to={hrefWith({ by: "source" })} active={by === "source"}>
                By source
              </SectionTab>
            </SectionTabs>
            <Performance
              rows={by === "owner" ? report.byOwner : report.bySource}
              noun={by === "owner" ? "Owner" : "Source"}
              hrefFor={by === "owner" ? (row) => (row.key === "unassigned" ? null : `/crm/reps/${row.key}`) : () => null}
              money={money}
            />
          </section>

          <Section heading="Activity logged">
            <AdminStackedBarChart
              rows={report.activity.map((bucket) => ({
                label: periodLabel(bucket.period),
                logged: bucket.count,
              }))}
              series={[{ key: "logged", label: "Calls, emails and notes", color: "var(--primary-500)" }]}
              height={180}
              xTickInterval="preserveStartEnd"
              emptyLabel="Nothing logged in this period"
            />
          </Section>
        </>
      )}
    </div>
  );
}

/** The period's figures: each a sentence-case label over one large mono number. */
function Figures({ items }: { items: Array<{ label: string; value: string; meta: string }> }) {
  return (
    <dl
      className="mt-6 grid gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-4"
      style={{ maxWidth: WIDE }}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-sm text-[var(--text-muted)]">{item.label}</dt>
          <dd className="mt-1 truncate font-mono text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-[var(--text-strong)]">
            {item.value}
          </dd>
          <dd className="mt-1 text-sm text-[var(--text-muted)]">{item.meta}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A chart under its section heading, with no frame round it. */
function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section aria-label={heading} className="min-w-0" style={{ maxWidth: WIDE }}>
      <SectionHeading maxWidth={WIDE}>{heading}</SectionHeading>
      {children}
    </section>
  );
}

/**
 * The pipeline, stage by stage. Two figures per stage, because they answer
 * different questions: how many survive it, and how long the survivors wait.
 * The stage that loses the most is the one figure in warning ink.
 */
function Funnel({ stages }: { stages: ReportResponse["funnel"] }) {
  const leak = biggestLeak(stages);
  return (
    <section aria-labelledby="reports-funnel">
      <SectionHeading count={stages.length} maxWidth={WIDE}>
        <span id="reports-funnel">Where deals drop out</span>
      </SectionHeading>
      <ColumnList
        label="Where deals drop out"
        maxWidth={WIDE}
        empty="No deals in this period yet."
        columns={[
          { id: "stage", label: "Stage" },
          { id: "reached", label: "Reached", align: "end" },
          { id: "kept", label: "From the stage before", align: "end" },
          { id: "days", label: "Median days in stage", align: "end", hideBelow: "sm" },
        ]}
        rows={stages.map((stage, index) => {
          const leaking = leak?.key === stage.key && stage.droppedFromPrevious > 0;
          return {
            id: stage.key,
            cells: {
              stage: (
                <ColumnName
                  name={stage.label}
                  meta={
                    leaking
                      ? `Most lost here: ${stage.droppedFromPrevious} from the stage before`
                      : `${formatRate(stage.shareOfTotal)} of every deal`
                  }
                />
              ),
              reached: <ColumnFigure>{stage.reached}</ColumnFigure>,
              kept:
                index === 0 ? (
                  <ColumnFigure tone="muted">—</ColumnFigure>
                ) : (
                  <ColumnFigure tone={leaking ? "warn" : "default"}>
                    {formatRate(stage.conversionFromPrevious)}
                  </ColumnFigure>
                ),
              days:
                stage.medianDaysInStage === null ? (
                  <ColumnFigure tone="muted">—</ColumnFigure>
                ) : (
                  <ColumnFigure>{`${stage.medianDaysInStage}d`}</ColumnFigure>
                ),
            },
          };
        })}
      />
    </section>
  );
}

/**
 * One row per owner or per source: what they closed, what is still open, and
 * their share of the money won. The total sits under a full-ink rule.
 */
function Performance({
  rows,
  noun,
  hrefFor,
  money,
}: {
  rows: GroupedPerformance[];
  noun: string;
  hrefFor: (row: GroupedPerformance) => string | null;
  money: (value: number) => string;
}) {
  const totalWon = rows.reduce((sum, row) => sum + row.wonValue, 0);
  const totals = rows.reduce(
    (sum, row) => ({ won: sum.won + row.won, lost: sum.lost + row.lost, open: sum.open + row.open }),
    { won: 0, lost: 0, open: 0 },
  );
  const sorted = [...rows].sort((a, b) => b.wonValue - a.wonValue || b.total - a.total);

  return (
    <ColumnList
      label={`Deals by ${noun.toLowerCase()}`}
      maxWidth={WIDE}
      empty="No deals in this period yet."
      columns={[
        { id: "name", label: noun },
        { id: "won", label: "Won", align: "end" },
        { id: "lost", label: "Lost", align: "end", hideBelow: "sm" },
        { id: "open", label: "Open", align: "end", hideBelow: "sm" },
        { id: "rate", label: "Win rate", align: "end", hideBelow: "md" },
        { id: "value", label: "Value won", align: "end" },
        { id: "share", label: "Share", align: "end", hideBelow: "md" },
      ]}
      rows={sorted.map((row) => ({
        id: row.key,
        cells: {
          name: (
            <ColumnName
              name={row.label}
              href={hrefFor(row)}
              meta={row.open > 0 ? `${money(row.openValue)} still open` : undefined}
            />
          ),
          won: <ColumnFigure tone={row.won ? "default" : "muted"}>{row.won}</ColumnFigure>,
          lost: <ColumnFigure tone="muted">{row.lost}</ColumnFigure>,
          open: <ColumnFigure tone="muted">{row.open}</ColumnFigure>,
          rate: <ColumnFigure>{formatRate(row.winRate)}</ColumnFigure>,
          value: <ColumnFigure tone={row.wonValue ? "default" : "muted"}>{money(row.wonValue)}</ColumnFigure>,
          share: (
            <ColumnFigure tone="muted">{totalWon > 0 ? formatRate(row.wonValue / totalWon) : "—"}</ColumnFigure>
          ),
        },
      }))}
      total={
        rows.length > 1
          ? {
              name: "Total",
              won: <ColumnFigure>{totals.won}</ColumnFigure>,
              lost: <ColumnFigure>{totals.lost}</ColumnFigure>,
              open: <ColumnFigure>{totals.open}</ColumnFigure>,
              rate: (
  <ColumnFigure>{formatRate(winRate(totals))}</ColumnFigure>
              ),
              value: <ColumnFigure>{money(totalWon)}</ColumnFigure>,
              share: null,
            }
          : undefined
      }
    />
  );
}
