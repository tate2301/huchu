"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge, Button, EmptyState } from "@corelithzw/react";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { deleteCrmTask, type CrmTaskRecord } from "@/lib/crm/crm-v2";
import {
  CRM_TASK_OUTCOME_LABELS,
  CRM_TASK_TYPE_LABELS,
  isTaskOverdue,
  taskRecordRef,
} from "@/lib/crm/tasks";
import { TASK_PRIORITY_TONE } from "@/lib/crm/tones";
import { Clock, Repeat, Trash2 } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

import { useTaskCompletion } from "./use-task-completion";

/**
 * The task list, shared by the queue page and every record page's Tasks tab.
 *
 * Ticking a typed task opens the outcome dialog rather than silently closing
 * it, because the answer is the part worth keeping. That machinery lives in
 * `useTaskCompletion` now: the split view's detail panel has the same checkbox
 * and has to behave the same way, and a surface that owns the flow can pass its
 * own `onToggle` in so the two halves share one dialog rather than racing two.
 *
 * ## Rows are selectable when somebody is listening
 *
 * Given `onSelect` the row becomes a button that opens the task beside the
 * list, and the selected one is marked. Without it the list is what it always
 * was — a register you read, with a checkbox and a delete. The queue page wants
 * the second; a record's Tasks section wants the first.
 */
export function TaskList({
  tasks,
  isLoading,
  emptyMessage = "Nothing outstanding.",
  showRecord = true,
  currentUserId,
  onToggle,
  selectedId,
  onSelect,
  grouped = false,
}: {
  tasks: CrmTaskRecord[];
  isLoading?: boolean;
  emptyMessage?: string;
  showRecord?: boolean;
  currentUserId?: string;
  /**
   * Completing a task, when the caller owns that flow. Given one, this list
   * renders no dialogs of its own — the caller is mounting them.
   */
  onToggle?: (task: CrmTaskRecord) => void;
  selectedId?: string | null;
  onSelect?: (task: CrmTaskRecord) => void;
  /**
   * Split into what needs doing now, what is coming, and what is done. Worth it
   * on a record, where a year of trading leaves thirty tasks in one undivided
   * column; not worth it on the queue page, whose tabs have already answered
   * the same question.
   */
  grouped?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const completion = useTaskCompletion({ currentUserId });
  const toggle = onToggle ?? completion.toggle;

  const remove = useMutation({
    mutationFn: (id: string) => deleteCrmTask(id),
    onSuccess: () => {
      toast({ title: "Task deleted" });
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const groups = useMemo(() => {
    if (!grouped) return [{ id: "all", label: null as string | null, tasks }];
    const overdue: CrmTaskRecord[] = [];
    const open: CrmTaskRecord[] = [];
    const done: CrmTaskRecord[] = [];
    for (const task of tasks) {
      if (task.status === "COMPLETED") done.push(task);
      else if (isTaskOverdue(task)) overdue.push(task);
      else open.push(task);
    }
    return [
      { id: "overdue", label: "Overdue", tasks: overdue },
      { id: "open", label: "To do", tasks: open },
      { id: "done", label: "Done", tasks: done },
    ].filter((group) => group.tasks.length > 0);
  }, [grouped, tasks]);

  if (isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading tasks…</p>;
  }

  if (!tasks.length) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <>
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.id} className="space-y-1">
            {group.label ? (
              <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                {group.label}
                <span className="font-mono tabular-nums font-normal">{group.tasks.length}</span>
              </h4>
            ) : null}

            <ul className="space-y-0.5">
              {group.tasks.map((task) => {
                const overdue = isTaskOverdue(task);
                const record = showRecord ? taskRecordRef(task) : null;
                const recordLabel =
                  task.deal?.title ??
                  task.lead?.title ??
                  task.client?.name ??
                  task.person?.fullName ??
                  null;
                const selected = selectedId === task.id;

                const facts = (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        overdue ? "text-[var(--status-danger-fg)]" : "",
                      )}
                    >
                      <Clock className="size-3.5" />
                      <ClientDate
                        value={task.dueAt}
                        mode={task.hasDueTime ? "datetime" : "date"}
                      />
                    </span>
                    {task.priority !== "NORMAL" && task.priority !== "LOW" ? (
                      <Badge tone={TASK_PRIORITY_TONE[task.priority] ?? "neutral"} size="sm">
                        {task.priority.toLowerCase()}
                      </Badge>
                    ) : null}
                    {task.assignedTo ? (
                      <span>{task.assignedTo.name}</span>
                    ) : (
                      <span>Unassigned</span>
                    )}
                    {task.outcome ? (
                      <span className="font-medium text-[var(--text-primary)]">
                        {CRM_TASK_OUTCOME_LABELS[task.outcome]}
                      </span>
                    ) : null}
                  </div>
                );

                const heading = (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        task.status === "COMPLETED"
                          ? "text-[var(--text-muted)] line-through"
                          : "",
                      )}
                    >
                      {task.title}
                    </span>
                    <Badge tone="neutral" size="sm">
                      {CRM_TASK_TYPE_LABELS[task.type]}
                    </Badge>
                    {task.recurrence !== "NONE" ? (
                      <Repeat
                        className="size-3.5 text-[var(--text-muted)]"
                        aria-label="Repeating task"
                      />
                    ) : null}
                  </div>
                );

                return (
                  <li
                    key={task.id}
                    className={cn(
                      "flex items-start gap-3 rounded-[var(--radius-md)] p-2.5",
                      selected
                        ? "bg-[var(--surface-subtle)]"
                        : onSelect
                          ? "hover:bg-[var(--surface-muted)]"
                          : "",
                    )}
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={task.status === "COMPLETED"}
                      onCheckedChange={() => toggle(task)}
                      aria-label={`Complete ${task.title}`}
                    />

                    {onSelect ? (
                      // The row opens the task beside the list. A button rather
                      // than a link: there is nowhere to navigate to — the task
                      // has no page of its own, and giving it one would be a
                      // third place the same six fields are maintained.
                      <button
                        type="button"
                        onClick={() => onSelect(task)}
                        aria-current={selected ? "true" : undefined}
                        className="min-w-0 flex-1 text-left"
                      >
                        {heading}
                        {facts}
                      </button>
                    ) : (
                      <div className="min-w-0 flex-1">
                        {heading}
                        {facts}
                        {task.outcomeNotes ? (
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            {task.outcomeNotes}
                          </p>
                        ) : null}
                        {record && recordLabel ? (
                          <Link
                            href={record.href}
                            className="mt-1 inline-block text-sm text-[var(--text-muted)] hover:underline"
                          >
                            {recordLabel}
                          </Link>
                        ) : null}
                      </div>
                    )}

                    {/* Asked first. This is a one-tap delete at the right edge of
                        every row, which on a phone is exactly where a thumb lands
                        while scrolling, and a deleted task has no undo.
                        The split view drops it — the panel beside the list has
                        the same button with room for a label, and two deletes for
                        one task is one too many. */}
                    {!onSelect &&
                    (task.assignedToId === currentUserId || !task.assignedToId) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${task.title}`}
                        onClick={async () => {
                          const confirmed = await dsConfirm({
                            title: "Delete this task?",
                            description: task.title,
                            confirmLabel: "Delete",
                            variant: "danger",
                          });
                          if (confirmed) remove.mutate(task.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Only when this list owns the flow. Given an `onToggle`, the caller is
          mounting its own pair and a second set here would open two dialogs for
          one tick. */}
      {onToggle ? null : completion.dialogs}
    </>
  );
}
