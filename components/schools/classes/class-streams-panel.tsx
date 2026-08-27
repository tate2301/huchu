"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@corelithzw/react";

import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { NothingYet } from "@/components/schools/common/states";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { StreamFormDialog, type StreamFormValues } from "./stream-form-dialog";

/**
 * The streams inside one class, with the verbs to change them.
 *
 * The class record page could list streams and do nothing to them, and no
 * screen anywhere could create one — while every roll, mark sheet and publish
 * window in the module narrows by a stream. This is where a class is split.
 */

export type ClassStream = {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
};

export function ClassStreamsPanel({
  classId,
  className,
  classCode,
  streams,
}: {
  classId: string;
  className: string;
  classCode: string;
  streams: ClassStream[];
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassStream | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "class", classId] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "classes"] });
  }

  const save = useMutation({
    mutationFn: (values: StreamFormValues) => {
      const capacity = values.capacity ? Number(values.capacity) : null;
      return editing
        ? fetchJson(`/api/v2/schools/streams/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              code: values.code.trim(),
              name: values.name.trim(),
              capacity,
            }),
          })
        : fetchJson("/api/v2/schools/streams", {
            method: "POST",
            body: JSON.stringify({
              classId,
              code: values.code.trim(),
              name: values.name.trim(),
              capacity,
            }),
          });
    },
    onSuccess: () => {
      setActionError(null);
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/streams/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  return (
    <div className="space-y-3">
      {actionError ? (
        <Alert
          tone="danger"
          title="That change was not applied"
          onDismiss={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          {streams.length === 0
            ? "This class is not streamed."
            : `${streams.length} stream${streams.length === 1 ? "" : "s"} in ${className}.`}
        </p>
        <CreateButton
          resource="schools.academics"
          label="Add a stream"
          onSelect={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        />
      </div>

      {streams.length === 0 ? (
        <NothingYet
          title="This class is not streamed"
          body="A stream is the set a class is split into — Alpha, Beta, Blue. Registers, mark sheets and result publishing all narrow by one."
        />
      ) : (
        <ul className="divide-y divide-[color:var(--border-subtle)]">
          {streams.map((stream) => (
            <li
              key={stream.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-[color:var(--text-strong)]">
                  {stream.name}
                </p>
                <p className="text-sm text-[color:var(--text-muted)]">
                  <span className="font-[family-name:var(--font-mono)]">
                    {stream.code}
                  </span>
                  {stream.capacity == null ? "" : ` · ${stream.capacity} places`}
                </p>
              </div>
              <RecordActions
                resource="schools.academics"
                verbs={[
                  {
                    label: "Edit",
                    action: "edit",
                    onSelect: () => {
                      setEditing(stream);
                      setDialogOpen(true);
                    },
                  },
                  {
                    label: "Delete",
                    action: "archive",
                    tone: "danger",
                    loading: remove.isPending,
                    confirm: {
                      title: `Delete ${stream.name}?`,
                      description:
                        "The stream disappears from every register and mark sheet filter. It is refused while any pupil is still in it.",
                      confirmLabel: "Delete the stream",
                    },
                    onSelect: () => remove.mutate(stream.id),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <StreamFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            save.reset();
          }
        }}
        classes={[{ id: classId, code: classCode, name: className }]}
        defaultClassId={classId}
        initial={
          editing
            ? {
                classId,
                code: editing.code,
                name: editing.name,
                capacity: editing.capacity == null ? "" : String(editing.capacity),
              }
            : undefined
        }
        isSubmitting={save.isPending}
        error={save.error ? getApiErrorMessage(save.error) : null}
        onSubmit={(values) => save.mutate(values)}
      />
    </div>
  );
}
