"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { RecordAttributes } from "@corelithzw/module-records/components/record-attributes";
import { useAttributeEditor } from "@corelithzw/module-records/components/use-attribute-editor";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { deleteCrmTask, type CrmTaskRecord } from "../../crm-v2";
import {
  CRM_TASK_OUTCOME_LABELS,
  CRM_TASK_PRIORITY_LABELS,
  CRM_TASK_TYPE_LABELS,
  isTaskOverdue,
  taskRecordRef,
} from "../../tasks";
import { TASK_PRIORITY_TONE } from "../../tones";
import { Calendar, Checklist, Repeat, Trash2, UserRound, Zap } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * One task, beside the list it came from.
 *
 * Everything here writes through on blur or Enter, the same grammar the record
 * page's properties use — press the thing you are looking at. That is the whole
 * reason the panel exists: before it, changing a task's due date meant opening
 * the form sheet over the list, and the form sheet asks for every field when
 * you came to change one.
 *
 * Two things deliberately do *not* happen here.
 *
 * Completing a typed task still goes through the outcome dialog rather than a
 * checkbox that quietly closes it — the answer is the part worth keeping, and
 * the server refuses the write without one anyway. So the tick is handed back
 * to the list, which already owns that flow.
 *
 * And the record this task is filed against is a link, not a picker. Moving a
 * task between records is a real operation with real consequences (it changes
 * whose timeline it appears on) and it belongs in the form, not in a field you
 * can brush past.
 */
export function TaskDetail({
  task,
  currentUserId,
  onToggle,
  onDeleted,
}: {
  task: CrmTaskRecord;
  currentUserId?: string;
  /** Ticking the box — the list owns it, because it may need the outcome dialog. */
  onToggle: (task: CrmTaskRecord) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const done = task.status === "COMPLETED";
  const overdue = isTaskOverdue(task);
  const record = taskRecordRef(task);
  const recordLabel =
    task.deal?.title ?? task.lead?.title ?? task.client?.name ?? task.person?.fullName ?? null;

  const editor = useAttributeEditor({
    path: `/api/v2/crm/tasks/${task.id}`,
    invalidate: [["crm-tasks"]],
  });

  const team = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string | null }> }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
  });

  const remove = useMutation({
    mutationFn: () => deleteCrmTask(task.id),
    onSuccess: () => {
      toast({ title: "Task deleted" });
      onDeleted();
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const mine = task.assignedToId === currentUserId || !task.assignedToId;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5">
        <Checkbox
          className="mt-1"
          checked={done}
          onCheckedChange={() => onToggle(task)}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        />
        <div className="min-w-0 flex-1">
          <TaskTitle
            title={task.title}
            done={done}
            onCommit={(next) => editor.save.mutate({ title: next })}
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" size="sm">
              {CRM_TASK_TYPE_LABELS[task.type]}
            </Badge>
            {task.priority !== "NORMAL" && task.priority !== "LOW" ? (
              <Badge tone={TASK_PRIORITY_TONE[task.priority] ?? "neutral"} size="sm">
                {CRM_TASK_PRIORITY_LABELS[task.priority]}
              </Badge>
            ) : null}
            {task.recurrence !== "NONE" ? (
              <span
                className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)]"
                title="Repeating task"
              >
                <Repeat className="size-3.5" aria-hidden="true" />
                {task.recurrence.toLowerCase()}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <RecordAttributes
        visibleCount={6}
        columns={1}
        attributes={[
          {
            id: "due",
            label: "Due",
            icon: Calendar,
            kind: "date",
            // The server wants a full instant and the field gives a day, so the
            // day is anchored at 09:00 local — a task due "on Thursday" that
            // lands at midnight reads as overdue for the whole of Thursday.
            value: task.dueAt.slice(0, 10),
            formatted: new Date(task.dueAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
            onCommit: (next) => {
              if (!next) return;
              const at = new Date(`${next}T09:00:00`);
              if (Number.isNaN(at.getTime())) return;
              editor.save.mutate({ dueAt: at.toISOString(), hasDueTime: false });
            },
          },
          {
            id: "assignee",
            label: "Assigned to",
            icon: UserRound,
            ...editor.choice(
              "assignedToId",
              task.assignedToId,
              (team.data?.data ?? []).map((member) => ({
                value: member.id,
                label: member.name ?? "Unnamed",
              })),
              "Leave unassigned",
            ),
            placeholder: "Unassigned",
          },
          {
            id: "priority",
            label: "Priority",
            icon: Zap,
            ...editor.choice(
              "priority",
              task.priority,
              Object.entries(CRM_TASK_PRIORITY_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            ),
          },
          {
            id: "status",
            label: "Status",
            icon: Checklist,
            display: (
              <span
                className={cn(
                  "block py-2 text-sm leading-5 sm:py-1",
                  overdue && !done ? "text-[var(--status-danger-fg)]" : "",
                )}
              >
                {done ? "Completed" : overdue ? "Overdue" : "Open"}
              </span>
            ),
          },
          ...(record && recordLabel
            ? [
                {
                  id: "record",
                  label: "On",
                  icon: Checklist,
                  display: (
                    <span className="block py-2 text-sm leading-5 sm:py-1">
                      <EntityLink href={record.href}>{recordLabel}</EntityLink>
                    </span>
                  ),
                },
              ]
            : []),
          ...(task.outcome
            ? [
                {
                  id: "outcome",
                  label: "Outcome",
                  icon: Checklist,
                  display: (
                    <span className="block py-2 text-sm leading-5 sm:py-1">
                      {CRM_TASK_OUTCOME_LABELS[task.outcome]}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      <TaskNotes
        label="Description"
        value={task.description}
        placeholder="What needs doing, and anything the next person would need to know."
        onCommit={(next) => editor.save.mutate({ description: next || null })}
      />

      {done ? (
        <TaskNotes
          label="What happened"
          value={task.outcomeNotes}
          placeholder="Nothing written down."
          onCommit={(next) => editor.save.mutate({ outcomeNotes: next || null })}
        />
      ) : null}

      {mine ? (
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[var(--status-error-text)]"
            onClick={async () => {
              const confirmed = await dsConfirm({
                title: "Delete this task?",
                description: task.title,
                confirmLabel: "Delete",
                variant: "danger",
              });
              if (confirmed) remove.mutate();
            }}
          >
            <Trash2 className="mr-1.5 size-4" aria-hidden="true" />
            Delete task
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The task's name, edited where it is read — same as a record's own title. */
function TaskTitle({
  title,
  done,
  onCommit,
}: {
  title: string;
  done: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        title="Rename"
        onClick={() => setDraft(title)}
        className={cn(
          "-mx-1.5 block w-full rounded-[var(--radius-sm)] px-1.5 text-left text-base font-semibold leading-snug hover:bg-[var(--surface-subtle)]",
          done ? "text-[var(--text-muted)] line-through" : "text-[var(--text-strong)]",
        )}
      >
        {title}
      </button>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onCommit(trimmed);
    setDraft(null);
  };

  return (
    <textarea
      autoFocus
      rows={Math.min(4, Math.max(1, Math.ceil(draft.length / 30)))}
      value={draft}
      aria-label="Task name"
      className="-mx-1.5 block w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-base)] px-1.5 py-0.5 text-base font-semibold leading-snug text-[var(--text-strong)] outline-none focus:border-[var(--action-primary-bg)]"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") setDraft(null);
      }}
    />
  );
}

/**
 * A paragraph of a task, edited in place.
 *
 * Not a `RecordAttribute`: those are one line in a two-column list, and a
 * description that runs to a paragraph in a 112px-labelled row is unreadable in
 * both states. It gets its own heading and the full width under it.
 */
function TaskNotes({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
        {label}
      </h4>
      {draft === null ? (
        <button
          type="button"
          onClick={() => setDraft(value ?? "")}
          className={cn(
            "-mx-1.5 block w-full whitespace-pre-wrap rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-sm hover:bg-[var(--surface-subtle)]",
            value ? "text-[var(--text-body)]" : "text-[var(--text-muted)]",
          )}
        >
          {value || placeholder}
        </button>
      ) : (
        <Textarea
          autoFocus
          rows={4}
          value={draft}
          aria-label={label}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== (value ?? "")) onCommit(draft);
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setDraft(null);
          }}
        />
      )}
    </section>
  );
}
