"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, EmptyState, Skeleton } from "@corelithzw/react";
import { Breakdown, ReportPanel, type BreakdownRow } from "@corelithzw/ui/components/breakdown-panel";
import { MetricTile } from "@corelithzw/module-books/components/hubs/metric-tile";
import {
  ReportTable,
  amt,
  dim,
  nm,
  num,
  txt,
  type ReportRow,
} from "@corelithzw/ui/components/report-table";
import { fetchCrmLeads } from "@/lib/crm/crm-v2";
import { Check, Clock, Coins, FileText, LocalShipping, TrendingUp, type LucideIcon } from "@corelithzw/ui/lib/icons";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { AGEING_BUCKETS, AGEING_LABELS } from "@/lib/crm/collections";

import { money, type HomeData } from "./widgets/home-widgets";

/**
 * The CRM home.
 *
 * A fixed layout, deliberately. This was an arrangeable widget canvas — every
 * panel resizable and reorderable, the arrangement saved per user. That is a
 * lot of machinery for a page whose job is to be the same six numbers every
 * morning, and it had a cost the arranging never paid back: a widget could be
 * dragged to a third of the width whatever it held, so the "won this month"
 * figure and a nine-row pipeline table competed for the same shapes, and no
 * two people's home page looked alike when one of them needed to describe it
 * to the other.
 *
 * Six figures across the top, then the three questions that follow from them —
 * where is the pipeline, what are we owed, what is late. The layout is the
 * design's, and it is the same for everyone.
 */
export function CrmOverview() {
  const dataQuery = useQuery({
    queryKey: ["crm-dashboard"],
    queryFn: () => fetchJson<HomeData>("/api/v2/crm/dashboard"),
  });

  const data = dataQuery.data;
  const currency = data?.currency ?? "USD";

  /**
   * The six. Each is a figure with the one number that qualifies it — a
   * total is not a fact until you know whether it is late, closing, or stale.
   */
  const kpis = useMemo(() => {
    if (!data) return [];
    const delta = data.won.valueDeltaPercent;
    return [
      {
        label: "Won",
        value: money(data.won.value, currency),
        delta:
          delta === null ? `${data.won.closed} closed` : `${delta > 0 ? "+" : ""}${Math.round(delta)}%`,
        note: delta === null ? "in this period" : "on the period before",
        tone: (delta ?? 0) >= 0 ? "good" : "warn",
        href: "/crm/deals?status=won",
        icon: Check,
      },
      {
        label: "In the pipeline",
        value: money(data.pipeline.grossValue, currency),
        delta: `${data.pipeline.openDeals} open`,
        note: `${data.pipeline.closingThisWeek} closing this week`,
        tone: "neutral",
        href: "/crm/deals",
        icon: TrendingUp,
      },
      {
        label: "Owed to us",
        value: money(data.collections.outstanding, currency),
        delta:
          data.collections.overdue > 0
            ? `${money(data.collections.overdue, currency)} overdue`
            : undefined,
        note: data.collections.overdue > 0 ? "past its terms" : "all within terms",
        tone: data.collections.overdue > 0 ? "danger" : "good",
        href: "/crm/invoices",
        icon: Coins,
      },
      {
        label: "Out with customers",
        value: money(data.documents.awaitingValue, currency),
        delta:
          data.documents.oldestAwaitingDays === null
            ? `${data.documents.awaitingApproval} awaiting`
            : `oldest ${data.documents.oldestAwaitingDays}d`,
        note: "quotes not yet answered",
        tone: (data.documents.oldestAwaitingDays ?? 0) > 14 ? "warn" : "neutral",
        href: "/crm/quotes",
        icon: FileText,
      },
      {
        label: "Work in the field",
        value: String(data.delivery.upcomingVisits),
        delta: data.delivery.upcomingVisits === 0 ? undefined : "visits booked",
        note: data.delivery.upcomingVisits === 0 ? "nothing booked" : "coming up",
        tone: "neutral",
        href: "/crm/appointments",
        icon: LocalShipping,
      },
      {
        label: "Waiting on a call",
        value: String(data.speed.breachedLeads + data.speed.atRiskLeads),
        delta:
          data.speed.breachedLeads > 0 ? `${data.speed.breachedLeads} past the promise` : undefined,
        note: data.speed.breachedLeads > 0 ? "answer these first" : "all within the promise",
        tone: data.speed.breachedLeads > 0 ? "danger" : "good",
        href: "/crm/leads",
        icon: Clock,
      },
    ] as Array<{
      label: string;
      value: string;
      delta?: string;
      note: string;
      tone: "neutral" | "good" | "warn" | "danger";
      href: string;
      icon: LucideIcon;
    }>;
  }, [data, currency]);

  /** Open stages only — Won and Lost are outcomes, not places a deal sits. */
  const stageRows = useMemo<BreakdownRow[]>(
    () =>
      (data?.pipeline.byStage ?? [])
        .filter((stage) => stage.status === "OPEN")
        .map((stage) => ({
          label: stage.name,
          amount: stage.value,
          display: `${stage.count} · ${money(stage.value, currency)}`,
          tone: "neutral" as const,
        })),
    [data, currency],
  );

  const ageingRows = useMemo<BreakdownRow[]>(() => {
    const ageing = data?.collections.ageing ?? {};
    return AGEING_BUCKETS.filter((bucket) => (ageing[bucket]?.value ?? 0) > 0).map((bucket) => ({
      label: AGEING_LABELS[bucket],
      amount: ageing[bucket]?.value ?? 0,
      tone:
        bucket === "CURRENT"
          ? ("good" as const)
          : bucket === "D90_PLUS" || bucket === "D61_90"
            ? ("danger" as const)
            : ("warn" as const),
    }));
  }, [data]);

  const taskRows = useMemo<BreakdownRow[]>(() => {
    if (!data) return [];
    return [
      { label: "Overdue", amount: data.tasks.overdue, display: String(data.tasks.overdue), tone: "danger" },
      { label: "Due today", amount: data.tasks.today, display: String(data.tasks.today), tone: "warn" },
      { label: "Open in total", amount: data.tasks.open, display: String(data.tasks.open), tone: "neutral" },
    ];
  }, [data]);

  /**
   * Leads nobody has rung yet, oldest first.
   *
   * Fetched separately because the dashboard endpoint counts these but does
   * not name them, and a count is not something you can act on. Scoped to the
   * first stage: a lead that has moved on has had its call by definition, so
   * anything past NEW does not belong on a list titled "waiting on a first
   * call" however long it has been sitting there.
   */
  const waitingQuery = useQuery({
    queryKey: ["crm-leads", "awaiting-first-call"],
    queryFn: () =>
      fetchCrmLeads({
        filters: { stages: ["NEW"] },
        sort: { field: "createdAt", direction: "asc" },
        limit: 8,
      }),
  });

  const waitingRows = useMemo<ReportRow[]>(() => {
    /*
      "Now" is when the data was fetched, not when React happened to render.

      `Date.now()` here is an impure read during render: two renders of the
      same data could produce different day counts, and the compiler is right
      to reject it. `dataUpdatedAt` is stable for as long as the response is,
      which is also the honest reading — this list is as-at the moment it was
      loaded, and it re-derives when the query refetches.
    */
    const now = waitingQuery.dataUpdatedAt || 0;
    return (waitingQuery.data?.data ?? []).map((lead) => {
      const days = Math.max(0, Math.floor((now - new Date(lead.createdAt).getTime()) / 86_400_000));
      // Three days is the promise. Past it the wait is the problem, so it is
      // the only cell on the row that takes a colour.
      const tone = days >= 7 ? ("bad" as const) : days >= 3 ? ("warn" as const) : ("body" as const);
      return {
        id: lead.id,
        href: `/crm/leads/${lead.id}`,
        cells: [
          nm(lead.title ?? lead.client?.name ?? lead.leadNo),
          txt(lead.sourceChannel ?? lead.source ?? "—", { tone: "subtle" }),
          txt(lead.assignedTo?.name ?? "Unassigned", {
            tone: lead.assignedTo ? "subtle" : "warn",
          }),
          lead.estimatedValue == null
            ? dim()
            : amt(money(lead.estimatedValue, lead.currency || currency)),
          num(days === 0 ? "today" : `${days}d`, { tone, bold: tone !== "body" }),
        ],
      };
    });
  }, [waitingQuery.data, waitingQuery.dataUpdatedAt, currency]);

  const activityRows = useMemo<BreakdownRow[]>(() => {
    if (!data) return [];
    return [
      { label: "Quotes raised", amount: data.documents.quotationsRaised, display: String(data.documents.quotationsRaised), tone: "neutral" },
      { label: "Deals closed", amount: data.won.closed, display: String(data.won.closed), tone: "good" },
      { label: "Leads answered", amount: data.speed.answered, display: String(data.speed.answered), tone: "neutral" },
      { label: "Going stale", amount: data.pipeline.stale, display: String(data.pipeline.stale), tone: data.pipeline.stale > 0 ? "warn" : "neutral" },
    ];
  }, [data]);

  if (dataQuery.isLoading) {
    return (
      <div className="grid grid-cols-12 gap-3" aria-busy="true">
        {/* Spelled out: Tailwind cannot see a computed `col-span-${n}`. */}
        <Skeleton height={92} className="col-span-12 sm:col-span-6 2xl:col-span-2" />
        <Skeleton height={92} className="col-span-12 sm:col-span-6 2xl:col-span-2" />
        <Skeleton height={92} className="col-span-12 sm:col-span-6 2xl:col-span-2" />
        <Skeleton height={92} className="col-span-12 sm:col-span-6 2xl:col-span-2" />
        <Skeleton height={92} className="col-span-12 sm:col-span-6 2xl:col-span-2" />
        <Skeleton height={92} className="col-span-12 sm:col-span-6 2xl:col-span-2" />
        <Skeleton height={220} className="col-span-12 xl:col-span-5" />
        <Skeleton height={220} className="col-span-12 xl:col-span-7" />
      </div>
    );
  }

  if (dataQuery.error) {
    return <Alert tone="danger">{getApiErrorMessage(dataQuery.error)}</Alert>;
  }

  if (!data || (data.pipeline.openDeals === 0 && data.won.closed === 0)) {
    return (
      <EmptyState
        title="Nothing in the pipeline yet"
        body="Once a deal is open, this page shows what is in flight, what is owed to a customer, and what is going quiet."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/*
        Six across at 2xl, stepping to three and then two.

        These were hand-rolled tiles — `text-2xl`, a bespoke note line, its own
        tone lookup — which is how the CRM home ended up with a stat card that
        looked nothing like the one on the accounting home. Same component now,
        so a figure means the same thing and is drawn the same way in both
        modules. The CRM artboards mark each tile with a glyph rather than a
        dot; `MetricTile` takes either.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((kpi) => (
          <MetricTile
            key={kpi.label}
            title={kpi.label}
            // The figure is already formatted — money or a bare count — so
            // `value` only has to carry enough for the tone fallback, which
            // `tone` overrides on every tile here anyway.
            value={0}
            valueLabel={kpi.value}
            delta={kpi.delta}
            detail={kpi.note}
            tone={kpi.tone}
            href={kpi.href}
            icon={kpi.icon}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <ReportPanel className="xl:col-span-5" title="Pipeline by stage" note="open deals only">
          <Breakdown
            rows={stageRows}
            formatValue={(value) => money(value, currency)}
            emptyLabel="No open deals in any stage."
          />
        </ReportPanel>

        {/*
          The one panel on this page that names names.

          Everything else here is a total, and a total is something you read.
          This is something you act on: nine leads nobody has rung, oldest
          first, with the wait in danger ink once it is past the promise. It
          takes the wide half of the row because it is the only thing on the
          page a person can pick up and finish.
        */}
        <ReportPanel
          className="xl:col-span-7"
          title="Waiting on a first call"
          note={
            <Link href="/crm/leads" className="font-semibold text-[var(--brand-strong)]">
              Open all
            </Link>
          }
        >
          <ReportTable
            label="Leads waiting on a first call"
            tracks="minmax(0,1fr) 120px 100px 96px 84px"
            columns={[
              { label: "Lead" },
              { label: "Source" },
              { label: "Owner" },
              { label: "Value", align: "right" },
              { label: "Waiting", align: "right" },
            ]}
            rows={waitingRows}
            emptyLabel="Every lead has had its first call."
          />
        </ReportPanel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <ReportPanel
          className="xl:col-span-4"
          title="Ageing on what we are owed"
          note={money(data.collections.outstanding, currency)}
        >
          <Breakdown
            rows={ageingRows}
            formatValue={(value) => money(value, currency)}
            emptyLabel="Nothing outstanding on a CRM invoice."
          />
        </ReportPanel>

        <ReportPanel className="xl:col-span-4" title="Tasks" note="what the team owes">
          <Breakdown
            rows={taskRows}
            formatValue={(value) => String(value)}
            emptyLabel="No open tasks."
          />
        </ReportPanel>

        <ReportPanel
          className="xl:col-span-4"
          title="What has been happening"
          note={`over the last ${data.periodDays} days`}
        >
          <Breakdown
            rows={activityRows}
            formatValue={(value) => String(value)}
            emptyLabel="Nothing recorded in this period."
          />
        </ReportPanel>
      </div>
    </div>
  );
}
