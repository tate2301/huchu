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

import { Alert, Button, Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  SectionAction,
  SectionHeading,
  StatusDot,
} from "@/components/management/ui";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { EntityLink } from "@/components/records/entity-link";
import { RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";
import { useAttributeEditor } from "@/components/records/use-attribute-editor";
import { FilesTab } from "@/components/crm/records/files-tab";
import { FieldHistoryTab } from "@/components/crm/records/field-history-tab";
import { jobHref } from "@/components/crm/work-orders/job-types";
import { useJobsTab } from "@/components/crm/work-orders/jobs-tab";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/crm/project-status";
import { JOB_TONE, PROJECT_STATUS, PROJECT_TONE, REQUISITION_TONE } from "@/lib/crm/tones";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/crm/work-orders";
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
  Plus,
  Receipt,
  Tag,
  User,
  Users,
  Wallet,
  Work,
} from "@/lib/icons";

import { CostEntryFormDialog } from "./cost-entry-form-dialog";
import { CostEntryTable } from "./cost-entry-table";
import {
  REQUISITION_STATUS_LABELS,
  formatDate,
  formatMoney,
  payable,
  type CostEntryRow,
  type RequisitionRow,
} from "./money";
import { ProjectCostStrip, type ProjectCosts } from "./project-cost-strip";
import { ProjectTeam, type ProjectMember } from "./project-team";
import { ProjectTimelineView, type ProjectTimelineJob } from "./project-timeline-view";
import { RaiseRequisitionSheet } from "./raise-requisition-sheet";

/**
 * The measure a section's heading and its list share inside the record pane:
 * the list's right edge is where the section's verb sits.
 */
const SECTION_WIDTH = 760;

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
  return value ? formatDate(value.slice(0, 10)) : null;
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
    // The project's own list of jobs is read from the project, so a job
    // raised here refreshes it as well as the section's count.
    onRaised: () => {
      setTab("jobs");
      void query.refetch();
    },
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
        <StatusDot tone={PROJECT_TONE[project.status] ?? "neutral"} label={PROJECT_STATUS_LABELS[project.status]} />
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
        // Rule 5: the band carries a state only when it is the exception —
        // a project parked or called off. Planning and under way are what a
        // project is, and the Status property already says which.
        status={
          project.status === "ON_HOLD" || project.status === "CANCELLED"
            ? { status: PROJECT_STATUS[project.status] ?? "inactive", label: PROJECT_STATUS_LABELS[project.status] }
            : null
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
              <>
                <section aria-labelledby="project-costs">
                  <SectionHeading maxWidth={SECTION_WIDTH} className="mt-0">
                    <span id="project-costs">Costs</span>
                  </SectionHeading>
                  <ProjectCostStrip costs={costs} maxWidth={SECTION_WIDTH} />
                </section>
                <section aria-labelledby="project-schedule">
                  <SectionHeading maxWidth={SECTION_WIDTH}>
                    <span id="project-schedule">Schedule</span>
                  </SectionHeading>
                  <ProjectTimelineView
                    startDate={project.startDate}
                    targetEndDate={project.targetEndDate}
                    jobs={detail.jobs}
                    maxWidth={SECTION_WIDTH}
                  />
                </section>
              </>
            ),
          },
          {
            // The hook's count, attention and sheet; the list drawn from the
            // project's own jobs. "Raise a job" is the page's one verb in the
            // bar, so the section does not draw it a second time (rule 2).
            ...jobs.tab,
            titled: true,
            content: <ProjectJobs jobs={detail.jobs} />,
          },
          {
            value: "requisitions",
            label: "Requisitions",
            icon: Wallet,
            count: requisitions.length,
            attention: openRequisitions > 0,
            titled: true,
            content: (
              <section aria-labelledby="project-requisitions">
                <SectionHeading
                  count={requisitions.length}
                  maxWidth={SECTION_WIDTH}
                  className="mt-0"
                  action={
                    <SectionAction icon={Plus} onClick={() => setAsking(true)}>
                      Ask for money
                    </SectionAction>
                  }
                >
                  <span id="project-requisitions">Requisitions</span>
                </SectionHeading>
                <ColumnList
                  label="Requisitions"
                  maxWidth={SECTION_WIDTH}
                  empty="Nobody has asked for money for it."
                  columns={[
                    { id: "requisition", label: "Requisition" },
                    { id: "status", label: "Status", hideBelow: "sm" },
                    { id: "amount", label: "Amount", align: "end" },
                  ]}
                  rows={requisitions.map((requisition) => ({
                    id: requisition.id,
                    cells: {
                      requisition: (
                        <ColumnName
                          code={requisition.requisitionNo}
                          name={requisition.purpose}
                          meta={requisition.requestedBy?.name ?? "Unknown"}
                          href={`/crm/requisitions/${requisition.id}`}
                        />
                      ),
                      status: (
                        <StatusDot
                          tone={REQUISITION_TONE[requisition.status] ?? "neutral"}
                          label={REQUISITION_STATUS_LABELS[requisition.status]}
                        />
                      ),
                      amount: <ColumnFigure>{formatMoney(payable(requisition), requisition.currency)}</ColumnFigure>,
                    },
                  }))}
                />
              </section>
            ),
          },
          {
            value: "spend",
            label: "Spend",
            icon: Receipt,
            count: entries.length,
            attention: entries.some((entry) => entry.direction === "SPENT" && !entry.receiptUrl),
            titled: true,
            content: (
              <section aria-labelledby="project-spend">
                <SectionHeading
                  count={entries.length}
                  maxWidth={SECTION_WIDTH}
                  className="mt-0"
                  action={
                    <SectionAction icon={Plus} onClick={() => setAddingSpend(true)}>
                      Add spend
                    </SectionAction>
                  }
                >
                  <span id="project-spend">Spend</span>
                </SectionHeading>
                {/* Spend out of a requisition is reported on the requisition,
                    so this is money somebody put in themselves. */}
                <CostEntryFormDialog
                  open={addingSpend}
                  onOpenChange={setAddingSpend}
                  title={`Add spend to ${project.name}`}
                  fixed={{
                    direction: "SPENT",
                    currency: project.currency,
                    projectId: project.id,
                    requisitionId: null,
                  }}
                  submitLabel="Add spend"
                  onSaved={() => void query.refetch()}
                />
                <CostEntryTable
                  label="Spend"
                  entries={entries}
                  showProject={false}
                  empty="Nothing spent on it yet."
                  maxWidth={SECTION_WIDTH}
                />
              </section>
            ),
          },
          {
            value: "team",
            label: "Team",
            icon: Users,
            count: members.length + (project.manager ? 1 : 0),
            titled: true,
            content: (
              <ProjectTeam
                projectId={project.id}
                owner={project.manager}
                members={members}
                canEdit={canEdit}
                maxWidth={SECTION_WIDTH}
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

/** The project's jobs: the reference, the job, how far along, where it is. */
function ProjectJobs({ jobs }: { jobs: ProjectTimelineJob[] }) {
  return (
    <section aria-labelledby="project-jobs">
      <SectionHeading count={jobs.length} maxWidth={SECTION_WIDTH} className="mt-0">
        <span id="project-jobs">Jobs</span>
      </SectionHeading>
      <ColumnList
        label="Jobs"
        maxWidth={SECTION_WIDTH}
        empty="No jobs raised yet."
        columns={[
          { id: "job", label: "Job" },
          { id: "done", label: "Done", align: "end", hideBelow: "sm" },
          { id: "status", label: "Status" },
        ]}
        rows={jobs.map((job) => ({
          id: job.id,
          cells: {
            job: (
              <ColumnName
                code={job.workOrderNo}
                name={job.title}
                meta={[
                  job.scheduledStart ? formatDate(job.scheduledStart) : "Not booked",
                  job.assignedTo?.name,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                href={jobHref(job.id)}
              />
            ),
            done: <ColumnFigure tone="muted">{job.completionPercent}%</ColumnFigure>,
            status: (
              <StatusDot tone={JOB_TONE[job.status] ?? "neutral"} label={WORK_ORDER_STATUS_LABELS[job.status]} />
            ),
          },
        }))}
      />
    </section>
  );
}
