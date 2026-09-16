"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { ListRowsSkeleton, LoadError } from "@/components/records/states";
import { Button } from "@/components/ui/button";
import { openPastoralNote, PASTORAL_BAND_LABELS } from "@/lib/schools/conduct-v2";
import { formatSchoolDate } from "@/lib/schools/format";

/**
 * One note, opened.
 *
 * Opening is a **request**, not an expand: the endpoint behind it writes the
 * audit event that says who read this note about this child, and when. A
 * dialog that rendered a body the list already had in memory would leave that
 * event unwritten and the access model unauditable.
 *
 * A note this reader may not read answers exactly as one that does not exist.
 * The dialog shows the same sentence for both, because a message that
 * distinguished them would confirm a note's existence to somebody who cannot
 * read it.
 */
export function PastoralNoteDialog({
  noteId,
  onOpenChange,
}: {
  /** Null closes the dialog. */
  noteId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = noteId != null;

  const query = useQuery({
    queryKey: ["schools", "pastoral", "note", noteId],
    queryFn: () => openPastoralNote(noteId as string),
    enabled: open,
    // Never cached: a read is an event, and a cached body is a read that was
    // not recorded.
    gcTime: 0,
    staleTime: 0,
  });

  const note = query.data?.note;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={note ? `${note.student.firstName} ${note.student.lastName}` : "Pastoral note"}
      description="Opening this was recorded."
      size="md"
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      }
    >
      {query.isPending ? (
        <ListRowsSkeleton rows={4} label="Opening the note" />
      ) : query.error ? (
        <LoadError what="that note" error={query.error} />
      ) : note ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              {...(note.band === "SAFEGUARDING_NAMED_INDIVIDUALS"
                ? { accent: "violet" as const }
                : { tone: note.band === "HEAD_AND_PASTORAL_TEAM" ? ("brand" as const) : ("neutral" as const) })}
            >
              {PASTORAL_BAND_LABELS[note.band]}
            </Badge>
            <span className="text-xs text-[color:var(--text-muted)]">
              {note.authorName ?? "A member of staff"} · {formatSchoolDate(note.writtenAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{note.body}</p>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-[color:var(--text-muted)]">Review</dt>
              <dd>{note.reviewDueAt ? formatSchoolDate(note.reviewDueAt) : "None needed"}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--text-muted)]">Referred on</dt>
              <dd>{note.referredTo ?? "Nobody"}</dd>
            </div>
          </dl>
          {/* Said on the screen that holds the note rather than in a policy
              document nobody opens. */}
          <p className="text-xs text-[color:var(--text-muted)]">
            This note never reaches the parent portal, a report card, a leaving certificate or
            any export.
          </p>
        </div>
      ) : null}
    </RecordDialog>
  );
}
