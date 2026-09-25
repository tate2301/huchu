"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  SectionHeading,
  StatusDot,
  type ColumnListRow,
} from "@/components/management/ui";
import { CRM_STAGE_LABELS } from "@/components/crm/leads/stage-config";
import { ClientDate } from "@/components/ui/client-date";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Calendar,
  Checklist,
  Mail,
  Payments,
  Phone,
  ShieldCheck,
  UserRound,
} from "@/lib/icons";
import { fetchCrmRep, type CrmOutstandingItem, type CrmRepDetail } from "@/lib/crm/crm-v2";

import { formatMoney } from "@/components/crm/documents/document-types";
import { CostEntryTable } from "@/components/crm/money/cost-entry-table";
import { DailyReportCard, type DailyReportCardSummary } from "@/components/crm/money/daily-report-card";
import { formatDate, formatDay, todayKey, type CostEntryRow } from "@/components/crm/money/money";
import { RecordMark } from "@/components/records/record-mark";
import { RecordAttributes } from "@/components/records/record-attributes";
import { RecordPageShell } from "@/components/records/record-page-shell";
import { FilesTab } from "@/components/crm/records/files-tab";
import { RepSettingsTab } from "@/components/crm/reps/rep-settings-tab";

/** The measure every section's heading and list share in the record pane. */
const SECTION_WIDTH = 760;

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Owner",
  MANAGER: "Sales manager",
  SALES_REP: "Sales rep",
  SALES_EXEC: "Sales executive",
};

/** Their live pipeline: the reference, the deal or lead, where it stands, what it is worth. */
function carryingRows(detail: CrmRepDetail): ColumnListRow[] {
  return [
    ...detail.deals.map((deal) => ({
      id: `deal-${deal.id}`,
      cells: {
        name: (
          <ColumnName
            code={deal.dealNo}
            name={deal.title}
            meta={[deal.client?.name, deal.stage.name].filter(Boolean).join(" · ")}
            href={`/crm/deals/${deal.id}`}
          />
        ),
        value: deal.value === null ? <ColumnFigure tone="muted">—</ColumnFigure> : <ColumnFigure>{formatMoney(deal.value, deal.currency)}</ColumnFigure>,
      },
    })),
    ...detail.leads.map((lead) => ({
      id: `lead-${lead.id}`,
      cells: {
        name: (
          <ColumnName
            code={lead.leadNo}
            name={lead.title}
            meta={[lead.client?.name, CRM_STAGE_LABELS[lead.stage]].filter(Boolean).join(" · ")}
            href={`/crm/leads/${lead.id}`}
          />
        ),
        value:
          lead.estimatedValue === null ? (
            <ColumnFigure tone="muted">—</ColumnFigure>
          ) : (
            <ColumnFigure>{formatMoney(lead.estimatedValue, lead.currency)}</ColumnFigure>
          ),
      },
    })),
  ];
}

/** What kind of thing an outstanding item is, in a word. */
const OUTSTANDING_KIND: Record<CrmOutstandingItem["kind"], string> = {
  task: "Task",
  "follow-up": "Follow-up",
  requisition: "Requisition",
  float: "Float",
  "no-receipt": "Spend",
  "not-receipted": "Cash",
  report: "Day",
};

/**
 * The item's state as a dot and the word (rule 5). A late item is red — it
 * is past the point it was owed — except the ones that are a job to finish
 * rather than a date missed, which are amber. Something merely waiting is
 * grey: it is on somebody else.
 */
function outstandingState(item: CrmOutstandingItem): ReactNode {
  if (!item.flagged) {
    return <StatusDot tone="neutral" label={item.kind === "float" ? "Out" : "Waiting"} />;
  }
  switch (item.kind) {
    case "task":
    case "follow-up":
      return <StatusDot tone="danger" label="Overdue" />;
    case "float":
      return <StatusDot tone="danger" label="Not accounted for" />;
    case "not-receipted":
      return <StatusDot tone="danger" label="Not receipted" />;
    case "no-receipt":
      return <StatusDot tone="warn" label="No receipt" />;
    case "report":
      return <StatusDot tone="warn" label="Not closed" />;
    case "requisition":
      return <StatusDot tone="neutral" label="Waiting" />;
  }
}

/** The line under an outstanding item's name: what it is, and how many where it is several. */
function outstandingMeta(item: CrmOutstandingItem): string {
  const kind = OUTSTANDING_KIND[item.kind];
  if (item.kind === "no-receipt" && item.count !== null) {
    return `${item.count} ${item.count === 1 ? "expense" : "expenses"}`;
  }
  if (item.kind === "not-receipted" && item.count !== null) {
    return `${item.count} ${item.count === 1 ? "invoice" : "invoices"}`;
  }
  return kind;
}

type MemberDay = { date: string; submitted: boolean; summary: DailyReportCardSummary };

/**
 * One member of the team: what they got done, what is outstanding against
 * them, their days, and their money — for a period chosen at the top.
 *
 * The same page answers a manager asking "how is Tendai doing" and Tendai
 * asking "what do I still owe". So it leads with what they achieved, and the
 * Outstanding section puts what is late before what is merely waiting.
 */
export function RepDetailPage({ repId }: { repId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  // The sections that cost a query of their own load when they are opened.
  const section = searchParams.get("section") ?? "overview";

  const repQuery = useQuery({
    queryKey: ["crm", "rep", repId, from, to],
    queryFn: () => fetchCrmRep(repId, { from: from ?? undefined, to: to ?? undefined }),
    placeholderData: (previous) => previous,
  });

  const detail = repQuery.data;
  // The period actually shown — this month so far, when nobody has chosen.
  const period = detail?.period ?? null;
  const periodQuery = period ? `from=${period.from}&to=${period.to}` : "";

  const activityQuery = useQuery({
    queryKey: ["crm", "rep", repId, "activity", periodQuery],
    queryFn: () =>
      fetchJson<{ data: MemberDay[]; limit: number }>(`/api/v2/crm/reps/${repId}/activity?${periodQuery}`),
    enabled: section === "activity" && Boolean(period),
  });

  const moneyQuery = useQuery({
    queryKey: ["crm", "cost-entries", `person=${repId}&${periodQuery}`],
    queryFn: () =>
      fetchJson<{ data: CostEntryRow[] }>(
        `/api/v2/crm/cost-entries?person=${repId}&${periodQuery}&limit=100`,
      ),
    enabled: section === "money" && Boolean(period),
  });

  const setPeriod = (next: { from: string | null; to: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const rendered = params.toString();
    router.replace(rendered ? `${pathname}?${rendered}` : pathname, { scroll: false });
  };

  if (repQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (repQuery.error || !detail) {
    const refused = repQuery.error instanceof ApiError && repQuery.error.status === 403;
    return (
      <Alert variant="destructive">
        <AlertTitle>{refused ? "This is somebody else's overview" : "Team member not found"}</AlertTitle>
        <AlertDescription>
          {refused
            ? "You can open your own. A manager can open anybody's."
            : repQuery.error
              ? getApiErrorMessage(repQuery.error)
              : "They may have been deactivated."}
        </AlertDescription>
      </Alert>
    );
  }

  const { rep, achieved, outstanding } = detail;
  const openPipeline =
    detail.deals.reduce((sum, deal) => sum + (deal.value ?? 0), 0) +
    detail.leads.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0);
  const flagged = outstanding.filter((item) => item.flagged).length;
  const name = rep.name ?? rep.email ?? "This person";

  return (
    <RecordPageShell
      icon={UserRound}
      backHref="/crm/reps"
      backLabel="Team"
      title={rep.name ?? rep.email ?? "Unnamed"}
      leading={<RecordMark kind="rep" name={rep.name ?? rep.email} />}
      status={
        rep.isActive ? null : { label: "Deactivated", status: "inactive" as const }
      }
      activeTab={section}
      attributes={
        <RecordAttributes
          attributes={[
            {
              id: "role",
              label: "Role",
              icon: ShieldCheck,
              value: ROLE_LABELS[rep.role] ?? rep.role,
            },
            {
              id: "email",
              label: "Email",
              icon: Mail,
              display: rep.email ? (
                <a href={`mailto:${rep.email}`} className="text-sm hover:underline">
                  {rep.email}
                </a>
              ) : undefined,
              value: rep.email,
            },
            {
              id: "phone",
              label: "Phone",
              icon: Phone,
              display: rep.phone ? (
                <a href={`tel:${rep.phone}`} className="text-sm hover:underline">
                  {rep.phone}
                </a>
              ) : undefined,
              value: rep.phone,
            },
            {
              id: "pipeline",
              label: "Open pipeline",
              icon: Payments,
              value: formatMoney(openPipeline, "USD"),
              mono: true,
            },
            {
              id: "workload",
              label: "Carrying",
              icon: Checklist,
              value: `${detail.deals.length} deals · ${detail.leads.length} leads · ${detail.openTasks} tasks`,
            },
            {
              id: "since",
              label: "On the team since",
              icon: Calendar,
              display: (
                <span className="text-sm">
                  <ClientDate value={rep.createdAt} mode="date" />
                </span>
              ),
            },
          ]}
        />
      }
      // One period for every section: what they did, what they spent, which
      // days — all of it this month unless somebody chooses otherwise.
      beforeTabs={
        <DateRangeFilter
          label="Period"
          anyLabel="This month"
          value={{ from: from ?? period?.from ?? null, to: to ?? period?.to ?? null }}
          max={todayKey()}
          onChange={setPeriod}
        />
      }
      // The open section is the URL's, which the shell's own links write.
      onTabChange={() => undefined}
      tabs={[
        {
          value: "overview",
          label: "Overview",
          content: (
            <>
              <section aria-labelledby="rep-done">
                <SectionHeading maxWidth={SECTION_WIDTH} className="mt-0">
                  <span id="rep-done">Done in the period</span>
                </SectionHeading>
                <Figures
                  items={[
                    { label: "Deals won", value: String(achieved.dealsWon) },
                    { label: "Value won", value: formatMoney(Number(achieved.wonValue), achieved.wonCurrency) },
                    { label: "Jobs completed", value: String(achieved.jobsCompleted) },
                    { label: "Visits done", value: String(achieved.visitsDone) },
                    {
                      label: "Spent",
                      value: formatMoney(Number(achieved.spent), achieved.moneyCurrency),
                      href: `/crm/cost-tracker?person=${rep.id}&type=SPENT&${periodQuery}`,
                    },
                    {
                      label: "Received",
                      value: formatMoney(Number(achieved.received), achieved.moneyCurrency),
                      href: `/crm/cost-tracker?person=${rep.id}&type=RECEIVED&${periodQuery}`,
                    },
                  ]}
                />
              </section>

              <section aria-labelledby="rep-carrying">
                <SectionHeading count={detail.deals.length + detail.leads.length} maxWidth={SECTION_WIDTH}>
                  <span id="rep-carrying">Carrying</span>
                </SectionHeading>
                <ColumnList
                  label="Carrying"
                  maxWidth={SECTION_WIDTH}
                  empty="Nothing open."
                  columns={[
                    { id: "name", label: "Deal or lead" },
                    { id: "value", label: "Value", align: "end" },
                  ]}
                  rows={carryingRows(detail)}
                />
              </section>
            </>
          ),
        },
        {
          value: "outstanding",
          label: "Outstanding",
          // The same count the section's heading carries; the dot says
          // whether any of it is late.
          count: outstanding.length,
          attention: flagged > 0,
          titled: true,
          content: (
            <section aria-labelledby="rep-outstanding">
              <SectionHeading count={outstanding.length} maxWidth={SECTION_WIDTH} className="mt-0">
                <span id="rep-outstanding">Outstanding</span>
              </SectionHeading>
              <ColumnList
                label="Outstanding"
                maxWidth={SECTION_WIDTH}
                empty="Nothing outstanding."
                columns={[
                  { id: "item", label: "Item" },
                  { id: "since", label: "Since", hideBelow: "sm" },
                  { id: "amount", label: "Amount", align: "end", hideBelow: "sm" },
                  { id: "state", label: "Status" },
                ]}
                rows={outstanding.map((item) => ({
                  id: `${item.kind}-${item.id}`,
                  cells: {
                    item: (
                      <ColumnName
                        code={item.reference}
                        name={item.title}
                        meta={outstandingMeta(item)}
                        href={item.href}
                      />
                    ),
                    since: <ColumnFigure tone="muted">{item.at ? formatDate(item.at) : "—"}</ColumnFigure>,
                    amount:
                      item.amount === null ? (
                        <ColumnFigure tone="muted">—</ColumnFigure>
                      ) : (
                        <ColumnFigure>{formatMoney(Number(item.amount), item.currency ?? "USD")}</ColumnFigure>
                      ),
                    state: outstandingState(item),
                  },
                }))}
              />
            </section>
          ),
        },
        {
          value: "activity",
          label: "Activity",
          titled: true,
          content: (
            <section aria-labelledby="rep-days">
              <SectionHeading
                count={activityQuery.data?.data.length}
                maxWidth={SECTION_WIDTH}
                className="mt-0"
              >
                <span id="rep-days">Days</span>
              </SectionHeading>
              {activityQuery.isLoading || !activityQuery.data ? (
                <div className="space-y-2" aria-busy="true" style={{ maxWidth: SECTION_WIDTH }}>
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : activityQuery.data.data.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Nothing recorded in this period.</p>
              ) : (
                <div style={{ maxWidth: SECTION_WIDTH }}>
                  {activityQuery.data.data.map((day) => (
                    <DailyReportCard
                      key={day.date}
                      heading={formatDay(day.date)}
                      aside={
                        day.submitted ? (
                          <StatusDot tone="neutral" label="Closed" />
                        ) : (
                          <StatusDot tone="warn" label="Not closed" />
                        )
                      }
                      summary={day.summary}
                    />
                  ))}
                </div>
              )}
            </section>
          ),
        },
        {
          value: "money",
          label: "Money",
          titled: true,
          content: (
            <section aria-labelledby="rep-money">
              <SectionHeading
                count={moneyQuery.data?.data.length}
                maxWidth={SECTION_WIDTH}
                className="mt-0"
                action={
                  <Link
                    href={`/crm/cost-tracker?person=${rep.id}&${periodQuery}`}
                    className="text-sm font-medium text-[var(--brand-strong)] underline decoration-transparent underline-offset-2 hover:decoration-current"
                  >
                    Open in the cost tracker
                  </Link>
                }
              >
                <span id="rep-money">Money</span>
              </SectionHeading>
              <CostEntryTable
                label="Money"
                entries={moneyQuery.data?.data ?? []}
                isLoading={moneyQuery.isLoading || !moneyQuery.data}
                showPerson={false}
                empty="No money in this period."
                maxWidth={SECTION_WIDTH}
              />
            </section>
          ),
        },
        {
          value: "files",
          label: "Files",
          content: <FilesTab owner="rep" ownerId={rep.id} />,
        },
        {
          value: "settings",
          label: "Settings",
          content: <RepSettingsTab repId={rep.id} repName={name} />,
        },
      ]}
    />
  );
}

/**
 * What they got done, as six figures. No frame, no icon and no line under
 * each saying "in this period" — the heading says it once, and the period is
 * at the top of the page (rules 1 and 10).
 */
function Figures({ items }: { items: Array<{ label: string; value: string; href?: string }> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3" style={{ maxWidth: SECTION_WIDTH }}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 border-t border-[var(--border-subtle)] pt-3">
          <dt className="text-sm text-[var(--text-muted)]">{item.label}</dt>
          <dd className="mt-1 truncate font-mono text-xl font-semibold tabular-nums text-[var(--text-strong)]">
            {item.href ? (
              // A figure is not expected to lead anywhere, so one that does
              // says so before the pointer finds it — as a fact's value does.
              <Link
                href={item.href}
                className="underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-current"
              >
                {item.value}
              </Link>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
