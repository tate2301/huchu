"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Badge, Button } from "@corelithzw/react";
import { ClientDate } from "@/components/ui/client-date";
import { useToast } from "@/components/ui/use-toast";
import { PageChrome } from "@/components/layout/page-chrome";
import { ListSearch } from "@/components/crm/records/list-search";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchCrmTasks, type CrmTaskRecord } from "@/lib/crm/crm-v2";
import {
  TASK_QUEUE_LABELS,
  type TaskQueue,
  isTaskOverdue,
  CRM_TASK_TYPE_LABELS,
  CRM_TASK_PRIORITY_LABELS,
} from "@/lib/crm/tasks";
import {
  RecordTable,
  type RecordTableColumn,
  RecordTableName,
  RecordCell,
} from "@/components/records/record-table";
import { StatusDot } from "@/components/management/ui";
import { formatDate } from "@/components/crm/money/money";
import { TASK_PRIORITY_TONE } from "@/lib/crm/tones";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";
import {
  ci_apps,
  ci_calendar_check,
  ci_alert,
  ci_calendar_clock,
  ci_user,
  ci_user_plus,
  ci_users,
  ci_check_circle,
  ci_download,
} from "@/components/books/icons/glyphs";
import type { CiGlyph } from "@/components/books/icons/types";
import { downloadCsv } from "@/components/books/bk-list";
import { useTaskCompletion } from "./tasks/use-task-completion";

import { TaskFormSheet } from "./tasks/task-form-sheet";
import { CrmFinding } from "@/components/crm/crm-finding";

type LegacyFollowUp = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  notes: string | null;
  lead: { id: string; leadNo: string; title: string | null } | null;
  client: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
};

const QUEUES: TaskQueue[] = [
  "TODAY",
  "OVERDUE",
  "UPCOMING",
  "MINE",
  "UNASSIGNED",
  "TEAM",
  "COMPLETED",
];

const QUEUE_GLYPHS: Record<TaskQueue, CiGlyph> = {
  ALL: ci_apps,
  TODAY: ci_calendar_check,
  OVERDUE: ci_alert,
  UPCOMING: ci_calendar_clock,
  MINE: ci_user,
  UNASSIGNED: ci_user_plus,
  TEAM: ci_users,
  COMPLETED: ci_check_circle,
};

const EMPTY_MESSAGES: Partial<Record<TaskQueue, string>> = {
  TODAY: "Nothing due today.",
  OVERDUE: "Nothing overdue — the queue is clean.",
  UPCOMING: "Nothing booked in yet.",
  MINE: "You have no open follow-ups.",
  UNASSIGNED: "Every follow-up has an owner.",
  TEAM: "No open follow-ups across the team.",
  COMPLETED: "Nothing completed yet.",
};

const HEADLINE_QUEUES: TaskQueue[] = ["OVERDUE", "TODAY", "UPCOMING"];

function followUpSubject(task: CrmTaskRecord): { href: string; label: string } | null {
  if (task.deal) {
    return { href: `/crm/deals/${task.deal.id}`, label: task.deal.title };
  }
  if (task.lead) {
    return { href: `/crm/leads/${task.lead.id}`, label: task.lead.title || task.lead.leadNo };
  }
  if (task.client) {
    return { href: `/crm/companies/${task.client.id}`, label: task.client.name };
  }
  if (task.person) {
    return { href: `/crm/people/${task.person.id}`, label: task.person.fullName };
  }
  return null;
}

export function CrmFollowUpsContent() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const completion = useTaskCompletion({ currentUserId: session?.user?.id });
  const [queue, setQueue] = useState<TaskQueue>("TODAY");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "due",
    dir: "asc",
  });

  const tasks = useQuery({
    queryKey: ["crm-tasks", queue],
    queryFn: () => fetchCrmTasks({ queue, limit: 200 }),
  });

  const headline = useQueries({
    queries: HEADLINE_QUEUES.map((value) => ({
      queryKey: ["crm-tasks", "count", value],
      queryFn: () => fetchCrmTasks({ queue: value, limit: 1 }),
    })),
  });

  const legacy = useQuery({
    queryKey: ["crm-followups-legacy"],
    queryFn: () => fetchJson<{ data: LegacyFollowUp[] }>("/api/v2/crm/follow-ups?status=PENDING"),
  });

  const legacyRows = useMemo(() => legacy.data?.data ?? [], [legacy.data]);
  const taskRows = useMemo(() => {
    const raw = tasks.data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((task) =>
      `${task.title} ${task.client?.name ?? ""} ${task.deal?.title ?? ""} ${task.lead?.title ?? ""} ${task.assignedTo?.name ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [tasks.data, search]);

  const sortedTasks = useMemo(() => {
    const list = [...taskRows];
    list.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "task") {
        cmp = a.title.localeCompare(b.title);
      } else if (sort.key === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sort.key === "subject") {
        const aSub = followUpSubject(a)?.label ?? "";
        const bSub = followUpSubject(b)?.label ?? "";
        cmp = aSub.localeCompare(bSub);
      } else if (sort.key === "due") {
        cmp = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      } else if (sort.key === "priority") {
        cmp = a.priority.localeCompare(b.priority);
      } else if (sort.key === "assignee") {
        const aName = a.assignedTo?.name ?? "";
        const bName = b.assignedTo?.name ?? "";
        cmp = aName.localeCompare(bName);
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [taskRows, sort]);

  const overdueCount = headline[0]?.data?.pagination?.total ?? 0;
  const todayCount = headline[1]?.data?.pagination?.total ?? 0;
  const upcomingCount = headline[2]?.data?.pagination?.total ?? 0;

  const completeLegacy = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/crm/follow-ups/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED" }),
      }),
    onSuccess: () => {
      toast({ title: "Follow-up closed" });
      queryClient.invalidateQueries({ queryKey: ["crm-followups-legacy"] });
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const queueCount = (value: TaskQueue): number | undefined => {
    if (value === "OVERDUE") return overdueCount;
    if (value === "TODAY") return todayCount;
    if (value === "UPCOMING") return upcomingCount;
    if (value === queue) return taskRows.length;
    return undefined;
  };

  const handleExportCsv = () => {
    const head = [
      "Title",
      "Queue",
      "Status",
      "Customer / Subject",
      "Due Date",
      "Priority",
      "Assignee",
      "Notes",
    ];
    const data = sortedTasks.map((t) => {
      const subj = followUpSubject(t);
      return [
        t.title,
        TASK_QUEUE_LABELS[queue],
        t.status,
        subj?.label ?? "Unattached",
        t.dueAt ? new Date(t.dueAt).toISOString() : "",
        CRM_TASK_PRIORITY_LABELS[t.priority] ?? t.priority,
        t.assignedTo?.name ?? "Unassigned",
        t.description ?? "",
      ];
    });
    downloadCsv("follow-ups.csv", head, data);
  };

  const columns = useMemo<RecordTableColumn<CrmTaskRecord>[]>(
    () => [
      {
        id: "task",
        label: "Follow-up",
        sortKey: "task",
        cell: (t) => (
          <RecordTableName
            title={t.title}
            subtitle={t.description ?? (t.type ? CRM_TASK_TYPE_LABELS[t.type] : undefined)}
          />
        ),
      },
      {
        id: "status",
        label: "Status",
        width: "9rem",
        sortKey: "status",
        cell: (t) => {
          const overdue = isTaskOverdue(t);
          const isDone = t.status === "COMPLETED";
          return (
            <StatusDot
              tone={isDone ? "success" : overdue ? "danger" : "neutral"}
              label={isDone ? "Completed" : overdue ? "Overdue" : "Pending"}
            />
          );
        },
      },
      {
        id: "subject",
        label: "Customer / Subject",
        width: "14rem",
        sortKey: "subject",
        cell: (t) => {
          const subj = followUpSubject(t);
          return (
            <RecordCell
              kind="relation"
              value={subj?.label ?? "Unattached"}
              href={subj?.href ?? null}
            />
          );
        },
      },
      {
        id: "due",
        label: "Due Date",
        width: "13rem",
        sortKey: "due",
        cell: (t) => {
          const overdue = isTaskOverdue(t);
          const dateStr = formatDate(t.dueAt);
          const timeStr = t.hasDueTime
            ? `, ${new Date(t.dueAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
            : "";
          return (
            <RecordCell
              kind="date"
              value={`${dateStr}${timeStr}`}
              className={overdue ? "font-medium text-[var(--color-bad)]" : undefined}
            />
          );
        },
      },
      {
        id: "priority",
        label: "Priority",
        width: "8rem",
        sortKey: "priority",
        cell: (t) => (
          <Badge tone={TASK_PRIORITY_TONE[t.priority] ?? "neutral"} size="sm">
            {CRM_TASK_PRIORITY_LABELS[t.priority] ?? t.priority}
          </Badge>
        ),
      },
      {
        id: "assignee",
        label: "Assignee",
        width: "10rem",
        sortKey: "assignee",
        cell: (t) => (
          <RecordCell
            kind="text"
            value={t.assignedTo?.name ?? "Unassigned"}
            className={!t.assignedTo ? "font-medium text-[var(--color-warn)]" : undefined}
          />
        ),
      },
      {
        id: "action",
        label: "",
        width: "7rem",
        align: "end",
        cell: (t) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              completion.toggle(t);
            }}
          >
            {t.status === "COMPLETED" ? "Reopen" : "Done"}
          </Button>
        ),
      },
    ],
    [completion],
  );

  return (
    <div className="crm-bk-worksheet">
      <PageChrome
        title="Follow-ups"
        primary={{
          label: "New follow-up",
          icon: "plus",
          shortcut: "N",
          onClick: () => setCreating(true),
        }}
      />

      {overdueCount > 0 ? (
        <CrmFinding
          label="Overdue"
          tone="danger"
          fact={`${overdueCount} customer follow-up${overdueCount === 1 ? " is" : "s are"} overdue`}
          rest="— call, WhatsApp, or email the client today and record the outcome."
          action={
            queue !== "OVERDUE"
              ? {
                  label: "Open overdue queue →",
                  onClick: () => setQueue("OVERDUE"),
                }
              : undefined
          }
        />
      ) : null}

      <div className="crm-bk-tabs-bar" role="tablist" aria-label="Follow-up queue">
        <div className="crm-bk-tabs">
          {QUEUES.map((value) => {
            const cnt = queueCount(value);
            const glyph = QUEUE_GLYPHS[value];
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={queue === value}
                data-active={queue === value || undefined}
                onClick={() => setQueue(value)}
                className="crm-bk-tab"
              >
                <CiGlyphIcon glyph={glyph} size={16} className="shrink-0" />
                <span>{TASK_QUEUE_LABELS[value]}</span>
                {cnt !== undefined ? <span className="n">{cnt}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="crm-bk-tools">
        <ListSearch
          value={search}
          onChange={setSearch}
          placeholder="Search follow-ups by title, client, deal or owner"
          narrow
        />
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
            {sortedTasks.length} in {TASK_QUEUE_LABELS[queue].toLowerCase()}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="h-7 text-sm font-medium"
          >
            <CiGlyphIcon glyph={ci_download} size={14} className="mr-1.5 shrink-0" />
            Export
          </Button>
        </div>
      </div>

      {tasks.error ? (
        <div className="px-5 py-3">
          <Alert tone="danger" title="Couldn't load follow-ups">
            {getApiErrorMessage(tasks.error)}
          </Alert>
        </div>
      ) : null}

      <RecordTable
        columns={columns}
        rows={sortedTasks}
        sort={{
          key: sort.key,
          dir: sort.dir,
          onSort: (key) =>
            setSort((prev) => ({
              key,
              dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
            })),
        }}
        rowHref={(t) => {
          const subj = followUpSubject(t);
          return subj?.href ?? `/crm/tasks/${t.id}`;
        }}
        isLoading={tasks.isLoading}
        emptyTitle={search ? "No follow-ups match that search" : (EMPTY_MESSAGES[queue] ?? "No follow-ups")}
        emptyAction={
          search ? undefined : (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              Add a follow-up
            </Button>
          )
        }
      />

      {legacyRows.length ? (
        <section>
          <h3 className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-ground)] px-5 py-1.5 text-sm font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
            <span>Lead reminders</span>
            <span className="rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-sm font-normal tabular-nums">
              {legacyRows.length}
            </span>
          </h3>
          <ul className="divide-y divide-[var(--color-line)]">
            {legacyRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--color-hover)]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                    <Link href={`/crm/tasks/follow-ups/${row.id}`} className="hover:underline">
                      {row.title}
                    </Link>
                    <Badge tone="neutral" size="sm">
                      Lead reminder
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-ink-2)]">
                    <span className="font-mono"><ClientDate value={row.dueAt} mode="datetime" /></span>
                    <span>{row.assignedTo?.name ?? "Unassigned"}</span>
                    {row.lead ? (
                      <Link href={`/crm/leads/${row.lead.id}`} className="hover:underline">
                        {row.lead.title ?? row.lead.leadNo}
                      </Link>
                    ) : null}
                    {row.client ? <span>{row.client.name}</span> : null}
                  </div>
                  {row.notes ? (
                    <p className="mt-1 text-sm text-[var(--color-ink-2)]">{row.notes}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={completeLegacy.isPending}
                  onClick={() => completeLegacy.mutate(row.id)}
                >
                  Done
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TaskFormSheet open={creating} onOpenChange={setCreating} currentUserId={session?.user?.id} />
      {completion.dialogs}
    </div>
  );
}
