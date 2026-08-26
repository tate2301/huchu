"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusChip } from "@/components/ui/status-chip";
import {
  CRM_STAGE_LABELS,
  CRM_STAGE_STATUS,
} from "@/components/crm/leads/stage-config";
import { ClientDate } from "@/components/ui/client-date";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  Calendar,
  Checklist,
  Mail,
  Payments,
  Phone,
  ShieldCheck,
  UserRound,
} from "@/lib/icons";
import { fetchCrmRep, type CrmRepDetail } from "@/lib/crm/crm-v2";

import { formatMoney } from "@/components/crm/documents/document-types";
import { RecordList, type RecordListRow } from "@/components/crm/records/record-list";
import { RecordMark } from "@/components/records/record-mark";
import { RecordAttributes } from "@/components/records/record-attributes";
import { HistoryFeed, type HistoryEvent } from "@/components/crm/records/history-feed";
import { RecordPageShell } from "@/components/records/record-page-shell";
import { FilesTab } from "@/components/crm/records/files-tab";
import { RepSettingsTab } from "@/components/crm/reps/rep-settings-tab";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Owner",
  MANAGER: "Sales manager",
  SALES_REP: "Sales rep",
  SALES_EXEC: "Sales executive",
};

/** A number and what it is, sized so a row of them reads as one thing. */
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border)] p-3">
      <h3 className="text-base font-semibold text-[var(--text-strong)] text-[var(--text-subtle)]">
        {label}
        <span className="acct-stat-value mt-1 block font-mono tabular-nums text-[var(--text-strong)]">
          {value}
        </span>
      </h3>
      {hint ? <p className="mt-0.5 text-sm text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

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

export function RepDetailPage({ repId }: { repId: string }) {
  const [tab, setTab] = useState("pipeline");

  const repQuery = useQuery({
    queryKey: ["crm", "rep", repId],
    queryFn: () => fetchCrmRep(repId),
  });

  const detail = repQuery.data;

  const activityEvents = useMemo<HistoryEvent[]>(
    () =>
      (detail?.activities ?? []).map((activity) => ({
        id: activity.id,
        action: activity.type,
        verb: activity.subject,
        actorId: detail?.rep.id ?? null,
        actorName: detail?.rep.name ?? "This rep",
        occurredAt: activity.occurredAt,
        note:
          activity.body ??
          [activity.deal?.title, activity.lead?.title, activity.client?.name]
            .filter(Boolean)
            .join(" · ") ??
          null,
      })),
    [detail],
  );

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
    return (
      <Alert variant="destructive">
        <AlertTitle>Rep not found</AlertTitle>
        <AlertDescription>
          {repQuery.error
            ? getApiErrorMessage(repQuery.error)
            : "They may have been deactivated."}
        </AlertDescription>
      </Alert>
    );
  }

  const { rep, performance, closed } = detail;
  const openPipeline =
    detail.deals.reduce((sum, deal) => sum + (deal.value ?? 0), 0) +
    detail.leads.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0);

  return (
    <RecordPageShell
      icon={UserRound}
      bandValue={openPipeline > 0 ? formatMoney(openPipeline, "USD") : undefined}
      backHref="/crm/reps"
      backLabel="Sales reps"
      title={rep.name ?? rep.email ?? "Unnamed"}
      leading={<RecordMark kind="rep" name={rep.name ?? rep.email} />}
      status={
        rep.isActive ? null : { label: "Deactivated", status: "inactive" as const }
      }
      subtitle={ROLE_LABELS[rep.role] ?? rep.role}
      activeTab={tab}
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
              value: `${detail.deals.length} deals · ${detail.leads.length} leads · ${detail.tasks.length} tasks`,
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
      onTabChange={setTab}
      tabs={[
        {
          value: "pipeline",
          label: "Pipeline",
          count: detail.deals.length + detail.leads.length,
          content: (
            <RecordList
              rows={pipelineRows(detail)}
              emptyTitle="Nothing open"
              emptyBody="Every lead and deal assigned to them is closed."
            />
          ),
        },
        {
          value: "tasks",
          label: "Tasks",
          count: detail.tasks.length,
          content: (
            <RecordList
              rows={detail.tasks.map((task) => ({
                id: task.id,
                href: task.dealId
                  ? `/crm/deals/${task.dealId}`
                  : task.leadId
                    ? `/crm/leads/${task.leadId}`
                    : task.clientId
                      ? `/crm/companies/${task.clientId}`
                      : "/crm/follow-ups",
                title: task.title,
                subtitle: task.type.replace(/_/g, " ").toLowerCase(),
                status:
                  new Date(task.dueAt) < new Date() ? (
                    <Badge tone="danger" size="sm">
                      Overdue
                    </Badge>
                  ) : null,
                facts: [{ label: "Due", value: <ClientDate value={task.dueAt} mode="date" /> }],
              }))}
              emptyTitle="No open tasks"
              emptyBody="Nothing is waiting on them right now."
            />
          ),
        },
        {
          value: "performance",
          label: "Performance",
          content: detail.canSeeNumbers ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label="Collected"
                  value={
                    performance ? formatMoney(performance.collectedAmount, "USD") : "—"
                  }
                  hint="Receipts written against their leads"
                />
                <Stat
                  label="Invoiced"
                  value={performance ? formatMoney(performance.invoicedAmount, "USD") : "—"}
                />
                <Stat
                  label="Win rate"
                  value={performance ? `${performance.winRate}%` : "—"}
                  hint={`${closed.won} won · ${closed.lost} lost, all time`}
                />
                <Stat
                  label="First response"
                  value={
                    performance?.avgResponseHours === null ||
                    performance?.avgResponseHours === undefined
                      ? "—"
                      : `${performance.avgResponseHours}h`
                  }
                  hint="Average time to first contact"
                />
              </div>

              {!performance ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Nothing was assigned to them in the last 90 days, so there is no
                  performance to report — which is not the same as zero.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Sales figures for other reps are visible to managers.
            </p>
          ),
        },
        {
          value: "activity",
          label: "Activity",
          count: detail.activities.length,
          content: (
            <HistoryFeed
              events={activityEvents}
              emptyMessage="They have not logged anything yet."
              exportName={`${rep.name ?? "rep"}-activity`}
            />
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
          content: (
            <RepSettingsTab
              repId={rep.id}
              repName={rep.name ?? rep.email ?? "This person"}
            />
          ),
        },
      ]}
    />
  );
}
