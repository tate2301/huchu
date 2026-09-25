"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusChip } from "@/components/ui/status-chip";
import {
  CRM_STAGE_LABELS,
  CRM_STAGE_STATUS,
} from "@/components/crm/leads/stage-config";
import { ClientDate } from "@/components/ui/client-date";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Calendar,
  Check,
  Checklist,
  Coins,
  FileText,
  Mail,
  MapPin,
  Payments,
  Phone,
  Receipt,
  ShieldCheck,
  UserRound,
  Wrench,
} from "@/lib/icons";
import { fetchCrmRep, type CrmOutstandingItem, type CrmRepDetail } from "@/lib/crm/crm-v2";

import { formatMoney } from "@/components/crm/documents/document-types";
import { CostEntryTable } from "@/components/crm/money/cost-entry-table";
import { DailyReportCard, type DailyReportCardSummary } from "@/components/crm/money/daily-report-card";
import { formatDay, todayKey, type CostEntryRow } from "@/components/crm/money/money";
import { RecordList, type RecordListRow } from "@/components/records/record-list";
import { RecordMark } from "@/components/records/record-mark";
import { RecordAttributes } from "@/components/records/record-attributes";
import { RecordPageShell } from "@/components/records/record-page-shell";
import { FilesTab } from "@/components/crm/records/files-tab";
import { RepSettingsTab } from "@/components/crm/reps/rep-settings-tab";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Owner",
  MANAGER: "Sales manager",
  SALES_REP: "Sales rep",
  SALES_EXEC: "Sales executive",
};

function pipelineRows(detail: CrmRepDetail): RecordListRow[] {
  return [
    ...detail.deals.map((deal) => ({
      id: `deal-${deal.id}`,
      href: `/crm/deals/${deal.id}`,
      title: deal.title,
      subtitle: [deal.client?.name, deal.stage.name].filter(Boolean).join(" · "),
      status: (
        <Badge tone="info" size="sm">
          Deal
        </Badge>
      ),
      facts: [
        ...(deal.expectedCloseDate
          ? [
              {
                label: "Expected",
                value: <ClientDate value={deal.expectedCloseDate} mode="date" />,
              },
            ]
          : []),
        {
          label: "Value",
          value: deal.value === null ? "—" : formatMoney(deal.value, deal.currency),
          mono: true,
        },
      ],
    })),
    ...detail.leads.map((lead) => ({
      id: `lead-${lead.id}`,
      href: `/crm/leads/${lead.id}`,
      title: lead.title,
      subtitle: [lead.client?.name, lead.leadNo].filter(Boolean).join(" · "),
      status: (
        <StatusChip
          status={CRM_STAGE_STATUS[lead.stage]}
          label={CRM_STAGE_LABELS[lead.stage]}
        />
      ),
      facts: [
        {
          label: "Value",
          value:
            lead.estimatedValue === null
              ? "—"
              : formatMoney(lead.estimatedValue, lead.currency),
          mono: true,
        },
      ],
    })),
  ];
}

/** What an outstanding item is, in the words its row leads with. */
function outstandingSubtitle(item: CrmOutstandingItem) {
  const on = (prefix: string) =>
    item.at ? (
      <>
        {prefix} <ClientDate value={item.at} mode="date" />
      </>
    ) : (
      prefix
    );
  switch (item.kind) {
    case "task":
      return on("Task, due");
    case "follow-up":
      return on("Follow-up, due");
    case "requisition":
      return on("Requisition, waiting since");
    case "float":
      return on("Float, paid out");
    case "no-receipt":
      return `${item.count} ${item.count === 1 ? "expense" : "expenses"} in this period`;
    case "not-receipted":
      return `On ${item.count} ${item.count === 1 ? "invoice" : "invoices"}`;
    case "report":
      return on("The day of");
  }
}

/** The one word that says why a flagged item is late, or that it is waiting. */
function outstandingBadge(item: CrmOutstandingItem) {
  if (!item.flagged) {
    return (
      <Badge tone="neutral" size="sm">
        {item.kind === "float" ? "Out" : "Waiting"}
      </Badge>
    );
  }
  const label: Record<CrmOutstandingItem["kind"], string> = {
    task: "Overdue",
    "follow-up": "Overdue",
    requisition: "Waiting",
    float: "Not accounted for",
    "no-receipt": "No photo",
    "not-receipted": "Not receipted",
    report: "Not closed",
  };
  return (
    <Badge tone="warn" size="sm">
      {label[item.kind]}
    </Badge>
  );
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
      bandValue={openPipeline > 0 ? formatMoney(openPipeline, "USD") : undefined}
      backHref="/crm/reps"
      backLabel="Team"
      title={rep.name ?? rep.email ?? "Unnamed"}
      leading={<RecordMark kind="rep" name={rep.name ?? rep.email} />}
      status={
        rep.isActive ? null : { label: "Deactivated", status: "inactive" as const }
      }
      subtitle={ROLE_LABELS[rep.role] ?? rep.role}
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
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MetricTile
                  title="Deals won"
                  value={achieved.dealsWon}
                  valueLabel={String(achieved.dealsWon)}
                  detail="in this period"
                  tone="neutral"
                  icon={Check}
                />
                <MetricTile
                  title="Value won"
                  value={Number(achieved.wonValue)}
                  valueLabel={formatMoney(Number(achieved.wonValue), achieved.wonCurrency)}
                  detail="across the deals won"
                  tone="neutral"
                  icon={Coins}
                />
                <MetricTile
                  title="Jobs completed"
                  value={achieved.jobsCompleted}
                  valueLabel={String(achieved.jobsCompleted)}
                  detail="in this period"
                  tone="neutral"
                  icon={Wrench}
                />
                <MetricTile
                  title="Visits done"
                  value={achieved.visitsDone}
                  valueLabel={String(achieved.visitsDone)}
                  detail="in this period"
                  tone="neutral"
                  icon={MapPin}
                />
                <MetricTile
                  title="Spent"
                  value={Number(achieved.spent)}
                  valueLabel={formatMoney(Number(achieved.spent), achieved.moneyCurrency)}
                  detail="from their cost tracker"
                  tone="neutral"
                  icon={Receipt}
                  href={`/crm/cost-tracker?person=${rep.id}&type=SPENT&${periodQuery}`}
                />
                <MetricTile
                  title="Received"
                  value={Number(achieved.received)}
                  valueLabel={formatMoney(Number(achieved.received), achieved.moneyCurrency)}
                  detail="from their cost tracker"
                  tone="neutral"
                  icon={Coins}
                  href={`/crm/cost-tracker?person=${rep.id}&type=RECEIVED&${periodQuery}`}
                />
              </div>

              <section aria-labelledby="rep-carrying" className="space-y-2">
                <h2 id="rep-carrying" className="text-base font-semibold text-[var(--text-strong)]">
                  What they are carrying
                </h2>
                <RecordList
                  rows={pipelineRows(detail)}
                  emptyTitle="Nothing open"
                  emptyBody="Every lead and deal assigned to them is closed."
                />
              </section>
            </div>
          ),
        },
        {
          value: "outstanding",
          label: "Outstanding",
          count: flagged || undefined,
          content: (
            <RecordList
              rows={outstanding.map((item) => ({
                id: `${item.kind}-${item.id}`,
                href: item.href,
                title: item.title,
                subtitle: outstandingSubtitle(item),
                status: outstandingBadge(item),
                facts:
                  item.amount === null
                    ? []
                    : [
                        {
                          label: "Amount",
                          value: formatMoney(Number(item.amount), item.currency ?? "USD"),
                          mono: true,
                          primary: true,
                        },
                      ],
              }))}
              emptyTitle="Nothing outstanding"
              emptyBody="No overdue work, no floats out, and every day closed."
            />
          ),
        },
        {
          value: "activity",
          label: "Activity",
          content: activityQuery.isLoading || !activityQuery.data ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : activityQuery.data.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Nothing was recorded against any day in this period.
            </p>
          ) : (
            <div className="space-y-2">
              {activityQuery.data.data.map((day) => (
                <DailyReportCard
                  key={day.date}
                  heading={formatDay(day.date)}
                  aside={day.submitted ? "Closed" : "Not closed"}
                  summary={day.summary}
                />
              ))}
              {activityQuery.data.data.length > 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Days with anything on them, newest first — at most the last {activityQuery.data.limit} of
                  the period.
                </p>
              ) : null}
            </div>
          ),
        },
        {
          value: "money",
          label: "Money",
          content: (
            <div className="space-y-3">
              <CostEntryTable
                entries={moneyQuery.data?.data ?? []}
                isLoading={moneyQuery.isLoading || !moneyQuery.data}
                showPerson={false}
                emptyTitle="No money in this period"
                emptyBody={`Nothing ${name} received or spent is in their cost tracker for these days.`}
              />
              <Link
                href={`/crm/cost-tracker?person=${rep.id}&${periodQuery}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-strong)] hover:underline"
              >
                <FileText className="size-4" aria-hidden="true" />
                Open in the cost tracker
              </Link>
            </div>
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
