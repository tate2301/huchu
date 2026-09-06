"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Alert, Card, EmptyState, KpiGrid, RowCard, Skeleton, StatHero, Stack } from "@corelithzw/react";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { AGEING_LABELS, type AgeingBucket } from "@/lib/crm/collections";
import {
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  Receipt,
  Wrench,
} from "@/lib/icons";

type DashboardData = {
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

function money(value: number, currency: string): string {
  // With the currency, always. A dashboard that says "6,168" has told you a
  // digit string, not an amount.
  return value.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

/** "18m", "2h 10m", "3 days" — working time, in the largest unit that is true. */
function duration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  // Nine working hours to a day, matching the SLA clock.
  if (hours < 9) return `${hours}h`;
  const days = Math.round((minutes / (9 * 60)) * 10) / 10;
  return `${days} working day${days === 1 ? "" : "s"}`;
}

/**
 * The CRM home, built to the KPI hero + drilldown recipe: one hero number, a
 * row of secondary KPIs, then rows that lead somewhere.
 *
 * The previous version answered three questions and ignored deals, quotes,
 * invoices, work orders and site visits, so it could not tell you whether
 * anything needed you today. Every number here is a link to the list it came
 * from — a dashboard that cannot be drilled into is a poster.
 */
export function CrmDashboardContent() {
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-dashboard"],
    queryFn: () => fetchJson<DashboardData>("/api/v2/crm/dashboard"),
  });

  if (error) {
    return (
      <Alert tone="danger" title="Couldn't load the dashboard">
        {getApiErrorMessage(error)}
      </Alert>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton height={132} />
        <Skeleton height={96} />
        <Skeleton height={220} />
      </div>
    );
  }

  const { pipeline, won, speed, tasks, documents, collections, delivery } = data;
  const currency = data.currency;
  const needsAttention = tasks.overdue + tasks.legacyOverdue;
  const nothingYet = pipeline.openDeals === 0 && won.count === 0 && documents.quotationsRaised === 0;

  if (nothingYet) {
    return (
      <EmptyState
        title="Nothing in the pipeline yet"
        body="Once a deal is open, this page shows what is in flight, what is owed to a customer, and what is owed to you."
        action={
          <Link href="/crm/deals?new=1" className="btn btn-primary">
            Start a deal
          </Link>
        }
      />
    );
  }

  const openWorkOrders =
    (delivery.workOrders.SCHEDULED ?? 0) + (delivery.workOrders.IN_PROGRESS ?? 0);

  return (
    <div className="space-y-5">
      {/* The hero used to be a probability-weighted pipeline figure. Nobody
          sets those probabilities, so it was mostly the sum of whatever
          defaults happened to be in the column — a number that changed for
          reasons no one could explain and that nothing could be decided on.
          What actually closed is a fact, and it compares to last month. */}
      <StatHero
        label={`Won in the last ${data.periodDays} days`}
        value={money(won.value, currency)}
        subtitle={
          won.winRatePercent === null
            ? `${won.count} deal${won.count === 1 ? "" : "s"} · nothing else closed to compare against`
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
        action={
          <Link href="/crm/leads" className="btn btn-secondary btn-sm">
            Open the board
          </Link>
        }
      />

      {/* Four questions, in the order they cost you money: are we answering
          people, is anything sitting with a customer unanswered, what is in
          flight, and what have we not been paid for. */}
      <KpiGrid cols={4}>
        <KpiGrid.Item
          label="Waiting on a first call"
          value={speed.breachedLeads}
          delta={
            speed.medianResponseMinutes === null
              ? "no answered leads yet"
              : `usually answered in ${duration(speed.medianResponseMinutes)}`
          }
          tone={speed.breachedLeads > 0 ? "danger" : speed.atRiskLeads > 0 ? "warn" : "success"}
          onClick={() => router.push("/crm/leads")}
        />
        <KpiGrid.Item
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
          onClick={() => router.push("/crm/quotes")}
        />
        <KpiGrid.Item
          label="In the pipeline"
          value={money(pipeline.grossValue, currency)}
          delta={`${pipeline.openDeals} open · ${pipeline.closingThisWeek} due to close this week`}
          onClick={() => router.push("/crm/deals")}
        />
        <KpiGrid.Item
          label="Owed to us"
          value={money(collections.outstanding, currency)}
          delta={
            collections.overdue > 0
              ? `${money(collections.overdue, currency)} overdue`
              : "all within terms"
          }
          tone={collections.overdue > 0 ? "warn" : "neutral"}
          onClick={() => router.push("/crm/collections")}
        />
      </KpiGrid>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[var(--text-strong)]">What needs you</h2>
        <div className="grid gap-2">
          <RowCard
            icon={<Clock className="size-4" />}
            title="Overdue follow-ups"
            subtitle={
              needsAttention === 0
                ? "Nothing overdue."
                : `${needsAttention} past due · ${tasks.open} open in total`
            }
            status={<ChevronRight className="size-4 text-[var(--text-subtle)]" />}
            onClick={() => router.push("/crm/follow-ups")}
          />
          <RowCard
            icon={<CheckCircle className="size-4" />}
            title="Deals going stale"
            subtitle={
              pipeline.stale === 0
                ? "Every deal has moved inside its stage's window."
                : `${pipeline.stale} sitting longer than their stage allows`
            }
            status={<ChevronRight className="size-4 text-[var(--text-subtle)]" />}
            onClick={() => router.push("/crm/leads")}
          />
          <RowCard
            icon={<FileText className="size-4" />}
            title="Quotes awaiting a decision"
            subtitle={
              documents.awaitingApproval === 0 && documents.pendingDiscountApprovals === 0
                ? "Nothing waiting on a customer or a manager."
                : [
                    documents.awaitingApproval > 0
                      ? `${documents.awaitingApproval} with the customer`
                      : null,
                    documents.pendingDiscountApprovals > 0
                      ? `${documents.pendingDiscountApprovals} discount${documents.pendingDiscountApprovals === 1 ? "" : "s"} to approve`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
            status={<ChevronRight className="size-4 text-[var(--text-subtle)]" />}
            onClick={() => router.push("/crm/deals")}
          />
          <RowCard
            icon={<Receipt className="size-4" />}
            title="Invoices to collect"
            subtitle={
              collections.invoiceCount === 0
                ? "Nothing outstanding from a CRM quote."
                : `${collections.invoiceCount} open · ${money(collections.outstanding, currency)} outstanding`
            }
            status={<ChevronRight className="size-4 text-[var(--text-subtle)]" />}
            onClick={() => router.push("/crm/collections")}
          />
          <RowCard
            icon={<Wrench className="size-4" />}
            title="Work in the field"
            subtitle={
              openWorkOrders === 0 && delivery.upcomingVisits === 0
                ? "Nothing scheduled."
                : [
                    openWorkOrders > 0 ? `${openWorkOrders} work order${openWorkOrders === 1 ? "" : "s"} live` : null,
                    delivery.upcomingVisits > 0
                      ? `${delivery.upcomingVisits} visit${delivery.upcomingVisits === 1 ? "" : "s"} this week`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
            status={<ChevronRight className="size-4 text-[var(--text-subtle)]" />}
            onClick={() => router.push("/crm/work-orders")}
          />
          <RowCard
            icon={<Calendar className="size-4" />}
            title="Closing this week"
            subtitle={
              pipeline.closingThisWeek === 0
                ? "Nothing forecast to close in the next seven days."
                : `${pipeline.closingThisWeek} deal${pipeline.closingThisWeek === 1 ? "" : "s"} expected to close`
            }
            status={<ChevronRight className="size-4 text-[var(--text-subtle)]" />}
            onClick={() => router.push("/crm/deals")}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
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
                        className="h-2 rounded-full bg-[var(--brand)]"
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
                  <li
                    key={bucket}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
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
      </div>
    </div>
  );
}
