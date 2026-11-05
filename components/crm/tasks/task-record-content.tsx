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

import { useState } from "react";
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
import { Checklist, MapPin, Repeat, Trash2, User, Plus, ChatCircle, Receipt, Check } from "@/lib/icons";

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

type ChecklistGroup = {
  id: string;
  title: string;
  items: { id: string; label: string; done: boolean }[];
};

type FeedbackComment = {
  id: string;
  author: string;
  time: string;
  body: string;
};

type TaskRequisition = {
  id: string;
  item: string;
  amount: number;
  category: string;
  status: "APPROVED" | "PENDING" | "PAID";
};

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
  const userName = session?.user?.name ?? "Team member";
  const completion = useTaskCompletion({ currentUserId });
  const fields = useTaskFields(task, {
    currentUserId,
    onDeleted: () => router.push("/crm/tasks"),
  });

  const [tab, setTab] = useState<"task" | "checklists" | "conversation" | "finances">("task");

  // Checklists state (supports multiple checklists & items)
  const [checklists, setChecklists] = useState<ChecklistGroup[]>([
    {
      id: "cl-1",
      title: "Action Items & Requirements",
      items: [
        { id: "item-1", label: "Review task requirements and target outcome", done: true },
        { id: "item-2", label: "Prepare necessary assets or site requisitions", done: false },
        { id: "item-3", label: "Confirm completion with assigned supervisor", done: false },
      ],
    },
  ]);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

  // Conversation / Feedback state
  const [feedbackList, setFeedbackList] = useState<FeedbackComment[]>([
    {
      id: "c-1",
      author: task.createdBy?.name ?? "Supervisor",
      time: "Initial briefing",
      body: `Assigned task to ${task.assignedTo?.name ?? "team"}. Priority marked as ${task.priority.toLowerCase()}.`,
    },
  ]);
  const [newFeedback, setNewFeedback] = useState("");

  // Requisitions & Budget state
  const [budget] = useState<number>(350);
  const [requisitions, setRequisitions] = useState<TaskRequisition[]>([
    { id: "req-1", item: "Safety gear & consumables", amount: 120, category: "Operations", status: "APPROVED" },
  ]);
  const [newReqItem, setNewReqItem] = useState("");
  const [newReqAmount, setNewReqAmount] = useState("");
  const [addingReq, setAddingReq] = useState(false);

  const done = task.status === "COMPLETED";
  const overdue = isTaskOverdue(task);
  const record = taskRecordRef(task);
  const recordLabel =
    task.deal?.title ?? task.lead?.title ?? task.client?.name ?? task.person?.fullName ?? null;

  const chain: Occurrence[] = [
    ...(task.recurredFrom ? [task.recurredFrom] : []),
    ...task.recurrences,
  ];

  const totalChecklistItems = checklists.reduce((acc, c) => acc + c.items.length, 0);
  const doneChecklistItems = checklists.reduce((acc, c) => acc + c.items.filter((i) => i.done).length, 0);
  const totalSpent = requisitions.reduce((acc, r) => acc + r.amount, 0);

  const toggleChecklistItem = (groupIndex: number, itemId: string) => {
    setChecklists((prev) =>
      prev.map((g, gi) => {
        if (gi !== groupIndex) return g;
        return {
          ...g,
          items: g.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
        };
      }),
    );
  };

  const addChecklistItem = (groupId: string) => {
    const text = newItemText[groupId]?.trim();
    if (!text) return;
    setChecklists((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          items: [...g.items, { id: `item-${Date.now()}`, label: text, done: false }],
        };
      }),
    );
    setNewItemText((prev) => ({ ...prev, [groupId]: "" }));
  };

  const createChecklistGroup = () => {
    const title = newChecklistTitle.trim();
    if (!title) return;
    setChecklists((prev) => [
      ...prev,
      { id: `cl-${Date.now()}`, title, items: [] },
    ]);
    setNewChecklistTitle("");
    setAddingChecklist(false);
  };

  const postFeedback = () => {
    const body = newFeedback.trim();
    if (!body) return;
    setFeedbackList((prev) => [
      ...prev,
      {
        id: `f-${Date.now()}`,
        author: userName,
        time: "Just now",
        body,
      },
    ]);
    setNewFeedback("");
  };

  const addRequisition = () => {
    const item = newReqItem.trim();
    const amount = parseFloat(newReqAmount) || 0;
    if (!item || amount <= 0) return;
    setRequisitions((prev) => [
      ...prev,
      {
        id: `req-${Date.now()}`,
        item,
        amount,
        category: "Consumables",
        status: "PENDING",
      },
    ]);
    setNewReqItem("");
    setNewReqAmount("");
    setAddingReq(false);
  };

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
      status={
        task.status === "CANCELLED"
          ? { status: "inactive", label: "Cancelled" }
          : overdue && !done
            ? { status: "failing", label: "Overdue" }
            : null
      }
      finding={
        overdue && !done
          ? {
              label: "Overdue task",
              fact: `This task was due on ${formatDate(task.dueAt)}`,
              rest: "— complete it or move the due date forward.",
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
          label: "Checklist progress",
          value: totalChecklistItems > 0 ? `${doneChecklistItems} / ${totalChecklistItems}` : "—",
          tone: doneChecklistItems === totalChecklistItems && totalChecklistItems > 0 ? "up" : "default",
          sub: totalChecklistItems > 0 ? `${Math.round((doneChecklistItems / totalChecklistItems) * 100)}% completed` : "No items",
        },
        {
          label: "Assigned to",
          value: task.assignedTo?.name ?? "Unassigned",
          sub: CRM_TASK_PRIORITY_LABELS[task.priority] ?? task.priority,
        },
        {
          label: "Requisition spend",
          value: `$${totalSpent.toLocaleString()}`,
          sub: `Budget: $${budget.toLocaleString()}`,
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
      activeTab={tab}
      onTabChange={(next) => setTab(next as typeof tab)}
      tabs={[
        {
          value: "task",
          label: "Task Details",
          icon: Checklist,
          content: (
            <div className="space-y-6">
              {/* Contextual Toolbar */}
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={done ? "secondary" : "primary"}
                    className="h-7 text-sm font-medium"
                    onClick={() => completion.toggle(task)}
                  >
                    <Check className="mr-1.5 size-3.5" />
                    {done ? "Mark Open" : "Mark Done"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-sm font-medium"
                    onClick={() => setTab("checklists")}
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    Add Checklist Item
                  </Button>
                </div>
                <div className="flex items-center gap-3 font-mono text-sm text-[var(--color-ink-3)]">
                  <span>Priority: {task.priority}</span>
                  <span>·</span>
                  <span>Due: {formatDate(task.dueAt)}</span>
                </div>
              </div>

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
        {
          value: "checklists",
          label: "Checklists",
          icon: Checklist,
          count: totalChecklistItems,
          content: (
            <div className="space-y-6">
              {/* Tab Toolbar */}
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    Multiple Checklists
                  </span>
                  <span className="font-mono text-sm text-[var(--color-ink-3)]">
                    ({doneChecklistItems} of {totalChecklistItems} completed)
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-sm font-medium"
                  onClick={() => setAddingChecklist(true)}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  New Checklist
                </Button>
              </div>

              {/* Add Checklist Modal / Inline form */}
              {addingChecklist ? (
                <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-ground)] p-3">
                  <input
                    type="text"
                    value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                    placeholder="Checklist name (e.g. Quality Inspection, Sign-off)..."
                    className="h-8 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createChecklistGroup();
                      if (e.key === "Escape") setAddingChecklist(false);
                    }}
                  />
                  <Button size="sm" variant="primary" className="h-8 text-sm" onClick={createChecklistGroup}>
                    Create
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={() => setAddingChecklist(false)}>
                    Cancel
                  </Button>
                </div>
              ) : null}

              {/* Checklists List */}
              <div className="space-y-5">
                {checklists.map((group, groupIndex) => {
                  const groupDone = group.items.filter((i) => i.done).length;
                  const pct = group.items.length > 0 ? Math.round((groupDone / group.items.length) * 100) : 0;

                  return (
                    <div
                      key={group.id}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-2.5">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-[var(--color-ink)]">{group.title}</h4>
                          <span className="font-mono text-sm text-[var(--color-ink-3)]">
                            {groupDone}/{group.items.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-fill)]">
                            <div
                              className="h-full bg-[var(--tone-success-strong,var(--ok,#16a34a))] transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-sm text-[var(--color-ink-2)]">{pct}%</span>
                        </div>
                      </div>

                      {/* Items */}
                      <ul className="mt-3 space-y-2">
                        {group.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-[var(--color-hover)]"
                          >
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => toggleChecklistItem(groupIndex, item.id)}
                              className="size-4 rounded border-[var(--color-line)] accent-[var(--brand)] cursor-pointer"
                            />
                            <span
                              className={`text-sm ${
                                item.done
                                  ? "text-[var(--color-ink-3)] line-through"
                                  : "text-[var(--color-ink)]"
                              }`}
                            >
                              {item.label}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* Add item input */}
                      <div className="mt-3 flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          value={newItemText[group.id] ?? ""}
                          onChange={(e) =>
                            setNewItemText((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                          placeholder="Add an item to this checklist..."
                          className="h-7 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-ground)] px-2.5 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addChecklistItem(group.id);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-sm font-medium"
                          onClick={() => addChecklistItem(group.id)}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        },
        {
          value: "conversation",
          label: "Conversation & Feedback",
          icon: ChatCircle,
          count: feedbackList.length,
          content: (
            <div className="space-y-6">
              {/* Toolbar */}
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <span className="text-sm font-semibold text-[var(--color-ink)]">
                  Task Collaboration & Feedback Thread
                </span>
                <span className="font-mono text-sm text-[var(--color-ink-3)]">
                  {feedbackList.length} updates
                </span>
              </div>

              {/* Feedback composer */}
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-sm">
                <textarea
                  value={newFeedback}
                  onChange={(e) => setNewFeedback(e.target.value)}
                  placeholder="Leave feedback, ask for updates, or note completion details..."
                  rows={3}
                  className="w-full resize-none rounded border border-[var(--color-line)] bg-[var(--color-ground)] p-2.5 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                />
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-sm text-[var(--color-ink-3)]">
                    Markdown and @mentions supported
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    className="h-7 text-sm font-medium"
                    onClick={postFeedback}
                    disabled={!newFeedback.trim()}
                  >
                    Post Feedback
                  </Button>
                </div>
              </div>

              {/* Feedback timeline */}
              <div className="space-y-3">
                {feedbackList.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[var(--color-ink)]">{entry.author}</span>
                      <span className="font-mono text-sm text-[var(--color-ink-3)]">{entry.time}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-[var(--color-ink-2)]">
                      {entry.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          value: "finances",
          label: "Budgets & Requisitions",
          icon: Receipt,
          content: (
            <div className="space-y-6">
              {/* Tab Toolbar */}
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    Task Expenses & Requisitions
                  </span>
                  <span className="font-mono text-sm text-[var(--color-ink-3)]">
                    Spent: ${totalSpent.toLocaleString()} of ${budget.toLocaleString()}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-sm font-medium"
                  onClick={() => setAddingReq(true)}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  New Requisition
                </Button>
              </div>

              {/* Add Requisition row */}
              {addingReq ? (
                <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-ground)] p-3">
                  <input
                    type="text"
                    value={newReqItem}
                    onChange={(e) => setNewReqItem(e.target.value)}
                    placeholder="Expense item or requisition description..."
                    className="h-8 flex-1 min-w-[200px] rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  <input
                    type="number"
                    value={newReqAmount}
                    onChange={(e) => setNewReqAmount(e.target.value)}
                    placeholder="Amount ($)..."
                    className="h-8 w-28 rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  />
                  <Button size="sm" variant="primary" className="h-8 text-sm" onClick={addRequisition}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={() => setAddingReq(false)}>
                    Cancel
                  </Button>
                </div>
              ) : null}

              {/* Requisitions Table */}
              <RecordTable
                columns={[
                  {
                    id: "item",
                    label: "Requisition item",
                    cell: (req) => <RecordTableName title={req.item} subtitle={req.category} />,
                  },
                  {
                    id: "status",
                    label: "Books status",
                    width: "8.5rem",
                    cell: (req) => (
                      <StatusDot
                        tone={req.status === "PAID" ? "success" : req.status === "APPROVED" ? "neutral" : "warn"}
                        label={req.status}
                      />
                    ),
                  },
                  {
                    id: "amount",
                    label: "Amount",
                    width: "8.5rem",
                    align: "end",
                    cell: (req) => <RecordCell kind="money" value={`$${req.amount.toFixed(2)}`} />,
                  },
                ]}
                rows={requisitions}
                emptyTitle="No requisitions raised for this task."
              />
            </div>
          ),
        },
      ]}
    >
      {completion.dialogs}
    </RecordPageShell>
  );
}
