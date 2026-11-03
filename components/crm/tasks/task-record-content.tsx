"use client";

/**
 * One task, on a page of its own.
 *
 * A task is small, so its page is too: what needs doing and — once it is done
 * — what happened, with the due date, the owner and the priority edited in
 * place beside it, and the one move it can make in the bar: complete it, or
 * reopen it. A repeating task shows its chain, the one it came from and the
 * one booked after it, since "did last week's happen?" is the question a
 * repeating task is opened to answer.
 *
 * The fields are the side panel's own (`useTaskFields`), so a task is edited
 * the same way wherever it is opened, and ticking it off goes through the same
 * completion flow as the lists — a typed task still asks what happened.
 */

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { Alert, Button, Skeleton } from "@corelithzw/react";
import { SectionHeading, StatusDot } from "@/components/management/ui";
import { RecordTable, RecordTableName, RecordCell } from "@/components/records/record-table";
import { formatDate } from "@/components/crm/money/money";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes } from "@/components/records/record-attributes";
import { RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CrmTaskRecord } from "@/lib/crm/crm-v2";
import { CRM_TASK_PRIORITY_LABELS, CRM_TASK_TYPE_LABELS, isTaskOverdue, taskRecordRef } from "@/lib/crm/tasks";
import { ciNavIcon } from "@/components/books/icons/nav-icon";
import { ci_list_check } from "@/components/books/icons/glyphs";
import { Checklist, MapPin, Repeat, Trash2, User } from "@/lib/icons";

import { useTaskFields } from "./task-detail";
import { useTaskCompletion } from "./use-task-completion";

type Occurrence = { id: string; title: string; dueAt: string; status: string };

type TaskRecord = CrmTaskRecord & {
  createdBy: { id: string; name: string | null } | null;
  site: { id: string; name: string } | null;
  recurredFrom: Occurrence | null;
  recurrences: Occurrence[];
};

const RECURRENCE_LABELS: Record<string, string> = {
  DAILY: "Every day",
  WEEKLY: "Every week",
  MONTHLY: "Every month",
};

function occurrenceStatus(occurrence: Occurrence) {
  if (occurrence.status === "COMPLETED") return <StatusDot tone="success" label="Done" />;
  if (occurrence.status === "CANCELLED") return <StatusDot tone="neutral" label="Cancelled" />;
  return new Date(occurrence.dueAt).getTime() < Date.now() ? (
    <StatusDot tone="danger" label="Overdue" />
  ) : (
    <StatusDot tone="neutral" label="Open" />
  );
}

export function TaskRecordContent({ taskId }: { taskId: string }) {
  const query = useQuery({
    queryKey: ["crm-tasks", "record", taskId],
    queryFn: () => fetchJson<{ task: TaskRecord; mayEdit: boolean }>(`/api/v2/crm/tasks/${taskId}`),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={240} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="Task not found">
        {query.error ? getApiErrorMessage(query.error) : "It may have been deleted."}
      </Alert>
    );
  }

  return <TaskRecord task={query.data.task} />;
}

function TaskRecord({ task }: { task: TaskRecord }) {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const completion = useTaskCompletion({ currentUserId });
  const fields = useTaskFields(task, {
    currentUserId,
    onDeleted: () => router.push("/crm/tasks"),
  });

  const done = task.status === "COMPLETED";
  const overdue = isTaskOverdue(task);
  const record = taskRecordRef(task);
  const recordLabel =
    task.deal?.title ?? task.lead?.title ?? task.client?.name ?? task.person?.fullName ?? null;

  const chain: Occurrence[] = [
    ...(task.recurredFrom ? [task.recurredFrom] : []),
    ...task.recurrences,
  ];

  return (
    <RecordPageShell
      icon={ciNavIcon(ci_list_check)}
      backHref="/crm/tasks"
      backLabel="Tasks"
      title={task.title}
      onTitleCommit={fields.rename}
      subtitle={[
        CRM_TASK_TYPE_LABELS[task.type],
        task.priority === "HIGH" || task.priority === "URGENT"
          ? `${CRM_TASK_PRIORITY_LABELS[task.priority]} priority`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      // Rule 5: the toolbar carries the exception — late, or called off.
      status={
        task.status === "CANCELLED"
          ? { status: "inactive", label: "Cancelled" }
          : overdue && !done
            ? { status: "failing", label: "Overdue" }
            : null
      }
      figure={
        done && task.completedAt ? `Done ${formatDate(task.completedAt)}` : `Due ${formatDate(task.dueAt)}`
      }
      finding={
        overdue && !done
          ? {
              label: "Overdue task",
              text: (
                <>
                  <b>This task was due on {formatDate(task.dueAt)}</b> — complete it or move the due date forward.
                </>
              ),
              action: {
                label: "Complete task →",
                onClick: () => completion.toggle(task),
              },
              tone: "warn" as const,
            }
          : null
      }
      kpis={[
        {
          label: "Due date",
          value: formatDate(task.dueAt),
          tone: overdue && !done ? "bad" : done ? "up" : "default",
          sub: done && task.completedAt ? `Completed ${formatDate(task.completedAt)}` : CRM_TASK_TYPE_LABELS[task.type],
        },
        {
          label: "Priority",
          value: CRM_TASK_PRIORITY_LABELS[task.priority] ?? task.priority,
          tone: task.priority === "URGENT" || task.priority === "HIGH" ? "warn" : "default",
          sub: task.assignedTo?.name ?? "Unassigned",
        },
        {
          label: "Related record",
          value: recordLabel ?? "General task",
          sub: record?.kind ? record.kind.toUpperCase() : "Standalone",
        },
        {
          label: "Recurrence",
          value: task.recurrence !== "NONE" ? (RECURRENCE_LABELS[task.recurrence] ?? task.recurrence) : "One-off",
          sub: `${chain.length} linked occurrence${chain.length === 1 ? "" : "s"}`,
        },
      ]}
      primaryAction={
        task.status === "CANCELLED" ? null : (
          <Button variant={done ? "secondary" : "primary"} onClick={() => completion.toggle(task)}>
            {done ? "Reopen" : "Complete"}
          </Button>
        )
      }
      actions={
        fields.mine
          ? [
              {
                label: "Delete task",
                icon: <Trash2 className="size-4" />,
                destructive: true,
                onSelect: fields.confirmRemove,
              },
            ]
          : undefined
      }
      related={
        <RecordRelated
          items={[
            ...(record && recordLabel ? [{ href: record.href, label: recordLabel }] : []),
            ...(task.site && record?.kind !== "site"
              ? [{ href: `/crm/sites/${task.site.id}`, label: task.site.name, dot: "bg-[var(--badge-ok-fg)]" }]
              : []),
          ]}
        />
      }
      attributes={
        <RecordAttributes
          attributes={[
            ...fields.attributes,
            ...(task.recurrence !== "NONE"
              ? [
                  {
                    id: "repeats",
                    label: "Repeats",
                    icon: Repeat,
                    value:
                      task.recurrenceInterval > 1
                        ? `Every ${task.recurrenceInterval} ${task.recurrence === "DAILY" ? "days" : task.recurrence === "WEEKLY" ? "weeks" : "months"}`
                        : (RECURRENCE_LABELS[task.recurrence] ?? task.recurrence),
                  },
                ]
              : []),
            ...(task.site
              ? [
                  {
                    id: "site",
                    label: "Site",
                    icon: MapPin,
                    display: <EntityLink href={`/crm/sites/${task.site.id}`}>{task.site.name}</EntityLink>,
                  },
                ]
              : []),
            {
              id: "raised-by",
              label: "Raised by",
              icon: User,
              value: task.createdBy?.name ?? null,
              placeholder: "Not recorded",
            },
          ]}
        />
      }
      activeTab="task"
      onTabChange={() => undefined}
      tabs={[
        {
          value: "task",
          label: "Task",
          icon: Checklist,
          content: (
            <div className="space-y-6">
              {fields.notes}

              {chain.length > 0 ? (
                <section aria-labelledby="task-chain">
                  <SectionHeading count={chain.length}>
                    <span id="task-chain">The same task, other times</span>
                  </SectionHeading>
                  <RecordTable
                    columns={[
                      {
                        id: "task",
                        label: "Task",
                        cell: (occurrence) => (
                          <RecordTableName
                            title={occurrence.title}
                            subtitle={occurrence.id === task.recurredFrom?.id ? "The one before" : "Booked after"}
                          />
                        ),
                      },
                      {
                        id: "status",
                        label: "Status",
                        width: "8.5rem",
                        cell: (occurrence) => occurrenceStatus(occurrence),
                      },
                      {
                        id: "due",
                        label: "Due",
                        width: "8.5rem",
                        align: "end",
                        cell: (occurrence) => (
                          <RecordCell kind="date" value={formatDate(occurrence.dueAt)} />
                        ),
                      },
                    ]}
                    rows={chain}
                    rowHref={(occurrence) => `/crm/tasks/${occurrence.id}`}
                    emptyTitle="No linked occurrences."
                  />
                </section>
              ) : null}
            </div>
          ),
        },
      ]}
    >
      {completion.dialogs}
    </RecordPageShell>
  );
}
