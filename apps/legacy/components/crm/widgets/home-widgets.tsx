"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Card, EmptyState, KpiGrid, StatHero, Stack } from "@corelithzw/react";
import { AGEING_LABELS, type AgeingBucket } from "@/lib/crm/collections";
import { LEAD_STAGE_COLOR } from "@/lib/crm/tones";
import { cn } from "@/lib/utils";

export type HomeData = {
  scope: "TEAM" | "MINE";
  periodDays: number;
  currency: string;
  pipeline: {
    openDeals: number;
    grossValue: number;
    byStage: Array<{ id: string; name: string; status: string; count: number; value: number }>;
    stale: number;
    closingThisWeek: number;
  };
  won: {
    count: number;
    value: number;
    lost: number;
    valueDeltaPercent: number | null;
    previousValue: number;
    winRatePercent: number | null;
    closed: number;
  };
  speed: {
    breachedLeads: number;
    atRiskLeads: number;
    medianResponseMinutes: number | null;
    answered: number;
  };
  tasks: { overdue: number; today: number; open: number; legacyOverdue: number };
  documents: {
    quotationsRaised: number;
    quotedValue: number;
    awaitingApproval: number;
    awaitingValue: number;
    oldestAwaitingDays: number | null;
    pendingDiscountApprovals: number;
  };
  collections: {
    outstanding: number;
    overdue: number;
    invoiceCount: number;
    ageing: Partial<Record<AgeingBucket, { count: number; value: number }>>;
  };
  delivery: { workOrders: Record<string, number>; upcomingVisits: number };
};

export function money(value: number, currency: string): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  if (hours < 9) return `${hours}h`;
  const days = Math.round((minutes / (9 * 60)) * 10) / 10;
  return `${days} working day${days === 1 ? "" : "s"}`;
}

/**
 * One KPI, framed so a row of them reads as one thing.
 *
 * `KpiGrid.Item` expects to live in a `KpiGrid`, and a widget is its own box —
 * so each metric widget is a one-item grid rather than a bare item, which
 * keeps the design system's spacing and click target rather than
 * reimplementing them.
 */
function Metric({
  label,
  value,
  delta,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  delta?: string;
  tone?: "neutral" | "success" | "warn" | "danger";
  href?: string;
}) {
  const router = useRouter();
  return (
    <KpiGrid cols={1}>
      <KpiGrid.Item
        label={label}
        value={value}
        delta={delta}
        tone={tone}
        onClick={href ? () => router.push(href) : undefined}
      />
    </KpiGrid>
  );
}

/**
 * Every widget the CRM home can show, keyed by its type.
 *
 * Each takes the one dashboard payload rather than fetching its own: the
 * figures on this page are all cuts of the same question, and ten widgets
 * each firing a request would make a page that is slower the more of it you
 * use.
 */
export function renderHomeWidget(type: string, data: HomeData): React.ReactNode {
  const { pipeline, won, speed, tasks, documents, collections, delivery } = data;
  const currency = data.currency;

  switch (type) {
    case "won-this-period":
      return (
        <StatHero
          label={`Won in the last ${data.periodDays} days`}
          value={money(won.value, currency)}
          subtitle={
            won.winRatePercent === null
              ? `${won.count} deal${won.count === 1 ? "" : "s"}`
              : `${won.count} of ${won.closed} closed · ${won.winRatePercent}% win rate`
          }
          change={
            won.valueDeltaPercent === null
              ? `${money(won.previousValue, currency)} in the previous ${data.periodDays} days`
              : `${won.valueDeltaPercent >= 0 ? "+" : ""}${won.valueDeltaPercent}% against the previous ${data.periodDays} days`
          }
          trend={
            won.valueDeltaPercent === null
              ? "neutral"
              : won.valueDeltaPercent >= 0
                ? "up"
                : "down"
          }
        />
      );

    case "open-pipeline":
      return (
        <Metric
          label="In the pipeline"
          value={money(pipeline.grossValue, currency)}
          delta={`${pipeline.openDeals} open · ${pipeline.closingThisWeek} due to close this week`}
          href="/crm/deals"
        />
      );

    case "owed-to-us":
      return (
        <Metric
          label="Owed to us"
          value={money(collections.outstanding, currency)}
          delta={
            collections.overdue > 0
              ? `${money(collections.overdue, currency)} overdue`
              : "all within terms"
          }
          tone={collections.overdue > 0 ? "warn" : "neutral"}
          href="/crm/collections"
        />
      );

    case "quotes-with-customers":
      return (
        <Metric
          label="Out with customers"
          value={money(documents.awaitingValue, currency)}
          delta={
            documents.awaitingApproval === 0
              ? "no quotes waiting on a decision"
              : documents.oldestAwaitingDays === null
                ? `${documents.awaitingApproval} quote${documents.awaitingApproval === 1 ? "" : "s"}`
                : `${documents.awaitingApproval} quote${documents.awaitingApproval === 1 ? "" : "s"} · oldest ${documents.oldestAwaitingDays} days`
          }
          tone={
            documents.oldestAwaitingDays !== null && documents.oldestAwaitingDays > 7
              ? "warn"
              : "neutral"
          }
          href="/crm/quotes"
        />
      );

    case "first-contact":
      return (
        <Metric
          label="Waiting on a first call"
          value={speed.breachedLeads}
          delta={
            speed.medianResponseMinutes === null
              ? "no answered leads yet"
              : `usually answered in ${duration(speed.medianResponseMinutes)}`
          }
          tone={speed.breachedLeads > 0 ? "danger" : speed.atRiskLeads > 0 ? "warn" : "success"}
          href="/crm/leads"
        />
      );

    case "work-in-the-field": {
      const open = (delivery.workOrders.SCHEDULED ?? 0) + (delivery.workOrders.IN_PROGRESS ?? 0);
      return (
        <Metric
          label="Work in the field"
          value={open}
          delta={
            delivery.upcomingVisits > 0
              ? `${delivery.upcomingVisits} visit${delivery.upcomingVisits === 1 ? "" : "s"} this week`
              : "nothing booked this week"
          }
          href="/crm/work-orders"
        />
      );
    }

    case "pipeline-by-stage":
    case "stage-funnel":
      return (
        <Card title="Pipeline by stage">
          {pipeline.byStage.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No stages configured yet.</p>
          ) : (
            <Stack as="ul" gap="sm">
              {pipeline.byStage.map((stage) => {
                const share =
                  pipeline.grossValue > 0 ? (stage.value / pipeline.grossValue) * 100 : 0;
                return (
                  <li key={stage.id}>
                    <Link
                      href={`/crm/deals?stageId=${stage.id}`}
                      className="flex items-center gap-3 text-sm hover:underline"
                    >
                      {/* The name, the bar and the money share one row. 32rem of
                          name leaves the money nowhere to go at phone width,
                          so the label gives up a quarter of itself there. */}
                      <span className="w-24 shrink-0 truncate sm:w-32">{stage.name}</span>
                      <span
                        className={cn(
                          "h-2 rounded-full",
                          LEAD_STAGE_COLOR[stage.status]?.band ?? "bg-[var(--brand)]",
                        )}
                        style={{ width: `${Math.max(share, stage.count > 0 ? 3 : 0)}%` }}
                        aria-hidden="true"
                      />
                      <span className="ml-auto shrink-0 font-mono text-sm text-[var(--text-muted)]">
                        {stage.count} · {money(stage.value, currency)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </Stack>
          )}
        </Card>
      );

    case "ageing":
      return (
        <Card title="Ageing on what we are owed">
          {collections.invoiceCount === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Nothing outstanding on a CRM invoice.
            </p>
          ) : (
            <Stack as="ul" gap="sm">
              {(Object.keys(AGEING_LABELS) as AgeingBucket[]).map((bucket) => {
                const row = collections.ageing[bucket];
                return (
                  <li key={bucket} className="flex items-center justify-between gap-3 text-sm">
                    <span>{AGEING_LABELS[bucket]}</span>
                    <span className="font-mono text-sm text-[var(--text-muted)]">
                      {row ? `${row.count} · ${money(row.value, currency)}` : "—"}
                    </span>
                  </li>
                );
              })}
            </Stack>
          )}
        </Card>
      );

    case "my-tasks": {
      const needsAttention = tasks.overdue + tasks.legacyOverdue;
      return (
        <Card
          title="Tasks"
          actions={
            <Link href="/crm/follow-ups" className="text-sm hover:underline">
              Open
            </Link>
          }
        >
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Overdue</dt>
              <dd
                className={cn(
                  "font-mono",
                  needsAttention > 0 && "text-[var(--status-danger-fg)]",
                )}
              >
                {needsAttention}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Due today</dt>
              <dd className="font-mono">{tasks.today}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Open in total</dt>
              <dd className="font-mono">{tasks.open}</dd>
            </div>
          </dl>
        </Card>
      );
    }

    case "activity-summary":
      return (
        <Card title="What has been happening">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Quotes raised</dt>
              <dd className="font-mono">{documents.quotationsRaised}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Deals closed</dt>
              <dd className="font-mono">{won.closed}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Leads answered</dt>
              <dd className="font-mono">{speed.answered}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Going stale</dt>
              <dd className="font-mono">{pipeline.stale}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Over the last {data.periodDays} days.
          </p>
        </Card>
      );

    case "upcoming-visits":
      return (
        <Card
          title="Upcoming visits"
          actions={
            <Link href="/crm/appointments" className="text-sm hover:underline">
              Open
            </Link>
          }
        >
          <p className="acct-stat-value font-mono tabular-nums text-[var(--text-strong)]">{delivery.upcomingVisits}</p>
          <p className="text-sm text-[var(--text-muted)]">Booked in the next seven days.</p>
        </Card>
      );

    default:
      // A layout can outlive a widget — somebody's saved arrangement should not
      // blank the page because one tile was retired.
      return (
        <EmptyState
          title="This widget is no longer available"
          body="Remove it from the page, or leave it and it will stay hidden."
        />
      );
  }
}
