"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { SplitView } from "@corelithzw/module-records/components/split-view";
import { fetchCrmTasks, type CrmTaskRecordRef } from "@/lib/crm/crm-v2";
import { Plus } from "@corelithzw/ui/lib/icons";

import { TaskDetail } from "./task-detail";
import { TaskFormSheet } from "./task-form-sheet";
import { TaskList } from "./task-list";
import { useTaskCompletion } from "./use-task-completion";

/**
 * The Tasks section on a record page.
 *
 * Same tasks as the queue page, filtered to this record — but arranged as a
 * split rather than a flat register, because the two pages are used for
 * different things. The queue is a worklist you go down. A record's tasks are a
 * set you move *between*: you open one to see what the outcome was, decide it
 * needs a new due date, and then look at the next one. Every one of those used
 * to cost a form sheet over the top of the list.
 *
 * The selected task is held here rather than in the URL. A section of a record
 * is already a URL-addressable place; a *row inside* one is transient state,
 * and putting it in the query string would mean the browser's back button walks
 * back through every task somebody glanced at before it leaves the record.
 */
export function RecordTasksTab({
  record,
  currentUserId,
}: {
  record: CrmTaskRecordRef;
  currentUserId?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const key = ["crm-tasks", "record", record];

  const { data, isLoading } = useQuery({
    queryKey: key,
    // A record's tab shows everything filed against it, done or not — who it
    // is assigned to is the tab's content, not its filter.
    queryFn: () => fetchCrmTasks({ ...record, queue: "ALL", limit: 100 }),
  });

  const tasks = useMemo(() => data?.data ?? [], [data]);
  // Looked up by id every render rather than stored: the list is refetched
  // after every edit, and a held copy of the task would show the old due date
  // in the panel that just changed it.
  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  // One instance, shared by the checkbox in the list and the checkbox in the
  // panel, so a typed task raises exactly one outcome dialog whichever one you
  // tick.
  const completion = useTaskCompletion({ currentUserId });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New task
        </Button>
      </div>

      <SplitView
        // No `detailTitle`: the panel opens with the task's name as an editable
        // heading, and the drilled-in header would have printed it again
        // directly above it.
        onClose={() => setSelectedId(null)}
        placeholder="Pick a task to see and change it here."
        list={
          <TaskList
            tasks={tasks}
            isLoading={isLoading}
            showRecord={false}
            grouped
            emptyMessage="No tasks on this record yet."
            currentUserId={currentUserId}
            onToggle={completion.toggle}
            selectedId={selectedId}
            onSelect={(task) => setSelectedId(task.id)}
          />
        }
        detail={
          selected ? (
            <TaskDetail
              task={selected}
              currentUserId={currentUserId}
              onToggle={completion.toggle}
              onDeleted={() => setSelectedId(null)}
            />
          ) : null
        }
      />

      {completion.dialogs}

      <TaskFormSheet
        open={creating}
        onOpenChange={setCreating}
        record={record}
        currentUserId={currentUserId}
      />
    </div>
  );
}
