"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { StreamFormDialog, type StreamFormValues } from "@/components/schools/classes/stream-form-dialog";

/**
 * The streams inside one class, with the verbs to change them.
 *
 * The class record page could list streams and do nothing to them, and no
 * screen anywhere could create one — while every roll, mark sheet and publish
 * window in the module narrows by a stream. This is where a class is split.
 *
 * The panel reads its own rows rather than rendering the copy the class record
 * handed it. That copy is a snapshot taken when the record loaded, and this
 * panel is the one thing in the module that adds and removes streams — so the
 * list it draws has to be the list it just changed, not the one from before.
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
}: {
  classId: string;
  className: string;
  classCode: string;
  /**
   * The record page's snapshot. Kept on the signature because the caller has
   * it to hand, and deliberately not read — see the note above.
   */
  streams: ClassStream[];
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassStream | null>(null);
  const [search, setSearch] = useState("");

  const streamsQuery = useQuery({
    queryKey: ["schools", "streams", classId],
    queryFn: () =>
      fetchJson<{ data: ClassStream[] }>(
        `/api/v2/schools/streams?classId=${classId}&limit=100`,
      ),
  });

  const streams = useMemo(() => streamsQuery.data?.data ?? [], [streamsQuery.data]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return streams;
    return streams.filter((stream) =>
      `${stream.name} ${stream.code}`.toLowerCase().includes(needle),
    );
  }, [streams, search]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "streams", classId] });
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
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/streams/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3">
      {streamsQuery.error ? (
        <LoadError
          what="the streams in this class"
          error={streamsQuery.error}
          onRetry={() => void streamsQuery.refetch()}
        />
      ) : null}

      {/* A delete is refused while a pupil is still in the stream, and that
          refusal names the stream — so it reads as itself, not as the panel. */}
      {remove.error ? <SaveError what="The stream" error={remove.error} /> : null}

      {/* One row for the count, the search and the verb, the way every campus
          register states them — rather than a sentence over here and a search
          box over there. The sentence said "4 streams in Form 2", which is a
          third phrasing of a figure the module writes as "4 of 7" everywhere
          else, and it said "This class is not streamed" directly above an
          empty state that says the same thing in a heading.

          The search box still appears only once there is enough to hunt
          through: three streams do not need finding. */}
      <TableControls
        search={
          streams.length > 4 ? (
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Find a stream"
            />
          ) : undefined
        }
        count={streamsQuery.isPending ? null : `${visible.length} of ${streams.length}`}
        actions={
          <CreateButton
            resource="schools.academics"
            label="Add a stream"
            onSelect={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          />
        }
      />

      {streamsQuery.isPending ? (
        <TableRowsSkeleton
          headers={["Stream", "Places", ""]}
          columns={[{ twoLine: true }, { width: 90, align: "right" }, { width: 60 }]}
          rows={3}
        />
      ) : streams.length === 0 ? (
        <NothingYet
          title="This class is not streamed"
          body={
            `A stream is the set ${className} is split into. Most schools here ` +
            "name them after the class and a Greek letter — Form 2 Alpha, " +
            "Form 2 Beta, Form 2 Gamma, Form 2 Delta — but Blue, Nyathi House and " +
            "Sciences are all just as valid. Registers, mark sheets and result " +
            "publishing all narrow by one."
          }
        />
      ) : visible.length === 0 ? (
        <NothingMatched
          what="streams"
          filters={[search.trim()]}
          onClear={() => setSearch("")}
        />
      ) : (
        /* Separated by space, not by rules — the rows stop reading as a ruled
           ledger and there is one less line to cross per stream. */
        <ul className="space-y-1">
          {visible.map((stream, index) => (
            <li
              key={stream.id}
              // The same 40ms cascade the skeleton left on, so the real rows
              // arrive where the placeholder bars were rather than snapping in.
              className="campus-row-in flex min-h-11 flex-wrap items-center justify-between gap-3 py-2"
              style={{ animationDelay: `${index * 40}ms` }}
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
                layout="menu"
                label={`Row actions for ${stream.name}`}
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
                    loading: remove.isPending && remove.variables === stream.id,
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
