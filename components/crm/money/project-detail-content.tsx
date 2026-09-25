"use client";

/**
 * One project: what it is, what it has cost, and the work inside it.
 *
 * The record page every other CRM record uses, so a project reads like a deal
 * or a job does: the properties in the standing column, edited in place; the
 * sections in a rail with the open one in the URL; one thing to press. That
 * thing is "Raise a job", because a project is a container for jobs and the
 * next move on one is nearly always the next piece of work.
 *
 * A cost figure a manager cannot drill into is a figure they will not trust,
 * and rightly — the first question after "this project has cost 4,200" is
 * always "on what". So the overview carries the rollup and the sections under
 * it carry the rows that explain it.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Button, Skeleton, Stack } from "@corelithzw/react";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { StatusChip } from "@/components/ui/status-chip";
import { EntityLink } from "@/components/records/entity-link";
import { RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";
import { useAttributeEditor } from "@/components/records/use-attribute-editor";
import { FilesTab } from "@/components/crm/records/files-tab";
import { FieldHistoryTab } from "@/components/crm/records/field-history-tab";
import { useJobsTab } from "@/components/crm/work-orders/jobs-tab";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/crm/project-status";
import { PROJECT_STATUS } from "@/lib/crm/tones";
import {
  Building2,
  Calendar,
  CalendarCheck,
  Coins,
  Dashboard,
  FileText,
  History,
  MapPin,
  Payments,
  Receipt,
  Tag,
  User,
  Users,
  Wallet,
  Work,
} from "@/lib/icons";

import { CostEntryForm } from "./cost-entry-form";
import { CostEntryTable } from "./cost-entry-table";
import { formatMoney, type CostEntryRow, type RequisitionRow } from "./money";
import { ProjectCostStrip, type ProjectCosts } from "./project-cost-strip";
import { ProjectTeam, type ProjectMember } from "./project-team";
import { ProjectTimelineView, type ProjectTimelineJob } from "./project-timeline-view";
import { RaiseRequisitionSheet } from "./raise-requisition-sheet";
import { RequisitionTable } from "./requisition-table";

type ProjectDetail = {
  project: {
    id: string;
    projectNo: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    currency: string;
    budget: string | null;
    startDate: string | null;
    targetEndDate: string | null;
    actualEndDate: string | null;
    client: { id: string; name: string } | null;
    site: { id: string; name: string } | null;
    deal: {
      id: string;
      dealNo: string;
      title: string;
      value: number | null;
      currency: string;
    } | null;
    manager: { id: string; name: string | null } | null;
    allowedTransitions: ProjectStatus[];
  };
  costs: ProjectCosts;
  jobs: ProjectTimelineJob[];
  requisitions: RequisitionRow[];
  entries: CostEntryRow[];
  members: ProjectMember[];
  canEdit: boolean;
};

/** A stored instant as the calendar day a date field edits. */
function day(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function readableDay(value: string | null): string | null {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
}

export function ProjectDetailContent({ projectId }: { projectId: string }) {
  const { data: session } = useSession();
  const [tab, setTab] = useState("overview");
  const [asking, setAsking] = useState(false);
  const [addingSpend, setAddingSpend] = useState(false);

  const query = useQuery({
    queryKey: ["crm", "project", projectId],
    queryFn: () => fetchJson<ProjectDetail>(`/api/v2/crm/projects/${projectId}`),
  });
  const edit = useAttributeEditor({
    path: `/api/v2/crm/projects/${projectId}`,
    invalidate: [["crm", "project", projectId], ["crm", "projects"]],
  });
  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string | null }> }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
  });

  const detail = query.data;
  const project = detail?.project;

  // Called above the early returns, because a hook must be. The jobs raised
  // here land in this project and on its deal, customer and site.
  const jobs = useJobsTab({
    ref: { kind: "project", id: projectId },
    currentUserId: session?.user?.id,
    defaultTitle: project?.name,
    links: {
      dealId: project?.deal?.id ?? null,
      clientId: project?.client?.id ?? null,
      siteId: project?.site?.id ?? null,
      project: project ? { id: project.id, label: `${project.projectNo} — ${project.name}` } : null,
    },
    onRaised: () => setTab("jobs"),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={320} />
      </div>
    );
  }

  if (query.error || !detail || !project) {
    return (
      <Alert tone="danger" title="Project not found">
        {query.error ? getApiErrorMessage(query.error) : "It may have been removed."}
      </Alert>
    );
  }

  const { costs, requisitions, entries, members, canEdit } = detail;

  // Rows are editable only when this person may change the project. A
  // property that opens an editor and is then refused by the server is a trap;
  // one that reads as fixed is honest.

  const statusOptions = [project.status, ...project.allowedTransitions].map((status) => ({
    value: status,
    label: PROJECT_STATUS_LABELS[status],
  }));

  const attributes: RecordAttribute[] = [
    {
      id: "status",
      label: "Status",
      icon: Tag,
      // Only the moves the server will accept are offered: a cancelled project
      // shows its status and no way to change it.
      display: (
        <StatusChip
          status={PROJECT_STATUS[project.status] ?? "inactive"}
          label={PROJECT_STATUS_LABELS[project.status]}
        />
      ),
      ...(canEdit && project.allowedTransitions.length > 0
        ? edit.choice("status", project.status, statusOptions)
        : {}),
    },
    {
      id: "owner",
      label: "Owner",
      icon: User,
      // Red when nobody owns it: a budget nobody answers for is the commonest
      // way one is overrun.
      tone: project.manager ? "strong" : "alert",
      value: project.manager?.name ?? null,
      placeholder: "Nobody",
      ...(canEdit
        ? edit.choice(
            "managerId",
            project.manager?.id ?? null,
            (teamQuery.data?.data ?? []).map((member) => ({
              value: member.id,
              label: member.name ?? "Unnamed",
            })),
            "Nobody",
          )
        : {}),
    },
    {
      id: "budget",
      label: "Budget",
      icon: Coins,
      tone: "money",
      placeholder: "Not set",
      ...(canEdit
        ? edit.numeric("budget", project.budget === null ? null : Number(project.budget))
        : { value: project.budget }),
      formatted: project.budget === null ? null : formatMoney(project.budget, project.currency),
    },
    {
      id: "sold",
      label: "Sold for",
      icon: Payments,
      // The deal's value, read from the deal: the reference the budget is set
      // against. Not editable here — the deal is where a price is changed.
      tone: "money",
      value:
        project.deal?.value == null ? null : formatMoney(project.deal.value, project.deal.currency),
      placeholder: project.deal ? "No value on the deal" : "No deal",
    },
    {
      id: "start",
      label: "Starts",
      icon: Calendar,
      kind: "date",
      tone: "code",
      placeholder: "No date",
      value: day(project.startDate),
      formatted: readableDay(project.startDate),
      ...(canEdit
        ? { onCommit: (next: string) => edit.save.mutate({ startDate: next.trim() === "" ? null : next }) }
        : {}),
    },
    {
      id: "end",
      label: "Target end",
      icon: CalendarCheck,
      kind: "date",
      tone: "code",
      placeholder: "No date",
      value: day(project.targetEndDate),
      formatted: readableDay(project.targetEndDate),
      ...(canEdit
        ? {
            onCommit: (next: string) =>
              edit.save.mutate({ targetEndDate: next.trim() === "" ? null : next }),
          }
        : {}),
    },
    ...(project.actualEndDate || project.status === "COMPLETED"
      ? [
          {
            id: "finished",
            label: "Finished",
            icon: CalendarCheck,
            kind: "date" as const,
            tone: "code" as const,
            placeholder: "Not recorded",
            value: day(project.actualEndDate),
            formatted: readableDay(project.actualEndDate),
            ...(canEdit
              ? {
                  onCommit: (next: string) =>
                    edit.save.mutate({ actualEndDate: next.trim() === "" ? null : next }),
                }
              : {}),
          },
        ]
      : []),
    {
      id: "customer",
      label: "Customer",
      icon: Building2,
      tone: project.client ? "link" : undefined,
      display: project.client ? (
        <EntityLink href={`/crm/companies/${project.client.id}`}>{project.client.name}</EntityLink>
      ) : undefined,
      value: project.client?.name ?? null,
      placeholder: "Not attached",
    },
    {
      id: "site",
      label: "Site",
      icon: MapPin,
      tone: project.site ? "link" : undefined,
      display: project.site ? (
        <EntityLink href={`/crm/sites/${project.site.id}`}>{project.site.name}</EntityLink>
      ) : undefined,
      value: project.site?.name ?? null,
      placeholder: "No site",
    },
    {
      id: "deal",
      label: "Deal",
      icon: FileText,
      tone: project.deal ? "link" : undefined,
      display: project.deal ? (
        <EntityLink href={`/crm/deals/${project.deal.id}`}>{project.deal.title}</EntityLink>
      ) : undefined,
      value: project.deal?.title ?? null,
      placeholder: "Raised directly",
    },
  ];

  const openRequisitions = requisitions.filter(
    (requisition) => requisition.status === "SUBMITTED" || requisition.status === "DISBURSED",
  ).length;

  return (
    <>
      <RecordPageShell
        icon={Work}
        backHref="/crm/projects"
        backLabel="All projects"
        title={project.name}
        onTitleCommit={canEdit ? edit.required("name", project.name).onCommit : undefined}
        reference={project.projectNo}
        status={{
          status: PROJECT_STATUS[project.status] ?? "inactive",
          label: PROJECT_STATUS_LABELS[project.status],
        }}
        subtitle={
          project.client || project.site ? (
            <>
              {project.client ? (
                <EntityLink href={`/crm/companies/${project.client.id}`} muted>
                  {project.client.name}
                </EntityLink>
              ) : null}
              {project.client && project.site ? " · " : null}
              {project.site ? (
                <EntityLink href={`/crm/sites/${project.site.id}`} muted>
                  {project.site.name}
                </EntityLink>
              ) : null}
            </>
          ) : (
            "Not attached to a customer"
          )
        }
        bandValue={
          costs.budget === null
            ? `${formatMoney(costs.spent, costs.currency)} spent`
            : `${formatMoney(costs.spent, costs.currency)} of ${formatMoney(costs.budget, costs.currency)}`
        }
        primaryAction={
          <Button variant="primary" onClick={jobs.raise}>
            Raise a job
          </Button>
        }
        related={
          <RecordRelated
            items={[
              ...(project.deal
                ? [{ href: `/crm/deals/${project.deal.id}`, label: project.deal.title, dot: "bg-[var(--brand)]" }]
                : []),
              ...(project.client
                ? [{ href: `/crm/companies/${project.client.id}`, label: project.client.name, dot: "bg-[var(--brand)]" }]
                : []),
              ...(project.site
                ? [{ href: `/crm/sites/${project.site.id}`, label: project.site.name, dot: "bg-[var(--badge-ok-fg)]" }]
                : []),
            ]}
          />
        }
        attributes={<RecordAttributes attributes={attributes} />}
        activeTab={tab}
        onTabChange={setTab}
        tabs={[
          {
            value: "overview",
            label: "Overview",
            icon: Dashboard,
            content: (
              <Stack gap="lg">
                <section aria-labelledby="project-money" className="space-y-2">
                  <h2 id="project-money" className="acct-rail-heading text-[var(--text-muted)]">
                    What it has cost
                  </h2>
                  <ProjectCostStrip costs={costs} />
                </section>
                <section aria-labelledby="project-timeline" className="space-y-2">
                  <h2 id="project-timeline" className="acct-rail-heading text-[var(--text-muted)]">
                    The work, by date
                  </h2>
                  <ProjectTimelineView
                    startDate={project.startDate}
                    targetEndDate={project.targetEndDate}
                    jobs={detail.jobs}
                  />
                </section>
              </Stack>
            ),
          },
          jobs.tab,
          {
            value: "requisitions",
            label: "Requisitions",
            icon: Wallet,
            count: requisitions.length,
            attention: openRequisitions > 0,
            content: (
              <div className="space-y-3">
                <RequisitionTable
                  rows={requisitions}
                  showProject={false}
                  emptyTitle="Nobody has asked for money for this"
                  emptyBody="Requisitions raised against this project land here, with where each one has got to."
                />
                <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
                  Ask for money for this project
                </Button>
              </div>
            ),
          },
          {
            value: "spend",
            label: "Spend & receipts",
            icon: Receipt,
            count: entries.length,
            attention: entries.some((entry) => entry.direction === "SPENT" && !entry.receiptUrl),
            content: (
              <div className="space-y-3">
                <CostEntryTable
                  entries={entries}
                  showProject={false}
                  emptyTitle="Nothing spent on it yet"
                  emptyBody="Spend logged against this project lands here, with its receipt."
                />
                {/* Revealed on demand rather than standing open under the
                    table: most people come here to read the spend, and a form
                    they did not ask for pushes it off a phone's screen. */}
                {addingSpend ? (
                  <section
                    aria-labelledby="project-add-spend"
                    className="space-y-2 border-t border-[var(--border-subtle)] pt-4"
                  >
                    <h2 id="project-add-spend" className="text-base font-semibold text-[var(--text-strong)]">
                      Add spend
                    </h2>
                    <p className="text-sm text-[var(--text-muted)]">
                      Money you spent on this project yourself. Spend from a requisition is
                      reported on the requisition.
                    </p>
                    <CostEntryForm
                      fixed={{
                        direction: "SPENT",
                        currency: project.currency,
                        projectId: project.id,
                        requisitionId: null,
                      }}
                      onSaved={() => {
                        setAddingSpend(false);
                        void query.refetch();
                      }}
                    />
                  </section>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setAddingSpend(true)}>
                    Add spend
                  </Button>
                )}
              </div>
            ),
          },
          {
            value: "team",
            label: "Team",
            icon: Users,
            count: members.length + (project.manager ? 1 : 0),
            content: (
              <ProjectTeam
                projectId={project.id}
                owner={project.manager}
                members={members}
                canEdit={canEdit}
              />
            ),
          },
          {
            value: "files",
            label: "Files",
            icon: FileText,
            content: <FilesTab owner="project" ownerId={project.id} />,
          },
          {
            value: "history",
            label: "History",
            icon: History,
            content: <FieldHistoryTab entity="PROJECT" recordId={project.id} />,
          },
        ]}
      />

      {jobs.sheet}

      <RaiseRequisitionSheet
        open={asking}
        onOpenChange={setAsking}
        project={{
          id: project.id,
          label: `${project.projectNo} — ${project.name}`,
          currency: project.currency,
        }}
      />
    </>
  );
}
