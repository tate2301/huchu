"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Alert, EmptyState, Skeleton } from "@corelithzw/react";
import { ButtonLink, Icon, Kit, type IconName } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchCrmLeads } from "@/lib/crm/crm-v2";
import { registerHref } from "@/lib/crm/registers/href";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { AGEING_BUCKETS, AGEING_LABELS } from "@/lib/crm/collections";
import { CrmFinding } from "@/components/crm/crm-finding";

import { duration, money, type HomeData } from "./widgets/home-widgets";

const NEW_LEAD = {
  label: "New lead",
  icon: "plus" as const,
  href: "/crm/leads?new=1",
  shortcut: "N",
};

const QUICK_RECORD = [
  { key: "deal", icon: "pipeline" as IconName, label: "New deal", href: "/crm/deals?new=1" },
  { key: "quote", icon: "docs" as IconName, label: "New quote", href: "/books/quotes/new" },
  { key: "visit", icon: "calendar" as IconName, label: "Book a site visit", href: "/crm/appointments?new=1" },
  { key: "job", icon: "working" as IconName, label: "New workshop / field job", href: "/crm/projects/jobs?new=1" },
  { key: "person", icon: "person" as IconName, label: "New contact or client", href: "/crm/people?new=1" },
] as const;

type NeedRow = {
  key: string;
  icon: IconName;
  lead: string;
  detail: string;
  urgency: "ink" | "default" | "quiet";
  actionLabel: string;
  href: string;
};

/**
 * CRM Home — Books ledger & commercial overview (`BkMoneyView` counterpart).
 *
 * Designed for Zimbabwean commercial teams across workshops & joinery/carpenters,
 * solar & borehole contractors, design & software agencies, consultants, law
 * practices, and real estate:
 *   1. Executive finding banner (30-day revenue won, weighted pipeline forecast,
 *      and immediate collection or response bottlenecks).
 *   2. 6-cell hairline KPI strip (`Won 30d`, `Open pipeline`, `Quotes with clients`,
 *      `Owed on invoices`, `Field & workshop`, `Waiting on a call / WhatsApp`).
 *   3. "Needs you today" action queue weighted by urgency (ink / default / quiet).
 *   4. Pipeline funnel & weighted forecast by stage (`.crm-bk-shares` proportion bars).
 *   5. Acquisition channel attribution (WhatsApp & direct calls, Referrals & repeat
 *      clients, Walk-in & showroom, Social & ads, Website & forms, Tenders & RFQs).
 *   6. Service lines / practice areas breakdown when service tags are present.
 *   7. Full-bleed "Waiting on a first call or WhatsApp" worksheet table.
 *   8. Multi-currency commercial book (`USD`, `ZWG`, `ZAR`) & Right Rail with
 *      Receivables Ageing, Commercial Velocity, and Field & Workshop Delivery.
 */
export function CrmOverview() {
  const router = useRouter();

  const dataQuery = useQuery({
    queryKey: ["crm-dashboard"],
    queryFn: () => fetchJson<HomeData>("/api/v2/crm/dashboard"),
  });

  const waitingQuery = useQuery({
    queryKey: ["crm-leads", "awaiting-first-call"],
    queryFn: () =>
      fetchCrmLeads({
        state: { filters: { stage: ["NEW"] }, sort: { key: "created", dir: "asc" } },
        limit: 8,
      }),
  });

  const data = dataQuery.data;
  const currency = data?.currency ?? "USD";

  const finding = useMemo(() => {
    if (!data) return null;
    const { won, pipeline, collections, documents, speed } = data;
    const deltaText =
      won.valueDeltaPercent === null
        ? `${won.count} deal${won.count === 1 ? "" : "s"} closed in the last ${data.periodDays} days`
        : `${won.valueDeltaPercent >= 0 ? "+" : ""}${Math.round(won.valueDeltaPercent)}% vs the prior ${data.periodDays} days`;

    const fact = `${money(won.value, currency)} won (${deltaText}) · ${money(pipeline.grossValue, currency)} open across ${pipeline.openDeals} deal${pipeline.openDeals === 1 ? "" : "s"}`;

    const restParts: string[] = [];
    if (pipeline.weightedValue != null && pipeline.weightedValue > 0) {
      restParts.push(`${money(pipeline.weightedValue, currency)} weighted forecast`);
    }
    if (documents.awaitingApproval > 0) {
      restParts.push(
        `${money(documents.awaitingValue, currency)} out on ${documents.awaitingApproval} quote${documents.awaitingApproval === 1 ? "" : "s"} awaiting client sign-off`,
      );
    }
    if (collections.overdue > 0) {
      restParts.push(`${money(collections.overdue, currency)} overdue on invoices`);
    }
    if (speed.breachedLeads > 0) {
      restParts.push(
        `${speed.breachedLeads} enquir${speed.breachedLeads === 1 ? "y" : "ies"} waiting past first-contact SLA`,
      );
    }

    return {
      fact,
      rest: restParts.length > 0 ? `— ${restParts.join(" · ")}.` : "— all quotes and enquiries are within terms.",
    };
  }, [data, currency]);

  const kpis = useMemo(() => {
    if (!data) return [];
    const { won, pipeline, collections, documents, delivery, speed } = data;
    const delta = won.valueDeltaPercent;
    const activeFieldJobs =
      (delivery.workOrders.SCHEDULED ?? 0) + (delivery.workOrders.IN_PROGRESS ?? 0);
    const activeProjects =
      (delivery.projects?.ACTIVE ?? 0) + (delivery.projects?.PLANNING ?? 0);
    const waitingCalls = speed.breachedLeads + speed.atRiskLeads;

    return [
      {
        label: `Won (${data.periodDays}d)`,
        value: money(won.value, currency),
        note:
          delta === null
            ? `${won.count} closed · ${won.winRatePercent != null ? `${won.winRatePercent}% win rate` : "no prior baseline"}`
            : `${delta >= 0 ? "+" : ""}${Math.round(delta)}% vs prior ${data.periodDays}d · ${won.winRatePercent ?? 0}% win rate`,
        tone: (delta ?? 0) >= 0 ? ("ok" as const) : ("warn" as const),
        href: registerHref("DEAL", {}, { view: "won" }),
      },
      {
        label: "Open pipeline",
        value: money(pipeline.grossValue, currency),
        note: `${pipeline.openDeals} open · ${money(pipeline.weightedValue ?? pipeline.grossValue, currency)} weighted`,
        tone: "default" as const,
        href: "/crm/deals",
      },
      {
        label: "Quotes with clients",
        value: money(documents.awaitingValue, currency),
        note:
          documents.awaitingApproval === 0
            ? `${documents.quotationsRaised} raised this month`
            : `${documents.awaitingApproval} awaiting deposit/approval${documents.oldestAwaitingDays != null ? ` · oldest ${documents.oldestAwaitingDays}d` : ""}`,
        tone: (documents.oldestAwaitingDays ?? 0) > 10 ? ("warn" as const) : ("default" as const),
        href: "/books/quotes",
      },
      {
        label: "Owed on invoices",
        value: money(collections.outstanding, currency),
        note:
          collections.overdue > 0
            ? `${money(collections.overdue, currency)} overdue across ${collections.invoiceCount} invoice${collections.invoiceCount === 1 ? "" : "s"}`
            : collections.invoiceCount > 0
              ? `${collections.invoiceCount} open · all within terms`
              : "nothing outstanding",
        tone: collections.overdue > 0 ? ("bad" as const) : ("ok" as const),
        href: "/crm/finance",
      },
      {
        label: "Field & workshop",
        value: `${activeFieldJobs} job${activeFieldJobs === 1 ? "" : "s"}`,
        note: `${activeProjects} active project${activeProjects === 1 ? "" : "s"} · ${delivery.upcomingVisits} site visit${delivery.upcomingVisits === 1 ? "" : "s"} (7d)`,
        tone: (delivery.workOrders.BLOCKED ?? 0) > 0 ? ("warn" as const) : ("default" as const),
        href: "/crm/projects/jobs",
      },
      {
        label: "First call / WhatsApp",
        value: String(waitingCalls),
        note:
          speed.breachedLeads > 0
            ? `${speed.breachedLeads} past SLA${speed.medianResponseMinutes != null ? ` · median ${duration(speed.medianResponseMinutes)}` : ""}`
            : speed.medianResponseMinutes != null
              ? `all on time · median reply ${duration(speed.medianResponseMinutes)}`
              : "all enquiries answered on time",
        tone: speed.breachedLeads > 0 ? ("bad" as const) : ("ok" as const),
        href: "/crm/leads",
      },
    ];
  }, [data, currency]);

  const needs = useMemo<NeedRow[]>(() => {
    if (!data) return [];
    const { speed, documents, collections, tasks, delivery, pipeline } = data;
    const rows: NeedRow[] = [];

    if (speed.breachedLeads > 0 || speed.atRiskLeads > 0) {
      const total = speed.breachedLeads + speed.atRiskLeads;
      rows.push({
        key: "first-contact",
        icon: "person",
        lead: `${total} new enquir${total === 1 ? "y" : "ies"} waiting on a first call or WhatsApp`,
        detail:
          speed.breachedLeads > 0
            ? `${speed.breachedLeads} past the response promise · fast WhatsApp or phone follow-up wins the job`
            : `${speed.atRiskLeads} approaching the response cutoff`,
        urgency: speed.breachedLeads > 0 ? "ink" : "default",
        actionLabel: "Call / WhatsApp",
        href: "/crm/leads",
      });
    }

    if (documents.awaitingApproval > 0) {
      rows.push({
        key: "quotes-awaiting",
        icon: "docs",
        lead: `${documents.awaitingApproval} quotation${documents.awaitingApproval === 1 ? "" : "s"} (${money(documents.awaitingValue, currency)}) out with clients`,
        detail:
          documents.oldestAwaitingDays != null
            ? `Oldest sent ${documents.oldestAwaitingDays} day${documents.oldestAwaitingDays === 1 ? "" : "s"} ago · follow up on deposit or scope sign-off`
            : "Awaiting customer sign-off or deposit payment",
        urgency: (documents.oldestAwaitingDays ?? 0) > 7 ? "ink" : "default",
        actionLabel: "Chase quotes",
        href: "/books/quotes",
      });
    }

    if (collections.overdue > 0) {
      rows.push({
        key: "overdue-collections",
        icon: "invoice",
        lead: `${money(collections.overdue, currency)} overdue on issued client invoices`,
        detail: `${money(collections.outstanding, currency)} total receivable across ${collections.invoiceCount} open invoice${collections.invoiceCount === 1 ? "" : "s"}`,
        urgency: "ink",
        actionLabel: "Collect payment",
        href: "/crm/finance",
      });
    }

    const totalOverdueTasks = tasks.overdue + tasks.legacyOverdue;
    if (totalOverdueTasks > 0 || tasks.today > 0) {
      rows.push({
        key: "tasks-followups",
        icon: "check",
        lead:
          totalOverdueTasks > 0
            ? `${totalOverdueTasks} overdue follow-up${totalOverdueTasks === 1 ? "" : "s"} and ${tasks.today} due today`
            : `${tasks.today} task${tasks.today === 1 ? "" : "s"} & client follow-ups due today`,
        detail: `${tasks.open} open tasks across the team`,
        urgency: totalOverdueTasks > 0 ? "default" : "quiet",
        actionLabel: "Open tasks",
        href: "/crm/tasks",
      });
    }

    const blockedJobs = delivery.workOrders.BLOCKED ?? 0;
    const overdueVisits = delivery.overdueVisits ?? 0;
    const todayVisits = delivery.todayVisits ?? 0;
    if (blockedJobs > 0 || overdueVisits > 0 || todayVisits > 0) {
      const parts: string[] = [];
      if (blockedJobs > 0) parts.push(`${blockedJobs} blocked job${blockedJobs === 1 ? "" : "s"} on site/workshop`);
      if (todayVisits > 0) parts.push(`${todayVisits} site visit${todayVisits === 1 ? "" : "s"} today`);
      if (overdueVisits > 0) parts.push(`${overdueVisits} unlogged past visit${overdueVisits === 1 ? "" : "s"}`);
      rows.push({
        key: "field-ops",
        icon: "working",
        lead: parts.join(" · "),
        detail: `${delivery.upcomingVisits} site visit${delivery.upcomingVisits === 1 ? "" : "s"} booked over the next 7 days`,
        urgency: blockedJobs > 0 ? "ink" : "default",
        actionLabel: blockedJobs > 0 ? "Resolve jobs" : "Site visits",
        href: blockedJobs > 0 ? "/crm/projects/jobs" : "/crm/appointments",
      });
    }

    if (pipeline.stale > 0 || pipeline.closingThisWeek > 0) {
      rows.push({
        key: "pipeline-hygiene",
        icon: "pipeline",
        lead:
          pipeline.closingThisWeek > 0
            ? `${pipeline.closingThisWeek} deal${pipeline.closingThisWeek === 1 ? "" : "s"} (${money(pipeline.closingThisWeekValue ?? 0, currency)}) expected to close this week`
            : `${pipeline.stale} deal${pipeline.stale === 1 ? "" : "s"} sitting longer than their stage allows`,
        detail:
          pipeline.stale > 0 && pipeline.closingThisWeek > 0
            ? `${pipeline.stale} deal${pipeline.stale === 1 ? "" : "s"} going quiet past stage SLA`
            : "Review next steps, site measurements, or revised pricing",
        urgency: pipeline.closingThisWeek > 0 ? "default" : "quiet",
        actionLabel: "Open pipeline",
        href: "/crm/deals",
      });
    }

    if (documents.pendingDiscountApprovals > 0) {
      rows.push({
        key: "discount-approvals",
        icon: "docs",
        lead: `${documents.pendingDiscountApprovals} discount request${documents.pendingDiscountApprovals === 1 ? "" : "s"} waiting on manager approval`,
        detail: "Sales reps are waiting to send final pricing to the client",
        urgency: "ink",
        actionLabel: "Review discounts",
        href: "/crm/deals",
      });
    }

    return rows;
  }, [data, currency]);

  const openStages = useMemo(() => {
    if (!data) return [];
    const stages = data.pipeline.byStage.filter((s) => s.status === "OPEN");
    const maxVal = Math.max(1, ...stages.map((s) => s.value), data.pipeline.grossValue);
    return stages.map((stage) => {
      const share =
        data.pipeline.grossValue > 0
          ? Math.round((stage.value / data.pipeline.grossValue) * 100)
          : 0;
      const bar = stage.value > 0 ? Math.max(4, Math.round((stage.value / maxVal) * 100)) : stage.count > 0 ? 4 : 0;
      return {
        ...stage,
        share,
        bar,
      };
    });
  }, [data]);

  const waitingRows = useMemo(() => {
    const now = waitingQuery.dataUpdatedAt || 0;
    return (waitingQuery.data?.data ?? []).map((lead) => {
      const days = Math.max(0, Math.floor((now - new Date(lead.createdAt).getTime()) / 86_400_000));
      const tone = days >= 7 ? "bad" : days >= 3 ? "warn" : "default";
      return {
        id: lead.id,
        href: `/crm/leads/${lead.id}`,
        leadNo: lead.leadNo,
        title: lead.title ?? lead.client?.name ?? lead.contactName ?? lead.leadNo,
        clientName: lead.client?.name ?? lead.contactName ?? null,
        channel: lead.source ?? lead.sourceChannel ?? "Direct",
        owner: lead.assignedTo?.name ?? "Unassigned",
        isUnassigned: !lead.assignedTo,
        amount:
          lead.estimatedValue == null
            ? null
            : money(lead.estimatedValue, lead.currency || currency),
        waitLabel: days === 0 ? "Today" : `${days}d`,
        tone,
      };
    });
  }, [waitingQuery.data, waitingQuery.dataUpdatedAt, currency]);

  if (dataQuery.isLoading) {
    return (
      <>
        <PageChrome title="Home" primary={NEW_LEAD} />
        <div className="crm-bk-worksheet" aria-busy="true">
          <div className="p-6 space-y-4">
            <Skeleton height={48} />
            <Skeleton height={84} />
            <Skeleton height={240} />
            <Skeleton height={220} />
          </div>
        </div>
      </>
    );
  }

  if (dataQuery.error) {
    return (
      <>
        <PageChrome title="Home" primary={NEW_LEAD} />
        <Alert tone="danger">{getApiErrorMessage(dataQuery.error)}</Alert>
      </>
    );
  }

  if (
    !data ||
    (data.pipeline.openDeals === 0 &&
      data.won.closed === 0 &&
      data.documents.quotationsRaised === 0 &&
      (waitingQuery.data?.data?.length ?? 0) === 0)
  ) {
    return (
      <>
        <PageChrome title="Home" primary={NEW_LEAD} />
        <EmptyState
          title="Nothing in the pipeline yet"
          body="Log your first WhatsApp enquiry, site visit, or deal to track pipeline stages, quotes out with customers, workshop jobs, and invoice collections."
          action={
            <Link href="/crm/leads?new=1" className="btn btn-primary">
              New lead
            </Link>
          }
        />
      </>
    );
  }

  const { pipeline, won, speed, tasks, documents, collections, delivery } = data;
  const sources = data.sources ?? [];
  const services = data.services ?? [];
  const currencies = data.currencies ?? [];

  const workOrderTotal = Object.values(delivery.workOrders).reduce((a, b) => a + b, 0);
  const projectTotal = Object.values(delivery.projects ?? {}).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageChrome title="Home" primary={NEW_LEAD}>
        <Kit contents>
          <MenuButton
            label="Record"
            align="end"
            items={QUICK_RECORD.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
              onSelect: () => router.push(item.href),
            }))}
          >
            Record
          </MenuButton>
        </Kit>
      </PageChrome>

      <div className="crm-bk-rec">
        {/* Main Worksheet Column */}
        <div className="crm-bk-main">
          {/* 1. Books Narrative Finding Banner */}
          {finding ? (
            <CrmFinding
              fact={finding.fact}
              rest={finding.rest}
              scope={data.scope === "TEAM" ? "All reps" : "My book"}
              window={data.periodDays}
              role="status"
            />
          ) : null}

          {/* 2. Six-Cell Hairline KPI Strip */}
          <div className="crm-bk-strip" aria-label="Key commercial figures">
            <div
              className="crm-bk-kstrip"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))" }}
            >
              {kpis.map((tile) => (
                <Link key={tile.label} href={tile.href} className="crm-bk-kt crm-bk-kt-link">
                  <span className="crm-bk-kt-l">{tile.label}</span>
                  <span
                    className="crm-bk-kt-v"
                    style={
                      tile.tone === "bad"
                        ? { color: "var(--color-danger)" }
                        : tile.tone === "warn"
                          ? { color: "var(--color-warning)" }
                          : tile.tone === "ok"
                            ? { color: "var(--color-success)" }
                            : undefined
                    }
                  >
                    {tile.value}
                  </span>
                  <span className="crm-bk-kt-n">{tile.note}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* 3. Needs You Today (Action Queue) */}
          <section aria-labelledby="crm-home-needs">
            <div className="crm-bk-group-head">
              <h2 id="crm-home-needs">Needs you today</h2>
              <span className="sum">
                {needs.length === 0 ? "All clear" : `${needs.length} item${needs.length === 1 ? "" : "s"}`}
              </span>
            </div>
            {needs.length === 0 ? (
              <p className="px-6 py-4 text-[13.5px] text-[var(--color-ink-2)]">
                Every new enquiry has been answered, no quotes or follow-ups are overdue, and all field jobs are moving on schedule.
              </p>
            ) : (
              <div className="crm-bk-needs">
                {needs.map((need) => (
                  <div className="crm-bk-need" key={need.key}>
                    <span className="crm-bk-need-ic">
                      <Icon name={need.icon} />
                    </span>
                    <div className="crm-bk-need-body">
                      <span className="crm-bk-need-lead">{need.lead}</span>
                      <span className="crm-bk-need-sub">{need.detail}</span>
                    </div>
                    <div className="crm-bk-need-act">
                      <Kit contents>
                        <ButtonLink href={need.href} variant={need.urgency}>
                          {need.actionLabel}
                        </ButtonLink>
                      </Kit>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 4. Pipeline by Stage & Weighted Forecast */}
          <section aria-labelledby="crm-home-pipeline">
            <div className="crm-bk-group-head">
              <h2 id="crm-home-pipeline">Pipeline by stage</h2>
              <span className="sum">
                {pipeline.openDeals} open · {money(pipeline.grossValue, currency)} gross ·{" "}
                {money(pipeline.weightedValue ?? pipeline.grossValue, currency)} weighted
              </span>
            </div>
            {openStages.length === 0 ? (
              <p className="px-6 py-4 text-[13.5px] text-[var(--color-ink-2)]">
                No open deals in any pipeline stage yet.
              </p>
            ) : (
              <div className="crm-bk-shares">
                {openStages.map((stage) => (
                  <Link
                    key={stage.id}
                    href={registerHref("DEAL", { filters: { stage: [stage.id] }, layout: "TABLE" })}
                    className="crm-bk-share"
                  >
                    <span className="crm-bk-share-label">{stage.name}</span>
                    <span className="crm-bk-share-track" aria-hidden="true">
                      <span className="crm-bk-share-bar" style={{ width: `${stage.bar}%` }} />
                    </span>
                    <span className="crm-bk-share-meta is-count">
                      {stage.count} {stage.count === 1 ? "deal" : "deals"}
                    </span>
                    <span className="crm-bk-share-meta">{stage.share}%</span>
                    <span className="crm-bk-share-val">{money(stage.value, currency)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 5. Where Enquiries & Deals Come From (Zimbabwe Channel Attribution) */}
          <section aria-labelledby="crm-home-sources">
            <div className="crm-bk-group-head">
              <h2 id="crm-home-sources">Where business is coming from</h2>
              <span className="sum">
                Enquiries & deals by channel · {sources.reduce((s, r) => s + r.count, 0)} records
              </span>
            </div>
            {sources.length === 0 ? (
              <p className="px-6 py-4 text-[13.5px] text-[var(--color-ink-2)]">
                Record lead sources (WhatsApp, Referral, Walk-in, Website, Tender) to see which channel brings the best work.
              </p>
            ) : (
              <div className="crm-bk-shares">
                {sources.map((src) => (
                  <div key={src.key} className="crm-bk-share">
                    <span className="crm-bk-share-label">{src.label}</span>
                    <span className="crm-bk-share-track" aria-hidden="true">
                      <span
                        className="crm-bk-share-bar is-ok"
                        style={{ width: `${Math.max(src.share, src.count > 0 ? 4 : 0)}%` }}
                      />
                    </span>
                    <span className="crm-bk-share-meta is-count">{src.count}</span>
                    <span className="crm-bk-share-meta">{src.share}%</span>
                    <span className="crm-bk-share-val">{money(src.value, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 6. Service Lines / Workshop & Practice Categories (if tagged) */}
          {services.length > 0 ? (
            <section aria-labelledby="crm-home-services">
              <div className="crm-bk-group-head">
                <h2 id="crm-home-services">Demand by service & line of work</h2>
                <span className="sum">Top lines by pipeline & won value</span>
              </div>
              <div className="crm-bk-shares">
                {services.map((svc) => (
                  <div key={svc.label} className="crm-bk-share">
                    <span className="crm-bk-share-label">{svc.label}</span>
                    <span className="crm-bk-share-track" aria-hidden="true">
                      <span
                        className="crm-bk-share-bar"
                        style={{ width: `${Math.max(svc.share, svc.count > 0 ? 4 : 0)}%` }}
                      />
                    </span>
                    <span className="crm-bk-share-meta is-count">{svc.count}</span>
                    <span className="crm-bk-share-meta">{svc.share}%</span>
                    <span className="crm-bk-share-val">{money(svc.value, currency)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 7. Waiting on a First Call or WhatsApp (Actionable Worksheet Table) */}
          <section aria-labelledby="crm-home-waiting">
            <div className="crm-bk-group-head">
              <h2 id="crm-home-waiting">Waiting on a first call or WhatsApp</h2>
              <span className="sum">
                <Link
                  href="/crm/leads"
                  className="font-sans font-medium text-[var(--color-ink)] underline underline-offset-4"
                >
                  Open all leads →
                </Link>
              </span>
            </div>
            {waitingRows.length === 0 ? (
              <p className="px-6 py-4 text-[13.5px] text-[var(--color-ink-2)]">
                Every new lead has had its first call or WhatsApp reply.
              </p>
            ) : (
              <div className="crm-bk-table-wrap">
                <table className="crm-bk-table" aria-label="Leads waiting on a first call">
                  <thead>
                    <tr>
                      <th>Enquiry / Client</th>
                      <th>Channel</th>
                      <th>Owner</th>
                      <th style={{ textAlign: "right" }}>Est. value</th>
                      <th style={{ textAlign: "right" }}>Waiting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingRows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => router.push(row.href)}
                      >
                        <td>
                          <div className="flex items-baseline gap-2 min-w-0">
                            <Link
                              href={row.href}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-[var(--color-ink)] hover:underline truncate"
                            >
                              {row.title}
                            </Link>
                            <span className="font-mono text-[11.5px] text-[var(--color-ink-3)] shrink-0">
                              {row.leadNo}
                            </span>
                          </div>
                        </td>
                        <td className="text-[var(--color-ink-2)]">{row.channel}</td>
                        <td
                          style={
                            row.isUnassigned
                              ? { color: "var(--color-warning)", fontWeight: 500 }
                              : { color: "var(--color-ink-2)" }
                          }
                        >
                          {row.owner}
                        </td>
                        <td className="font-mono tabular-nums text-right">
                          {row.amount ?? <span className="text-[var(--color-faint)]">—</span>}
                        </td>
                        <td
                          className="font-mono tabular-nums text-right"
                          style={
                            row.tone === "bad"
                              ? { color: "var(--color-danger)", fontWeight: 600 }
                              : row.tone === "warn"
                                ? { color: "var(--color-warning)", fontWeight: 600 }
                                : undefined
                          }
                        >
                          {row.waitLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 8. Multi-Currency Commercial Book (USD / ZWG / ZAR) */}
          {currencies.length > 0 ? (
            <section aria-labelledby="crm-home-currencies">
              <div className="crm-bk-group-head">
                <h2 id="crm-home-currencies">Commercial book by currency</h2>
                <span className="sum">
                  {currencies.length === 1 ? `1 currency (${currencies[0].code})` : `${currencies.length} currencies active`}
                </span>
              </div>
              <div className="crm-bk-table-wrap">
                <table className="crm-bk-table" aria-label="Commercial book by currency">
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th style={{ textAlign: "right" }}>Open deals</th>
                      <th style={{ textAlign: "right" }}>Open pipeline</th>
                      <th style={{ textAlign: "right" }}>Quotes with clients</th>
                      <th style={{ textAlign: "right" }}>Won ({data.periodDays}d)</th>
                      <th style={{ textAlign: "right" }}>Owed on invoices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currencies.map((row) => (
                      <tr key={row.code}>
                        <td>
                          <span className="font-mono font-semibold text-[var(--color-ink)]">
                            {row.code}
                          </span>
                        </td>
                        <td className="font-mono tabular-nums text-right">{row.openDeals}</td>
                        <td className="font-mono tabular-nums text-right">
                          {money(row.pipelineValue, row.code)}
                        </td>
                        <td className="font-mono tabular-nums text-right">
                          {money(row.quotesValue, row.code)}
                        </td>
                        <td className="font-mono tabular-nums text-right">
                          {money(row.wonValue, row.code)}
                        </td>
                        <td className="font-mono tabular-nums text-right font-medium">
                          {money(row.receivableValue, row.code)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        {/* Right Rail: Position, Ageing, Velocity & Field Delivery */}
        <aside className="crm-bk-rail" aria-label="Commercial position and delivery">
          {/* 1. Owed to Us & Ageing */}
          <section className="crm-bk-rail-sec">
            <div className="crm-bk-rail-title">Owed to us (CRM invoices)</div>
            <div className="crm-bk-figure mb-3">{money(collections.outstanding, currency)}</div>
            <dl className="crm-bk-attrs">
              <dt>Open invoices</dt>
              <dd className="font-mono tabular-nums text-right">{collections.invoiceCount}</dd>
              <dt>Overdue</dt>
              <dd
                className="font-mono tabular-nums text-right"
                style={
                  collections.overdue > 0
                    ? { color: "var(--color-danger)", fontWeight: 600 }
                    : undefined
                }
              >
                {money(collections.overdue, currency)}
              </dd>
              {AGEING_BUCKETS.map((bucket) => {
                const entry = collections.ageing[bucket];
                if (!entry || entry.value <= 0) return null;
                return (
                  <div key={bucket} className="contents">
                    <dt>{AGEING_LABELS[bucket]}</dt>
                    <dd className="font-mono tabular-nums text-right">
                      {entry.count} · {money(entry.value, currency)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {/* 2. Commercial Velocity (Last 30 Days) */}
          <section className="crm-bk-rail-sec">
            <div className="crm-bk-rail-title">Commercial velocity ({data.periodDays}d)</div>
            <dl className="crm-bk-attrs">
              <dt>Win rate</dt>
              <dd className="font-mono tabular-nums text-right">
                {won.winRatePercent != null
                  ? `${won.winRatePercent}% (${won.count}/${won.closed})`
                  : "—"}
              </dd>
              <dt>Avg deal size</dt>
              <dd className="font-mono tabular-nums text-right">
                {won.avgDealSize ? money(won.avgDealSize, currency) : "—"}
              </dd>
              <dt>First reply</dt>
              <dd className="font-mono tabular-nums text-right">
                {speed.medianResponseMinutes != null
                  ? duration(speed.medianResponseMinutes)
                  : "—"}
              </dd>
              <dt>Quotes raised</dt>
              <dd className="font-mono tabular-nums text-right">
                {documents.quotationsRaised} · {money(documents.quotedValue, currency)}
              </dd>
              <dt>Closing (7d)</dt>
              <dd className="font-mono tabular-nums text-right">
                {pipeline.closingThisWeek} · {money(pipeline.closingThisWeekValue ?? 0, currency)}
              </dd>
              <dt>Going stale</dt>
              <dd
                className="font-mono tabular-nums text-right"
                style={
                  pipeline.stale > 0
                    ? { color: "var(--color-warning)", fontWeight: 600 }
                    : undefined
                }
              >
                {pipeline.stale}
              </dd>
            </dl>
          </section>

          {/* 3. Workshop, Projects & Field Operations */}
          <section className="crm-bk-rail-sec">
            <div className="crm-bk-rail-title">Field & workshop delivery</div>
            <dl className="crm-bk-attrs">
              <dt>Active projects</dt>
              <dd className="font-mono tabular-nums text-right">
                {(delivery.projects?.ACTIVE ?? 0) + (delivery.projects?.PLANNING ?? 0)} of{" "}
                {projectTotal}
              </dd>
              {delivery.activeProjectBudget ? (
                <>
                  <dt>Project budgets</dt>
                  <dd className="font-mono tabular-nums text-right">
                    {money(delivery.activeProjectBudget, currency)}
                  </dd>
                </>
              ) : null}
              <dt>Jobs in progress</dt>
              <dd className="font-mono tabular-nums text-right">
                {(delivery.workOrders.IN_PROGRESS ?? 0) + (delivery.workOrders.SCHEDULED ?? 0)} of{" "}
                {workOrderTotal}
              </dd>
              <dt>Blocked jobs</dt>
              <dd
                className="font-mono tabular-nums text-right"
                style={
                  (delivery.workOrders.BLOCKED ?? 0) > 0
                    ? { color: "var(--color-danger)", fontWeight: 600 }
                    : undefined
                }
              >
                {delivery.workOrders.BLOCKED ?? 0}
              </dd>
              <dt>Visits today</dt>
              <dd className="font-mono tabular-nums text-right">{delivery.todayVisits ?? 0}</dd>
              <dt>Visits (next 7d)</dt>
              <dd className="font-mono tabular-nums text-right">{delivery.upcomingVisits}</dd>
              <dt>Overdue tasks</dt>
              <dd
                className="font-mono tabular-nums text-right"
                style={
                  tasks.overdue + tasks.legacyOverdue > 0
                    ? { color: "var(--color-danger)", fontWeight: 600 }
                    : undefined
                }
              >
                {tasks.overdue + tasks.legacyOverdue}
              </dd>
            </dl>
          </section>

          {/* 4. Quick Register Links */}
          <section className="crm-bk-rail-sec">
            <div className="crm-bk-rail-title">Registers & ledgers</div>
            <div className="crm-bk-related-list">
              <Link href="/crm/leads" className="crm-bk-related-link">
                <span>Leads & enquiries</span>
                <span className="n">
                  {speed.breachedLeads + speed.atRiskLeads > 0
                    ? `${speed.breachedLeads + speed.atRiskLeads} waiting`
                    : "Open"}
                </span>
              </Link>
              <Link href="/crm/deals" className="crm-bk-related-link">
                <span>Deals pipeline</span>
                <span className="n">{pipeline.openDeals}</span>
              </Link>
              <Link href="/books/quotes" className="crm-bk-related-link">
                <span>Quotations</span>
                <span className="n">{documents.awaitingApproval} out</span>
              </Link>
              <Link href="/crm/appointments" className="crm-bk-related-link">
                <span>Site visits</span>
                <span className="n">{delivery.upcomingVisits} booked</span>
              </Link>
              <Link href="/crm/projects" className="crm-bk-related-link">
                <span>Projects</span>
                <span className="n">{projectTotal}</span>
              </Link>
              <Link href="/crm/projects/jobs" className="crm-bk-related-link">
                <span>Jobs & work orders</span>
                <span className="n">{workOrderTotal}</span>
              </Link>
              <Link href="/crm/cost-tracker" className="crm-bk-related-link">
                <span>Cost tracker</span>
                <span className="n">Ledger</span>
              </Link>
              <Link href="/crm/finance" className="crm-bk-related-link">
                <span>Money in & out</span>
                <span className="n">{money(collections.outstanding, currency)}</span>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
