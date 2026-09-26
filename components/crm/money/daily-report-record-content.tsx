"use client";

/**
 * One person's day, as they closed it — the page the close-the-day
 * notification opens.
 *
 * The stored report, not a recomputed one: the 14th read three weeks later is
 * the 14th as it was submitted. Everything it names is a way in — the visits,
 * the jobs, the tasks, the requisitions — and the day's money lines are one
 * link away in the cost tracker, filtered to the person and the day.
 *
 * The flags lead, as they do on the card: they are the part of a report that
 * wants somebody.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Alert, Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnText,
  FactList,
  SectionHeading,
  StatusDot,
} from "@/components/management/ui";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { DailyReportSummary } from "@/lib/crm/daily-report";
import { JOB_TONE, REQUISITION_TONE, VISIT_STATUS_LABELS, VISIT_TONE } from "@/lib/crm/tones";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/crm/work-orders";
import { CalendarCheck, Checklist, ClipboardText, Send, User, Wrench } from "@/lib/icons";

import {
  CATEGORY_LABELS,
  REQUISITION_STATUS_LABELS,
  formatDate,
  formatDay,
  formatMoney,
  type Category,
  type RequisitionStatus,
} from "./money";

type Report = {
  id: string;
  reportDate: string;
  generatedAt: string;
  sentAt: string | null;
  user: { id: string; name: string | null };
  summary: DailyReportSummary;
};

/** The section's measure. */
const WIDTH = 760;

export function DailyReportRecordContent({ reportId }: { reportId: string }) {
  const query = useQuery({
    queryKey: ["crm", "daily-reports", "record", reportId],
    queryFn: () => fetchJson<{ report: Report }>(`/api/v2/crm/daily-reports/${reportId}`),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={320} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="Report not found">
        {query.error ? getApiErrorMessage(query.error) : "It may be somebody else's."}
      </Alert>
    );
  }

  const { report } = query.data;
  const { summary } = report;
  const day = report.reportDate.slice(0, 10);
  const person = report.user.name ?? "Somebody";
  const linesHref = `/crm/cost-tracker?person=${report.user.id}&from=${day}&to=${day}`;

  const attributes: RecordAttribute[] = [
    {
      id: "person",
      label: "Whose",
      icon: User,
      display: <EntityLink href={`/crm/reps/${report.user.id}`}>{person}</EntityLink>,
    },
    { id: "day", label: "Day", icon: CalendarCheck, tone: "code", value: formatDate(day) },
    {
      id: "sent",
      label: "Sent to management",
      icon: Send,
      tone: "code",
      value: report.sentAt ? formatDate(report.sentAt) : null,
      placeholder: "Not sent",
    },
    { id: "visits", label: "Visits", icon: CalendarCheck, tone: "code", value: String(summary.visits.length) },
    { id: "jobs", label: "Jobs", icon: Wrench, tone: "code", value: String(summary.jobs.length) },
    {
      id: "tasks",
      label: "Tasks done",
      icon: Checklist,
      tone: "code",
      value: `${summary.tasks.completed.length} · ${summary.tasks.stillOpen} still open`,
    },
  ];

  const money = summary.money;

  return (
    <RecordPageShell
      icon={ClipboardText}
      backHref="/crm/daily-reports"
      backLabel="Daily reports"
      title={formatDay(day)}
      subtitle={person}
      status={
        summary.flags.length > 0
          ? { status: "need_changes", label: `${summary.flags.length} to look at` }
          : null
      }
      bandValue={`${formatMoney(money.spent)} spent`}
      related={
        <RecordRelated items={[{ href: `/crm/reps/${report.user.id}`, label: person }]} />
      }
      attributes={<RecordAttributes attributes={attributes} />}
      activeTab="report"
      onTabChange={() => undefined}
      tabs={[
        {
          value: "report",
          label: "Report",
          icon: ClipboardText,
          content: (
            <div style={{ maxWidth: WIDTH }}>
              {summary.flags.length > 0 ? (
                <section aria-labelledby="report-flags">
                  <SectionHeading count={summary.flags.length} maxWidth={WIDTH} className="mt-0">
                    <span id="report-flags">To look at</span>
                  </SectionHeading>
                  <ul className="space-y-1.5">
                    {summary.flags.map((flag) => (
                      <li key={flag}>
                        <StatusDot tone="warn" label={flag} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-labelledby="report-money">
                <SectionHeading
                  maxWidth={WIDTH}
                  action={
                    <Link
                      href={linesHref}
                      className="text-sm text-[var(--brand-strong)] underline decoration-transparent underline-offset-2 hover:decoration-current"
                    >
                      See the day&apos;s lines
                    </Link>
                  }
                >
                  <span id="report-money">Money</span>
                </SectionHeading>
                <FactList
                  align="end"
                  maxWidth={WIDTH}
                  labelWidth={200}
                  items={[
                    { label: "Received", value: formatMoney(money.received), mono: true },
                    { label: "Spent", value: formatMoney(money.spent), mono: true },
                    { label: "In hand at the close", value: formatMoney(money.balance), mono: true },
                    { label: "Float still out", value: formatMoney(summary.requisitions.outstanding), mono: true },
                    {
                      label: "Lines without a receipt",
                      value: String(money.missingReceipts),
                      mono: true,
                      tone: money.missingReceipts > 0 ? "warn" : "muted",
                    },
                  ]}
                />
                {money.byCategory.length > 0 ? (
                  <ColumnList
                    className="mt-4"
                    label="Spent by category"
                    maxWidth={WIDTH}
                    columns={[
                      { id: "category", label: "Category" },
                      { id: "spent", label: "Spent", align: "end" },
                    ]}
                    rows={money.byCategory.map((row) => ({
                      id: row.category,
                      cells: {
                        category: <ColumnName name={CATEGORY_LABELS[row.category as Category] ?? row.category} />,
                        spent: <ColumnFigure>{formatMoney(row.spent)}</ColumnFigure>,
                      },
                    }))}
                  />
                ) : null}
                {money.byProject.some((row) => row.projectId) ? (
                  <ColumnList
                    className="mt-4"
                    label="Spent by project"
                    maxWidth={WIDTH}
                    columns={[
                      { id: "project", label: "Project" },
                      { id: "spent", label: "Spent", align: "end" },
                    ]}
                    rows={money.byProject.map((row) => ({
                      id: row.projectId ?? "none",
                      cells: {
                        project: (
                          <ColumnName
                            name={row.projectName ?? "Not for a project"}
                            href={row.projectId ? `/crm/projects/${row.projectId}` : null}
                          />
                        ),
                        spent: <ColumnFigure>{formatMoney(row.spent)}</ColumnFigure>,
                      },
                    }))}
                  />
                ) : null}
              </section>

              <section aria-labelledby="report-visits">
                <SectionHeading count={summary.visits.length} maxWidth={WIDTH}>
                  <span id="report-visits">Site visits</span>
                </SectionHeading>
                <ColumnList
                  label="Site visits"
                  maxWidth={WIDTH}
                  empty="No site visits."
                  columns={[
                    { id: "visit", label: "Visit" },
                    { id: "status", label: "Status" },
                    { id: "sections", label: "Sections", align: "end", hideBelow: "sm" },
                  ]}
                  rows={summary.visits.map((visit) => ({
                    id: visit.id,
                    cells: {
                      visit: (
                        <ColumnName
                          name={visit.title}
                          meta={[visit.clientName, visit.siteName].filter(Boolean).join(" · ") || undefined}
                          href={`/crm/appointments/${visit.id}`}
                        />
                      ),
                      status: (
                        <StatusDot tone={VISIT_TONE[visit.status] ?? "neutral"} label={VISIT_STATUS_LABELS[visit.status] ?? visit.status} />
                      ),
                      sections: <ColumnFigure tone="muted">{visit.sectionsAnswered}</ColumnFigure>,
                    },
                  }))}
                />
              </section>

              <section aria-labelledby="report-jobs">
                <SectionHeading count={summary.jobs.length} maxWidth={WIDTH}>
                  <span id="report-jobs">Jobs</span>
                </SectionHeading>
                <ColumnList
                  label="Jobs"
                  maxWidth={WIDTH}
                  empty="No jobs."
                  columns={[
                    { id: "job", label: "Job" },
                    { id: "status", label: "Status" },
                  ]}
                  rows={summary.jobs.map((job) => ({
                    id: job.id,
                    cells: {
                      job: <ColumnName name={job.title} meta={job.clientName ?? undefined} href={`/crm/work-orders/${job.id}`} />,
                      status: (
                        <StatusDot
                          tone={JOB_TONE[job.status] ?? "neutral"}
                          label={WORK_ORDER_STATUS_LABELS[job.status as keyof typeof WORK_ORDER_STATUS_LABELS] ?? job.status}
                        />
                      ),
                    },
                  }))}
                />
              </section>

              <section aria-labelledby="report-tasks">
                <SectionHeading count={summary.tasks.completed.length} maxWidth={WIDTH}>
                  <span id="report-tasks">Tasks done</span>
                </SectionHeading>
                <ColumnList
                  label="Tasks done"
                  maxWidth={WIDTH}
                  empty="No tasks done."
                  columns={[{ id: "task", label: "Task" }]}
                  rows={summary.tasks.completed.map((task) => ({
                    id: task.id,
                    cells: { task: <ColumnName name={task.title} href={`/crm/tasks/${task.id}`} /> },
                  }))}
                />
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {summary.tasks.stillOpen} still open
                  {summary.tasks.overdue > 0 ? `, ${summary.tasks.overdue} of them overdue` : ""}.
                </p>
              </section>

              {summary.requisitions.raised.length > 0 ? (
                <section aria-labelledby="report-requisitions">
                  <SectionHeading count={summary.requisitions.raised.length} maxWidth={WIDTH}>
                    <span id="report-requisitions">Money asked for</span>
                  </SectionHeading>
                  <ColumnList
                    label="Money asked for"
                    maxWidth={WIDTH}
                    columns={[
                      { id: "requisition", label: "Requisition" },
                      { id: "status", label: "Status" },
                      { id: "amount", label: "Amount", align: "end" },
                    ]}
                    rows={summary.requisitions.raised.map((requisition) => ({
                      id: requisition.id,
                      cells: {
                        requisition: (
                          <ColumnName
                            code={requisition.requisitionNo}
                            name={CATEGORY_LABELS[requisition.category as Category] ?? requisition.category}
                            href={`/crm/requisitions/${requisition.id}`}
                          />
                        ),
                        status: (
                          <StatusDot
                            tone={REQUISITION_TONE[requisition.status] ?? "neutral"}
                            label={REQUISITION_STATUS_LABELS[requisition.status as RequisitionStatus] ?? requisition.status}
                          />
                        ),
                        amount: <ColumnFigure>{formatMoney(requisition.amount)}</ColumnFigure>,
                      },
                    }))}
                  />
                </section>
              ) : null}

              <section aria-labelledby="report-notes">
                <SectionHeading maxWidth={WIDTH}>
                  <span id="report-notes">What they said</span>
                </SectionHeading>
                {summary.notes ? (
                  <p className="whitespace-pre-line text-sm text-[var(--text-strong)]">{summary.notes}</p>
                ) : (
                  <ColumnText>Nothing written.</ColumnText>
                )}
              </section>
            </div>
          ),
        },
      ]}
    />
  );
}
