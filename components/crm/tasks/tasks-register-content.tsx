"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Button } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { ListSearch } from "@/components/crm/records/list-search";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchCrmTasks } from "@/lib/crm/crm-v2";
import { bucketByDueDate } from "@/components/records/record-list-groups";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";
import { ci_users, ci_user, ci_user_plus, ci_download } from "@/components/books/icons/glyphs";
import { downloadCsv } from "@/components/books/bk-list";
import { CRM_TASK_PRIORITY_LABELS, CRM_TASK_TYPE_LABELS } from "@/lib/crm/tasks";

import { TaskFormSheet } from "./task-form-sheet";
import { TaskList } from "./task-list";
import { CrmFinding } from "@/components/crm/crm-finding";

const PAGE_LIMIT = 200;

type Owner = { id: string; name: string | null };

export function TasksRegisterContent() {
  const { data: session } = useSession();
  const [scope, setScope] = useState<"ALL" | "MINE" | "UNASSIGNED">("ALL");
  const [owner, setOwner] = useState<string>("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: Owner[] }>("/api/v2/crm/team"),
    staleTime: 5 * 60 * 1000,
  });

  const tasksQuery = useQuery({
    queryKey: ["crm-tasks", "register", scope, owner],
    queryFn: () =>
      fetchCrmTasks({
        queue: scope === "MINE" ? "MINE" : scope === "UNASSIGNED" ? "UNASSIGNED" : "ALL",
        assignedToId: scope === "ALL" && owner ? owner : undefined,
        limit: PAGE_LIMIT,
      }),
  });

  const tasks = useMemo(() => {
    const raw = tasksQuery.data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((task) =>
      `${task.title} ${task.client?.name ?? ""} ${task.deal?.title ?? ""} ${task.lead?.title ?? ""} ${task.assignedTo?.name ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [tasksQuery.data, search]);

  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);
  const buckets = useMemo(() => bucketByDueDate(tasks, (task) => task.dueAt), [tasks]);
  const overdueCount = buckets.find((b) => b.id === "overdue")?.items.length ?? 0;

  const handleExportCsv = () => {
    const head = ["Title", "Type", "Priority", "Status", "Due Date", "Customer / Deal", "Assignee"];
    const data = tasks.map((t) => [
      t.title,
      CRM_TASK_TYPE_LABELS[t.type] ?? t.type,
      CRM_TASK_PRIORITY_LABELS[t.priority] ?? t.priority,
      t.status,
      t.dueAt ? new Date(t.dueAt).toISOString() : "",
      t.client?.name ?? t.deal?.title ?? t.lead?.title ?? "",
      t.assignedTo?.name ?? "Unassigned",
    ]);
    downloadCsv("tasks.csv", head, data);
  };

  return (
    <div className="crm-bk-worksheet">
      <PageChrome
        title="Tasks"
        primary={{
          label: "New task",
          icon: "plus",
          shortcut: "N",
          onClick: () => setCreating(true),
        }}
      />

      {overdueCount > 0 ? (
        <CrmFinding
          label="Overdue"
          tone="danger"
          fact={`${overdueCount} open task${overdueCount === 1 ? " is" : "s are"} past due`}
          rest="— follow up or reschedule so nothing slips through the cracks."
        />
      ) : null}

      <div className="crm-bk-tabs-bar" role="tablist" aria-label="Task scope">
        <div className="crm-bk-tabs">
          {[
            { value: "ALL", label: "Everyone", glyph: ci_users },
            { value: "MINE", label: "Mine", glyph: ci_user },
            { value: "UNASSIGNED", label: "Unassigned", glyph: ci_user_plus },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={scope === item.value}
              data-active={scope === item.value || undefined}
              onClick={() => setScope(item.value as typeof scope)}
              className="crm-bk-tab"
            >
              <CiGlyphIcon glyph={item.glyph} size={16} className="shrink-0" />
              <span>{item.label}</span>
              {scope === item.value ? <span className="n">{tasks.length}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="crm-bk-tools">
        <ListSearch
          value={search}
          onChange={setSearch}
          placeholder="Search tasks by title, customer, deal or assignee"
          narrow
        />

        {scope === "ALL" ? (
          <select
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            aria-label="Filter by owner"
            className="h-7 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          >
            <option value="">Any owner</option>
            {owners.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name ?? "Unnamed"}
              </option>
            ))}
          </select>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
            {tasks.length} open
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

      {tasksQuery.error ? (
        <div className="px-5 py-3">
          <Alert tone="danger" title="Unable to load tasks">
            {getApiErrorMessage(tasksQuery.error)}
          </Alert>
        </div>
      ) : null}

      <div>
        {buckets
          .filter((bucket) => bucket.items.length > 0 || bucket.id === "today")
          .map((bucket) => (
            <section key={bucket.id} aria-labelledby={`tasks-${bucket.id}`}>
              <h3
                id={`tasks-${bucket.id}`}
                className="sticky top-14 z-10 flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-ground)] px-5 py-1.5 text-sm font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]"
              >
                <span
                  className={
                    bucket.id === "overdue" ? "text-[var(--color-bad)]" : "text-[var(--color-ink-2)]"
                  }
                >
                  {bucket.label}
                </span>
                <span className="rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-sm font-normal normal-case tracking-normal tabular-nums text-[var(--color-ink-3)]">
                  {bucket.items.length}
                </span>
              </h3>
              <TaskList
                tasks={bucket.items}
                isLoading={tasksQuery.isLoading}
                emptyMessage="Nothing due today."
                currentUserId={session?.user?.id}
              />
            </section>
          ))}
      </div>

      <TaskFormSheet open={creating} onOpenChange={setCreating} />
    </div>
  );
}
