"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { RecordSubject } from "@/lib/records/subject";

/**
 * Notes and files on a record, for any record type.
 *
 * These read and write through `/api/v2/records/**`, which S-4.2 put in front of
 * `CrmComment` and `CrmRecordFile` once their subject stopped being a nullable
 * foreign key per kind. The CRM module has richer versions of both — a rich-text
 * composer, mentions, pinning, resolution, an upload flow — and those are not
 * duplicated here. What is here is the part every record type needs on day one:
 * read what has been said, say something, see what is attached.
 *
 * Kept in `components/records/` rather than under `schools/` because nothing in
 * it is about a school. The other five school record types and the CRM pages can
 * use it as-is.
 */

export type SubjectNote = {
  id: string;
  body: string;
  createdAt: string;
  isPinned: boolean;
  createdBy: { id: string; name: string | null; email: string } | null;
  replies?: { id: string }[];
};

export type SubjectFile = {
  id: string;
  name: string;
  url: string;
  size: number | null;
  contentType: string | null;
  note: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string | null } | null;
};

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function who(person: { name: string | null; email?: string } | null): string {
  return person?.name ?? person?.email ?? "Somebody";
}

export function SubjectNotes({
  subject,
  notes,
  isPending,
}: {
  subject: RecordSubject;
  notes: SubjectNote[];
  isPending: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: (body: string) =>
      fetchJson("/api/v2/records/comments", {
        method: "POST",
        body: JSON.stringify({
          subjectType: subject.type,
          subjectId: subject.id,
          body,
        }),
      }),
    onSuccess: () => {
      setDraft("");
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: ["records", "comments", subject.type, subject.id],
      });
    },
    onError: (cause) => setError(getApiErrorMessage(cause, "That note was not saved")),
  });

  if (isPending) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a note about this record…"
          rows={3}
          aria-label="Add a note"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!draft.trim() || add.isPending}
            onClick={() => add.mutate(draft.trim())}
          >
            {add.isPending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>That did not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {notes.length === 0 ? (
        <Empty>
          <EmptyTitle>No notes yet</EmptyTitle>
          <EmptyDescription>
            Anything written here stays with the record, so the next person to open it sees
            what you saw.
          </EmptyDescription>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-[var(--card-radius)] border border-[var(--border-subtle)] p-3"
            >
              <p className="whitespace-pre-wrap text-sm text-[var(--text-strong)]">{note.body}</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {who(note.createdBy)} · {when(note.createdAt)}
                {note.isPinned ? " · Pinned" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SubjectFiles({
  files,
  isPending,
}: {
  files: SubjectFile[];
  isPending: boolean;
}) {
  if (isPending) return <Skeleton className="h-32 w-full" />;

  if (files.length === 0) {
    return (
      <Empty>
        <EmptyTitle>Nothing attached</EmptyTitle>
        <EmptyDescription>
          A birth certificate, a transfer letter, a medical note — anything that arrived on
          paper and belongs with this record.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.id}>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] p-3 hover:bg-[var(--surface-hover)]"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-[var(--text-strong)]">
                {file.name}
              </span>
              <span className="block truncate text-sm text-[var(--text-muted)]">
                {who(file.uploadedBy)} · {when(file.createdAt)}
                {file.note ? ` · ${file.note}` : ""}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
