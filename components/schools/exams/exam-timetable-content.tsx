"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import {
  LoadError,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { ExamSeriesTabs } from "@/components/schools/exams/exam-series-tabs";
import { AddPaperDialog } from "@/components/schools/exams/add-paper-dialog";
import { MovePaperDialog } from "@/components/schools/exams/move-paper-dialog";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchTimetable,
  removeTimetablePaper,
  type TimetablePaper,
} from "@/lib/schools/exams-v2";
import { formatSchoolDayTime } from "@/lib/schools/format";

/**
 * The exam timetable: which papers this series sits, and when.
 *
 * ## Why this screen exists
 *
 * Seating was a finished interface onto three empty tables. `SchoolExamPaper`
 * and `SchoolExamSession` were read by the seating plan and written by nothing
 * in the product, so every school opened Seating to "this series has no
 * sittings yet" and there was nowhere in the product to add one. This is the
 * missing half.
 *
 * ## It is transcription, not planning
 *
 * A school does not decide when ZIMSEC papers sit. The board publishes its
 * timetable months ahead and the office copies down the rows for the subjects
 * it has entered, which is why the form asks for four things — subject, paper
 * number, date and time, length — and derives the rest. `4008/1` is offered
 * rather than imposed, because the code is what an invigilator reads off the
 * question paper to check they have the right pile and boards do not all spell
 * it the same way.
 *
 * One table, no band. The row count is on the control row, where it answers
 * the filters rather than standing as state above them.
 */
export function ExamTimetableContent({ seriesId }: { seriesId: string }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [moving, setMoving] = useState<TimetablePaper | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const timetableQuery = useQuery({
    queryKey: ["schools", "exams", "timetable", seriesId],
    queryFn: () => fetchTimetable(seriesId),
  });

  const remove = useMutation({
    mutationFn: (paperId: string) => removeTimetablePaper(seriesId, paperId),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({
        queryKey: ["schools", "exams", "timetable", seriesId],
      });
      // Seating reads the sessions this screen writes, so it is stale the
      // moment a paper comes off.
      void queryClient.invalidateQueries({ queryKey: ["schools", "exams", "seating", seriesId] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const papers = useMemo(() => timetableQuery.data?.papers ?? [], [timetableQuery.data]);
  const dated = papers.filter((paper) => paper.sitsAt !== null).length;

  return (
    <SchoolsPage>
      <PageChrome
        title="Exam timetable"
        backHref={`/schools/exams/${seriesId}/candidates`}
        backLabel="Series"
      >
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          Add a paper
        </Button>
      </PageChrome>

      <ExamSeriesTabs seriesId={seriesId} />

      {actionError ? <SaveError what="The paper" error={actionError} /> : null}

      {timetableQuery.error ? (
        <LoadError
          what="the timetable"
          error={timetableQuery.error}
          onRetry={() => void timetableQuery.refetch()}
        />
      ) : timetableQuery.isPending ? (
        <TableRowsSkeleton
          rows={8}
          headers={["Subject", "Paper", "Sits", "Length", "Seated", ""]}
          columns={[{}, { width: 90 }, { width: 160 }, { width: 90, align: "right" }, { width: 80, align: "right" }, { width: 44 }]}
        />
      ) : papers.length === 0 ? (
        <NothingYet
          title="No papers on this timetable yet"
          body="Copy the board's timetable down — a subject, its paper number, and when it sits. Seating and the invigilation list hang off these."
          action={
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              Add a paper
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 py-1.5 text-xs text-[color:var(--text-muted)]">
            <span>
              {papers.length} paper{papers.length === 1 ? "" : "s"}
              {dated < papers.length ? ` · ${papers.length - dated} with no date yet` : ""}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)] text-left text-xs text-[color:var(--text-muted)]">
                <th className="py-1.5 font-normal">Subject</th>
                <th className="w-[100px] py-1.5 font-normal">Paper</th>
                <th className="w-[180px] py-1.5 font-normal">Sits</th>
                <th className="w-[90px] py-1.5 text-right font-normal">Length</th>
                <th className="w-[90px] py-1.5 text-right font-normal">Seated</th>
                <th className="w-[44px] py-1.5" />
              </tr>
            </thead>
            <tbody>
              {papers.map((paper) => (
                <PaperRow
                  key={paper.id}
                  paper={paper}
                  onMove={() => setMoving(paper)}
                  onRemove={() => remove.mutate(paper.id)}
                  removing={remove.isPending}
                />
              ))}
            </tbody>
          </table>
        </>
      )}

      <MovePaperDialog
        // Keyed on the paper, so opening a second one starts from ITS date
        // rather than the one before it.
        key={moving?.id ?? "closed"}
        seriesId={seriesId}
        paper={moving}
        onOpenChange={(open) => setMoving(open ? moving : null)}
        onMoved={() => {
          void queryClient.invalidateQueries({
            queryKey: ["schools", "exams", "timetable", seriesId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["schools", "exams", "seating", seriesId],
          });
        }}
      />

      <AddPaperDialog
        // A fresh dialog every time it opens. The reader is copying twenty
        // rows off the board's timetable in one sitting, so a dialog that kept
        // its last answers would submit a subject they did not choose on the
        // second open. Remounting resets the fields without a cascading
        // render, and covers a close by Escape or by clicking away.
        key={addOpen ? "open" : "closed"}
        seriesId={seriesId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          void queryClient.invalidateQueries({
            queryKey: ["schools", "exams", "timetable", seriesId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["schools", "exams", "seating", seriesId],
          });
        }}
      />
    </SchoolsPage>
  );
}

function PaperRow({
  paper,
  onMove,
  onRemove,
  removing,
}: {
  paper: TimetablePaper;
  onMove: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const seated = paper.session?.seated ?? 0;
  return (
    <tr className="border-b border-[color:var(--border-subtle)]">
      <td className="py-2">
        <span className="text-[color:var(--text-strong)]">{paper.subject.name}</span>{" "}
        <span className="font-mono text-xs text-[color:var(--text-muted)]">
          {paper.subject.code}
        </span>
      </td>
      <td className="py-2 font-mono text-xs">{paper.code}</td>
      <td className="py-2 font-mono text-xs">
        {paper.sitsAt ? formatSchoolDayTime(paper.sitsAt) : "Not dated"}
      </td>
      <td className="py-2 text-right font-mono text-xs">
        {paper.durationMinutes ? formatLength(paper.durationMinutes) : "—"}
      </td>
      <td className="py-2 text-right font-mono text-xs">{seated || "—"}</td>
      <td className="py-2">
        <RecordActions
          layout="menu"
          label={`Row actions for ${paper.subject.name} ${paper.code}`}
          resource="schools.exams"
          verbs={[
            {
              // Boards reschedule, and a seated paper cannot be taken off — so
              // without this a paper that moved was uncorrectable and the hall
              // would have been laid out for an abandoned morning.
              label: "Move it",
              action: "enter",
              onSelect: onMove,
            },
            {
              label: "Take off the timetable",
              action: "enter",
              onSelect: onRemove,
              tone: "danger",
              loading: removing,
              // A seating plan is printed, pinned up and handed to
              // invigilators. Deleting the sitting under it would leave a hall
              // holding desk cards for a paper the system says is not
              // happening, so the seating comes off first, deliberately.
              unavailable:
                seated > 0
                  ? `${seated} candidate${seated === 1 ? " is" : "s are"} seated for this paper. Clear the seating first.`
                  : undefined,
              confirm: {
                title: `Take ${paper.code} off the timetable?`,
                description:
                  "The paper and its sitting both go. Anything already entered for the subject stays — this is the date, not the entry.",
                confirmLabel: "Take it off",
              },
            },
          ]}
        />
      </td>
    </tr>
  );
}

/** `2h 30` — the way a timetable writes a paper's length. */
function formatLength(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${String(rest).padStart(2, "0")}`;
}
